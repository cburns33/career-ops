#!/usr/bin/env node
/**
 * simplify-import.mjs — Import Simplify job tracker CSV into applications.md
 *
 * Handles:
 *   - Deduplication within the CSV (same URL = duplicate)
 *   - Deduplication against existing applications.md entries (company + role fuzzy match)
 *   - Status mapping: APPLIED → Applied, REJECTED → Rejected, SAVED → skip
 *   - Adds URLs to existing entries where matched
 *   - Updates status to Rejected where Simplify shows rejection
 *
 * Usage:
 *   node simplify-import.mjs [--dry-run]
 *
 * Input:  data/simplify-export.csv
 * Output: data/applications.md (merged)
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const SIMPLIFY_FILE = join(ROOT, 'data/simplify-export.csv');
const APPS_FILE     = join(ROOT, 'data/applications.md');
const DRY_RUN       = process.argv.includes('--dry-run');

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeCompany(name) {
  return (name || '')
    .toLowerCase()
    // Remove legal suffixes and common noise
    .replace(/\b(inc|llc|corp|ltd|co|group|technologies|technology|solutions|consulting|services|digital|global|international|usa|us|division of|payroll)\b/g, '')
    // Remove leading numbers/IDs (e.g. "US6469 Sysco Payroll...")
    .replace(/^[a-z0-9]{3,8}\s+/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

function normalizeRole(role) {
  return (role || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
}

function companiesMatch(a, b) {
  const na = normalizeCompany(a);
  const nb = normalizeCompany(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length > 4 && nb.includes(na)) return true;
  if (nb.length > 4 && na.includes(nb)) return true;
  const tokA = na.match(/[a-z0-9]{4,}/g) || [];
  const tokB = nb.match(/[a-z0-9]{4,}/g) || [];
  return tokA.some(t => tokB.includes(t));
}

function rolesMatch(a, b) {
  const wordsA = normalizeRole(a).split(/\s+/).filter(w => w.length > 3);
  const wordsB = normalizeRole(b).split(/\s+/).filter(w => w.length > 3);
  const overlap = wordsA.filter(w => wordsB.includes(w));
  return overlap.length >= 2;
}

/** Minimal CSV parser — handles quoted fields */
function parseCSV(raw) {
  const lines = raw.split('\n');
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]);
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = parseCSVLine(line);
    const row = {};
    headers.forEach((h, idx) => { row[h.trim()] = (cols[idx] || '').trim(); });
    rows.push(row);
  }
  return rows;
}

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
      result.push(current); current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function parseAppLine(line) {
  const parts = line.split('|').map(s => s.trim());
  if (parts.length < 9) return null;
  const num = parseInt(parts[1]);
  if (isNaN(num) || num === 0) return null;
  return { num, date: parts[2], company: parts[3], role: parts[4], score: parts[5], status: parts[6], pdf: parts[7], report: parts[8], notes: parts[9] || '', raw: line };
}

function mapStatus(simplifyStatus) {
  switch ((simplifyStatus || '').toUpperCase()) {
    case 'REJECTED':  return 'Rejected';
    case 'APPLIED':   return 'Applied';
    case 'INTERVIEW': return 'Interview';
    case 'OFFER':     return 'Offer';
    default:          return null; // SAVED, etc → skip
  }
}

// ── Skip rules ────────────────────────────────────────────────────────────────

const SKIP_COMPANIES = [
  'candidate experience', // garbage entry
];

const SKIP_ROLES = [
  'specialist,', // malformed Pearson entry
];

function shouldSkip(row) {
  if (!row['Job Title'] || !row['Company Name']) return true;
  if ((row['Status'] || '').toUpperCase() === 'SAVED') return true;
  if ((row['Applied Date'] || '').toUpperCase() === 'N/A' && (row['Status'] || '').toUpperCase() !== 'REJECTED') return true;
  const company = row['Company Name'].toLowerCase();
  if (SKIP_COMPANIES.some(s => company.includes(s))) return true;
  const role = row['Job Title'].toLowerCase();
  if (SKIP_ROLES.some(s => role.startsWith(s))) return true;
  return false;
}

// ── Main ──────────────────────────────────────────────────────────────────────

if (!existsSync(SIMPLIFY_FILE)) {
  console.error(`❌  ${SIMPLIFY_FILE} not found.`);
  process.exit(1);
}

if (!existsSync(APPS_FILE)) {
  console.error(`❌  ${APPS_FILE} not found.`);
  process.exit(1);
}

// Parse inputs
const simplifyRows = parseCSV(readFileSync(SIMPLIFY_FILE, 'utf-8'));
const appContent   = readFileSync(APPS_FILE, 'utf-8');
const appLines     = appContent.split('\n');

// Parse existing entries
const existingApps = [];
let maxNum = 0;
for (const line of appLines) {
  if (line.startsWith('|') && !line.includes('---') && !line.includes('Company')) {
    const app = parseAppLine(line);
    if (app) { existingApps.push(app); if (app.num > maxNum) maxNum = app.num; }
  }
}
console.log(`📊 Existing tracker: ${existingApps.length} entries, max #${maxNum}`);

// Deduplicate Simplify rows by URL, keeping highest-priority status
const seenUrls = new Map();
for (const row of simplifyRows) {
  if (shouldSkip(row)) continue;
  const url = row['Job URL'] || '';
  const status = row['Status'] || '';
  if (!seenUrls.has(url)) {
    seenUrls.set(url, row);
  } else {
    // Prefer REJECTED > INTERVIEW > APPLIED
    const priority = { REJECTED: 3, INTERVIEW: 2, OFFER: 2, APPLIED: 1 };
    const existing = seenUrls.get(url);
    if ((priority[status] || 0) > (priority[existing['Status']] || 0)) {
      seenUrls.set(url, row);
    }
  }
}
const deduped = [...seenUrls.values()];
console.log(`📥 Simplify entries to process: ${deduped.length} (after dedup)`);

let added = 0, updated = 0, skipped = 0;
const newLines = [];

for (const row of deduped) {
  const company  = row['Company Name'].trim();
  const role     = row['Job Title'].trim();
  const url      = row['Job URL'] || '';
  const date     = row['Applied Date'] && row['Applied Date'] !== 'N/A' ? row['Applied Date'] : (row['Status Date'] || '');
  const status   = mapStatus(row['Status']);
  const statusDate = row['Status Date'] || '';

  if (!status) { skipped++; continue; }

  // Normalize date to YYYY-MM-DD
  let dateStr = date;
  const dateMatch = date.match(/(\d{4}-\d{2}-\d{2})/);
  if (dateMatch) dateStr = dateMatch[1];

  // Find existing match by URL first, then company+role
  let match = existingApps.find(a => a.notes && a.notes.includes(url));
  if (!match) match = existingApps.find(a => companiesMatch(a.company, company) && rolesMatch(a.role, role));

  if (match) {
    // Update existing entry
    const lineIdx = appLines.findIndex(l => l === match.raw);
    if (lineIdx === -1) { skipped++; continue; }

    let needsUpdate = false;
    let newStatus = match.status;
    let newNotes  = match.notes;

    // Always upgrade to Rejected if Simplify says so
    if (status === 'Rejected' && match.status !== 'Rejected' && match.status !== 'Interview' && match.status !== 'Offer') {
      newStatus = 'Rejected';
      needsUpdate = true;
    }

    // Add URL to notes if missing
    if (url && !newNotes.includes(url) && !newNotes.includes('http')) {
      newNotes = newNotes ? `${newNotes} ${url}` : url;
      needsUpdate = true;
    }

    if (needsUpdate) {
      const updated_line = `| ${match.num} | ${match.date} | ${match.company} | ${match.role} | ${match.score} | ${newStatus} | ${match.pdf} | ${match.report} | ${newNotes} |`;
      appLines[lineIdx] = updated_line;
      match.raw = updated_line; // update reference
      match.status = newStatus;
      console.log(`🔄 Updated #${match.num}: ${match.company} — ${match.role} → ${newStatus}`);
      updated++;
    } else {
      skipped++;
    }
  } else {
    // New entry
    maxNum++;
    const noteStr = url || '';
    const newLine = `| ${maxNum} | ${dateStr} | ${company} | ${role} | — | ${status} | ❌ | — | ${noteStr} |`;
    newLines.push(newLine);
    existingApps.push({ num: maxNum, date: dateStr, company, role, score: '—', status, pdf: '❌', report: '—', notes: noteStr, raw: newLine });
    console.log(`➕ Added #${maxNum}: ${company} — ${role} (${status})`);
    added++;
  }
}

// Insert new lines after header separator
if (newLines.length > 0) {
  let insertIdx = -1;
  for (let i = 0; i < appLines.length; i++) {
    if (appLines[i].includes('---') && appLines[i].startsWith('|')) {
      insertIdx = i + 1;
      break;
    }
  }
  // Insert after existing entries (append at end of table)
  // Find last | line
  let lastTableLine = insertIdx;
  for (let i = insertIdx; i < appLines.length; i++) {
    if (appLines[i].startsWith('|')) lastTableLine = i;
  }
  appLines.splice(lastTableLine + 1, 0, ...newLines);
}

if (!DRY_RUN) {
  writeFileSync(APPS_FILE, appLines.join('\n'));
  console.log(`\n✅ Written to ${APPS_FILE}`);
} else {
  console.log('\n(dry-run — no changes written)');
}

console.log(`\n📊 Summary: +${added} added, 🔄 ${updated} updated, ⏭️  ${skipped} skipped`);
