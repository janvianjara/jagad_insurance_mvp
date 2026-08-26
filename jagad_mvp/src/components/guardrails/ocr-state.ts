/**
 * The three states an extracted value can be in (plan §6, FR-16).
 *
 * A `const … as const` map rather than an enum: `erasableSyntaxOnly` is on, and
 * the descriptions are worth carrying anyway — they are what the gallery and the
 * review docs print next to each state.
 */
export const OCR_STATES = {
  extracted: 'Read by the extractor, not yet confirmed by a person',
  confirmed: 'A person has confirmed the value',
  edited: 'A person replaced the read; the original is kept for audit',
} as const

export type OcrState = keyof typeof OCR_STATES

/** What an extraction is, as it arrives from the OCR run. */
export type OcrExtraction = {
  value: string
  /** 0 to 1, as the extractor reported it. Shown, never acted on. */
  confidence: number
}

/** What a field reports upward on every human act. */
export type OcrFieldState = {
  name: string
  state: OcrState
  /** What the field holds now — the read, or what a person typed over it. */
  value: string
  /** What the extractor read. Never overwritten, whatever happens to `value`. */
  extracted: string
  confidence: number
  confirmed: boolean
}

/**
 * Edited wins over confirmed: once a person has typed over the read, the fact
 * worth showing is that the two disagree. Confirmation is tracked separately,
 * because editing a value is not the same act as vouching for it — an edited
 * field goes back to unconfirmed and blocks the form again until someone says so.
 */
export function readOcrState(value: string, extracted: string, confirmed: boolean): OcrState {
  if (value !== extracted) return 'edited'
  return confirmed ? 'confirmed' : 'extracted'
}
