import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useRepositories } from '../../app/repositories-context'
import { useSessionStore } from '../../app/store'
import { can } from '../../domain/permissions'
import { useResource } from '../../lib/useResource'
import { PageHeader } from '../../components/AppShell'
import { ConfirmGate } from '../../components/guardrails'
import { Button } from '../../ui/Button'
import { Icon } from '../../ui/Icon'
import { Field, FormRow, FormSection, Input, QuickAdd, Select, Textarea } from '../../ui/form'
import { Skeleton } from '../../ui/data'
import { useToaster } from '../../ui/surface'
import type { Customer, CustomerSource, ReferrerKind } from '../../data/repo'
import { AgentQuickAdd, useMarketStore } from '../config/shared'
import { CustomerQuickAdd } from '../customers'
import { useInquiryNow } from './clock'
import { inquiryIntake } from './data/intake'
import { SOURCE_LABEL } from './inquiry-view'
import styles from './InquiryCapture.module.css'

/**
 * What the two channel pickers need of an agent row, and no more. The
 * repository's `Agent` and the configuration store's `ConfigAgent` differ only
 * in whether a sub-agent cap may be absent, which is not a question this form
 * asks — so the two lists merge on this shape rather than on either type.
 */
type AgentChoice = {
  readonly id: string
  readonly name: string
  readonly parentAgentId: string | null
  readonly userId: string | null
  readonly active: boolean
}

/**
 * Minimal capture — plan §4 `/inquiries/new`, canvas 1.6.
 *
 * The scenario is a sub-agent standing in front of a customer with a phone: they
 * have a name and a number and nothing else, and the inquiry has to exist before
 * they walk away. So name and mobile are the only required fields on this form,
 * and everything else — source, the agent and sub-agent it belongs to, the
 * category, a note — is offered and optional.
 *
 * The channel pair is one choice in two fields: picking a sub-agent fills the
 * agent in from their reporting line, and picking an agent narrows the sub-agent
 * list to that agent's team. An agent alone is a valid answer — direct business
 * has no sub-agent in the middle — and neither field is required.
 *
 * Each of those pickers carries a plus. The sub-agent who signed up this morning
 * and the customer who called ten minutes ago are exactly the names a dropdown
 * filled at boot does not hold, and losing a half-typed capture to go and create
 * them is how a lead ends up in somebody's notebook instead. `<QuickAdd>` makes
 * the record where the person is standing, through the same guards the
 * configuration screens use, and drops it straight into the field.
 *
 * Leaving the category blank is a real answer rather than an omission: routing
 * then has nothing to match, and the inquiry lands in the unrouted queue with the
 * admin alert (§9). That is the point of canvas 1.5, and it is why this form does
 * not force a guess out of somebody in the field.
 *
 * Capture can also hand the inquiry straight to somebody. Naming an owner here
 * and running routing on the detail screen afterwards were two moves for one
 * decision, and the second one had to be gone looking for. So "Assign to" is a
 * field on this form, and it is honest about what it needs: the turnaround
 * allowance comes from the category, so with no category there is nothing to
 * measure an assignee against and the field says so rather than assigning
 * against a number nobody set.
 *
 * Assigning notifies somebody, so it is still an outward mutation and still goes
 * through `<ConfirmGate>` — but the gate is on this screen, showing who is about
 * to be told, rather than a screen away. Capture with nobody named saves in one
 * press, exactly as before.
 *
 * The write goes through the repository like every other write. Nothing here
 * routes: from the moment somebody owns it, the inquiry only moves on to the
 * next person when the turnaround allowance runs out, which is §9's rule and not
 * this form's.
 */
export function InquiryCaptureScreen() {
  const repositories = useRepositories()
  const navigate = useNavigate()
  const toaster = useToaster()
  const user = useSessionStore((state) => state.user)
  const now = useInquiryNow()
  const intake = inquiryIntake(repositories)

  /*
   * Channel rows made during this session — through the plus on the pickers
   * below, or on the agents screen. The repositories are read-only mocks, so the
   * configuration store is where a new agent lives until a write API lands, and
   * a picker that ignored it would refuse to show the row it had just made.
   */
  const sessionAgents = useMarketStore((state) => state.agents)
  /**
   * Customers made from the referrer picker's plus. Held here rather than
   * reloaded: a reload blanks this form to a skeleton for as long as the read
   * takes, and a half-typed capture must not flicker because somebody added the
   * person who referred it.
   */
  const [madeHere, setMadeHere] = useState<readonly Customer[]>([])

  const context = useResource(async () => {
    const [categories, agents, users, customers] = await Promise.all([
      repositories.config.categories(),
      repositories.agents.list({ page: 1, pageSize: 200 }),
      repositories.config.users(),
      // For the referrer picker: a referral most often comes from somebody
      // already on the books, and naming them is the whole point of recording it.
      repositories.customers.list({ page: 1, pageSize: 200 }),
    ])
    return { categories, agents: agents.rows, users, customers: customers.rows }
  }, 'inquiries:capture-context')

  const [contactName, setContactName] = useState('')
  const [contactMobile, setContactMobile] = useState('')
  const [source, setSource] = useState<CustomerSource>('website')
  const [agentId, setAgentId] = useState('')
  const [subAgentId, setSubAgentId] = useState('')
  const [referrerKind, setReferrerKind] = useState<ReferrerKind>('customer')
  const [referrerId, setReferrerId] = useState('')
  const [referrerName, setReferrerName] = useState('')
  /**
   * `null` means untouched, so the field can carry a sensible default without
   * taking away the explicit "no category" answer — which is a real answer here
   * and lands the inquiry in the unrouted queue rather than in a guess.
   */
  const [categoryChoice, setCategoryChoice] = useState<string | null>(null)
  const [assignToId, setAssignToId] = useState('')
  const [notes, setNotes] = useState('')
  /** Raised when a named assignee means this save also notifies somebody. */
  const [armed, setArmed] = useState(false)
  const [touched, setTouched] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  /**
   * What this sitting has already captured, newest first.
   *
   * Intake is rarely one lead. A morning's post, a call sheet or a stack of
   * walk-in slips is a batch, and a form that navigates away after every save
   * makes the person come back for each one. So "save and add another" keeps the
   * form up - and then has to answer the question it creates, which is "did that
   * one actually save?" This list is the answer: every record made here stays
   * addressable, so nothing disappears into a toast that has already faded.
   */
  const [sitting, setSitting] = useState<readonly { id: string; systemNo: string; name: string }[]>(
    [],
  )
  /**
   * Which button armed the confirmation gate. The gate is a single component
   * with one `onConfirm`, so the intent has to be remembered from the press that
   * opened it rather than read off the button at confirm time.
   */
  const [continuing, setContinuing] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  if (!user || !context.data) {
    return (
      <div className={styles.loading} aria-busy="true">
        <Skeleton width="30%" height="2rem" />
        <Skeleton width="100%" height="16rem" />
      </div>
    )
  }

  // The store hydrates from these same repositories, so id is enough to dedupe:
  // what it adds is what capture has not seen yet.
  const known = new Set(context.data.agents.map((agent) => agent.id))
  const channel: readonly AgentChoice[] = [
    ...context.data.agents,
    ...sessionAgents.filter((agent) => !known.has(agent.id)),
  ]

  const agents = channel.filter((agent) => agent.parentAgentId === null && agent.active)
  const allSubAgents = channel.filter((agent) => agent.parentAgentId !== null && agent.active)
  // Choosing an agent narrows the sub-agent list to that agent's own team, so the
  // pair on the form can never name a reporting line the channel does not have.
  const subAgents =
    agentId === '' ? allSubAgents : allSubAgents.filter((agent) => agent.parentAgentId === agentId)
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
      : (allSubAgents.find((agent) => agent.userId === user.id)?.id ?? null)
  /**
   * The agent the inquiry is attached to. An explicit choice wins; otherwise the
   * parent of the linked sub-agent stands in, which is the line the channel
   * already records. An agent may be attached on its own — direct business has no
   * sub-agent in the middle — so this does not depend on one being picked.
   */
  const linkedAgentId =
    agentId !== ''
      ? agentId
      : (channel.find((agent) => agent.id === linkedSubAgentId)?.parentAgentId ?? null)

  const referrerOptions =
    referrerKind === 'customer'
      ? [...context.data.customers, ...madeHere].map((row) => ({
          value: row.id,
          label: row.fullName,
        }))
      : referrerKind === 'sub_agent'
        ? allSubAgents.map((row) => ({ value: row.id, label: row.name }))
        : context.data.users
            .filter((person) => person.active)
            .map((person) => ({ value: person.id, label: person.name }))

  const actorId = user.id
  const mayAssign = can(user, 'assign', 'inquiries')
  /**
   * Who referred this lead — required when the source says one did, and refused
   * when it does not. The rule is not restated here: it lives under the write,
   * in one place, and its sentence is what this screen renders on a refusal.
   */
  const referral =
    source !== 'referral'
      ? null
      : referrerKind === 'external'
        ? { kind: referrerKind, referrerName }
        : { kind: referrerKind, referrerId }
  const chosenCategory = context.data.categories.find((entry) => entry.id === categoryId) ?? null
  const assignee = context.data.users.find((person) => person.id === assignToId && person.active)
  /**
   * The assignment this save will also make, or null. It needs both halves: a
   * person to hand it to and a category to take the allowance from. §9 holds no
   * default TAT and neither does this screen, so half an answer is no answer.
   */
  const assignment =
    mayAssign && assignee && chosenCategory
      ? { assignee, category: chosenCategory }
      : null

  /**
   * Clears the person and keeps the batch.
   *
   * Which fields survive is the whole design of this affordance. A run of
   * captures shares its context - the same call sheet is one source, one
   * category, one agent, and often one assignee - and clearing those would make
   * "add another" slower than starting again. What must never survive is the
   * person: a name or a mobile left behind from the previous lead is how one
   * customer's number ends up on another's record.
   */
  function clearForNextCapture() {
    setContactName('')
    setContactMobile('')
    setNotes('')
    setReferrerId('')
    setReferrerName('')
    setTouched(false)
    setRefusal(null)
    nameRef.current?.focus()
  }

  async function save(andAnother: boolean) {
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
      referral,
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

    const captured = outcome.record

    if (assignment) {
      setSaving(true)
      const assigned = await intake.assign(captured.id, {
        actorId,
        nextOwnerId: assignment.assignee.id,
        nextOwnerCategoryGroupId: assignment.category.id,
        tatMinutes: assignment.category.tatMinutes,
        routingMatchFound: true,
        teamId: assignment.category.teamId,
        now,
      })
      setSaving(false)

      // The inquiry exists either way — a refused assignment is not a refused
      // capture, and pretending otherwise would lose the record. So it is saved,
      // it is said out loud why nobody owns it, and the detail screen opens with
      // the assignment still to make.
      toaster.notify(
        assigned.ok
          ? {
              title: `${captured.systemNo} captured and assigned`,
              detail: `${assignment.assignee.name} has been notified. The clock is running.`,
              tone: 'ok',
            }
          : {
              title: `${captured.systemNo} captured, but not assigned`,
              detail: assigned.reason,
              tone: 'bad',
            },
      )
      if (andAnother) {
        setSitting((made) => [
          { id: captured.id, systemNo: captured.systemNo, name: captured.contactName },
          ...made,
        ])
        clearForNextCapture()
        return
      }
      void navigate(`/inquiries/${captured.id}`)
      return
    }

    toaster.notify({
      title: `${captured.systemNo} captured`,
      detail: 'It is in routing now.',
      tone: 'ok',
    })

    if (andAnother) {
      setSitting((made) => [
        { id: captured.id, systemNo: captured.systemNo, name: captured.contactName },
        ...made,
      ])
      clearForNextCapture()
      return
    }
    void navigate(`/inquiries/${captured.id}`)
  }

  /**
   * Both buttons come through here. Naming an assignee means the save notifies
   * somebody, so it stops at the gate first either way - "add another" is not a
   * reason to skip a confirmation.
   */
  function submit(andAnother: boolean) {
    setTouched(true)
    setRefusal(null)
    if (contactName.trim() === '' || contactMobile.trim() === '') return
    if (assignment) {
      setContinuing(andAnother)
      setArmed(true)
      return
    }
    void save(andAnother)
  }

  return (
    <>
      <PageHeader
        title="New inquiry"
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
          submit(false)
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
                ref={nameRef}
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
          <FormRow>
            <Field label="Source">
              <Select
                value={source}
                options={Object.entries(SOURCE_LABEL).map(([value, label]) => ({ value, label }))}
                onChange={(event) => setSource(event.target.value as CustomerSource)}
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

          {/*
            * Shown only when the source says there was a referrer, because that
            * is the only time there is one. "Referral" was a source with nothing
            * on the end of it, so a referred lead could be counted but never
            * attributed, thanked or paid.
            */}
          {source === 'referral' ? (
            <FormRow>
              <Field label="Referred by" hint="Who sent this lead to us.">
                <Select
                  value={referrerKind}
                  options={[
                    { value: 'customer', label: 'A customer' },
                    { value: 'sub_agent', label: 'A sub-agent' },
                    { value: 'staff', label: 'Somebody on staff' },
                    { value: 'external', label: 'Somebody not on our books' },
                  ]}
                  onChange={(event) => {
                    setReferrerKind(event.target.value as ReferrerKind)
                    // The picker below changes with it, so a selection made
                    // against the old list would name the wrong sort of record.
                    setReferrerId('')
                  }}
                />
              </Field>
              <Field
                label="Referrer"
                required
                hint={
                  referrerKind === 'external'
                    ? 'A name is all this needs, and all it will hold.'
                    : undefined
                }
              >
                {referrerKind === 'external' ? (
                  <Input
                    value={referrerName}
                    autoComplete="off"
                    onChange={(event) => setReferrerName(event.target.value)}
                  />
                ) : referrerKind === 'staff' ? (
                  <Select
                    value={referrerId}
                    placeholder="Pick who referred them"
                    options={referrerOptions}
                    onChange={(event) => setReferrerId(event.target.value)}
                  />
                ) : (
                  <QuickAdd
                    label={referrerKind === 'customer' ? 'New customer' : 'New sub-agent'}
                    form={(close) =>
                      referrerKind === 'customer' ? (
                        <CustomerQuickAdd
                          source={source}
                          onCancel={close}
                          onCreated={(customer) => {
                            setMadeHere((current) => [...current, customer])
                            setReferrerId(customer.id)
                            close()
                          }}
                        />
                      ) : (
                        <AgentQuickAdd
                          role="sub_agent"
                          onCancel={close}
                          onCreated={(agent) => {
                            setReferrerId(agent.id)
                            close()
                          }}
                        />
                      )
                    }
                  >
                    <Select
                      value={referrerId}
                      placeholder="Pick who referred them"
                      options={referrerOptions}
                      onChange={(event) => setReferrerId(event.target.value)}
                    />
                  </QuickAdd>
                )}
              </Field>
            </FormRow>
          ) : null}

          <FormRow>
            <Field
              label="Agent"
              optional
              hint="Attaches the inquiry to the agent it belongs to. Picking a sub-agent fills this in from their reporting line."
            >
              <QuickAdd
                label="New agent"
                form={(close) => (
                  <AgentQuickAdd
                    onCancel={close}
                    onCreated={(agent) => {
                      setAgentId(agent.id)
                      setSubAgentId('')
                      close()
                    }}
                  />
                )}
              >
                <Select
                  value={agentId}
                  placeholder="No agent"
                  options={agents.map((agent) => ({ value: agent.id, label: agent.name }))}
                  onChange={(event) => {
                    const next = event.target.value
                    setAgentId(next)
                    // A sub-agent left behind by the change would name a line that
                    // does not exist, so it goes rather than being silently kept.
                    const kept = allSubAgents.find((agent) => agent.id === subAgentId)
                    if (next !== '' && kept && kept.parentAgentId !== next) setSubAgentId('')
                  }}
                />
              </QuickAdd>
            </Field>
            <Field label="Sub-agent" optional hint="Links the inquiry to whoever captured it.">
              <QuickAdd
                label="New sub-agent"
                form={(close) => (
                  <AgentQuickAdd
                    role="sub_agent"
                    // The agent already named above is the reporting line; the
                    // row below fills it in rather than asking a second time.
                    parentAgentId={agentId === '' ? null : agentId}
                    onCancel={close}
                    onCreated={(agent) => {
                      setSubAgentId(agent.id)
                      if (agent.parentAgentId) setAgentId(agent.parentAgentId)
                      close()
                    }}
                  />
                )}
              >
                <Select
                  value={subAgentId}
                  placeholder={agentId === '' ? 'No sub-agent' : 'No sub-agent — the agent directly'}
                  options={subAgents.map((agent) => ({ value: agent.id, label: agent.name }))}
                  onChange={(event) => {
                    const next = event.target.value
                    setSubAgentId(next)
                    // The sub-agent carries its agent with it; showing that in the
                    // field above beats leaving the person to infer it.
                    const parent = allSubAgents.find((agent) => agent.id === next)?.parentAgentId
                    if (parent) setAgentId(parent)
                  }}
                />
              </QuickAdd>
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

        {mayAssign ? (
          <FormSection
            title="Who takes it"
            description="Optional. Name somebody and they own it the moment this is saved, with the turnaround clock running. Leave it and the inquiry waits in the queue for routing."
          >
            <FormRow>
              <Field
                label="Assign to"
                optional
                hint={
                  categoryId === ''
                    ? 'Pick a category first. The turnaround allowance comes from it, and there is no default to fall back on.'
                    : `${chosenCategory?.label ?? 'The category'} sets the allowance at ${chosenCategory?.tatMinutes ?? 0} minutes. After that it moves to the next person, and not before.`
                }
              >
                <Select
                  value={assignToId}
                  disabled={categoryId === ''}
                  placeholder="Nobody yet — leave it to routing"
                  options={context.data.users
                    .filter((person) => person.active)
                    .map((person) => ({ value: person.id, label: person.name }))}
                  onChange={(event) => setAssignToId(event.target.value)}
                />
              </Field>
            </FormRow>
          </FormSection>
        ) : null}

        {armed && assignment ? (
          <ConfirmGate
            title={`Capture ${contactName.trim()} and assign to ${assignment.assignee.name}`}
            changes={[
              { key: 'record', label: 'Inquiry', to: `${contactName.trim()} · ${contactMobile.trim()}` },
              { key: 'owner', label: 'Owner', from: 'Unassigned', to: assignment.assignee.name },
              { key: 'status', label: 'Status', to: 'Assigned' },
              {
                key: 'tat',
                label: 'Turnaround',
                to: `${assignment.category.tatMinutes} minutes, from the ${assignment.category.label} category`,
              },
            ]}
            note={`${assignment.assignee.name} is notified and their clock starts as soon as this is saved. The allowance comes from configuration, not from this form.`}
            confirmLabel="Save and assign"
            receipt="Saved. They have been notified and the clock has started."
            onCancel={() => setArmed(false)}
            onConfirm={() => void save(continuing)}
          />
        ) : null}

        {sitting.length > 0 ? (
          /*
           * A labelled region, deliberately NOT `role="status"`. The toast
           * already announces each save as a live region, and a second one
           * saying the same thing means a screen reader hears the capture twice.
           * This list is a persistent reference - what have I taken so far, and
           * where did it go - which is a landmark to navigate to, not an
           * announcement to interrupt with.
           */
          <section className={styles.sitting} aria-label="Captured in this sitting">
            <p className={styles.sittingHead}>
              {sitting.length === 1
                ? '1 inquiry captured in this sitting'
                : `${sitting.length} inquiries captured in this sitting`}
            </p>
            <ul className={styles.sittingList}>
              {sitting.map((made) => (
                <li key={made.id}>
                  <Link to={`/inquiries/${made.id}`}>{made.systemNo}</Link>
                  <span>{made.name}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className={styles.actions}>
          <Button
            type="button"
            variant="quiet"
            icon="plus"
            disabled={saving || armed}
            onClick={() => submit(true)}
          >
            Save and add another
          </Button>
          <Button type="submit" variant="primary" icon="check" disabled={saving || armed}>
            {assignment ? `Save and assign to ${assignment.assignee.name}` : 'Save inquiry'}
          </Button>
        </div>
      </form>
    </>
  )
}

export default InquiryCaptureScreen
