import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { RepositoriesProvider } from '../../../app/repositories'
import { NO_LATENCY, createMockRepositories } from '../../../data/mock'
import type { Repositories } from '../../../data/repo'
import { ToastProvider } from '../../../ui/surface'
import { useConfigStore } from '../shared'
import { useFormsStore } from './forms-store'
import { removeField } from './schema-draft'
import FormsScreen from './FormsScreen'

/**
 * The builder's half of the reserved-field rule.
 *
 * The domain already refuses removal three ways — `defineFormSchema` at compile
 * time, `validateFormSchema` at save, `<SchemaForm>` at render. None of those is
 * the layer a person meets. This asserts the fourth refusal, which is the only
 * one an admin ever sees: the option is not offered, and the registry's own
 * sentence says why the platform depends on the field.
 *
 * A field in the builder is a row that opens. What the row itself says — the
 * "Reserved" mark, and the absence of a Remove — is asserted where it is shown;
 * the registry's sentence lives in the panel, so these open it first, which is
 * what a person does before trying to remove anything.
 */

let repositories: Repositories

function openSchema(recordId: string) {
  return render(
    <RepositoriesProvider repositories={repositories}>
      <ToastProvider>
        <MemoryRouter initialEntries={[`/config/forms?record=${recordId}`]}>
          <FormsScreen />
        </MemoryRouter>
      </ToastProvider>
    </RepositoriesProvider>,
  )
}

async function builderFor(name: RegExp): Promise<HTMLElement> {
  return await screen.findByRole('dialog', { name })
}

function fieldRow(scope: HTMLElement, key: string): HTMLElement {
  const row = scope.querySelector(`li[data-field-key="${key}"]`)
  expect(row).not.toBeNull()
  return row as HTMLElement
}

/** Opens a field's panel. The disclosure is the row's name, so that is what we press. */
async function openField(
  user: ReturnType<typeof userEvent.setup>,
  scope: HTMLElement,
  key: string,
): Promise<HTMLElement> {
  const row = fieldRow(scope, key)
  await user.click(within(row).getByRole('button', { expanded: false }))
  return row
}

beforeEach(() => {
  repositories = createMockRepositories({ latency: NO_LATENCY })
  useFormsStore.getState().reset()
  useConfigStore.getState().reset()
})

describe('a reserved field in the builder', () => {
  it('offers no way to remove it, and says what depends on it', async () => {
    const user = userEvent.setup()
    openSchema('frm-inquiry-v1')
    const drawer = await builderFor(/Inquiry · version 1/)

    const mobile = await openField(user, drawer, 'contactMobile')
    expect(within(mobile).getByText('Reserved')).toBeInTheDocument()
    expect(within(mobile).queryByRole('button', { name: 'Remove field' })).toBeNull()

    // The reason is the registry's own, not a paraphrase.
    const note = mobile.querySelector('[data-reserved-note="contactMobile"]')
    expect(note).toHaveTextContent(/WhatsApp and SMS are the channels flow 1 promises/)
    expect(note).toHaveTextContent(/offers no way to remove or rename it/)

    // A field nothing reads by name is removable, so the absence above is a
    // rule rather than the drawer simply having no delete button.
    expect(
      within(await openField(user, drawer, 'contactEmail')).getByRole('button', {
        name: 'Remove field',
      }),
    ).toBeInTheDocument()
  })

  it('will not let its stage be removed either', async () => {
    openSchema('frm-inquiry-v1')
    const drawer = await builderFor(/Inquiry · version 1/)

    const stage = drawer.querySelector('[data-stage-key="contact"]') as HTMLElement
    expect(within(stage).getByRole('button', { name: 'Remove stage' })).toBeDisabled()
    expect(stage.querySelector('[data-stage-refusal="contact"]')).toHaveTextContent(
      /"contactName", "contactMobile", "source"/,
    )
  })

  it('refuses removal in the draft helper too, whatever a screen asks for', () => {
    const stages = [
      {
        key: 'contact',
        label: 'Contact',
        fields: [
          { key: 'contactMobile', label: 'Mobile', kind: 'text' as const, required: true, visibleWhen: null, masterTypeId: null },
          { key: 'contactEmail', label: 'Email', kind: 'text' as const, required: false, visibleWhen: null, masterTypeId: null },
        ],
      },
    ]

    expect(removeField(stages, 'inquiry', 'contact', 'contactMobile')).toBe(stages)
    expect(removeField(stages, 'inquiry', 'contact', 'contactEmail')[0].fields).toHaveLength(1)
  })
})

describe('removing a field that nothing reads by name', () => {
  it('writes nothing until the gate is confirmed', async () => {
    const user = userEvent.setup()
    openSchema('frm-inquiry-v1')
    const drawer = await builderFor(/Inquiry · version 1/)

    await user.click(
      within(await openField(user, drawer, 'contactEmail')).getByRole('button', {
        name: 'Remove field',
      }),
    )

    // The draft changed; the store has not.
    expect(
      useFormsStore
        .getState()
        .schemas.find((schema) => schema.id === 'frm-inquiry-v1')
        ?.stages[0].fields.some((field) => field.key === 'contactEmail'),
    ).toBe(true)

    await user.click(screen.getByRole('button', { name: 'Save this version' }))
    const dialog = await screen.findByRole('dialog', { name: /Save version 1 of Inquiry/ })
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    expect(
      useFormsStore
        .getState()
        .schemas.find((schema) => schema.id === 'frm-inquiry-v1')
        ?.stages[0].fields.some((field) => field.key === 'contactEmail'),
    ).toBe(true)

    await user.click(screen.getByRole('button', { name: 'Save this version' }))
    const again = await screen.findByRole('dialog', { name: /Save version 1 of Inquiry/ })
    await user.click(within(again).getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(
        useFormsStore
          .getState()
          .schemas.find((schema) => schema.id === 'frm-inquiry-v1')
          ?.stages[0].fields.some((field) => field.key === 'contactEmail'),
      ).toBe(false)
    })
  })
})
