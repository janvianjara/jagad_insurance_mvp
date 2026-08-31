import { useNavigate } from 'react-router'
import { landingFor } from '../../app/navigation'
import { activeAccount, useSessionStore } from '../../app/store'
import { Button } from '../../ui/Button'
import { Field, Select } from '../../ui/form'
import styles from './RoleSwitcher.module.css'

/**
 * The persona switcher in the rail footer, ported from the prototype.
 *
 * It is not a debug tool. A single-tenant agency has eight staff accounts, the
 * walkthrough visits most of them, and switching account is the only honest way
 * to demonstrate that the rail and the guards are rendered by `can()` rather
 * than by a hard-coded role. Switching lands on the new role's own landing view,
 * because the route currently open is frequently one the next person may not see.
 *
 * The density toggle lives here too: U2 makes density a product feature for
 * people working a queue all day, not a setting buried in a preferences dialog.
 *
 * Signing out is a document navigation rather than a router one, and
 * deliberately so. `/login` is registered outside this shell and carries no
 * session at mount (§11.1); leaving through the router would unmount the shell
 * while the store behind it is still populated, so the session would outlive the
 * act meant to end it. A full navigation drops everything, which is what signing
 * out means.
 */
export function RoleSwitcher() {
  const navigate = useNavigate()
  const accounts = useSessionStore((state) => state.accounts)
  const user = useSessionStore((state) => state.user)
  const switchAccount = useSessionStore((state) => state.switchAccount)
  const reset = useSessionStore((state) => state.reset)
  const density = useSessionStore((state) => state.density)
  const setDensity = useSessionStore((state) => state.setDensity)
  const account = useSessionStore(activeAccount)

  if (!user) return null

  return (
    <div className={styles.footer}>
      <Field label="Signed in as" className={styles.field}>
        <Select
          value={user.id}
          options={accounts.map((option) => ({
            value: option.user.id,
            label: `${option.user.name} — ${option.roleLabel}`,
          }))}
          onChange={(event) => {
            const nextId = event.target.value
            switchAccount(nextId)
            const next = accounts.find((option) => option.user.id === nextId)
            if (next) void navigate(landingFor(next.user))
          }}
        />
      </Field>

      <p className={styles.role}>{account?.roleLabel ?? user.template.label}</p>

      <Button
        size="sm"
        icon="grid"
        aria-pressed={density === 'compact'}
        onClick={() => setDensity(density === 'compact' ? 'comfortable' : 'compact')}
        className={styles.density}
      >
        {density === 'compact' ? 'Comfortable rows' : 'Compact rows'}
      </Button>

      <Button
        size="sm"
        icon="lock"
        className={styles.signOut}
        onClick={() => {
          reset()
          window.location.assign('/login')
        }}
      >
        Sign out
      </Button>
    </div>
  )
}
