/**
 * The breach runbook — FR-20.3, and the two clocks that make it a runbook rather
 * than a note.
 *
 * A personal-data breach at an insurance agency in India starts two obligations
 * at the same instant and they do not run at the same speed:
 *
 *   CERT-In    six hours   The Directions of 28 April 2022 require a reportable
 *                          cyber security incident to be reported within six
 *                          hours of noticing it.
 *   DPDP       72 hours    The Board is intimated without delay, with the
 *                          detailed particulars inside 72 hours.
 *
 * So they are drawn as two clocks, not one. A single "deadline" would be either
 * six hours of false alarm or 72 hours of false calm, and both readings are the
 * kind of mistake this page exists to prevent. Both start from `detectedAt` —
 * when somebody noticed, not when the incident began, because that is what the
 * obligation is measured from and usually all anybody can honestly state.
 *
 * The step list is the runbook itself: what has to happen, in order, each with
 * who did it and when. Two of the steps are what stop a clock, and the module
 * says which — the clock reading and the checklist cannot disagree because one
 * is read off the other.
 *
 * Nothing in a breach record carries personal data. The summary field is for what
 * happened and how many people are affected; whose data it was lives on the
 * records themselves, and a register that copied it here would widen the breach.
 */

import { readClock } from '../../../ui/signal'
import type { ClockReading } from '../../../ui/signal'

const HOUR_MS = 60 * 60 * 1000

export const BREACH_WINDOW_KEYS = {
  certIn: 'certIn',
  dpdp: 'dpdp',
} as const

export type BreachWindowKey = (typeof BREACH_WINDOW_KEYS)[keyof typeof BREACH_WINDOW_KEYS]

export type BreachWindow = {
  readonly key: BreachWindowKey
  readonly label: string
  readonly hours: number
  /** Where the number comes from. Rendered, so the page cites its own source. */
  readonly authority: string
  /** The step whose completion satisfies this window. */
  readonly stepKey: string
}

export const BREACH_WINDOWS: readonly BreachWindow[] = [
  {
    key: BREACH_WINDOW_KEYS.certIn,
    label: 'CERT-In',
    hours: 6,
    authority:
      'CERT-In Directions of 28 April 2022: a reportable cyber security incident is reported within six hours of noticing it.',
    stepKey: 'cert_in_reported',
  },
  {
    key: BREACH_WINDOW_KEYS.dpdp,
    label: 'Data Protection Board',
    hours: 72,
    authority:
      'DPDP: the Board is intimated without delay, and the detailed particulars follow within 72 hours of becoming aware.',
    stepKey: 'board_intimated',
  },
]

export type BreachStepDef = {
  readonly key: string
  readonly label: string
  /** Whose job it is, as a person would say it. */
  readonly who: string
  readonly detail: string
  /** The window this step satisfies, where it satisfies one. */
  readonly window: BreachWindowKey | null
}

export const BREACH_STEPS: readonly BreachStepDef[] = [
  {
    key: 'contained',
    label: 'Contain it',
    who: 'Whoever holds the affected system',
    detail:
      'Stop the exposure before anything else. Revoke the access, switch the integration off, take the export back. Containment is not a notification and it does not stop either clock.',
    window: null,
  },
  {
    key: 'scoped',
    label: 'Establish what was exposed, and to how many people',
    who: 'Admin',
    detail:
      'Which classes of data, and how many data principals. Both regulators ask for this and neither accepts "unknown" as a final answer.',
    window: null,
  },
  {
    key: 'cert_in_reported',
    label: 'Report to CERT-In',
    who: 'Admin',
    detail:
      'The six-hour obligation. Reported on the strength of what is known at the time — a report inside the window with gaps in it is the requirement; a complete report after it is not.',
    window: BREACH_WINDOW_KEYS.certIn,
  },
  {
    key: 'board_intimated',
    label: 'Intimate the Data Protection Board',
    who: 'Admin',
    detail:
      'The 72-hour obligation, with the particulars: the nature of the breach, its extent, the likely consequences, and what has been done about it.',
    window: BREACH_WINDOW_KEYS.dpdp,
  },
  {
    key: 'principals_told',
    label: 'Tell the affected data principals',
    who: 'Admin',
    detail:
      'Each affected person is told, in plain words, what happened and what they should do. This is a separate obligation from either notification above and is not satisfied by them.',
    window: null,
  },
  {
    key: 'remedied',
    label: 'Record what changed so it does not happen again',
    who: 'Admin',
    detail:
      'The remedial measure, written down against the incident. This is what an auditor reads a year later, and it is the reason the record is never deleted.',
    window: null,
  },
]

export type BreachStepEntry = {
  readonly at: string
  readonly by: string
  readonly note: string
}

export type BreachRecord = {
  readonly id: string
  /** When somebody noticed. Both clocks run from here. */
  readonly detectedAt: string
  /** What happened. Never whose data it was. */
  readonly summary: string
  /** How many data principals are affected, where it is known. */
  readonly affectedCount: number | null
  readonly recordedAt: string
  readonly recordedBy: string
  /** Step key to what was done. A step nobody has done has no entry. */
  readonly steps: Readonly<Record<string, BreachStepEntry>>
}

export type BreachWindowReading = {
  readonly window: BreachWindow
  readonly durationMs: number
  /** When the step that satisfies this window was recorded, if it has been. */
  readonly satisfiedAt: string | null
  /** Null once satisfied: a met obligation has no clock left to run. */
  readonly reading: ClockReading | null
  /** True where the window ran out before the step was recorded. */
  readonly missed: boolean
  /** How long it actually took, once it is done. */
  readonly tookMs: number | null
}

/**
 * One window's standing on one breach.
 *
 * Satisfied is read off the step, so ticking "Report to CERT-In" is what stops
 * the CERT-In clock — there is no separate place to mark a clock met, and
 * therefore no way for the checklist and the clock to say different things.
 */
export function readBreachWindow(
  record: BreachRecord,
  window: BreachWindow,
  now: Date,
): BreachWindowReading {
  const durationMs = window.hours * HOUR_MS
  const detected = new Date(record.detectedAt)
  const entry = record.steps[window.stepKey]

  if (entry) {
    const tookMs = new Date(entry.at).getTime() - detected.getTime()
    return {
      window,
      durationMs,
      satisfiedAt: entry.at,
      reading: null,
      missed: tookMs > durationMs,
      tookMs,
    }
  }

  return {
    window,
    durationMs,
    satisfiedAt: null,
    reading: readClock({ mode: 'tat', start: detected, now, durationMs }),
    missed: now.getTime() - detected.getTime() > durationMs,
    tookMs: null,
  }
}

export function readBreachWindows(
  record: BreachRecord,
  now: Date,
): readonly BreachWindowReading[] {
  return BREACH_WINDOWS.map((window) => readBreachWindow(record, window, now))
}

/** A breach with a step still outstanding. The runbook is not finished. */
export function isBreachOpen(record: BreachRecord): boolean {
  return BREACH_STEPS.some((step) => record.steps[step.key] === undefined)
}

export function openBreaches(records: readonly BreachRecord[]): readonly BreachRecord[] {
  return records.filter(isBreachOpen)
}

/** Breaches with a notification window running out or already run out. */
export function breachesAtRisk(
  records: readonly BreachRecord[],
  now: Date,
): readonly BreachRecord[] {
  return records.filter((record) =>
    readBreachWindows(record, now).some((held) => held.satisfiedAt === null && held.missed),
  )
}

export function stepsDone(record: BreachRecord): number {
  return BREACH_STEPS.filter((step) => record.steps[step.key] !== undefined).length
}

/** "2 h 15 m", for a window that has already been met. */
export function elapsedText(ms: number): string {
  const total = Math.max(0, Math.round(ms / 60000))
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  if (hours === 0) return `${minutes} min`
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`
}
