/**
 * Provenance, checked against the facade it claims to describe — FR-22.11.
 *
 * A provenance line is only worth printing if it is derived from what actually
 * happened. Two failures would make it worthless and both are checked here:
 * a read the recorder does not attribute (the answer under-reports what it
 * touched), and a source the recorder names that was never read (the answer
 * over-reports, which is the same lie in the other direction).
 *
 * The third check is that wrapping changes nothing. A recorder that altered a
 * projection on its way past would be a hole in the boundary wearing an audit
 * feature's clothes.
 */

import { describe, expect, it } from 'vitest'

import { STARTER_TEMPLATES } from '../../domain/permissions'
import type { User } from '../../domain/permissions'
import { NO_LATENCY, createMockRepositories, rowsOf } from '../mock'
import { ASSISTANT_ALLOW } from './projection'
import type { AssistantEntityName } from './projection'
import {
  ASSISTANT_SOURCES,
  ASSISTANT_SOURCE_KEYS,
  SOURCE_OF_READ,
  describeSources,
  recordingRepository,
  sourceEntities,
  sourceLabel,
} from './provenance'
import type { AssistantSourceKey } from './provenance'
import { createAssistantRepository } from './repository'

const admin: User = {
  id: 'usr-admin',
  name: 'admin',
  templateKey: 'admin',
  template: STARTER_TEMPLATES.admin,
}

function build() {
  const repos = createMockRepositories({ latency: NO_LATENCY })
  return { repos, assistant: createAssistantRepository(repos, admin) }
}

/* ------------------------------------------------- the sources are real */

describe('a source names projections that exist', () => {
  it.each(ASSISTANT_SOURCE_KEYS)('%s names only allow-listed projections', (key) => {
    const allowed = Object.keys(ASSISTANT_ALLOW) as AssistantEntityName[]

    for (const entity of sourceEntities(key)) {
      expect(allowed).toContain(entity)
    }
  })

  it('claims each projection under one source only', () => {
    const seen = new Map<string, AssistantSourceKey>()

    for (const key of ASSISTANT_SOURCE_KEYS) {
      for (const entity of sourceEntities(key)) {
        expect(seen.get(entity), `${entity} is claimed twice`).toBeUndefined()
        seen.set(entity, key)
      }
    }
  })

  it('reads as a sentence a person could be shown', () => {
    expect(describeSources([])).toBe('')
    expect(describeSources(['renewals'])).toBe('the renewal pool')
    expect(describeSources(['renewals', 'inquiries'])).toBe(
      'the renewal pool and the inquiry queue',
    )
    expect(describeSources(['renewals', 'inquiries', 'claims'])).toBe(
      'the renewal pool, the inquiry queue and the claim register',
    )
  })

  it('names every source in words rather than in field names', () => {
    for (const key of ASSISTANT_SOURCE_KEYS) {
      expect(sourceLabel(key).length).toBeGreaterThan(0)
      expect(sourceLabel(key)).toMatch(/^[a-z]/)
    }
  })
})

/* ------------------------------------------------ nothing reads unattributed */

describe('every read on the facade is attributed', () => {
  it('leaves no callable method without a source', () => {
    const { assistant } = build()
    const callable = Object.keys(assistant).filter(
      (key) => typeof (assistant as unknown as Record<string, unknown>)[key] === 'function',
    )

    expect(callable.length).toBeGreaterThan(20)

    for (const method of callable) {
      expect(Object.hasOwn(SOURCE_OF_READ, method), `${method} reads from nowhere`).toBe(true)
    }
  })

  it('attributes nothing the facade does not have', () => {
    const { assistant } = build()

    for (const method of Object.keys(SOURCE_OF_READ)) {
      expect(Object.hasOwn(assistant, method), `${method} is not on the facade`).toBe(true)
    }
  })

  it('points every method at a source this file defines', () => {
    for (const key of Object.values(SOURCE_OF_READ)) {
      expect(Object.hasOwn(ASSISTANT_SOURCES, key)).toBe(true)
    }
  })
})

/* --------------------------------------------------------- the recording */

describe('the recorder reports what was read, and only that', () => {
  it('records nothing before anything is asked', () => {
    const { assistant } = build()
    expect(recordingRepository(assistant).sourcesRead()).toEqual([])
  })

  it('names the queue an answer actually read', async () => {
    const { assistant } = build()
    const recorder = recordingRepository(assistant)

    await recorder.repo.inquiries()

    expect(recorder.sourcesRead()).toEqual(['inquiries'])
  })

  it('names several, in the order they were read', async () => {
    const { assistant } = build()
    const recorder = recordingRepository(assistant)

    await recorder.repo.renewals()
    await recorder.repo.inquiries()
    // A second read of the same queue is the same source, not a second entry.
    await recorder.repo.inquiry('inq-nobody')

    expect(recorder.sourcesRead()).toEqual(['renewals', 'inquiries'])
    expect(describeSources(recorder.sourcesRead())).toBe(
      'the renewal pool and the inquiry queue',
    )
  })

  it('does not credit a source nobody read', async () => {
    const { assistant } = build()
    const recorder = recordingRepository(assistant)

    await recorder.repo.tasks()

    expect(recorder.sourcesRead()).not.toContain('claims')
    expect(recorder.sourcesRead()).not.toContain('customers')
  })

  it('keeps two answers apart', async () => {
    const { assistant } = build()
    const first = recordingRepository(assistant)
    const second = recordingRepository(assistant)

    await first.repo.claims()

    expect(first.sourcesRead()).toEqual(['claims'])
    expect(second.sourcesRead()).toEqual([])
  })
})

/* ------------------------------------------------ wrapping changes nothing */

describe('the recorder is transparent', () => {
  it('returns the projection the facade returned, field for field', async () => {
    const { assistant } = build()
    const recorder = recordingRepository(assistant)

    const direct = await assistant.customers({ pageSize: 5 })
    const recorded = await recorder.repo.customers({ pageSize: 5 })

    expect(recorded).toEqual(direct)
    expect(Object.keys(recorded.rows[0])).toEqual(Object.keys(direct.rows[0]))
  })

  it('adds no field a projection did not have', async () => {
    const { repos, assistant } = build()
    const recorder = recordingRepository(assistant)

    const source = rowsOf(repos.store.tables.customers).find((row) => row.aadhaarLast4 !== null)
    expect(source).toBeDefined()

    const view = await recorder.repo.customer(source!.id)
    expect(view).not.toBeNull()

    const keys = Object.keys(view!)
    expect(keys).not.toContain('aadhaarLast4')
    expect(keys).not.toContain('panNumber')
    expect(keys).toEqual(Object.keys((await assistant.customer(source!.id))!))
  })

  it('carries the non-method properties through untouched', () => {
    const { assistant } = build()
    const recorder = recordingRepository(assistant)

    expect(recorder.repo.user.id).toBe(assistant.user.id)
    expect(recorder.repo.enabled).toBe(assistant.enabled)
  })

  it('grants nothing an unenabled account did not have', async () => {
    const repos = createMockRepositories({ latency: NO_LATENCY })
    const subAgent = createAssistantRepository(repos, {
      id: 'usr-sub',
      name: 'sub',
      templateKey: 'subAgent',
      template: STARTER_TEMPLATES.subAgent,
    })
    const recorder = recordingRepository(subAgent)

    expect(recorder.repo.enabled).toBe(false)
    expect((await recorder.repo.inquiries()).total).toBe(0)
    // It still records the attempt: the query ran, and read nothing.
    expect(recorder.sourcesRead()).toEqual(['inquiries'])
  })
})
