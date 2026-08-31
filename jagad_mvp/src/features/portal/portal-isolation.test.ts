import { describe, expect, it } from 'vitest'

/**
 * §11.1 and decision D-I, enforced rather than promised.
 *
 * > "The customer portal is a separate shell. It is registered outside the app
 * > shell; it must not import the app shell, the permission store, or anything
 * > assuming a staff user."
 *
 * That is a statement about a module graph, so this test reads the module graph.
 * Vite's `?raw` glob hands every source file to the test as text; the walk below
 * starts at each of the portal's six route entries, follows every RUNTIME import
 * (type-only imports are erased at build time and cannot pull a chunk in), and
 * asserts that nothing forbidden is reachable.
 *
 * It also asserts the other half, which is what makes the chunk separate rather
 * than merely clean: no module on the authenticated side statically imports a
 * portal screen. The only route in is `lazy(() => import(...))` in `routes.ts`,
 * and a dynamic import is a chunk boundary the bundler enforces.
 *
 * If a later step needs something on these pages, the fix is to make that thing
 * session-free, never to add it to the list below. The portal is the customer's
 * view; it is not the staff view with the rail hidden.
 */

const SOURCES = import.meta.glob('/src/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const SHELL = '/src/features/portal/PortalShell.tsx'

/** The six modules `routes.ts` reaches, and the only way into this feature. */
const ENTRIES: readonly string[] = [
  SHELL,
  '/src/features/portal/PortalOverviewScreen.tsx',
  '/src/features/portal/PortalPoliciesScreen.tsx',
  '/src/features/portal/PortalDocumentsScreen.tsx',
  '/src/features/portal/PortalClaimsScreen.tsx',
  '/src/features/portal/PortalClaimNewScreen.tsx',
]

/** Modules that assume a signed-in staff user, or drag in the shell that does. */
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
  '/src/features/kyc/index.ts',
  '/src/features/kyc/KycFile.tsx',
  '/src/features/kyc/KycQueueScreen.tsx',
  '/src/features/customers/index.ts',
  '/src/features/customers/Customer360Screen.tsx',
  '/src/features/customers/CustomerListScreen.tsx',
  '/src/features/claims/index.ts',
  '/src/features/claims/ClaimQueueScreen.tsx',
  '/src/features/claims/ClaimDetailScreen.tsx',
  '/src/features/claims/ClaimIntimationScreen.tsx',
  '/src/features/documents/index.ts',
  '/src/features/documents/DocumentVaultScreen.tsx',
  '/src/features/policies/index.ts',
  '/src/features/renewals/index.ts',
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

function specifiersIn(source: string): readonly string[] {
  return matchesOf(source, [STATIC_IMPORT, BARE_SIDE_EFFECT, DYNAMIC_IMPORT])
}

function staticSpecifiersIn(source: string): readonly string[] {
  const dynamic = new Set(matchesOf(source, [DYNAMIC_IMPORT]))
  return matchesOf(source, [STATIC_IMPORT, BARE_SIDE_EFFECT]).filter(
    (specifier) => !dynamic.has(specifier),
  )
}

/**
 * The code, with its prose removed.
 *
 * The last assertion below searches the screens for field names that must never
 * be rendered, and those same names are discussed at length in the comments
 * explaining why they are not. Stripping block comments and comment lines is
 * what lets the check read the code rather than the essay about it.
 */
function codeOf(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join('\n')
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

function reachableFrom(entries: readonly string[]): Graph {
  const seen = new Set<string>(entries)
  const packages = new Set<string>()
  const queue = [...entries]

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

describe('the customer portal is a shell of its own, and it carries no staff session', () => {
  it('is reachable in the source glob at all (the walk would pass vacuously otherwise)', () => {
    for (const entry of ENTRIES) {
      expect(SOURCES[entry], `${entry} is missing`).toBeTypeOf('string')
    }
    expect(Object.keys(SOURCES).length).toBeGreaterThan(50)
  })

  it('reaches nothing that assumes a signed-in staff user', () => {
    const { modules } = reachableFrom(ENTRIES)

    // The walk found real code, so an empty result cannot pass for a clean one.
    expect(modules.length).toBeGreaterThan(20)
    expect(modules).toContain('/src/features/portal/data/portal-desk.ts')
    expect(modules).toContain('/src/features/claims/data/claim-desk.ts')

    const breaches = modules.filter((module) =>
      FORBIDDEN.some((forbidden) => module === forbidden || module.startsWith(`${forbidden}/`)),
    )
    expect(breaches, 'the portal reached the authenticated side of the app').toEqual([])
  })

  it('holds no state library, because it holds no staff session to keep', () => {
    const { packages } = reachableFrom(ENTRIES)
    expect(packages.filter((name) => FORBIDDEN_PACKAGES.includes(name))).toEqual([])
  })

  it('is pulled in by dynamic imports and nothing else', () => {
    const routes = SOURCES['/src/features/portal/routes.ts'] ?? ''
    for (const entry of ENTRIES) {
      const file = entry.slice(entry.lastIndexOf('/') + 1).replace(/\.tsx$/, '')
      expect(routes, `routes.ts must lazily import ${file}`).toMatch(
        new RegExp(`lazy\\(\\(\\)\\s*=>\\s*import\\('\\./${file}'\\)\\)`),
      )
    }

    // Anything importing a portal screen statically would fold it back into the
    // authenticated bundle. Tests may: they are not shipped.
    const statically = Object.entries(SOURCES).filter(([path, source]) => {
      if (ENTRIES.includes(path) || isTestSupport(path)) return false
      return staticSpecifiersIn(source).some((specifier) => {
        const resolved = resolve(path, specifier)
        return resolved !== null && ENTRIES.includes(resolved)
      })
    })
    expect(statically.map(([path]) => path)).toEqual([])
  })

  it('never renders a full Aadhaar or PAN: no screen calls a masking primitive with a full value', () => {
    // `<MaskedValue>` and `<MaskedField>` have no prop that reveals a value, so
    // the only way a full number could reach the DOM is a screen printing one
    // directly. Nothing in this feature reads those fields except the desk, and
    // the desk hands the view the customer's own record, never a document read.
    const screens = ENTRIES.map((entry) => codeOf(SOURCES[entry] ?? '')).join('\n')
    expect(screens).not.toMatch(/aadhaarNumber/)
    expect(screens).not.toMatch(/extractedText/)
    expect(screens).not.toMatch(/ocrFields/)
    expect(screens).not.toMatch(/diagnosis|healthDeclaration|preExistingConditions/)
  })
})
