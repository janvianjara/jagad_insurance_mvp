/**
 * The task module's public surface — FR-15's polymorphic work queue.
 *
 * The screen is reached through `routes.ts`, which is the only file the router
 * touches. What is exported here is the vocabulary another module would need to
 * speak about a task: the labels, the push/pull reading, the severity rule and
 * the scoped pool. None of it is a component.
 */
export { taskDesk, isInPool, scopedRecordOf, DELIVERY_FILTER } from './data/task-desk'
export type { TaskDesk } from './data/task-desk'
export { loadTaskContext, subjectKey } from './data/task-context'
export type { TaskContext } from './data/task-context'
export {
  LIVE_TASK_STATES,
  SUBJECT_ENTITIES,
  SUBJECT_LABEL,
  TASK_DELIVERIES,
  TASK_DELIVERY_LABEL,
  TASK_KIND_LABEL,
  TASK_PRIORITY_LABEL,
  TASK_PRIORITY_TONE,
  TASK_STATE_LABEL,
  TASK_STATE_TONE,
  deliveryOf,
  isLive,
  isOverdue,
  subjectHref,
  subjectLabel,
  taskSeverity,
} from './task-view'
export type { TaskDelivery } from './task-view'
export { TaskClockBase, useTaskNow } from './clock'
