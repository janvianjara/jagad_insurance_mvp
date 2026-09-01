import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { RepositoriesProvider } from '../../../app/repositories'
import { NO_LATENCY, createMockRepositories } from '../../../data/mock'
import type { Repositories } from '../../../data/repo'
import { ToastProvider } from '../../../ui/surface'
import { useConfigStore } from '../shared'
import { useFormsStore } from './forms-store'
import FormsScreen from './FormsScreen'

/**
 * The palette, which is how a field comes into being.
 *
 * Three things are asserted, and they are the three the builder's shape is for:
 * a field arrives on the stage somebody picked rather than always the first; it
 * arrives in the preview at once, so the effect of the change is on screen with
 * the change; and it arrives carrying nothing — an amount added here is an empty
 * amount box, because `newField` has no default to give it and the grammar has
 * nowhere to put one (D3).
 *
 * And nothing is written. The draft is component state until a gate is confirmed,
 * so a person can build a whole stage and walk away having changed no record.
 */

let repositories: Repositories

function renderBuilder(recordId: string) {
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

function stageCard(scope: HTMLElement, key: string): HTMLElement {
  const card = scope.querySelector(`[data-stage-key="${key}"]`)
  expect(card).not.toBeNull()
  return card as HTMLElement
}

function storedKeys(schemaId: string): string[] {
  const schema = useFormsStore.getState().schemas.find((row) => row.id === schemaId)
  return (schema?.stages ?? []).flatMap((stage) => stage.fields.map((field) => field.key))
}

beforeEach(() => {
  repositories = createMockRepositories({ latency: NO_LATENCY })
  useFormsStore.getState().reset()
  useConfigStore.getState().reset()
})

describe('pressing a kind in the palette', () => {
  it('puts a field of that kind on the picked stage, and in the preview', async () => {
    const user = userEvent.setup()
    renderBuilder('frm-inquiry-v1')
    const drawer = await screen.findByRole('dialog', { name: /Inquiry · version 1/ })

    // The first stage is the one the palette points at until somebody says
    // otherwise, and the card says so rather than leaving it to be guessed.
    expect(within(stageCard(drawer, 'contact')).getByText('Adding here')).toBeInTheDocument()

    await user.click(within(drawer).getByRole('button', { name: /^Amount/ }))

    const added = stageCard(drawer, 'contact').querySelector('li[data-field-key="newAmount"]')
    expect(added).not.toBeNull()
    // Opened where it landed, so the next thing somebody does is name it.
    expect(within(added as HTMLElement).getByLabelText('Kind')).toHaveValue('money')

    // On screen in the form itself, one render later — empty, and with no
    // default, no placeholder and no figure of any kind in it.
    const preview = drawer.querySelector('[data-preview]') as HTMLElement
    expect(within(preview).getByLabelText(/New amount/)).toHaveValue('')
  })

  it('lands it on the stage somebody picked, not always the first', async () => {
    const user = userEvent.setup()
    renderBuilder('frm-inquiry-v1')
    const drawer = await screen.findByRole('dialog', { name: /Inquiry · version 1/ })

    // A stage somebody just made is the stage they are working on, so adding one
    // points the palette at it without a second click.
    await user.type(within(drawer).getByLabelText('New stage'), 'Vehicle')
    await user.click(within(drawer).getByRole('button', { name: 'Add stage' }))
    await user.click(within(drawer).getByRole('button', { name: /^Long text/ }))

    expect(stageCard(drawer, 'vehicle').querySelector('li[data-field-key="newLongText"]')).not.toBeNull()
    expect(stageCard(drawer, 'contact').querySelector('li[data-field-key="newLongText"]')).toBeNull()

    // And picking another stage moves the target back.
    await user.click(within(stageCard(drawer, 'contact')).getByRole('button', { name: /^Contact/ }))
    await user.click(within(drawer).getByRole('button', { name: /^Number/ }))

    expect(stageCard(drawer, 'contact').querySelector('li[data-field-key="newNumber"]')).not.toBeNull()
    expect(stageCard(drawer, 'vehicle').querySelector('li[data-field-key="newNumber"]')).toBeNull()
  })

  it('writes nothing to the catalogue until a gate is confirmed', async () => {
    const user = userEvent.setup()
    renderBuilder('frm-inquiry-v1')
    const drawer = await screen.findByRole('dialog', { name: /Inquiry · version 1/ })

    await user.click(within(drawer).getByRole('button', { name: /^Date/ }))
    expect(drawer.querySelector('li[data-field-key="newDate"]')).not.toBeNull()
    expect(storedKeys('frm-inquiry-v1')).not.toContain('newDate')

    await user.click(screen.getByRole('button', { name: 'Save this version' }))
    const dialog = await screen.findByRole('dialog', { name: /Save version 1 of Inquiry/ })
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    expect(storedKeys('frm-inquiry-v1')).not.toContain('newDate')
  })
})
