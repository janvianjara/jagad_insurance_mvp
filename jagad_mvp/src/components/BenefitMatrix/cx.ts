/**
 * Joins class names, dropping the absent ones.
 *
 * Duplicated per component group, as `src/components/guardrails` and each
 * `src/ui` group already do: a three-line helper is cheaper to repeat than a new
 * cross-group import edge.
 */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}
