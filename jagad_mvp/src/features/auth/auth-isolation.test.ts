import { describe, expect, it } from 'vitest'

/**
 * §11.1, enforced rather than promised — the sign-in half.
 *
 * The route map says `/login` and `/login/2fa` render outside the shell and
 * carry no session at mount. That is a statement about a module graph, so this
 * test reads the module graph: it starts at each screen, follows every STATIC
 * import (a dynamic import is a chunk boundary, which is the whole point), and
 * asserts that nothing which assumes a signed-in user is reachable.
 *
 * The difference between this and the tokenised pages is deliberate and worth
 * stating. `/consent/:token` may never touch the session at all. Sign-in must
 * CREATE one — so the session store, the permission evaluator, the navigation
 * model and the configuration store live in `auth-desk.ts`, one dynamic import
 * away, reached only after credentials have resolved. Mount-time, the screens
 * hold none of them; that is what "carries no session at mount" means and this
 * is what keeps it true.
 *
 * If a later step needs something on these screens, the fix is to reach it
 * through the desk, never to add it to the list below.
 */

const SOURCES = import.meta.glob('/src/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const ENTRIES = [
  '/src/features/auth/SignInScreen.tsx',
  '/src/features/auth/TwoFactorScreen.tsx',
] as const

const DESK = '/src/features/auth/auth-desk.ts'

/** Modules that assume a signed-in user, or drag in the shell that does. */
const FORBIDDEN: readonly string[] = [
  '/src/app/store',
  '/src/app/router.tsx',
  '/src/app/route-screens.tsx',
  '/src/app/RequireAccess.tsx',
  '/src/app/navigation.ts',
  '/src/app/boot.ts',
  '/src/components/AppShell',
  '/src/components/NotificationRail',
  '/src/components/WorkQueue',
  '/src/domain/permissions.ts',
  '/src/features/assistant',
  '/src/features/config',
  DESK,
]

/** `import x from 'y'` / `export … from 'y'` / `import('y')`, minus type-only forms. */
const STATIC_IMPORT = /^\s*(?:import|export)\s+(?!type\s)(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/gm
const BARE_SIDE_EFFECT = /^\s*import\s+['"]([^'"]+)['"]/gm
const DYNAMIC_IMPORT = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g

function matchesOf(source: string, patterns: readonly RegExp[]): readonly string[] {
  const found = new Set<string>()
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) found.add(match[1])
  }
  return [...found]
}

/** Only the imports that fold a module into the importer's own chunk. */
function staticSpecifiersIn(source: string): readonly string[] {
  const dynamic = new Set(matchesOf(source, [DYNAMIC_IMPORT]))
  return matchesOf(source, [STATIC_IMPORT, BARE_SIDE_EFFECT]).filter(
    (specifier) => !dynamic.has(specifier),
  )
}

/** Test files and the harnesses they share are not shipped. */
function isTestSupport(path: string): boolean {
  return path.includes('.test.') || path.includes('test-harness') || path.startsWith('/src/test/')
}

function normalise(path: string): string {
  const parts: string[] = []
  for (const piece of path.split('/')) {
    if (piece === '' || piece === '.') continue
    if (piece === '..') parts.pop()
    else parts.push(piece)
  }
  return `/${parts.join('/')}`
}

/** Resolves a relative specifier the way the bundler does. Bare ones return null. */
function resolve(from: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null
  const directory = from.slice(0, from.lastIndexOf('/'))
  const joined = normalise(`${directory}/${specifier}`)
  const candidates = [
    joined,
    `${joined}.ts`,
    `${joined}.tsx`,
    `${joined}/index.ts`,
    `${joined}/index.tsx`,
  ]
  return candidates.find((candidate) => candidate in SOURCES) ?? null
}

type Graph = { readonly modules: readonly string[]; readonly packages: readonly string[] }

/** Everything the entry folds into its own chunk, dynamic imports excluded. */
function staticallyReachableFrom(entry: string): Graph {
  const seen = new Set<string>([entry])
  const packages = new Set<string>()
  const queue = [entry]

  while (queue.length > 0) {
    const current = queue.shift() as string
    const source = SOURCES[current]
    if (source === undefined) continue

    for (const specifier of staticSpecifiersIn(source)) {
      const resolved = resolve(current, specifier)
      if (resolved === null) {
        if (specifier.startsWith('.')) continue // a stylesheet or an asset
        packages.add(specifier)
        continue
      }
      if (seen.has(resolved)) continue
      seen.add(resolved)
      queue.push(resolved)
    }
  }

  return { modules: [...seen], packages: [...packages] }
}

describe('the sign-in screens carry no session at mount', () => {
  it('are reachable in the source glob at all (the walk would pass vacuously otherwise)', () => {
    for (const entry of ENTRIES) expect(SOURCES[entry]).toBeTypeOf('string')
    expect(SOURCES[DESK]).toBeTypeOf('string')
    expect(Object.keys(SOURCES).length).toBeGreaterThan(50)
  })

  it.each(ENTRIES)('%s statically reaches nothing that assumes a signed-in user', (entry) => {
    const { modules } = staticallyReachableFrom(entry)

    // The walk found real code, so an empty result cannot pass for a clean one.
    expect(modules.length).toBeGreaterThan(10)
    expect(modules).toContain('/src/features/auth/AuthFrame.tsx')

    const breaches = modules.filter((module) =>
      FORBIDDEN.some((forbidden) => module === forbidden || module.startsWith(`${forbidden}/`)),
    )
    expect(breaches, `${entry} reached the authenticated side of the app at mount`).toEqual([])
  })

  it.each(ENTRIES)('%s holds no state library, because it holds no session yet', (entry) => {
    expect(staticallyReachableFrom(entry).packages).not.toContain('zustand')
  })

  it('reaches the session, the evaluator and the policy only through the desk', () => {
    for (const entry of ENTRIES) {
      expect(SOURCES[entry]).toMatch(/await import\('\.\/auth-desk'\)|import\('\.\/auth-desk'\)/)
    }

    // The desk is where the authenticated world is allowed to be, and it must
    // actually hold it — otherwise this whole test is guarding an empty room.
    const desk = SOURCES[DESK]
    expect(desk).toContain("from '../../app/store'")
    expect(desk).toContain("from '../../app/navigation'")
    expect(desk).toContain("from '../config/shared/config-store'")
  })

  it('is pulled in by a dynamic import and nothing else', () => {
    expect(SOURCES['/src/features/auth/routes.ts']).toMatch(
      /lazy\(\(\)\s*=>\s*import\('\.\/SignInScreen'\)\)/,
    )
    expect(SOURCES['/src/features/auth/routes.ts']).toMatch(
      /lazy\(\(\)\s*=>\s*import\('\.\/TwoFactorScreen'\)\)/,
    )

    const statically = Object.entries(SOURCES).filter(([path, source]) => {
      if (ENTRIES.some((entry) => entry === path) || isTestSupport(path)) return false
      return staticSpecifiersIn(source).some((specifier) =>
        ENTRIES.some((entry) => resolve(path, specifier) === entry),
      )
    })
    expect(statically.map(([path]) => path)).toEqual([])
  })
})
