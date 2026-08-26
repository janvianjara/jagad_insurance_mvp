/**
 * Life policy entry — premium mode, paying term, riders, and the cashflow table.
 *
 * The LI form is the one that forces the vocabulary to be honest. An insurer's
 * benefit illustration is a table of years, premiums due and survival benefits,
 * and the temptation is to let the platform generate it from the mode and the
 * term. It does not. The rows are a repeating group somebody transcribes from
 * the illustration, because every one of those figures is the insurer's number,
 * not ours — and a projection this platform invented would be a promise it has
 * no standing to make.
 *
 * Nothing sums the cashflow rows either. Cross-row aggregation is not in the
 * grammar: a roll-up names typed leaves, and rows are not leaves.
 */
import { defineFormSchema } from '../define'

/** Every mode except single pays over a term, which is what the branch below asks. */
const INSTALMENT_MODES = ['annual', 'half_yearly', 'quarterly', 'monthly'] as const

export const LIFE_POLICY_ENTRY_V1 = defineFormSchema({
  id: 'frm-policy-life-v1',
  objectKey: 'policy_entry_life',
  productId: null,
  version: 1,
  title: 'Life policy entry',
  publishedAt: '2026-01-05T04:30:00.000Z',
  active: true,
  stages: [
    {
      key: 'proposer',
      label: 'Proposer',
      fields: [
        {
          key: 'fullName',
          label: 'Life assured',
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
      ],
    },
    {
      key: 'plan',
      label: 'Plan',
      fields: [
        {
          key: 'planName',
          label: 'Plan name',
          kind: 'text',
          required: true,
          visibleWhen: null,
          masterTypeId: null,
        },
        {
          key: 'sumInsured',
          label: 'Sum assured',
          kind: 'money',
          required: true,
          visibleWhen: null,
          masterTypeId: null,
        },
        {
          key: 'premiumMode',
          label: 'Premium mode',
          kind: 'select',
          required: true,
          visibleWhen: null,
          masterTypeId: null,
          options: [
            { value: 'single', label: 'Single premium' },
            { value: 'annual', label: 'Annual' },
            { value: 'half_yearly', label: 'Half yearly' },
            { value: 'quarterly', label: 'Quarterly' },
            { value: 'monthly', label: 'Monthly' },
          ],
        },
        {
          key: 'policyTerm',
          label: 'Policy term (years)',
          kind: 'number',
          required: true,
          visibleWhen: null,
          masterTypeId: null,
          min: 1,
          max: 60,
        },
        // A single-premium policy has no paying term, so the question is not
        // asked, not validated and not counted as missing.
        {
          key: 'premiumPayingTerm',
          label: 'Premium paying term (years)',
          kind: 'number',
          required: true,
          visibleWhen: { field: 'premiumMode', oneOf: INSTALMENT_MODES },
          masterTypeId: null,
          min: 1,
          max: 60,
        },
        {
          key: 'startDate',
          label: 'Risk commencement date',
          kind: 'date',
          required: true,
          visibleWhen: null,
          masterTypeId: null,
        },
        {
          key: 'expiryDate',
          label: 'Maturity date',
          kind: 'date',
          required: true,
          visibleWhen: null,
          masterTypeId: null,
        },
      ],
    },
    {
      key: 'riders',
      label: 'Riders',
      description: 'Each rider as it appears on the proposal, with its own figures.',
      fields: [
        {
          key: 'riders',
          label: 'Riders',
          kind: 'group',
          required: false,
          visibleWhen: null,
          masterTypeId: null,
          rowLabel: 'Rider',
          addLabel: 'Add a rider',
          maxRows: 6,
          fields: [
            {
              key: 'riderName',
              label: 'Rider',
              kind: 'select',
              required: true,
              visibleWhen: null,
              masterTypeId: null,
              options: [
                { value: 'accidental-death', label: 'Accidental death benefit' },
                { value: 'critical-illness', label: 'Critical illness' },
                { value: 'waiver-of-premium', label: 'Waiver of premium' },
                { value: 'term-rider', label: 'Term rider' },
              ],
            },
            {
              key: 'riderSumAssured',
              label: 'Rider sum assured',
              kind: 'money',
              required: true,
              visibleWhen: null,
              masterTypeId: null,
            },
            {
              key: 'riderPremium',
              label: 'Rider premium',
              kind: 'money',
              required: true,
              visibleWhen: null,
              masterTypeId: null,
            },
          ],
        },
      ],
    },
    {
      key: 'cashflow',
      label: 'Cashflow',
      description:
        'Transcribed from the insurer benefit illustration. The platform does not project it.',
      fields: [
        {
          key: 'cashflow',
          label: 'Benefit illustration',
          kind: 'group',
          required: false,
          visibleWhen: null,
          masterTypeId: null,
          rowLabel: 'Policy year',
          addLabel: 'Add a policy year',
          maxRows: 60,
          fields: [
            {
              key: 'policyYear',
              label: 'Policy year',
              kind: 'number',
              required: true,
              visibleWhen: null,
              masterTypeId: null,
              min: 1,
              max: 60,
            },
            {
              key: 'premiumDue',
              label: 'Premium due',
              kind: 'money',
              required: true,
              visibleWhen: null,
              masterTypeId: null,
            },
            {
              key: 'survivalBenefit',
              label: 'Survival benefit',
              kind: 'money',
              required: false,
              visibleWhen: null,
              masterTypeId: null,
            },
            {
              key: 'illustrationNote',
              label: 'Note',
              kind: 'text',
              required: false,
              visibleWhen: null,
              masterTypeId: null,
            },
          ],
        },
      ],
    },
    {
      key: 'premium',
      label: 'Premium',
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
          key: 'extraMortalityPremium',
          label: 'Extra mortality premium',
          kind: 'money',
          required: false,
          visibleWhen: null,
          masterTypeId: null,
          hint: 'As loaded by underwriting on the acceptance letter.',
        },
        {
          key: 'riderPremiumTotal',
          label: 'Rider premium as printed',
          kind: 'money',
          required: false,
          visibleWhen: null,
          masterTypeId: null,
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
          components: ['basePremium', 'extraMortalityPremium', 'riderPremiumTotal'],
          gstField: 'gstAmount',
        },
      ],
    },
  ],
})
