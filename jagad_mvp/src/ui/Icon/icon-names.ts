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
] as const

export type IconName = (typeof ICON_NAMES)[number]
