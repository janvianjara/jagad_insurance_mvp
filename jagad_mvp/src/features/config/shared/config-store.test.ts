import { beforeEach, describe, expect, it } from 'vitest'
import { NO_LATENCY, createMockRepositories } from '../../../data/mock'
import { STARTER_TEMPLATES } from '../../../domain/permissions'
import type { PermissionTemplate } from '../../../domain/permissions'
import { useConfigStore, valuesOfType } from './config-store'
import { cloneTemplate, starterLibrary, withGrant } from './permission-template'

const repositories = createMockRepositories({ latency: NO_LATENCY })

beforeEach(async () => {
  useConfigStore.getState().reset()
  await useConfigStore.getState().hydrate(repositories.config)
})

describe('the template library clones rather than mutates', () => {
  it('leaves the starter untouched when its clone is edited', () => {
    const before = JSON.stringify(STARTER_TEMPLATES.agent)

    const key = useConfigStore.getState().cloneTemplateFrom('agent')
    expect(key).toBe('agent-copy')

    const clone = useConfigStore
      .getState()
      .templates.find((template) => template.key === key)
    expect(clone?.editable).toBe(true)
    expect(clone?.clonedFrom).toBe('agent')

    useConfigStore.getState().saveTemplate(withGrant(clone!, 'config', 'view', true))

    // The starter is seed data for every agency. Editing a copy must not reach it.
    expect(JSON.stringify(STARTER_TEMPLATES.agent)).toBe(before)
    const agent: PermissionTemplate = STARTER_TEMPLATES.agent
    expect(agent.grants.config).toBeUndefined()
  })

  it('shares no arrays with the starter it was cloned from', () => {
    const starter = starterLibrary().find((template) => template.key === 'agent')!
    const clone = cloneTemplate(starter, [])

    expect(clone.grants.inquiries).not.toBe(starter.grants.inquiries)
    expect(clone.dataClasses).not.toBe(starter.dataClasses)
  })

  it('refuses to save a starter, even when asked directly', () => {
    const starter = useConfigStore
      .getState()
      .templates.find((template) => template.key === 'admin')!

    useConfigStore.getState().saveTemplate({ ...starter, label: 'Renamed by force' })

    expect(
      useConfigStore.getState().templates.find((template) => template.key === 'admin')?.label,
    ).toBe(STARTER_TEMPLATES.admin.label)
  })
})

describe('master values are versioned, and their keys are not', () => {
  function city() {
    const state = useConfigStore.getState()
    const type = state.masterTypes.find((candidate) => candidate.key === 'city')!
    return { state, type }
  }

  it('keeps the stored key when the label is renamed, and records the revision', () => {
    const { state, type } = city()
    const value = valuesOfType(state, type.id).find((candidate) => candidate.key === 'navsari')!

    useConfigStore.getState().renameMasterValue(value.id, 'Navsari city')

    const after = useConfigStore
      .getState()
      .masterValues.find((candidate) => candidate.id === value.id)!

    expect(after.key).toBe('navsari')
    expect(after.label).toBe('Navsari city')
    expect(after.version).toBe(2)
    expect(after.revisions.at(-1)?.note).toContain('Renamed from "Navsari"')
  })

  it('cascades a new master from another, and keeps a value under its parent', () => {
    const makeId = useConfigStore
      .getState()
      .saveMasterType({ label: 'Vehicle make', parentTypeId: null })
    const modelId = useConfigStore
      .getState()
      .saveMasterType({ label: 'Vehicle model', parentTypeId: makeId })

    const make = useConfigStore.getState().addMasterValue({ masterTypeId: makeId, label: 'Maruti' })
    expect(make?.key).toBe('maruti')

    const model = useConfigStore
      .getState()
      .addMasterValue({ masterTypeId: modelId, label: 'Swift', parentValueId: make!.id })

    expect(model?.parentValueId).toBe(make!.id)
    expect(
      useConfigStore.getState().masterTypes.find((type) => type.id === modelId)?.parentTypeId,
    ).toBe(makeId)
  })

  it('refuses a duplicate value rather than creating two rows with one key', () => {
    const { type } = city()
    expect(
      useConfigStore.getState().addMasterValue({ masterTypeId: type.id, label: 'Surat' }),
    ).toBeNull()
  })
})
