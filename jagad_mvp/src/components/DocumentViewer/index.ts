/**
 * The generated-document surface (plan §2, §5 Composer row, canvas 2.3).
 *
 * `document-model.ts` is the data a PDF renderer would be handed; `DocumentViewer`
 * is the letterhead it prints as. Feature screens import from here and hand the
 * component a built document — the viewer reads no repository and edits nothing,
 * which is what lets a locked prior version render through the same code path.
 */
export { DocumentViewer } from './DocumentViewer'
export type { DocumentViewerProps } from './DocumentViewer'
export {
  DOCUMENT_LAYOUTS,
  PREMIUM_MODE_LABELS,
  buildQuotationDocument,
  defaultLayoutFor,
  isFloater,
} from './document-model'
export type {
  BuildQuotationDocumentInput,
  DocumentBenefitRow,
  DocumentColumn,
  DocumentLayout,
  DocumentPerson,
  QuotationDocument,
} from './document-model'
