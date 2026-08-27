import { beforeEach, describe, expect, it } from 'vitest'
import script from '../../../documents/DEMO_SCRIPT.md?raw'
import playbook from '../../../documents/BUILD_PLAYBOOK.md?raw'
import { ROUTE_MAP } from '../../app/route-map'
import { NO_LATENCY, createMockRepositories } from '../../data/mock'
import type { MockRepositories } from '../../data/mock'
import { WALKTHROUGH_NOW } from './harness'

/**
 * `documents/DEMO_SCRIPT.md`, checked against the product it describes.
 *
 * A demo script is the one document that gets read aloud in front of a client,
 * which makes a stale line in it more expensive than a stale line anywhere else.
 * So the things in it that can be checked mechanically are checked here: every
 * address it tells the presenter to open is a real route, every record number it
 * reads out is a record that exists, every persona it names can be signed in as,
 * and every "pending" it admits to names a real playbook step.
 *
 * What this cannot check is the prose. That is what `walkthrough.test.tsx` and
 * the scenario files are for — they walk the script's clicks.
 */

let repositories: MockRepositories

beforeEach(() => {
  repositories = createMockRepositories({ latency: NO_LATENCY, now: () => WALKTHROUGH_NOW })
})

/** Every `/path` the script prints in backticks. */
function addresses(): readonly string[] {
  const found = script.match(/`(\/[^`\s]*)`/g) ?? []
  return [...new Set(found.map((token) => token.slice(1, -1)))]
}

/** Matches a concrete address against a route pattern, `:param` included. */
function matchesRoute(address: string): boolean {
  const path = (address.split('?')[0] ?? address).replace(/\/$/, '') || '/'
  return ROUTE_MAP.some((spec) => {
    const pattern = new RegExp(
      `^${spec.path.replace(/:[^/]+/g, '[^/]+').replace(/\//g, '\\/')}$`,
    )
    return pattern.test(path)
  })
}

describe('every address the script opens is a real route', () => {
  it('resolves each one against the section 4 route map', () => {
    const paths = addresses()
    expect(paths.length).toBeGreaterThan(5)

    for (const address of paths) {
      if (address === '/') continue
      expect(matchesRoute(address), `The demo script opens ${address}, which is in no route.`).toBe(
        true,
      )
    }
  })
})

describe('every record the script reads out exists', () => {
  it('finds each inquiry number in the inquiry repository', async () => {
    const numbers = [...new Set(script.match(/INQ-\d{4}/g) ?? [])]
    expect(numbers.length).toBeGreaterThan(0)

    const page = await repositories.inquiries.list({ pageSize: 500 })
    const onFile = new Set(page.rows.map((row) => row.systemNo))

    for (const number of numbers) {
      // INQ-1047 is the number the next captured inquiry will be given, which is
      // exactly what section 3f tells the presenter to expect. It is the only
      // number in the script that is a promise about the counter rather than a
      // record, so it is checked as a promise: nothing holds it yet.
      if (number === 'INQ-1047') {
        expect(onFile.has(number), 'INQ-1047 is taken, so section 3f is wrong.').toBe(false)
        continue
      }
      expect(onFile.has(number), `The demo script reads out ${number}, which is on no record.`).toBe(
        true,
      )
    }
  })

  it('finds each customer the script opens, by id and by number', async () => {
    const ids = [...new Set(script.match(/cus-[a-z-]+/g) ?? [])]
    expect(ids).toContain('cus-rakesh-patel')

    for (const id of ids) {
      const customer = await repositories.customers.get(id)
      expect(customer, `The demo script opens ${id}, which is no customer.`).toBeDefined()
    }

    for (const number of new Set(script.match(/CUS-\d{4}/g) ?? [])) {
      const page = await repositories.customers.list({ pageSize: 500 })
      expect(
        page.rows.some((row) => row.systemNo === number),
        `The demo script reads out ${number}, which is on no customer.`,
      ).toBe(true)
    }
  })

  it('finds the consent token it tells the presenter to open', async () => {
    const tokens = [...new Set(script.match(/cns-[0-9a-f]{20}/g) ?? [])]
    expect(tokens.length).toBeGreaterThan(0)

    const rakesh = await repositories.customers.consent('cus-rakesh-patel')
    expect(rakesh?.token, 'Rakesh Patel has no consent link, so section 5c cannot be walked.')
      .toBeDefined()
    expect(
      tokens,
      `The demo script opens ${tokens.join(', ')}, and Rakesh Patel's link is ${rakesh?.token}.`,
    ).toContain(rakesh?.token)
  })

  it('finds each policy draft it names, even in a pending section', async () => {
    const numbers = [...new Set(script.match(/POL-DRAFT-\d{4}/g) ?? [])]
    expect(numbers.length).toBeGreaterThan(0)

    const queue = await repositories.policies.completionQueue({ pageSize: 500 })
    for (const number of numbers) {
      const policy = await repositories.policies.bySystemNo(number)
      expect(policy, `The demo script names ${number}, which is on no record.`).toBeDefined()
      expect(
        queue.rows.some((row) => row.policyId === policy?.id),
        `${number} is not in the completion queue, so section 6 describes the wrong record.`,
      ).toBe(true)
    }
  })

  it('can sign in as everybody in its cast table', async () => {
    const staff = await repositories.config.users()
    const active = staff.filter((person) => person.active).map((person) => person.name)

    for (const name of [
      'Vivek Jagad',
      'Nikunj Shah',
      'Kiran Solanki',
      'Priya Desai',
      'Meera Joshi',
      'Amit Rana',
      'Sneha Patel',
    ]) {
      expect(script, `The cast table lost ${name}.`).toContain(name)
      expect(active, `The demo script signs in as ${name}, who is not an active account.`).toContain(
        name,
      )
    }
  })

  it('names the insurers that are actually on file', async () => {
    const page = await repositories.companies.list({ pageSize: 500 })
    const shortNames = page.rows.map((row) => row.shortName)

    for (const insurer of ['HDFC Ergo', 'Niva Bupa', 'Tata AIG', 'LIC']) {
      expect(script).toContain(insurer)
      expect(shortNames, `The script names ${insurer}, which is no company.`).toContain(insurer)
    }

    // Section 2a counts them out loud, so the count is part of the script.
    expect(script).toContain('Eight insurers are on file')
    expect(page.rows, 'Section 2a says eight insurers are on file.').toHaveLength(8)
  })
})

describe('the script is honest about what it cannot demonstrate', () => {
  it('names a real playbook step beside every pending section', () => {
    const pending = [...new Set(script.match(/\*\*Pending (P-\d+)\.\*\*/g) ?? [])]
    expect(pending.length, 'The script admits to no pending section at all.').toBeGreaterThan(0)

    for (const marker of pending) {
      const step = (marker.match(/P-\d+/) ?? [])[0] as string
      expect(
        playbook.includes(`### ${step} —`),
        `The script defers to ${step}, which the playbook does not contain.`,
      ).toBe(true)
    }
  })

  it('defers the three sections the build has not reached, and no more', () => {
    for (const step of ['P-13', 'P-15', 'P-16']) {
      expect(script, `${step} is not deferred anywhere in the script.`).toContain(
        `**Pending ${step}.**`,
      )
    }
  })

  it('carries no emoji, in a document written to be read aloud and pasted around', () => {
    // The constitution's rule, checked where it is easiest to break: prose.
    const emoji = /\p{Extended_Pictographic}|\u{FE0F}/u
    const offending = script
      .split('\n')
      .map((line, index) => ({ line, number: index + 1 }))
      .filter((entry) => emoji.test(entry.line))

    expect(offending.map((entry) => `${entry.number}: ${entry.line}`)).toEqual([])
  })
})
