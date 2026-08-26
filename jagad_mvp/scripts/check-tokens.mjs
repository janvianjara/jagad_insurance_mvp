#!/usr/bin/env node
/*
 * Design-token gate.
 *
 * A raw hex colour literal is allowed in exactly one place: src/styles/tokens.css.
 * Anywhere else under src/ it is a portability defect — the value stops being
 * themeable, and density/brand changes have to be chased through the codebase.
 *
 * Exits 1 and lists every offender (file:line) when the rule is broken.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const srcRoot = join(repoRoot, 'src')
const allowlist = new Set([join('src', 'styles', 'tokens.css')])

const SCANNED_EXTENSIONS = ['.css', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']
const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (SCANNED_EXTENSIONS.some((ext) => entry.endsWith(ext))) out.push(full)
  }
  return out
}

const offenders = []
for (const file of walk(srcRoot)) {
  const rel = relative(repoRoot, file)
  if (allowlist.has(rel)) continue
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      for (const match of line.matchAll(HEX)) {
        offenders.push(`${rel.split(sep).join('/')}:${i + 1}  ${match[0]}  ${line.trim()}`)
      }
    })
}

if (offenders.length > 0) {
  console.error(
    `check-tokens: ${offenders.length} hex colour literal(s) outside src/styles/tokens.css\n`,
  )
  for (const offender of offenders) console.error(`  ${offender}`)
  console.error('\nMove the value into src/styles/tokens.css and reference it with var(--token).')
  process.exit(1)
}

console.log('check-tokens: no hex colour literals outside src/styles/tokens.css')
