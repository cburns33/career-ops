# Handoff — career-ops session 2026-04-30 (updated)

## Where we are

Working in git worktree `focused-ramanujan` (branch `claude/focused-ramanujan`) inside the main repo at `C:\Users\chase\OneDrive\Documents\Job Application AI\career-ops`.

Chase is on a job search targeting Senior Digital Marketing Manager / Director roles in B2B SaaS. career-ops is his pipeline: it evaluates job listings, generates tailored CVs + cover letters as PDFs, tracks applications, and scans portals for new roles.

---

## What was completed this session

1. **Gmail rejection scanner** (`gmail-rejection-scan.mjs`) — fully rebuilt and debugged across many iterations:
   - Playwright Firefox persistent profile at `data/gmail-playwright-profile`
   - 8 search queries (subject-based + ATS domain-based + in:trash), uses direct URL navigation not search box
   - ATS_DOMAINS (19), ATS_SENDER_NAMES, BLOCKED_SENDERS sets for false-positive reduction
   - Company-only tracker matching (role-only matching removed — caused false positives)
   - Two-tab Excel output: Matched Rejections + Unmatched Emails → `data/rejection-scan-YYYY-MM-DD.xlsx`
   - Consecutive-empty circuit breaker (EMPTY_LIMIT=3)
   - Pagination via `aria-disabled` check

2. **Fieldwire + Tropic PDFs** — generated for existing HTML files (CV + cover letter, both companies)

3. **Softeon evaluation** — IFS is Softeon's parent company, Chase worked there 2.5 years. Full eval report (`reports/033-softeon-2026-04-29.md`), tailored CV + cover letter, both as HTML + PDF. Score: 4.0/5.

4. **Upstream sync** — synced from santifer/career-ops v1.1.0 → v1.6.0. The `update-system.mjs apply` command hit a Cloudflare safety violation bug; worked around by committing staged system files in two batches and manually checking out missing files. Backup branch: `backup-pre-update-1.1.0`.

5. **Discord analysis** — read career-ops #feature-requests and #dev channels. Key finding: Hiring Cafe not discussed; LinkedIn scanner (PR #379) and ATS API crawler (Mike's 20k company list) are the most active job discovery efforts.

6. **Job discovery expansion (pending task #3) — ALL COMPLETED:**
   - **PR #535 Workday API** — applied to `scan.mjs`: `detectApi()` recognises `/wday/cxs/` URL pattern, `fetchWorkdayAll()` paginates via POST (limit=20, max 5000 jobs), `parseWorkday()` extracts postings.
   - **PR #490 location filter** — applied to `scan.mjs`: `buildLocationFilter()` reads `location_filter.positive/negative` from `portals.yml`; added positive (Austin, Texas, Remote, US) and negative (Singapore, London, EMEA, etc.) lists.
   - **PR #487 --verify flag** — applied to `scan.mjs`: `verifyOffers()` launches Playwright Chromium, classifies each new offer as active/expired/dropped/invalid using `liveness-browser.mjs`; scan history records separate statuses for each outcome.
   - **liveness-browser.mjs** — new file from PR #487 branch, provides `checkUrlLiveness()` helper.
   - **PR #379 LinkedIn scanner** — `scan-auth.mjs` (harness) + `scan-auth/linkedin.mjs` (Playwright scraper) installed. `linkedin_searches` block added to `portals.yml` with 7 keyword queries, `date_posted: Week`, Senior/Director experience levels.
   - **hiringcafe-scan.mjs** — new standalone scanner. Navigates to your exact saved-search URL (all filters pre-applied: Austin/TX/Remote locations, Marketing dept, Individual Contributor, job title query). Intercepts the backend API call on first page load, then replays it with paginated offsets — no DOM pagination needed. First run opens browser visibly for Cloudflare challenge; persistent Firefox profile at `data/hiringcafe-playwright-profile`. Saved search URL stored in `portals.yml` under `hiringcafe.saved_searches`.

---

## Pending tasks (priority order)

### 1. --apply-excel flag for gmail-rejection-scan.mjs
Add a "Mark as Rejected?" blank column to the Matched Rejections Excel tab. Add `--apply-excel` CLI flag that:
- Reads the most recent `data/rejection-scan-*.xlsx`
- Finds rows where "Mark as Rejected?" = "y" (case-insensitive)
- For each, finds the matching row in `data/applications.md` by `#` (num column) and surgically replaces the status column with `Rejected`
- Prints what it changed, no confirmation prompt

### 2. Google Sheets rows 5 + 6
Mark Fieldwire (row 5) and Tropic (row 6) as evaluated in the intake spreadsheet (ID: `1ZFGSR1_7wJ4QQmiG_J2l4VHfxMddUT3TrlMIHbudQ3E`). Use `node sheets-update.mjs`. Cells: Sheet1!E5:F5 and Sheet1!E6:F6 → ✅ ✅.

### 3. Job discovery expansion — ✅ COMPLETED

All five sub-tasks done (see session notes above). Quick-start commands:

```
# Portal scanner (Greenhouse / Ashby / Lever / Workday APIs)
node scan.mjs --dry-run
node scan.mjs --verify      # also checks liveness

# LinkedIn authenticated scanner
node scan-auth.mjs --login linkedin   # first time only
node scan-auth.mjs linkedin

# Hiring Cafe saved-search scanner
node hiringcafe-scan.mjs              # first time: browser opens, pass Cloudflare
node hiringcafe-scan.mjs --apply      # write results
```

---

## Key file locations

| What | Where |
|------|-------|
| Project root | `C:\Users\chase\OneDrive\Documents\Job Application AI\career-ops` |
| Active worktree | `.claude\worktrees\focused-ramanujan` |
| Gmail scanner | `gmail-rejection-scan.mjs` |
| Sheets scripts | `sheets-auth.mjs`, `sheets-update.mjs` |
| PDF generator | `generate-pdf.mjs` (--format=letter) |
| Portal scanner | `scan.mjs` (Greenhouse/Ashby/Lever/Workday) |
| LinkedIn scanner | `scan-auth.mjs` + `scan-auth/linkedin.mjs` |
| Hiring Cafe scanner | `hiringcafe-scan.mjs` |
| Liveness checker | `liveness-browser.mjs` (used by `--verify`) |
| Applications tracker | `data/applications.md` |
| Pipeline inbox | `data/pipeline.md` |
| Scan dedup | `data/scan-history.tsv` |
| Profile | `config/profile.yml` |
| Portals config | `portals.yml` |
| LinkedIn profile dir | `data/linkedin-playwright-profile` |
| Hiring Cafe profile dir | `data/hiringcafe-playwright-profile` |

---

## Important rules (from CLAUDE.md + user feedback)

- **No em dashes** (`—`) anywhere in generated prose or HTML
- **CVs and cover letters always output as PDFs** — run `node generate-pdf.mjs --format=letter` immediately after generating HTML
- **No trailing summaries** — terse responses
- **Excel for rejection review** — user reviews in spreadsheet, not terminal
- **Company-only tracker matching** — role-only matching causes false positives, do not re-add it
- **prefs.js not user.js** for Firefox first-run detection
- **Direct URL navigation** for Gmail search, not search box fill + Enter

---

## Tool compatibility

**Best next agent: Claude Code** (desktop, VS Code extension, or web). It will automatically load CLAUDE.md, the memory files at `C:\Users\chase\.claude\projects\...\memory\`, and the plan file. All context carries over.

**Windsurf:** Can read and edit the codebase fine, but will NOT automatically load CLAUDE.md context, memory files, or plans. You'd need to paste the relevant context manually. The Node.js scripts all run independently — `node gmail-rejection-scan.mjs`, `node generate-pdf.mjs`, etc. work fine from any terminal.

**Recommendation:** Start the next session in Claude Code and open the worktree folder directly. Say "check pending tasks" and it will orient from memory + plan files.
