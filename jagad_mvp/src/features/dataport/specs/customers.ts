/**
 * Customers — the entity a migrating agency has most of.
 *
 * The required set is exactly what `CreateCustomerCommand` cannot be built
 * without, and no more. Everything else stays optional and stays absent when the
 * file does not carry it: a customer with no email is a customer with no email,
 * not a customer with an empty one.
 *
 * `ownerId` is optional here even though the command requires it. The wizard
 * says, in the confirmation, that rows without an owner column become the
 * importing user's — which is a fact about who did the import, not a guess about
 * the agency's book. An operator who wants them shared out maps the column.
 */

import { CUSTOMER_SOURCES, CUSTOMER_STATUSES } from '../../../data/repo'
import { FIELD_KINDS } from '../../../domain/dataport'
import type { ImportSpec } from '../../../domain/dataport'

export const CUSTOMER_SPEC: ImportSpec = {
  key: 'customers',
  label: 'Customers',
  noun: 'customer',
  nounPlural: 'customers',
  summary:
    'Puts people on the books as prospects, with KYC pending and no consent link out. Nothing is sent to anybody.',
  sheetName: 'Customers',
  identity: ['mobile'],
  writable: true,
  commitNote:
    'Each row becomes a customer record with KYC pending and no consent link issued. Nothing is sent to anybody, and duplicates are skipped rather than merged.',
  fields: [
    {
      key: 'fullName',
      label: 'Full name',
      kind: FIELD_KINDS.text,
      required: true,
      synonyms: ['name', 'customer name', 'client name', 'party name'],
      example: 'Rakesh Patel',
    },
    {
      key: 'mobile',
      label: 'Mobile',
      kind: FIELD_KINDS.phone,
      required: true,
      synonyms: ['mobile no', 'mobile number', 'phone', 'phone no', 'contact', 'contact no', 'cell'],
      help: 'Ten digits. A country code, a leading zero, spaces and dashes are all read and removed.',
      example: '9825012345',
    },
    {
      key: 'city',
      label: 'City',
      kind: FIELD_KINDS.text,
      required: true,
      synonyms: ['town', 'place'],
      example: 'Ahmedabad',
    },
    {
      key: 'state',
      label: 'State',
      kind: FIELD_KINDS.text,
      required: true,
      example: 'Gujarat',
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
        { value: CUSTOMER_SOURCES.subAgent, label: 'Sub-agent', synonyms: ['subagent', 'agent'] },
        { value: CUSTOMER_SOURCES.campaign, label: 'Campaign', synonyms: ['marketing'] },
        { value: CUSTOMER_SOURCES.renewal, label: 'Renewal' },
      ],
      help: 'Left empty, the customer is recorded as a walk-in.',
      defaultNote: 'Recorded as a walk-in',
      example: 'Walk-in',
    },
    {
      key: 'status',
      label: 'Status',
      kind: FIELD_KINDS.enum,
      options: [
        { value: CUSTOMER_STATUSES.prospect, label: 'Prospect', synonyms: ['lead', 'enquiry'] },
        { value: CUSTOMER_STATUSES.active, label: 'Active', synonyms: ['customer', 'live'] },
        { value: CUSTOMER_STATUSES.lapsed, label: 'Lapsed', synonyms: ['expired'] },
        { value: CUSTOMER_STATUSES.dormant, label: 'Dormant', synonyms: ['inactive'] },
      ],
      help: 'Left empty, the customer is recorded as a prospect.',
      defaultNote: 'Recorded as a prospect',
      example: 'Active',
    },
    {
      key: 'ownerId',
      label: 'Owner',
      kind: FIELD_KINDS.reference,
      resolverKey: 'staff',
      synonyms: ['owned by', 'relationship manager', 'rm', 'handled by', 'staff'],
      help: 'The name or email of somebody on staff. Left empty, you own the rows you import.',
      defaultNote: 'Owned by you',
      example: 'Priya Desai',
    },
    {
      key: 'altMobile',
      label: 'Alternate mobile',
      kind: FIELD_KINDS.phone,
      synonyms: ['alt mobile', 'second mobile', 'other phone'],
      example: '9898098980',
    },
    {
      key: 'email',
      label: 'Email',
      kind: FIELD_KINDS.email,
      synonyms: ['email id', 'e-mail', 'mail'],
      example: 'rakesh.patel@example.com',
    },
    {
      key: 'addressLine',
      label: 'Address',
      kind: FIELD_KINDS.text,
      synonyms: ['address line', 'residence', 'street'],
      example: '12 Satellite Road',
    },
    {
      key: 'pincode',
      label: 'Pincode',
      kind: FIELD_KINDS.text,
      synonyms: ['pin', 'postal code', 'zip'],
      example: '380015',
    },
    {
      key: 'dateOfBirth',
      label: 'Date of birth',
      kind: FIELD_KINDS.date,
      synonyms: ['dob', 'birth date'],
      help: 'Read day first: 03/04/1978 is 3 April 1978.',
      example: '1978-04-03',
    },
    {
      key: 'panNumber',
      label: 'PAN',
      kind: FIELD_KINDS.text,
      synonyms: ['pan no', 'pan number', 'income tax number'],
      example: 'ABCPP1234K',
    },
  ],
}
