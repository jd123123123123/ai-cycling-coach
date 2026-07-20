#!/usr/bin/env node
/**
 * check-hardcoded-strings.mjs — heuristic i18n lint (audit P1-6).
 *
 * Scans src/**\/*.tsx for hardcoded English UI literals that would leak into
 * the German UI: common EN words (day/month names, 'Add', 'Best', 'unknown',
 * 'Start', 'Loading', …) appearing inside string literals or JSX text.
 *
 * Heuristics to keep the signal usable:
 *  - Lines that reference the locale machinery (`de ?`, `locale`, `isDe`,
 *    `useT(`/`t('…')`) are treated as already-localized branches and skipped.
 *  - Comments, imports, types, and test files are skipped.
 *  - i18n/strings.ts is the dictionary itself and is excluded.
 *
 * Legit remaining cases live in scripts/i18n-allowlist.json as
 * "relative/path.tsx::Word" entries. A finding NOT in the allowlist fails the
 * run (exit 1) so new hardcoded English cannot land silently.
 *
 * Usage: npm run lint:i18n
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = path.join(ROOT, 'src')
const ALLOWLIST_PATH = path.join(ROOT, 'scripts', 'i18n-allowlist.json')

// Case-sensitive suspicious words. Deliberately conservative — day/month
// names, and the specific chrome words the audit called out. ('May'/'March'
// are omitted: too many false positives.)
const WORDS = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
  'January', 'February', 'April', 'June', 'July', 'August',
  'September', 'October', 'November', 'December',
  'Yesterday', 'Tomorrow',
  'Add', 'Best', 'unknown', 'Start', 'Loading',
]
const WORD_RE = new RegExp(`(?<![A-Za-z])(${WORDS.join('|')})(?![a-z])`)

// String literals ('…', "…", `…`) and JSX text nodes (>…<).
const STRING_RE = /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g
const JSX_TEXT_RE = />([^<>{}\n]*[A-Za-z][^<>{}\n]*)</g

// Lines referencing locale machinery are localized branches — not findings.
// Checked with a small lookback window so the EN branch of a multi-line
// `de ? '…de…' : '…en…'` ternary is recognized as localized too.
const LOCALIZED_LINE_RE = /\bde\s*[?)]|\(\s*de\b|\bde\s*$|\blocale\b|\bisDe\b|\buseT\b|\bt\(\s*'|\btFor\b|\bT\(/
const LOOKBACK_LINES = 3
// Non-UI lines: imports, type/interface decls, console, ids/keys.
const NON_UI_LINE_RE = /^\s*(import\b|export\s+type\b|type\s+\w+\s*=|interface\b|\/\/|\/?\*|console\.)/

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) {
      if (name === '__tests__' || name === 'node_modules') continue
      yield* walk(p)
    } else if (
      p.endsWith('.tsx') &&
      !p.endsWith('.test.tsx') &&
      !p.includes(`${path.sep}i18n${path.sep}`)
    ) {
      yield p
    }
  }
}

function findingsForFile(file) {
  const rel = path.relative(ROOT, file)
  const out = []
  const lines = readFileSync(file, 'utf8').split('\n')
  let inBlockComment = false
  lines.forEach((line, i) => {
    // Track /* … */ (incl. JSX {/* … */}) block comments across lines.
    const wasInComment = inBlockComment
    const opens = (line.match(/\/\*/g) ?? []).length
    const closes = (line.match(/\*\//g) ?? []).length
    if (opens > closes) inBlockComment = true
    else if (closes > 0) inBlockComment = false
    if (wasInComment || (opens > 0 && closes >= opens && line.trim().startsWith('{/*'))) return
    if (opens > 0 && !line.slice(0, line.indexOf('/*')).trim()) return

    if (NON_UI_LINE_RE.test(line)) return
    for (let back = 0; back <= LOOKBACK_LINES; back++) {
      if (i - back >= 0 && LOCALIZED_LINE_RE.test(lines[i - back])) return
    }
    const candidates = []
    for (const m of line.matchAll(STRING_RE)) candidates.push(m[0])
    for (const m of line.matchAll(JSX_TEXT_RE)) candidates.push(m[1])
    for (const text of candidates) {
      const hit = WORD_RE.exec(text)
      if (hit) out.push({ file: rel, line: i + 1, word: hit[1], text: text.trim().slice(0, 80) })
    }
  })
  return out
}

let allowlist = []
try {
  allowlist = JSON.parse(readFileSync(ALLOWLIST_PATH, 'utf8'))
} catch {
  allowlist = []
}
const allowed = new Set(allowlist)

const all = []
for (const file of walk(SRC)) all.push(...findingsForFile(file))

const keyOf = (f) => `${f.file.replace(/\\/g, '/')}::${f.word}`
const violations = all.filter((f) => !allowed.has(keyOf(f)))
const usedKeys = new Set(all.map(keyOf))
const staleAllow = allowlist.filter((k) => !usedKeys.has(k))

if (violations.length > 0) {
  console.error(`\n✗ lint:i18n — ${violations.length} suspicious hardcoded EN literal(s):\n`)
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  [${v.word}]  ${v.text}`)
  }
  console.error(
    '\nFix: route the string through i18n/strings.ts (useT/useLocale) or a\n' +
    'locale-aware date helper (utils/format.ts formatDate/formatTime24).\n' +
    `Genuinely legit? Add "path.tsx::Word" to ${path.relative(ROOT, ALLOWLIST_PATH)}.\n`,
  )
  process.exit(1)
}

console.log(`✓ lint:i18n — no new hardcoded EN literals (${all.length} allowlisted, ${allowlist.length} allowlist entries).`)
if (staleAllow.length > 0) {
  console.log(`  note: ${staleAllow.length} allowlist entr${staleAllow.length === 1 ? 'y' : 'ies'} no longer match anything and can be pruned:`)
  for (const k of staleAllow) console.log(`    ${k}`)
}
