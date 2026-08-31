/**
 * What the customer actually needs — FR-06.16, and the input §9.2 assumed.
 *
 * The quotation composer opens with "Assignee selects the customer + candidate
 * policies", as if the agent already knows how many people are being covered,
 * how old they are, what the household can spend and what cover they already
 * hold. Somebody found all that out on the phone, and until now there was
 * nowhere to put it: it lived in a notebook, and the composer was filled in from
 * memory.
 *
 * So this is the discovery conversation, as a form. It is a schema rather than
 * a fixed screen for the same reason every other form here is: the questions a
 * health quote needs are not the questions a motor quote needs, and an admin
 * adding "do you want maternity cover" should not need a release.
 *
 * One object key per line, as `policy_entry_health` and `policy_entry_motor`
 * already do. A single `inquiry_requirement` key holding two live schemas would
 * break the rule that an object has exactly one live version, and that rule is
 * what makes "render this record under the schema it was captured with" a
 * question with one answer.
 *
 * Two things it deliberately does not ask for.
 *
 * No money. A budget band is a range the customer said out loud, so it is a
 * `select` over bands rather than an amount box — an amount box here would be
 * the first premium figure in the product that nobody typed off a document, and
 * D3 exists to stop exactly that.
 *
 * No diagnosis. "Any existing conditions" is a yes/no, and the detail belongs on
 * the member record behind the KYC grant where it is classified `sensitive`.
 * A free-text box asking what is wrong with somebody, sitting on an inquiry, is
 * a health record in a place with none of the protections a health record needs.
 */
import { defineFormSchema } from '../define'

export const REQUIREMENT_HEALTH_V1 = defineFormSchema({
  id: 'frm-requirement-health-v1',
  objectKey: 'inquiry_requirement_health',
  productId: null,
  version: 1,
  title: 'Health requirement',
  publishedAt: '2026-08-01T05:00:00.000Z',
  active: true,
  stages: [
    {
      key: 'household',
      label: 'Who is being covered',
      fields: [
        {
          key: 'memberCount',
          label: 'People to cover',
          kind: 'number',
          required: true,
          visibleWhen: null,
          masterTypeId: null,
          min: 1,
          max: 12,
        },
        {
          key: 'eldestAge',
          label: 'Age of the eldest',
          kind: 'number',
          required: true,
          visibleWhen: null,
          masterTypeId: null,
          min: 0,
          max: 110,
          hint: 'The age band the premium turns on. The insurer sets it, not this form.',
        },
        {
          key: 'coverType',
          label: 'Cover type',
          kind: 'select',
          required: false,
          visibleWhen: null,
          masterTypeId: null,
          options: [
            { value: 'floater', label: 'Family floater' },
            { value: 'individual', label: 'Individual, one policy each' },
            { value: 'undecided', label: 'Not decided yet' },
          ],
        },
        {
          key: 'maternityWanted',
          label: 'Maternity cover wanted',
          kind: 'boolean',
          required: false,
          visibleWhen: { field: 'coverType', equals: 'floater' },
          masterTypeId: null,
        },
      ],
    },
    {
      key: 'position',
      label: 'What they have and what they want',
      fields: [
        {
          key: 'hasExistingCover',
          label: 'Already covered somewhere',
          kind: 'boolean',
          required: false,
          visibleWhen: null,
          masterTypeId: null,
        },
        {
          key: 'existingInsurer',
          label: 'Existing insurer',
          kind: 'text',
          required: false,
          visibleWhen: { field: 'hasExistingCover', equals: 'true' },
          masterTypeId: null,
          maxLength: 80,
        },
        {
          key: 'portingIn',
          label: 'Wants to port the existing policy in',
          kind: 'boolean',
          required: false,
          visibleWhen: { field: 'hasExistingCover', equals: 'true' },
          masterTypeId: null,
          hint: 'Porting keeps the waiting periods already served. It changes which products can be offered.',
        },
        {
          key: 'existingConditions',
          label: 'Any pre-existing conditions declared',
          kind: 'boolean',
          required: false,
          visibleWhen: null,
          masterTypeId: null,
          hint: 'Yes or no only. The detail belongs on the member record, where it is protected.',
        },
        {
          key: 'budgetBand',
          label: 'Budget the customer named',
          kind: 'select',
          required: false,
          visibleWhen: null,
          masterTypeId: null,
          options: [
            { value: 'under_10k', label: 'Under 10,000 a year' },
            { value: '10k_20k', label: '10,000 to 20,000' },
            { value: '20k_35k', label: '20,000 to 35,000' },
            { value: '35k_plus', label: 'Above 35,000' },
            { value: 'not_said', label: 'Did not say' },
          ],
          hint: 'A band the customer said out loud, not a quote. Nothing here becomes a premium.',
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
