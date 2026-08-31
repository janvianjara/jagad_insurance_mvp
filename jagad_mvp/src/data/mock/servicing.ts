/**
 * Servicing and the outward channel — endorsements, renewal notice batches, OCR
 * templates, message templates and integrations.
 *
 * Four things are worth reading before the code.
 *
 * The endorsement adapter reads the claims-in-period verdict off the platform's
 * own claim table rather than taking it from the caller. §9 says the check "runs
 * against the platform's own claim data and returns instantly", and a verdict a
 * screen could pass in is a verdict a screen could get wrong. The guards then
 * decide which of the two cancellation edges is open.
 *
 * `versionPolicy` writes the new `PolicyVersion` in the same move that closes the
 * endorsement, numbering it by counting what the policy already holds. That is
 * arithmetic on a version number; no amount is computed anywhere in this file.
 *
 * `completeOcr` writes the extracted rows and then routes every one of them
 * through the row machine — matched where the number resolved, unmatched where it
 * did not. No row reaches `review` in a state nobody assigned. `send` then adds
 * the one check §9 leaves to the platform rather than to the machine: a row still
 * holding an unconfirmed extraction is a form that cannot submit.
 *
 * Templates and integrations have no §9 machine and no P-02 event name, and
 * `active` and `enabled` are flags rather than workflow states. Their writes go
 * through `writeConfig`, the one write path here that emits nothing — inventing
 * an event name to look busy would put a string into the audit log that the
 * domain's own contract has never heard of.
 */

import {
  claimsInPeriodCheck,
  endorsementMachine,
  noticeBatchMachine,
  noticeRowMachine,
  rowsInSend,
} from '../../domain/workflows'
import type {
  EndorsementContext,
  EndorsementState,
  NoticeBatchContext,
  NoticeBatchState,
  NoticeRow,
  NoticeRowContext,
  NoticeRowState,
} from '../../domain/workflows'
import type { MessageTemplate } from '../repo/config'
import type { OcrField } from '../repo/documents'
import type {
  Endorsement,
  EndorsementFigure,
  EndorsementRepository,
  EndorsementStepCommand,
} from '../repo/endorsements'
import { secretLikeSettingKeys } from '../repo/integrations'
import type { IntegrationConfig, IntegrationRepository } from '../repo/integrations'
import type {
  NoticeBatch,
  NoticeBatchRepository,
  NoticeMatch,
  NoticeRowCommand,
  OcrTemplateRepository,
} from '../repo/notices'
import type { PolicyVersion } from '../repo/policies'
import { committed, notFound, rejected } from '../repo/result'
import type { MutationResult } from '../repo/result'
import type { MessageTemplateRepository } from '../repo/templates'
import { runQuery } from './list'
import type { Latency } from './latency'
import { create, move } from './move'
import { rowsOf } from './store'
import type { MockStore } from './store'

export type ServicingDeps = {
  readonly store: MockStore
  readonly latency: Latency
}

/** Neither figure. The shape a non-financial endorsement holds, forever. */
const NO_FIGURE: EndorsementFigure = { amount: null, source: null, insurerReference: null }

/**
 * The write path for a configuration row: no machine, no event, no state. Every
 * other write in this layer goes through `move`, `create` or `record`.
 */
function writeConfig<T>(
  table: Map<string, T>,
  entity: string,
  id: string,
  apply: (row: T) => T,
): MutationResult<T> {
  const existing = table.get(id)
  if (!existing) return notFound(entity, id)
  const updated = apply(existing)
  table.set(id, updated)
  return committed(updated, [])
}

/** A stored figure as the machine wants it: absent rather than null. */
function figureToContext(figure: EndorsementFigure): EndorsementContext['delta'] {
  if (figure.amount === null && figure.source === null) return undefined
  return {
    amount: figure.amount ?? undefined,
    source: figure.source ?? undefined,
    insurerReference: figure.insurerReference ?? undefined,
  }
}

/** Marks the named extractions confirmed. Nothing else flips `confirmed`. */
function confirmFields(
  fields: readonly OcrField[],
  confirmed: readonly string[] | undefined,
): readonly OcrField[] {
  if (!confirmed || confirmed.length === 0) return fields
  const wanted = new Set(confirmed)
  return fields.map((field) =>
    wanted.has(field.name) ? { ...field, confirmed: true } : field,
  )
}

export function createServicingRepositories(deps: ServicingDeps): {
  endorsements: EndorsementRepository
  noticeBatches: NoticeBatchRepository
  ocrTemplates: OcrTemplateRepository
  templates: MessageTemplateRepository
  integrations: IntegrationRepository
} {
  const { store, latency } = deps
  const t = store.tables
  const wait = () => latency.wait()
  const at = (given?: Date) => given ?? store.now()

  /* --------------------------------------------------------- endorsements */

  /**
   * §9's check, run against the platform's own claim data. The period is the
   * policy's own term; a policy with no dates cannot narrow it, so every claim on
   * the policy counts — the cautious direction, because the answer decides
   * whether a refund is due.
   */
  function claimsVerdictFor(endorsement: Endorsement) {
    const policy = t.policies.get(endorsement.policyId)
    const from = policy?.startDate ?? null
    const to = policy?.expiryDate ?? null

    const claims = rowsOf(t.claims)
      .filter((claim) => claim.policyId === endorsement.policyId)
      .filter((claim) => {
        const on = claim.raisedAt.slice(0, 10)
        if (from !== null && on < from) return false
        if (to !== null && on > to) return false
        return true
      })
      .map((claim) => ({ claimId: claim.id, occurredOn: claim.raisedAt.slice(0, 10) }))

    return claimsInPeriodCheck(claims)
  }

  function endorsementCtx(
    endorsement: Endorsement,
    extra: Partial<EndorsementContext> = {},
  ): EndorsementContext {
    const verdict = claimsVerdictFor(endorsement)

    return {
      type: endorsement.type,
      renderedFields: extra.renderedFields,
      changedFields: extra.changedFields ?? endorsement.changedFields,
      scope: extra.scope,
      replacesInsuredEntity: extra.replacesInsuredEntity ?? endorsement.replacesInsuredEntity,
      delta: extra.delta ?? figureToContext(endorsement.delta),
      refund: extra.refund ?? figureToContext(endorsement.refund),
      claimsInPeriod: verdict.claimIds.map((claimId) => ({
        claimId,
        occurredOn: t.claims.get(claimId)?.raisedAt.slice(0, 10) ?? '',
      })),
      endorsementNo: endorsement.systemNo,
      insurerEndorsementNo:
        extra.insurerEndorsementNo ?? endorsement.insurerEndorsementNo ?? undefined,
      newDocumentVersion: extra.newDocumentVersion,
      priorVersionLocked: extra.priorVersionLocked,
    }
  }

  function endorsementStep(
    id: string,
    to: EndorsementState,
    command: EndorsementStepCommand,
    extra: Partial<EndorsementContext> = {},
    apply: (row: Endorsement) => Endorsement = (row) => row,
  ): MutationResult<Endorsement> {
    const endorsement = t.endorsements.get(id)
    if (!endorsement) return notFound('Endorsement', id)

    return move<EndorsementState, EndorsementContext, Endorsement>({
      store,
      table: t.endorsements,
      entity: 'Endorsement',
      id,
      machine: endorsementMachine,
      stateOf: (row) => row.state,
      to,
      ctx: endorsementCtx(endorsement, extra),
      actorId: command.actorId,
      detail: command.note === undefined ? undefined : { note: command.note },
      apply: (row) => ({ ...apply(row), state: to }),
    })
  }

  const endorsements: EndorsementRepository = {
    async list(query) {
      await wait()
      return runQuery(rowsOf(t.endorsements), ENDORSEMENT_LIST_SPEC, query)
    },
    async get(id) {
      await wait()
      return t.endorsements.get(id) ?? null
    },
    async getMany(ids) {
      await wait()
      return ids.map((id) => t.endorsements.get(id)).filter((row) => row !== undefined)
    },
    async bySystemNo(no) {
      await wait()
      return rowsOf(t.endorsements).find((row) => row.systemNo === no) ?? null
    },
    async forPolicy(policyId) {
      await wait()
      return rowsOf(t.endorsements).filter((row) => row.policyId === policyId)
    },
    async forCustomer(customerId) {
      await wait()
      return rowsOf(t.endorsements).filter((row) => row.customerId === customerId)
    },
    async queue(query) {
      await wait()
      return runQuery(rowsOf(t.endorsements), ENDORSEMENT_LIST_SPEC, query)
    },
    async claimsInPeriod(id) {
      await wait()
      const endorsement = t.endorsements.get(id)
      if (!endorsement) return null
      return claimsVerdictFor(endorsement)
    },

    async create(command) {
      await wait()
      const now = at(command.now)

      // No state is chosen here: `create` writes `endorsementMachine.initial`,
      // which §9 makes `type_selected`, and numbers from the END sequence.
      return create({
        store,
        table: t.endorsements,
        entity: 'Endorsement',
        kind: 'endorsement',
        machine: endorsementMachine,
        event: 'endorsement.type_selected',
        actorId: command.actorId,
        detail: { policyId: command.policyId, type: command.type },
        build: (born): Endorsement => ({
          id: born.id,
          systemNo: born.systemNo,
          // The insurer's own endorsement number arrives with its advice, later.
          insurerEndorsementNo: null,
          policyId: command.policyId,
          customerId: command.customerId,
          type: command.type,
          state: born.status,
          ownerId: command.ownerId ?? null,
          requestedAt: now.toISOString(),
          effectiveFrom: command.effectiveFrom ?? null,
          reason: command.reason,
          changedFields: command.changedFields ?? [],
          replacesInsuredEntity: command.replacesInsuredEntity ?? false,
          // Both figures start absent, and on a non-financial endorsement they
          // stay absent: §9 renders no premium field, so none can be recorded.
          delta: NO_FIGURE,
          refund: NO_FIGURE,
          claimsVerdict: null,
          policyVersionId: null,
          documentId: null,
          approvedBy: null,
          approvedAt: null,
        }),
      })
    },

    async selectType(id, command) {
      await wait()
      const endorsement = t.endorsements.get(id)
      if (!endorsement) return notFound('Endorsement', id)

      // The type decides the edge, so a caller never names a target state.
      const to: EndorsementState =
        endorsement.type === 'non_financial'
          ? 'non_financial'
          : endorsement.type === 'financial'
            ? 'delta_entry'
            : 'claims_check'

      return endorsementStep(
        id,
        to,
        command,
        {
          renderedFields: command.renderedFields,
          changedFields: command.changedFields,
          scope:
            command.permittedFields === undefined
              ? undefined
              : { permittedFields: command.permittedFields },
          replacesInsuredEntity: command.replacesInsuredEntity,
        },
        (row) => ({
          ...row,
          changedFields: command.changedFields ?? row.changedFields,
          replacesInsuredEntity: command.replacesInsuredEntity ?? row.replacesInsuredEntity,
        }),
      )
    },

    async recordDelta(id, command) {
      await wait()
      // Exactly as typed off the insurer's endorsement advice. Nothing here
      // subtracts the old premium from the new one.
      const delta: EndorsementFigure = {
        amount: command.delta,
        source: command.source,
        insurerReference: command.insurerReference ?? null,
      }

      return endorsementStep(id, 'submitted', command, { delta: figureToContext(delta) }, (row) => ({
        ...row,
        delta,
      }))
    },

    async blockRefund(id, command) {
      await wait()
      const endorsement = t.endorsements.get(id)
      if (!endorsement) return notFound('Endorsement', id)
      const verdict = claimsVerdictFor(endorsement)

      return endorsementStep(id, 'refund_not_eligible', command, {}, (row) => ({
        ...row,
        claimsVerdict: verdict,
        refund: NO_FIGURE,
      }))
    },

    async recordRefund(id, command) {
      await wait()
      const endorsement = t.endorsements.get(id)
      if (!endorsement) return notFound('Endorsement', id)
      const verdict = claimsVerdictFor(endorsement)

      // The insurer's figure, with the document it was read off beside it. The
      // platform records a refund; it never pro-rates one.
      const refund: EndorsementFigure = {
        amount: command.refund,
        source: command.source,
        insurerReference: command.insurerReference,
      }

      return endorsementStep(
        id,
        'refund_typed',
        command,
        { refund: figureToContext(refund) },
        (row) => ({ ...row, refund, claimsVerdict: verdict }),
      )
    },

    async submit(id, command) {
      await wait()
      return endorsementStep(id, 'submitted', command)
    },

    async approve(id, command) {
      await wait()
      const now = at(command.now)
      return endorsementStep(id, 'approved', command, {}, (row) => ({
        ...row,
        approvedBy: command.actorId,
        approvedAt: now.toISOString(),
      }))
    },

    async versionPolicy(id, command) {
      await wait()
      const endorsement = t.endorsements.get(id)
      if (!endorsement) return notFound('Endorsement', id)

      const held = rowsOf(t.policyVersions).filter(
        (version) => version.policyId === endorsement.policyId,
      )
      // A version number, not an amount. §9 requires at least 2, because an
      // approved endorsement never edits the version already issued.
      const nextVersion = held.length + 1
      const versionId = `pvr-${endorsement.policyId.replace('pol-', '')}-${nextVersion}`

      const outcome = endorsementStep(
        id,
        'policy_versioned',
        command,
        {
          insurerEndorsementNo: command.insurerEndorsementNo,
          newDocumentVersion: nextVersion,
          // Earlier versions are never rewritten by this layer, so the lock the
          // guard asks about is a property of the store rather than a flag.
          priorVersionLocked: true,
        },
        (row) => ({
          ...row,
          insurerEndorsementNo: command.insurerEndorsementNo,
          effectiveFrom: command.effectiveFrom,
          policyVersionId: versionId,
          documentId: command.documentId ?? row.documentId,
        }),
      )

      if (!outcome.ok) return outcome

      const version: PolicyVersion = {
        id: versionId,
        policyId: endorsement.policyId,
        version: nextVersion,
        effectiveFrom: command.effectiveFrom,
        documentId: command.documentId ?? null,
        endorsementNo: endorsement.systemNo,
        insurerEndorsementNo: command.insurerEndorsementNo,
        note: command.note,
        createdAt: at(command.now).toISOString(),
      }
      t.policyVersions.set(version.id, version)

      return outcome
    },
  }

  /* ------------------------------------------------------- notice batches */

  function matchesOf(batchId: string): readonly NoticeMatch[] {
    return rowsOf(t.noticeMatches)
      .filter((row) => row.batchId === batchId)
      .sort((a, b) => a.rowNumber - b.rowNumber)
  }

  /** The machine's view of a row: state, printed number, matched policy. */
  function toNoticeRow(row: NoticeMatch): NoticeRow {
    return row.matchedPolicyId === null
      ? { id: row.id, state: row.state, noticePolicyNo: row.noticePolicyNo }
      : {
          id: row.id,
          state: row.state,
          noticePolicyNo: row.noticePolicyNo,
          matchedPolicyId: row.matchedPolicyId,
        }
  }

  function batchCtx(batch: NoticeBatch, extra: Partial<NoticeBatchContext> = {}): NoticeBatchContext {
    return {
      rows: extra.rows ?? matchesOf(batch.id).map(toNoticeRow),
      selectedRowIds: extra.selectedRowIds,
      ocrCompletedAt: extra.ocrCompletedAt ?? batch.ocrCompletedAt ?? undefined,
    }
  }

  function rowCtx(row: NoticeMatch, extra: Partial<NoticeRowContext> = {}): NoticeRowContext {
    return {
      matchedPolicyId: extra.matchedPolicyId ?? row.matchedPolicyId ?? undefined,
      manuallyLinkedBy: extra.manuallyLinkedBy ?? row.manuallyLinkedBy ?? undefined,
      rejectReason: extra.rejectReason ?? row.rejectReason ?? undefined,
    }
  }

  function rowStep(
    rowId: string,
    to: NoticeRowState,
    command: NoticeRowCommand,
    extra: Partial<NoticeRowContext>,
    apply: (row: NoticeMatch) => NoticeMatch,
  ): MutationResult<NoticeMatch> {
    const row = t.noticeMatches.get(rowId)
    if (!row) return notFound('NoticeMatch', rowId)

    return move<NoticeRowState, NoticeRowContext, NoticeMatch>({
      store,
      table: t.noticeMatches,
      entity: 'NoticeMatch',
      id: rowId,
      machine: noticeRowMachine,
      stateOf: (current) => current.state,
      to,
      ctx: rowCtx(row, extra),
      actorId: command.actorId,
      detail: { noticePolicyNo: row.noticePolicyNo },
      apply: (current) => ({
        ...apply(current),
        state: to,
        // OCR never silent-commits. A value becomes confirmed only because a
        // person said so, on the same move that acted on the row.
        ocrFields: confirmFields(current.ocrFields, command.confirmedFields),
      }),
    })
  }

  const noticeBatches: NoticeBatchRepository = {
    async list(query) {
      await wait()
      return runQuery(rowsOf(t.noticeBatches), NOTICE_BATCH_LIST_SPEC, query)
    },
    async get(id) {
      await wait()
      return t.noticeBatches.get(id) ?? null
    },
    async getMany(ids) {
      await wait()
      return ids.map((id) => t.noticeBatches.get(id)).filter((row) => row !== undefined)
    },
    async bySystemNo(no) {
      await wait()
      return rowsOf(t.noticeBatches).find((row) => row.systemNo === no) ?? null
    },
    async forCompany(companyId) {
      await wait()
      return rowsOf(t.noticeBatches).filter((row) => row.companyId === companyId)
    },
    async queue(query) {
      await wait()
      return runQuery(rowsOf(t.noticeBatches), NOTICE_BATCH_LIST_SPEC, query)
    },
    async rows(batchId, query) {
      await wait()
      return runQuery(matchesOf(batchId), NOTICE_MATCH_LIST_SPEC, query)
    },
    async row(rowId) {
      await wait()
      return t.noticeMatches.get(rowId) ?? null
    },
    async summary(batchId) {
      await wait()
      if (!t.noticeBatches.has(batchId)) return null
      const rows = matchesOf(batchId)
      return {
        batchId,
        total: rows.length,
        pending: rows.filter((row) => row.state === 'pending').length,
        matched: rows.filter((row) => row.state === 'matched').length,
        unmatched: rows.filter((row) => row.state === 'unmatched').length,
        rejected: rows.filter((row) => row.state === 'rejected').length,
        unconfirmedExtractions: rows.filter((row) =>
          row.ocrFields.some((field) => !field.confirmed),
        ).length,
      }
    },

    async upload(command) {
      await wait()
      const now = at(command.now)
      // The batch number is readable but is not one of §8's generated series, so
      // it is formatted here rather than drawn from the store counter.
      const sequence = t.noticeBatches.size + 1
      const id = `ntb-${String(sequence).padStart(4, '0')}`
      if (t.noticeBatches.has(id)) {
        return rejected(`A notice batch already holds the number ${id}.`)
      }

      const emitted = store.bus.emit('notice.batch_uploaded', {
        actorId: command.actorId,
        subject: { entity: 'NoticeBatch', id },
        detail: { companyId: command.companyId, expiryMonth: command.expiryMonth },
      })

      const batch: NoticeBatch = {
        id,
        systemNo: `NTB-${String(sequence).padStart(4, '0')}`,
        companyId: command.companyId,
        ocrTemplateId: command.ocrTemplateId ?? null,
        // The machine's initial state, and the only status a creation may write.
        state: noticeBatchMachine.initial,
        sourceDocumentId: command.sourceDocumentId ?? null,
        fileName: command.fileName,
        expiryMonth: command.expiryMonth,
        uploadedBy: command.uploadedBy,
        uploadedAt: now.toISOString(),
        ocrStartedAt: null,
        ocrCompletedAt: null,
        rowCount: 0,
        sentBy: null,
        sentAt: null,
      }
      t.noticeBatches.set(id, batch)
      return committed(batch, [emitted])
    },

    async startOcr(id, command) {
      await wait()
      const batch = t.noticeBatches.get(id)
      if (!batch) return notFound('NoticeBatch', id)
      const now = at(command.now)

      return move<NoticeBatchState, NoticeBatchContext, NoticeBatch>({
        store,
        table: t.noticeBatches,
        entity: 'NoticeBatch',
        id,
        machine: noticeBatchMachine,
        stateOf: (row) => row.state,
        to: 'ocr_running',
        ctx: batchCtx(batch),
        actorId: command.actorId,
        apply: (row) => ({ ...row, state: 'ocr_running', ocrStartedAt: now.toISOString() }),
      })
    },

    async completeOcr(id, command) {
      await wait()
      const batch = t.noticeBatches.get(id)
      if (!batch) return notFound('NoticeBatch', id)
      const now = at(command.now)
      const completedAt = now.toISOString()

      // Built first so the guard sees the rows extraction actually produced; the
      // table is written only after the machine has allowed the move.
      const built: NoticeMatch[] = command.rows.map((extracted, index) => ({
        id: `ntm-${id.replace('ntb-', '')}-${index + 1}`,
        batchId: id,
        rowNumber: index + 1,
        state: noticeRowMachine.initial,
        noticePolicyNo: extracted.noticePolicyNo,
        noticeCustomerName: extracted.noticeCustomerName,
        noticeExpiryDate: extracted.noticeExpiryDate ?? null,
        // Printed on the notice, typed off it. Never derived from a held policy.
        noticePremium: extracted.noticePremium ?? null,
        noticePremiumSource: extracted.noticePremiumSource ?? null,
        matchedPolicyId: null,
        matchedCustomerId: null,
        manuallyLinkedBy: null,
        linkedAt: null,
        rejectReason: null,
        // Every extracted value arrives unconfirmed. Nothing here confirms one.
        ocrFields: extracted.ocrFields ?? [],
      }))

      const outcome = move<NoticeBatchState, NoticeBatchContext, NoticeBatch>({
        store,
        table: t.noticeBatches,
        entity: 'NoticeBatch',
        id,
        machine: noticeBatchMachine,
        stateOf: (row) => row.state,
        to: 'review',
        ctx: batchCtx(batch, { rows: built.map(toNoticeRow), ocrCompletedAt: completedAt }),
        actorId: command.actorId,
        detail: { rowCount: built.length },
        apply: (row) => ({
          ...row,
          state: 'review',
          ocrCompletedAt: completedAt,
          rowCount: built.length,
        }),
      })

      if (!outcome.ok) return outcome

      for (const row of built) t.noticeMatches.set(row.id, row)

      // Every row leaves `pending` through the row machine, never by assignment:
      // matched where the number resolved to a policy this agency holds,
      // unmatched where it did not.
      command.rows.forEach((extracted, index) => {
        const row = built[index]
        const matchedPolicyId = extracted.matchedPolicyId ?? null
        if (matchedPolicyId === null) {
          rowStep(row.id, 'unmatched', { actorId: command.actorId }, {}, (current) => current)
          return
        }
        rowStep(
          row.id,
          'matched',
          { actorId: command.actorId },
          { matchedPolicyId },
          (current) => ({
            ...current,
            matchedPolicyId,
            matchedCustomerId: t.policies.get(matchedPolicyId)?.customerId ?? null,
            linkedAt: completedAt,
          }),
        )
      })

      return outcome
    },

    async send(id, command) {
      await wait()
      const batch = t.noticeBatches.get(id)
      if (!batch) return notFound('NoticeBatch', id)

      const ctx = batchCtx(batch, { selectedRowIds: command.selectedRowIds })
      const covered = new Set(rowsInSend(ctx).map((row) => row.id))

      // The OCR invariant, applied to a bulk send: a send is a form, and a form
      // holding an unconfirmed extraction cannot submit. The machine handles the
      // unmatched rows; this handles the values nobody has checked.
      const unconfirmed = matchesOf(id).filter(
        (row) => covered.has(row.id) && row.ocrFields.some((field) => !field.confirmed),
      )
      if (unconfirmed.length > 0) {
        const detail = unconfirmed
          .slice(0, 5)
          .map((row) => row.noticePolicyNo)
          .join(', ')
        return rejected(
          `${unconfirmed.length} of ${covered.size} rows still hold a value nobody has confirmed (${detail}${unconfirmed.length > 5 ? ', and more' : ''}). Check each extracted value against the notice before sending.`,
        )
      }

      const now = at(command.now)
      return move<NoticeBatchState, NoticeBatchContext, NoticeBatch>({
        store,
        table: t.noticeBatches,
        entity: 'NoticeBatch',
        id,
        machine: noticeBatchMachine,
        stateOf: (row) => row.state,
        to: 'sent',
        ctx,
        actorId: command.actorId,
        detail: { rowsSent: covered.size },
        apply: (row) => ({
          ...row,
          state: 'sent',
          sentBy: command.sentBy,
          sentAt: now.toISOString(),
        }),
      })
    },

    async matchRow(rowId, command) {
      await wait()
      const now = at(command.now)
      return rowStep(
        rowId,
        'matched',
        command,
        { matchedPolicyId: command.matchedPolicyId },
        (row) => ({
          ...row,
          matchedPolicyId: command.matchedPolicyId,
          matchedCustomerId: t.policies.get(command.matchedPolicyId)?.customerId ?? null,
          linkedAt: now.toISOString(),
        }),
      )
    },

    async markRowUnmatched(rowId, command) {
      await wait()
      return rowStep(rowId, 'unmatched', command, {}, (row) => row)
    },

    async linkRow(rowId, command) {
      await wait()
      const now = at(command.now)
      // §9: the manual link is the way out of unmatched, and it records who made
      // it, because automatic matching did not.
      return rowStep(
        rowId,
        'matched',
        command,
        {
          matchedPolicyId: command.matchedPolicyId,
          manuallyLinkedBy: command.manuallyLinkedBy,
        },
        (row) => ({
          ...row,
          matchedPolicyId: command.matchedPolicyId,
          matchedCustomerId: t.policies.get(command.matchedPolicyId)?.customerId ?? null,
          manuallyLinkedBy: command.manuallyLinkedBy,
          linkedAt: now.toISOString(),
        }),
      )
    },

    async rejectRow(rowId, command) {
      await wait()
      return rowStep(
        rowId,
        'rejected',
        command,
        { rejectReason: command.rejectReason },
        (row) => ({ ...row, rejectReason: command.rejectReason }),
      )
    },
  }

  /* --------------------------------------------------------- OCR templates */

  const ocrTemplates: OcrTemplateRepository = {
    async list(query) {
      await wait()
      return runQuery(rowsOf(t.ocrTemplates), OCR_TEMPLATE_LIST_SPEC, query)
    },
    async get(id) {
      await wait()
      return t.ocrTemplates.get(id) ?? null
    },
    async getMany(ids) {
      await wait()
      return ids.map((id) => t.ocrTemplates.get(id)).filter((row) => row !== undefined)
    },
    async forCompany(companyId) {
      await wait()
      return rowsOf(t.ocrTemplates).filter((row) => row.companyId === companyId)
    },
    async forDocType(companyId, docType) {
      await wait()
      return (
        rowsOf(t.ocrTemplates).find(
          (row) => row.companyId === companyId && row.docType === docType && row.active,
        ) ?? null
      )
    },
  }

  /* ----------------------------------------------------- message templates */

  const templates: MessageTemplateRepository = {
    async list(query) {
      await wait()
      return runQuery(rowsOf(t.messageTemplates), TEMPLATE_LIST_SPEC, query)
    },
    async get(id) {
      await wait()
      return t.messageTemplates.get(id) ?? null
    },
    async getMany(ids) {
      await wait()
      return ids.map((id) => t.messageTemplates.get(id)).filter((row) => row !== undefined)
    },
    async byKey(key) {
      await wait()
      return rowsOf(t.messageTemplates).find((row) => row.key === key) ?? null
    },
    async forChannel(channel) {
      await wait()
      return rowsOf(t.messageTemplates).filter((row) => row.channel === channel)
    },
    async forRecipe(recipeKey) {
      await wait()
      return rowsOf(t.messageTemplates).filter((row) => row.recipeKey === recipeKey)
    },

    async create(command) {
      await wait()
      const now = at(command.now)
      const id = `tpl-${command.key.replace(/[^a-zA-Z0-9]+/g, '-')}`
      if (t.messageTemplates.has(id)) {
        return rejected(`A message template already uses the key ${command.key}.`)
      }
      if (rowsOf(t.messageTemplates).some((row) => row.key === command.key)) {
        return rejected(`A message template already uses the key ${command.key}.`)
      }

      const template: MessageTemplate = {
        id,
        key: command.key,
        label: command.label,
        channel: command.channel,
        subject: command.subject ?? null,
        body: command.body,
        recipeKey: command.recipeKey ?? null,
        version: 1,
        active: true,
        updatedAt: now.toISOString(),
        updatedBy: command.updatedBy,
      }
      t.messageTemplates.set(id, template)
      return committed(template, [])
    },

    async save(id, command) {
      await wait()
      const now = at(command.now)
      // The key never moves: recipes and message logs both point at it. An edit
      // publishes the next version rather than rewriting what already went out.
      return writeConfig(t.messageTemplates, 'MessageTemplate', id, (row) => ({
        ...row,
        label: command.label ?? row.label,
        channel: command.channel ?? row.channel,
        subject: command.subject === undefined ? row.subject : command.subject,
        body: command.body ?? row.body,
        recipeKey: command.recipeKey === undefined ? row.recipeKey : command.recipeKey,
        version: row.version + 1,
        updatedAt: now.toISOString(),
        updatedBy: command.updatedBy,
      }))
    },

    async setActive(id, command) {
      await wait()
      const now = at(command.now)
      return writeConfig(t.messageTemplates, 'MessageTemplate', id, (row) => ({
        ...row,
        active: command.active,
        updatedAt: now.toISOString(),
        updatedBy: command.updatedBy,
      }))
    },
  }

  /* ---------------------------------------------------------- integrations */

  const integrations: IntegrationRepository = {
    async list(query) {
      await wait()
      return runQuery(rowsOf(t.integrations), INTEGRATION_LIST_SPEC, query)
    },
    async get(id) {
      await wait()
      return t.integrations.get(id) ?? null
    },
    async getMany(ids) {
      await wait()
      return ids.map((id) => t.integrations.get(id)).filter((row) => row !== undefined)
    },
    async byKey(key) {
      await wait()
      return rowsOf(t.integrations).find((row) => row.key === key) ?? null
    },
    async forKind(kind) {
      await wait()
      return rowsOf(t.integrations).filter((row) => row.kind === kind)
    },
    async enabled() {
      await wait()
      return rowsOf(t.integrations).filter((row) => row.enabled)
    },

    async create(command) {
      await wait()
      const now = at(command.now)
      const settings = command.settings ?? {}
      const refusal = refuseSecretSettings(settings)
      if (refusal) return refusal

      const id = `itg-${command.key.replace(/[^a-zA-Z0-9]+/g, '-')}`
      if (rowsOf(t.integrations).some((row) => row.key === command.key)) {
        return rejected(`An integration already uses the key ${command.key}.`)
      }

      const integration: IntegrationConfig = {
        id,
        key: command.key,
        kind: command.kind,
        label: command.label,
        providerName: command.providerName,
        // Configured off. Switching an outward channel on is a deliberate act.
        enabled: false,
        settings,
        lastCheckedAt: null,
        lastCheckOutcome: null,
        lastCheckNote: null,
        updatedAt: now.toISOString(),
        updatedBy: command.updatedBy,
      }
      t.integrations.set(id, integration)
      return committed(integration, [])
    },

    async save(id, command) {
      await wait()
      const now = at(command.now)
      if (command.settings) {
        const refusal = refuseSecretSettings(command.settings)
        if (refusal) return refusal
      }

      return writeConfig(t.integrations, 'IntegrationConfig', id, (row) => ({
        ...row,
        label: command.label ?? row.label,
        providerName: command.providerName ?? row.providerName,
        settings: command.settings ?? row.settings,
        updatedAt: now.toISOString(),
        updatedBy: command.updatedBy,
      }))
    },

    async setEnabled(id, command) {
      await wait()
      const now = at(command.now)
      return writeConfig(t.integrations, 'IntegrationConfig', id, (row) => ({
        ...row,
        enabled: command.enabled,
        updatedAt: now.toISOString(),
        updatedBy: command.updatedBy,
      }))
    },

    async recordCheck(id, command) {
      await wait()
      const now = at(command.now)
      // The provider's own outcome, recorded as it came back. Nothing is inferred
      // from it and nothing is switched on or off because of it.
      return writeConfig(t.integrations, 'IntegrationConfig', id, (row) => ({
        ...row,
        lastCheckedAt: now.toISOString(),
        lastCheckOutcome: command.outcome,
        lastCheckNote: command.note ?? null,
      }))
    },
  }

  return { endorsements, noticeBatches, ocrTemplates, templates, integrations }
}

/**
 * The refusal that keeps a credential out of the store. It names the keys,
 * because whoever typed them is usually pasting from the provider's console and
 * needs to know the setting has a home — just not this one.
 */
function refuseSecretSettings(settings: Readonly<Record<string, string | number | boolean>>) {
  const offending = secretLikeSettingKeys(settings)
  if (offending.length === 0) return null
  return rejected(
    `These settings read like credentials and cannot be stored here: ${offending.join(', ')}. The platform records that an integration exists; the key stays in the provider's own console.`,
  )
}

/* ------------------------------------------------------------- list specs */

const ENDORSEMENT_LIST_SPEC = {
  search: [
    (row: Endorsement) => row.systemNo,
    (row: Endorsement) => row.insurerEndorsementNo,
  ],
  filters: {
    state: (row: Endorsement) => row.state,
    type: (row: Endorsement) => row.type,
    policyId: (row: Endorsement) => row.policyId,
    customerId: (row: Endorsement) => row.customerId,
    ownerId: (row: Endorsement) => row.ownerId,
  },
  sorts: {
    requestedAt: (row: Endorsement) => row.requestedAt,
    systemNo: (row: Endorsement) => row.systemNo,
    effectiveFrom: (row: Endorsement) => row.effectiveFrom,
  },
  defaultSort: { field: 'requestedAt', direction: 'desc' as const },
}

const NOTICE_BATCH_LIST_SPEC = {
  search: [(row: NoticeBatch) => row.systemNo, (row: NoticeBatch) => row.fileName],
  filters: {
    state: (row: NoticeBatch) => row.state,
    companyId: (row: NoticeBatch) => row.companyId,
    expiryMonth: (row: NoticeBatch) => row.expiryMonth,
    uploadedBy: (row: NoticeBatch) => row.uploadedBy,
  },
  sorts: {
    uploadedAt: (row: NoticeBatch) => row.uploadedAt,
    rowCount: (row: NoticeBatch) => row.rowCount,
    systemNo: (row: NoticeBatch) => row.systemNo,
  },
  defaultSort: { field: 'uploadedAt', direction: 'desc' as const },
}

const NOTICE_MATCH_LIST_SPEC = {
  search: [
    (row: NoticeMatch) => row.noticePolicyNo,
    (row: NoticeMatch) => row.noticeCustomerName,
  ],
  filters: {
    state: (row: NoticeMatch) => row.state,
    batchId: (row: NoticeMatch) => row.batchId,
    matchedPolicyId: (row: NoticeMatch) => row.matchedPolicyId,
  },
  sorts: {
    rowNumber: (row: NoticeMatch) => row.rowNumber,
    noticeExpiryDate: (row: NoticeMatch) => row.noticeExpiryDate,
  },
  defaultSort: { field: 'rowNumber', direction: 'asc' as const },
}

const OCR_TEMPLATE_LIST_SPEC = {
  search: [(row: { label: string }) => row.label],
  filters: {
    companyId: (row: { companyId: string }) => row.companyId,
    docType: (row: { docType: string }) => row.docType,
    active: (row: { active: boolean }) => String(row.active),
  },
  sorts: { label: (row: { label: string }) => row.label },
  defaultSort: { field: 'label', direction: 'asc' as const },
}

const TEMPLATE_LIST_SPEC = {
  search: [(row: MessageTemplate) => row.label, (row: MessageTemplate) => row.key],
  filters: {
    channel: (row: MessageTemplate) => row.channel,
    recipeKey: (row: MessageTemplate) => row.recipeKey,
    active: (row: MessageTemplate) => String(row.active),
  },
  sorts: {
    label: (row: MessageTemplate) => row.label,
    updatedAt: (row: MessageTemplate) => row.updatedAt,
  },
  defaultSort: { field: 'label', direction: 'asc' as const },
}

const INTEGRATION_LIST_SPEC = {
  search: [
    (row: IntegrationConfig) => row.label,
    (row: IntegrationConfig) => row.providerName,
  ],
  filters: {
    kind: (row: IntegrationConfig) => row.kind,
    enabled: (row: IntegrationConfig) => String(row.enabled),
    lastCheckOutcome: (row: IntegrationConfig) => row.lastCheckOutcome,
  },
  sorts: {
    label: (row: IntegrationConfig) => row.label,
    updatedAt: (row: IntegrationConfig) => row.updatedAt,
  },
  defaultSort: { field: 'label', direction: 'asc' as const },
}
