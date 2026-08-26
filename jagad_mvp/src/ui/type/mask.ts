/**
 * The masking rule, isolated from the component that renders it.
 *
 * Constitution: "Aadhaar: last-4 maximum in staff UI, never the full number
 * anywhere." The rule is enforced here rather than at each call site, and the
 * function's shape is what enforces it: it takes the full value and returns
 * ONLY the masked string. The original never leaves this function, so there is
 * nothing downstream that could put it into a title, a data attribute, an
 * export or a log.
 */

/** Four is the ceiling, not the default: no caller may raise it. */
const MAX_VISIBLE = 4

export const MASK_CHAR = '•'

export const MASK_KINDS = {
  aadhaar: { group: 4, visible: 4, minLength: 12 },
  pan: { group: 0, visible: 4, minLength: 10 },
  account: { group: 4, visible: 4, minLength: 6 },
  phone: { group: 0, visible: 4, minLength: 10 },
  generic: { group: 4, visible: 4, minLength: 0 },
} as const

export type MaskKind = keyof typeof MASK_KINDS

function groupText(text: string, size: number): string {
  if (size <= 0) return text
  const chunks: string[] = []
  for (let index = 0; index < text.length; index += size) {
    chunks.push(text.slice(index, index + size))
  }
  return chunks.join(' ')
}

/**
 * Returns the only representation of `value` this application is allowed to
 * show: mask characters for everything but the trailing digits.
 *
 * There is deliberately no inverse and no "reveal" flag. Anything that needs
 * the full number is a back-office integration, not a screen.
 */
export function maskValue(value: string, kind: MaskKind = 'generic', visible?: number): string {
  const config = MASK_KINDS[kind]
  const clean = value.replace(/\s+/g, '')
  const keep = Math.max(0, Math.min(visible ?? config.visible, MAX_VISIBLE, clean.length))
  const tail = keep === 0 ? '' : clean.slice(clean.length - keep)
  const hidden = MASK_CHAR.repeat(Math.max(0, clean.length - keep))
  return groupText(`${hidden}${tail}`, config.group)
}
