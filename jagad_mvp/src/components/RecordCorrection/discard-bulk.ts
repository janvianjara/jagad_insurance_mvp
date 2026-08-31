/**
 * Discarding from the list, rather than one record at a time.
 *
 * The three pre-contractual queues all reach their records by route rather than
 * by drawer, so a row click is a page. That is the right IA for reading a record
 * and the wrong one for clearing five duplicates out of a morning's import: it
 * costs five navigations and ten clicks to do one thing.
 *
 * The queue already has the affordance for exactly this — bulk selection with a
 * confirmation gate — and the UX charter makes bulk a first-class action rather
 * than a power-user shortcut. So removal from a list is a bulk action, built
 * once here and configured three times, for the same reason `<WorkQueue>` itself
 * is built once: three hand-rolled discard buttons would be three chances to
 * disagree about what discarding means.
 *
 * The reason is a required choice, not an optional note. Every discard in this
 * product carries one, and a bulk path that let somebody skip it would be the
 * one place the record stopped saying why it left.
 */

import { DISCARD_REASONS, DISCARD_REASON_LABELS } from '../../domain/amend'
import type { DiscardReason } from '../../domain/amend'
import type { MutationResult } from '../../data/repo'
import type { QueueBulkAction } from '../WorkQueue'

/** The least a row must carry for the preview to name it. */
export type DiscardableRow = {
  readonly id: string
  readonly systemNo: string
}

export type DiscardBulkInput<Row extends DiscardableRow> = {
  /** Singular, lower case: "inquiry", "quotation", "deal". */
  readonly noun: string
  /** Plural, for the sentence that counts them. */
  readonly plural: string
  readonly actorId: string
  readonly discard: (
    id: string,
    command: { readonly reason: DiscardReason; readonly actorId: string },
  ) => Promise<MutationResult<Row>>
}

const REASON_OPTIONS = Object.values(DISCARD_REASONS).map((reason) => ({
  value: reason,
  label: DISCARD_REASON_LABELS[reason],
}))

function isDiscardReason(value: string): value is DiscardReason {
  return (Object.values(DISCARD_REASONS) as readonly string[]).includes(value)
}

export function discardBulkAction<Row extends DiscardableRow>({
  noun,
  plural,
  actorId,
  discard,
}: DiscardBulkInput<Row>): QueueBulkAction<Row> {
  const counted = (n: number) => `${n} ${n === 1 ? noun : plural}`

  return {
    key: 'discard',
    label: 'Discard',
    icon: 'close',
    variant: 'danger',
    confirmLabel: 'Discard them',
    choice: {
      key: 'reason',
      label: 'Why',
      // No `emptyLabel`, which is what makes the choice required: a discard with
      // no reason is a row that leaves the queue and cannot say why it went.
      hint: 'Recorded against every record in this selection, and shown on each one afterwards.',
      options: REASON_OPTIONS,
    },
    confirmTitle: (selection, choice) =>
      choice === ''
        ? `Discard ${counted(selection.ids.length)}`
        : `Discard ${counted(selection.ids.length)} — ${DISCARD_REASON_LABELS[choice as DiscardReason].toLowerCase()}`,
    preview: (selection) =>
      selection.rows.map((row) => ({
        key: row.id,
        label: row.systemNo,
        from: 'In the queue',
        to: 'Discarded',
      })),
    note: () =>
      `This is reversible. Each ${noun} leaves the queues and stays in the book, and can be found again with the Discarded filter and restored. Nothing is deleted.`,
    run: async (selection, choice) => {
      if (!isDiscardReason(choice)) {
        return { ok: false, message: 'Choose why these are being discarded first.' }
      }

      const refusals: string[] = []
      let done = 0

      for (const row of selection.rows) {
        const outcome = await discard(row.id, { reason: choice, actorId })
        if (outcome.ok) done += 1
        // The machine's own sentence, carried out rather than rewritten.
        else refusals.push(`${row.systemNo}: ${outcome.reason}`)
      }

      if (refusals.length === 0) {
        return { ok: true, message: `${counted(done)} discarded. Restore from the Discarded filter.` }
      }

      // A partial run is reported as one: what moved, and every refusal in full.
      // Saying only "some failed" leaves somebody to work out which.
      return {
        ok: done > 0,
        message:
          done === 0
            ? `Nothing was discarded. ${refusals.join(' ')}`
            : `${counted(done)} discarded. ${refusals.length} refused — ${refusals.join(' ')}`,
      }
    },
  }
}
