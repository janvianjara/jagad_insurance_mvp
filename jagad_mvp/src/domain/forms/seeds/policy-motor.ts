/**
 * Motor policy entry — the cascade, the previous-policy branch and attachments.
 *
 * Same renderer, same reserved fields, entirely different form. That is the
 * claim P-12 makes and this file is one of the two places it is tested: nothing
 * in `<SchemaForm>` knows what a vehicle is.
 *
 * The premium stage splits own damage from third party because that is how a
 * motor schedule prints it, and the roll-up adds the two typed figures. No rate
 * table, no IDV percentage: the agent reads the schedule and types what it says.
 */
import { defineFormSchema } from '../define'

const VEHICLE_TREE = [
  {
    value: 'maruti-suzuki',
    label: 'Maruti Suzuki',
    children: [
      {
        value: 'swift',
        label: 'Swift',
        children: [
          { value: 'vxi', label: 'VXi' },
          { value: 'zxi', label: 'ZXi' },
          { value: 'zxi-plus', label: 'ZXi Plus' },
        ],
      },
      {
        value: 'baleno',
        label: 'Baleno',
        children: [
          { value: 'delta', label: 'Delta' },
          { value: 'zeta', label: 'Zeta' },
          { value: 'alpha', label: 'Alpha' },
        ],
      },
    ],
  },
  {
    value: 'hyundai',
    label: 'Hyundai',
    children: [
      {
        value: 'i20',
        label: 'i20',
        children: [
          { value: 'magna', label: 'Magna' },
          { value: 'sportz', label: 'Sportz' },
          { value: 'asta', label: 'Asta' },
        ],
      },
      {
        value: 'creta',
        label: 'Creta',
        children: [
          { value: 'e', label: 'E' },
          { value: 'sx', label: 'SX' },
          { value: 'sx-o', label: 'SX(O)' },
        ],
      },
    ],
  },
  {
    value: 'tata',
    label: 'Tata',
    children: [
      {
        value: 'nexon',
        label: 'Nexon',
        children: [
          { value: 'smart', label: 'Smart' },
          { value: 'creative', label: 'Creative' },
          { value: 'fearless', label: 'Fearless' },
        ],
      },
    ],
  },
] as const

export const MOTOR_POLICY_ENTRY_V1 = defineFormSchema({
  id: 'frm-policy-motor-v1',
  objectKey: 'policy_entry_motor',
  productId: null,
  version: 1,
  title: 'Motor policy entry',
  publishedAt: '2026-01-05T04:30:00.000Z',
  active: true,
  stages: [
    {
      key: 'proposer',
      label: 'Proposer',
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
    },
    {
      key: 'vehicle',
      label: 'Vehicle',
      fields: [
        {
          key: 'vehicleModel',
          label: 'Make, model and variant',
          kind: 'cascade',
          required: true,
          visibleWhen: null,
          masterTypeId: null,
          cascade: { levels: ['Make', 'Model', 'Variant'], nodes: VEHICLE_TREE },
        },
        {
          key: 'registrationNo',
          label: 'Registration number',
          kind: 'text',
          required: true,
          visibleWhen: null,
          masterTypeId: null,
          placeholder: 'GJ 05 AB 1234',
        },
        {
          key: 'registrationDate',
          label: 'Registration date',
          kind: 'date',
          required: true,
          visibleWhen: null,
          masterTypeId: null,
        },
        {
          key: 'fuelType',
          label: 'Fuel',
          kind: 'select',
          required: true,
          visibleWhen: null,
          masterTypeId: null,
          options: [
            { value: 'petrol', label: 'Petrol' },
            { value: 'diesel', label: 'Diesel' },
            { value: 'cng', label: 'CNG' },
            { value: 'electric', label: 'Electric' },
          ],
        },
        {
          key: 'sumInsured',
          label: 'Insured declared value',
          kind: 'money',
          required: true,
          visibleWhen: null,
          masterTypeId: null,
          hint: 'The IDV printed on the schedule, not one worked out here.',
        },
      ],
    },
    {
      key: 'history',
      label: 'Previous policy',
      fields: [
        {
          key: 'hasPreviousPolicy',
          label: 'Renewing an existing policy',
          kind: 'boolean',
          required: false,
          visibleWhen: null,
          masterTypeId: null,
        },
        {
          key: 'previousPolicyNo',
          label: 'Previous policy number',
          kind: 'text',
          required: true,
          visibleWhen: { field: 'hasPreviousPolicy', equals: 'true' },
          masterTypeId: null,
        },
        {
          key: 'previousInsurer',
          label: 'Previous insurer',
          kind: 'text',
          required: true,
          visibleWhen: { field: 'hasPreviousPolicy', equals: 'true' },
          masterTypeId: null,
        },
        {
          key: 'claimedLastYear',
          label: 'Claim made in the expiring year',
          kind: 'boolean',
          required: false,
          visibleWhen: { field: 'hasPreviousPolicy', equals: 'true' },
          masterTypeId: null,
        },
        // Two conditions, both true. The NCB slab is a term the previous
        // insurer certified — a choice transcribed, never a figure derived.
        {
          key: 'ncbSlab',
          label: 'No claim bonus slab',
          kind: 'select',
          required: true,
          visibleWhen: {
            all: [
              { field: 'hasPreviousPolicy', equals: 'true' },
              { field: 'claimedLastYear', equals: 'false' },
            ],
          },
          masterTypeId: null,
          options: [
            { value: 'nil', label: 'Nil' },
            { value: '20', label: '20 per cent' },
            { value: '25', label: '25 per cent' },
            { value: '35', label: '35 per cent' },
            { value: '45', label: '45 per cent' },
            { value: '50', label: '50 per cent' },
          ],
        },
      ],
    },
    {
      key: 'cover',
      label: 'Cover',
      fields: [
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
          key: 'addOns',
          label: 'Add-ons',
          kind: 'group',
          required: false,
          visibleWhen: null,
          masterTypeId: null,
          rowLabel: 'Add-on',
          addLabel: 'Add an add-on',
          maxRows: 8,
          fields: [
            {
              key: 'addOnName',
              label: 'Add-on',
              kind: 'select',
              required: true,
              visibleWhen: null,
              masterTypeId: null,
              options: [
                { value: 'zero-dep', label: 'Zero depreciation' },
                { value: 'engine-protect', label: 'Engine protect' },
                { value: 'roadside', label: 'Roadside assistance' },
                { value: 'consumables', label: 'Consumables' },
                { value: 'return-invoice', label: 'Return to invoice' },
                { value: 'ncb-protect', label: 'NCB protect' },
              ],
            },
            {
              key: 'addOnPremium',
              label: 'Add-on premium',
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
      key: 'premium',
      label: 'Premium',
      description: 'Split as the insurer schedule prints it.',
      fields: [
        {
          key: 'ownDamagePremium',
          label: 'Own damage premium',
          kind: 'money',
          required: true,
          visibleWhen: null,
          masterTypeId: null,
        },
        {
          key: 'thirdPartyPremium',
          label: 'Third party premium',
          kind: 'money',
          required: true,
          visibleWhen: null,
          masterTypeId: null,
        },
        {
          key: 'addOnPremiumTotal',
          label: 'Add-on premium as printed',
          kind: 'money',
          required: false,
          visibleWhen: null,
          masterTypeId: null,
          // Typed from the schedule rather than summed from the rows above:
          // cross-row aggregation is not something this vocabulary can do, and
          // the insurer's figure is the one the policy is issued on.
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
          components: ['ownDamagePremium', 'thirdPartyPremium', 'addOnPremiumTotal'],
          gstField: 'gstAmount',
        },
      ],
    },
    {
      key: 'documents',
      label: 'Documents',
      fields: [
        {
          key: 'rcCopy',
          label: 'RC copy',
          kind: 'file',
          required: true,
          visibleWhen: null,
          masterTypeId: null,
          accept: 'application/pdf,image/*',
        },
        {
          key: 'previousPolicyCopy',
          label: 'Expiring policy copy',
          kind: 'file',
          required: true,
          visibleWhen: { field: 'hasPreviousPolicy', equals: 'true' },
          masterTypeId: null,
          accept: 'application/pdf,image/*',
        },
      ],
    },
  ],
})
