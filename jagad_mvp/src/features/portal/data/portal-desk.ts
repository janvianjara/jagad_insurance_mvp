/**
 * The portal desk — the one seam the five customer screens read through, and
 * the place the privacy claim of this feature is actually kept.
 *
 * Every method below takes a `customerId` and every read it performs is scoped
 * by it: `policies.forCustomer`, `claims.forCustomer`, and `documents.forSubject`
 * called once per subject that customer owns. There is no unscoped `list()` on
 * a customer's screen anywhere in this module — the one list read in the file
 * belongs to the identity picker, which runs before an identity exists and shows
 * names and nothing else. (`attach` delegates to `uploadDesk`, which scans the
 * document ledger to merge presence; nothing from that scan reaches a view, and
 * `portal-scoping.test.ts` asserts the outcome rather than trusting the claim.)
 *
 * That is a deliberate shape rather than an incidental one. A screen that
 * fetched a page of policies and filtered it in the component would have every
 * other customer's record in memory, one console log away from the walkthrough,
 * and `portal-scoping.test.tsx` would have nothing to assert against. Filtering
 * belongs where the read is.
 *
 * Three things this module will not do:
 *
 *   - it produces no amount. Every figure it returns is a `Money` a person typed
 *     into a record, handed on untouched for `<Money>` or `<RollUp>` to format
 *     at the render edge (D3);
 *   - it reads no diagnosis, no health declaration and no document content. A
 *     document reaches a screen as its type, its number and whether it arrived;
 *   - it writes nothing of its own. The one mutation it offers, `intimate`, is
 *     the claims desk's, so a claim raised from a customer's phone is the same
 *     machine-routed act as one raised at the desk (§9), refusals included.
 */

import { claimDesk } from '../../claims/data/claim-desk'
import type { IntimateClaimCommand } from '../../claims/data/claim-desk'
import { CLAIM_UPLOAD_DOC_TYPES, newUploadToken, uploadDesk } from '../../upload'
import { leadDaysOrNull } from '../../renewals/lead-days'
import {
  attentionRank,
  claimIsOpen,
  claimProgress,
  coverHasEnded,
  coverIsRunning,
  daysUntil,
} from '../portal-view'
import type { PortalAttentionKind } from '../portal-view'
import type {
  Agent,
  BenefitItem,
  DocumentType,
  Claim,
  Customer,
  DocumentRecord,
  MutationResult,
  Policy,
  RenewalTask,
  Repositories,
} from '../../../data/repo'

/** Big enough to hold the book. Only the identity picker reads at this width. */
const SCAN_SIZE = 2_000

/** How many people the picker offers before somebody has to search. */
const PICKER_SIZE = 8

/* --------------------------------------------------------------- view shapes */

/** One row of the demo identity picker. Names and counts, nothing else. */
export type PortalChoice = {
  readonly id: string
  readonly fullName: string
  readonly city: string
  readonly liveCover: number
}

/** Something waiting on the customer, said in one line they can act on. */
export type PortalAttention = {
  readonly key: string
  readonly kind: PortalAttentionKind
  readonly title: string
  readonly detail: string
  /** Where the answer lives inside the portal, when it lives inside it at all. */
  readonly path: string | null
  readonly actionLabel: string | null
}

export type PortalRenewalNext = {
  readonly policyId: string
  readonly systemNo: string
  readonly insurerNo: string | null
  readonly productName: string
  readonly companyName: string
  readonly expiryDate: string
  readonly daysAway: number
  /** True when the agency has already opened the renewal on its own queue. */
  readonly agencyIsOnIt: boolean
}

export type PortalCover = {
  readonly customer: Customer
  readonly liveCover: number
  readonly policiesHeld: number
  readonly openClaims: number
  readonly nextRenewal: PortalRenewalNext | null
  readonly attention: readonly PortalAttention[]
}

export type PortalBenefit = {
  readonly key: string
  readonly label: string
  readonly value: string
}

export type PortalPolicyCard = {
  readonly policy: Policy
  readonly companyName: string
  readonly productName: string
  readonly agent: Agent | null
  readonly renewal: RenewalTask | null
  readonly benefits: readonly PortalBenefit[]
  readonly documents: readonly DocumentRecord[]
}

export type PortalDocument = {
  readonly record: DocumentRecord
  /** What this paper belongs to, in the customer's words. */
  readonly belongsTo: string
  /**
   * Which identity number this paper evidences, when it evidences one at all.
   * Only `<MaskedField>` ever renders the value beside it, and that component has
   * no branch that produces more than four characters.
   */
  readonly identityKind: 'aadhaar' | 'pan' | null
  /**
   * What the CUSTOMER's record holds — the last four digits for an Aadhaar,
   * which is the most this platform ever stores, and the PAN as recorded. Never
   * anything read off the document: this feature does not open documents.
   */
  readonly identityValue: string | null
}

/**
 * What the customer said happened, kept beside the claim.
 *
 * `Claim` (§8) has no field for an incident date or an account of what took
 * place — the entity carries the state machine's facts and the settlement, and
 * intimation at the desk is a phone call somebody takes notes on elsewhere. A
 * self-service intimation has no phone call, so the account would simply be
 * lost. This is the same feature-layer answer `upload-desk.ts` gives to the same
 * shape of gap, and it collapses to a delegate the day the record grows a field.
 */
export type PortalIncidentNote = {
  readonly claimId: string
  /** The day it happened, as the customer gave it. Never inferred from anything. */
  readonly incidentOn: string
  readonly description: string
  readonly toldAt: string
}

export type PortalClaimCard = {
  readonly claim: Claim
  /** What the customer told us when they raised it, when they raised it here. */
  readonly told: PortalIncidentNote | null
  readonly policySystemNo: string
  readonly policyInsurerNo: string | null
  readonly productName: string
  readonly companyName: string
  /** Checklist lines still to reach the agency. Names of papers, never content. */
  readonly outstanding: readonly string[]
}

export type PortalClaimablePolicy = {
  readonly policy: Policy
  readonly productName: string
  readonly companyName: string
  readonly inForce: boolean
}

/** What became of the papers somebody attached while raising a claim. */
export type PortalAttachOutcome = {
  /** File names now recorded against the claim. Names only — never content. */
  readonly recorded: readonly string[]
  /** What could not be recorded, each with the reason it was refused. */
  readonly refused: readonly string[]
}

/** One paper offered at intimation: what it is, and the three facts about it. */
export type PortalOfferedFile = {
  readonly docType: DocumentType
  readonly fileName: string
  readonly mimeType: string
  readonly sizeBytes: number
}

export type PortalAttachCommand = {
  readonly claimId: string
  /** The customer. A claim they attached to is a thing they did, and it is logged as theirs. */
  readonly actorId: string
  readonly files: readonly PortalOfferedFile[]
  readonly now: Date
}

export type PortalDesk = {
  choices(search: string): Promise<readonly PortalChoice[]>
  cover(customerId: string, now: Date): Promise<PortalCover | null>
  policies(customerId: string): Promise<readonly PortalPolicyCard[]>
  documents(customerId: string): Promise<readonly PortalDocument[]>
  claims(customerId: string): Promise<readonly PortalClaimCard[]>
  claimable(customerId: string, now: Date): Promise<readonly PortalClaimablePolicy[]>
  intimate(command: IntimateClaimCommand): Promise<MutationResult<Claim>>
  /** Keeps the customer's own account of the incident beside a claim they raised. */
  rememberIncident(note: PortalIncidentNote): Promise<void>
  /**
   * Records papers against a claim the customer has just raised, through the
   * product's own tokenised upload mechanism (FR-11.1, D21) rather than a second
   * path invented here. Presence and file name only: the bytes are never read.
   */
  attach(command: PortalAttachCommand): Promise<PortalAttachOutcome>
}

/**
 * One desk per repository set, so an incident note written on `/portal/claims/new`
 * is there to read on `/portal/claims` a moment later.
 */
const CACHE = new WeakMap<Repositories, PortalDesk>()

/* ------------------------------------------------------------------ the desk */

export function portalDesk(repositories: Repositories): PortalDesk {
  const existing = CACHE.get(repositories)
  if (existing) return existing

  const claims = claimDesk(repositories)
  const notes = new Map<string, PortalIncidentNote>()
  /** Documents recorded through `attach`, by claim id. See `documentsOf`. */
  const attached = new Map<string, DocumentRecord[]>()

  /**
   * The upload desk, given a claim reader that can see this session's claims.
   *
   * `uploadDesk` resolves a link's claim through `repositories.claims`, and a
   * claim raised on this portal lives in the claims desk's own store until the
   * repository grows a create. Handing it the desk rather than the bare
   * repository is what lets a customer attach a paper to the claim they raised
   * thirty seconds ago; for every other caller it is a strict superset, because
   * the desk delegates everything it did not create.
   */
  const uploads = uploadDesk({ ...repositories, claims })

  /** Every document that belongs to this customer, by subject. Never a list read. */
  async function documentsOf(
    customerId: string,
    policyRows: readonly Policy[],
    claimRows: readonly Claim[],
  ): Promise<readonly DocumentRecord[]> {
    const subjects: readonly (readonly [string, string])[] = [
      ['Customer', customerId],
      ...policyRows.map((policy) => ['Policy', policy.id] as const),
      ...claimRows.map((claim) => ['Claim', claim.id] as const),
    ]
    const found = await Promise.all(
      subjects.map(([entity, id]) => repositories.documents.forSubject(entity, id)),
    )

    // Papers attached through this desk live beside the seeded ledger rather
    // than inside it, because `DocumentRepository` (§7) is read-only. Merged by
    // id so a seeded row flipped to present is the same row, not a second one.
    const session = claimRows.flatMap((claim) => attached.get(claim.id) ?? [])
    const overlay = new Map(session.map((row) => [row.id, row]))
    const merged = found.flat().map((row) => overlay.get(row.id) ?? row)
    const seen = new Set(merged.map((row) => row.id))
    return [...merged, ...session.filter((row) => !seen.has(row.id))]
  }

  async function productName(productId: string): Promise<string> {
    const product = await repositories.products.get(productId)
    return product?.name ?? 'Policy'
  }

  async function companyName(companyId: string): Promise<string> {
    const company = await repositories.companies.get(companyId)
    return company?.name ?? 'Insurer'
  }

  async function readNextRenewal(
    live: readonly Policy[],
    renewalOf: ReadonlyMap<string, RenewalTask | null>,
    now: Date,
  ): Promise<PortalRenewalNext | null> {
    const dated = live.filter((policy) => policy.expiryDate !== null)
    if (dated.length === 0) return null

    const soonest = [...dated].sort((a, b) =>
      (a.expiryDate ?? '').localeCompare(b.expiryDate ?? ''),
    )[0]
    if (!soonest || soonest.expiryDate === null) return null

    const renewal = renewalOf.get(soonest.id) ?? null

    return {
      policyId: soonest.id,
      systemNo: soonest.systemNo,
      insurerNo: soonest.insurerNo,
      productName: await productName(soonest.productId),
      companyName: await companyName(soonest.companyId),
      expiryDate: soonest.expiryDate,
      daysAway: daysUntil(soonest.expiryDate, now),
      agencyIsOnIt: renewal !== null && renewal.state !== 'lapsed',
    }
  }

  /** A picker row per person, with how much cover each is actually carrying. */
  async function withCover(rows: readonly Customer[]): Promise<readonly PortalChoice[]> {
    const today = new Date()
    return Promise.all(
      rows.map(async (person) => {
        const held = await repositories.policies.forCustomer(person.id)
        return {
          id: person.id,
          fullName: person.fullName,
          city: person.city,
          liveCover: held.filter((policy) => coverIsRunning(policy, today)).length,
        }
      }),
    )
  }

  const built: PortalDesk = {
    async choices(search) {
      const needle = search.trim()

      if (needle !== '') {
        const page = await repositories.customers.list({
          search: needle,
          filters: { status: ['active'] },
          sort: { field: 'fullName', direction: 'asc' },
          page: 1,
          pageSize: PICKER_SIZE,
        })
        return withCover(page.rows)
      }

      // No search: offer the people with the most cover on the books, which is
      // one policy read rather than three hundred customer reads, and puts the
      // households a walkthrough is about at the top without naming any of them.
      const book = await repositories.policies.list({ page: 1, pageSize: SCAN_SIZE })
      const tally = new Map<string, number>()
      for (const policy of book.rows) {
        // Live states only, so the order reflects cover actually running rather
        // than half-finished entries somebody left in a drawer.
        if (!coverIsRunning(policy, new Date())) continue
        tally.set(policy.customerId, (tally.get(policy.customerId) ?? 0) + 1)
      }
      const ranked = [...tally.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, PICKER_SIZE)
      const people = await repositories.customers.getMany(ranked.map(([id]) => id))
      return people
        .map((person) => ({
          id: person.id,
          fullName: person.fullName,
          city: person.city,
          liveCover: tally.get(person.id) ?? 0,
        }))
        .sort((a, b) => b.liveCover - a.liveCover || a.fullName.localeCompare(b.fullName))
    },

    async cover(customerId, now) {
      const customer = await repositories.customers.get(customerId)
      if (!customer) return null

      const [policyRows, claimRows, recipes] = await Promise.all([
        repositories.policies.forCustomer(customerId),
        claims.forCustomer(customerId),
        repositories.config.recipes(),
      ])

      const documents = await documentsOf(customerId, policyRows, claimRows)
      const live = policyRows.filter((policy) => coverIsRunning(policy, now))
      const renewalRows = await Promise.all(
        live.map((policy) => repositories.renewals.forPolicy(policy.id)),
      )
      const renewalOf = new Map<string, RenewalTask | null>(
        live.map((policy, index) => [policy.id, renewalRows[index] ?? null]),
      )

      const nextRenewal = await readNextRenewal(live, renewalOf, now)
      const attention = buildAttention({ customer, policyRows, claimRows, documents, now, recipes: leadDaysOrNull(recipes) })

      return {
        customer,
        liveCover: live.length,
        policiesHeld: policyRows.length,
        openClaims: claimRows.filter((claim) => claimIsOpen(claim.state)).length,
        nextRenewal,
        attention,
      }
    },

    async policies(customerId) {
      const rows = await repositories.policies.forCustomer(customerId)
      return Promise.all(
        rows.map(async (policy) => {
          const [company, product, agent, renewal, maps, documents] = await Promise.all([
            companyName(policy.companyId),
            productName(policy.productId),
            policy.agentId === null
              ? Promise.resolve(null)
              : repositories.agents.get(policy.agentId),
            repositories.renewals.forPolicy(policy.id),
            repositories.benefits.mapsForProduct(policy.productId),
            repositories.documents.forSubject('Policy', policy.id),
          ])

          const items = await repositories.benefits.getMany(
            maps.map((entry) => entry.benefitItemId),
          )
          const byId = new Map<string, BenefitItem>(items.map((item) => [item.id, item]))

          return {
            policy,
            companyName: company,
            productName: product,
            agent,
            renewal,
            benefits: [...maps]
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((entry) => {
                const item = byId.get(entry.benefitItemId)
                return {
                  key: entry.id,
                  label: item?.label ?? entry.benefitItemId,
                  value: entry.defaultValue,
                }
              }),
            documents,
          }
        }),
      )
    },

    async documents(customerId) {
      const customer = await repositories.customers.get(customerId)
      if (!customer) return []

      const [policyRows, claimRows] = await Promise.all([
        repositories.policies.forCustomer(customerId),
        claims.forCustomer(customerId),
      ])
      const records = await documentsOf(customerId, policyRows, claimRows)

      const policyBySystem = new Map(policyRows.map((policy) => [policy.id, policy]))
      const claimBySystem = new Map(claimRows.map((claim) => [claim.id, claim]))

      return records.map((record) => {
        const belongsTo =
          record.subjectEntity === 'Policy'
            ? `Policy ${policyBySystem.get(record.subjectId)?.systemNo ?? record.subjectId}`
            : record.subjectEntity === 'Claim'
              ? `Claim ${claimBySystem.get(record.subjectId)?.systemNo ?? record.subjectId}`
              : 'Your file'

        // Only the two identity papers carry a number, and the number handed on
        // here is the customer's own record — never anything read off the
        // document, which this feature does not look at.
        if (record.docType === 'aadhaar') {
          return { record, belongsTo, identityKind: 'aadhaar', identityValue: customer.aadhaarLast4 }
        }
        if (record.docType === 'pan') {
          return { record, belongsTo, identityKind: 'pan', identityValue: customer.panNumber }
        }
        return { record, belongsTo, identityKind: null, identityValue: null }
      })
    },

    async claims(customerId) {
      const rows = await claims.forCustomer(customerId)
      return Promise.all(
        rows.map(async (claim) => {
          const policy = await repositories.policies.get(claim.policyId)
          const [product, company] = await Promise.all([
            policy ? productName(policy.productId) : Promise.resolve('Policy'),
            policy ? companyName(policy.companyId) : Promise.resolve('Insurer'),
          ])
          const held = new Set(claim.documentsCollected)
          return {
            claim,
            told: notes.get(claim.id) ?? null,
            policySystemNo: policy?.systemNo ?? claim.policyId,
            policyInsurerNo: policy?.insurerNo ?? null,
            productName: product,
            companyName: company,
            outstanding: claim.checklistItems.filter((item) => !held.has(item)),
          }
        }),
      )
    },

    async claimable(customerId, now) {
      const rows = await repositories.policies.forCustomer(customerId)
      const contracts = rows.filter((policy) => CLAIMABLE_STATES.includes(policy.status))
      return Promise.all(
        contracts.map(async (policy) => ({
          policy,
          productName: await productName(policy.productId),
          companyName: await companyName(policy.companyId),
          inForce: coverIsRunning(policy, now),
        })),
      )
    },

    intimate(command) {
      return claims.intimate(command)
    },

    async rememberIncident(note) {
      notes.set(note.claimId, note)
    },

    async attach({ claimId, actorId, files, now }) {
      if (files.length === 0) return { recorded: [], refused: [] }

      const token = newUploadToken()
      const link = await uploads.issue({
        actorId,
        claimId,
        token,
        docTypes: CLAIM_UPLOAD_DOC_TYPES,
        now,
      })
      if (!link.ok) return { recorded: [], refused: [link.reason] }

      const recorded: string[] = []
      const refused: string[] = []

      for (const file of files) {
        // Name, type and size. The bytes are never read, here or in the desk.
        const landed = await uploads.accept({
          token,
          docType: file.docType,
          fileName: file.fileName,
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes,
          now,
        })
        if (!landed.ok) {
          refused.push(`${file.fileName}: ${landed.reason}`)
          continue
        }
        recorded.push(file.fileName)
        attached.set(claimId, [...(attached.get(claimId) ?? []), landed.record])
      }

      return { recorded, refused }
    },
  }

  CACHE.set(repositories, built)
  return built
}

/**
 * Policies a claim may be raised against at all — the same list the staff
 * intimation screen offers, and for the same reason. A lapsed policy IS offered:
 * §9's blocked path exists precisely so somebody who tries is told why not,
 * rather than finding the option missing and phoning to ask.
 */
const CLAIMABLE_STATES: readonly string[] = [
  'issued',
  'dispatched',
  'documents_collected',
  'closed',
  'lapsed',
  'locked',
]

/* --------------------------------------------------------------- attention */

type AttentionInput = {
  readonly customer: Customer
  readonly policyRows: readonly Policy[]
  readonly claimRows: readonly Claim[]
  readonly documents: readonly DocumentRecord[]
  readonly now: Date
  /** The configured renewal lead, or null when no active recipe holds one. */
  readonly recipes: number | null
}

/**
 * What is waiting on this person, read off records rather than invented.
 *
 * Every branch below points at a field somebody wrote: a consent state, a
 * document row whose `isPresent` is false, a payment state, an expiry date, a
 * claim state the machine put the record in. There is no heuristic and no
 * scoring — if the platform does not hold the fact, the portal does not raise
 * the flag.
 *
 * The renewal window is the configured one (`renewal.schedule`, FR-21). When no
 * active recipe carries a lead, no renewal item is raised at all: §9 says this
 * product holds no default lead, and inventing a fortnight here would be the
 * same defect one layer up.
 */
function buildAttention(input: AttentionInput): readonly PortalAttention[] {
  const { customer, policyRows, claimRows, documents, now, recipes: leadDays } = input
  const items: PortalAttention[] = []

  if (customer.consentState !== 'submitted' || customer.kycState !== 'complete') {
    items.push({
      key: 'consent',
      kind: 'consent',
      title: 'Your KYC is not complete',
      detail:
        'Jagad Insurance sends a short, one-off link to your phone to finish this. It is not a login, and it expires.',
      path: null,
      actionLabel: null,
    })
  }

  for (const record of documents) {
    if (record.isPresent) continue
    items.push({
      key: `document-${record.id}`,
      kind: 'document',
      title: 'A document is still to reach us',
      detail: `We are waiting for one paper against ${record.subjectEntity === 'Claim' ? 'your claim' : 'your file'}. Your documents page lists what is outstanding.`,
      path: '/portal/documents',
      actionLabel: 'See my documents',
    })
  }

  for (const policy of policyRows) {
    if (!coverIsRunning(policy, now)) continue

    if (leadDays !== null && policy.expiryDate !== null) {
      const away = daysUntil(policy.expiryDate, now)
      if (away >= 0 && away <= leadDays) {
        items.push({
          key: `renewal-${policy.id}`,
          kind: 'renewal',
          title: `Cover on ${policy.systemNo} ends in ${away} ${away === 1 ? 'day' : 'days'}`,
          detail: 'Renewing before the end date keeps the cover unbroken. Your agent will call you.',
          path: '/portal/policies',
          actionLabel: 'See this policy',
        })
      }
    }

    if (policy.paymentState === 'unpaid' || policy.paymentState === 'part_paid') {
      items.push({
        key: `payment-${policy.id}`,
        kind: 'payment',
        title: `Premium on ${policy.systemNo} is not fully recorded as received`,
        detail:
          'If you have already paid, no action is needed — the receipt may still be with our back office. Otherwise your agent can take it.',
        path: '/portal/policies',
        actionLabel: 'See this policy',
      })
    }
  }

  for (const claim of claimRows) {
    const progress = claimProgress(claim.state)
    if (!progress.waitingOnYou) continue
    items.push({
      key: `claim-${claim.id}`,
      kind: 'claim',
      title: `Claim ${claim.systemNo}: ${progress.label.toLowerCase()}`,
      detail: progress.detail,
      path: '/portal/claims',
      actionLabel: 'See my claims',
    })
  }

  for (const policy of policyRows) {
    if (!coverHasEnded(policy, now)) continue
    if (!['issued', 'dispatched', 'documents_collected'].includes(policy.status)) continue
    items.push({
      key: `expired-${policy.id}`,
      kind: 'renewal',
      title: `Cover on ${policy.systemNo} has ended`,
      detail: 'The end date on this policy has passed and no renewal is recorded against it yet.',
      path: '/portal/policies',
      actionLabel: 'See this policy',
    })
  }

  return items.sort((a, b) => attentionRank(a.kind) - attentionRank(b.kind))
}
