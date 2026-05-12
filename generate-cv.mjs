#!/usr/bin/env node
// generate-cv.mjs
// Usage: node generate-cv.mjs <company-slug>
// Reads:  cv-input/<company-slug>.json
// Writes: output/cv-chase-burns-<company-slug>-YYYY-MM-DD.html + .pdf
//
// JSON schema:
// {
//   "summary": "string",
//   "competencies": ["string", ...],
//   "ifs_bullets": ["string (may contain HTML)", ...],
//   "ziff_bullets": ["string (may contain HTML)", ...]
// }

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { execSync } from 'child_process'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const company = process.argv[2]
if (!company) {
  console.error('Usage: node generate-cv.mjs <company-slug>')
  console.error('Example: node generate-cv.mjs meal-ticket')
  process.exit(1)
}

const inputPath = resolve(__dirname, `cv-input/${company}.json`)
if (!existsSync(inputPath)) {
  console.error(`❌ Input file not found: ${inputPath}`)
  process.exit(1)
}

const today = new Date().toISOString().slice(0, 10)
const templatePath = resolve(__dirname, 'templates/cv-master.html')
const outputHtml = resolve(__dirname, `output/cv-chase-burns-${company}-${today}.html`)
const outputPdf  = resolve(__dirname, `output/cv-chase-burns-${company}-${today}.pdf`)

const input = JSON.parse(readFileSync(inputPath, 'utf8'))

const DEFAULT_SKILLS = [
  { category: 'Platforms',       value: 'Google Ads, LinkedIn Ads, Marketo, HubSpot, DemandBase, Salesforce, JIRA, Asana' },
  { category: 'Analytics',       value: 'GA4, Looker, Data Analysis, Performance Reporting' },
  { category: 'SEO',             value: 'Screaming Frog, Ahrefs, SEMRush' },
  { category: 'AI & Automation', value: 'Microsoft Azure, Copilot, Python, LLM Tooling, Cursor' },
  { category: 'Design',          value: 'Adobe Photoshop, Adobe Illustrator' },
]

const required = ['summary', 'competencies', 'ifs_bullets', 'ziff_bullets']
for (const key of required) {
  if (!input[key]) {
    console.error(`❌ Missing required field in JSON: "${key}"`)
    process.exit(1)
  }
}

let html = readFileSync(templatePath, 'utf8')

html = html.replaceAll('{{SUMMARY_TEXT}}', input.summary)

html = html.replaceAll(
  '{{COMPETENCIES}}',
  input.competencies.map(c => `<span class="competency-tag">${c}</span>`).join('\n      ')
)

html = html.replaceAll(
  '{{IFS_BULLETS}}',
  input.ifs_bullets.map(b => `<li>${b}</li>`).join('\n        ')
)

html = html.replaceAll(
  '{{ZIFF_BULLETS}}',
  input.ziff_bullets.map(b => `<li>${b}</li>`).join('\n        ')
)

const skills = input.skills ?? DEFAULT_SKILLS
html = html.replaceAll(
  '{{SKILLS}}',
  skills.map(s => `<div class="skill-item"><span class="skill-category">${s.category}:</span> ${s.value}</div>`).join('\n      ')
)

writeFileSync(outputHtml, html)
console.log(`📝 HTML written: output/cv-chase-burns-${company}-${today}.html`)

const format = input.format ?? 'letter'
execSync(`node generate-pdf.mjs "${outputHtml}" "${outputPdf}" --format=${format}`, {
  stdio: 'inherit',
  cwd: __dirname,
})
