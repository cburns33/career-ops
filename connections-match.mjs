#!/usr/bin/env node
/**
 * connections-match.mjs — LinkedIn Connections × Open Roles Matcher
 *
 * Cross-references LinkedIn connections (yours + friends') against:
 *   1. data/scan-history.tsv — jobs found by scan.mjs / hiringcafe-scan.mjs
 *   2. portals.yml           — companies you're actively scanning
 *   3. data/applications.md  — companies with evaluated/active roles
 *
 * Drop any number of LinkedIn Connections.csv exports into data/connections/
 * (name them anything, e.g. chase.csv, sarah.csv). Each match shows which
 * file the connection came from so you know who to ask for a referral.
 * Falls back to data/connections.csv if the folder is absent or empty.
 *
 * Usage:
 *   node connections-match.mjs                  # all matches
 *   node connections-match.mjs --company knime  # filter to one company
 *   node connections-match.mjs --all            # include portals with no open role yet
 *   node connections-match.mjs --json           # machine-readable output
 *
 * Inputs:  data/connections/*.csv  (or data/connections.csv)
 * Config:  portals.yml, data/applications.md, data/scan-history.tsv
 */

import { readFileSync, existsSync, readdirSync, mkdirSync } from 'fs';
import { join, basename } from 'path';
import { fileURLToPath } from 'url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));

const CONNECTIONS_DIR  = join(ROOT, 'data/connections');
const CONNECTIONS_FILE = join(ROOT, 'data/connections.csv');
const PORTALS_FILE     = join(ROOT, 'portals.yml');
const APPS_FILE        = join(ROOT, 'data/applications.md');
const HISTORY_FILE     = join(ROOT, 'data/scan-history.tsv');

const ARG_COMPANY = process.argv.find((a, i) => process.argv[i - 1] === '--company');
const SHOW_ALL    = process.argv.includes('--all');
const JSON_OUT    = process.argv.includes('--json');

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Normalize a company name for fuzzy matching */
function normalize(name) {
  return (name || '')
    .toLowerCase()
    .replace(/\b(inc|llc|corp|ltd|co|group|technologies|technology|solutions|consulting|services|digital|global|international|north america|usa|us)\b/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/** Returns true if two company names are likely the same org */
function companiesMatch(a, b) {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  // One contains the other (handles "Ziff Media Group" vs "Ziff Media")
  if (na.includes(nb) || nb.includes(na)) return true;
  // Token overlap ≥ 1 meaningful token (len ≥ 4)
  const tokA = na.match(/[a-z0-9]{4,}/g) || [];
  const tokB = nb.match(/[a-z0-9]{4,}/g) || [];
  return tokA.some(t => tokB.includes(t));
}

// ── Parse LinkedIn CSV ────────────────────────────────────────────────────────
// LinkedIn export has 3 header lines:
//   Line 1: Notes paragraph
//   Line 2: blank
//   Line 3: column headers  ← actual CSV starts here

function parseOneCSV(filePath, sourceName) {
  const raw = readFileSync(filePath, 'utf-8');
  const lines = raw.split('\n');

  let headerIdx = lines.findIndex(l => l.includes('First Name'));
  if (headerIdx === -1) headerIdx = 3;

  const headers = parseCSVLine(lines[headerIdx]);
  const colIdx = {};
  headers.forEach((h, i) => { colIdx[h.trim()] = i; });

  const connections = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = parseCSVLine(line);
    const company = (cols[colIdx['Company']] || '').trim();
    if (!company) continue;
    connections.push({
      firstName:   (cols[colIdx['First Name']]   || '').trim(),
      lastName:    (cols[colIdx['Last Name']]    || '').trim(),
      url:         (cols[colIdx['URL']]          || '').trim(),
      email:       (cols[colIdx['Email Address']]|| '').trim(),
      company,
      position:    (cols[colIdx['Position']]     || '').trim(),
      connectedOn: (cols[colIdx['Connected On']] || '').trim(),
      source: sourceName,
    });
  }
  return connections;
}

/**
 * Load connections from data/connections/*.csv (any filename).
 * Falls back to data/connections.csv if the folder is empty or absent.
 * Deduplicates across files by LinkedIn URL; keeps first occurrence.
 */
function loadAllConnections() {
  const files = [];

  // Prefer folder
  if (existsSync(CONNECTIONS_DIR)) {
    const csvs = readdirSync(CONNECTIONS_DIR)
      .filter(f => f.toLowerCase().endsWith('.csv'))
      .map(f => ({ path: join(CONNECTIONS_DIR, f), label: basename(f, '.csv') }));
    files.push(...csvs);
  }

  // Fallback to single file
  if (files.length === 0 && existsSync(CONNECTIONS_FILE)) {
    files.push({ path: CONNECTIONS_FILE, label: 'connections' });
  }

  if (files.length === 0) {
    console.error('❌  No connections files found.');
    console.error(`    Option A: drop LinkedIn Connections.csv exports into data/connections/`);
    console.error(`    Option B: copy a single export to data/connections.csv`);
    console.error(`    Export: LinkedIn → Settings → Data Privacy → Get a copy of your data → Connections`);
    process.exit(1);
  }

  // Parse and deduplicate by URL
  const seen = new Set();
  const all = [];
  for (const { path, label } of files) {
    const rows = parseOneCSV(path, label);
    for (const c of rows) {
      const key = c.url || `${c.firstName}|${c.lastName}|${c.company}`;
      if (seen.has(key)) continue;
      seen.add(key);
      all.push(c);
    }
  }

  const labels = files.map(f => f.label);
  return { connections: all, sources: labels };
}

/** Minimal CSV line parser (handles quoted fields with commas) */
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

// ── Parse scan-history.tsv ───────────────────────────────────────────────────
// Columns: url  first_seen  portal  title  company  status

function parseScanHistory(filePath) {
  if (!existsSync(filePath)) return [];
  const lines = readFileSync(filePath, 'utf-8').split('\n').slice(1); // skip header
  const jobs = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const [url, firstSeen, portal, title, company, status] = line.split('\t').map(s => (s || '').trim());
    if (!url || !company) continue;
    // Skip entries that were filtered out before being added
    if (status && status.startsWith('skipped_')) continue;
    jobs.push({ url, firstSeen, portal, title, company, status: status || 'added' });
  }
  return jobs;
}

// ── Parse portals.yml (minimal — no full YAML parser needed) ─────────────────

function parsePortalCompanies(filePath) {
  if (!existsSync(filePath)) return [];
  const raw = readFileSync(filePath, 'utf-8');
  const companies = [];
  let inTracked = false;
  let current = null;

  for (const line of raw.split('\n')) {
    if (line.trim() === 'tracked_companies:') { inTracked = true; continue; }
    if (inTracked && /^[a-z]/.test(line) && !line.startsWith('  ')) { inTracked = false; }
    if (!inTracked) continue;

    const nameMatch   = line.match(/^\s*-\s*name:\s*["']?(.+?)["']?\s*$/);
    const urlMatch    = line.match(/^\s*careers_url:\s*["']?(.+?)["']?\s*$/);
    const enabledMatch= line.match(/^\s*enabled:\s*(true|false)/);

    if (nameMatch) {
      current = { name: nameMatch[1], url: '', enabled: true };
      companies.push(current);
    }
    if (current && urlMatch)     current.url     = urlMatch[1];
    if (current && enabledMatch) current.enabled = enabledMatch[1] === 'true';
  }
  return companies.filter(c => c.enabled);
}

// ── Parse applications.md ────────────────────────────────────────────────────

function parseApplications(filePath) {
  if (!existsSync(filePath)) return [];
  const raw = readFileSync(filePath, 'utf-8');
  const apps = [];
  for (const line of raw.split('\n')) {
    if (!line.startsWith('|')) continue;
    if (line.includes('---') || line.includes('Company')) continue;
    const cols = line.split('|').map(s => s.trim());
    if (cols.length < 8) continue;
    const num = parseInt(cols[1]);
    if (isNaN(num) || num === 0) continue;
    apps.push({
      num,
      date:    cols[2],
      company: cols[3],
      role:    cols[4],
      score:   cols[5],
      status:  cols[6],
      report:  cols[8] || '',
    });
  }
  return apps;
}

// ── Core matching logic ───────────────────────────────────────────────────────

function buildMatches(connections, portalCompanies, applications, scanJobs) {
  // companyMap: normalizedName → { portalName, portalUrl, applications[], scanJobs[], connections[] }
  const companyMap = new Map();

  function getOrCreate(name, url = '') {
    const key = normalize(name);
    if (!companyMap.has(key)) companyMap.set(key, { portalName: name, portalUrl: url, applications: [], scanJobs: [], connections: [] });
    return companyMap.get(key);
  }

  function findEntry(companyName) {
    for (const [, entry] of companyMap) {
      if (companiesMatch(companyName, entry.portalName)) return entry;
    }
    return null;
  }

  for (const pc of portalCompanies) {
    getOrCreate(pc.name, pc.url);
  }

  for (const app of applications) {
    const entry = findEntry(app.company) || getOrCreate(app.company);
    entry.applications.push(app);
  }

  for (const job of scanJobs) {
    const entry = findEntry(job.company) || getOrCreate(job.company);
    // Avoid exact-URL duplicates within the same company
    if (!entry.scanJobs.some(j => j.url === job.url)) {
      entry.scanJobs.push(job);
    }
  }

  // Match connections to companies
  for (const conn of connections) {
    const entry = findEntry(conn.company);
    if (entry) entry.connections.push(conn);
  }

  // Build results: only entries with at least 1 connection
  const results = [];
  for (const [, entry] of companyMap) {
    if (entry.connections.length === 0) continue;
    const hasData = entry.applications.length > 0 || entry.scanJobs.length > 0 || entry.portalUrl;
    if (!SHOW_ALL && !hasData) continue;
    if (ARG_COMPANY && !companiesMatch(entry.portalName, ARG_COMPANY)) continue;
    results.push(entry);
  }

  // Sort: scan hits + applied roles first, then connection count
  results.sort((a, b) => {
    const scoreA = a.scanJobs.length * 3 + a.applications.length * 2 + a.connections.length;
    const scoreB = b.scanJobs.length * 3 + b.applications.length * 2 + b.connections.length;
    return scoreB - scoreA;
  });

  return results;
}

// ── Output ────────────────────────────────────────────────────────────────────

function statusEmoji(status) {
  const s = (status || '').toLowerCase();
  if (s.includes('interview'))  return '🟣';
  if (s.includes('offer'))      return '🟡';
  if (s.includes('applied') || s.includes('aplicado')) return '🔵';
  if (s.includes('evaluated') || s.includes('evaluad')) return '🟢';
  if (s.includes('discard') || s.includes('descart') || s.includes('skip') || s.includes('no aplicar')) return '⚫';
  return '⚪';
}

function printResults(results, totalConnections, sources) {
  if (results.length === 0) {
    console.log('\n📭  No matches found.');
    if (!SHOW_ALL) console.log('    Try --all to include tracked companies with no open role yet.');
    return;
  }

  const multiSource = sources.length > 1;
  console.log(`\n🔗  LinkedIn Connections × Open Roles`);
  if (multiSource) console.log(`    Sources: ${sources.join(', ')}`);
  console.log(`    ${totalConnections} connections scanned — ${results.length} companies matched\n`);

  for (const entry of results) {
    const hasScanHits = entry.scanJobs.length > 0;
    const hasAppRoles = entry.applications.length > 0;
    const icon = hasScanHits ? '🟢' : hasAppRoles ? '�' : '🔵';
    console.log(`${icon}  ${entry.portalName}`);

    // Scan history hits (Hiring Cafe, portal scanner, etc.)
    if (hasScanHits) {
      console.log(`    📋 Open roles found by scanner (${entry.scanJobs.length}):`);
      for (const job of entry.scanJobs) {
        console.log(`       • ${job.title}`);
        console.log(`         ${job.url}`);
        console.log(`         via ${job.portal}  |  found ${job.firstSeen}`);
      }
    }

    // Applied / evaluated roles
    if (hasAppRoles) {
      console.log(`    📝 Applications (${entry.applications.length}):`);
      for (const app of entry.applications) {
        const emoji = statusEmoji(app.status);
        console.log(`       ${emoji} ${app.role}  [${app.score}]  ${app.status}`);
      }
    }

    if (!hasScanHits && !hasAppRoles && entry.portalUrl) {
      console.log(`    � Tracked portal (not yet scanned): ${entry.portalUrl}`);
    }

    // Connections — show source file when multiple CSVs
    console.log(`    👥 ${entry.connections.length} connection${entry.connections.length > 1 ? 's' : ''}:`);
    for (const c of entry.connections) {
      const name = `${c.firstName} ${c.lastName}`.trim();
      const src  = multiSource ? `  [${c.source}]` : '';
      const url  = c.url ? `  ${c.url}` : '';
      console.log(`       • ${name} — ${c.position}${src}${url}`);
    }
    console.log('');
  }

  const withScan = results.filter(r => r.scanJobs.length > 0);
  const withApps = results.filter(r => r.applications.length > 0);
  const totalConns = results.reduce((s, r) => s + r.connections.length, 0);
  console.log(`─────────────────────────────────────────────────────`);
  console.log(`  Companies with scanner hits + warm contact: ${withScan.length}`);
  console.log(`  Companies with applied roles + warm contact: ${withApps.length}`);
  console.log(`  Total warm contacts across all matches:      ${totalConns}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

// Ensure the connections folder exists so users know where to drop files
mkdirSync(CONNECTIONS_DIR, { recursive: true });

const { connections, sources } = loadAllConnections();
const portalCompanies = parsePortalCompanies(PORTALS_FILE);
const applications    = parseApplications(APPS_FILE);
const scanJobs        = parseScanHistory(HISTORY_FILE);
const results         = buildMatches(connections, portalCompanies, applications, scanJobs);

if (JSON_OUT) {
  console.log(JSON.stringify(results, null, 2));
} else {
  printResults(results, connections.length, sources);
}
