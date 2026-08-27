/**
 * The quotation module — plan §4's `/quotations` and `/deals` routes, §5's
 * Composer row, §9's quotation and deal machines, and canvas scenarios 2.1 to
 * 2.8. D18, the client's headline change.
 */
export { QuotationQueueScreen } from './QuotationQueueScreen'
export { QuotationNewScreen } from './QuotationNewScreen'
export { QuotationComposerScreen } from './QuotationComposerScreen'
export { DealQueueScreen } from './DealQueueScreen'
export { DealScreen } from './DealScreen'
export { dealQueueConfig, quotationQueueConfig } from './queue-config'
export type { DealQueueDeps, QuotationQueueDeps } from './queue-config'
export { loadComposer, productIdsFor } from './composer-data'
export type { ComposerData } from './composer-data'
export {
  DEAL_LABEL,
  DEAL_TONE,
  QUOTATION_LABEL,
  QUOTATION_TONE,
  columnsFromLines,
  columnsFromProducts,
  dealLineItemsFor,
  dealSeverity,
  documentColumns,
  documentRows,
  linesOfVersion,
  nameOf,
  personsFor,
  quotationSeverity,
  versionsOf,
} from './quotation-view'
