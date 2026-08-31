import { describe, expect, it } from 'vitest'
import { createEventBus } from '../events'
import type { DomainEvent } from '../events'
import { money } from '../money'
import { reasonOf } from './machine'
import {
  PREMIUM_SOURCES,
  QUOTATION_STATES,
  archiveQuotationVersion,
  finalPayablePremiumPresentPerColumn,
  finalPremiumIsTypedNotComputed,
  priorVersionsRemainImmutable,
  quotationLostRequiresReason,
  quotationMachine,
  revisionIncrementsVersion,
  revisionRequiresReason,
  shouldAutoShare,
} from './quotation'
import type { QuotationColumn, QuotationContext } from './quotation'

function recordingBus() {
  const seen: DomainEvent[] = []
  const bus = createEventBus({ now: () => new Date('2026-08-26T09:00:00.000Z') })
  bus.onAny((event) => seen.push(event))
  return { bus, seen }
}

const HDFC: QuotationColumn = {
  label: 'HDFC Ergo Optima Secure',
  companyId: 'co-hdfc',
  productId: 'pr-optima',
  finalPayablePremium: money(28_450),
  finalPremiumSource: PREMIUM_SOURCES.typed,
}

const NIVA: QuotationColumn = {
  label: 'Niva Bupa ReAssure',
  companyId: 'co-niva',
  productId: 'pr-reassure',
  finalPayablePremium: money(31_200),
  finalPremiumSource: PREMIUM_SOURCES.typed,
}

function context(overrides: Partial<QuotationContext> = {}): QuotationContext {
  return { columns: [HDFC, NIVA], version: 1, ...overrides }
}

describe('quotation final payable premium', () => {
  it('Final Payable Premium must be present per column before generate', () => {
    expect(finalPayablePremiumPresentPerColumn(context()).ok).toBe(true)

    const missing = finalPayablePremiumPresentPerColumn(
      context({ columns: [HDFC, { ...NIVA, finalPayablePremium: undefined }] }),
    )

    expect(missing.ok).toBe(false)
    expect(reasonOf(missing)).toContain('Niva Bupa ReAssure')
    expect(reasonOf(missing)).not.toContain('HDFC Ergo Optima Secure')
  })

  it('is typed, never computed', () => {
    const computed = finalPremiumIsTypedNotComputed(
      context({ columns: [{ ...HDFC, finalPremiumSource: PREMIUM_SOURCES.computed }] }),
    )

    expect(computed.ok).toBe(false)
    expect(reasonOf(computed)).toContain('typed')
    expect(finalPremiumIsTypedNotComputed(context()).ok).toBe(true)
  })

  it('blocks generate on an empty quotation and on a column with no premium', () => {
    expect(quotationMachine.canTransition(QUOTATION_STATES.composed, QUOTATION_STATES.generated, context({ columns: [] })).ok).toBe(false)
    expect(
      quotationMachine.canTransition(
        QUOTATION_STATES.composed,
        QUOTATION_STATES.generated,
        context({ columns: [{ ...HDFC, finalPayablePremium: undefined }] }),
      ).ok,
    ).toBe(false)
    expect(quotationMachine.canTransition(QUOTATION_STATES.composed, QUOTATION_STATES.generated, context()).ok).toBe(true)
  })
})

describe('quotation revision', () => {
  it('quotation revision requires a reason', () => {
    expect(revisionRequiresReason(context({ revisionReason: 'Customer asked for a 10L sum insured' })).ok).toBe(true)
    expect(revisionRequiresReason(context({ revisionReason: '  ' })).ok).toBe(false)

    const verdict = quotationMachine.canTransition(
      QUOTATION_STATES.shared,
      QUOTATION_STATES.revisionRequested,
      context(),
    )
    expect(verdict.ok).toBe(false)
    expect(verdict.ok === false && verdict.guard).toBe('revisionRequiresReason')
  })

  it('keeps prior versions immutable and viewable', () => {
    const archived = archiveQuotationVersion({ version: 1, columns: [HDFC, NIVA] })

    expect(archived.locked).toBe(true)
    expect(Object.isFrozen(archived)).toBe(true)
    expect(archived.columns).toHaveLength(2)
    expect(priorVersionsRemainImmutable(context({ version: 2, priorVersions: [archived] })).ok).toBe(true)

    const stillEditable = priorVersionsRemainImmutable(
      context({ version: 2, priorVersions: [{ version: 1, columns: [HDFC] }] }),
    )
    expect(stillEditable.ok).toBe(false)
    expect(reasonOf(stillEditable)).toContain('v1')
  })

  it('opens v+1 and refuses to overwrite a version the customer has already seen', () => {
    const archived = archiveQuotationVersion({ version: 1, columns: [HDFC] })

    expect(revisionIncrementsVersion(context({ version: 2, priorVersions: [archived] })).ok).toBe(true)
    expect(revisionIncrementsVersion(context({ version: 1, priorVersions: [archived] })).ok).toBe(false)
  })

  it('generates the revision once the reason, the version and the premiums are all in place', () => {
    const { bus, seen } = recordingBus()
    const archived = archiveQuotationVersion({ version: 1, columns: [HDFC, NIVA] })

    const outcome = quotationMachine.transition(
      QUOTATION_STATES.revisionRequested,
      QUOTATION_STATES.generated,
      context({ version: 2, priorVersions: [archived], revisionReason: 'Sum insured raised to 10L' }),
      { bus },
    )

    expect(outcome.ok).toBe(true)
    expect(seen.map((event) => event.name)).toEqual(['quotation.generated'])
  })
})

describe('quotation outcome and sharing', () => {
  it('lost requires a reason', () => {
    expect(quotationLostRequiresReason(context({ lostReason: 'Went with the bank offer' })).ok).toBe(true)
    expect(quotationLostRequiresReason(context()).ok).toBe(false)

    expect(quotationMachine.canTransition(QUOTATION_STATES.shared, QUOTATION_STATES.lost, context()).ok).toBe(false)
    expect(
      quotationMachine.canTransition(
        QUOTATION_STATES.shared,
        QUOTATION_STATES.lost,
        context({ lostReason: 'Went with the bank offer' }),
      ).ok,
    ).toBe(true)
  })

  it('auto-share is a config fork that applies identically to generated and uploaded quotations', () => {
    expect(shouldAutoShare({ autoShare: true }, 'generated')).toBe(true)
    expect(shouldAutoShare({ autoShare: true }, 'uploaded')).toBe(true)
    expect(shouldAutoShare({ autoShare: false }, 'generated')).toBe(false)
    expect(shouldAutoShare({ autoShare: false }, 'uploaded')).toBe(false)
  })

  /*
   * `shared -> won` used to be a single guardless hop, and it is now two steps
   * with the decision recorded between them. The tests below are the reason the
   * split is worth its cost: `won` can no longer be reached without naming what
   * the customer bought, or without the application it produced.
   */
  it('records the award on a shared quotation, naming the accepted columns', () => {
    const { bus, seen } = recordingBus()
    const outcome = quotationMachine.transition(
      QUOTATION_STATES.shared,
      QUOTATION_STATES.awarded,
      context({ acceptedColumnKeys: ['HDFC Ergo Optima Secure'] }),
      { bus },
    )

    expect(outcome.ok).toBe(true)
    expect(seen.map((event) => event.name)).toEqual(['quotation.awarded'])
  })

  it('refuses an award that does not say which column the customer accepted', () => {
    const verdict = quotationMachine.canTransition(
      QUOTATION_STATES.shared,
      QUOTATION_STATES.awarded,
      context(),
    )

    expect(verdict.ok).toBe(false)
    expect(verdict.ok === false && verdict.guard).toBe('acceptedColumnsExist')
    expect(reasonOf(verdict)).toContain('Name the column the customer accepted')
  })

  it('refuses an award naming a column this quotation never showed', () => {
    const verdict = quotationMachine.canTransition(
      QUOTATION_STATES.shared,
      QUOTATION_STATES.awarded,
      context({ acceptedColumnKeys: ['Some Other Insurer'] }),
    )

    expect(verdict.ok).toBe(false)
    expect(reasonOf(verdict)).toContain('no column called')
  })

  it('no longer lets a quotation jump straight from shared to won', () => {
    const verdict = quotationMachine.canTransition(
      QUOTATION_STATES.shared,
      QUOTATION_STATES.won,
      context({ acceptedColumnKeys: ['HDFC Ergo Optima Secure'] }),
    )

    expect(verdict.ok).toBe(false)
  })

  it('reaches won only through the application the award produced', () => {
    const accepted = context({ acceptedColumnKeys: ['HDFC Ergo Optima Secure'] })

    const withoutDeal = quotationMachine.canTransition(
      QUOTATION_STATES.awarded,
      QUOTATION_STATES.won,
      accepted,
    )
    expect(withoutDeal.ok).toBe(false)
    expect(withoutDeal.ok === false && withoutDeal.guard).toBe('dealExistsForAward')
    expect(reasonOf(withoutDeal)).toContain('record a sale with nothing behind it')

    const { bus, seen } = recordingBus()
    const outcome = quotationMachine.transition(
      QUOTATION_STATES.awarded,
      QUOTATION_STATES.won,
      context({ acceptedColumnKeys: ['HDFC Ergo Optima Secure'], dealId: 'app-0999' }),
      { bus },
    )
    expect(outcome.ok).toBe(true)
    expect(seen.map((event) => event.name)).toEqual(['quotation.won'])
  })

  it('reverses an award back to shared, and only with a reason', () => {
    const accepted = context({ acceptedColumnKeys: ['HDFC Ergo Optima Secure'] })

    expect(
      quotationMachine.canTransition(QUOTATION_STATES.awarded, QUOTATION_STATES.shared, accepted).ok,
    ).toBe(false)

    const reversed = quotationMachine.canTransition(
      QUOTATION_STATES.awarded,
      QUOTATION_STATES.shared,
      context({
        acceptedColumnKeys: ['HDFC Ergo Optima Secure'],
        awardVoidReason: 'The customer changed their mind before the application was opened.',
      }),
    )
    expect(reversed.ok).toBe(true)
  })
})
