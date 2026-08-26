import { describe, expect, it } from 'vitest'
import plan from '../../documents/IMPLEMENTATION_PLAN.md?raw'
import { LAYOUTS, ROUTE_MAP } from './route-map'
import { PHASES } from '../components/PlannedScreen/phase'
import { RESOURCES } from '../domain/permissions'

/**
 * The plan is the spec, so the plan is the fixture.
 *
 * §4 is a fenced block of route lines; this test reads it out of the document
 * and asserts that every path it names is registered. That makes the route map
 * unable to fall behind the spec silently — if someone adds a screen to §4 and
 * not to the router, this test says so, and if someone deletes a route from the
 * router the same test catches it.
 */
function routesFromPlan(markdown: string): string[] {
  const section = markdown.slice(markdown.indexOf('## 4. Route map'))
  const fenceStart = section.indexOf('```')
  const fenceEnd = section.indexOf('```', fenceStart + 3)
  const block = section.slice(fenceStart + 3, fenceEnd)

  const paths = new Set<string>()

  for (const line of block.split('\n')) {
    // Everything up to the phase tag or the redirect arrow is the path column.
    const head = line.split(/\[(?:M0|P1|P2|P3)\]|→/)[0]
    for (const token of head.split('·')) {
      const path = token.trim()
      if (path.startsWith('/')) paths.add(path)
    }
  }

  return [...paths]
}

const PLAN_ROUTES = routesFromPlan(plan)
const REGISTERED = new Set(ROUTE_MAP.map((route) => route.path))

describe('§4 route map', () => {
  it('finds the route block in the plan', () => {
    // A parse that silently found nothing would make every assertion below vacuous.
    expect(PLAN_ROUTES.length).toBeGreaterThan(50)
    expect(PLAN_ROUTES).toContain('/assistant')
    expect(PLAN_ROUTES).toContain('/config/agencies')
  })

  it('registers every path §4 names', () => {
    // "/" is the redirect, handled by the shell's index route rather than a spec.
    const missing = PLAN_ROUTES.filter((path) => path !== '/' && !REGISTERED.has(path))
    expect(missing).toEqual([])
  })

  it('registers every M0 route in §4', () => {
    const m0 = ROUTE_MAP.filter((route) => route.phase === 'M0')
    expect(m0.length).toBeGreaterThan(20)
    for (const route of m0) expect(REGISTERED.has(route.path)).toBe(true)
  })

  it('registers each path exactly once', () => {
    expect(REGISTERED.size).toBe(ROUTE_MAP.length)
  })
})

describe('route metadata', () => {
  it('names a real permission resource or none at all', () => {
    for (const route of ROUTE_MAP) {
      if (route.resource === null) continue
      expect(RESOURCES).toContain(route.resource)
    }
  })

  it('uses only known phases and layouts', () => {
    for (const route of ROUTE_MAP) {
      expect(PHASES).toContain(route.phase)
      expect(LAYOUTS).toContain(route.layout)
    }
  })

  it('keeps the tokenised pages out of the shell and out of the session', () => {
    for (const path of ['/consent/:token', '/upload/:token']) {
      const route = ROUTE_MAP.find((candidate) => candidate.path === path)
      expect(route?.layout).toBe('bare')
      expect(route?.resource).toBeNull()
    }
  })

  it('keeps the customer portal on its own shell', () => {
    for (const route of ROUTE_MAP.filter((candidate) => candidate.path.startsWith('/portal'))) {
      expect(route.layout).toBe('portal')
      expect(route.resource).toBeNull()
    }
  })

  it('guards every screen that renders inside the shell', () => {
    for (const route of ROUTE_MAP.filter((candidate) => candidate.layout === 'app')) {
      expect(route.resource, `${route.path} has no permission key`).not.toBeNull()
    }
  })
})
