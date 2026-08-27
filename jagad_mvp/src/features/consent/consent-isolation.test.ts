import { describe, expect, it } from 'vitest'

/**
 * §11.1, enforced rather than promised.
 *
 * > "Two routes carry no session. `/consent/:token` and `/upload/:token` are
 * > tokenised, expiring and login-free by design. Code-split them out of the
 * > authenticated bundle; they must not import the app shell, the permission
 * > store, or anything assuming a user."
 *
 * That is a statement about a module graph, so this test reads the module graph.
 * Vite's `?raw` glob hands every source file in the project to the test as text;
 * the walk below starts at the consent screen, follows every RUNTIME import
 * (type-only imports are erased at build time and cannot pull a chunk in), and
 * asserts that nothing forbidden is reachable.
 *
 * It also asserts the other half, which is what makes the chunk separate rather
 * than merely clean: no module on the authenticated side statically imports the
 * consent screen. The only route to it is `lazy(() => import(...))` in
 * `routes.ts`, and a dynamic import is a chunk boundary the bundler enforces.
 *
 * If a later step needs something on this page, the fix is to make that thing
 * session-free, never to add it to the list below.
 */

const SOURCES = import.meta.glob('/src/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const ENTRY = '/src/features/consent/ConsentTokenScreen.tsx'

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
  '/src/features/inquiries',
  '/src/features/kyc/KycFile.tsx',
  '/src/features/kyc/KycQueueScreen.tsx',
  '/src/features/kyc/index.ts',
  '/src/features/customers/Customer360Screen.tsx',
  '/src/features/customers/CustomerListScreen.tsx',
  '/src/features/customers/index.ts',
]

/** Bare packages that only a signed-in surface has any business holding. */
const FORBIDDEN_PACKAGES: readonly string[] = ['zustand']

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

/** Everything the module pulls in at runtime, dynamic imports included. */
function specifiersIn(source: string): readonly string[] {
  return matchesOf(source, [STATIC_IMPORT, BARE_SIDE_EFFECT, DYNAMIC_IMPORT])
}

/** Only the imports that would fold a module into the importer's own chunk. */
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
  const candidates = [joined, `${joined}.ts`, `${joined}.tsx`, `${joined}/index.ts`, `${joined}/index.tsx`]
  return candidates.find((candidate) => candidate in SOURCES) ?? null
}

type Graph = { readonly modules: readonly string[]; readonly packages: readonly string[] }

function reachableFrom(entry: string): Graph {
  const seen = new Set<string>([entry])
  const packages = new Set<string>()
  const queue = [entry]

  while (queue.length > 0) {
    const current = queue.shift() as string
    const source = SOURCES[current]
    if (source === undefined) continue

    for (const specifier of specifiersIn(source)) {
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

describe('the consent page is a chunk of its own, and it carries no session', () => {
  it('is reachable in the source glob at all (the walk would pass vacuously otherwise)', () => {
    expect(SOURCES[ENTRY]).toBeTypeOf('string')
    expect(Object.keys(SOURCES).length).toBeGreaterThan(50)
  })

  it('reaches nothing that assumes a signed-in user', () => {
    const { modules } = reachableFrom(ENTRY)

    // The walk found real code, so an empty result cannot pass for a clean one.
    expect(modules.length).toBeGreaterThan(10)
    expect(modules).toContain('/src/features/customers/data/customer-desk.ts')

    const breaches = modules.filter((module) =>
      FORBIDDEN.some((forbidden) => module === forbidden || module.startsWith(`${forbidden}/`)),
    )
    expect(breaches, 'the consent page reached the authenticated side of the app').toEqual([])
  })

  it('holds no state library, because it holds no session to keep', () => {
    const { packages } = reachableFrom(ENTRY)
    expect(packages.filter((name) => FORBIDDEN_PACKAGES.includes(name))).toEqual([])
  })

  it('is pulled in by a dynamic import and nothing else', () => {
    expect(SOURCES['/src/features/consent/routes.ts']).toMatch(
      /lazy\(\(\)\s*=>\s*import\('\.\/ConsentTokenScreen'\)\)/,
    )

    // Anything that imported the screen statically would fold it back into the
    // authenticated bundle. Tests are allowed to: they are not shipped.
    const statically = Object.entries(SOURCES).filter(([path, source]) => {
      if (path === ENTRY || isTestSupport(path)) return false
      return staticSpecifiersIn(source).some((specifier) => resolve(path, specifier) === ENTRY)
    })
    expect(statically.map(([path]) => path)).toEqual([])
  })
})
