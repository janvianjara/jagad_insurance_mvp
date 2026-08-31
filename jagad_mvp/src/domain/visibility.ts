/**
 * Row-level visibility - plan §11's attribute scope, applied to rows rather than
 * to routes.
 *
 * ---------------------------------------------------------------------------
 * The defect this module closes
 * ---------------------------------------------------------------------------
 *
 * `<RequireAccess>` asks `can(user, action, resource)` with no record, which is
 * the module question: *may this account open this screen at all*. That is the
 * only question anything in the build asked until now, so every list screen
 * showed the whole book to whoever could open it. On a queue of inquiries that
 * is a privacy problem; on `/commission` it is a money problem, because an agent
 * whose grant reads `{ level: 'own', includeSubAgents: true }` could read the
 * agency's entire commission book, every peer's cut included.
 *
 * `can()` has always taken a second question - *and may they touch THIS record* -
 * and `withinLevel` / `withinAttributes` in `./permissions` already answer it
 * correctly. Nothing was wrong with the evaluator. What was missing was a place
 * for a screen to ask it once per row, in a shape a queue can use, so that the
 * answer is the same on every queue in the product.
 *
 * So this module deliberately contains NO scope logic of its own. It is a lens
 * and a filter over `can()`. A second implementation of "does this row belong to
 * this user" is exactly how two screens come to disagree about it, and the one
 * that disagrees generously is the leak.
 *
 * ---------------------------------------------------------------------------
 * Why a lens rather than a duck-typed row
 * ---------------------------------------------------------------------------
 *
 * `ScopedRecord` names six attributes, and its fields are optional strings.
 * Entities in `src/data/repo` write the same facts as `string | null`, because a
 * policy with no agent has an `agentId` of `null` rather than a missing key.
 * Those two shapes are not assignable, and the difference matters: `undefined`
 * means "this row has no such attribute to test", which is what makes an
 * unsourced record fail an `own` test instead of matching a user whose own
 * attribute is also absent. `attributesOf` is where a caller converts, and
 * `scopeOf` below does the conversion correctly in one line so that no caller
 * has to remember the rule.
 */

import { can } from './permissions'
import type { Action, Resource, ScopedRecord, User } from './permissions'

/**
 * The nullable shape an entity actually has. Every repository row writes an
 * absent attribute as `null`; `ScopedRecord` writes it as a missing key.
 */
export type ScopeSource = {
  readonly ownerId?: string | null
  readonly teamId?: string | null
  readonly companyId?: string | null
  readonly categoryId?: string | null
  readonly agentId?: string | null
  readonly subAgentId?: string | null
}

/**
 * Reads the scope attributes off a record, dropping the ones it does not carry.
 *
 * A `null` becomes an absent key rather than being passed through, because the
 * evaluator tests `record.agentId === user.agentId` and both sides being absent
 * must not read as a match. This function is the whole of that rule.
 */
export function scopeOf(source: ScopeSource): ScopedRecord {
  const record: {
    ownerId?: string
    teamId?: string
    companyId?: string
    categoryId?: string
    agentId?: string
    subAgentId?: string
  } = {}

  if (source.ownerId) record.ownerId = source.ownerId
  if (source.teamId) record.teamId = source.teamId
  if (source.companyId) record.companyId = source.companyId
  if (source.categoryId) record.categoryId = source.categoryId
  if (source.agentId) record.agentId = source.agentId
  if (source.subAgentId) record.subAgentId = source.subAgentId

  return record
}

/**
 * What a queue has to say about its rows before they can be scoped: which
 * module's grant governs them, and where their scope attributes live.
 *
 * `action` defaults to `view`, which is the question a list asks. A toolbar that
 * gates an edit passes `edit` and gets a narrower set from the same lens.
 */
export type ScopeLens<Row> = {
  readonly resource: Resource
  readonly attributesOf: (row: Row) => ScopeSource
  readonly action?: Action
}

/** Whether one row is inside this user's reach. The single-row form of `visibleTo`. */
export function canSee<Row>(user: User, row: Row, lens: ScopeLens<Row>): boolean {
  return can(user, lens.action ?? 'view', lens.resource, scopeOf(lens.attributesOf(row)))
}

/**
 * The rows this user may see, in the order they were given.
 *
 * An allow-list: a row is kept only when `can()` says yes about that row, so a
 * record that carries no scope attributes at all is dropped rather than let
 * through. That is the right default for money - a commission line nobody can
 * attribute is not a line everybody may read - and it is the opposite of the
 * deny-list a filter written as "hide the rows that belong to someone else"
 * would be.
 *
 * The array is new; nothing here mutates what it was handed.
 */
export function visibleTo<Row>(
  user: User,
  rows: readonly Row[],
  lens: ScopeLens<Row>,
): readonly Row[] {
  return rows.filter((row) => canSee(user, row, lens))
}

/**
 * How many rows this user cannot see, for a screen that wants to say so.
 *
 * Deliberately a count and never the rows: "112 lines are outside your access"
 * is an honest statement about the shape of a queue, and a way to tell a narrow
 * view from an empty book, without disclosing a single field of a record the
 * person may not read.
 */
export function hiddenCount<Row>(
  user: User,
  rows: readonly Row[],
  lens: ScopeLens<Row>,
): number {
  return rows.length - visibleTo(user, rows, lens).length
}
