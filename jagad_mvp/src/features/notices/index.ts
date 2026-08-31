/**
 * The renewal-notice module — plan §4's `/renewals/notices` routes, §5's
 * "Notice bulk ingest" row, §9's notice-batch and notice-row machines, and
 * canvas n32–n36.
 */
export { NoticeQueueScreen } from './NoticeQueueScreen'
export { NoticeBatchScreen } from './NoticeBatchScreen'
export { NoticeRowDrawer } from './NoticeRowDrawer'
export { UploadNoticesDialog } from './UploadNoticesDialog'
export { noticesQueue } from './notices-queue'
export { noticeRowsQueue } from './batch-rows-queue'
export {
  BATCH_LABEL,
  BATCH_TONE,
  NOTICE_CONFIDENCE,
  NOTICE_FIELD_LABEL,
  ROW_LABEL,
  ROW_TONE,
  batchSeverity,
  confidenceFor,
  rowIsReadyToSend,
  rowsBlockingSend,
  sendBlockNote,
  unconfirmedFields,
} from './notice-view'
export type { SendBlocker } from './notice-view'
