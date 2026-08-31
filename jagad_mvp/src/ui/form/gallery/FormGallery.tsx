import { useState } from 'react'
import type { ReactNode } from 'react'
import {
  CascadeSelect,
  Checkbox,
  Combobox,
  DatePicker,
  Field,
  FileDrop,
  FormRow,
  FormSection,
  Input,
  NumberInput,
  QuickAdd,
  QuickAddForm,
  RadioGroup,
  Select,
  Textarea,
  Toggle,
} from '..'
import type { CascadeNode, ComboboxOption, SelectOption } from '..'
import styles from './FormGallery.module.css'

const INSURERS: ComboboxOption[] = [
  { value: 'hdfc-ergo', label: 'HDFC Ergo', hint: 'General' },
  { value: 'niva-bupa', label: 'Niva Bupa', hint: 'Health' },
  { value: 'bajaj-allianz', label: 'Bajaj Allianz', hint: 'General' },
  { value: 'icici-lombard', label: 'ICICI Lombard', hint: 'General' },
  { value: 'tata-aig', label: 'Tata AIG', hint: 'General' },
  { value: 'iffco-tokio', label: 'IFFCO Tokio', hint: 'General' },
  { value: 'royal-sundaram', label: 'Royal Sundaram', hint: 'General' },
  { value: 'lic', label: 'LIC', hint: 'Life' },
]

const CHANNELS: SelectOption[] = [
  { value: 'walk-in', label: 'Walk-in' },
  { value: 'referral', label: 'Referral' },
  { value: 'agent', label: 'Sub-agent' },
  { value: 'renewal', label: 'Renewal call' },
  { value: 'portal', label: 'Customer portal', disabled: true },
]

const CATALOGUE: CascadeNode[] = [
  {
    value: 'hdfc-ergo',
    label: 'HDFC Ergo',
    children: [
      {
        value: 'optima-secure',
        label: 'Optima Secure',
        children: [
          { value: 'plan-5l', label: 'Sum insured 5L' },
          { value: 'plan-10l', label: 'Sum insured 10L' },
        ],
      },
      {
        value: 'motor-private',
        label: 'Private Car OD',
        children: [{ value: 'plan-zero-dep', label: 'Zero depreciation' }],
      },
    ],
  },
  {
    value: 'niva-bupa',
    label: 'Niva Bupa',
    children: [
      {
        value: 'reassure',
        label: 'ReAssure 2.0',
        children: [
          { value: 'plan-10l', label: 'Sum insured 10L' },
          { value: 'plan-25l', label: 'Sum insured 25L' },
        ],
      },
    ],
  },
]

function Block({
  title,
  note,
  children,
}: {
  title: string
  note: string
  children: ReactNode
}) {
  return (
    <div className={styles.block}>
      <div className={styles.blockHead}>
        <h3>{title}</h3>
        <span className={styles.caps}>src/ui/form</span>
      </div>
      <p className={styles.note}>{note}</p>
      {children}
    </div>
  )
}

/**
 * Every form primitive in the states it actually ships in: empty, filled,
 * hinted, in error, disabled, and at both densities.
 */
export default function FormGallery() {
  const [insurer, setInsurer] = useState<string | null>('niva-bupa')
  const [path, setPath] = useState<string[]>(['hdfc-ergo', 'optima-secure'])
  const [channel, setChannel] = useState('referral')
  const [consent, setConsent] = useState(true)
  const [autoRenew, setAutoRenew] = useState(false)
  const [members, setMembers] = useState<number | null>(3)
  const [files, setFiles] = useState<File[]>([])
  const [agents, setAgents] = useState<SelectOption[]>([{ value: 'kiran', label: 'Kiran Solanki' }])
  const [agent, setAgent] = useState('')
  const [newAgent, setNewAgent] = useState('')

  return (
    <div className={styles.gallery}>
      <Block
        title="Text entry"
        note="Every control reads its id, required flag and error wiring from the Field around it, so no call site can produce an unlabelled input."
      >
        <div className={styles.pane}>
          <FormRow columns={2}>
            <Field label="Customer name" required>
              <Input placeholder="Rakesh Patel" defaultValue="Rakesh Patel" />
            </Field>
            <Field label="Mobile" hint="Ten digits, no country code" required>
              <Input mono inputMode="tel" leading="+91" defaultValue="9825012345" />
            </Field>
            <Field label="Email" error="Enter an address the customer will read">
              <Input defaultValue="rakesh.patel@" />
            </Field>
            <Field label="Registration number" optional>
              <Input mono placeholder="GJ 01 AB 1234" disabled />
            </Field>
          </FormRow>
        </div>
      </Block>

      <Block
        title="Numbers, dates and long text"
        note="Numeric and date controls take the mono face with tabular figures. Amounts are NOT entered here — money is typed through RecordOnlyAmount, which exists so no code path can compute into an amount."
      >
        <div className={styles.pane}>
          <FormRow columns={3}>
            <Field label="Members covered" hint="Adults and children on the policy">
              <NumberInput value={members} onValueChange={setMembers} min={1} max={12} unit="lives" />
            </Field>
            <Field label="Risk start date" required>
              <DatePicker defaultValue="2026-09-01" />
            </Field>
            <Field label="Intimation logged at">
              <DatePicker withTime defaultValue="2026-08-26T11:30" />
            </Field>
          </FormRow>
          <FormRow columns={1}>
            <Field label="Call notes" hint="What the customer actually said, in their words">
              <Textarea
                rows={3}
                defaultValue="Wants the same cover as last year plus his father. Asked for two options before Diwali."
              />
            </Field>
          </FormRow>
        </div>
      </Block>

      <Block
        title="Choice from a list"
        note="The native select for short sets; the combobox once the list is long enough to need typing; the cascade when one choice constrains the next."
      >
        <div className={styles.pane}>
          <FormRow columns={2}>
            <Field label="Source channel" required>
              <Select
                options={CHANNELS}
                placeholder="Not stated"
                value={channel}
                onChange={(event) => setChannel(event.target.value)}
              />
            </Field>
            <Field label="Insurer" hint="Type to filter; arrow keys move, Enter selects">
              <Combobox
                options={INSURERS}
                value={insurer}
                onValueChange={setInsurer}
                placeholder="Search insurers"
              />
            </Field>
          </FormRow>
          <FormRow columns={1}>
            <Field
              label="Product"
              control="group"
              hint="Choosing a company clears the product below it, because it is not that company's product"
            >
              <CascadeSelect
                nodes={CATALOGUE}
                levels={['Company', 'Product', 'Plan']}
                value={path}
                onValueChange={setPath}
              />
            </Field>
          </FormRow>
          <p className={styles.state}>path: [{path.join(', ')}]</p>
        </div>
      </Block>

      <Block
        title="Adding the option that is missing"
        note="A dropdown that does not hold the name somebody needs is a dead end: the record is created a screen away, and a half-typed form is what it costs. The plus expands one row under the control, writes through the same guards the configuration screen uses, and selects what it made. It never navigates and never covers the work."
      >
        <div className={styles.pane}>
          <FormRow columns={2}>
            <Field label="Agent" optional hint="Attaches this to the agent it belongs to.">
              <QuickAdd
                label="New agent"
                form={(close) => (
                  <QuickAddForm
                    submitLabel="Add agent"
                    onCancel={close}
                    onSubmit={() => {
                      const value = newAgent.trim().toLowerCase().replace(/\s+/g, '-')
                      if (value === '') return
                      setAgents((current) => [...current, { value, label: newAgent.trim() }])
                      setAgent(value)
                      setNewAgent('')
                      close()
                    }}
                  >
                    <Field label="Name" required>
                      <Input
                        value={newAgent}
                        placeholder="Meera Joshi"
                        onChange={(event) => setNewAgent(event.target.value)}
                      />
                    </Field>
                  </QuickAddForm>
                )}
              >
                <Select
                  options={agents}
                  placeholder="No agent"
                  value={agent}
                  onChange={(event) => setAgent(event.target.value)}
                />
              </QuickAdd>
            </Field>
            <Field
              label="Sub-agent"
              optional
              hint="The plus refuses rather than making an orphan when what it needs is not chosen yet."
            >
              <QuickAdd
                label="New sub-agent"
                disabled={agent === ''}
                disabledReason="Choose an agent first: a sub-agent reports to one."
                form={(close) => (
                  <QuickAddForm submitLabel="Add sub-agent" onCancel={close} onSubmit={close}>
                    <Field label="Name" required>
                      <Input placeholder="Meera Joshi" />
                    </Field>
                  </QuickAddForm>
                )}
              >
                <Select options={[]} placeholder="No sub-agent" />
              </QuickAdd>
            </Field>
          </FormRow>
        </div>
      </Block>

      <Block
        title="Booleans"
        note="A checkbox is part of a form and applies on submit. A switch applies the moment it is flipped, which is why it is navy rather than green: it is an action, and green in this system means positive status only."
      >
        <div className={styles.pane}>
          <div className={styles.inline}>
            <Checkbox
              label="Consent recorded"
              description="Customer agreed to be contacted on WhatsApp"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
            />
            <Checkbox label="Select all in queue" indeterminate />
            <Checkbox label="Locked by retention" disabled />
          </div>
          <div className={styles.inline}>
            <Toggle
              checked={autoRenew}
              onCheckedChange={setAutoRenew}
              label="Send renewal reminders"
              description="Applies from the next cycle"
            />
          </div>
          <FormRow columns={2}>
            <Field label="Priority" control="group" required>
              <RadioGroup
                name="gallery-priority"
                orientation="horizontal"
                defaultValue="standard"
                options={[
                  { value: 'standard', label: 'Standard' },
                  { value: 'urgent', label: 'Urgent' },
                  { value: 'vip', label: 'VIP', description: 'Partner referral' },
                ]}
              />
            </Field>
            <Field
              label="Payout route"
              control="group"
              error="Choose how the settlement reaches the customer"
            >
              <RadioGroup
                name="gallery-payout"
                options={[
                  { value: 'neft', label: 'NEFT to registered account' },
                  { value: 'cheque', label: 'Cheque collection' },
                  { value: 'wallet', label: 'Sub-agent wallet', disabled: true },
                ]}
                invalid
              />
            </Field>
          </FormRow>
        </div>
      </Block>

      <Block
        title="Documents"
        note="The drop zone only hands files to the caller. Nothing here reads a document: extracted values reach a form through OcrField, never straight into a value."
      >
        <div className={styles.pane}>
          <Field
            label="Policy copy"
            control="group"
            hint="PDF or JPG, up to 10 MB per file"
            required
          >
            <FileDrop
              multiple
              accept="application/pdf,image/*"
              prompt="Drop the insurer's policy PDF here"
              hint="It will be attached to the record, not read"
              files={files}
              onFiles={(picked) => setFiles(picked)}
            />
          </Field>
        </div>
      </Block>

      <Block
        title="Density"
        note="U2: the same section at both densities. Control height, padding and font step all move from one attribute on the root."
      >
        <div className={styles.densityPair}>
          <div className={styles.pane} data-density="comfortable">
            <FormSection title="Comfortable" description="data-density=&quot;comfortable&quot;">
              <FormRow columns={1}>
                <Field label="Nominee name" required>
                  <Input defaultValue="Falguni Shah" />
                </Field>
                <Field label="Relationship">
                  <Select options={[{ value: 'spouse', label: 'Spouse' }]} defaultValue="spouse" />
                </Field>
              </FormRow>
            </FormSection>
          </div>
          <div className={styles.pane} data-density="compact">
            <FormSection title="Compact" description="data-density=&quot;compact&quot;">
              <FormRow columns={1}>
                <Field label="Nominee name" required>
                  <Input defaultValue="Falguni Shah" />
                </Field>
                <Field label="Relationship">
                  <Select options={[{ value: 'spouse', label: 'Spouse' }]} defaultValue="spouse" />
                </Field>
              </FormRow>
            </FormSection>
          </div>
        </div>
      </Block>
    </div>
  )
}
