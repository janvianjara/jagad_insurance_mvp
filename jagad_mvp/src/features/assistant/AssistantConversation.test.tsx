import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IconSprite } from '../../ui/Icon'
import { aClaim, aTask, anInquiry, stubAssistantRepository } from './stub-repository'
import type { StubRows } from './stub-repository'
import type { AssistantSession } from './use-assistant'

/**
 * The screen, driven through the same hooks the app uses.
 *
 * `useAssistantSession` is the one seam replaced, and only because the real one
 * resolves a permission template out of `src/domain` — which this feature is not
 * allowed to import, tests included. Everything below the seam is the real
 * thing: the real snapshot loader, the real briefing templates, the real
 * threshold rules and the real Ask cards, over projections.
 */
const session: { current: AssistantSession } = {
  current: { repo: null, templateKey: 'salesManager', userName: 'Nikunj Shah', enabled: true },
}

vi.mock('./use-assistant', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./use-assistant')>()
  return { ...actual, useAssistantSession: () => session.current }
})

const { AssistantConversation } = await import('./AssistantConversation')
const { useNoticesStore } = await import('./notices/notices-store')

const NOW = Date.now()
const HOUR = 3_600_000
const DAY = 24 * HOUR

function at(offsetMs: number): string {
  return new Date(NOW + offsetMs).toISOString()
}

function signedInAs(templateKey: string, rows: StubRows, enabled = true) {
  const repo = stubAssistantRepository(rows, { enabled, userId: `usr-${templateKey}` })
  session.current = { repo, templateKey, userName: 'Test person', enabled }
}

function draw() {
  return render(
    <MemoryRouter>
      <IconSprite />
      <AssistantConversation />
    </MemoryRouter>,
  )
}

const AT_RISK = anInquiry({
  id: 'inq-risk',
  systemNo: 'INQ-1036',
  assignedAt: at(-HOUR),
  tatDueAt: at(2 * HOUR),
})

beforeEach(() => {
  useNoticesStore.getState().restoreAll()
  signedInAs('salesManager', {})
})

describe('the landing turn', () => {
  it('opens with a counted briefing, not a prompt and not a greeting', async () => {
    signedInAs('salesManager', {
      inquiries: [
        AT_RISK,
        anInquiry({ id: 'inq-open', systemNo: 'INQ-1039', tatDueAt: at(9 * HOUR) }),
        anInquiry({ id: 'inq-free', systemNo: 'INQ-1041', status: 'new', ownerId: null, tatDueAt: null, assignedAt: null }),
      ],
    })
    draw()

    // The counted phrase is its own element — emphasis is named, not marked up —
    // so the sentence is read back off the paragraph it was split across.
    const counted = await screen.findByText('3 open inquiries')
    const para = counted.closest('p') as HTMLElement

    expect(counted.tagName).toBe('STRONG')
    expect(para.textContent).toContain('3 open inquiries across the team.')
    expect(para.textContent).toContain('1 still unassigned.')
    expect(para.textContent).not.toMatch(/hello|how can i help/i)
  })

  it('says the queue is clear rather than showing an empty box', async () => {
    draw()
    expect(await screen.findByText(/Nothing in the team pipeline is waiting on you/)).toBeInTheDocument()
  })

  it('changes with the role', async () => {
    signedInAs('claims', { claims: [aClaim({ id: 'clm-1' })] })
    draw()
    expect(await screen.findByText('1 open claim')).toBeInTheDocument()
  })
})

describe('proactive notices in the feed — FR-22.8', () => {
  it('labels them "noticed just now" and states the reason on screen', async () => {
    signedInAs('salesManager', { inquiries: [AT_RISK] })
    draw()

    const notice = await screen.findByText('Assistant · noticed just now')
    const turn = notice.closest('article') as HTMLElement

    expect(within(turn).getAllByText(/INQ-1036/).length).toBeGreaterThan(0)
    expect(
      within(turn).getByText(
        'Raised because it falls inside the three-hour turnaround window, not because anyone asked.',
      ),
    ).toBeInTheDocument()
  })

  it('is dismissible, and stays dismissed', async () => {
    signedInAs('salesManager', { inquiries: [AT_RISK] })
    const user = userEvent.setup()
    draw()

    await screen.findByText('Assistant · noticed just now')
    await user.click(screen.getByRole('button', { name: /^Dismiss:/ }))

    await waitFor(() => expect(screen.queryByText('Assistant · noticed just now')).toBeNull())
  })

  it('raises one entry per rule, however many records matched', async () => {
    signedInAs('claims', {
      claims: [
        aClaim({ id: 'clm-a', systemNo: 'CLM-0398', raisedAt: at(-34 * DAY) }),
        aClaim({ id: 'clm-b', systemNo: 'CLM-0402', raisedAt: at(-31 * DAY) }),
      ],
    })
    draw()

    await screen.findByText('Assistant · noticed just now')
    expect(screen.getAllByText('Assistant · noticed just now')).toHaveLength(1)
    expect(
      screen.getByText(
        'Raised because both passed the thirty-day aging threshold, not because anyone asked.',
      ),
    ).toBeInTheDocument()
  })
})

describe('the suggestion chips', () => {
  it('runs a projection query and tags the answer as an Ask', async () => {
    signedInAs('agent', { inquiries: [anInquiry({ id: 'inq-mine', systemNo: 'INQ-1044' })] })
    const user = userEvent.setup()
    draw()

    await screen.findByText('1 open lead')
    await user.click(screen.getByRole('button', { name: 'My leads' }))

    expect(await screen.findByText('What is open in my book right now?')).toBeInTheDocument()
    await waitFor(() => expect(screen.getAllByText('Ask').length).toBeGreaterThan(0))
    expect(screen.getAllByText('INQ-1044').length).toBeGreaterThan(0)
  })

  it('answers with nothing, and says why, when the scope is empty', async () => {
    signedInAs('agent', {})
    const user = userEvent.setup()
    draw()

    await screen.findByText(/Nothing in your book is waiting on you/)
    await user.click(screen.getByRole('button', { name: 'My leads' }))

    expect(await screen.findByText(/Nothing in your book matches that right now/)).toBeInTheDocument()
    expect(screen.getByText(/it was never in the query/)).toBeInTheDocument()
  })

  it('offers a different set to a different role', async () => {
    signedInAs('backOffice', { tasks: [aTask()] })
    draw()

    expect(await screen.findByRole('button', { name: 'My queue' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Failed mandates' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'My leads' })).toBeNull()
  })
})

describe('free text is deferred, and does not pretend otherwise', () => {
  it('offers no text box at all', async () => {
    draw()
    await screen.findByText(/Nothing in the team pipeline/)

    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.getByText(/Typed questions arrive in a later phase/)).toBeInTheDocument()
  })

  it('routes the composer to the chips instead', async () => {
    signedInAs('agent', {})
    const user = userEvent.setup()
    draw()

    await screen.findByText(/Nothing in your book/)
    await user.click(screen.getByRole('button', { name: 'Pick a question' }))

    expect(screen.getByRole('button', { name: 'My leads' })).toHaveFocus()
  })
})

describe('an account with no Assistant grant', () => {
  it('is refused rather than shown a narrower answer', async () => {
    signedInAs('subAgent', { inquiries: [anInquiry()] }, false)
    draw()

    expect(await screen.findByText(/does not hold the Assistant/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'My queue' })).toBeDisabled()
  })
})
