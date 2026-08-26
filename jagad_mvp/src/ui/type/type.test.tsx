import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DateTime } from './DateTime'
import { KeyValueList } from './KeyValueList'
import { Money } from './Money'
import { RecordId } from './RecordId'
import { RelativeTime } from './RelativeTime'
import { TruncatedText } from './TruncatedText'

describe('Money', () => {
  it('groups Indian-style, so a lakh reads as a lakh', () => {
    const { container } = render(<Money paise={124850000} />)
    expect(container.textContent).toContain('12,48,500.00')
    expect(container.textContent).not.toContain('1,248,500')
  })

  it('drops the symbol and the paise when asked', () => {
    const { container } = render(<Money paise={124850000} symbol={false} showPaise={false} />)
    expect(container.textContent).toBe('12,48,500')
  })

  it('keeps the paise part when it is not zero, whatever was asked', () => {
    const { container } = render(<Money paise={124850050} showPaise={false} />)
    expect(container.textContent).toContain('12,48,500.50')
  })

  it('carries the integer paise as its machine value', () => {
    const { container } = render(<Money paise={124850000} />)
    expect(container.querySelector('data')).toHaveAttribute('value', '124850000')
  })

  it('renders an unrecorded amount as unrecorded, never as zero', () => {
    render(<Money paise={null} absentText="premium not recorded" />)
    expect(screen.getByText('premium not recorded')).toBeInTheDocument()
  })

  it('marks a negative amount as negative', () => {
    const { container } = render(<Money paise={-4500000} />)
    expect(container.querySelector('data')).toHaveAttribute('data-sign', 'negative')
  })
})

describe('RecordId', () => {
  it('shows both numbers when the insurer has issued one', () => {
    render(<RecordId systemNo="POL-2214" insurerNo="HDFC/OPT/2026/551204" />)
    expect(screen.getByText('POL-2214')).toBeInTheDocument()
    expect(screen.getByText('HDFC/OPT/2026/551204')).toBeInTheDocument()
  })

  it('draws the missing insurer number as awaited rather than as a blank gap', () => {
    render(<RecordId systemNo="POL-DRAFT-0219" />)
    expect(screen.getByText('POL-DRAFT-0219')).toBeInTheDocument()
    expect(screen.getByText('insurer no. awaited')).toBeInTheDocument()
  })

  it('treats a blank insurer number as no insurer number', () => {
    render(<RecordId systemNo="APP-0774" insurerNo="   " />)
    expect(screen.getByText('insurer no. awaited')).toBeInTheDocument()
  })

  it('can drop the insurer half for entities that never carry one', () => {
    render(<RecordId systemNo="INQ-1041" showInsurer={false} />)
    expect(screen.queryByText('insurer no. awaited')).not.toBeInTheDocument()
  })
})

describe('DateTime and RelativeTime', () => {
  it('renders a machine-readable timestamp beside the human one', () => {
    const { container } = render(<DateTime value="2026-08-24T09:15:00" mode="date" />)
    const time = container.querySelector('time')
    expect(time?.textContent).toBe('24 Aug 2026')
    expect(time?.getAttribute('datetime')).toBeTruthy()
  })

  it('reads relative to an injected now, so a render is deterministic', () => {
    const now = new Date('2026-08-26T11:30:00')
    render(<RelativeTime value="2026-08-24T11:30:00" now={now} />)
    expect(screen.getByText('2 days ago')).toBeInTheDocument()
  })

  it('renders a future moment as future', () => {
    const now = new Date('2026-08-26T11:30:00')
    render(<RelativeTime value="2026-09-02T11:30:00" now={now} />)
    expect(screen.getByText('in 7 days')).toBeInTheDocument()
  })

  it('renders an absent moment as absent', () => {
    render(<DateTime value={null} absentText="not set" />)
    expect(screen.getByText('not set')).toBeInTheDocument()
  })
})

describe('KeyValueList and TruncatedText', () => {
  it('keeps an empty row visible rather than hiding the fact', () => {
    render(
      <KeyValueList
        absentText="not recorded"
        items={[
          { key: 'agent', label: 'Sub-agent', value: null },
          { key: 'channel', label: 'Channel', value: 'Referral' },
        ]}
      />,
    )
    expect(screen.getByText('Sub-agent')).toBeInTheDocument()
    expect(screen.getByText('not recorded')).toBeInTheDocument()
  })

  it('withholds the hover text when the caller says the text is sensitive', () => {
    const { container } = render(<TruncatedText text="Diagnosis summary" showTitle={false} />)
    expect(container.firstElementChild).not.toHaveAttribute('title')
  })
})
