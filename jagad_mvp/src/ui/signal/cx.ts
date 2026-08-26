/**
 * Joins class names, dropping the absent ones.
 *
 * Deliberately duplicated per primitive group: `src/ui` has no shared util module
 * yet, and a three-line helper is cheaper to repeat than a new cross-group import
 * edge. Fold the three copies together when `src/ui/lib` earns its existence.
 */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}
