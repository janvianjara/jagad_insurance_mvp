/**
 * Correcting, discarding and erasing — the third kind of write (FR-20.2, .4).
 *
 * `<RecordCorrection>` is what a detail screen mounts; everything else here is
 * what it is built from, exported because the compliance register renders the
 * same erasure vocabulary and because the panels are worth testing on their own.
 */
export { RecordCorrection } from './RecordCorrection'
export type { RecordCorrectionProps } from './RecordCorrection'

export { AmendPanel } from './AmendPanel'
export type { AmendPanelProps } from './AmendPanel'
export { DiscardPanel } from './DiscardPanel'
export type { DiscardPanelProps } from './DiscardPanel'
export { RestorePanel } from './RestorePanel'
export type { RestorePanelProps } from './RestorePanel'
export { DiscardNotice } from './DiscardNotice'
export type { DiscardNoticeProps } from './DiscardNotice'
export { ErasePanel } from './ErasePanel'
export type { ErasePanelProps } from './ErasePanel'

export { AMEND_INPUTS, amendFieldSpecs, humaniseField } from './amend-fields'
export type { AmendFieldSpec, AmendInput } from './amend-fields'
export { amendOffer } from './amend-offer'
export type { AmendOffer, AmendOfferInput } from './amend-offer'
export {
  amendConfirmChanges,
  beforeOf,
  describeAmendValue,
  draftChanges,
  initialDraft,
  readAmendValue,
} from './amend-model'
export type { AmendDraft } from './amend-model'
export { DISCARDED_FILTER, DISCARDED_FILTER_KEY } from './queue-filter'
export { discardBulkAction } from './discard-bulk'
export { RowDiscardAction } from './RowDiscardAction'
export type { RowDiscardActionProps } from './RowDiscardAction'
export type { DiscardBulkInput, DiscardableRow } from './discard-bulk'
export {
  ERASE_REQUESTER_LABELS,
  ERASE_VERDICT_LABELS,
  ERASE_VERDICT_TONE,
  SUPPRESSION_LABELS,
  suppressionSentence,
} from './erasure-view'
