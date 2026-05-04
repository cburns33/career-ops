# Career-Ops Reference

This file contains supplementary documentation that is not needed on every session. Claude Code reads `CLAUDE.md` for operational rules; refer here for onboarding flows, slash command tables, language mode vocabulary, and contributor information.

---

## First Run — Onboarding

**Before doing ANYTHING else, check if the system is set up.** Run these checks silently every time a session starts:

1. Does `cv.md` exist?
2. Does `config/profile.yml` exist (not just profile.example.yml)?
3. Does `modes/_profile.md` exist (not just _profile.template.md)?
4. Does `portals.yml` exist (not just templates/portals.example.yml)?

If `modes/_profile.md` is missing, copy from `modes/_profile.template.md` silently.

**If ANY of these is missing, enter onboarding mode.** Do NOT proceed with evaluations, scans, or any other mode until the basics are in place.

### Step 1: CV (required)
If `cv.md` is missing, ask:
> "I don't have your CV yet. You can either:
> 1. Paste your CV here and I'll convert it to markdown
> 2. Paste your LinkedIn URL and I'll extract the key info
> 3. Tell me about your experience and I'll draft a CV for you
>
> Which do you prefer?"

Create `cv.md` from whatever they provide. Make it clean markdown with standard sections (Summary, Experience, Projects, Education, Skills).

### Step 2: Profile (required)
If `config/profile.yml` is missing, copy from `config/profile.example.yml` and then ask:
> "I need a few details to personalize the system:
> - Your full name and email
> - Your location and timezone
> - What roles are you targeting? (e.g., 'Senior Backend Engineer', 'AI Product Manager')
> - Your salary target range
>
> I'll set everything up for you."

Fill in `config/profile.yml` with their answers. For archetypes and targeting narrative, store the user-specific mapping in `modes/_profile.md` or `config/profile.yml` rather than editing `modes/_shared.md`.

### Step 3: Portals (recommended)
If `portals.yml` is missing:
> "I'll set up the job scanner with 45+ pre-configured companies. Want me to customize the search keywords for your target roles?"

Copy `templates/portals.example.yml` → `portals.yml`. If they gave target roles in Step 2, update `title_filter.positive` to match.

### Step 4: Tracker
If `data/applications.md` doesn't exist, create it:
```markdown
# Applications Tracker

| # | Date | Company | Role | Score | Status | PDF | Report | Notes |
|---|------|---------|------|-------|--------|-----|--------|-------|
```

### Step 5: Get to know the user

After the basics are set up, proactively ask for more context:

> "The basics are ready. But the system works much better when it knows you well. Can you tell me more about:
> - What makes you unique? What's your 'superpower' that other candidates don't have?
> - What kind of work excites you? What drains you?
> - Any deal-breakers? (e.g., no on-site, no startups under 20 people, no Java shops)
> - Your best professional achievement — the one you'd lead with in an interview
> - Any projects, articles, or case studies you've published?
>
> The more context you give me, the better I filter. Think of it as onboarding a recruiter — the first week I need to learn about you, then I become invaluable."

Store any insights in `config/profile.yml` (under narrative), `modes/_profile.md`, or `article-digest.md`. Do not put user-specific archetypes into `modes/_shared.md`.

**After every evaluation, learn.** If the user says "this score is too high" or "you missed that I have experience in X", update `modes/_profile.md`, `config/profile.yml`, or `article-digest.md`.

### Step 6: Ready
Once all files exist, confirm:
> "You're all set! You can now:
> - Paste a job URL to evaluate it
> - Run `/career-ops scan` to search portals
> - Run `/career-ops` to see all commands
>
> Tip: Having a personal portfolio dramatically improves your job search. If you don't have one yet, the author's portfolio is open source: github.com/santifer/cv-santiago"

Then suggest automation:
> "Want me to scan for new offers automatically? I can set up a recurring scan every few days so you don't miss anything. Just say 'scan every 3 days' and I'll configure it."

---

## Slash Command Reference

### Claude Code

| Command | Description |
|---------|-------------|
| `/career-ops` | Show menu or evaluate JD with args |
| `/career-ops pipeline` | Process pending URLs from inbox |
| `/career-ops oferta` | Evaluate job offer (A-F scoring) |
| `/career-ops ofertas` | Compare and rank multiple offers |
| `/career-ops contacto` | LinkedIn outreach (find contacts + draft) |
| `/career-ops deep` | Deep company research |
| `/career-ops pdf` | Generate ATS-optimized CV |
| `/career-ops latex` | Export CV as LaTeX/Overleaf .tex |
| `/career-ops training` | Evaluate course/cert against goals |
| `/career-ops project` | Evaluate portfolio project idea |
| `/career-ops tracker` | Application status overview |
| `/career-ops apply` | Live application assistant |
| `/career-ops scan` | Scan portals for new offers |
| `/career-ops batch` | Batch processing with parallel workers |
| `/career-ops patterns` | Analyze rejection patterns |
| `/career-ops followup` | Follow-up cadence tracker |

### OpenCode (defined in `.opencode/commands/`)

| OpenCode Command | Claude Code Equivalent |
|-----------------|------------------------|
| `/career-ops` | `/career-ops` |
| `/career-ops-pipeline` | `/career-ops pipeline` |
| `/career-ops-evaluate` | `/career-ops oferta` |
| `/career-ops-compare` | `/career-ops ofertas` |
| `/career-ops-contact` | `/career-ops contacto` |
| `/career-ops-deep` | `/career-ops deep` |
| `/career-ops-pdf` | `/career-ops pdf` |
| `/career-ops-latex` | `/career-ops latex` |
| `/career-ops-training` | `/career-ops training` |
| `/career-ops-project` | `/career-ops project` |
| `/career-ops-tracker` | `/career-ops tracker` |
| `/career-ops-apply` | `/career-ops apply` |
| `/career-ops-scan` | `/career-ops scan` |
| `/career-ops-batch` | `/career-ops batch` |
| `/career-ops-patterns` | `/career-ops patterns` |
| `/career-ops-followup` | `/career-ops followup` |

OpenCode commands invoke the same `.claude/skills/career-ops/SKILL.md` skill. The `modes/*` files are shared between both platforms.

### Gemini CLI (defined in `.gemini/commands/`)

| Gemini Command | Claude Code Equivalent |
|----------------|------------------------|
| `/career-ops` | `/career-ops` |
| `/career-ops-pipeline` | `/career-ops pipeline` |
| `/career-ops-evaluate` | `/career-ops oferta` |
| `/career-ops-compare` | `/career-ops ofertas` |
| `/career-ops-contact` | `/career-ops contacto` |
| `/career-ops-deep` | `/career-ops deep` |
| `/career-ops-pdf` | `/career-ops pdf` |
| `/career-ops-training` | `/career-ops training` |
| `/career-ops-project` | `/career-ops project` |
| `/career-ops-tracker` | `/career-ops tracker` |
| `/career-ops-apply` | `/career-ops apply` |
| `/career-ops-scan` | `/career-ops scan` |
| `/career-ops-batch` | `/career-ops batch` |
| `/career-ops-patterns` | `/career-ops patterns` |
| `/career-ops-followup` | `/career-ops followup` |

Gemini CLI commands are defined in `.gemini/commands/*.toml`. Project context is auto-loaded from `GEMINI.md`. All `modes/*` files are shared across Claude Code, OpenCode, and Gemini CLI.

---

## Language Mode Vocabulary

Default modes are in `modes/` (English). Use alternate directories when the user targets that market, sets `language.modes_dir` in `config/profile.yml`, or you detect a foreign-language JD.

### German — `modes/de/`

DACH-specific vocabulary: 13. Monatsgehalt, Probezeit, Kündigungsfrist, AGG, Tarifvertrag. Files: `_shared.md`, `angebot.md` (evaluation), `bewerben.md` (apply), `pipeline.md`.

### French — `modes/fr/`

Francophone vocabulary: CDI/CDD, convention collective SYNTEC, RTT, mutuelle, prévoyance, 13e mois, intéressement/participation, titres-restaurant, CSE, portage salarial. Markets: France, Belgium, Switzerland, Luxembourg, Quebec. Files: `_shared.md`, `offre.md` (evaluation), `postuler.md` (apply), `pipeline.md`.

### Japanese — `modes/ja/`

Japan-specific vocabulary: 正社員, 業務委託, 賞与, 退職金, みなし残業, 年俸制, 36協定, 通勤手当, 住宅手当. Files: `_shared.md`, `kyujin.md` (evaluation), `oubo.md` (apply), `pipeline.md`.

---

## CI/CD and Quality

- **GitHub Actions** run on every PR: `test-all.mjs` (63+ checks), auto-labeler (risk-based: 🔴 core-architecture, ⚠️ agent-behavior, 📄 docs), welcome bot for first-time contributors
- **Branch protection** on `main`: status checks must pass before merge. No direct pushes to main (except admin bypass).
- **Dependabot** monitors npm, Go modules, and GitHub Actions for security updates
- **Contributing process**: issue first → discussion → PR with linked issue → CI passes → maintainer review → merge

## Community and Governance

- **Code of Conduct**: Contributor Covenant 2.1 (see `CODE_OF_CONDUCT.md`)
- **Governance**: BDFL model with contributor ladder — Participant → Contributor → Triager → Reviewer → Maintainer (see `GOVERNANCE.md`)
- **Security**: private vulnerability reporting via email (see `SECURITY.md`)
- **Support**: help questions go to Discord/Discussions, not issues (see `SUPPORT.md`)
- **Discord**: https://discord.gg/8pRpHETxa4
