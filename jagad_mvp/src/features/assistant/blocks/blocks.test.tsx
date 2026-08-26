import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { IconSprite } from '../../../ui/Icon'
import { BlockRenderer } from './BlockRenderer'
import { splitEmphasis } from './blocks'
import type { Block } from './blocks'

function draw(blocks: readonly Block[]) {
  return render(
    <MemoryRouter>
      <IconSprite />
      <BlockRenderer blocks={blocks} />
    </MemoryRouter>,
  )
}

describe('emphasis is named, never marked up', () => {
  it('splits a sentence around the counted phrases', () => {
    const segments = splitEmphasis('18 open inquiries across the team.', ['18 open inquiries'])
    expect(segments).toEqual([
      { text: '18 open inquiries', emphasised: true },
      { text: ' across the team.', emphasised: false },
    ])
  })

  it('prefers the longer phrase, so a count is not shadowed by its own digits', () => {
    const segments = splitEmphasis('4 unassigned and 4 quoted', ['4', '4 unassigned'])
    expect(segments[0]).toEqual({ text: '4 unassigned', emphasised: true })
    expect(segments.filter((segment) => segment.emphasised)).toHaveLength(2)
  })

  it('degrades to a plain sentence when a phrase has drifted out of the text', () => {
    expect(splitEmphasis('nothing is waiting', ['12 open leads'])).toEqual([
      { text: 'nothing is waiting', emphasised: false },
    ])
  })

  it('never renders a phrase as markup', () => {
    draw([{ kind: 'para', text: 'Watch <b>this</b> render.', emphasis: ['<b>this</b>'] }])
    expect(screen.getByText('<b>this</b>').tagName).toBe('STRONG')
    expect(document.querySelector('b')).toBeNull()
  })
})

describe('the five Ask-shaped blocks', () => {
  it('renders a paragraph with its counted phrase emphasised', () => {
    draw([
      {
        kind: 'para',
        text: '18 open inquiries across the team.',
        emphasis: ['18 open inquiries'],
      },
    ])
    expect(screen.getByText('18 open inquiries').tagName).toBe('STRONG')
  })

  it('renders a note, which is where a notice states its reason', () => {
    draw([{ kind: 'note', text: 'Raised because both passed the aging threshold.' }])
    expect(screen.getByText(/Raised because both passed/)).toBeInTheDocument()
  })

  it('gives every row a severity stripe and links the ones that have a record', () => {
    draw([
      {
        kind: 'rows',
        rows: [
          {
            id: 'inq-1',
            severity: 'hot',
            primary: 'INQ-1041 · Rakesh Patel',
            secondary: 'no owner yet',
            to: '/inquiries?record=inq-1',
          },
          { id: 'inq-2', severity: 'cool', primary: 'INQ-1042', secondary: 'assigned' },
        ],
      },
    ])

    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[0].querySelector('[data-severity="hot"]')).not.toBeNull()
    expect(within(rows[0]).getByRole('link')).toHaveAttribute('href', '/inquiries?record=inq-1')
    expect(within(rows[1]).queryByRole('link')).toBeNull()
  })

  it('formats money at the render edge and only from recorded paise', () => {
    draw([
      {
        kind: 'table',
        columns: [
          { key: 'no', label: 'Quotation' },
          { key: 'premium', label: 'Final payable', align: 'end' },
        ],
        rows: [
          { id: 'a', cells: [{ cell: 'id', systemNo: 'QTN-0332' }, { cell: 'money', paise: 1_820_000 }] },
          { id: 'b', cells: [{ cell: 'id', systemNo: 'QTN-0333' }, { cell: 'money', paise: null }] },
        ],
      },
    ])

    expect(screen.getByText('QTN-0332')).toBeInTheDocument()
    expect(screen.getByText(/18,200/)).toBeInTheDocument()
    // Absent is a state, not a zero. Nothing invents a figure for the second row.
    expect(screen.getByText('not recorded')).toBeInTheDocument()
    expect(screen.queryByText(/₹0/)).toBeNull()
  })

  it('renders a key-value block with its tag', () => {
    draw([
      {
        kind: 'kv',
        title: 'INQ-1041',
        tag: 'Ask',
        items: [{ key: 'state', label: 'State', value: { cell: 'text', value: 'assigned' } }],
      },
    ])

    expect(screen.getByText('INQ-1041')).toBeInTheDocument()
    expect(screen.getByText('Ask')).toBeInTheDocument()
    expect(screen.getByText('State')).toBeInTheDocument()
    expect(screen.getByText('assigned')).toBeInTheDocument()
  })
})
