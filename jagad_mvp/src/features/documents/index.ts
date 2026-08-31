/**
 * The document module's public surface — the vault of plan §5 and §14.1.
 *
 * The screen is reached through `routes.ts`, which is the only file the router
 * touches. What is exported here is the vault itself and the vocabulary a row
 * needs words for. Nothing exported reads or returns a `document-content` field.
 */
export {
  RETENTION_FILTER,
  documentVault,
  loadVaultSubjects,
  mayOpen,
  subjectKey,
  subjectOf,
} from './data/vault'
export type {
  DocumentAccess,
  DocumentOpen,
  DocumentSubject,
  OpenCommand,
  Vault,
  VaultSubjects,
} from './data/vault'
export {
  DOCUMENT_SUBJECT_ENTITIES,
  DOC_TYPE_LABEL,
  IDENTITY_DOC_TYPES,
  REVIEW_LABEL,
  REVIEW_TONE,
  documentSeverity,
  isIdentityDocument,
} from './document-view'
export { DocumentClockBase, useDocumentNow } from './clock'
