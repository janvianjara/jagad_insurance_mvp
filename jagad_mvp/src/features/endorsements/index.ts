/**
 * The endorsement module — plan §4's `/endorsements` routes, §5's "Endorsement"
 * row, §9's endorsement machine and canvas n51–n56.
 */
export { EndorsementQueueScreen } from './EndorsementQueueScreen'
export { EndorsementCaptureScreen } from './EndorsementCaptureScreen'
export { EndorsementDetailScreen } from './EndorsementDetailScreen'
export { endorsementsQueue } from './endorsements-queue'
export {
  ENDORSEMENT_LABEL,
  ENDORSEMENT_TONE,
  ENDORSEMENT_TYPE_LABEL,
  endorsementSeverity,
  figureIsRecorded,
  figureOf,
} from './endorsement-view'
export type { EndorsementReading } from './endorsement-view'
export { renderedFieldsOf, shapeFor } from './form-shape'
export type { EndorsementChangeField, EndorsementFormShape } from './form-shape'
