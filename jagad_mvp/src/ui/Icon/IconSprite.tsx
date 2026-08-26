import spriteMarkup from '../../assets/icons.svg?raw'

/**
 * Mounts the icon sprite once, inline, near the top of the document.
 *
 * Inline rather than an external `<use href="sprite.svg#id">` on purpose: an
 * externally referenced sprite does not inherit `currentColor` reliably across
 * browsers, and every Jagad icon is coloured by its context.
 */
export function IconSprite() {
  return <div hidden dangerouslySetInnerHTML={{ __html: spriteMarkup }} />
}
