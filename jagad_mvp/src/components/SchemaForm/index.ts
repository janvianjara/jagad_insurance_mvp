/**
 * The schema-driven form engine (plan §6, playbook P-12).
 *
 * One component, five entry forms, and every form after them configuration
 * rather than code. The rules it enforces live in `src/domain/forms/`; this
 * folder is only what makes them visible and keyboard-operable.
 */
export { SchemaForm } from './SchemaForm'
export type { SchemaFormProps, SchemaFormSubmission } from './SchemaForm'
export { SchemaField } from './SchemaField'
export type { MasterOptions, SchemaFieldProps } from './SchemaField'
export { RepeatingGroupField } from './RepeatingGroupField'
export type { RepeatingGroupFieldProps } from './RepeatingGroupField'
export { browserDraftStore, memoryDraftStore } from './draft-store'
export type { DraftStore } from './draft-store'
export { schemaResolver } from './schema-resolver'
