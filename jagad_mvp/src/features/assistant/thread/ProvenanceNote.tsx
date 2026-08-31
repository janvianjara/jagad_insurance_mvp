import { useId, useState } from 'react'
import { Icon } from '../../../ui/Icon'
import { DateTime } from '../../../ui/type'
import { describeSources, sourceEntities, sourceLabel } from '../../../data/assistant'
import type { AssistantSourceKey } from '../../../data/assistant'
import styles from './ProvenanceNote.module.css'

/**
 * What this answer read to answer — FR-22.11, on the surface.
 *
 * The projection boundary is the strongest claim this platform makes and, until
 * this line existed, it was a claim nobody using the product could see. A person
 * was told the Assistant cannot read an Aadhaar number and had no way to check;
 * an assurance that cannot be checked is a slogan. So every answer says which
 * projections it read and when it read them.
 *
 * The claim is on the surface and the substance is one click in, which is the
 * standing rule for this product and the right split here. "Answered from the
 * renewal pool and the inquiry queue, as of 14:32" is a sentence somebody reads
 * in passing and stops worrying about; the list of projections behind each of
 * those names, and the sentence about what is in none of them, is what somebody
 * reads once, on the day they decide whether to trust it.
 *
 * The sources are not declared by the card. They are recorded by the facade
 * wrapper in `src/data/assistant/provenance.ts` as the reads happen, so this
 * line cannot flatter the answer above it: a card that quietly starts reading
 * the claim register says so here the moment it does.
 *
 * An empty list is not a missing value. A refusal and an unanswerable question
 * read nothing at all, and "nothing was read to answer this" is the most
 * informative provenance line this component has.
 */
export function ProvenanceNote({
  sources,
  readAt,
}: {
  sources: readonly AssistantSourceKey[]
  /** When the read happened, as recorded. Null on a turn that read nothing. */
  readAt: string | null
}) {
  const [open, setOpen] = useState(false)
  const panelId = useId()

  const read = sources.length > 0

  return (
    <div className={styles.provenance}>
      <button
        type="button"
        className={styles.summary}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((was) => !was)}
      >
        <Icon name={open ? 'chevron-down' : 'chevron-right'} size="sm" />
        <span className={styles.line}>
          {read ? (
            <>
              Answered from {describeSources(sources)}
              {readAt ? (
                <>
                  , as of <DateTime className={styles.at} value={readAt} mode="time" />
                </>
              ) : null}
            </>
          ) : (
            'Nothing was read to answer this'
          )}
        </span>
      </button>

      {open ? (
        <div className={styles.detail} id={panelId}>
          {read ? (
            <dl className={styles.list}>
              {sources.map((key) => (
                <div key={key} className={styles.item}>
                  <dt className={styles.term}>{sourceLabel(key)}</dt>
                  <dd className={styles.projections}>{sourceEntities(key).join(', ')}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className={styles.note}>
              No query ran. The Assistant did not open a queue, a register or a record to produce
              the turn above.
            </p>
          )}

          <p className={styles.note}>
            Each name above is an allow-listed projection, and an allow-list is the whole
            mechanism: an identity number in any form, its last four digits included, a bank
            account, a diagnosis, a health declaration and the body text of any document are in
            none of them. Not filtered out of this answer — never in the query.
          </p>
        </div>
      ) : null}
    </div>
  )
}
