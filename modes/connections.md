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

## Updating connections

When the user provides a new connections export:
1. Copy to `data/connections.csv` (overwrite)
2. Re-run `node connections-match.mjs`
3. Note any new matches vs the previous run

## Privacy note

`data/connections.csv` is gitignored — it never leaves the user's machine.
