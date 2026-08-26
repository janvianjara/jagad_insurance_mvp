/**
 * The status vocabulary, UX charter U7 (plan §2). One definition for all of src/ui.
 *
 * Six tones, and only six. The descriptions are the charter's own wording and are
 * what the gallery prints, so the meaning of a colour lives next to the colour
 * rather than in a document nobody opens.
 *
 * Green means positive status and brand, never an action; lime means something
 * needs a person, which is not the same as something being wrong.
 *
 * This sits at the src/ui root deliberately. The signal, surface and data groups
 * all speak this language, and two copies of it would drift within a release.
 */
export const TONES = {
  ok: 'Active, won, settled, verified',
  warn: 'Pending, awaiting, at risk',
  bad: 'Escalated, blocked, lapsed, bounced',
  info: 'In progress, informational',
  idle: 'Locked, closed, archived',
  attn: 'Needs a person, not an error',
} as const

export type Tone = keyof typeof TONES

export const TONE_NAMES = Object.keys(TONES) as Tone[]

/**
 * Tones plus a neutral, for labels that carry no status meaning at all — a
 * channel name, a product tag, a document type.
 */
export const SUBTLE_TONES = {
  ...TONES,
  neutral: 'A label, not a state',
} as const

export type SubtleTone = keyof typeof SUBTLE_TONES

/**
 * Queue severity, as the row stripe expresses it.
 *
 * A queue sorts by how much trouble a row is in, not by which status it holds,
 * so the stripe speaks a shorter language than the pill and maps onto the same
 * six tokens.
 */
export const SEVERITIES = {
  hot: 'bad',
  warm: 'warn',
  cool: 'info',
  good: 'ok',
  attn: 'attn',
} as const

export type Severity = keyof typeof SEVERITIES

export function toneForSeverity(severity: Severity): Tone {
  return SEVERITIES[severity]
}
