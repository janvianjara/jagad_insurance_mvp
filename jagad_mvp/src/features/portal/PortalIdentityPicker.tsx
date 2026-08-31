import { useState } from 'react'
import { useRepositories } from '../../app/repositories-context'
import { useResource } from '../../lib/useResource'
import { BrandMark } from '../../ui/BrandMark'
import { Button } from '../../ui/Button'
import { EmptyState, Skeleton } from '../../ui/data'
import { Field, Input } from '../../ui/form'
import { portalDesk } from './data/portal-desk'
import { usePortalIdentity } from './portal-session'
import styles from './Portal.module.css'

/**
 * Who is looking at this portal — the front door of a product that has no
 * customer login yet.
 *
 * The honest thing to build here was not a fake sign-in. A username and password
 * box that accepts anything teaches a client walkthrough that authentication
 * exists, and it would be the first thing a mentor asked about. So the page says
 * what it is: a demo identity, chosen deliberately, written into the address bar
 * where it is visible for the rest of the session.
 *
 * The list is not the customer book. It is the eight households carrying the
 * most live cover, which is one policy read rather than three hundred customer
 * reads, and everybody else is reachable by name through the search box.
 */
export function PortalIdentityPicker() {
  const repositories = useRepositories()
  const desk = portalDesk(repositories)
  const identity = usePortalIdentity()
  const [search, setSearch] = useState('')

  const choices = useResource(() => desk.choices(search), `portal:choices:${search}`)

  return (
    <div className={styles.picker}>
      <BrandMark size="md" />

      <div className={styles.screenHead}>
        <h1 className={styles.title}>Your insurance, in one place</h1>
        <p className={styles.lead}>
          Your policies, your documents and your claims, as Jagad Insurance holds them.
        </p>
        <p className={styles.note}>
          This preview has no customer sign-in yet, so choose whose portal to open. Whoever you
          choose, this portal shows that person&rsquo;s records and nothing belonging to anybody
          else.
        </p>
      </div>

      <Field label="Find yourself by name" hint="Or choose from the list below.">
        <Input
          type="search"
          value={search}
          placeholder="Start typing a name"
          onChange={(event) => setSearch(event.target.value)}
        />
      </Field>

      {choices.status === 'loading' ? (
        <div className={styles.loading} aria-busy="true">
          <Skeleton height="52px" />
          <Skeleton height="52px" />
          <Skeleton height="52px" />
        </div>
      ) : choices.status === 'error' ? (
        <EmptyState
          variant="error"
          title="The customer list could not be loaded"
          explanation={choices.error?.message ?? 'The request failed before anything was read.'}
          action={
            <Button variant="primary" onClick={() => choices.reload()}>
              Try again
            </Button>
          }
        />
      ) : (choices.data ?? []).length === 0 ? (
        <EmptyState
          title="Nobody answers to that name"
          explanation="Only customers on the books can be opened here. Clear the search to see the households carrying the most cover."
          action={
            <Button variant="quiet" onClick={() => setSearch('')}>
              Clear the search
            </Button>
          }
        />
      ) : (
        <ul className={styles.choices}>
          {(choices.data ?? []).map((choice) => (
            <li key={choice.id}>
              <button
                type="button"
                className={styles.choice}
                onClick={() => identity.choose(choice.id)}
              >
                <span className={styles.choiceName}>{choice.fullName}</span>
                <span className={styles.choiceMeta}>
                  {choice.city} &middot; {choice.liveCover}{' '}
                  {choice.liveCover === 1 ? 'policy in force' : 'policies in force'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default PortalIdentityPicker
