#!/usr/bin/env node
/**
 * connections-match.mjs — LinkedIn Connections × Open Roles Matcher
 *
 * Cross-references your LinkedIn connections against:
 *   1. portals.yml  — companies you're actively scanning
 *   2. data/applications.md — companies with evaluated/active roles
 *
 * Usage:
 *   node connections-match.mjs                  # all matches
 *   node connections-match.mjs --company knime  # filter to one company
 *   node connections-match.mjs --all            # include portals with no open role yet
 *   node connections-match.mjs --json           # machine-readable output
 *
 * Input:  data/connections.csv  (LinkedIn export)
 * Config: portals.yml, data/applications.md
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));

const CONNECTIONS_FILE = join(ROOT, 'data/connections.csv');
const PORTALS_FILE     = join(ROOT, 'portals.yml');
const APPS_FILE        = join(ROOT, 'data/applications.md');

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

function parseConnections(filePath) {
  if (!existsSync(filePath)) {
    console.error(`❌  Connections file not found: ${filePath}`);
    console.error(`    Export from LinkedIn → Settings → Data Privacy → Get a copy of your data → Connections`);
    console.error(`    Then copy the file to data/connections.csv`);
    process.exit(1);
  }

  const raw = readFileSync(filePath, 'utf-8');
  const lines = raw.split('\n');

  // Find the header row (contains "First Name")
  let headerIdx = lines.findIndex(l => l.includes('First Name'));
  if (headerIdx === -1) headerIdx = 3; // fallback

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
    });
  }
  return connections;
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

function buildMatches(connections, portalCompanies, applications) {
  // Build a lookup: normalizedCompany → { portalEntry?, applications[] }
  const companyMap = new Map();

  for (const pc of portalCompanies) {
    const key = normalize(pc.name);
    if (!companyMap.has(key)) companyMap.set(key, { portalName: pc.name, portalUrl: pc.url, applications: [], connections: [] });
    else companyMap.get(key).portalName = pc.name;
  }

  for (const app of applications) {
    // Find or create entry
    let found = false;
    for (const [key, entry] of companyMap) {
      if (companiesMatch(app.company, entry.portalName || key)) {
        entry.applications.push(app);
        found = true;
        break;
      }
    }
    if (!found) {
      const key = normalize(app.company);
      if (!companyMap.has(key)) companyMap.set(key, { portalName: app.company, portalUrl: '', applications: [app], connections: [] });
      else companyMap.get(key).applications.push(app);
    }
  }

  // Match connections to companies
  for (const conn of connections) {
    for (const [key, entry] of companyMap) {
      if (companiesMatch(conn.company, entry.portalName)) {
        entry.connections.push(conn);
        break;
      }
    }
  }

  // Build results: only companies with at least 1 connection
  const results = [];
  for (const [, entry] of companyMap) {
    if (entry.connections.length === 0) continue;
    if (!SHOW_ALL && entry.applications.length === 0 && !entry.portalUrl) continue;

    // Filter by --company flag
    if (ARG_COMPANY && !companiesMatch(entry.portalName, ARG_COMPANY)) continue;

    results.push(entry);
  }

  // Sort: most connections + most active roles first
  results.sort((a, b) => {
    const scoreA = a.connections.length * 2 + a.applications.length;
    const scoreB = b.connections.length * 2 + b.applications.length;
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

function printResults(results, totalConnections) {
  if (results.length === 0) {
    console.log('\n📭  No matches found.');
    if (!SHOW_ALL) console.log('    Try --all to include tracked companies with no open role yet.');
    return;
  }

  console.log(`\n🔗  LinkedIn Connections × Open Roles`);
  console.log(`    ${totalConnections} connections scanned — ${results.length} companies matched\n`);

  for (const entry of results) {
    const hasRoles = entry.applications.length > 0;
    const icon = hasRoles ? '🟢' : '🔵';
    console.log(`${icon}  ${entry.portalName}`);

    if (hasRoles) {
      for (const app of entry.applications) {
        const emoji = statusEmoji(app.status);
        console.log(`    ${emoji} ${app.role}  [${app.score}]  ${app.status}  ${app.report}`);
      }
    } else if (entry.portalUrl) {
      console.log(`    📋 Tracked portal: ${entry.portalUrl}`);
    }

    console.log(`    👥 ${entry.connections.length} connection${entry.connections.length > 1 ? 's' : ''}:`);
    for (const c of entry.connections) {
      const name = `${c.firstName} ${c.lastName}`.trim();
      const url  = c.url ? `  ${c.url}` : '';
      console.log(`       • ${name} — ${c.position}${url}`);
    }
    console.log('');
  }

  // Summary stats
  const withRoles = results.filter(r => r.applications.length > 0);
  const totalConns = results.reduce((s, r) => s + r.connections.length, 0);
  console.log(`─────────────────────────────────────────`);
  console.log(`  Companies with open roles + connections: ${withRoles.length}`);
  console.log(`  Total warm contacts across matches:      ${totalConns}`);
  console.log(`  Tracked portals with connections:        ${results.filter(r => r.applications.length === 0).length}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

const connections    = parseConnections(CONNECTIONS_FILE);
const portalCompanies = parsePortalCompanies(PORTALS_FILE);
const applications   = parseApplications(APPS_FILE);
const results        = buildMatches(connections, portalCompanies, applications);

if (JSON_OUT) {
  console.log(JSON.stringify(results, null, 2));
} else {
  printResults(results, connections.length);
}
