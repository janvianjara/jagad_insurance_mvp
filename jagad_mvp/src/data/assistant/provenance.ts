/**
 * What an answer read to answer — plan §14.1, FR-22.11.
 *
 * The projection is the strongest claim this platform makes, and until now it
 * was a claim nobody using the product could see. A person is told the
 * Assistant cannot read an Aadhaar number; they have no way to check, and an
 * assurance that cannot be checked is a marketing line. This module is the
 * front end of the audit attribution FR-22.11 asks for: every answer can say
 * which projections it read, and the list is not written by hand.
 *
 * That last point is the whole design. A card that declared its own sources
 * would drift from the queries it actually runs — silently, and in the
 * direction that flatters it. So provenance is RECORDED rather than declared:
 * the facade is wrapped, every call is noted as it happens, and what the screen
 * prints is the set of methods that were genuinely invoked. A card that starts
 * reading the claim register gets "the claim register" in its provenance line
 * in the same commit, without anybody remembering to add it.
 *
 * `SOURCE_OF_READ` is exhaustive over the facade by type. A method added to
 * `AssistantRepository` without a source here is a compile error, so a new read
 * cannot become an unattributed one.
 *
 * Nothing here widens the boundary. The wrapper returns the projections the
 * facade returned, untouched; it adds no field, reaches no repository, and has
 * no way to. It records which allow-listed door was opened, never what came
 * through it.
 */

import type { AssistantEntityName } from './projection'
import type { AssistantRepository } from './repository'

/* ------------------------------------------------------------- the sources */

type SourceSpec = {
  /** How the source reads in a sentence: "answered from the inquiry queue". */
  readonly label: string
  /** The allow-listed projections behind it. Every name is in ASSISTANT_ALLOW. */
  readonly entities: readonly AssistantEntityName[]
}

/**
 * The projections a person can be told about, grouped the way they would name
 * them. A staff member does not think in `RenewalTask`; they think "the renewal
 * pool", and a provenance line nobody can read is one more thing to skip.
 *
 * The entity list under each is what makes the grouping checkable rather than
 * decorative — the test asserts every name here is genuinely allow-listed, so
 * this file cannot claim a projection that does not exist.
 */
export const ASSISTANT_SOURCES = {
  customers: {
    label: 'the customer book',
    entities: ['Customer', 'Member', 'Household'],
  },
  consent: {
    label: 'the consent ledger',
    entities: ['ConsentRecord'],
  },
  inquiries: {
    label: 'the inquiry queue',
    entities: ['Inquiry'],
  },
  quotations: {
    label: 'the quotation list',
    entities: ['Quotation', 'QuotationLine'],
  },
  deals: {
    label: 'the deal list',
    entities: ['Deal'],
  },
  policies: {
    label: 'the policy register',
    entities: ['Policy', 'PolicyVersion', 'PolicyEntryDraft'],
  },
  premiums: {
    label: 'the premium schedule',
    entities: ['PremiumSchedule', 'InstalmentDue'],
  },
  mandates: {
    label: 'the mandate register',
    entities: ['Mandate', 'MandateEvent'],
  },
  collections: {
    label: 'the collection ledger',
    entities: ['CollectionRecord'],
  },
  documents: {
    label: 'the document register',
    entities: ['Document'],
  },
  tasks: {
    label: 'the task list',
    entities: ['Task'],
  },
  renewals: {
    label: 'the renewal pool',
    entities: ['RenewalTask'],
  },
  claims: {
    label: 'the claim register',
    entities: ['Claim'],
  },
  messages: {
    label: 'the message log',
    entities: ['MessageLog'],
  },
  catalogue: {
    label: 'the product catalogue',
    entities: ['Company', 'Product', 'BenefitItem'],
  },
  directory: {
    label: 'the staff and agency directory',
    entities: ['Agency', 'Agent', 'StaffUser', 'Team', 'InquiryCategory'],
  },
} as const satisfies Readonly<Record<string, SourceSpec>>

export type AssistantSourceKey = keyof typeof ASSISTANT_SOURCES

export const ASSISTANT_SOURCE_KEYS = Object.keys(ASSISTANT_SOURCES) as AssistantSourceKey[]

export function sourceLabel(key: AssistantSourceKey): string {
  return ASSISTANT_SOURCES[key].label
}

export function sourceEntities(key: AssistantSourceKey): readonly AssistantEntityName[] {
  return ASSISTANT_SOURCES[key].entities
}

/**
 * The sources as one readable phrase: "the inquiry queue and the renewal pool".
 *
 * A pure function rather than markup, so the sentence a screen prints is the
 * sentence a test can assert on.
 */
export function describeSources(keys: readonly AssistantSourceKey[]): string {
  const labels = keys.map(sourceLabel)
  if (labels.length === 0) return ''
  if (labels.length === 1) return labels[0]
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`
}

/* ------------------------------------------------- every read, attributed */

/** The method names on the facade — everything callable, and nothing else. */
export type AssistantReadMethod = {
  [K in keyof AssistantRepository]: AssistantRepository[K] extends (...args: never[]) => unknown
    ? K
    : never
}[keyof AssistantRepository]

/**
 * Which source each facade method reads from.
 *
 * Exhaustive by construction: `Record<AssistantReadMethod, …>` means a method
 * added to `AssistantRepository` fails this file to compile until somebody says
 * what it reads. An unattributed read is the failure mode this whole module
 * exists to prevent, so it is a build error rather than a review note.
 */
export const SOURCE_OF_READ: Readonly<Record<AssistantReadMethod, AssistantSourceKey>> = {
  customers: 'customers',
  customer: 'customers',
  members: 'customers',
  household: 'customers',
  consent: 'consent',

  inquiries: 'inquiries',
  inquiry: 'inquiries',

  quotations: 'quotations',
  quotation: 'quotations',
  quotationLines: 'quotations',

  deals: 'deals',
  deal: 'deals',

  policies: 'policies',
  policy: 'policies',
  policiesForCustomer: 'policies',
  policyVersions: 'policies',
  policyDraft: 'policies',

  schedule: 'premiums',
  instalments: 'premiums',

  mandate: 'mandates',
  mandateEvents: 'mandates',

  collections: 'collections',

  documents: 'documents',
  documentPresence: 'documents',

  tasks: 'tasks',
  task: 'tasks',
  renewals: 'renewals',

  claims: 'claims',
  claim: 'claims',
  claimsForCustomer: 'claims',

  messages: 'messages',

  companies: 'catalogue',
  products: 'catalogue',
  benefitItems: 'catalogue',

  agencies: 'directory',
  agents: 'directory',
  staff: 'directory',
  teams: 'directory',
  categories: 'directory',
}

/* ----------------------------------------------------------- the recorder */

export type RecordedReads = {
  /** The facade, unchanged in what it returns. Hand this to the card. */
  readonly repo: AssistantRepository
  /** The sources actually read, in the order they were first read. */
  sourcesRead(): readonly AssistantSourceKey[]
}

/**
 * The facade, with a note taken of every projection it is asked for.
 *
 * A proxy rather than a hand-written wrapper of forty methods, because a
 * hand-written one is a second copy of the facade that can fall behind it — and
 * the method it forgot to wrap would be the read that never showed up in a
 * provenance line. The proxy cannot fall behind: it forwards everything and
 * attributes anything `SOURCE_OF_READ` names.
 *
 * It is a read recorder and nothing more. It does not cache, does not alter an
 * argument, does not touch a returned projection, and holds no data between
 * calls beyond the set of source keys.
 */
export function recordingRepository(repo: AssistantRepository): RecordedReads {
  const read = new Set<AssistantSourceKey>()

  const recorder = new Proxy(repo, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver)

      if (typeof property !== 'string' || typeof value !== 'function') return value
      if (!Object.hasOwn(SOURCE_OF_READ, property)) return value

      const source = SOURCE_OF_READ[property as AssistantReadMethod]
      const method = value as (...args: unknown[]) => unknown

      return (...args: unknown[]) => {
        read.add(source)
        return method.apply(target, args)
      }
    },
  })

  return {
    repo: recorder,
    sourcesRead: () => [...read],
  }
}
