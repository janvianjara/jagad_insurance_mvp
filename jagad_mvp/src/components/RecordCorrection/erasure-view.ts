/**
 * How an erasure decision reads on a screen — FR-20.2.
 *
 * Only labels and a tone live here. The verdict, the obligations and the prose
 * that explains them are decided in `assessErasure` and carried on the record,
 * and the screens render `obligationNote` exactly as the domain wrote it. A
 * second sentence written in the view layer would be a second answer to the same
 * question, and the person asking would have no way of knowing which one counts.
 */

import { ERASE_VERDICTS, SUPPRESSIONS } from '../../domain/amend'
import type { EraseVerdict, Suppression } from '../../domain/amend'
import { ERASE_REQUESTERS } from '../../data/repo'
import type { EraseRequester } from '../../data/repo'
import type { Tone } from '../../ui/tone'

export const ERASE_VERDICT_LABELS: Readonly<Record<EraseVerdict, string>> = {
  [ERASE_VERDICTS.erased]: 'Erased',
  [ERASE_VERDICTS.retainedByObligation]: 'Retained by legal obligation',
  [ERASE_VERDICTS.partial]: 'Partly retained',
}

/**
 * Amber for retained, not red. A refusal is not what this is: the answer is that
 * the law requires the record to be kept and that everything the agency is free
 * to switch off has been switched off.
 */
export const ERASE_VERDICT_TONE: Readonly<Record<EraseVerdict, Tone>> = {
  [ERASE_VERDICTS.erased]: 'ok',
  [ERASE_VERDICTS.retainedByObligation]: 'warn',
  [ERASE_VERDICTS.partial]: 'info',
}

export const ERASE_REQUESTER_LABELS: Readonly<Record<EraseRequester, string>> = {
  [ERASE_REQUESTERS.dataPrincipal]: 'The person themselves',
  [ERASE_REQUESTERS.guardian]: 'Their guardian',
  [ERASE_REQUESTERS.staffOnBehalf]: 'Staff, on their behalf',
}

export const SUPPRESSION_LABELS: Readonly<Record<Suppression, string>> = {
  [SUPPRESSIONS.marketing]: 'Marketing use',
  [SUPPRESSIONS.automatedReminders]: 'Automated reminders and chasing',
}

export function suppressionSentence(suppressed: readonly Suppression[]): string {
  if (suppressed.length === 0) {
    return 'Nothing is suppressed, because nothing is retained.'
  }
  return `${suppressed.map((entry) => SUPPRESSION_LABELS[entry]).join(' and ')} are switched off against this file from now on.`
}
