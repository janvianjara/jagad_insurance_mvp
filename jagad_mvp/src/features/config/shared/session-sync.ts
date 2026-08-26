/**
 * Configuration to session — the reason the users screen is not a form that
 * writes to nothing.
 *
 * §7: permissions are state, and they gate rendering. The rail, the route guards
 * and every toolbar button read `can(user, …)` against the *resolved* user the
 * session slice holds, and the session resolves a template once, at boot. So an
 * admin who assigns Nita a different template has changed nothing anybody can
 * see until the session is told — and telling it is this file.
 *
 * Two details make the result honest rather than theatrical:
 *
 *   - resolution goes through the configuration library, not through
 *     `STARTER_TEMPLATES`, because a cloned template is exactly what P-10a asks
 *     admins to make and a session that only knew the starters would resolve one
 *     to nothing;
 *   - an unknown key still falls back to a template that grants *nothing*, the
 *     same way `resolveAccount` does, so a mistake in configuration shows up as
 *     an empty rail rather than as an accidental admin.
 */

import { useSessionStore } from '../../../app/store'
import type { SessionAccount } from '../../../app/store'
import type { PermissionTemplate, User } from '../../../domain/permissions'
import type { ConfigTemplate, ConfigUser } from './config-types'

const NOTHING: PermissionTemplate = {
  key: 'unknown',
  label: 'No permissions resolved',
  grants: {},
  scopes: {},
  dataClasses: ['operational', 'contact'],
}

export function resolveUser(
  staff: ConfigUser,
  templates: readonly ConfigTemplate[],
): User {
  const template = templates.find((candidate) => candidate.key === staff.templateKey) ?? NOTHING

  return {
    id: staff.id,
    name: staff.name,
    templateKey: staff.templateKey,
    template,
    ...(staff.teamId === null ? {} : { teamId: staff.teamId }),
    ...(staff.agentId === null ? {} : { agentId: staff.agentId }),
    ...(staff.parentAgentId === null ? {} : { parentAgentId: staff.parentAgentId }),
  }
}

export function accountsFromConfig(
  users: readonly ConfigUser[],
  templates: readonly ConfigTemplate[],
): readonly SessionAccount[] {
  return users
    .filter((staff) => staff.active)
    .map((staff) => ({
      user: resolveUser(staff, templates),
      email: staff.email,
      roleLabel: staff.roleLabel,
    }))
}

/**
 * Republishes the whole account list, keeping whoever is signed in signed in.
 *
 * Called after every configuration change that touches identity — a template
 * assigned, a template edited, an account deactivated — so the rail the person
 * is looking at is never a render behind the configuration that decides it.
 */
export function syncSession(
  users: readonly ConfigUser[],
  templates: readonly ConfigTemplate[],
): void {
  const session = useSessionStore.getState()
  // Before boot there is nothing to keep in step, and hydrating early would
  // hand the shell a session it has not finished asking for.
  if (!session.ready) return

  const accounts = accountsFromConfig(users, templates)
  session.hydrate(accounts, session.user?.id)
}
