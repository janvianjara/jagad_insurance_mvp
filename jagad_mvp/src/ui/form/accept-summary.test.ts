import { describe, expect, it } from 'vitest'
import { acceptSummary } from './accept-summary'

describe('acceptSummary', () => {
  it('names the pair the document fields use', () => {
    expect(acceptSummary('application/pdf,image/*')).toBe('PDF or image')
  })

  it('says "only" when there is one kind', () => {
    expect(acceptSummary('application/pdf')).toBe('PDF only')
  })

  it('collapses tokens that mean the same word', () => {
    expect(acceptSummary('.xlsx,.xls')).toBe('Excel only')
  })

  it('lists three kinds readably', () => {
    expect(acceptSummary('.csv,.xlsx,application/pdf')).toBe('CSV, Excel or PDF')
  })

  it('says nothing at all when no accept is set', () => {
    expect(acceptSummary(undefined)).toBeNull()
  })

  /*
   * A partial list is worse than none: it reads as exhaustive, so a file the
   * field would happily take looks unwelcome. One unknown token withholds the
   * whole summary rather than printing a subset.
   */
  it('withholds the summary rather than printing a partial one', () => {
    expect(acceptSummary('application/pdf,application/x-made-up')).toBeNull()
  })

  it('never leaks a raw MIME type at the reader', () => {
    expect(acceptSummary('application/vnd.oasis.opendocument.text')).toBeNull()
  })
})
