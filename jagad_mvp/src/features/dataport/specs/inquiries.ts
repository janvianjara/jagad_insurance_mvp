/**
 * Inquiries — a bought lead list, or last quarter's enquiry register.
 *
 * Canvas 1.6 gets an inquiry on the books with a name and a mobile number, and
 * that is exactly what is required here. Every imported inquiry is born in `new`
 * and is routed by the same recipe that routes one typed in by hand; the
 * importer sets no owner and no status, because doing either would skip the
 * routing that decides them.
 *
 * `Referred by` exists because `source: referral` and a referrer are one fact in
 * two halves — §9 refuses a referral with nobody on the other end of it. A row
 * that says Referral with the column empty is refused by the repository, and the
 * receipt prints that refusal in the machine's own words rather than quietly
 * filing the lead as a walk-in.
 */

import { CUSTOMER_SOURCES } from '../../../data/repo'
import { FIELD_KINDS } from '../../../domain/dataport'
import type { ImportSpec } from '../../../domain/dataport'

export const INQUIRY_SPEC: ImportSpec = {
  key: 'inquiries',
  label: 'Inquiries',
  noun: 'inquiry',
  nounPlural: 'inquiries',
  summary:
    'Records leads in New, ready for routing. No owner and no TAT are set here — the routing recipe decides both.',
  sheetName: 'Inquiries',
  identity: ['contactMobile'],
  writable: true,
  commitNote:
    'Each row becomes an inquiry in New. Routing assigns it and sets its TAT, exactly as it would for one taken over the phone.',
  fields: [
    {
      key: 'contactName',
      label: 'Contact name',
      kind: FIELD_KINDS.text,
      required: true,
      synonyms: ['name', 'lead name', 'customer name', 'party'],
      example: 'Meera Shah',
    },
    {
      key: 'contactMobile',
      label: 'Contact mobile',
      kind: FIELD_KINDS.phone,
      required: true,
      synonyms: ['mobile', 'mobile no', 'phone', 'contact', 'contact no'],
      example: '9898098980',
    },
    {
      key: 'source',
      label: 'Source',
      kind: FIELD_KINDS.enum,
      synonyms: ['lead source', 'came from'],
      options: [
        { value: CUSTOMER_SOURCES.walkIn, label: 'Walk-in', synonyms: ['walkin', 'office', 'direct'] },
        { value: CUSTOMER_SOURCES.website, label: 'Website', synonyms: ['web', 'online'] },
        { value: CUSTOMER_SOURCES.referral, label: 'Referral', synonyms: ['reference', 'referred'] },
        { value: CUSTOMER_SOURCES.subAgent, label: 'Sub-agent', synonyms: ['subagent'] },
        { value: CUSTOMER_SOURCES.campaign, label: 'Campaign', synonyms: ['marketing'] },
        { value: CUSTOMER_SOURCES.renewal, label: 'Renewal' },
      ],
      help: 'Left empty, the lead is recorded as a walk-in.',
      defaultNote: 'Recorded as a walk-in',
      example: 'Campaign',
    },
    {
      key: 'categoryId',
      label: 'Category',
      kind: FIELD_KINDS.reference,
      resolverKey: 'category',
      synonyms: ['product category', 'line', 'interest', 'requirement'],
      help: 'One of the configured inquiry categories. Left empty, the lead arrives unrouted for an admin to place.',
      example: 'Motor',
    },
    {
      key: 'referrerName',
      label: 'Referred by',
      kind: FIELD_KINDS.text,
      synonyms: ['referrer', 'reference name', 'introduced by'],
      help: 'Required on a row whose source is Referral — a referral with nobody on the other end cannot be recorded.',
      example: '',
    },
    {
      key: 'contactEmail',
      label: 'Email',
      kind: FIELD_KINDS.email,
      synonyms: ['email id', 'e-mail', 'mail'],
      example: 'meera.shah@example.com',
    },
    {
      key: 'notes',
      label: 'Notes',
      kind: FIELD_KINDS.text,
      synonyms: ['remark', 'remarks', 'comment', 'description'],
      example: 'Asked about a family floater for four.',
    },
  ],
}
