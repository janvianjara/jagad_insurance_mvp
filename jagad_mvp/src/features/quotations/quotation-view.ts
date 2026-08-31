/**
 * Reading a quotation — plan §5 Composer row, §9's quotation machine, canvas 2.
 *
 * Everything here is a pure read over records the repositories already returned.
 * Two rules are worth naming because they are the ones a reviewer will look for:
 *
 *   No function in this file produces an amount. `documentColumns` copies the
 *   figure a person typed onto the line and copies `null` when there is none, so
 *   an unrecorded premium stays unrecorded all the way onto the letterhead (D3).
 *
 *   `personsFor` deliberately carries name, date of birth and relationship and
 *   nothing else. A generated document never prints an identifier, and the
 *   Aadhaar last-4 the member record holds is not one of the three fields it may
 *   have (§14.1).
 */

import type {
  Company,
  Customer,
  Deal,
  Member,
  Product,
  Quotation,
  QuotationBenefitRow,
  QuotationLine,
  StaffUser,
} from '../../data/repo'
import type { DealLineItem, DealState, QuotationState } from '../../domain/workflows'
import type { MatrixColumn } from '../../components/BenefitMatrix'
import type {
  DocumentBenefitRow,
  DocumentColumn,
  DocumentPerson,
} from '../../components/DocumentViewer'
import type { Severity, Tone } from '../../ui/tone'

export const QUOTATION_LABEL: Readonly<Record<QuotationState, string>> = {
  draft: 'Draft',
  composed: 'Composed',
  generated: 'Generated',
  shared: 'Shared',
  revision_requested: 'Revision requested',
  awarded: 'Awarded',
  won: 'Won',
  lost: 'Lost',
}

/** U7: green is positive status only, lime is "needs a person", grey is closed. */
export const QUOTATION_TONE: Readonly<Record<QuotationState, Tone>> = {
  draft: 'info',
  composed: 'attn',
  generated: 'info',
  shared: 'warn',
  // Lime, per U7: an award with no application behind it needs a person.
  revision_requested: 'attn',
  awarded: 'attn',
  won: 'ok',
  lost: 'idle',
}

export const DEAL_LABEL: Readonly<Record<DealState, string>> = {
  created: 'Created',
  line_items_set: 'Line items set',
  consumed: 'Policy entered',
}

export const DEAL_TONE: Readonly<Record<DealState, Tone>> = {
  created: 'attn',
  line_items_set: 'warn',
  consumed: 'ok',
}

/** How much of a person's attention a row wants, as the queue stripe reads it. */
export function quotationSeverity(quotation: Quotation): Severity {
  if (quotation.status === 'won') return 'good'
  if (quotation.status === 'lost') return 'cool'
  if (quotation.status === 'awarded') return 'hot'
  if (quotation.status === 'revision_requested') return 'attn'
  if (quotation.status === 'shared') return 'warm'
  if (quotation.status === 'composed') return 'attn'
  return 'cool'
}

export function dealSeverity(deal: Deal): Severity {
  if (deal.status === 'consumed') return 'good'
  if (deal.lineItems.length === 0) return 'hot'
  return 'warm'
}

export function nameOf(users: readonly StaffUser[], userId: string | null): string {
  if (!userId) return 'Nobody'
  return users.find((user) => user.id === userId)?.name ?? userId
}

/** The live version's lines. `allLines` holds every version, including locked ones. */
export function linesOfVersion(
  allLines: readonly QuotationLine[],
  version: number,
): readonly QuotationLine[] {
  return allLines.filter((line) => line.version === version)
}

/** Every version that has lines, oldest first. The version switcher reads this. */
export function versionsOf(allLines: readonly QuotationLine[]): readonly number[] {
  return [...new Set(allLines.map((line) => line.version))].sort((a, b) => a - b)
}

function labelFor(company: Company | undefined, product: Product | undefined): string {
  if (company && product) return `${company.shortName} ${product.name}`
  return product?.name ?? company?.shortName ?? 'Unnamed column'
}

/**
 * The columns a saved version already has. The key comes off the line so v1 and
 * v2 of the same company line up in the switcher (§8).
 */
export function columnsFromLines(
  lines: readonly QuotationLine[],
  companies: readonly Company[],
  products: readonly Product[],
): readonly MatrixColumn[] {
  return lines.map((line) => {
    const company = companies.find((row) => row.id === line.companyId)
    const product = products.find((row) => row.id === line.productId)
    return {
      columnKey: line.columnKey,
      label: line.label,
      companyId: line.companyId,
      companyName: company?.name ?? line.companyId,
      productId: line.productId,
      productName: product?.name ?? line.productId,
    }
  })
}

/**
 * The columns a person just picked — canvas 2.1's "three policies across two
 * companies". The product id is the key: it is already unique, and two columns
 * over the same product would be the same column.
 */
export function columnsFromProducts(
  products: readonly Product[],
  companies: readonly Company[],
): readonly MatrixColumn[] {
  return products.map((product) => {
    const company = companies.find((row) => row.id === product.companyId)
    return {
      columnKey: product.id,
      label: labelFor(company, product),
      companyId: product.companyId,
      companyName: company?.name ?? product.companyId,
      productId: product.id,
      productName: product.name,
    }
  })
}

/**
 * Who the quotation covers. Members when the household has them, otherwise the
 * customer alone — which is also what decides `floater` on the document.
 */
export function personsFor(
  customer: Customer | null,
  members: readonly Member[],
): readonly DocumentPerson[] {
  if (members.length > 0) {
    return members.map((member) => ({
      name: member.fullName,
      dateOfBirth: member.dateOfBirth,
      relationship: member.relationship,
    }))
  }
  if (!customer) return []
  return [{ name: customer.fullName, dateOfBirth: customer.dateOfBirth, relationship: 'self' }]
}

export function documentRows(
  rows: readonly QuotationBenefitRow[],
): readonly DocumentBenefitRow[] {
  return rows.map((row) => ({ key: row.key, label: row.label, adHoc: row.adHoc }))
}

/** Copies. There is no arithmetic here and no fallback that invents a figure. */
export function documentColumns(
  lines: readonly QuotationLine[],
  columns: readonly MatrixColumn[],
): readonly DocumentColumn[] {
  return lines.map((line) => {
    const column = columns.find((candidate) => candidate.columnKey === line.columnKey)
    return {
      columnKey: line.columnKey,
      label: line.label,
      companyName: column?.companyName ?? line.companyId,
      productName: column?.productName ?? line.productId,
      benefitValues: line.benefitValues,
      finalPayablePremium: line.finalPayablePremium,
    }
  })
}

/**
 * What a won column becomes on the deal, financials and all.
 *
 * This is the carriage, and it is the only place it happens. Every amount below
 * is copied off the quotation line the customer accepted — the function reads
 * figures and never produces one, so a column with no typed premium cannot
 * become a line item and is reported rather than quietly dropped. Ids are
 * derived from the line's own, so the deal line and the quotation column it came
 * from can always be put side by side.
 */
export type DealLineCarriage =
  | { readonly ok: true; readonly lineItems: readonly DealLineItem[] }
  | { readonly ok: false; readonly reason: string }

export function dealLineItemsFor(
  lines: readonly QuotationLine[],
  premiumMode: Quotation['premiumMode'],
): DealLineCarriage {
  const untyped = lines.filter((line) => line.finalPayablePremium === null)
  if (untyped.length > 0) {
    const labels = untyped.map((line) => line.label).join(', ')
    return {
      ok: false,
      reason: `No Final Payable Premium was ever typed for: ${labels}. A deal carries the figure the customer accepted, so that column cannot go forward until somebody records it.`,
    }
  }

  const lineItems = lines.map((line): DealLineItem => {
    // Narrowed by the check above; a line without a figure never reaches here.
    const accepted = line.finalPayablePremium as NonNullable<QuotationLine['finalPayablePremium']>
    return {
      id: `dli-${line.id}`,
      companyId: line.companyId,
      productId: line.productId,
      label: line.label,
      quotationLineId: line.id,
      columnKey: line.columnKey,
      carriedFromVersion: line.version,
      acceptedFinalPayablePremium: accepted,
      // Carried, not restated. A line that somehow arrived without a provenance
      // is treated as unproven rather than assumed typed, and the deal machine's
      // carriage guard is what refuses it.
      acceptedPremiumSource: line.finalPremiumSource ?? 'computed',
      netPremium: line.netPremium,
      gstAmount: line.gstAmount,
      premiumMode,
    }
  })
  return { ok: true, lineItems }
}
