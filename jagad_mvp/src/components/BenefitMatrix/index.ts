/**
 * The quotation comparison matrix (plan §5 Composer, §6, playbook P-13).
 *
 * `matrix-model` decides what the matrix contains and holds no React;
 * `BenefitMatrix` renders a draft and reports edits and holds no data. A screen
 * owns the repository call, the version and the Generate button, and reads the
 * matrix's readiness from `matrixReadyToGenerate` — the same function the
 * component puts on screen as `data-ready`.
 */
export { BenefitMatrix } from './BenefitMatrix'
export type { BenefitMatrixProps } from './BenefitMatrix'
export {
  addAdHocRow,
  columnsMissingPremium,
  defaultCellValues,
  draftFromLines,
  matrixReadyToGenerate,
  openMatrixDraft,
  premiumStopMessage,
  removeRow,
  setCellValue,
  setColumnPremium,
  setPremiumMode,
  toQuotationLines,
  unionBenefitRows,
} from './matrix-model'
export type {
  DraftQuotationLine,
  MatrixColumn,
  MatrixDraft,
  OpenMatrixInput,
} from './matrix-model'
