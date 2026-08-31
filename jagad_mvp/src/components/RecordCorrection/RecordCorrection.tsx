import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useRepositories } from '../../app/repositories-context'
import { useSessionStore } from '../../app/store'
import {
  DISCARDABLE_ENTITIES,
  discardMarkOf,
} from '../../domain/amend'
import type {
  AmendableEntity,
  AmendCommand,
  DiscardableEntity,
  DiscardCommand,
  RestoreCommand,
} from '../../domain/amend'
import { can } from '../../domain/permissions'
import type { Resource, ScopedRecord } from '../../domain/permissions'
import type { EraseSubjectEntity, MutationResult } from '../../data/repo'
import { useResource } from '../../lib/useResource'
import { Button } from '../../ui/Button'
import type { SelectOption } from '../../ui/form'
import { Skeleton } from '../../ui/data'
import { Drawer } from '../../ui/surface'
import { useDrawerSlot } from '../AppShell/drawer-slot'
import { AmendPanel } from './AmendPanel'
import { DiscardNotice } from './DiscardNotice'
import { DiscardPanel } from './DiscardPanel'
import { ErasePanel } from './ErasePanel'
import { RestorePanel } from './RestorePanel'
import styles from './RecordCorrection.module.css'

const MODES = {
  correct: 'correct',
  discard: 'discard',
  restore: 'restore',
  erase: 'erase',
} as const

type Mode = (typeof MODES)[keyof typeof MODES]

export type RecordCorrectionProps<T extends object> = {
  readonly entity: AmendableEntity
  /** The module this record belongs to, for the permission check. */
  readonly resource: Resource
  readonly record: T
  /** The record's number, as `<RecordId>` would print it. */
  readonly subject: string
  /** Singular, lower case: "inquiry", "policy", "claim". */
  readonly noun: string
  /** True once the insurer has issued. Takes the money fields off the form (D3). */
  readonly issued?: boolean
  /** Options for reference fields this component cannot resolve itself. */
  readonly choices?: Readonly<Record<string, readonly SelectOption[]>>
  readonly amend: (command: AmendCommand) => Promise<MutationResult<T>>
  /** Present only on the three pre-contractual entities. Its absence is the control. */
  readonly discard?: (command: DiscardCommand) => Promise<MutationResult<T>>
  readonly restore?: (command: RestoreCommand) => Promise<MutationResult<T>>
  /** Present on the retained entities: the regulated path in place of a delete. */
  readonly erase?: { readonly subjectEntity: EraseSubjectEntity; readonly subjectId: string }
  readonly onWritten: (record: T) => void
}

/**
 * The scope attributes, with nulls read as absences.
 *
 * `teamId` is the one that cannot simply be read off the row. Only `Inquiry`
 * carries a team; `Customer`, `Policy`, `Quotation`, `Deal` and `Claim` do not —
 * so `can()`'s team branch, which compares `record.teamId` against the user's,
 * had nothing to match on and every team-scoped person was refused every record
 * they did not personally own. A sales manager scoped to their team could
 * correct nothing on their own team's customer.
 *
 * The team is therefore resolved from the record's owner, which is where it
 * actually lives: a record belongs to the team of the person who holds it. The
 * row's own `teamId` still wins where there is one, so an inquiry keeps
 * answering for itself.
 */
function scopeOf(record: object, ownerTeamId: string | undefined): ScopedRecord {
  const row = record as Record<string, unknown>
  const read = (key: string) => (typeof row[key] === 'string' ? (row[key] as string) : undefined)
  return {
    ownerId: read('ownerId'),
    teamId: read('teamId') ?? ownerTeamId,
    companyId: read('companyId'),
    categoryId: read('categoryId'),
    agentId: read('agentId'),
    subAgentId: read('subAgentId'),
  }
}

function isDiscardable(entity: AmendableEntity): entity is DiscardableEntity {
  return (DISCARDABLE_ENTITIES as readonly string[]).includes(entity)
}

/**
 * The record-level actions every detail screen mounts — plan §20, FR-20.2/.4.
 *
 * Until this existed the product could create a record and move it through its
 * lifecycle and do nothing else with it, so a mobile number taken down wrong on
 * the phone had no path back out. This is that path, and the three things it
 * offers are three different acts rather than one control with a mode:
 *
 *   Correct   — the allow-listed fields, behind a gate that shows the diff.
 *   Discard   — reversible, pre-contractual only, and it says so before it runs.
 *   Erasure   — the regulated answer where a discard does not exist.
 *
 * The IA is a drawer rather than a page or an inline form. A correction is a
 * focused, interruptible task about one record: the record has to stay legible
 * behind it so the person can check what they are changing against what is
 * recorded, and cancelling has to cost nothing. It portals into the shell's own
 * right-hand slot, the same one `<WorkQueue>` uses, and falls back to rendering
 * in place when there is no shell — a test, the gallery — which is correct
 * rather than a fallback.
 *
 * Permission gates the buttons rather than the submit. A person who may not
 * correct this record is not shown a control that is about to refuse them.
 */
export function RecordCorrection<T extends object>({
  entity,
  resource,
  record,
  subject,
  noun,
  issued = false,
  choices,
  amend,
  discard,
  restore,
  erase,
  onWritten,
}: RecordCorrectionProps<T>) {
  const repositories = useRepositories()
  const user = useSessionStore((state) => state.user)
  const drawerSlot = useDrawerSlot()
  const [mode, setMode] = useState<Mode | null>(null)
  /** Bumped after a request is recorded, so the prior-request list re-reads. */
  const [erasureSeq, setErasureSeq] = useState(0)

  const context = useResource(async () => {
    const [agents, staff] = await Promise.all([
      repositories.agents.list({ page: 1, pageSize: 500 }),
      repositories.config.users(),
    ])
    return { agents: agents.rows, staff }
  }, 'record-correction:choices')

  const requests = useResource(
    async () =>
      erase ? repositories.eraseRequests.forSubject(erase.subjectEntity, erase.subjectId) : [],
    `record-correction:erasure:${erase?.subjectId ?? 'none'}:${erasureSeq}`,
  )

  if (!user) return null

  const people = context.data
  const mark = discardMarkOf(record)

  /*
   * The staff list decides the team, and the team decides the permission, so
   * nothing may be judged until it has arrived. Deciding early would refuse
   * every record for the length of one read and then pop the actions in — which
   * reads as a bug even when it corrects itself.
   */
  if (!people) {
    return (
      <section className={styles.bar} aria-busy="true" aria-label={`Record actions for ${subject}`}>
        <Skeleton width="14rem" height="2rem" />
      </section>
    )
  }

  const ownerTeamId = (() => {
    const ownerId = (record as Record<string, unknown>).ownerId
    if (typeof ownerId !== 'string') return undefined
    // Staff carry `teamId: string | null`; the scope shape reads an absence as
    // undefined, and a null team is an absence.
    return people.staff.find((person) => person.id === ownerId)?.teamId ?? undefined
  })()

  const scope = scopeOf(record, ownerTeamId)
  const mayCorrect = can(user, 'edit', resource, scope)
  const mayDiscard = can(user, 'delete', resource, scope)
  const discardable = isDiscardable(entity)

  const showDiscard = discard !== undefined && discardable && mark === null && mayDiscard
  const showRestore = restore !== undefined && discardable && mark !== null && mayDiscard
  const showErase = erase !== undefined && mayCorrect

  /*
   * Refused is not the same as absent, and rendering nothing said the wrong one.
   * A person who cannot correct a record was shown an empty space indistinguishable
   * from a product that has no correction in it — which is exactly how this was
   * first reported as "there is no edit option". Say which it is.
   */
  if (!mayCorrect && !showDiscard && !showRestore && !showErase && mark === null) {
    return (
      <section className={styles.bar} aria-label={`Record actions for ${subject}`}>
        <p className={styles.retention}>
          {`This ${noun} can be corrected, but not by this account — it sits outside the records this role may change. Someone who holds it, or an administrator, can make the correction.`}
        </p>
      </section>
    )
  }
  const nameOf = (id: string) => people.staff.find((person) => person.id === id)?.name ?? id

  /**
   * Agents and sub-agents are told apart by who they report to, which is what
   * the field means: `agentId` is the agency's agent, `subAgentId` is the person
   * in the field reporting to them.
   */
  const resolved: Readonly<Record<string, readonly SelectOption[]>> = {
    agentId: (people.agents)
      .filter((agent) => agent.parentAgentId === null)
      .map((agent) => ({ value: agent.id, label: agent.name })),
    subAgentId: (people.agents)
      .filter((agent) => agent.parentAgentId !== null)
      .map((agent) => ({ value: agent.id, label: agent.name })),
    ownerId: (people.staff)
      .filter((person) => person.active)
      .map((person) => ({ value: person.id, label: person.name })),
    ...choices,
  }

  function written(next: T) {
    onWritten(next)
  }

  const titles: Readonly<Record<Mode, string>> = {
    correct: `Correct ${subject}`,
    discard: `Discard ${subject}`,
    restore: `Restore ${subject}`,
    erase: `Erasure request — ${subject}`,
  }

  const subtitles: Readonly<Record<Mode, string>> = {
    correct: 'Only the fields a correction may touch are offered. A reason is required.',
    discard: 'Reversible. The record leaves the queues and stays in the book.',
    restore: 'Brings it back into every queue it belongs in.',
    erase: 'The right to ask, and the answer the platform actually holds.',
  }

  const body =
    mode === null ? null : context.isLoading ? (
      <div aria-busy="true">
        <Skeleton width="100%" height="8rem" />
      </div>
    ) : mode === MODES.correct ? (
      <AmendPanel
        entity={entity}
        record={record}
        subject={subject}
        actorId={user.id}
        issued={issued}
        choices={resolved}
        onAmend={amend}
        onAmended={written}
        onCancel={() => setMode(null)}
        {...(showDiscard ? { onDiscardInstead: () => setMode(MODES.discard) } : {})}
      />
    ) : mode === MODES.discard && discard && discardable ? (
      <DiscardPanel
        entity={entity}
        subject={subject}
        actorId={user.id}
        onDiscard={discard}
        onDiscarded={written}
        onCancel={() => setMode(null)}
      />
    ) : mode === MODES.restore && restore && discardable ? (
      <RestorePanel
        entity={entity}
        subject={subject}
        actorId={user.id}
        onRestore={restore}
        onRestored={written}
        onCancel={() => setMode(null)}
      />
    ) : mode === MODES.erase && erase ? (
      <ErasePanel
        subjectEntity={erase.subjectEntity}
        subjectId={erase.subjectId}
        subject={subject}
        actorId={user.id}
        existing={requests.data ?? []}
        onRequest={(command) => repositories.eraseRequests.request(command)}
        onRequested={() => setErasureSeq((seq) => seq + 1)}
        onCancel={() => setMode(null)}
      />
    ) : null

  const drawer =
    mode === null ? null : (
      <Drawer
        open
        onClose={() => setMode(null)}
        title={titles[mode]}
        subtitle={subtitles[mode]}
      >
        {body}
      </Drawer>
    )

  return (
    <section className={styles.bar} aria-label={`Record actions for ${subject}`}>
      {mark ? (
        <DiscardNotice
          mark={mark}
          noun={noun}
          nameOf={nameOf}
          {...(showRestore ? { onRestore: () => setMode(MODES.restore) } : {})}
        />
      ) : null}

      <div className={styles.actions}>
        {mayCorrect ? (
          <Button variant="quiet" icon="edit" onClick={() => setMode(MODES.correct)}>
            Correct
          </Button>
        ) : null}
        {showDiscard ? (
          <Button variant="quiet" icon="close" onClick={() => setMode(MODES.discard)}>
            Discard
          </Button>
        ) : null}
        {showErase ? (
          <Button variant="quiet" icon="lock" onClick={() => setMode(MODES.erase)}>
            Erasure request
          </Button>
        ) : null}
        {discard !== undefined ? null : (
          <p className={styles.retention}>
            {showErase
              ? `This ${noun} is never deleted — it is held under regulatory retention that outlives anybody's preference. An erasure request records the ask and the answer.`
              : `This ${noun} is never deleted — it is held under regulatory retention. A data-principal erasure request is raised from the customer file.`}
          </p>
        )}
      </div>

      {drawer === null ? null : drawerSlot ? createPortal(drawer, drawerSlot) : drawer}
    </section>
  )
}
