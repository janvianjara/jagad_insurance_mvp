import { useState } from 'react'
import type { FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useRepositories } from '../../app/repositories-context'
import type { StaffUser } from '../../data/repo'
import { useResource } from '../../lib/useResource'
import { Button } from '../../ui/Button'
import { EmptyState, Skeleton } from '../../ui/data'
import { Field } from '../../ui/form'
import { AuthFrame } from './AuthFrame'
import type { SignInFactor } from './auth-desk'
import { CodeInput } from './CodeInput'
import { CHALLENGE_RESULTS, CODE_LENGTH, MAX_ATTEMPTS, verify } from './two-factor'
import styles from './auth.module.css'

/** Who is being verified, and what the configuration asks of their template. */
type Challenge = {
  readonly staff: readonly StaffUser[]
  readonly person: StaffUser | null
  readonly factor: SignInFactor | null
}

/**
 * `/login/2fa` — plan §4's code challenge, FR-18's second factor.
 *
 * **The payoff of reading the configuration.** P-10a recorded a two-factor
 * enforcement matrix in `/config/users` that nothing read. This screen reads it:
 * it is reached only because the matrix says this person's permission template
 * requires a factor at sign in, and it says so on screen, naming the template
 * and the level the matrix holds. Set that template back to "Not asked for" in
 * configuration and this screen stops appearing — which is the difference
 * between a mocked login and a demonstration of a configured policy.
 *
 * **What is honest and what is not.** No authenticator exists in this build and
 * no message is sent, so the screen says both in a quiet line rather than
 * miming a countdown. What is real is everything around the secret: the code is
 * six digits or it is refused, refusals are counted, and the challenge locks
 * after the third one.
 *
 * The account being verified arrives in the router's location state rather than
 * in the URL. A code challenge that named its subject in an address would be a
 * link anybody could forge, and a reloaded page with no challenge in progress
 * says so and points back at sign in.
 */
export default function TwoFactorScreen() {
  const repositories = useRepositories()
  const navigate = useNavigate()
  const location = useLocation()

  const passed = location.state as { readonly userId?: string } | null
  const userId = typeof passed?.userId === 'string' ? passed.userId : null

  const loaded = useResource<Challenge | null>(async () => {
    if (!userId) return null
    const [staff, desk] = await Promise.all([
      repositories.config.users(),
      import('./auth-desk'),
    ])
    const person = staff.find((entry) => entry.id === userId && entry.active) ?? null
    return {
      staff,
      person,
      factor: person ? desk.signInFactorFor(person.templateKey) : null,
    }
  }, `auth:2fa:${userId ?? 'none'}`)

  const [code, setCode] = useState('')
  const [attempts, setAttempts] = useState(0)
  const [problem, setProblem] = useState<string | null>(null)
  const [resent, setResent] = useState(false)
  const [pending, setPending] = useState(false)

  const locked = attempts >= MAX_ATTEMPTS

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (locked || pending) return

    const data = loaded.data
    if (!data?.person) return

    const verdict = verify(code, attempts)
    setAttempts(verdict.attemptsUsed)

    if (verdict.result !== CHALLENGE_RESULTS.accepted) {
      setProblem(verdict.message)
      setCode('')
      return
    }

    setProblem(null)
    setPending(true)

    const desk = await import('./auth-desk')
    const landing = desk.enterSession(data.staff, data.person.id)
    if (!landing) {
      setPending(false)
      setProblem(`${data.person.name}'s account could not be resolved into a session.`)
      return
    }
    void navigate(landing, { replace: true })
  }

  const backToSignIn = (
    <Button onClick={() => void navigate('/login', { replace: true })}>Back to sign in</Button>
  )

  if (loaded.isLoading && !loaded.data) {
    return (
      <AuthFrame narrow>
        <div className={styles.head} aria-busy="true" aria-label="Opening the challenge">
          <Skeleton width="60%" />
          <Skeleton width="90%" />
          <Skeleton height="3.25rem" shape="block" />
        </div>
      </AuthFrame>
    )
  }

  if (loaded.error) {
    return (
      <AuthFrame narrow>
        <EmptyState
          variant="error"
          title="The challenge could not be opened"
          explanation={loaded.error.message}
          action={
            <Button variant="primary" onClick={() => loaded.reload()}>
              Try again
            </Button>
          }
          secondaryAction={backToSignIn}
        />
      </AuthFrame>
    )
  }

  if (!userId || !loaded.data) {
    return (
      <AuthFrame narrow>
        <EmptyState
          variant="empty"
          icon="lock"
          title="No sign-in is waiting for a code"
          explanation="This page verifies a sign-in that has already been started, so there is nothing to verify when it is opened on its own or reloaded. Start at sign in and it will bring you back here if your role's policy asks for a code."
          action={backToSignIn}
        />
      </AuthFrame>
    )
  }

  const { person, factor } = loaded.data

  if (!person || !factor) {
    return (
      <AuthFrame narrow>
        <EmptyState
          variant="error"
          icon="users"
          title="That account can no longer sign in"
          explanation="The account this challenge was opened for is not in the active staff list any more. An administrator can reactivate it in Configuration, Users."
          action={backToSignIn}
        />
      </AuthFrame>
    )
  }

  return (
    <AuthFrame narrow>
      <div className={styles.head}>
        <h1 className={styles.title}>Enter your code</h1>
        <p className={styles.lead}>
          Your permission template asks for a second factor before this account is let in.
        </p>
      </div>

      <div className={styles.verifying}>
        <span className={styles.verifyingName}>{person.name}</span>
        <span className={styles.verifyingLine}>{person.roleLabel}</span>
        <span className={styles.verifyingLine}>
          Second factor: {factor.levelLabel} at {factor.eventLabel.toLowerCase()}
        </span>
        <span className={styles.verifyingLine}>
          The {person.templateKey} template asks for {factor.factorLabel}. Recorded in
          Configuration, Users.
        </span>
      </div>

      <form className={styles.form} onSubmit={(event) => void submit(event)} noValidate>
        <Field
          label={`Your ${CODE_LENGTH}-digit code`}
          control="group"
          error={problem ?? undefined}
          hint={
            locked
              ? undefined
              : `Type or paste the code. ${MAX_ATTEMPTS - attempts} of ${MAX_ATTEMPTS} attempts left.`
          }
        >
          <CodeInput value={code} onChange={setCode} disabled={locked || pending} />
        </Field>

        <div className={styles.actions}>
          <Button
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            // Never disabled for a short code: a refusal has to be reachable, or
            // the attempt count and the lock below it are decoration.
            disabled={locked || pending}
            aria-busy={pending || undefined}
          >
            {pending ? 'Verifying' : 'Verify and sign in'}
          </Button>
          <p className={styles.quiet}>
            No code is sent in this environment and none is stored. Any {CODE_LENGTH} digits are
            accepted; anything shorter is refused and counts as an attempt.
          </p>
        </div>

        <div className={styles.helpRow}>
          <Button icon="msg" disabled={locked} onClick={() => setResent(true)}>
            Send a new code
          </Button>
          {backToSignIn}
        </div>

        {resent ? (
          <p className={styles.note} role="status">
            Nothing was sent. This build has no SMS, email or authenticator integration, so there is
            no new code to wait for and no other way to verify.
          </p>
        ) : null}
      </form>
    </AuthFrame>
  )
}
