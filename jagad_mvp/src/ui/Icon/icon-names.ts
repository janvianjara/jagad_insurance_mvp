/**
 * Every symbol in src/assets/icons.svg, in sprite order.
 *
 * The sprite is the single source of icon geometry; this list is the single
 * source of icon *names*, so `<Icon name>` is compile-time checked. Icon.test.tsx
 * asserts the two never drift apart.
 */
export const ICON_NAMES = [
  'grid',
  'inbox',
  'doc',
  'shield',
  'coin',
  'chart',
  'gear',
  'users',
  'clock',
  'check',
  'alert',
  'folder',
  'plus',
  'building',
  'msg',
  'book',
  'spark',
  'edit',
  'plug',
  'lock',
  'wallet',
  // Chrome marks. Added in P-06a/P-06b: the form, table and drawer primitives
  // need a chevron, a dismiss cross, a sort caret and so on, and the standing
  // rule is that a mark comes from this sprite rather than from a glyph.
  'chevron-down',
  'chevron-right',
  'close',
  'search',
  'calendar',
  'upload',
  'sort',
  'maximise',
] as const

export type IconName = (typeof ICON_NAMES)[number]
