import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { IconSprite } from '../../../ui/Icon'
import { BlockRenderer } from './BlockRenderer'
import { textCell } from './blocks'
import type { ActBlock, Block, ChoiceBlock, FileBlock, StopBlock } from './blocks'

/**
 * The four blocks that do something, and the promises they make.
 *
 * These are not rendering tests. Each one asserts a boundary the product states
 * out loud somewhere a customer can read it, and the only reason they are in
 * this file rather than in prose is that a promise nobody checks stops being
 * true on a Tuesday six months from now.
 */

function draw(blocks: readonly Block[], onOpenDocument?: (id: string) => void) {
  return render(
    <MemoryRouter>
      <IconSprite />
      <BlockRenderer blocks={blocks} {...(onOpenDocument ? { onOpenDocument } : {})} />
    </MemoryRouter>,
  )
}

const ACT: ActBlock = {
  kind: 'act',
  title: 'Route 2 inquiries',
  tag: 'Routing',
  items: [
    { key: 'a', label: 'INQ-1041', value: textCell('Health · came in through website') },
    { key: 'b', label: 'INQ-1042', value: textCell('Motor · came in through reference') },
  ],
  hint: 'Change any one of them on the queue screen before it goes out.',
  confirmLabel: 'Take these to the queue',
  receipt: '2 identified and ready to assign. Nothing on this screen writes.',
  handOff: { label: 'Open the inquiries queue', to: '/inquiries' },
}

const CHOICE: ChoiceBlock = {
  kind: 'choice',
  title: 'Call Bhavesh back',
  tag: 'TSK-0031',
  current: 'Was due yesterday. Picking a time here does not move it.',
  options: [
    { id: 'today', label: 'Later today' },
    { id: 'tomorrow', label: 'Tomorrow morning' },
  ],
  receipt: '{choice} it is. Applied on the task screen.',
}

const FILE: FileBlock = {
  kind: 'file',
  documentId: 'doc-1',
  name: 'Claim Summary — CLM-0412.pdf',
  meta: 'Position, checklist and settlement record',
  note: 'Document presence only.',
}

const STOP: StopBlock = {
  kind: 'stop',
  title: 'Settled amount and deduction',
  body: 'The settled figure comes off the insurer’s advice.',
  fields: [
    { key: 'settled', label: 'Settled amount' },
    { key: 'deduction', label: 'Deduction' },
  ],
}

describe('an Act shows what it will do before anything happens', () => {
  it('spells the change out before offering to confirm it', () => {
    draw([ACT])

    expect(screen.getByText('Route 2 inquiries')).toBeInTheDocument()
    expect(screen.getByText('INQ-1041')).toBeInTheDocument()
    expect(screen.getByText('INQ-1042')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Take these to the queue' })).toBeInTheDocument()
  })

  /**
   * FR-22.4, and the half of it people actually rely on. Cancel is not "confirm
   * with a different label": it writes nothing and it says nothing happened.
   */
  it('writes nothing on cancel, and says so', async () => {
    const user = userEvent.setup()
    draw([ACT])

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('button', { name: 'Take these to the queue' })).not.toBeNull()
    expect(screen.getByText('INQ-1041')).toBeInTheDocument()
  })

  /**
   * The receipt is the claim this feature is most able to get wrong, so it is
   * asserted directly: it must describe a hand-off and name where the change is
   * made, and it must not say the change was made here.
   */
  it('replaces the preview with a receipt that does not claim a write', async () => {
    const user = userEvent.setup()
    draw([ACT])

    await user.click(screen.getByRole('button', { name: 'Take these to the queue' }))

    expect(screen.getByText(/ready to assign/)).toBeInTheDocument()
    expect(screen.getByText(/Nothing on this screen writes/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Open the inquiries queue/ })).toHaveAttribute(
      'href',
      '/inquiries',
    )
    expect(screen.queryByRole('button', { name: 'Take these to the queue' })).toBeNull()
  })
})

describe('a Choice states the current fact before offering alternatives', () => {
  it('says what the record holds now, so nobody picks into a void', () => {
    draw([CHOICE])
    expect(screen.getByText(/Was due yesterday/)).toBeInTheDocument()
  })

  it('names the chosen option in the receipt', async () => {
    const user = userEvent.setup()
    draw([CHOICE])

    await user.click(screen.getByRole('button', { name: 'Tomorrow morning' }))

    expect(screen.getByText(/Tomorrow morning it is/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Later today' })).toBeNull()
  })
})

describe('a produced document is a receipt in the feed, and the sheet elsewhere', () => {
  it('names the document and opens it by id', async () => {
    const opened = vi.fn()
    const user = userEvent.setup()
    draw([FILE], opened)

    expect(screen.getByText('Claim Summary — CLM-0412.pdf')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Open/ }))

    expect(opened).toHaveBeenCalledWith('doc-1')
  })

  /**
   * The prototype offers "Share on WhatsApp" beside Open. Sending is an outward
   * mutation and this surface cannot make one, so the button is absent rather
   * than present and inert — and the card says where sending happens instead.
   */
  it('offers no send, and says where sending happens', () => {
    draw([FILE])

    expect(screen.queryByRole('button', { name: /Share|Send/ })).toBeNull()
    expect(screen.getByText(/Nothing is sent from here/)).toBeInTheDocument()
  })
})

describe('a Stop is the money boundary, drawn', () => {
  /**
   * D3 and FR-22.5. The test that matters is not that the fields render — it is
   * that each is empty, and that nothing on the block has put a figure in front
   * of the person. A suggested amount is an auto-fill wearing a disguise.
   */
  it('asks for each figure and pre-fills none of them', () => {
    draw([STOP])

    for (const label of ['Settled amount', 'Deduction']) {
      const field = screen.getByLabelText(new RegExp(label))
      expect(field).toHaveValue('')
    }
  })

  it('says plainly why the figure cannot come from here', () => {
    draw([STOP])
    expect(screen.getByText(/comes off the insurer’s advice/)).toBeInTheDocument()
  })

  it('carries no total, because there is nowhere on the type to put one', () => {
    draw([STOP])
    expect(screen.queryByText(/total/i)).toBeNull()
  })
})
