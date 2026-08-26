/**
 * The inquiry module — plan §4's front-office routes, §5 rows 1 and 2,
 * §9's inquiry machine, and canvas scenarios 1.1 to 1.6.
 */
export { InquiryQueueScreen } from './InquiryQueueScreen'
export { InquiryCaptureScreen } from './InquiryCaptureScreen'
export { InquiryDetailScreen } from './InquiryDetailScreen'
export { InquiryClockBase, CLOCK_STEPS, useInquiryClockStore, useInquiryNow } from './clock'
export { inquiryIntake } from './data/intake'
export type { CaptureInquiryCommand, IntakeRepository } from './data/intake'
export { inquiryQueueConfig } from './queue-config'
export {
  INQUIRY_LABEL,
  INQUIRY_TONE,
  SOURCE_LABEL,
  buildTrail,
  inquirySeverity,
  isPinned,
  pinRank,
  readTat,
} from './inquiry-view'
export { planEscalation, planRouting, routableMembers, tatMinutesFor } from './routing'
