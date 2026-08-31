/**
 * The tokenised upload module — plan §5's `/upload/:token` row, FR-11.1,
 * FR-16.8 and D21.
 *
 * The screen itself is deliberately absent from this barrel. It is reached only
 * through `routes.ts`, whose dynamic import is what keeps it out of the
 * authenticated bundle; re-exporting it here would let any importer fold it back
 * in and `upload-isolation.test.ts` would fail.
 */
export {
  CLAIM_UPLOAD_DOC_TYPE,
  CLAIM_UPLOAD_DOC_TYPES,
  newUploadToken,
  uploadDesk,
  uploadLinkHref,
} from './data/upload-desk'
export type {
  AcceptCommand,
  AcceptedUpload,
  IssueCommand,
  UploadDesk,
  UploadView,
} from './data/upload-desk'
