/**
 * The desk the customer, KYC and consent screens write through.
 *
 * `CustomerRepository` creates customers and moves KYC and consent through their
 * machines. What it has no field for is the rest of what a KYC desk produces: a
 * credential row, a message-log row, a note that a checklist item arrived, a
 * person's verdict on an extraction, the values a customer typed into a consent
 * form. This file holds those, and only those:
 *
 *   - a screen still talks to an interface, never to a fixture;
 *   - every state change still goes through a §9 machine — `advanceKyc` and
 *     `advanceConsent` are called unmodified, and a refusal comes back as the
 *     machine's own sentence rather than as an exception;
 *   - the rows this module owns are only the ones no repository can hold.
 *     Everything else is delegated untouched.
 *
 * The five local maps were reviewed against `create` when it landed on the
 * repositories, and every one of them stayed: `credentials` and `messages` are
 * read-only on `CustomerRepository` and `ConfigRepository`, `receipts` and
 * `reviews` are a checklist and an OCR verdict that no entity in §8 carries, and
 * `submissions` holds what a customer typed under a pinned schema — sensitive by
 * definition, and deliberately without a table. Moving any of them would mean
 * inventing a repository field to hold it, which is the opposite of the fix.
 *
 * Two things are deliberately NOT delegated, and they are the interesting half:
 *
 * **The credentials recipe.** §9: "Completion fires the credentials recipe
 * automatically — not a manual step." The machine already keeps that promise —
 * `kyc.completed` carries `credentials.generated` and `message.sent` on the same
 * edge, so there is no path to `complete` that skips them. What the machine
 * cannot do is write down which username went out on which channel, so
 * `completeKyc` reads the `kyc.credentials` recipe and records the credential
 * and the message the moment the transition commits. There is no separate
 * control anywhere in this feature that issues credentials, by construction.
 *
 * **The timeline.** The mock store's event log starts empty — fixtures are
 * seeded into tables rather than replayed through machines — so a customer who
 * has been on the books for two years would open with a blank history. The log
 * this module serves is therefore the record's own timestamps reconstructed as
 * the events that must have produced them, with every event emitted in this
 * session appended. Against a real API this collapses to one `events(subject)`
 * read; the shape a screen consumes is already that.
 */

import type { DomainEvent } from '../../../domain/events'
import { CONSENT_STATES, KYC_CONSENT_STATES } from '../../../domain/workflows'
import type { ConsentState } from '../../../domain/workflows'
import type {
  CollectionRecord,
  ConsentRecord,
  Customer,
  CustomerCredential,
  CustomerRepository,
  DocumentRecord,
  Household,
  KycCommand,
  ListQuery,
  MessageChannel,
  MessageLog,
  Member,
  Page,
  Policy,
  Repositories,
  Task,
} from '../../../data/repo'
import { consentExpiryFrom, isTokenExpired, newConsentToken } from './consent-token'

/** Big enough to hold the whole in-memory set; a token scan needs every row. */
const SCAN_SIZE = 10_000

/** The automation rule §9 names. Its channel and template are admin-edited. */
export const CREDENTIALS_RECIPE_KEY = 'kyc.credentials'

/* ------------------------------------------------------------ local records */

/** A checklist item a back-office user has recorded as arrived. */
export type ChecklistReceipt = {
  readonly item: string
  readonly recordedAt: string
  readonly actorId: string
  /** True when the customer supplied it through the consent link. */
  readonly viaConsentLink: boolean
}

/** One extraction after a person has looked at it. */
export type ExtractionReview = {
  readonly name: string
  /** What the record will carry — the read, or what a person typed over it. */
  readonly value: string
  /** What the extractor read. Kept whatever happens to `value` (FR-16). */
  readonly extracted: string
  readonly confirmed: boolean
  readonly reviewedAt: string
  readonly actorId: string
}

/**
 * What the customer gave through the consent link.
 *
 * `values` is exactly what they typed, under the schema they saw — which is why
 * the schema is pinned beside it (§8's version rule: a record is always shown
 * under the schema it was captured with). The values are sensitive by
 * definition; nothing in this feature renders them back to staff, they are never
 * put on an event's `detail`, and they can never reach the Assistant, which
 * reads only the `src/data/assistant` projections.
 *
 * The KYC schema asks for the last four digits of an Aadhaar and has no field
 * for the other eight, so there is nowhere in this shape for a full number to
 * be.
 */
export type ConsentSubmission = {
  readonly customerId: string
  readonly submittedAt: string
  readonly channel: MessageChannel
  readonly schemaId: string
  readonly schemaVersion: number
  readonly values: Readonly<Record<string, unknown>>
  /** Checklist items the submission supplied, by their configured wording. */
  readonly supplied: readonly string[]
}

export type CustomerDossier = {
  readonly customer: Customer
  readonly household: Household | null
  readonly householdCustomers: readonly Customer[]
  readonly members: readonly Member[]
  readonly policies: readonly Policy[]
  readonly documents: readonly DocumentRecord[]
  readonly tasks: readonly Task[]
  readonly collections: readonly CollectionRecord[]
  readonly consent: ConsentRecord | null
  readonly credentials: readonly CustomerCredential[]
  readonly messages: readonly MessageLog[]
  readonly receipts: readonly ChecklistReceipt[]
  readonly reviews: readonly ExtractionReview[]
  readonly submission: ConsentSubmission | null
}

export type KycCompletion =
  | {
      readonly ok: true
      readonly customer: Customer
      readonly events: readonly DomainEvent[]
      /** What the credentials recipe produced. Null when no recipe is configured. */
      readonly credential: CustomerCredential | null
      readonly message: MessageLog | null
      readonly note: string
    }
  | { readonly ok: false; readonly reason: string; readonly guard?: string }

export type ConsentIssue =
  | { readonly ok: true; readonly record: ConsentRecord; readonly events: readonly DomainEvent[] }
  | { readonly ok: false; readonly reason: string }

/** What `/consent/:token` is allowed to know about the person it is asking. */
export type ConsentInvite = {
  readonly token: string
  readonly customerId: string
  /** First name only: enough to reassure, nothing that identifies on its own. */
  readonly greetingName: string
  readonly state: ConsentState
  readonly expiresAt: string
  readonly expired: boolean
  readonly alreadySubmitted: boolean
}

export type ConsentSubmitResult =
  | {
      readonly ok: true
      /** True when the submission also carried KYC over the line (§9's second route). */
      readonly kycCompleted: boolean
      /** The machine's sentence when KYC could not complete yet. */
      readonly kycNote: string
    }
  | { readonly ok: false; readonly reason: string; readonly expired: boolean }

export type CustomerDesk = {
  list(query?: ListQuery): Promise<Page<Customer>>
  get(id: string): Promise<Customer | null>
  dossier(customerId: string): Promise<CustomerDossier | null>
  /** The record's history: reconstructed timestamps plus this session's events. */
  timeline(customerId: string): Promise<readonly DomainEvent[]>

  /** Records that a checklist item arrived. Presence only; no file, no content. */
  recordReceipt(customerId: string, receipt: ChecklistReceipt): void
  /** Records a person's verdict on one extraction. Never flips `confirmed` itself. */
  recordReview(customerId: string, review: ExtractionReview): void

  /** Moves KYC through `kycMachine` and records what the credentials recipe sent. */
  completeKyc(customerId: string, command: KycCommand): Promise<KycCompletion>

  issueConsentLink(
    customerId: string,
    command: { readonly actorId: string; readonly channel?: MessageChannel; readonly now?: Date },
  ): Promise<ConsentIssue>
  consentByToken(token: string, now: Date): Promise<ConsentInvite | null>
  /** The customer's own submission. Completes KYC when the file is otherwise ready. */
  submitConsent(
    token: string,
    submission: Omit<ConsentSubmission, 'customerId' | 'submittedAt' | 'channel'>,
    options: { readonly now: Date; readonly kycCommand: (dossier: CustomerDossier) => KycCommand },
  ): Promise<ConsentSubmitResult>
}

/* ------------------------------------------------------------- the decorator */

const CACHE = new WeakMap<CustomerRepository, CustomerDesk>()

/**
 * One desk per underlying repository. The KYC screen and the consent page are
 * two surfaces onto the same file, and a second desk would give them two
 * different answers about what has been collected.
 */
export function customerDesk(repositories: Repositories): CustomerDesk {
  const existing = CACHE.get(repositories.customers)
  if (existing) return existing
  const built = buildDesk(repositories)
  CACHE.set(repositories.customers, built)
  return built
}

type LocalState = {
  readonly journal: Map<string, DomainEvent[]>
  readonly receipts: Map<string, ChecklistReceipt[]>
  readonly reviews: Map<string, Map<string, ExtractionReview>>
  readonly credentials: Map<string, CustomerCredential[]>
  readonly messages: Map<string, MessageLog[]>
  readonly submissions: Map<string, ConsentSubmission>
}

function buildDesk(repositories: Repositories): CustomerDesk {
  const local: LocalState = {
    journal: new Map(),
    receipts: new Map(),
    reviews: new Map(),
    credentials: new Map(),
    messages: new Map(),
    submissions: new Map(),
  }

  function remember(customerId: string, events: readonly DomainEvent[]): void {
    const held = local.journal.get(customerId) ?? []
    local.journal.set(customerId, [...held, ...events])
  }

  async function dossier(customerId: string): Promise<CustomerDossier | null> {
    const customer = await repositories.customers.get(customerId)
    if (!customer) return null

    const [household, members, policies, documents, tasks, consent, credentials, messages] =
      await Promise.all([
        customer.householdId === null
          ? Promise.resolve(null)
          : repositories.customers.household(customer.householdId),
        repositories.customers.members(customerId),
        repositories.policies.forCustomer(customerId),
        repositories.documents.forSubject('Customer', customerId),
        repositories.tasks.forSubject('Customer', customerId),
        repositories.customers.consent(customerId),
        repositories.customers.credentials(customerId),
        repositories.config.messages('Customer', customerId),
      ])

    // Collections hang off policies, so the customer's money history is the
    // union of theirs. Read through the repository, never assembled from a table.
    const collectionPages = await Promise.all(
      policies.map((policy) => repositories.collections.forPolicy(policy.id)),
    )

    return {
      customer,
      household: household?.household ?? null,
      householdCustomers: household?.customers ?? [],
      members,
      policies,
      documents,
      tasks,
      collections: collectionPages.flat(),
      consent,
      credentials: [...credentials, ...(local.credentials.get(customerId) ?? [])],
      messages: [...messages, ...(local.messages.get(customerId) ?? [])],
      receipts: local.receipts.get(customerId) ?? [],
      reviews: [...(local.reviews.get(customerId)?.values() ?? [])],
      submission: local.submissions.get(customerId) ?? null,
    }
  }

  async function fireCredentialsRecipe(
    customer: Customer,
    now: Date,
  ): Promise<{ credential: CustomerCredential | null; message: MessageLog | null; note: string }> {
    const recipe = await repositories.config.recipe(CREDENTIALS_RECIPE_KEY)

    if (!recipe || !recipe.active) {
      // The machine has already emitted `credentials.generated`; what is missing
      // is the configuration saying how to send them. Say so rather than
      // pretending a message went out.
      return {
        credential: null,
        message: null,
        note: `KYC is complete. No active "${CREDENTIALS_RECIPE_KEY}" recipe is configured, so no credentials were sent — configure it and the next completion will send them automatically.`,
      }
    }

    const channel = readChannel(recipe.parameters.channel)
    const templateKey =
      typeof recipe.parameters.templateKey === 'string'
        ? recipe.parameters.templateKey
        : 'credentials.issued'

    const credential: CustomerCredential = {
      id: `crd-${customer.id}`,
      customerId: customer.id,
      username: usernameFor(customer.fullName),
      issuedAt: now.toISOString(),
      channel,
      active: true,
    }

    // No password, no secret, no token: the log records that credentials went
    // and to whom, which is what support needs and the most it may hold.
    const message: MessageLog = {
      id: `msg-${customer.id}-credentials`,
      templateKey,
      channel,
      toName: customer.fullName,
      toAddress: channel === 'email' ? (customer.email ?? customer.mobile) : customer.mobile,
      subjectEntity: 'Customer',
      subjectId: customer.id,
      sentAt: now.toISOString(),
      state: 'sent',
    }

    local.credentials.set(customer.id, [
      ...(local.credentials.get(customer.id) ?? []),
      credential,
    ])
    local.messages.set(customer.id, [...(local.messages.get(customer.id) ?? []), message])

    return {
      credential,
      message,
      note: `KYC complete. The credentials recipe fired on its own: username ${credential.username} sent on ${channel}.`,
    }
  }

  const desk: CustomerDesk = {
    async list(query = {}) {
      return repositories.customers.list(query)
    },

    async get(id) {
      return repositories.customers.get(id)
    },

    dossier,

    async timeline(customerId) {
      const file = await dossier(customerId)
      if (!file) return []
      const reconstructed = reconstructEvents(file)
      const live = local.journal.get(customerId) ?? []
      return [...reconstructed, ...live].sort((a, b) => a.at.localeCompare(b.at))
    },

    recordReceipt(customerId, receipt) {
      // Keyed by the checklist's own wording, which is what configuration owns.
      // A second receipt for the same item replaces the first rather than
      // stacking, so the count on screen can never drift past the list.
      const held = local.receipts.get(customerId) ?? []
      local.receipts.set(customerId, [
        ...held.filter((entry) => entry.item !== receipt.item),
        receipt,
      ])
    },

    recordReview(customerId, review) {
      const held = local.reviews.get(customerId) ?? new Map<string, ExtractionReview>()
      held.set(review.name, review)
      local.reviews.set(customerId, held)
    },

    async completeKyc(customerId, command) {
      const outcome = await repositories.customers.advanceKyc(
        customerId,
        KYC_CONSENT_STATES.complete,
        command,
      )

      if (!outcome.ok) {
        return outcome.guard === undefined
          ? { ok: false, reason: outcome.reason }
          : { ok: false, reason: outcome.reason, guard: outcome.guard }
      }

      remember(customerId, outcome.events)
      const now = command.now ?? new Date()
      const fired = await fireCredentialsRecipe(outcome.record, now)

      return {
        ok: true,
        customer: outcome.record,
        events: outcome.events,
        credential: fired.credential,
        message: fired.message,
        note: fired.note,
      }
    },

    async issueConsentLink(customerId, command) {
      const now = command.now ?? new Date()
      const token = newConsentToken()
      const expiresAt = consentExpiryFrom(now).toISOString()

      const outcome = await repositories.customers.advanceConsent(
        customerId,
        CONSENT_STATES.linkIssued,
        {
          actorId: command.actorId,
          token,
          expiresAt,
          ...(command.channel === undefined ? {} : { channel: command.channel }),
          now,
        },
      )

      if (!outcome.ok) return { ok: false, reason: outcome.reason }

      remember(customerId, outcome.events)
      const record = await repositories.customers.consent(customerId)
      if (!record) {
        return { ok: false, reason: 'The link was issued but no consent record came back for it.' }
      }
      return { ok: true, record, events: outcome.events }
    },

    async consentByToken(token, now) {
      const found = await findByToken(repositories, token)
      if (!found) return null

      const { customer, record } = found

      // A link that came back filled is not expired, whatever the clock says:
      // the window closing after it was used is not a fact the customer needs.
      const used = record.state === CONSENT_STATES.submitted
      const expired =
        !used && (record.state === CONSENT_STATES.expired || isTokenExpired(record.expiresAt, now))

      return {
        token,
        customerId: customer.id,
        greetingName: customer.fullName.split(' ')[0] ?? customer.fullName,
        state: record.state,
        expiresAt: record.expiresAt,
        expired,
        alreadySubmitted: used,
      }
    },

    async submitConsent(token, submission, options) {
      const found = await findByToken(repositories, token)
      if (!found) {
        return {
          ok: false,
          expired: false,
          reason: 'This link does not match any consent request. Check the message it came in, or ask the agency to send a fresh one.',
        }
      }

      const { customer, record } = found
      const now = options.now

      if (isTokenExpired(record.expiresAt, now)) {
        // Mark it expired through the machine, so the back office sees a state
        // rather than a link that quietly stopped working.
        const lapsed = await repositories.customers.advanceConsent(
          customer.id,
          CONSENT_STATES.expired,
          { actorId: actorFor(customer.id), now },
        )
        if (lapsed.ok) remember(customer.id, lapsed.events)
        return {
          ok: false,
          expired: true,
          reason: 'This link has expired.',
        }
      }

      const moved = await repositories.customers.advanceConsent(
        customer.id,
        CONSENT_STATES.submitted,
        { actorId: actorFor(customer.id), now },
      )
      if (!moved.ok) return { ok: false, expired: false, reason: moved.reason }

      remember(customer.id, moved.events)
      local.submissions.set(customer.id, {
        ...submission,
        customerId: customer.id,
        submittedAt: now.toISOString(),
        channel: record.channel,
      })

      // What the customer supplied lands on the checklist as presence — and as
      // presence only. The receipt is recorded against them rather than against
      // a member of staff, because they are who supplied it.
      for (const item of submission.supplied) {
        desk.recordReceipt(customer.id, {
          item,
          recordedAt: now.toISOString(),
          actorId: actorFor(customer.id),
          viaConsentLink: true,
        })
      }

      // §9's second route to completion. It is attempted, not assumed: if a
      // document is still missing the file stays partial and the back office
      // reads the machine's own sentence on the KYC screen.
      const file = await dossier(customer.id)
      if (!file) return { ok: true, kycCompleted: false, kycNote: '' }

      const completion = await desk.completeKyc(customer.id, options.kycCommand(file))
      return completion.ok
        ? { ok: true, kycCompleted: true, kycNote: completion.note }
        : { ok: true, kycCompleted: false, kycNote: completion.reason }
    },
  }

  return desk
}

/* -------------------------------------------------------------- small parts */

/**
 * The actor on a consent-page transition.
 *
 * There is no signed-in user on `/consent/:token` and there must not be
 * (§11.1), so the customer is named as the actor rather than a staff id being
 * borrowed. The audit trail then says the customer did it, which is the truth.
 */
export function actorFor(customerId: string): string {
  return `customer:${customerId}`
}

export function usernameFor(fullName: string): string {
  return fullName
    .toLowerCase()
    .replace(/[^a-z]+/g, '.')
    .replace(/^\.|\.$/g, '')
}

function readChannel(value: unknown): MessageChannel {
  return value === 'sms' || value === 'email' ? value : 'whatsapp'
}

async function findByToken(
  repositories: Repositories,
  token: string,
): Promise<{ customer: Customer; record: ConsentRecord } | null> {
  const page = await repositories.customers.list({ page: 1, pageSize: SCAN_SIZE })
  for (const customer of page.rows) {
    const record = await repositories.customers.consent(customer.id)
    if (record && record.token === token) return { customer, record }
  }
  return null
}

/**
 * The record's history, read back off its own timestamps.
 *
 * Every line below is an event the platform WOULD have emitted had the record
 * been created through the machines rather than seeded. Nothing is invented: a
 * line exists only where a timestamp exists to put it at.
 */
function reconstructEvents(file: CustomerDossier): readonly DomainEvent[] {
  const events: DomainEvent[] = []

  const push = (
    name: DomainEvent['name'],
    at: string | null | undefined,
    actorId?: string | null,
  ): void => {
    if (!at) return
    events.push({ name, at, ...(actorId ? { actorId } : {}), subject: { entity: 'Customer', id: file.customer.id } })
  }

  for (const document of file.documents) {
    push('document.uploaded', document.submittedAt, document.uploadedByName)
    push('document.verified', document.verifiedAt, document.verifiedBy)
  }

  if (file.consent) {
    push('consent.link_issued', file.consent.issuedAt)
    push('consent.submitted', file.consent.submittedAt, actorFor(file.customer.id))
  }

  for (const credential of file.credentials) {
    push('credentials.generated', credential.issuedAt)
  }

  for (const message of file.messages) {
    push('message.sent', message.sentAt)
  }

  for (const policy of file.policies) {
    push('policy.issued', policy.startDate)
  }

  for (const collection of file.collections) {
    push('collection.recorded', collection.collectedAt, collection.collectedBy)
    push('collection.verified', collection.verifiedAt, collection.verifiedBy)
  }

  for (const task of file.tasks) {
    push('task.created', task.createdAt, task.raisedBy)
    push('task.completed', task.completedAt, task.ownerId)
  }

  for (const receipt of file.receipts) {
    push('document.uploaded', receipt.recordedAt, receipt.actorId)
  }

  return events
}
