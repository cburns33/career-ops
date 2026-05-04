#!/usr/bin/env node
/**
 * hiringcafe-scan.mjs -- Scan hiring.cafe using your saved search URLs
 *
 * Navigates to each saved search URL from portals.yml (hiringcafe.saved_searches).
 * All filters (location, department, role type, job title query, date range) are
 * already baked into the URL -- no form interaction needed.
 *
 * On the first page load, Playwright intercepts the underlying API call that
 * powers the results. Subsequent pages are fetched by replaying that API
 * request with an incremented offset -- no DOM pagination needed.
 *
 * Usage:
 *   node hiringcafe-scan.mjs             # dry run -- print matches, no writes
 *   node hiringcafe-scan.mjs --apply     # write to pipeline.md + scan-history.tsv
 *   node hiringcafe-scan.mjs --headless  # headless (requires prior session)
 *
 * First run: opens browser visibly so you can pass the Cloudflare challenge
 * and confirm you're logged in. The session is saved to data/hiringcafe-playwright-profile.
 */

import { firefox } from 'playwright';
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const ROOT        = dirname(fileURLToPath(import.meta.url));
const PROFILE_DIR = join(ROOT, 'data', 'hiringcafe-playwright-profile');
const PIPELINE    = join(ROOT, 'data', 'pipeline.md');
const HISTORY     = join(ROOT, 'data', 'scan-history.tsv');
const APPS        = join(ROOT, 'data', 'applications.md');
const PORTALS     = join(ROOT, 'portals.yml');

const APPLY    = process.argv.includes('--apply');
const HEADLESS = process.argv.includes('--headless');

const BASE_URL     = 'https://hiring.cafe';
const NAV_TIMEOUT  = 45_000;
const POLITE_MS    = 1_200;
const PAGE_SIZE    = 20;   // Hiring Cafe default page size
const MAX_EMPTY    = 3;    // stop after N consecutive empty API pages

// ── Config ────────────────────────────────────────────────────────────────────

function loadConfig() {
  if (!existsSync(PORTALS)) throw new Error('portals.yml not found');
  const cfg = yaml.load(readFileSync(PORTALS, 'utf-8'));

  const searches = cfg?.hiringcafe?.saved_searches || [];
  if (searches.length === 0) {
    throw new Error(
      'No saved searches found in portals.yml under hiringcafe.saved_searches.\n' +
      'Add at least one entry with a label and url.'
    );
  }

  const titleFilter = {
    positive: (cfg?.title_filter?.positive || []).map(k => k.toLowerCase()),
    negative: (cfg?.title_filter?.negative || []).map(k => k.toLowerCase()),
  };

  return { searches, titleFilter };
}

// ── Title filter ──────────────────────────────────────────────────────────────

function passesFilter(title, { positive, negative }) {
  if (!title) return false;
  const t = title.toLowerCase();
  const ok = positive.length === 0 || positive.some(k => t.includes(k));
  const bad = negative.some(k => t.includes(k));
  return ok && !bad;
}

// ── Deduplication ─────────────────────────────────────────────────────────────

function loadSeenUrls() {
  const seen = new Set();
  if (existsSync(HISTORY)) {
    for (const line of readFileSync(HISTORY, 'utf-8').split('\n').slice(1)) {
      const url = line.split('\t')[0];
      if (url) seen.add(url);
    }
  }
  if (existsSync(PIPELINE)) {
    for (const m of readFileSync(PIPELINE, 'utf-8').matchAll(/- \[[ x]\] (https?:\/\/\S+)/g)) {
      seen.add(m[1]);
    }
  }
  if (existsSync(APPS)) {
    for (const m of readFileSync(APPS, 'utf-8').matchAll(/https?:\/\/[^\s|)]+/g)) {
      seen.add(m[0]);
    }
  }
  return seen;
}

// ── Writers ───────────────────────────────────────────────────────────────────

function appendToPipeline(jobs) {
  if (!existsSync(PIPELINE)) {
    console.warn('pipeline.md not found -- skipping pipeline write');
    return;
  }
  let text = readFileSync(PIPELINE, 'utf-8');
  const marker = '## Pendientes';
  const idx = text.indexOf(marker);
  const lines = jobs.map(j => `- [ ] ${j.url} | ${j.company} | ${j.title}`).join('\n') + '\n';

  if (idx === -1) {
    text = `${marker}\n\n${lines}\n${text}`;
  } else {
    const after = idx + marker.length;
    const next = text.indexOf('\n## ', after);
    const at = next === -1 ? text.length : next;
    text = text.slice(0, at) + '\n' + lines + text.slice(at);
  }
  writeFileSync(PIPELINE, text, 'utf-8');
}

function appendToHistory(jobs, label, status) {
  const today = new Date().toISOString().slice(0, 10);
  if (!existsSync(HISTORY)) {
    writeFileSync(HISTORY, 'url\tfirst_seen\tportal\ttitle\tcompany\tstatus\n', 'utf-8');
  }
  const rows = jobs.map(j =>
    `${j.url}\t${today}\thiringcafe:${label}\t${j.title}\t${j.company}\t${status}`
  ).join('\n') + '\n';
  appendFileSync(HISTORY, rows, 'utf-8');
}

// ── Cloudflare detection ──────────────────────────────────────────────────────

async function isChallengePage(page) {
  const t = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
  return /security verification|just a moment|checking your browser|cloudflare/i.test(t);
}

// ── API interception ──────────────────────────────────────────────────────────
// Hiring Cafe fires a POST/GET to its job search API when the page loads.
// We capture the first matching response to learn the endpoint + request shape.

function makeInterceptor(page) {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  let captured = null;

  async function handler(response) {
    if (captured) return;
    const url = response.url();
    // Skip obvious static asset / analytics / image endpoints
    if (/\.(png|jpg|jpeg|svg|gif|css|js|woff|ico)(\?|$)/i.test(url)) return;
    if (/google-analytics|googletagmanager|sentry|cloudflare/i.test(url)) return;

    let body;
    try { body = await response.json(); } catch { return; }

    // Look for an array of jobs in any common shape
    const candidates = [body?.jobs, body?.results, body?.data, body?.postings,
                       body?.hits, body?.items, Array.isArray(body) ? body : null];
    const jobs = candidates.find(c => Array.isArray(c) && c.length > 0);
    if (!jobs) {
      // Verbose log for debugging — short keys only
      if (body && typeof body === 'object') {
        console.log(`    [debug] non-match: ${url.slice(0, 90)} keys=${Object.keys(body).slice(0,6).join(',')}`);
      }
      return;
    }

    // Sanity: at least one candidate looks like a job (has title/name field)
    const sample = jobs[0];
    if (!sample || typeof sample !== 'object') return;
    const looksLikeJob = sample.title || sample.jobTitle || sample.name ||
                        sample.job_title || sample.position;
    if (!looksLikeJob) {
      console.log(`    [debug] array but no title field at ${url.slice(0, 90)} sample-keys=${Object.keys(sample).slice(0,6).join(',')}`);
      return;
    }

    const req = response.request();
    captured = {
      url,
      method: req.method(),
      headers: req.headers(),
      postData: req.postData(),
      body,
    };
    resolve(captured);
  }

  page.on('response', handler);
  return {
    promise,
    captured: () => captured,
    stop: () => page.off('response', handler),
  };
}

// ── Normalise a job object from various API shapes ────────────────────────────

function normaliseJob(raw, companyFallback = '') {
  // Try common field names used by job board APIs
  const title   = raw.title || raw.jobTitle || raw.name || '';
  const company = raw.company?.name || raw.employer?.name || raw.companyName ||
                  raw.organization?.name || companyFallback;
  const location = raw.location || raw.locationText || raw.locationsText ||
                   raw.cities?.join(', ') || '';

  // URL: prefer absolute, fall back to relative
  let url = raw.url || raw.jobUrl || raw.applyUrl || raw.externalUrl ||
            raw.link || raw.applicationUrl || '';
  if (url && !url.startsWith('http')) url = BASE_URL + url;

  // ID-based URL construction (common pattern)
  if (!url && raw.id) url = `${BASE_URL}/job/${raw.id}`;
  if (!url && raw.jobId) url = `${BASE_URL}/job/${raw.jobId}`;

  return { title, company, location, url };
}

// ── Paginated API fetch (after intercept) ─────────────────────────────────────

async function fetchNextPage(intercepted, offset) {
  const { url, method, postData } = intercepted;

  // Build modified request: increment offset/page
  let body = null;
  if (postData) {
    try {
      const parsed = JSON.parse(postData);
      // Handle offset-based or page-based pagination
      if ('offset' in parsed) parsed.offset = offset;
      else if ('page' in parsed) parsed.page = Math.floor(offset / PAGE_SIZE) + 1;
      else if ('from' in parsed) parsed.from = offset;
      else if ('skip' in parsed) parsed.skip = offset;
      else parsed.offset = offset;
      body = JSON.stringify(parsed);
    } catch {
      // postData not JSON; fall back to appending ?offset=
    }
  }

  // Build URL with offset if no post body
  let fetchUrl = url;
  if (!body) {
    const u = new URL(url);
    if (u.searchParams.has('offset')) u.searchParams.set('offset', offset);
    else if (u.searchParams.has('page')) u.searchParams.set('page', Math.floor(offset / PAGE_SIZE) + 1);
    else u.searchParams.set('offset', offset);
    fetchUrl = u.toString();
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(fetchUrl, {
      method: body ? method : 'GET',
      headers: { 'Content-Type': 'application/json', ...intercepted.headers },
      ...(body ? { body } : {}),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function extractJobs(body) {
  if (Array.isArray(body)) return body;
  return body?.jobs || body?.results || body?.data || body?.postings ||
         body?.hits || body?.items || [];
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const { searches, titleFilter } = loadConfig();
  mkdirSync(PROFILE_DIR, { recursive: true });

  const isFirstRun = !existsSync(join(PROFILE_DIR, 'prefs.js'));
  const headless = HEADLESS && !isFirstRun;

  if (isFirstRun) {
    console.log('First run: opening browser visibly.');
    console.log('Log in to hiring.cafe and pass the Cloudflare challenge, then close the browser.');
    console.log('Subsequent runs will use the saved session.\n');
  }

  const browser = await firefox.launchPersistentContext(PROFILE_DIR, {
    headless,
    viewport: { width: 1280, height: 900 },
  });

  const seenUrls = loadSeenUrls();
  const allNew   = [];
  const allSkipped = [];
  const date = new Date().toISOString().slice(0, 10);

  try {
    const page = await browser.newPage();

    for (const search of searches) {
      const { label, url: searchUrl, max_results: maxResults = 100 } = search;
      console.log(`\n── "${label}" ──────────────────────────────`);

      // Set up API interceptor before navigating
      const interceptor = makeInterceptor(page);

      // Verbose: log ALL responses while we hunt for the API
      const respLog = [];
      const respLogger = (resp) => {
        const u = resp.url();
        if (/\.(png|jpg|jpeg|svg|gif|css|woff|ico|js|map)(\?|$)/i.test(u)) return;
        respLog.push(`${resp.status()} ${resp.request().method()} ${u.slice(0, 160)}`);
      };
      page.on('response', respLogger);

      console.log('Navigating to saved search...');
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
      await page.waitForTimeout(3000);

      if (await isChallengePage(page)) {
        if (headless) {
          console.error('  Cloudflare challenge -- re-run without --headless to resolve it');
          interceptor.stop();
          continue;
        }
        console.log('  Cloudflare challenge detected. Please solve it in the browser...');
        // Wait up to 90s for user to pass challenge
        await page.waitForFunction(
          () => !/security verification|just a moment|checking your browser/i.test(document.body?.innerText || ''),
          { timeout: 90_000, polling: 2000 }
        ).catch(() => {});
        await page.waitForTimeout(2000);
      }

      // Try scrolling to trigger any lazy-loaded API calls
      await page.evaluate(() => window.scrollBy(0, 600)).catch(() => {});
      await page.waitForTimeout(1500);
      await page.evaluate(() => window.scrollBy(0, 600)).catch(() => {});

      // Wait for the API intercept (up to 30s)
      console.log('Waiting for API response...');
      const intercepted = await Promise.race([
        interceptor.promise,
        new Promise(r => setTimeout(() => r(null), 30_000)),
      ]);
      interceptor.stop();
      page.off('response', respLogger);

      if (!intercepted) {
        console.warn('  No API call intercepted. Dumping all non-asset responses seen:');
        for (const line of respLog.slice(0, 40)) console.warn('    ' + line);
        if (respLog.length > 40) console.warn(`    ... +${respLog.length - 40} more`);

        // Try reading __NEXT_DATA__ as fallback
        const nextData = await page.evaluate(() => {
          const el = document.getElementById('__NEXT_DATA__');
          return el ? el.textContent : null;
        }).catch(() => null);
        if (nextData) {
          console.warn(`  __NEXT_DATA__ blob found (${nextData.length} chars). First 300:`);
          console.warn('    ' + nextData.slice(0, 300));
        } else {
          console.warn('  No __NEXT_DATA__ blob.');
        }
        continue;
      }

      console.log(`  API endpoint: ${intercepted.url}`);

      let newJobs       = 0;
      let skippedTitle  = 0;
      let skippedDup    = 0;
      let totalScraped  = 0;
      let emptyPages    = 0;

      // Process first page (already captured in intercept)
      const firstPageJobs = extractJobs(intercepted.body);
      console.log(`  Page 1: ${firstPageJobs.length} jobs`);

      for (const raw of firstPageJobs) {
        totalScraped++;
        const job = normaliseJob(raw);
        if (!job.url) continue;
        if (seenUrls.has(job.url)) { skippedDup++; allSkipped.push({ ...job, label }); continue; }
        if (!passesFilter(job.title, titleFilter)) { skippedTitle++; allSkipped.push({ ...job, label }); continue; }
        seenUrls.add(job.url);
        allNew.push({ ...job, label });
        newJobs++;
        console.log(`    + ${job.company || 'Unknown'} | ${job.title}`);
      }

      // Paginate via direct API calls
      let offset = PAGE_SIZE;
      let page_num = 2;

      while (newJobs < maxResults) {
        await new Promise(r => setTimeout(r, POLITE_MS));
        const body = await fetchNextPage(intercepted, offset);

        if (!body) { emptyPages++; if (emptyPages >= MAX_EMPTY) break; offset += PAGE_SIZE; continue; }

        const jobs = extractJobs(body);
        console.log(`  Page ${page_num}: ${jobs.length} jobs`);

        if (jobs.length === 0) { emptyPages++; if (emptyPages >= MAX_EMPTY) break; }
        else emptyPages = 0;

        for (const raw of jobs) {
          totalScraped++;
          const job = normaliseJob(raw);
          if (!job.url) continue;
          if (seenUrls.has(job.url)) { skippedDup++; allSkipped.push({ ...job, label }); continue; }
          if (!passesFilter(job.title, titleFilter)) { skippedTitle++; allSkipped.push({ ...job, label }); continue; }
          seenUrls.add(job.url);
          allNew.push({ ...job, label });
          newJobs++;
          console.log(`    + ${job.company || 'Unknown'} | ${job.title}`);
          if (newJobs >= maxResults) break;
        }

        if (jobs.length < PAGE_SIZE) break; // last page
        offset += PAGE_SIZE;
        page_num++;
      }

      console.log(`  Total scraped: ${totalScraped} | new: ${newJobs} | title-filtered: ${skippedTitle} | dupes: ${skippedDup}`);
    }

    await page.close();
  } finally {
    await browser.close();
  }

  // ── Summary & write ────────────────────────────────────────────────────────

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`Hiring Cafe Scan — ${date}`);
  console.log(`${'═'.repeat(50)}`);
  console.log(`New offers found:  ${allNew.length}`);
  console.log(`Skipped (filters): ${allSkipped.length}`);

  if (!APPLY) {
    console.log('\n[DRY RUN] Re-run with --apply to save results.');
    return;
  }

  if (allNew.length > 0) {
    appendToPipeline(allNew);
    for (const search of [...new Set(allNew.map(j => j.label))]) {
      const group = allNew.filter(j => j.label === search);
      appendToHistory(group, search, 'added');
    }
    console.log(`\nSaved ${allNew.length} new job(s) to pipeline.md and scan-history.tsv`);
  }
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
