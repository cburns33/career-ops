# Mode: connections — LinkedIn Connections × Open Roles

When the user runs `/career-ops connections`, execute the following:

## Step 1 — Run the matcher

```bash
node connections-match.mjs
```

Parse stdout and present results conversationally (don't just dump the raw output).

## Step 2 — Interpret results

For each matched company:

**If there's an open evaluated role:**
- Remind the user of the role score and status from applications.md
- Identify the best connection to reach out to (prioritize: same department/function > longest tenure > most senior title)
- Offer to draft a LinkedIn outreach message using the `contacto` mode

**If it's a tracked portal with no evaluated role yet:**
- Note that the company is on the radar and suggest checking their careers page
- Offer to scan it now

## Step 3 — Outreach offer

After showing results, ask:
> "Want me to draft a LinkedIn message to any of these contacts? Just say the company name and I'll write a targeted intro based on your CV and the open role."

If yes → run `contacto` mode with the connection's name, title, company, and the relevant job role pre-loaded.

## Flags (pass through to script)

| User says | Flag |
|-----------|------|
| "show all" / "include all companies" | `--all` |
| "only [company]" | `--company [company]` |

## Multi-CSV support

Drop any number of LinkedIn Connections.csv exports into `data/connections/`
(name files anything: `chase.csv`, `sarah.csv`, etc.).
The script deduplicates across files by LinkedIn URL and tags each
warm contact with the source filename so the user knows who to ask.

Fallback: if `data/connections/` is empty, the script reads `data/connections.csv`.

When the user provides a new export:
1. Drop the file into `data/connections/` (or overwrite `data/connections.csv`)
2. Re-run `node connections-match.mjs`
3. Note any new matches vs the previous run

## Privacy note

`data/connections.csv` and `data/connections/` are both gitignored -- they never leave the user's machine.
