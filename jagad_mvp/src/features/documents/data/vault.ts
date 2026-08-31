/**
 * The vault desk — plan §5 "Document vault", §14.1.
 *
 * `DocumentRepository` reads metadata and nothing else, which is right. What the
 * vault screen additionally needs is the half of FR that has no field on the
 * entity, and there are exactly two things:
 *
 * **The access log.** "Every open logged" is the requirement, and it is a
 * requirement about a fact no document carries: who looked, at what, when. So
 * this module holds an append-only list of opens and hands it back. It is
 * append-only in the strongest sense available here — there is no method that
 * removes, edits or clears an entry, and `accessLog()` returns a copy, so a
 * caller cannot mutate the log through the array it is given. When a real audit
 * sink exists this collapses to one `document.opened` emit and the log becomes a
 * read; the shape a screen consumes is already that. The event name is not in
 * `DOMAIN_EVENT_NAMES` yet, and inventing one in a feature would put a name into
 * the audit contract from the wrong side of the layer boundary, so the log lives
 * here until the domain gains it.
 *
 * **The ACL.** A document has no owner, team or agent of its own — it points at
 * a subject. So "which documents may this person see" is a question about the
 * SUBJECT's attributes, and the answer is built by resolving subjects once and
 * running each document's subject through `can()`. A document whose subject
 * cannot be resolved is visible only to an `all`-scope template: unknown means
 * denied, never allowed.
 *
 * Nothing here serves a file. `fileUrl` is `document-content` and this desk does
 * not fetch, proxy or expose it; opening a document in the MVP means reading its
 * metadata, and the log entry records exactly that so a later audit cannot be
 * misread as "this person saw the paper".
 */

import type {
  DocumentRecord,
  DocumentRepository,
  ListQuery,
  Page,
  Repositories,
} from '../../../data/repo'
import { DEFAULT_PAGE_SIZE } from '../../../data/repo'
import { can } from '../../../domain/permissions'
import type { ScopedRecord, User } from '../../../domain/permissions'

/** Big enough to hold the whole in-memory set; a scope pass needs every row. */
const SCAN_SIZE = 10_000

/** The retention filter the repository does not declare; applied here instead. */
export const RETENTION_FILTER = 'retention'

/* ------------------------------------------------------------- the subjects */

/**
 * What the vault knows about the record a document hangs off: enough to name it,
 * enough to link to it, and enough to answer the scope question.
 *
 * The identity fields are present only for a customer, are only ever the last
 * four digits the record already holds, and are rendered through
 * `<MaskedValue>`. There is no field here for a full number and nothing in this
 * module could produce one.
 */
export type DocumentSubject = {
  readonly entity: string
  readonly id: string
  /** The name a person recognises: a reference, or a customer's name. */
  readonly label: string
  /** The record's own screen, when §4 has one. */
  readonly href: string | null
  readonly scope: ScopedRecord
  readonly aadhaarLast4: string | null
  readonly panNumber: string | null
}

export type VaultSubjects = Readonly<Record<string, DocumentSubject>>

export function subjectKey(entity: string, id: string): string {
  return `${entity}:${id}`
}

/**
 * Resolves every subject a document could point at.
 *
 * Four wide reads rather than a per-row lookup, for the reason the drafts queue
 * gives: which documents sit on page one changes with the sort and the filter,
 * so a page-shaped resolve would leave half the rows unable to name themselves —
 * and, worse here, unable to be scope-tested. The sets are the agency's own
 * book. Against a real API this becomes a filter the server applies.
 */
export async function loadVaultSubjects(repositories: Repositories): Promise<VaultSubjects> {
  const [customers, policies, quotations, claims] = await Promise.all([
    repositories.customers.list({ page: 1, pageSize: SCAN_SIZE }),
    repositories.policies.list({ page: 1, pageSize: SCAN_SIZE }),
    repositories.quotations.list({ page: 1, pageSize: SCAN_SIZE }),
    repositories.claims.list({ page: 1, pageSize: SCAN_SIZE }),
  ])

  const subjects: Record<string, DocumentSubject> = {}

  for (const customer of customers.rows) {
    subjects[subjectKey('Customer', customer.id)] = {
      entity: 'Customer',
      id: customer.id,
      label: customer.fullName,
      href: `/customers/${customer.id}`,
      scope: attributes({
        ownerId: customer.ownerId,
        agentId: customer.agentId,
        subAgentId: customer.subAgentId,
      }),
      aadhaarLast4: customer.aadhaarLast4,
      panNumber: customer.panNumber,
    }
  }

  for (const policy of policies.rows) {
    subjects[subjectKey('Policy', policy.id)] = {
      entity: 'Policy',
      id: policy.id,
      label: policy.systemNo,
      href: `/policies/${policy.id}`,
      scope: attributes({
        agentId: policy.agentId,
        subAgentId: policy.subAgentId,
        companyId: policy.companyId,
      }),
      aadhaarLast4: null,
      panNumber: null,
    }
  }

  for (const quotation of quotations.rows) {
    subjects[subjectKey('Quotation', quotation.id)] = {
      entity: 'Quotation',
      id: quotation.id,
      label: quotation.systemNo,
      href: `/quotations/${quotation.id}`,
      scope: attributes({ ownerId: quotation.ownerId, agentId: quotation.agentId }),
      aadhaarLast4: null,
      panNumber: null,
    }
  }

  for (const claim of claims.rows) {
    subjects[subjectKey('Claim', claim.id)] = {
      entity: 'Claim',
      id: claim.id,
      label: claim.systemNo,
      href: `/claims/${claim.id}`,
      scope: attributes({ ownerId: claim.ownerId, agentId: claim.agentId }),
      aadhaarLast4: null,
      panNumber: null,
    }
  }

  return subjects
}

/**
 * Drops the nulls.
 *
 * `ScopedRecord` uses `undefined` for "not set" and the entities use `null`; the
 * difference decides real access, because `record.teamId === user.teamId` is
 * true for two nulls and would hand every teamless record to every teamless
 * user.
 */
function attributes(values: Readonly<Record<string, string | null>>): ScopedRecord {
  const scope: Record<string, string> = {}
  for (const [key, value] of Object.entries(values)) {
    if (value !== null) scope[key] = value
  }
  return scope
}

export function subjectOf(
  subjects: VaultSubjects,
  document: DocumentRecord,
): DocumentSubject | null {
  return subjects[subjectKey(document.subjectEntity, document.subjectId)] ?? null
}

/**
 * Whether this person's attribute scope reaches this document.
 *
 * An unresolved subject is tested as a record with no attributes, which passes
 * only at `level: 'all'`. That is deliberate: unknown must fail closed.
 */
export function mayOpen(user: User, subjects: VaultSubjects, document: DocumentRecord): boolean {
  const subject = subjectOf(subjects, document)
  return can(user, 'view', 'documents', subject?.scope ?? {})
}

/* ----------------------------------------------------------- the access log */

export type DocumentAccess = {
  readonly id: string
  readonly documentId: string
  /** Copied so the log still reads after the record is superseded by a version. */
  readonly systemNo: string
  readonly actorId: string
  readonly openedAt: string
  /**
   * What was actually shown. The MVP serves metadata only, and the log says so
   * rather than letting a later reader assume the file itself was handed over.
   */
  readonly shown: 'metadata'
}

export type DocumentOpen = {
  readonly document: DocumentRecord
  readonly subject: DocumentSubject | null
  /** The entry this open just wrote. */
  readonly access: DocumentAccess
}

export type OpenCommand = {
  readonly actorId: string
  readonly now: Date
}

export type Vault = {
  /** The list, ACL-filtered and paged. Metadata only — no file is ever served. */
  list(user: User, subjects: VaultSubjects, query: ListQuery): Promise<Page<DocumentRecord>>
  /**
   * Opens one document, and records that it was opened. Refuses — returning
   * null — when this person's scope does not reach it, and writes no log entry
   * for a refusal, because nothing was shown.
   */
  open(
    user: User,
    subjects: VaultSubjects,
    documentId: string,
    command: OpenCommand,
  ): Promise<DocumentOpen | null>
  /** Every open recorded in this session, newest first. Append-only; a copy. */
  accessLog(documentId?: string): readonly DocumentAccess[]
}

const CACHE = new WeakMap<DocumentRepository, Vault>()

/**
 * One vault per underlying repository, so the list and the log are the same
 * vault's. Two desks would mean a screen could show an access log that did not
 * contain the open the person had just performed.
 */
export function documentVault(repositories: Repositories): Vault {
  const existing = CACHE.get(repositories.documents)
  if (existing) return existing
  const built = buildVault(repositories)
  CACHE.set(repositories.documents, built)
  return built
}

/** Splits the retention filter out of the query the repository will see. */
function splitRetention(query: ListQuery): {
  readonly wanted: readonly string[]
  readonly rest: ListQuery
} {
  const filters = { ...(query.filters ?? {}) }
  const wanted = filters[RETENTION_FILTER] ?? []
  delete filters[RETENTION_FILTER]
  return { wanted, rest: { ...query, filters } }
}

function buildVault(repositories: Repositories): Vault {
  const log: DocumentAccess[] = []
  /**
   * One entry per open, keyed by who opened what at which instant.
   *
   * `open` is idempotent on that key, which is not a shortcut: React's
   * development StrictMode invokes an effect twice, a retry re-runs a load, and
   * neither is a second time somebody looked at the paper. Two genuine opens are
   * two different instants and get two entries; one open replayed gets the entry
   * it already has.
   */
  const seen = new Map<string, DocumentAccess>()
  let sequence = 0

  return {
    async list(user, subjects, query) {
      const { wanted, rest } = splitRetention(query)

      const wide = await repositories.documents.list({ ...rest, page: 1, pageSize: SCAN_SIZE })

      const matched = wide.rows.filter(
        (document) =>
          mayOpen(user, subjects, document) &&
          (wanted.length === 0 || wanted.includes(document.retentionClass)),
      )

      const pageSize = Math.max(1, query.pageSize ?? DEFAULT_PAGE_SIZE)
      const pageCount = Math.ceil(matched.length / pageSize)
      const page = Math.min(Math.max(1, query.page ?? 1), Math.max(1, pageCount))
      const start = (page - 1) * pageSize

      return {
        rows: matched.slice(start, start + pageSize),
        total: matched.length,
        page,
        pageSize,
        pageCount,
      }
    },

    async open(user, subjects, documentId, command) {
      const document = await repositories.documents.get(documentId)
      if (!document) return null
      // A refusal writes nothing, including to the log: an access log that
      // recorded denied attempts as opens would overstate what was seen.
      if (!mayOpen(user, subjects, document)) return null

      const openedAt = command.now.toISOString()
      const key = `${document.id}:${command.actorId}:${openedAt}`
      const already = seen.get(key)
      if (already) return { document, subject: subjectOf(subjects, document), access: already }

      sequence += 1
      const access: DocumentAccess = {
        id: `acc-${sequence}`,
        documentId: document.id,
        systemNo: document.systemNo,
        actorId: command.actorId,
        openedAt,
        shown: 'metadata',
      }
      log.push(access)
      seen.set(key, access)

      return { document, subject: subjectOf(subjects, document), access }
    },

    accessLog(documentId) {
      const entries = documentId === undefined
        ? log
        : log.filter((entry) => entry.documentId === documentId)
      // Newest first, and a copy: the log is append-only and a caller must not
      // be able to reorder or empty it through the array it was handed.
      return [...entries].reverse()
    },
  }
}
