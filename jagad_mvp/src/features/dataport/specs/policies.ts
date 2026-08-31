/**
 * Policies — the old book, loaded.
 *
 * This is the spec D3 is hardest on, and the rules it follows are worth stating
 * because the temptation is in every column:
 *
 *   Every amount is **recorded exactly as the file types it**. Sum insured, net
 *   premium, GST and final premium are four separate columns and four separate
 *   facts. A file that gives a final premium and no components imports a policy
 *   with no components — nothing is back-computed from the total, and nothing is
 *   split into a notional GST. A file that gives components and no total imports
 *   a policy with no total, which is an ordinary half-finished entry and is what
 *   the completion queue is for.
 *
 *   There is no `insurerNo` column. The company's own number arrives through
 *   `issue`, not through an entry, and an importer that wrote it would be
 *   claiming a document nobody has seen.
 *
 * Imported policies are entered on the **direct** path with `migrated`
 * provenance — the shape the data layer already has for "loaded from whatever
 * the agency kept the book in before" — and they land in `draft`, not `issued`.
 * Issuing is a person reading the insurer's document (§9), and a spreadsheet is
 * not that document.
 */

import { PREMIUM_MODES } from '../../../domain/workflows'
import { FIELD_KINDS } from '../../../domain/dataport'
import type { ImportSpec } from '../../../domain/dataport'

export const POLICY_SPEC: ImportSpec = {
  key: 'policies',
  label: 'Policies',
  noun: 'policy',
  nounPlural: 'policies',
  summary:
    'Loads existing contracts against customers already on file. Amounts are recorded exactly as your file types them and nothing is calculated.',
  sheetName: 'Policies',
  identity: ['customerId', 'productId', 'startDate'],
  writable: true,
  commitNote:
    'Each row becomes a policy in Draft on the direct-entry path, marked as migrated and tagged with this import\u2019s reference. Nothing is issued: issuing means a person read the insurer\u2019s document.',
  fields: [
    {
      key: 'customerId',
      label: 'Customer mobile',
      kind: FIELD_KINDS.reference,
      resolverKey: 'customer',
      required: true,
      synonyms: ['customer', 'mobile', 'customer number', 'client', 'proposer'],
      help: 'A mobile number or a customer reference already on file. Import the customers first.',
      example: '9825012345',
    },
    {
      key: 'companyId',
      label: 'Insurer',
      kind: FIELD_KINDS.reference,
      resolverKey: 'company',
      required: true,
      synonyms: ['company', 'insurance company', 'insurer name', 'underwriter'],
      example: 'HDFC ERGO General',
    },
    {
      key: 'productId',
      label: 'Product',
      kind: FIELD_KINDS.reference,
      resolverKey: 'product',
      required: true,
      synonyms: ['plan', 'product name', 'policy type', 'scheme'],
      example: 'Optima Secure',
    },
    {
      key: 'agencyId',
      label: 'Agency',
      kind: FIELD_KINDS.reference,
      resolverKey: 'agency',
      synonyms: ['agency code', 'branch', 'agency name'],
      help: 'Left empty, the agency appointed for that insurer is used when there is exactly one.',
      defaultNote: 'The single agency appointed for that insurer',
      example: '',
    },
    {
      key: 'premiumMode',
      label: 'Premium mode',
      kind: FIELD_KINDS.enum,
      synonyms: ['mode', 'payment mode', 'frequency', 'instalment'],
      options: [
        { value: PREMIUM_MODES.single, label: 'Single', synonyms: ['one time', 'lump sum'] },
        { value: PREMIUM_MODES.annual, label: 'Annual', synonyms: ['yearly', 'year'] },
        { value: PREMIUM_MODES.halfYearly, label: 'Half-yearly', synonyms: ['halfyearly', 'semi annual'] },
        { value: PREMIUM_MODES.quarterly, label: 'Quarterly', synonyms: ['quarter'] },
        { value: PREMIUM_MODES.monthly, label: 'Monthly', synonyms: ['month'] },
      ],
      help: 'Left empty, the policy is recorded as annual.',
      defaultNote: 'Recorded as annual',
      example: 'Annual',
    },
    {
      key: 'startDate',
      label: 'Start date',
      kind: FIELD_KINDS.date,
      synonyms: ['risk start', 'from date', 'inception', 'commencement'],
      example: '2025-04-01',
    },
    {
      key: 'expiryDate',
      label: 'Expiry date',
      kind: FIELD_KINDS.date,
      synonyms: ['to date', 'renewal date', 'end date', 'valid till'],
      example: '2026-03-31',
    },
    {
      key: 'sumInsured',
      label: 'Sum insured',
      kind: FIELD_KINDS.money,
      synonyms: ['si', 'cover', 'sum assured', 'idv'],
      example: '500000.00',
    },
    {
      key: 'netPremium',
      label: 'Net premium',
      kind: FIELD_KINDS.money,
      synonyms: ['basic premium', 'premium before gst', 'net'],
      help: 'Recorded as typed. It is never derived from the final premium.',
      example: '10580.00',
    },
    {
      key: 'gstAmount',
      label: 'GST',
      kind: FIELD_KINDS.money,
      synonyms: ['tax', 'gst amount', 'service tax'],
      help: 'Recorded as typed. It is never calculated from a rate.',
      example: '1904.40',
    },
    {
      key: 'finalPremium',
      label: 'Final premium',
      kind: FIELD_KINDS.money,
      synonyms: ['total premium', 'gross premium', 'premium paid', 'amount'],
      help: 'Recorded as typed. It is never added up from the parts above.',
      example: '12484.40',
    },
    {
      key: 'retentionClass',
      label: 'Retention class',
      kind: FIELD_KINDS.reference,
      resolverKey: 'retention',
      synonyms: ['retention'],
      help: 'Left empty, the standard class is used.',
      defaultNote: 'Standard records',
      example: '',
    },
  ],
}
