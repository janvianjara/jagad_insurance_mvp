import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { useRepositories } from '../../app/repositories-context'
import type { StaffUser } from '../../data/repo'
import { useResource } from '../../lib/useResource'
import type { Resource } from '../../lib/useResource'
import { Button } from '../../ui/Button'
import { EmptyState, Skeleton } from '../../ui/data'
import { Field, Input } from '../../ui/form'
import { Icon } from '../../ui/Icon'
import { Badge } from '../../ui/signal'
import { AuthFrame } from './AuthFrame'
// Type-only, so it is erased at build time and the desk stays on the far side of
// the dynamic import. See `auth-isolation.test.ts`.
import type { DemoAccount } from './auth-desk'
import { refusalFor, signIn } from './credentials'
import styles from './auth.module.css'

/**
 * `/login` — plan §4's entry route, §11.1's login-free shell.
 *
 * **What this screen is honest about.** There is no authentication service in
 * this build. The screen does not fake one: the password field is real, is
 * required and is validated, and the panel beside it says in as many words that
 * this environment checks no password. A box that silently accepts anything
 * would teach a visitor something false about the product; a labelled demo
 * account list teaches them what it actually is, and lets them walk all seven
 * roles in a minute, which is the point of showing it.
 *
 * **What this screen does for real.** Three things, and none of them is
 * decoration:
 *
 *   - the account list is the agency's staff records, read through
 *     `repositories.config.users()` and filtered to the active ones, so a person
 *     deactivated in configuration is not offered here and is refused by name if
 *     somebody types their address;
 *   - which account is challenged for a second factor is read out of the
 *     two-factor enforcement matrix in `/config/users`. Change the policy there
 *     and the next sign-in changes with it;
 *   - where a successful sign-in lands is `landingFor`, the same helper the rail
 *     footer's switcher uses, so the row's "lands on" line and the redirect are
 *     one fact rather than two.
 *
 * **What it deliberately does not import.** The session store, the permission
 * evaluator and the navigation model all sit behind `await import('./auth-desk')`
 * and are reached only once credentials have resolved. The route carries no
 * session at mount, and `auth-isolation.test.ts` walks this module's static
 * import graph to keep that true.
 */
export default function SignInScreen() {
  const repositories = useRepositories()
  const navigate = useNavigate()
  const problemId = useId()

  const loaded = useResource(async () => {
    // The desk is the far side of §11.1's boundary: it is pulled in here, inside
    // the loader, so it is not part of this module's static graph.
    const [staff, desk] = await Promise.all([
      repositories.config.users(),
      import('./auth-desk'),
    ])
    return { staff, accounts: desk.demoAccounts(staff) }
  }, 'auth:sign-in')

  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [chosen, setChosen] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [problem, setProblem] = useState<Problem | null>(null)

  const identifierRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const alertRef = useRef<HTMLParagraphElement>(null)

  // A refusal that nobody's cursor is near is a refusal nobody reads. Focus goes
  // to the account-level message, or to the field that is still empty.
  useEffect(() => {
    if (!problem) return
    if (problem.scope === 'form') alertRef.current?.focus()
    else if (problem.scope === 'identifier') identifierRef.current?.focus()
    else passwordRef.current?.focus()
  }, [problem])

  function refuse(scope: ProblemScope, message: string) {
    setProblem({ scope, message, seq: Date.now() })
    setPending(false)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return

    const data = loaded.data
    if (!data) {
      refuse('form', 'The account list is still loading. Try again in a moment.')
      return
    }

    if (identifier.trim() === '') {
      refuse('identifier', 'Enter the email address or mobile number your account was created with.')
      return
    }
    if (password === '') {
      refuse('password', 'Enter a password. It is not checked in this environment, but signing in without one is not a thing the product lets you do.')
      return
    }

    const outcome = signIn(data.staff, identifier)
    if (outcome.kind !== 'found') {
      refuse('form', refusalFor(outcome, identifier) ?? 'That account cannot sign in.')
      return
    }

    setProblem(null)
    setPending(true)

    const desk = await import('./auth-desk')
    const factor = desk.signInFactorFor(outcome.staff.templateKey)

    // The configured policy decides, not the code. A template the matrix asks a
    // second factor of goes to the challenge; every other one is in.
    if (factor.challenges) {
      void navigate('/login/2fa', { state: { userId: outcome.staff.id } })
      return
    }

    const landing = desk.enterSession(data.staff, outcome.staff.id)
    if (!landing) {
      refuse('form', `${outcome.staff.name}'s account could not be resolved into a session.`)
      return
    }
    void navigate(landing, { replace: true })
  }

  function pick(email: string) {
    setIdentifier(email)
    setChosen(email)
    setProblem(null)
    passwordRef.current?.focus()
  }

  return (
    <AuthFrame aside={<DemoAccounts loaded={loaded} chosen={chosen} onPick={pick} />}>
      <div className={styles.head}>
        <h1 className={styles.title}>Sign in</h1>
        <p className={styles.lead}>
          The Jagad Insurance agency console. Your permission template decides what you land on and
          what you can open.
        </p>
      </div>

      <form className={styles.form} onSubmit={(event) => void submit(event)} noValidate>
        {problem?.scope === 'form' ? (
          <p className={styles.problem} id={problemId} role="alert" tabIndex={-1} ref={alertRef}>
            <Icon name="alert" className={styles.problemIcon} />
            <span>{problem.message}</span>
          </p>
        ) : null}

        <Field
          label="Email or mobile number"
          required
          error={problem?.scope === 'identifier' ? problem.message : undefined}
        >
          <Input
            ref={identifierRef}
            name="identifier"
            autoComplete="username"
            spellCheck={false}
            autoCapitalize="none"
            placeholder="name@jagadinsurance.example"
            invalid={problem?.scope === 'form' || undefined}
            aria-describedby={problem?.scope === 'form' ? problemId : undefined}
            value={identifier}
            onChange={(event) => {
              setIdentifier(event.target.value)
              setChosen(null)
              if (problem) setProblem(null)
            }}
          />
        </Field>

        <Field
          label="Password"
          required
          hint="Not checked in this environment."
          error={problem?.scope === 'password' ? problem.message : undefined}
        >
          <Input
            ref={passwordRef}
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value)
              if (problem?.scope === 'password') setProblem(null)
            }}
          />
        </Field>

        <div className={styles.actions}>
          <Button
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            disabled={pending || loaded.isLoading}
            aria-busy={pending || undefined}
          >
            {pending ? 'Signing in' : 'Sign in'}
          </Button>
          <p className={styles.quiet}>
            Accounts requiring a second factor go to a six-digit code challenge; the rest come
            straight in.
          </p>
        </div>
      </form>
    </AuthFrame>
  )
}

type ProblemScope = 'identifier' | 'password' | 'form'

/** One refusal at a time, and the field it belongs to. `seq` re-fires the focus. */
type Problem = {
  readonly scope: ProblemScope
  readonly message: string
  readonly seq: number
}

/** What the loader hands the screen: the book, and the rows drawn from it. */
type SignInData = {
  readonly staff: readonly StaffUser[]
  readonly accounts: readonly DemoAccount[]
}

/**
 * The demo account picker — the pragmatic heart of the screen.
 *
 * Three states, kept apart: skeletons while the repository is in flight, a
 * teaching error with a retry when it fails, and a teaching empty state when
 * configuration holds no active account. A list that rendered nothing in all
 * three cases would look identical to a working one with nobody in it.
 */
function DemoAccounts({
  loaded,
  chosen,
  onPick,
}: {
  loaded: Resource<SignInData>
  chosen: string | null
  onPick: (email: string) => void
}) {
  const accounts = loaded.data?.accounts ?? []

  return (
    <>
      <div className={styles.asideHead}>
        <h2 className={styles.asideTitle}>Demo accounts</h2>
        <p className={styles.note}>
          This environment has no password check. Pick a person to fill the form; the badge is what
          the two-factor policy in Configuration, Users asks of that role at sign in.
        </p>
      </div>

      {loaded.isLoading && !loaded.data ? (
        <div className={styles.accountList} aria-busy="true" aria-label="Loading the staff accounts">
          {[0, 1, 2, 3].map((row) => (
            <div className={styles.skeletonRow} key={row}>
              <Skeleton width="45%" />
              <Skeleton width="70%" />
            </div>
          ))}
        </div>
      ) : null}

      {loaded.error && !loaded.data ? (
        <EmptyState
          variant="error"
          title="The staff accounts could not be read"
          explanation={loaded.error.message}
          action={
            <Button variant="primary" icon="clock" onClick={() => loaded.reload()}>
              Try again
            </Button>
          }
        />
      ) : null}

      {loaded.data && accounts.length === 0 ? (
        <EmptyState
          variant="empty"
          icon="users"
          title="No account is active"
          explanation="Staff accounts come from Configuration, Users. Every account there is deactivated, so nobody can sign in until an administrator reactivates one."
        />
      ) : null}

      {accounts.length > 0 ? (
        <ul className={styles.accountList}>
          {accounts.map((account) => (
            <li key={account.id}>
              <button
                type="button"
                className={styles.account}
                data-current={account.email === chosen ? 'true' : undefined}
                onClick={() => onPick(account.email)}
              >
                <span className={styles.accountName}>{account.name}</span>
                <Badge
                  tone={account.factor.challenges ? 'info' : 'neutral'}
                  icon={account.factor.challenges ? 'lock' : undefined}
                >
                  {account.factor.shortLabel}
                </Badge>
                <span className={styles.accountRole}>{account.roleLabel}</span>
                <span className={styles.accountLanding}>Lands on {account.landing}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  )
}
