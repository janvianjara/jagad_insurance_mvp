import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useRepositories } from '../../app/repositories-context'
import { useSessionStore } from '../../app/store'
import { useResource } from '../../lib/useResource'
import { PageHeader } from '../../components/AppShell'
import { Button } from '../../ui/Button'
import { Icon } from '../../ui/Icon'
import { Field, FormRow, FormSection, Input, Select, Textarea } from '../../ui/form'
import { Skeleton } from '../../ui/data'
import { useToaster } from '../../ui/surface'
import type { CustomerSource } from '../../data/repo'
import { useInquiryNow } from './clock'
import { inquiryIntake } from './data/intake'
import { SOURCE_LABEL } from './inquiry-view'
import styles from './InquiryCapture.module.css'

/**
 * Minimal capture — plan §4 `/inquiries/new`, canvas 1.6.
 *
 * The scenario is a sub-agent standing in front of a customer with a phone: they
 * have a name and a number and nothing else, and the inquiry has to exist before
 * they walk away. So name and mobile are the only required fields on this form,
 * and everything else — source, the sub-agent it belongs to, the category, a
 * note — is offered and optional.
 *
 * Leaving the category blank is a real answer rather than an omission: routing
 * then has nothing to match, and the inquiry lands in the unrouted queue with the
 * admin alert (§9). That is the point of canvas 1.5, and it is why this form does
 * not force a guess out of somebody in the field.
 *
 * The write goes through the repository like every other write. Capture records;
 * it does not route, notify or assign — those happen on the detail screen, behind
 * a `<ConfirmGate>`, where the person doing them can see what they will send.
 */
export function InquiryCaptureScreen() {
  const repositories = useRepositories()
  const navigate = useNavigate()
  const toaster = useToaster()
  const user = useSessionStore((state) => state.user)
  const now = useInquiryNow()
  const intake = inquiryIntake(repositories)

  const context = useResource(async () => {
    const [categories, agents, users] = await Promise.all([
      repositories.config.categories(),
      repositories.agents.list({ page: 1, pageSize: 200 }),
      repositories.config.users(),
    ])
    return { categories, agents: agents.rows, users }
  }, 'inquiries:capture-context')

  const [contactName, setContactName] = useState('')
  const [contactMobile, setContactMobile] = useState('')
  const [source, setSource] = useState<CustomerSource>('website')
  const [subAgentId, setSubAgentId] = useState('')
  /**
   * `null` means untouched, so the field can carry a sensible default without
   * taking away the explicit "no category" answer — which is a real answer here
   * and lands the inquiry in the unrouted queue rather than in a guess.
   */
  const [categoryChoice, setCategoryChoice] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [touched, setTouched] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  if (!user || !context.data) {
    return (
      <div className={styles.loading} aria-busy="true">
        <Skeleton width="30%" height="2rem" />
        <Skeleton width="100%" height="16rem" />
      </div>
    )
  }

  const subAgents = context.data.agents.filter((agent) => agent.parentAgentId !== null && agent.active)
  const staff = context.data.users.find((person) => person.id === user.id)
  // Somebody who covers exactly one category is not making a choice by leaving
  // it alone; a sub-agent in the field sells one line and the form should know.
  const defaultCategoryId = staff && staff.categoryIds.length === 1 ? staff.categoryIds[0] : ''
  const categoryId = categoryChoice ?? defaultCategoryId
  const nameMissing = touched && contactName.trim() === ''
  const mobileMissing = touched && contactMobile.trim() === ''

  /** The sub-agent this capture belongs to: the one chosen, else the one capturing. */
  const linkedSubAgentId =
    subAgentId !== ''
      ? subAgentId
      : (subAgents.find((agent) => agent.userId === user.id)?.id ?? null)
  const linkedAgentId =
    context.data.agents.find((agent) => agent.id === linkedSubAgentId)?.parentAgentId ?? null

  const actorId = user.id

  async function save() {
    setTouched(true)
    setRefusal(null)
    if (contactName.trim() === '' || contactMobile.trim() === '') return

    setSaving(true)
    const outcome = await intake.capture({
      actorId,
      contactName,
      contactMobile,
      source,
      categoryId: categoryId === '' ? null : categoryId,
      subAgentId: linkedSubAgentId,
      agentId: linkedAgentId,
      notes: notes.trim() === '' ? null : notes.trim(),
      now,
    })
    setSaving(false)

    if (!outcome.ok) {
      // The repository's own sentence, rendered as written.
      setRefusal(outcome.reason)
      return
    }

    toaster.notify({
      title: `${outcome.record.systemNo} captured`,
      detail: 'It is in routing now.',
      tone: 'ok',
    })
    void navigate(`/inquiries/${outcome.record.id}`)
  }

  return (
    <>
      <PageHeader
        title="New inquiry"
        description="A name and a mobile number are enough. Everything else can follow once the inquiry exists."
        actions={
          <Button variant="quiet" onClick={() => void navigate('/inquiries')}>
            Cancel
          </Button>
        }
      />

      <form
        className={styles.form}
        aria-label="New inquiry"
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        {refusal ? (
          <p className={styles.refusal} role="alert">
            <Icon name="alert" size="sm" />
            {refusal}
          </p>
        ) : null}

        <FormSection
          title="Who is asking"
          description="The two fields the person in the field always has."
        >
          <FormRow>
            <Field
              label="Name"
              required
              error={nameMissing ? 'An inquiry needs a name.' : undefined}
            >
              <Input
                value={contactName}
                autoComplete="name"
                onChange={(event) => setContactName(event.target.value)}
              />
            </Field>
            <Field
              label="Mobile"
              required
              error={mobileMissing ? 'An inquiry needs a mobile number.' : undefined}
            >
              <Input
                value={contactMobile}
                inputMode="tel"
                autoComplete="tel"
                mono
                onChange={(event) => setContactMobile(event.target.value)}
              />
            </Field>
          </FormRow>
        </FormSection>

        <FormSection
          title="Where it came from"
          description="Optional. Leave the category blank and routing will say so rather than guess — the inquiry waits in the unrouted queue with an alert."
        >
          <FormRow columns={3}>
            <Field label="Source">
              <Select
                value={source}
                options={Object.entries(SOURCE_LABEL).map(([value, label]) => ({ value, label }))}
                onChange={(event) => setSource(event.target.value as CustomerSource)}
              />
            </Field>
            <Field label="Sub-agent" optional hint="Links the inquiry to whoever captured it.">
              <Select
                value={subAgentId}
                placeholder="No sub-agent"
                options={subAgents.map((agent) => ({ value: agent.id, label: agent.name }))}
                onChange={(event) => setSubAgentId(event.target.value)}
              />
            </Field>
            <Field label="Category" optional>
              <Select
                value={categoryId}
                placeholder="No category yet — park it as unrouted"
                options={context.data.categories.map((category) => ({
                  value: category.id,
                  label: category.label,
                }))}
                onChange={(event) => setCategoryChoice(event.target.value)}
              />
            </Field>
          </FormRow>

          <Field label="Note" optional>
            <Textarea
              value={notes}
              rows={3}
              onChange={(event) => setNotes(event.target.value)}
            />
          </Field>
        </FormSection>

        <div className={styles.actions}>
          <Button type="submit" variant="primary" icon="check" disabled={saving}>
            Save inquiry
          </Button>
        </div>
      </form>
    </>
  )
}

export default InquiryCaptureScreen
