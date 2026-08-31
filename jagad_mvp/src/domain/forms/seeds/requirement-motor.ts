/**
 * The motor discovery conversation — FR-06.16.
 *
 * The counterpart to the health schema, and the reason requirement capture is a
 * schema at all: none of these questions makes sense on a health quote, and none
 * of the health questions makes sense here. A single fixed "requirements" screen
 * would have to show both sets to everybody and let the agent work out which
 * half to ignore.
 *
 * The same two refusals hold. No money — the previous premium is a figure on a
 * document the customer has, and it is recorded when that document is uploaded,
 * not from what somebody remembers over the phone. And no registration number:
 * it is captured at policy entry against the papers, and an inquiry that carries
 * one before anybody has seen them is a record with an unverified identifier in
 * it.
 */
import { defineFormSchema } from '../define'

export const REQUIREMENT_MOTOR_V1 = defineFormSchema({
  id: 'frm-requirement-motor-v1',
  objectKey: 'inquiry_requirement_motor',
  productId: null,
  version: 1,
  title: 'Motor requirement',
  publishedAt: '2026-08-01T05:00:00.000Z',
  active: true,
  stages: [
    {
      key: 'vehicle',
      label: 'The vehicle',
      fields: [
        {
          key: 'vehicleType',
          label: 'Vehicle type',
          kind: 'select',
          required: true,
          visibleWhen: null,
          masterTypeId: null,
          options: [
            { value: 'private_car', label: 'Private car' },
            { value: 'two_wheeler', label: 'Two wheeler' },
            { value: 'commercial', label: 'Commercial vehicle' },
          ],
        },
        {
          key: 'makeModel',
          label: 'Make and model',
          kind: 'text',
          required: false,
          visibleWhen: null,
          masterTypeId: null,
          maxLength: 80,
        },
        {
          key: 'manufactureYear',
          label: 'Year of manufacture',
          kind: 'number',
          required: false,
          visibleWhen: null,
          masterTypeId: null,
          min: 1980,
          max: 2100,
        },
        {
          key: 'isNewVehicle',
          label: 'Brand new, not yet registered',
          kind: 'boolean',
          required: false,
          visibleWhen: null,
          masterTypeId: null,
        },
      ],
    },
    {
      key: 'cover',
      label: 'What cover they want',
      fields: [
        {
          key: 'coverKind',
          label: 'Cover',
          kind: 'select',
          required: false,
          visibleWhen: null,
          masterTypeId: null,
          options: [
            { value: 'comprehensive', label: 'Comprehensive' },
            { value: 'third_party', label: 'Third party only' },
            { value: 'undecided', label: 'Wants advice' },
          ],
        },
        {
          key: 'addOnsWanted',
          label: 'Add-ons they asked about',
          kind: 'textarea',
          required: false,
          visibleWhen: { field: 'coverKind', equals: 'comprehensive' },
          masterTypeId: null,
          hint: 'Zero depreciation, engine protect, roadside — in their words.',
        },
        {
          key: 'hasClaimedBefore',
          label: 'Claimed on the current policy',
          kind: 'boolean',
          required: false,
          visibleWhen: { field: 'isNewVehicle', equals: 'false' },
          masterTypeId: null,
          hint: 'Decides whether the no-claim bonus carries over. The insurer confirms it from the papers.',
        },
        {
          key: 'expiryKnown',
          label: 'Current policy expires',
          kind: 'date',
          required: false,
          visibleWhen: { field: 'isNewVehicle', equals: 'false' },
          masterTypeId: null,
          hint: 'What the customer said. The recorded expiry comes off the policy document.',
        },
        {
          key: 'urgency',
          label: 'How soon',
          kind: 'select',
          required: false,
          visibleWhen: null,
          masterTypeId: null,
          options: [
            { value: 'this_week', label: 'This week' },
            { value: 'this_month', label: 'This month' },
            { value: 'exploring', label: 'Just exploring' },
          ],
        },
      ],
    },
  ],
})
