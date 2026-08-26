/**
 * KYC capture — and the one place the Aadhaar rule shows up as a field.
 *
 * `aadhaarLast4` is four characters wide, it is labelled as four, and there is
 * no field beside it for the other eight. The rule (charter, FR-11) is that the
 * staff UI never holds more than the last four and no surface ever holds the
 * full number — so the schema that captures KYC never offers anywhere to put it.
 *
 * The consent stage is a required checkbox plus the date it was given, because
 * `kyc.completed` is an event with a person behind it, not a state a screen can
 * drift into.
 */
import { defineFormSchema } from '../define'

export const KYC_CAPTURE_V1 = defineFormSchema({
  id: 'frm-kyc-capture-v1',
  objectKey: 'kyc',
  productId: null,
  version: 1,
  title: 'KYC capture',
  publishedAt: '2026-01-05T04:30:00.000Z',
  active: true,
  stages: [
    {
      key: 'identity',
      label: 'Identity',
      fields: [
        {
          key: 'aadhaarLast4',
          label: 'Aadhaar last 4',
          kind: 'text',
          required: true,
          visibleWhen: null,
          masterTypeId: null,
          maxLength: 4,
          hint: 'The last four digits only. The full number is never recorded, shown or exported.',
        },
        {
          key: 'panNumber',
          label: 'PAN',
          kind: 'text',
          required: true,
          visibleWhen: null,
          masterTypeId: null,
          maxLength: 10,
          placeholder: 'ABCDE1234F',
        },
        {
          key: 'dateOfBirth',
          label: 'Date of birth',
          kind: 'date',
          required: true,
          visibleWhen: null,
          masterTypeId: null,
        },
      ],
    },
    {
      key: 'address',
      label: 'Address',
      fields: [
        {
          key: 'addressLine',
          label: 'Address',
          kind: 'textarea',
          required: true,
          visibleWhen: null,
          masterTypeId: null,
        },
        {
          key: 'city',
          label: 'City',
          kind: 'select',
          required: true,
          visibleWhen: null,
          masterTypeId: 'mst-city',
        },
        {
          key: 'pincode',
          label: 'PIN code',
          kind: 'text',
          required: true,
          visibleWhen: null,
          masterTypeId: null,
          maxLength: 6,
        },
      ],
    },
    {
      key: 'documents',
      label: 'Documents',
      fields: [
        {
          key: 'identityProofType',
          label: 'Identity proof',
          kind: 'select',
          required: true,
          visibleWhen: null,
          masterTypeId: null,
          options: [
            { value: 'aadhaar', label: 'Aadhaar' },
            { value: 'passport', label: 'Passport' },
            { value: 'driving-licence', label: 'Driving licence' },
            { value: 'voter-id', label: 'Voter ID' },
          ],
        },
        {
          key: 'identityProofFile',
          label: 'Identity proof copy',
          kind: 'file',
          required: true,
          visibleWhen: null,
          masterTypeId: null,
          accept: 'application/pdf,image/*',
        },
        {
          key: 'addressProofFile',
          label: 'Address proof copy',
          kind: 'file',
          required: true,
          visibleWhen: null,
          masterTypeId: null,
          accept: 'application/pdf,image/*',
        },
      ],
    },
    {
      key: 'consent',
      label: 'Consent',
      fields: [
        {
          key: 'consentGiven',
          label: 'The customer has consented to the agency holding these documents',
          kind: 'boolean',
          required: true,
          visibleWhen: null,
          masterTypeId: null,
        },
        {
          key: 'consentRecordedOn',
          label: 'Consent recorded on',
          kind: 'date',
          required: true,
          visibleWhen: { field: 'consentGiven', equals: 'true' },
          masterTypeId: null,
        },
        {
          key: 'consentChannel',
          label: 'How it was given',
          kind: 'select',
          required: true,
          visibleWhen: { field: 'consentGiven', equals: 'true' },
          masterTypeId: null,
          options: [
            { value: 'in-person', label: 'In person' },
            { value: 'whatsapp', label: 'WhatsApp' },
            { value: 'email', label: 'Email' },
            { value: 'consent-link', label: 'Consent link' },
          ],
        },
      ],
    },
  ],
})
