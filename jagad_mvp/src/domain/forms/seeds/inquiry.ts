/**
 * Inquiry capture — the form the front desk fills in while somebody is on the
 * phone, and the one that shows what branching is for.
 *
 * Flow 1 says an inquiry is taken in seconds and routed by category. So the
 * contact stage asks five things, and the interest stage asks only what the
 * chosen line needs: nobody is asked for a registration number about a health
 * cover, and the motor block is never validated when it is not on screen.
 *
 * No money anywhere. An inquiry is an intention, and a figure attached to an
 * intention is a quotation the agency has not made yet.
 */
import { defineFormSchema } from '../define'

export const INQUIRY_CAPTURE_V1 = defineFormSchema({
  id: 'frm-inquiry-capture-v1',
  objectKey: 'inquiry',
  productId: null,
  version: 1,
  title: 'Inquiry capture',
  publishedAt: '2026-01-05T04:30:00.000Z',
  active: true,
  stages: [
    {
      key: 'contact',
      label: 'Contact',
      fields: [
        {
          key: 'contactName',
          label: 'Name',
          kind: 'text',
          required: true,
          visibleWhen: null,
          masterTypeId: null,
        },
        {
          key: 'contactMobile',
          label: 'Mobile',
          kind: 'text',
          required: true,
          visibleWhen: null,
          masterTypeId: null,
          maxLength: 10,
          hint: 'The number every follow-up message goes to.',
        },
        {
          key: 'contactEmail',
          label: 'Email',
          kind: 'text',
          required: false,
          visibleWhen: null,
          masterTypeId: null,
        },
        {
          key: 'source',
          label: 'Source',
          kind: 'select',
          required: true,
          visibleWhen: null,
          masterTypeId: 'mst-inquiry-source',
        },
        {
          key: 'city',
          label: 'City',
          kind: 'select',
          required: false,
          visibleWhen: null,
          masterTypeId: 'mst-city',
        },
      ],
    },
    {
      key: 'interest',
      label: 'Interest',
      fields: [
        {
          key: 'line',
          label: 'Line of business',
          kind: 'select',
          required: true,
          visibleWhen: null,
          masterTypeId: null,
          options: [
            { value: 'health', label: 'Health' },
            { value: 'motor', label: 'Motor' },
            { value: 'life', label: 'Life' },
            { value: 'travel', label: 'Travel' },
            { value: 'property', label: 'Property' },
          ],
        },
        {
          key: 'coverFor',
          label: 'Cover for',
          kind: 'select',
          required: true,
          visibleWhen: { field: 'line', equals: 'health' },
          masterTypeId: null,
          options: [
            { value: 'individual', label: 'One person' },
            { value: 'floater', label: 'Family floater' },
            { value: 'senior', label: 'Senior citizen' },
          ],
        },
        {
          key: 'existingCoverExpiry',
          label: 'Existing cover expires on',
          kind: 'date',
          required: false,
          visibleWhen: { field: 'line', oneOf: ['health', 'motor'] },
          masterTypeId: null,
        },
        {
          key: 'vehicleRegistrationNo',
          label: 'Registration number',
          kind: 'text',
          required: true,
          visibleWhen: { field: 'line', equals: 'motor' },
          masterTypeId: null,
          placeholder: 'GJ 05 AB 1234',
        },
        {
          key: 'lifeGoal',
          label: 'What the cover is for',
          kind: 'select',
          required: true,
          visibleWhen: { field: 'line', equals: 'life' },
          masterTypeId: null,
          options: [
            { value: 'protection', label: 'Family protection' },
            { value: 'child-education', label: 'Child education' },
            { value: 'retirement', label: 'Retirement' },
            { value: 'tax-planning', label: 'Tax planning' },
          ],
        },
        {
          key: 'destination',
          label: 'Destination',
          kind: 'text',
          required: true,
          visibleWhen: { field: 'line', equals: 'travel' },
          masterTypeId: null,
        },
        {
          key: 'note',
          label: 'What they asked for, in their words',
          kind: 'textarea',
          required: false,
          visibleWhen: null,
          masterTypeId: null,
        },
      ],
    },
    {
      key: 'handling',
      label: 'Handling',
      fields: [
        {
          key: 'preferredContactTime',
          label: 'Best time to call back',
          kind: 'select',
          required: false,
          visibleWhen: null,
          masterTypeId: null,
          options: [
            { value: 'morning', label: 'Morning' },
            { value: 'afternoon', label: 'Afternoon' },
            { value: 'evening', label: 'Evening' },
          ],
        },
        {
          key: 'followUpOn',
          label: 'Follow up on',
          kind: 'date',
          required: false,
          visibleWhen: null,
          masterTypeId: null,
        },
      ],
    },
  ],
})
