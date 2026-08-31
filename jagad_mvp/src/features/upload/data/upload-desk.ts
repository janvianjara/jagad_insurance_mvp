/**
 * The upload desk — the one seam `/upload/:token` reads and writes through.
 *
 * `DocumentRepository` (plan §7) is read-only, so an accepted upload has nowhere
 * in the data layer to land. This is the same gap the playbook already records
 * against collections and tasks, and it takes the same answer the claims desk
 * took: a feature-layer decorator holding exactly what the repository cannot,
 * merging its own rows over the seeded ones on every read. When a write API
 * lands this collapses to a delegate and no screen changes.
 *
 * Three things live here and nothing else:
 *
 *   `issue`   — draws a token, asks `uploadLinkIsIssuable` BEFORE drawing it, and
 *               stores the link against the claim. A refused issue consumes no
 *               token, which is the posture `claimDesk.intimate` takes with the
 *               claim sequence.
 *
 *   `open`    — what the login-free page is allowed to know. Deliberately thin:
 *               a claim number, what the link accepts, and whether it is open.
 *               No customer name, no policy, no member, no diagnosis. A page with
 *               no session should not be able to confirm who somebody is.
 *
 *   `accept`  — presence, never content. It records that a file arrived and what
 *               it was called. It does not read the file, store it, or extract
 *               anything from it, and `fileUrl` stays null because there is no
 *               file to point at.
 *
 * The identity-leak rule is kept here rather than in the screen: `open` returns
 * the SAME closed view for an unknown token and an expired one, so a caller
 * cannot use the difference to discover which tokens exist.
 */

import {
  CLAIM_UPLOAD_DOC_TYPE,
  issueUploadLink,
  recordUploadAccepted,
  recordUploadAttempt,
  revokeUploadLink,
  uploadIsAcceptable,
  uploadLinkExpiryFrom,
  uploadLinkIsIssuable,
  uploadLinkIsOpen,
} from '../../../domain/workflows'
import type { IssueUploadLinkInput, UploadLink } from '../../../domain/workflows'
import { committed, notFound, rejected } from '../../../data/repo'
import type {
  DocumentRecord,
  DocumentType,
  MutationResult,
  Repositories,
} from '../../../data/repo'

/** Enough to hold the whole document ledger; the union is re-read in memory. */
const SCAN_SIZE = 10_000

/**
 * Document numbers are formatted locally, exactly as the fixtures do it.
 * `RECORD_PREFIXES` carries no document kind — that gap is a playbook backlog
 * item of its own, and widening the registry from here would be a second answer
 * to it rather than the one fix.
 */
function documentNo(sequence: number): string {
  return `DOC-${String(sequence).padStart(4, '0')}`
}

/** What a claim upload link collects, unless the desk narrows it further. */
export const CLAIM_UPLOAD_DOC_TYPES: readonly DocumentType[] = ['discharge_summary', 'claim_form']

/**
 * What the login-free page may know.
 *
 * Every field here is either the customer's own (the claim number printed on
 * their intimation message) or about the link itself. Nothing identifies a
 * person, because the page cannot verify who is holding it.
 */
export type UploadView = {
  readonly token: string
  readonly claimSystemNo: string
  readonly docTypes: readonly DocumentType[]
  readonly expiresAt: string
  /** Closed for any reason at all. The reason is the sentence, not a code. */
  readonly closed: boolean
  /** The guard's own sentence when closed, ready to render. */
  readonly closedReason: string | null
  /** What has already arrived on this link, by name. Presence, not content. */
  readonly accepted: readonly AcceptedUpload[]
}

export type AcceptedUpload = {
  readonly docType: DocumentType
  readonly fileName: string
  readonly at: string
}

export type IssueCommand = {
  readonly actorId: string
  readonly claimId: string
  readonly token: string
  readonly docTypes?: readonly DocumentType[]
  readonly now?: Date
}

export type AcceptCommand = {
  readonly token: string
  readonly docType: DocumentType
  readonly fileName: string
  readonly mimeType: string
  readonly sizeBytes: number
  readonly now?: Date
}

export type UploadDesk = {
  issue(command: IssueCommand): Promise<MutationResult<UploadLink>>
  /** Reads the link, counting the open. Returns null only when nothing is known. */
  open(token: string, now: Date): Promise<UploadView | null>
  accept(command: AcceptCommand): Promise<MutationResult<DocumentRecord>>
  revoke(token: string, now: Date): Promise<UploadLink | null>
  linkFor(claimId: string): Promise<UploadLink | null>
  /** The claim's documents: seeded ledger with this session's uploads merged over it. */
  documentsFor(claimId: string): Promise<readonly DocumentRecord[]>
  /** Doc types actually present, which is what the claim machine's guard reads. */
  presentDocTypes(claimId: string): Promise<readonly string[]>
}

type Store = {
  readonly links: Map<string, UploadLink>
  readonly accepted: Map<string, AcceptedUpload[]>
  /** Documents this session created or flipped to present, by document id. */
  readonly documents: Map<string, DocumentRecord>
  created: number
}

const CACHE = new WeakMap<Repositories['documents'], UploadDesk>()

/**
 * The view a caller gets for a token that is unknown, revoked, expired or over
 * its limit. One shape, one sentence, so the difference between "never existed"
 * and "closed yesterday" is not readable from the outside.
 */
function closedView(token: string, reason: string): UploadView {
  return {
    token,
    claimSystemNo: '',
    docTypes: [],
    expiresAt: '',
    closed: true,
    closedReason: reason,
    accepted: [],
  }
}

const UNKNOWN_OR_CLOSED =
  'This link is not open. It may have been used already, or it may have closed — links stay open for a few days so they cannot be reused. Reply to the message it arrived in and Jagad Insurance will send a fresh one.'

export function uploadDesk(repositories: Repositories): UploadDesk {
  const existing = CACHE.get(repositories.documents)
  if (existing) return existing

  const store: Store = { links: new Map(), accepted: new Map(), documents: new Map(), created: 0 }

  async function ledger(): Promise<readonly DocumentRecord[]> {
    const seeded = await repositories.documents.list({ page: 1, pageSize: SCAN_SIZE })
    // Session rows win, because a seeded row flipped to present is the same row.
    return seeded.rows.map((row) => store.documents.get(row.id) ?? row)
  }

  function linkOf(token: string): UploadLink | null {
    return store.links.get(token) ?? null
  }

  const built: UploadDesk = {
    async issue(command) {
      const now = command.now ?? new Date()
      const claim = await repositories.claims.get(command.claimId)
      if (!claim) return notFound('claim', command.claimId)

      const input: IssueUploadLinkInput = {
        token: command.token,
        claimId: command.claimId,
        docTypes: command.docTypes ?? CLAIM_UPLOAD_DOC_TYPES,
        issuedAt: now,
        expiresAt: uploadLinkExpiryFrom(now),
      }

      // Asked before anything is stored: a refused issue leaves no link behind.
      const verdict = uploadLinkIsIssuable(input)
      if (!verdict.ok) return rejected(verdict.reason, verdict.code)

      // One live link per claim. Re-issuing withdraws the old one rather than
      // leaving two doors open, which is what "issue a fresh one" has to mean.
      for (const [token, link] of store.links) {
        if (link.claimId === command.claimId && link.revokedAt === null) {
          store.links.set(token, revokeUploadLink(link, now))
        }
      }

      const link = issueUploadLink(input)
      store.links.set(link.token, link)
      return committed(link, [])
    },

    async open(token, now) {
      const link = linkOf(token)
      // An unknown token and a closed one are the same answer on purpose.
      if (!link) return closedView(token, UNKNOWN_OR_CLOSED)

      // The open is counted before it is judged, so a run of guesses exhausts
      // the attempt budget rather than probing it for free.
      const counted = recordUploadAttempt(link)
      store.links.set(token, counted)

      const verdict = uploadLinkIsOpen({ now, link: counted })
      if (!verdict.ok) return closedView(token, UNKNOWN_OR_CLOSED)

      const claim = await repositories.claims.get(counted.claimId)

      return {
        token,
        claimSystemNo: claim?.systemNo ?? '',
        docTypes: counted.docTypes as readonly DocumentType[],
        expiresAt: counted.expiresAt,
        closed: false,
        closedReason: null,
        accepted: store.accepted.get(token) ?? [],
      }
    },

    async accept(command) {
      const now = command.now ?? new Date()
      const link = linkOf(command.token)
      if (!link) return rejected(UNKNOWN_OR_CLOSED)

      const verdict = uploadIsAcceptable({ now, link, offeredDocType: command.docType })
      if (!verdict.ok) return rejected(verdict.reason, verdict.code)

      const claim = await repositories.claims.get(link.claimId)
      if (!claim) return notFound('claim', link.claimId)

      // The desk knows who this is; the page never does. `uploadedByName` is
      // filled here from the claim's own customer rather than from anything the
      // person on the phone typed.
      const customer = await repositories.customers.get(claim.customerId)
      const uploadedByName = customer?.fullName ?? 'The customer'

      const rows = await ledger()
      const waiting = rows.find(
        (row) =>
          row.subjectEntity === 'Claim' &&
          row.subjectId === link.claimId &&
          row.docType === command.docType &&
          !row.isPresent,
      )

      // Presence, never content: no `extractedText`, no `ocrFields`, and
      // `fileUrl` stays null because nothing was stored to point at.
      const presence = {
        isPresent: true,
        uploadedByName,
        fileName: command.fileName,
        mimeType: command.mimeType,
        fileUrl: null,
        submittedAt: now.toISOString(),
        reviewState: 'submitted' as const,
        retentionClass: 'claims',
        extractedText: null,
        ocrFields: [],
      }

      const record: DocumentRecord = waiting
        ? { ...waiting, ...presence }
        : {
            ...presence,
            id: `doc-upload-${link.claimId}-${store.created + 1}`,
            systemNo: documentNo(rows.length + store.created + 1),
            subjectEntity: 'Claim',
            subjectId: link.claimId,
            docType: command.docType,
            version: 1,
            verifiedAt: null,
            verifiedBy: null,
          }

      if (!waiting) store.created += 1
      store.documents.set(record.id, record)
      store.links.set(command.token, recordUploadAccepted(link))
      const already = store.accepted.get(command.token) ?? []
      store.accepted.set(command.token, [
        ...already,
        { docType: command.docType, fileName: command.fileName, at: now.toISOString() },
      ])

      return committed(record, [])
    },

    async revoke(token, now) {
      const link = linkOf(token)
      if (!link) return null
      const withdrawn = revokeUploadLink(link, now)
      store.links.set(token, withdrawn)
      return withdrawn
    },

    async linkFor(claimId) {
      for (const link of store.links.values()) {
        if (link.claimId === claimId && link.revokedAt === null) return link
      }
      return null
    },

    async documentsFor(claimId) {
      const rows = await ledger()
      return rows.filter((row) => row.subjectEntity === 'Claim' && row.subjectId === claimId)
    },

    async presentDocTypes(claimId) {
      const rows = await built.documentsFor(claimId)
      return rows.filter((row) => row.isPresent).map((row) => row.docType)
    },
  }

  CACHE.set(repositories.documents, built)
  return built
}

/** Re-exported so a screen naming the cashless document does not reach past the desk. */
export { CLAIM_UPLOAD_DOC_TYPE }

/**
 * A fresh token, drawn where randomness is allowed.
 *
 * The domain takes the token as an input rather than generating one (see
 * `issueUploadLink`) so fixtures stay deterministic and the guards stay pure.
 * That leaves exactly one place a real token has to come from, and this is it —
 * a screen calls this, a test passes its own.
 */
export function newUploadToken(): string {
  return crypto.randomUUID().replace(/-/g, '')
}

/** Where a link is reachable. Rendered for the desk to send, never auto-sent. */
export function uploadLinkHref(token: string): string {
  return `/upload/${token}`
}
