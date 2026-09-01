import { Link } from 'react-router'
import { Skeleton } from '../../ui/data'
import styles from './RecordLink.module.css'

/**
 * One record, pointing at another.
 *
 * Every entity in this product carries the keys of its neighbours — a policy
 * knows its customer, company, product, deal and agent; a claim knows its
 * policy, its customer and the agent who wrote it — and until this component
 * existed almost none of that reached the screen. Six detail screens rendered
 * nine links between them, most of which were breadcrumbs back to a queue, and
 * `/policies/:id` rendered none at all: to get from a claim to the policy it was
 * raised against you went back to the rail and searched for it by number.
 *
 * That is the single largest reason this build reads as separate modules rather
 * than one system. The graph was always there; it was not walkable.
 *
 * ## Why three states and not two
 *
 * A reference is `loading`, `resolved`, or `missing`, and they render
 * differently on purpose. The playbook backlog already records this exact bug
 * shipped once: `EndorsementDetailScreen` renders its spine before the second
 * resource settles, so a policy that is merely still loading prints the same
 * "not recorded" as a policy whose link is genuinely broken — and it was first
 * misread as missing data by the person reviewing it.
 *
 * Building one component for all six screens is what makes that a single
 * decision rather than the same mistake six times. `null` means "still
 * loading", because that is what a screen has before its resource lands;
 * `missing` has to be said explicitly, so nothing reaches the broken state by
 * forgetting.
 */

export type RecordLinkProps = {
  /**
   * Where the record lives. Omit for a reference that resolved to nothing —
   * there is no such record, or this account may not see it.
   */
  to?: string
  /**
   * What to call it. `null` while the record is still being read; a component
   * cannot tell a slow lookup from a failed one and must not guess.
   */
  label: string | null
  /** Shown in place of a name when the reference resolved to nothing. */
  absentText?: string
  /** A reference number rendered after the name, in the mono face. */
  reference?: string
}

export function RecordLink({ to, label, absentText = 'Not recorded', reference }: RecordLinkProps) {
  // Still being read. A skeleton says "wait", where any words at all would be a
  // claim about a record nobody has looked at yet.
  if (label === null) {
    return <Skeleton width="12ch" />
  }

  const body = (
    <>
      <span className={styles.label}>{label}</span>
      {reference ? <span className={styles.reference}>{reference}</span> : null}
    </>
  )

  // Resolved to nothing. Deliberately not a link and deliberately not silent:
  // an absent neighbour is a fact about the record worth seeing.
  if (to === undefined) {
    return (
      <span className={styles.absent} data-record-link="absent">
        {label === '' ? absentText : body}
      </span>
    )
  }

  return (
    <Link className={styles.link} to={to} data-record-link="resolved">
      {body}
    </Link>
  )
}
