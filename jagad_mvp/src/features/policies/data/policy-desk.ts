/**
 * The desk the policy screens write through.
 *
 * `PolicyRepository` and `CollectionRepository` already carry every §9 move this
 * step makes: `create` enters a policy with its entry draft beside it, `issue`
 * runs both gates, `record`, `verify` and `markBounced` fork the payment. This
 * file adds only what no repository can hold, and delegates everything else
 * untouched — the same posture `customerDesk` takes in the customer feature, and
 * for the same reasons:
 *
 *   - a screen still talks to an interface, never to a fixture;
 *   - every state change still goes through a machine, so a refusal comes back
 *     as the machine's own sentence rather than as a second wording invented
 *     here;
 *   - the rows this module owns are only the ones §8 has no entity for.
 *
 * Four such rows, and each was checked against the repositories before it was
 * added here rather than after:
 *
 *   **The uploaded policy document.** `DocumentRepository` is read-only, so the
 *   PDF a person drops on the issuance panel is recorded as a file reference on
 *   this desk. It carries a name and a size and no content — extraction happens
 *   in front of the person, in `<OcrField>`, and the text never lands anywhere.
 *
 *   **The extraction review.** A person's verdict on one extracted value is not
 *   a field on `Policy`; FR-16 needs it recorded all the same, because when an
 *   insurer number is later disputed the question asked is what the document
 *   actually said and who vouched for it.
 *
 *   **The customer message.** `MessageLogRepository` is read-only. §9 puts
 *   `message.sent` on the `policy.issued` edge, so the machine already
 *   guarantees the message goes; what it cannot do is write down which template
 *   went out, on which channel, to whom. `issue` records that the moment the
 *   transition commits, which is why there is no "notify customer" button
 *   anywhere in this feature.
 *
 *   **The bounce follow-up.** `TaskRepository` has no `create`, and the
 *   `cheque.bounced` edge emits `task.created` without writing a row. The task
 *   is recorded here on the same call, so the guard's promise — "a bounced
 *   cheque raises a follow-up task as part of the same move" — is kept in fact
 *   and not only in the event log.
 *
 * All four collapse to repository edges the day those repositories gain a write
 * API. None of them is a place where a rule lives.
 */

import type { DomainEvent } from '../../../domain/events'
import type { Money } from '../../../domain/money'
import type {
  CollectionInstrument,
  CollectionMode,
  CollectionRoute,
  PolicyEntryPath,
  PremiumMode,
} from '../../../domain/workflows'
import type {
  CollectionRecord,
  Deal,
  DocumentRecord,
  ListQuery,
  MessageChannel,
  MessageLog,
  MutationResult,
  Page,
  Policy,
  DeliveryState,
  DispatchChannel,
  PolicyDispatch,
  PolicyEntryDraft,
  PolicyNcb,
  PolicyPremiumComponent,
  PolicyProvenance,
  PolicyRepository,
  PolicyVersion,
  PremiumComponentInput,
  Repositories,
} from '../../../data/repo'
import type { TypedPremiumSource } from '../entry-types'

/** Big enough to hold the whole in-memory set when a screen needs every row. */
const SCAN_SIZE = 10_000

/** The automation rule §9 puts on the `policy.issued` edge. Admin-edited. */
export const ISSUED_RECIPE_KEY = 'policy.issued'

/** The template the customer receives when their policy goes live. */
export const ISSUED_TEMPLATE_KEY = 'policy.issued'

/** The template the feedback stub sends after issuance. FR-19, stubbed in M0. */
export const FEEDBACK_TEMPLATE_KEY = 'policy.feedback'

/* ------------------------------------------------------------ local records */

/**
 * A file somebody dropped on the issuance panel. Presence, name and size — the
 * three things a person needs to see that the right document is attached. There
 * is no content field on purpose: document text is a classified surface that
 * never reaches the Assistant, and the safest place to keep it is nowhere.
 */
export type PolicyFileRef = {
  readonly policyId: string
  readonly fileName: string
  readonly sizeBytes: number
  readonly uploadedBy: string
  readonly uploadedAt: string
}

/** One extracted value after a person has looked at it (FR-16). */
export type PolicyExtractionReview = {
  readonly policyId: string
  readonly name: string
  /** What the record will carry — the read, or what a person typed over it. */
  readonly value: string
  /** What the extractor read. Kept whatever happens to `value`. */
  readonly extracted: string
  readonly confirmed: boolean
  readonly reviewedAt: string
  readonly actorId: string
}

/** The follow-up a bounced cheque raises, recorded on the same call. */
export type BounceFollowUp = {
  readonly collectionId: string
  readonly policyId: string
  readonly title: string
  readonly dueOn: string
  readonly raisedBy: string
  readonly createdAt: string
}

export type PolicyDossier = {
  readonly policy: Policy
  readonly draft: PolicyEntryDraft | null
  /** The typed parts of the premium, in the order they were recorded. */
  readonly components: readonly PolicyPremiumComponent[]
  readonly ncb: PolicyNcb | null
  /** Every dispatch of the document, oldest first. Empty until one is recorded. */
  readonly dispatches: readonly PolicyDispatch[]
  readonly versions: readonly PolicyVersion[]
  readonly collections: readonly CollectionRecord[]
  readonly documents: readonly DocumentRecord[]
  readonly files: readonly PolicyFileRef[]
  readonly reviews: readonly PolicyExtractionReview[]
  readonly messages: readonly MessageLog[]
  readonly followUps: readonly BounceFollowUp[]
}

/* -------------------------------------------------------------- the commands */

/**
 * Entering a policy. Every amount here is optional and every amount here was
 * typed: the desk copies them onto the command and does not look at them. §9's
 * "components stay optional" is kept by the type, not by a check.
 */
export type EnterPolicyInput = {
  readonly actorId: string
  readonly customerId: string
  readonly companyId: string
  readonly productId: string
  readonly agencyId: string
  readonly agentId?: string | null
  readonly subAgentId?: string | null
  readonly entryPath: PolicyEntryPath
  /** What the contract came out of. The deal, when there is one, is named here. */
  readonly provenance: PolicyProvenance
  readonly formSchemaId: string
  readonly schemaVersion: number
  readonly missingFields?: readonly string[]
  /** Who saved it. The completion queue shows the entry back to its author. */
  readonly savedBy: string
  readonly premiumMode: PremiumMode
  readonly retentionClass: string
  readonly memberIds?: readonly string[]
  readonly startDate?: string
  readonly expiryDate?: string
  readonly sumInsured?: Money
  readonly netPremium?: Money
  readonly gstAmount?: Money
  /** Typed. Absent is an ordinary half-finished entry, not a zero. */
  readonly finalPremium?: Money
  /** The typed parts, in block order. Optional forever — §9 keeps them so. */
  readonly components?: readonly PremiumComponentInput[]
  readonly now?: Date
}

/**
 * Issuing. `finalPremium` is required by `IssuePolicyCommand` and confirmed by a
 * person before it gets here; `finalPremiumSource` is a `TypedPremiumSource`, so
 * `computed` is not expressible at this seam at all.
 */
export type IssuePolicyInput = {
  readonly actorId: string
  readonly finalPremium: Money
  readonly finalPremiumSource: TypedPremiumSource
  readonly netPremium?: Money
  readonly gstAmount?: Money
  readonly insurerNo?: string
  readonly startDate?: string
  readonly expiryDate?: string
  readonly channel?: MessageChannel
  readonly now?: Date
}

/** What the screen collects before the document goes out. */
export type DispatchPolicyInput = {
  readonly actorId: string
  readonly channel: DispatchChannel
  readonly recipientName: string
  /** Already masked by the caller — the full contact never reaches this seam. */
  readonly recipientContactMasked: string
  readonly documentId?: string | null
  readonly courierName?: string | null
  readonly trackingRef?: string | null
  readonly note?: string
  readonly now?: Date
}

export type RecordDeliveryInput = {
  readonly actorId: string
  readonly state: DeliveryState
  readonly returnReason?: string
  readonly now?: Date
}

export type RecordPaymentInput = {
  readonly actorId: string
  readonly amount: Money
  readonly route: CollectionRoute
  readonly instrument: CollectionInstrument
  readonly mode: CollectionMode
  readonly reference?: string
  readonly collectedBy: string
  readonly now?: Date
}

export type BouncePaymentInput = {
  readonly actorId: string
  readonly bounceReason: string
  readonly followUpDueOn: string
  readonly now?: Date
}

/** What `issue` gives back: the record, the events, and the receipt for both. */
export type PolicyIssuance =
  | {
      readonly ok: true
      readonly policy: Policy
      readonly events: readonly DomainEvent[]
      /** The message the recipe sent. Null when no template is configured. */
      readonly message: MessageLog | null
      /** The feedback request, stubbed in M0. Null when no template is configured. */
      readonly feedback: MessageLog | null
      readonly note: string
    }
  | { readonly ok: false; readonly reason: string; readonly guard?: string }

export type PolicyBounce =
  | {
      readonly ok: true
      readonly record: CollectionRecord
      readonly events: readonly DomainEvent[]
      readonly followUp: BounceFollowUp
    }
  | { readonly ok: false; readonly reason: string; readonly guard?: string }

export type PolicyDesk = {
  list(query?: ListQuery): Promise<Page<Policy>>
  get(id: string): Promise<Policy | null>
  dossier(policyId: string): Promise<PolicyDossier | null>
  /** Drafts and proposals still to be finished — canvas 3.7's completion queue. */
  completionQueue(query?: ListQuery): Promise<Page<PolicyEntryDraft>>
  /** The deal a `?dealId=` entry pre-populates from, with its line items. */
  deal(dealId: string): Promise<Deal | null>

  /** Enters a policy through `policies.create`. Nothing is computed on the way. */
  enter(input: EnterPolicyInput): Promise<MutationResult<Policy>>
  /**
   * Sends the document out and records where it went, in one move. Outward, so
   * every screen that calls it puts it behind `<ConfirmGate>`.
   */
  dispatch(policyId: string, input: DispatchPolicyInput): Promise<MutationResult<Policy>>
  /** Records what became of one dispatch. Delivery and confirmation stay distinct. */
  recordDelivery(
    dispatchId: string,
    input: RecordDeliveryInput,
  ): Promise<MutationResult<PolicyDispatch>>
  /** Raises the proposal, for the path that has one. */
  raiseProposal(policyId: string, actorId: string, now?: Date): Promise<MutationResult<Policy>>
  sendProposal(policyId: string, actorId: string, now?: Date): Promise<MutationResult<Policy>>
  /** Runs both §9 gates through the machine, then records what went out. */
  issue(policyId: string, input: IssuePolicyInput): Promise<PolicyIssuance>

  /** Records the uploaded policy document as a reference. Name and size only. */
  attachFile(file: PolicyFileRef): void
  /** Records a person's verdict on one extraction. Never flips `confirmed` itself. */
  recordReview(review: PolicyExtractionReview): void

  recordPayment(
    collectionId: string,
    input: RecordPaymentInput,
  ): Promise<MutationResult<CollectionRecord>>
  markBounced(collectionId: string, input: BouncePaymentInput): Promise<PolicyBounce>
}

/* ------------------------------------------------------------- the decorator */

const CACHE = new WeakMap<PolicyRepository, PolicyDesk>()

/**
 * One desk per underlying repository. The entry screen, the detail screen and
 * the drafts queue are three surfaces onto the same file, and a second desk
 * would give them different answers about what has been attached and confirmed.
 */
export function policyDesk(repositories: Repositories): PolicyDesk {
  const existing = CACHE.get(repositories.policies)
  if (existing) return existing
  const built = buildDesk(repositories)
  CACHE.set(repositories.policies, built)
  return built
}

function buildDesk(repositories: Repositories): PolicyDesk {
  const files: PolicyFileRef[] = []
  const reviews: PolicyExtractionReview[] = []
  const messages: MessageLog[] = []
  const followUps: BounceFollowUp[] = []

  let sequence = 0
  const nextId = (prefix: string) => `${prefix}-${(sequence += 1).toString().padStart(4, '0')}`

  async function templateFor(key: string) {
    const templates = await repositories.config.templates()
    return templates.find((template) => template.key === key && template.active) ?? null
  }

  async function sendTo(
    policy: Policy,
    templateKey: string,
    channel: MessageChannel | undefined,
    at: string,
  ): Promise<MessageLog | null> {
    const template = await templateFor(templateKey)
    if (!template) return null

    const customer = await repositories.customers.get(policy.customerId)
    if (!customer) return null

    const log: MessageLog = {
      id: nextId('msg-policy'),
      templateKey: template.key,
      channel: channel ?? template.channel,
      toName: customer.fullName,
      toAddress: customer.mobile,
      subjectEntity: 'Policy',
      subjectId: policy.id,
      sentAt: at,
      state: 'sent',
    }
    messages.push(log)
    return log
  }

  return {
    async list(query) {
      return repositories.policies.list(query)
    },

    async get(id) {
      return repositories.policies.get(id)
    },

    async completionQueue(query) {
      return repositories.policies.completionQueue(query)
    },

    async deal(dealId) {
      return repositories.deals.get(dealId)
    },

    async dossier(policyId) {
      const policy = await repositories.policies.get(policyId)
      if (!policy) return null

      const [draft, components, ncb, dispatches, versions, collections, documents, stored] =
        await Promise.all([
          repositories.policies.draft(policyId),
          repositories.policies.premiumComponents(policyId),
          repositories.policies.ncb(policyId),
          repositories.policies.dispatches(policyId),
          repositories.policies.versions(policyId),
          repositories.collections.forPolicy(policyId),
          repositories.documents.forSubject('Policy', policyId),
          repositories.config.messages('Policy', policyId),
        ])

      return {
        policy,
        draft,
        components,
        ncb,
        dispatches,
        versions,
        collections,
        documents,
        files: files.filter((file) => file.policyId === policyId),
        reviews: reviews.filter((review) => review.policyId === policyId),
        messages: [...stored, ...messages.filter((log) => log.subjectId === policyId)],
        followUps: followUps.filter((task) => task.policyId === policyId),
      }
    },

    async enter(input) {
      // Straight through. Every field on the command was typed into a control,
      // and the desk deliberately reads none of them on the way past.
      return repositories.policies.create(input)
    },

    async dispatch(policyId, input) {
      return repositories.policies.dispatch(policyId, input)
    },

    async recordDelivery(dispatchId, input) {
      return repositories.policies.recordDelivery(dispatchId, input)
    },

    async raiseProposal(policyId, actorId, now) {
      return repositories.policies.createProposal(policyId, { actorId, now })
    },

    async sendProposal(policyId, actorId, now) {
      return repositories.policies.sendProposal(policyId, { actorId, now })
    },

    async issue(policyId, input) {
      const result = await repositories.policies.issue(policyId, input)
      if (!result.ok) {
        return result.guard === undefined
          ? { ok: false, reason: result.reason }
          : { ok: false, reason: result.reason, guard: result.guard }
      }

      // The transition has committed and `message.sent` is already on its edge.
      // This is the receipt for it, not a second decision to send.
      const at = (input.now ?? new Date()).toISOString()
      const message = await sendTo(result.record, ISSUED_TEMPLATE_KEY, input.channel, at)
      const feedback = await sendTo(result.record, FEEDBACK_TEMPLATE_KEY, input.channel, at)

      const note =
        message === null
          ? 'The policy is live. No issuance template is configured, so nothing was sent.'
          : `The policy is live. ${message.toName} was messaged on ${message.channel}.`

      return { ok: true, policy: result.record, events: result.events, message, feedback, note }
    },

    attachFile(file) {
      files.push(file)
    },

    recordReview(review) {
      reviews.push(review)
    },

    async recordPayment(collectionId, input) {
      return repositories.collections.record(collectionId, input)
    },

    async markBounced(collectionId, input) {
      const result = await repositories.collections.markBounced(collectionId, {
        actorId: input.actorId,
        bounceReason: input.bounceReason,
        // §9's guard refuses the move without it, so the flag is a fact about
        // this call rather than a promise about a later one.
        followUpTaskCreated: true,
        followUpTaskDueOn: input.followUpDueOn,
        now: input.now,
      })

      if (!result.ok) {
        return result.guard === undefined
          ? { ok: false, reason: result.reason }
          : { ok: false, reason: result.reason, guard: result.guard }
      }

      const followUp: BounceFollowUp = {
        collectionId,
        policyId: result.record.policyId,
        title: `Chase the bounced cheque ${result.record.reference ?? ''}`.trim(),
        dueOn: input.followUpDueOn,
        raisedBy: input.actorId,
        createdAt: (input.now ?? new Date()).toISOString(),
      }
      followUps.push(followUp)

      return { ok: true, record: result.record, events: result.events, followUp }
    },
  }
}

/** Every row the desk holds, for a screen that needs the whole set at once. */
export async function allPolicies(desk: PolicyDesk): Promise<readonly Policy[]> {
  const page = await desk.list({ pageSize: SCAN_SIZE })
  return page.rows
}
