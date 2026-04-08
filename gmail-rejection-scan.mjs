#!/usr/bin/env node
/**
 * gmail-rejection-scan.mjs — Scan Gmail for rejection emails and sync to tracker
 *
 * Strategy:
 *   1. Launch Chrome with your existing profile (so you're already logged in)
 *   2. Search Gmail for rejection-related subject lines
 *   3. Extract company name + role from each email
 *   4. Match against applications.md
 *   5. Print a report of matched rejections
 *   6. Optionally write updates to tracker (--apply flag)
 *
 * Usage:
 *   node gmail-rejection-scan.mjs              # dry run — show matches, don't write
 *   node gmail-rejection-scan.mjs --apply      # write Rejected status to tracker
 *   node gmail-rejection-scan.mjs --headless   # run without visible browser
 *
 * NOTE: Close all Chrome windows before running, OR use --port=9222 if Chrome
 *       is already running with --remote-debugging-port=9222.
 */

import { firefox } from 'playwright';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const ROOT      = fileURLToPath(new URL('.', import.meta.url));
const APPS_FILE = join(ROOT, 'data/applications.md');
const APPLY     = process.argv.includes('--apply');
const HEADLESS  = process.argv.includes('--headless');
const CDP_PORT  = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? parseInt(process.argv[i+1]) : null; })();

// ── Gmail search queries ──────────────────────────────────────────────────────
// Multiple searches to maximise coverage across rejection phrasing styles
// in:anywhere searches inbox + trash + spam + archive
const SEARCH_QUERIES = [
  'in:anywhere subject:(unfortunately OR "not moving forward" OR "other candidates" OR "decided to move") after:2026/01/01',
  'in:anywhere subject:("position has been filled" OR "different direction" OR "not be moving" OR "no longer considering") after:2026/01/01',
  'in:anywhere (unfortunately OR "not selected" OR "not moving forward" OR "other candidates") (application OR position OR role OR interview) after:2026/01/01',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeCompany(name) {
  return (name || '')
    .toLowerCase()
    .replace(/\b(inc|llc|corp|ltd|co|group|technologies|technology|solutions|consulting|services|digital|global|international|usa|us|hiring|careers|recruiting|talent|noreply|no-reply)\b/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

function companiesMatch(a, b) {
  const na = normalizeCompany(a);
  const nb = normalizeCompany(b);
  if (!na || !nb || na.length < 3 || nb.length < 3) return false;
  if (na === nb) return true;
  if (na.length > 4 && nb.includes(na)) return true;
  if (nb.length > 4 && na.includes(nb)) return true;
  const tokA = na.match(/[a-z0-9]{4,}/g) || [];
  const tokB = nb.match(/[a-z0-9]{4,}/g) || [];
  return tokA.some(t => tokB.includes(t));
}

/** Extract likely company name from an email address */
function companyFromEmail(email) {
  const domain = (email || '').split('@')[1] || '';
  const parts = domain.split('.');
  // Take the second-level domain (e.g. "samsara" from "careers.samsara.com")
  if (parts.length >= 2) return parts[parts.length - 2];
  return '';
}

/** Extract company names mentioned in a subject line */
function companiesFromSubject(subject) {
  // Look for words that could be company names (capitalized, 3+ chars, not common words)
  const stopWords = new Set(['your', 'application', 'with', 'the', 'for', 'and', 'regarding', 'position', 'role', 'update', 'status', 'thank', 'you', 'from', 'our', 'team', 'following', 'interview', 'decision', 'opportunity', 'about']);
  return (subject.match(/\b[A-Z][a-zA-Z0-9]{2,}\b/g) || [])
    .filter(w => !stopWords.has(w.toLowerCase()));
}

function parseAppLine(line) {
  const parts = line.split('|').map(s => s.trim());
  if (parts.length < 9) return null;
  const num = parseInt(parts[1]);
  if (isNaN(num) || num === 0) return null;
  return { num, date: parts[2], company: parts[3], role: parts[4], score: parts[5], status: parts[6], pdf: parts[7], report: parts[8], notes: parts[9] || '', raw: line };
}

// ── Parse existing tracker ────────────────────────────────────────────────────

if (!existsSync(APPS_FILE)) {
  console.error('❌  data/applications.md not found.');
  process.exit(1);
}

const appContent = readFileSync(APPS_FILE, 'utf-8');
const appLines   = appContent.split('\n');
const apps = [];
for (const line of appLines) {
  if (line.startsWith('|') && !line.includes('---') && !line.includes('Company')) {
    const app = parseAppLine(line);
    if (app) apps.push(app);
  }
}
console.log(`📊 Loaded ${apps.length} applications from tracker`);

// ── Launch browser ────────────────────────────────────────────────────────────

let browser, context, page;

// Dedicated profile dir — never conflicts with running Chrome
const PLAYWRIGHT_PROFILE = join(ROOT, 'data/gmail-playwright-profile');

async function launchBrowser() {
  // Firefox works with Google login — Chrome gets blocked by automation detection
  const isFirstRun = !existsSync(join(PLAYWRIGHT_PROFILE, 'user.js'));

  if (isFirstRun) {
    console.log('👋 First run — a Firefox window will open.');
    console.log('   1. Log into your Gmail account');
    console.log('   2. Once your inbox is visible, come back here and press Enter\n');
  } else {
    console.log('🚀 Launching Firefox (dedicated profile — Chrome can stay open)...\n');
  }

  context = await firefox.launchPersistentContext(PLAYWRIGHT_PROFILE, {
    headless: HEADLESS && !isFirstRun,
    viewport: { width: 1280, height: 900 },
  });
  page = await context.newPage();

  if (isFirstRun) {
    await page.goto('https://mail.google.com');
    console.log('⏳ Waiting for you to log into Gmail...');
    // Wait until Gmail inbox is visible (URL contains #inbox or mail.google.com/mail/u/)
    await page.waitForFunction(
      () => window.location.href.includes('/mail/u/') || window.location.href.includes('#inbox') || document.querySelector('[gh="tm"]') !== null,
      { timeout: 180000 }
    );
    console.log('✅ Gmail detected — session saved. Future runs will be automatic.\n');
    await page.waitForTimeout(2000); // Let the page settle
  }
}

// ── Gmail scraper ─────────────────────────────────────────────────────────────

async function searchGmail(query) {
  // Fresh full navigation to Gmail — ensures we're not on stale content
  await page.goto('https://mail.google.com/mail/u/0/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Use the search input
  const searchBox = page.locator('input[name="q"]').first();
  await searchBox.waitFor({ state: 'visible', timeout: 15000 });
  await searchBox.click({ clickCount: 3 }); // select all
  await searchBox.fill(query);
  await searchBox.press('Enter');

  // Wait for URL to reflect the search query (confirms navigation happened)
  await page.waitForFunction(
    (q) => window.location.href.includes('search') || window.location.hash.includes('search'),
    query,
    { timeout: 15000 }
  ).catch(() => {});

  // Wait generously for Gmail's virtual DOM to render results
  await page.waitForTimeout(5000);

  const currentUrl = page.url();
  console.log(`   URL: ${currentUrl.substring(0, 90)}`);

  // Extract email rows via evaluate — runs inside the page, most reliable
  const emails = await page.evaluate(() => {
    const results = [];
    const rows = document.querySelectorAll('tr.zA');
    for (const row of rows) {
      // Sender: span with 'email' attribute (most reliable), fallback .zF
      const senderEl    = row.querySelector('[email]') || row.querySelector('.zF');
      const senderEmail = senderEl?.getAttribute('email') || '';
      const senderName  = senderEl?.getAttribute('name') || senderEl?.innerText || '';

      // Subject: .bog (unread/bold) or .bqe (read) — the actual subject text
      const subjectEl = row.querySelector('.bog') || row.querySelector('.bqe');
      const subject   = subjectEl?.innerText || '';

      // Snippet for extra company name signals
      const snippetEl = row.querySelector('.y2');
      const snippet   = snippetEl?.innerText || '';

      if (!senderName && !subject) continue;
      results.push({ senderEmail, senderName, subject, snippet });
    }
    return results;
  });

  console.log(`   Rows found: ${emails.length}`);
  return emails;
}

// ── Match emails to tracker entries ──────────────────────────────────────────

function matchToTracker(emails) {
  const matches = [];
  const seen = new Set();

  for (const email of emails) {
    // Build candidate company names from this email
    const candidateCompanies = [
      companyFromEmail(email.senderEmail),
      email.senderName,
      ...companiesFromSubject(email.subject),
    ].filter(Boolean);

    for (const app of apps) {
      if (app.status === 'Rejected') continue; // already marked
      if (seen.has(app.num)) continue;

      const matched = candidateCompanies.some(c => companiesMatch(c, app.company));
      if (matched) {
        matches.push({ app, email });
        seen.add(app.num);
        break;
      }
    }
  }

  return matches;
}

// ── Apply updates to tracker ──────────────────────────────────────────────────

function applyUpdates(matches) {
  let count = 0;
  for (const { app } of matches) {
    const lineIdx = appLines.findIndex(l => l === app.raw);
    if (lineIdx === -1) continue;
    const updated = `| ${app.num} | ${app.date} | ${app.company} | ${app.role} | ${app.score} | Rejected | ${app.pdf} | ${app.report} | ${app.notes} |`;
    appLines[lineIdx] = updated;
    count++;
  }
  if (count > 0) {
    writeFileSync(APPS_FILE, appLines.join('\n'));
    console.log(`\n✅ Updated ${count} entries to Rejected in tracker`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

await launchBrowser();

const allEmails = [];
for (const query of SEARCH_QUERIES) {
  console.log(`\n🔍 Searching: ${query.substring(0, 60)}...`);
  try {
    const emails = await searchGmail(query);
    console.log(`   Found ${emails.length} emails`);
    allEmails.push(...emails);
  } catch (err) {
    console.warn(`   ⚠️  Search failed: ${err.message}`);
  }
}

// Deduplicate emails by subject
const uniqueEmails = [];
const seenSubjects = new Set();
for (const email of allEmails) {
  const key = email.subject.slice(0, 50);
  if (!seenSubjects.has(key)) {
    seenSubjects.add(key);
    uniqueEmails.push(email);
  }
}
console.log(`\n📧 Total unique rejection emails found: ${uniqueEmails.length}`);

const matches = matchToTracker(uniqueEmails);

if (matches.length === 0) {
  console.log('\n✅ No new rejections matched to tracker entries.');
} else {
  console.log(`\n🎯 Matched ${matches.length} rejections to tracker entries:\n`);
  for (const { app, email } of matches) {
    console.log(`  #${app.num} ${app.company} — ${app.role}`);
    console.log(`       Email: "${email.subject.slice(0, 80)}"`);
    console.log(`       From:  ${email.senderName} <${email.senderEmail}>\n`);
  }

  if (APPLY) {
    // Interactive confirmation per match
    const { createInterface } = await import('readline');
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const ask = (q) => new Promise(resolve => rl.question(q, resolve));

    const confirmed = [];
    for (const match of matches) {
      const { app, email } = match;
      if (['Interview', 'Offer', 'Rejected', 'Discarded'].includes(app.status)) {
        console.log(`⏭️  Skipping #${app.num} ${app.company} (already: ${app.status})`);
        continue;
      }
      console.log(`\n  #${app.num} ${app.company} — ${app.role}`);
      console.log(`  Email: "${email.subject.slice(0, 80)}"`);
      console.log(`  From:  ${email.senderName} <${email.senderEmail}>`);
      const answer = await ask('  Mark as Rejected? [y/N] ');
      if (answer.toLowerCase() === 'y') confirmed.push(match);
    }

    rl.close();
    applyUpdates(confirmed);
  } else {
    console.log('💡 Run with --apply to review and confirm each rejection interactively.');
  }
}

// Show unmatched rejection emails (companies not in tracker)
const matchedNums = new Set(matches.map(m => m.app.num));
const unmatched = uniqueEmails.filter(e => {
  return !matches.some(m => m.email === e);
});
if (unmatched.length > 0) {
  console.log(`\n📋 ${unmatched.length} rejection emails had no tracker match (new companies or already marked):`);
  for (const e of unmatched.slice(0, 10)) {
    console.log(`   • ${e.senderName} — "${e.subject.slice(0, 70)}"`);
  }
  if (unmatched.length > 10) console.log(`   ... and ${unmatched.length - 10} more`);
}

await context.close().catch(() => {});
if (browser) await browser.close().catch(() => {});
