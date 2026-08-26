/**
 * The three guardrail components (plan §6).
 *
 * Not UI conveniences: each is a business rule made physical, each is stated in
 * both the PRD and the prototype as an explicit promise, and each was written
 * test-first — the refusal tests in this folder ARE the rule, and the components
 * are only what makes them pass.
 *
 *   RecordOnlyAmount / RollUp   D3   — money is recorded, never calculated
 *   OcrField / OcrFormProvider  FR-16 — extraction never silent-commits
 *   ConfirmGate                 FR-22.4 — nothing sends without showing what it does
 */
export { RecordOnlyAmount } from './RecordOnlyAmount'
export type { RecordOnlyAmountProps } from './RecordOnlyAmount'
export { RECORD_ONLY_AMOUNT_PROPS } from './record-only-props'
export { RollUp } from './RollUp'
export type { RollUpComponent, RollUpProps } from './RollUp'
export { amountDraft, isAmountDraft, parseAmountDraft, sameAmount } from './amount-entry'

export { OcrField } from './OcrField'
export type { OcrFieldProps } from './OcrField'
export { OcrFormProvider, OcrSubmit } from './OcrFormProvider'
export type { OcrFormProviderProps, OcrSubmitProps } from './OcrFormProvider'
export { OcrFormContext, useOcrForm } from './ocr-context'
export type { OcrFormApi, OcrRegistry, OcrRegistryAction } from './ocr-context'
export { OCR_STATES, readOcrState } from './ocr-state'
export type { OcrExtraction, OcrFieldState, OcrState } from './ocr-state'

export { ConfirmGate } from './ConfirmGate'
export { CONFIRM_PHASES } from './confirm-phase'
export type { ConfirmPhase } from './confirm-phase'
export type { ConfirmChange, ConfirmGateProps } from './ConfirmGate'
