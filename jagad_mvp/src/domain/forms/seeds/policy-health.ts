/**
 * Health policy entry — and the two-version pair that proves pinning works.
 *
 * Version 1 was published in January; version 2 added the nominee stage in May,
 * exactly as P-04's stored `policy_entry` pair does. Both are kept: version 1 is
 * `active: false` and is still the schema every January record renders under.
 * Deleting it would silently reshape those records, which is the failure
 * `catalogue.ts` exists to prevent.
 *
 * The premium stage is the record-only pattern in its final form: three typed
 * money leaves, and a roll-up that adds them and nothing else.
 */
import { defineFormSchema } from '../define'

const PROPOSER_STAGE = {
  key: 'proposer',
  label: 'Proposer',
  description: 'The person the policy is issued to, as printed on the proposal form.',
  fields: [
    {
      key: 'fullName',
      label: 'Proposer name',
      kind: 'text',
      required: true,
      visibleWhen: null,
      masterTypeId: null,
    },
    {
      key: 'mobile',
      label: 'Mobile',
      kind: 'text',
      required: true,
      visibleWhen: null,
      masterTypeId: null,
      maxLength: 10,
      hint: 'Ten digits, no country code.',
    },
    {
      key: 'dateOfBirth',
      label: 'Date of birth',
      kind: 'date',
      required: true,
      visibleWhen: null,
      masterTypeId: null,
    },
    {
      key: 'occupation',
      label: 'Occupation',
      kind: 'select',
      required: false,
      visibleWhen: null,
      masterTypeId: 'mst-occupation',
    },
    {
      key: 'city',
      label: 'City',
      kind: 'select',
      required: true,
      visibleWhen: null,
      masterTypeId: 'mst-city',
    },
  ],
} as const

const COVER_STAGE = {
  key: 'cover',
  label: 'Cover',
  fields: [
    {
      key: 'sumInsured',
      label: 'Sum insured',
      kind: 'money',
      required: true,
      visibleWhen: null,
      masterTypeId: null,
    },
    {
      key: 'startDate',
      label: 'Risk start date',
      kind: 'date',
      required: true,
      visibleWhen: null,
      masterTypeId: null,
    },
    {
      key: 'expiryDate',
      label: 'Expiry date',
      kind: 'date',
      required: true,
      visibleWhen: null,
      masterTypeId: null,
    },
    {
      key: 'floater',
      label: 'Family floater',
      kind: 'boolean',
      required: false,
      visibleWhen: null,
      masterTypeId: null,
    },
    // The branch the tests exercise: turn the floater on and the member table
    // appears; turn it off and nothing about it is asked, validated or missing.
    {
      key: 'members',
      label: 'Members covered',
      kind: 'group',
      required: true,
      visibleWhen: { field: 'floater', equals: 'true' },
      masterTypeId: null,
      rowLabel: 'Member',
      addLabel: 'Add a member',
      minRows: 2,
      maxRows: 6,
      fields: [
        {
          key: 'memberName',
          label: 'Name',
          kind: 'text',
          required: true,
          visibleWhen: null,
          masterTypeId: null,
        },
        {
          key: 'memberRelationship',
          label: 'Relationship',
          kind: 'select',
          required: true,
          visibleWhen: null,
          masterTypeId: 'mst-relationship',
        },
        {
          key: 'memberDateOfBirth',
          label: 'Date of birth',
          kind: 'date',
          required: true,
          visibleWhen: null,
          masterTypeId: null,
        },
        {
          key: 'declarationMade',
          label: 'Declaration made on the proposal',
          kind: 'boolean',
          required: false,
          visibleWhen: null,
          masterTypeId: null,
        },
        {
          key: 'declarationNote',
          label: 'Declaration as written on the proposal',
          kind: 'textarea',
          required: true,
          visibleWhen: { field: 'declarationMade', equals: 'true' },
          masterTypeId: null,
          hint: 'Transcribe what the proposer wrote. This never leaves the staff screen.',
        },
      ],
    },
  ],
} as const

/**
 * Typed components, then the roll-up.
 *
 * `finalPremium` names the three leaves above it and the GST leaf beside it.
 * There is no property on it that could say "18 per cent of net", and that is
 * the whole of D3 in one field definition.
 */
const PREMIUM_STAGE = {
  key: 'premium',
  label: 'Premium',
  description: 'Every figure here is read off the insurer document and typed.',
  fields: [
    {
      key: 'basePremium',
      label: 'Base premium',
      kind: 'money',
      required: true,
      visibleWhen: null,
      masterTypeId: null,
    },
    {
      key: 'loadingAmount',
      label: 'Loading',
      kind: 'money',
      required: false,
      visibleWhen: null,
      masterTypeId: null,
      hint: 'As stated on the insurer counter-offer, if any.',
    },
    {
      key: 'gstAmount',
      label: 'GST',
      kind: 'money',
      required: false,
      visibleWhen: null,
      masterTypeId: null,
    },
    {
      key: 'finalPremium',
      label: 'Final premium',
      kind: 'rollup',
      required: false,
      visibleWhen: null,
      masterTypeId: null,
      // Only figures that add. A "discount" component would be a subtraction the
      // vocabulary cannot express, and an insurer's net figure already carries it.
      components: ['basePremium', 'loadingAmount'],
      gstField: 'gstAmount',
    },
    {
      key: 'premiumMode',
      label: 'Premium mode',
      kind: 'select',
      required: true,
      visibleWhen: null,
      masterTypeId: null,
      options: [
        { value: 'annual', label: 'Annual' },
        { value: 'half_yearly', label: 'Half yearly' },
        { value: 'quarterly', label: 'Quarterly' },
        { value: 'monthly', label: 'Monthly' },
      ],
    },
  ],
} as const

const NOMINEE_STAGE = {
  key: 'nominee',
  label: 'Nominee',
  fields: [
    {
      key: 'nomineeName',
      label: 'Nominee name',
      kind: 'text',
      required: true,
      visibleWhen: null,
      masterTypeId: null,
    },
    {
      key: 'nomineeRelationship',
      label: 'Relationship',
      kind: 'select',
      required: true,
      visibleWhen: null,
      masterTypeId: 'mst-relationship',
    },
    {
      key: 'nomineeAadhaarLast4',
      label: 'Nominee Aadhaar last 4',
      kind: 'text',
      required: false,
      visibleWhen: null,
      masterTypeId: null,
      maxLength: 4,
      hint: 'Last four digits only. The full number is never recorded anywhere.',
    },
  ],
} as const

export const HEALTH_POLICY_ENTRY_V1 = defineFormSchema({
  id: 'frm-policy-health-v1',
  objectKey: 'policy_entry_health',
  productId: null,
  version: 1,
  title: 'Health policy entry',
  stages: [PROPOSER_STAGE, COVER_STAGE, PREMIUM_STAGE],
  publishedAt: '2026-01-05T04:30:00.000Z',
  active: false,
})

export const HEALTH_POLICY_ENTRY_V2 = defineFormSchema({
  id: 'frm-policy-health-v2',
  objectKey: 'policy_entry_health',
  productId: null,
  version: 2,
  title: 'Health policy entry',
  stages: [PROPOSER_STAGE, COVER_STAGE, PREMIUM_STAGE, NOMINEE_STAGE],
  publishedAt: '2026-05-18T05:00:00.000Z',
  active: true,
})
