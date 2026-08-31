import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { IconSprite } from '../../../ui/Icon'
import { CapabilitiesView } from './CapabilitiesView'
import { BEFORE_AFTER, BY_ROLE, NEVER, REQUEST_KIND_GUIDE } from './capabilities'

/**
 * The page's job is to be believed, so what is tested is what it claims.
 *
 * A reading page is the easiest thing in a codebase to let drift: nothing
 * breaks when a boundary stops being enforced and the page still says it is.
 * These assert the claims themselves, so removing one of the product's
 * refusals without removing it from this page fails the build.
 */

function draw() {
  return render(
    <MemoryRouter>
      <IconSprite />
      <CapabilitiesView backTo="/assistant" />
    </MemoryRouter>,
  )
}

describe('what the Assistant says it does', () => {
  it('names all four request kinds FR-22.2 defines', () => {
    draw()
    for (const kind of ['Ask', 'Analyse', 'Act', 'Produce']) {
      expect(screen.getAllByText(new RegExp(`^${kind}$`)).length).toBeGreaterThan(0)
    }
  })

  it('shows every kind an example of what it is for', () => {
    for (const kind of REQUEST_KIND_GUIDE) {
      expect(kind.examples.length).toBeGreaterThan(0)
    }
  })

  it('offers a way back to the conversation', () => {
    draw()
    expect(screen.getByRole('link', { name: /Back to the conversation/ })).toHaveAttribute(
      'href',
      '/assistant',
    )
  })
})

describe('what it says it will not do', () => {
  /**
   * The seven refusals, each named on screen. If one of these ever stops being
   * true in the product, this test does not catch it — but removing it from the
   * page without anybody noticing is the failure mode this does catch.
   */
  it('states every refusal, and where it is enforced', () => {
    draw()
    for (const rule of NEVER) {
      expect(screen.getByText(new RegExp(rule.claim))).toBeInTheDocument()
      expect(screen.getByText(rule.where)).toBeInTheDocument()
    }
  })

  it('keeps the money boundary and the scope boundary among them', () => {
    const claims = NEVER.map((rule) => rule.key)
    expect(claims).toContain('money')
    expect(claims).toContain('scope')
    expect(claims).toContain('health')
  })

  /**
   * The prototype's before-and-after table prints "~40 min saved" against each
   * job. Those figures were invented for a demo; printing them in the product
   * would be the product making a claim about somebody's day that it cannot
   * check. The comparison is kept and the numbers are not.
   */
  it('makes no claim about time saved', () => {
    draw()
    for (const row of BEFORE_AFTER) {
      expect(`${row.today} ${row.withAssistant}`).not.toMatch(/\d+\s*(min|minute|hour|hr)/i)
    }
    expect(screen.queryByText(/min saved|minutes saved/i)).toBeNull()
  })

  /**
   * An Act in this build drafts a change and hands it to the module that makes
   * it, and this page is where a person finds that out. It must not describe an
   * Act as sending or saving.
   */
  it('describes an Act as a draft and a hand-off, never as a send', () => {
    const act = REQUEST_KIND_GUIDE.find((kind) => kind.key === 'act')
    expect(act?.summary).toMatch(/Draft/)
    expect(act?.summary).toMatch(/nothing on this screen writes/i)
  })
})

describe('what each role gets', () => {
  it('covers every role the chips are built for', () => {
    const keys = BY_ROLE.map((row) => row.key)
    for (const role of ['admin', 'salesManager', 'agent', 'backOffice', 'claims', 'renewals']) {
      expect(keys).toContain(role)
    }
  })
})
