/**
 * Joins class names, dropping the absent ones.
 *
 * Duplicated per component group, as `src/ui/form`, `src/ui/type` and
 * `src/ui/signal` each already do: a three-line helper is cheaper to repeat than
 * a new cross-group import edge. Fold the copies together when a shared util
 * module earns its existence.
 */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}
