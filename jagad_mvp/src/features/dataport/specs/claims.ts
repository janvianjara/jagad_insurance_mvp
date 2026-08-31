/**
 * Claims — validated, and honestly not written.
 *
 * `ClaimRepository` has no `create`. Every claim in this product is born by
 * being intimated against a live policy, and `advance` moves it from there; there
 * is no back door and this importer is not the step that invents one.
 *
 * So the spec exists, the template downloads, the file validates against real
 * policies and real customers, and the Check step says in one sentence that the
 * MVP cannot write this entity. The Commit step is not offered at all.
 *
 * That is a deliberate choice over the alternative of leaving claims out. An
 * agency migrating its book asks about open claims immediately; a screen that
 * checks their file and tells them plainly what it will and will not do answers
 * the question. A screen that quietly has no claims option does not, and a screen
 * that pretends to import them is worse than either.
 */

import { CLAIM_TYPES } from '../../../domain/workflows'
import { FIELD_KINDS } from '../../../domain/dataport'
import type { ImportSpec } from '../../../domain/dataport'

export const CLAIM_SPEC: ImportSpec = {
  key: 'claims',
  label: 'Claims',
  noun: 'claim',
  nounPlural: 'claims',
  summary:
    'Checks a claims register against the policies on file. The MVP cannot write claims, so this validates and stops there.',
  sheetName: 'Claims',
  identity: ['policyId', 'raisedAt'],
  writable: false,
  notWritableReason:
    'A claim is raised by being intimated against a live policy, and the MVP has no way to write one from a file. This checks your register against the policies on file and stops there.',
  fields: [
    {
      key: 'policyId',
      label: 'Policy number',
      kind: FIELD_KINDS.reference,
      resolverKey: 'policy',
      required: true,
      synonyms: ['policy', 'policy no', 'contract number'],
      help: 'Our reference or the insurer’s, for a policy already on file.',
      example: 'POL-0042',
    },
    {
      key: 'claimType',
      label: 'Claim type',
      kind: FIELD_KINDS.enum,
      required: true,
      options: [
        { value: CLAIM_TYPES.cashless, label: 'Cashless', synonyms: ['network', 'tpa'] },
        { value: CLAIM_TYPES.file, label: 'Reimbursement', synonyms: ['file', 'non cashless'] },
      ],
      example: 'Cashless',
    },
    {
      key: 'raisedAt',
      label: 'Date raised',
      kind: FIELD_KINDS.date,
      required: true,
      synonyms: ['claim date', 'loss date', 'intimation date'],
      example: '2025-06-14',
    },
    {
      key: 'insurerNo',
      label: 'Insurer claim number',
      kind: FIELD_KINDS.text,
      synonyms: ['claim no', 'company claim number', 'tpa number'],
      example: 'CLM/2025/88213',
    },
    {
      key: 'companyRemark',
      label: 'Insurer remark',
      kind: FIELD_KINDS.text,
      synonyms: ['remark', 'status remark', 'comment'],
      example: 'Pre-authorisation approved.',
    },
  ],
}
