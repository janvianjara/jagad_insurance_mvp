/**
 * The audit trail, assembled from the records that carry who and when.
 *
 * There is no separate audit table in the MVP, and inventing one would have
 * meant inventing entries. So the trail is built from what the platform already
 * stores and can prove: the consent link's own record, the document register's
 * review timestamps, and the message log. Every entry points at a real row, and
 * a row that never happened produces no entry.
 *
 * Two exclusions are rules rather than omissions:
 *
 *   A consent record's `token` never appears. It is a live credential to a
 *   login-free page (§11.1), and a page that lists tokens is a page that hands
 *   them out.
 *
 *   A document contributes its metadata only — type, review state, timestamps,
 *   who verified it. `fileName`, `extractedText` and `ocrFields` are
 *   document-content class and are not read here at all. An Aadhaar number
 *   cannot appear in this trail because nothing in it reads a field that could
 *   hold one.
 */

import type { ConsentRecord, Customer, DocumentRecord, MessageLog } from '../../../data/repo'

export const AUDIT_KINDS = {
  consent: 'consent',
  document: 'document',
  message: 'message',
} as const

export type AuditKind = (typeof AUDIT_KINDS)[keyof typeof AUDIT_KINDS]

export const AUDIT_KIND_LABELS: Readonly<Record<AuditKind, string>> = {
  consent: 'Consent',
  document: 'Document',
  message: 'Message',
}

export type AuditEntry = {
  readonly id: string
  /** When it happened, ISO. The trail is read newest first. */
  readonly at: string
  readonly kind: AuditKind
  /** What happened, in the past tense. */
  readonly action: string
  /** The record it happened to, as a person would name it. */
  readonly subject: string
  /** The record's own number, where it has one. */
  readonly recordNo: string | null
  /** Who did it. The customer, a named member of staff, or the platform. */
  readonly actor: string
  readonly detail: string
  readonly retentionClass: string | null
}

export type TrailInput = {
  readonly customers: readonly Customer[]
  readonly consents: readonly ConsentRecord[]
  readonly documents: readonly DocumentRecord[]
  readonly messages: readonly MessageLog[]
  /** Staff id to name, so a verifier is a person rather than an id. */
  readonly staffNames: Readonly<Record<string, string>>
}

const CHANNEL_LABELS: Readonly<Record<string, string>> = {
  whatsapp: 'WhatsApp',
  sms: 'SMS',
  email: 'email',
}

function nameOf(customers: readonly Customer[], id: string): string {
  return customers.find((customer) => customer.id === id)?.fullName ?? 'a customer no longer on file'
}

function consentEntries(input: TrailInput): readonly AuditEntry[] {
  return input.consents.flatMap((record) => {
    const who = nameOf(input.customers, record.customerId)
    const channel = CHANNEL_LABELS[record.channel] ?? record.channel
    const entries: AuditEntry[] = [
      {
        id: `${record.id}:issued`,
        at: record.issuedAt,
        kind: AUDIT_KINDS.consent,
        action: 'Consent link issued',
        subject: who,
        recordNo: null,
        actor: 'The platform',
        // The token is what makes the link work. It is not written here.
        detail: `A tokenised, expiring, login-free link was sent over ${channel}. It carries no session and expires on its own.`,
        retentionClass: null,
      },
    ]

    if (record.submittedAt !== null) {
      entries.push({
        id: `${record.id}:submitted`,
        at: record.submittedAt,
        kind: AUDIT_KINDS.consent,
        action: 'Consent given',
        subject: who,
        recordNo: null,
        actor: who,
        detail: 'The customer filled the link in and gave consent. The link is spent.',
        retentionClass: null,
      })
    }

    if (record.state === 'expired') {
      entries.push({
        id: `${record.id}:expired`,
        at: record.expiresAt,
        kind: AUDIT_KINDS.consent,
        action: 'Consent link expired',
        subject: who,
        recordNo: null,
        actor: 'The platform',
        detail: 'The link ran out before it was used. A new one has to be issued.',
        retentionClass: null,
      })
    }

    return entries
  })
}

function documentEntries(input: TrailInput): readonly AuditEntry[] {
  return input.documents.flatMap((document) => {
    const entries: AuditEntry[] = []

    if (document.submittedAt !== null) {
      entries.push({
        id: `${document.id}:submitted`,
        at: document.submittedAt,
        kind: AUDIT_KINDS.document,
        action: 'Document submitted',
        subject: `${document.docType} · ${document.subjectEntity}`,
        recordNo: document.systemNo,
        actor: document.uploadedByName ?? 'The customer',
        detail: `Version ${document.version} arrived and is held under the "${document.retentionClass}" retention class. Metadata only is shown here; what the document says is never in the trail.`,
        retentionClass: document.retentionClass,
      })
    }

    if (document.verifiedAt !== null) {
      const rejected = document.reviewState === 'rejected'
      entries.push({
        id: `${document.id}:${rejected ? 'rejected' : 'verified'}`,
        at: document.verifiedAt,
        kind: AUDIT_KINDS.document,
        action: rejected ? 'Document rejected' : 'Document verified',
        subject: `${document.docType} · ${document.subjectEntity}`,
        recordNo: document.systemNo,
        actor:
          document.verifiedBy === null
            ? 'The platform'
            : (input.staffNames[document.verifiedBy] ?? document.verifiedBy),
        detail: rejected
          ? 'The document was looked at and sent back. Nothing was deleted.'
          : 'A person looked at the document and accepted it.',
        retentionClass: document.retentionClass,
      })
    }

    return entries
  })
}

function messageEntries(input: TrailInput): readonly AuditEntry[] {
  return input.messages.map((message) => ({
    id: `${message.id}:sent`,
    at: message.sentAt,
    kind: AUDIT_KINDS.message,
    action: message.state === 'failed' ? 'Message failed' : 'Message sent',
    subject: message.toName,
    recordNo: message.subjectId,
    actor: 'The platform',
    // The address is personal data and adds nothing an auditor needs; the name,
    // the template and the channel are what says what went out.
    detail: `Template "${message.templateKey}" over ${CHANNEL_LABELS[message.channel] ?? message.channel}, about ${message.subjectEntity} ${message.subjectId}.`,
    retentionClass: null,
  }))
}

/** The whole trail, newest first. */
export function buildAuditTrail(input: TrailInput): readonly AuditEntry[] {
  return [...consentEntries(input), ...documentEntries(input), ...messageEntries(input)].toSorted(
    (a, b) => b.at.localeCompare(a.at),
  )
}
