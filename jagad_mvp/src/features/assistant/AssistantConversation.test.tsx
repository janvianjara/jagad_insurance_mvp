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
  current: {
    repo: null,
    templateKey: 'salesManager',
    userName: 'Nikunj Shah',
    roleLabel: 'Sales · Team pipeline',
    enabled: true,
  },
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
  session.current = { repo, templateKey, userName: 'Test person', roleLabel: 'Test role', enabled }
}

/**
 * `noticeDelayMs={0}` everywhere below.
 *
 * The wait before a notice arrives is behaviour and has its own test; making
 * every other test in this file sit through it would add twenty seconds to the
 * suite to re-assert the same setTimeout twelve times.
 */
function draw(props: Partial<Parameters<typeof AssistantConversation>[0]> = {}) {
  return render(
    <MemoryRouter>
      <IconSprite />
      <AssistantConversation noticeDelayMs={0} {...props} />
    </MemoryRouter>,
  )
}

/**
 * The conversation's name as the HEADER shows it.
 *
 * It collides on purpose: "New conversation" is also the restart button's label,
 * and once something has been asked the name is also the person's own turn in
 * the feed. The header's copy is the `<span>`, so that is what is read.
 */
function threadName(): string {
  const header = screen.getByRole('heading', { name: 'Assistant' }).closest('header')
  const name = header?.querySelector('[class*="threadName"]')
  return name?.textContent ?? ''
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
    // The second sentence: what wants a person, and what follows if nobody comes.
    expect(para.textContent).toContain('1 still unassigned and 1 close to its TAT')
    expect(para.textContent).toContain('the customer waits longer.')
    expect(para.textContent).not.toMatch(/hello|how can i help/i)
  })

  it('says the queue is clear rather than showing an empty box', async () => {
    draw()
    expect(await screen.findByText(/Nothing in the team pipeline is waiting on you/)).toBeInTheDocument()
  })

  it('changes with the role', async () => {
    signedInAs('claims', { claims: [aClaim({ id: 'clm-1' })] })
    draw()
    expect(await screen.findByText('1 claim')).toBeInTheDocument()
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

    // The answer arrives after the thinking pause, so it is awaited rather than
    // asserted straight away — the pause is behaviour, not a race in the test.
    await waitFor(() => expect(screen.getAllByText('INQ-1044').length).toBeGreaterThan(0))
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

/**
 * The prototype's composer, and its contract.
 *
 * It takes typing, matches it against the fixed set this build actually
 * answers, and runs one — or says plainly that it is not one of them and names
 * what is. What it must never do is take a sentence and reply with something
 * adjacent: a box that swallows a question and answers a different one teaches
 * people the product is unreliable, which is more expensive than the missing
 * feature. The floor in `matchAskCard` is what enforces that, and this is where
 * it is checked from the outside.
 */
describe('the composer answers what it can and says so when it cannot', () => {
  it('runs the card a typed question matches', async () => {
    signedInAs('salesManager', {
      inquiries: [
        anInquiry({ id: 'inq-free', systemNo: 'INQ-1041', status: 'new', ownerId: null, tatDueAt: null, assignedAt: null }),
      ],
    })
    const user = userEvent.setup()
    draw()

    await screen.findByText(/1 open inquiry/)
    await user.type(screen.getByRole('textbox'), 'what is still unassigned')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    // The person's own words come back as their turn...
    expect(await screen.findByText('what is still unassigned')).toBeInTheDocument()
    // ...and the answer is the card's live query, not a stored reply.
    expect(await screen.findByText(/INQ-1041/)).toBeInTheDocument()
  })

  it('refuses a question it does not know rather than answering a neighbouring one', async () => {
    signedInAs('claims', { claims: [aClaim({ id: 'clm-1' })] })
    const user = userEvent.setup()
    draw()

    await screen.findByText('1 claim')
    await user.type(screen.getByRole('textbox'), 'book me a flight to Ahmedabad')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    expect(
      await screen.findByText(/this build answers a fixed set of questions about your own queue/),
    ).toBeInTheDocument()
    // And it offers what it does hold, by name.
    expect(screen.getByText(/Try one of these instead: My claims/)).toBeInTheDocument()
  })

  it('will not send an empty question', async () => {
    draw()
    await screen.findByText(/Nothing in the team pipeline/)

    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
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

describe('a notice arrives rather than being there — FR-22.8', () => {
  /**
   * The delay is the whole difference between the two readings of the same
   * rows. Something on screen when you arrive is part of the page; something
   * that appears while you are reading is the system telling you it noticed.
   * So this asserts the absence first, which is the half that carries meaning.
   */
  it('is not on the screen when the briefing lands, and is a moment later', async () => {
    signedInAs('claims', { claims: [aClaim({ id: 'clm-old', raisedAt: at(-40 * DAY) })] })
    draw({ noticeDelayMs: 40 })

    await screen.findByText('1 claim')
    expect(screen.queryByText('Assistant · noticed just now')).toBeNull()

    expect(await screen.findByText('Assistant · noticed just now')).toBeInTheDocument()
  })

  /**
   * Pushing an unrelated notice on top of an answer somebody is mid-way through
   * reading is the exact behaviour that makes people switch notifications off.
   */
  it('holds off once the person has asked something', async () => {
    signedInAs('claims', { claims: [aClaim({ id: 'clm-old', raisedAt: at(-40 * DAY) })] })
    const user = userEvent.setup()
    draw({ noticeDelayMs: 5_000 })

    await screen.findByText('1 claim')
    await user.click(screen.getByRole('button', { name: 'My claims' }))
    await screen.findByText('Which claims are open in my queue?')

    expect(screen.queryByText('Assistant · noticed just now')).toBeNull()
  })
})

describe('the conversation is a conversation, not a menu', () => {
  /**
   * The thread's name is in the meta line rather than the heading — the heading
   * names the screen, as every heading in this product does. See the note on
   * `title` in AssistantConversation.tsx for why that is the one place this
   * screen does not take the prototype's layout.
   */
  it('names itself after the first thing asked', async () => {
    signedInAs('agent', { inquiries: [anInquiry({ id: 'inq-mine' })] })
    const user = userEvent.setup()
    draw({ withHeader: true })

    await screen.findByRole('heading', { name: 'Assistant' })
    expect(threadName()).toBe('New conversation')

    await user.click(screen.getByRole('button', { name: 'My leads' }))

    await waitFor(() => expect(threadName()).toBe('What is open in my book right now?'))
  })

  it('offers what follows an answer rather than the same chips again', async () => {
    signedInAs('claims', { claims: [aClaim({ id: 'clm-old', raisedAt: at(-40 * DAY) })] })
    const user = userEvent.setup()
    draw()

    await screen.findByText('1 claim')
    const before = screen
      .getAllByRole('button')
      .map((button) => button.textContent)
      .join('|')

    await user.click(screen.getByRole('button', { name: 'Past thirty days' }))
    await screen.findByRole('heading', { name: 'What usually follows' })

    await waitFor(() => {
      const after = screen
        .getAllByRole('button')
        .map((button) => button.textContent)
        .join('|')
      expect(after).not.toBe(before)
    })
  })

  it('starts over on request, and carries nothing across', async () => {
    signedInAs('agent', { inquiries: [anInquiry({ id: 'inq-mine' })] })
    const user = userEvent.setup()
    draw({ withHeader: true })

    await screen.findByText(/1 open lead/)
    await user.click(screen.getByRole('button', { name: 'My leads' }))
    await waitFor(() => expect(threadName()).toBe('What is open in my book right now?'))

    await user.click(screen.getByRole('button', { name: 'New conversation' }))

    await waitFor(() => expect(threadName()).toBe('New conversation'))

    // The exchange is gone — the question, and the answer under it.
    expect(screen.queryByText('What is open in my book right now?')).toBeNull()
    expect(screen.queryByRole('button', { name: 'New conversation' })).toBeDisabled()
  })
})

describe('a produced document — FR-22.9', () => {
  it('offers no Documents control until something has been produced', async () => {
    signedInAs('claims', { claims: [aClaim({ id: 'clm-1' })] })
    draw({ withHeader: true })

    await screen.findByText('1 claim')
    expect(screen.queryByRole('button', { name: /Documents/ })).toBeNull()
  })

  it('produces a sheet on agency letterhead and opens it beside the conversation', async () => {
    signedInAs('claims', { claims: [aClaim({ id: 'clm-1', systemNo: 'CLM-0412' })] })
    const user = userEvent.setup()
    draw({ withHeader: true })

    await screen.findByText('1 claim')
    await user.click(screen.getByRole('button', { name: /Claim summary/ }))

    // The feed gets a receipt for the document, naming it.
    expect(await screen.findByText(/Claim Summary — CLM-0412\.pdf/)).toBeInTheDocument()
    // The header now offers the conversation's documents.
    expect(await screen.findByRole('button', { name: /Documents/ })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Open' }))

    // The sheet itself, with the agency masthead on it.
    expect(await screen.findByText('Jagad Insurance')).toBeInTheDocument()
    expect(screen.getByText('Claim summary and current position')).toBeInTheDocument()
  })

  /**
   * FR-22.14. A claim summary the Assistant produced may name the checklist and
   * may not name the illness — health data is outside the projection entirely,
   * so this is asserting a thing that cannot be reached rather than a filter.
   */
  it('names the checklist and never the diagnosis', async () => {
    signedInAs('claims', { claims: [aClaim({ id: 'clm-1', systemNo: 'CLM-0412' })] })
    const user = userEvent.setup()
    draw({ withHeader: true })

    await screen.findByText('1 claim')
    await user.click(screen.getByRole('button', { name: /Claim summary/ }))
    await screen.findByText(/Claim Summary — CLM-0412\.pdf/)
    await user.click(screen.getByRole('button', { name: 'Open' }))

    await screen.findByText('Claim summary and current position')
    expect(screen.getByText(/It states no opinion on the outcome/)).toBeInTheDocument()
    expect(screen.queryByText(/diagnosis/i)).toBeNull()
  })
})
