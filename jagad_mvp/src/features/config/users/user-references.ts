/**
 * What configuration itself holds against a staff account.
 *
 * The same rule masters live by applies to people: a record that other records
 * point at is deactivated, not deleted. A deleted team lead leaves a team with
 * no lead, a deleted routing member leaves a category that can route work to
 * nobody, and a deleted agent leaves their sub-agent reporting to an id that
 * resolves to nothing — none of which announce themselves until a queue behaves
 * strangely a fortnight later.
 */

import type { InquiryCategory, Team } from '../../../data/repo'
import type { ConfigUser } from '../shared'

export type UserReference = {
  readonly label: string
  readonly count: number
}

/** Just the three lists the answer needs, so a caller can pass what it holds. */
export type UserReferenceSource = {
  readonly teams: readonly Team[]
  readonly categories: readonly InquiryCategory[]
  readonly users: readonly ConfigUser[]
}

export function userReferences(
  source: UserReferenceSource,
  user: ConfigUser,
): readonly UserReference[] {
  const leads = source.teams.filter((team) => team.leadUserId === user.id).length
  const memberships = source.teams.filter(
    (team) => team.leadUserId !== user.id && team.memberUserIds.includes(user.id),
  ).length
  const routing = source.categories.filter((category) =>
    category.memberUserIds.includes(user.id),
  ).length
  const subAgents = user.agentId
    ? source.users.filter((candidate) => candidate.parentAgentId === user.agentId).length
    : 0

  return [
    { label: leads === 1 ? 'team led' : 'teams led', count: leads },
    { label: memberships === 1 ? 'team membership' : 'team memberships', count: memberships },
    { label: routing === 1 ? 'routing category' : 'routing categories', count: routing },
    {
      label: subAgents === 1 ? 'sub-agent reporting in' : 'sub-agents reporting in',
      count: subAgents,
    },
  ].filter((reference) => reference.count > 0)
}

export function describeReferences(references: readonly UserReference[]): string {
  return references.map((reference) => `${reference.count} ${reference.label}`).join(', ')
}
