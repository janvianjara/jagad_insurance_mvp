/**
 * The Assistant feature's public surface.
 *
 * Two things leave this folder: the drawer panel the shell mounts on Cmd/Ctrl-K,
 * and the notice rail a queue screen drops into `<WorkQueue>`'s children. The
 * screen itself is reached by the router as a default export, so it stays out of
 * this barrel and out of the first paint.
 *
 * Nothing in here re-exports a projection type. A feature that wanted one would
 * be reaching past the boundary, and the place to get it is `src/data/assistant`.
 */

export { AssistantPanel } from './AssistantPanel'
export { AssistantNoticeRail } from './notices/AssistantNoticeRail'
export { useNotices } from './notices/use-notices'
export type { NoticeFeed } from './notices/use-notices'
export { useNoticesStore } from './notices/notices-store'
export type { Notice, NoticeRuleId } from './notices/notice-rules'
