/**
 * Where a draft is kept — charter U6, plan §7 ("localStorage autosave keyed by
 * entity id, so U6 draft-safety survives a session timeout").
 *
 * An interface with a browser implementation, for two reasons. The obvious one
 * is that a test can hand `<SchemaForm>` a store it controls. The other is that
 * localStorage is the MVP's answer, not the product's: when drafts move to the
 * server this file changes and nothing else does.
 *
 * Every method swallows its failures. Private browsing, a full quota and a
 * disabled storage setting all throw on access, and a form that crashed while
 * trying to protect somebody's typing would be a poor kind of protection.
 */
export type DraftStore = {
  read(key: string): string | null
  write(key: string, text: string): void
  clear(key: string): void
}

function storage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export const browserDraftStore: DraftStore = {
  read(key) {
    try {
      return storage()?.getItem(key) ?? null
    } catch {
      return null
    }
  },
  write(key, text) {
    try {
      storage()?.setItem(key, text)
    } catch {
      // A full quota is not a reason to interrupt somebody mid-form.
    }
  },
  clear(key) {
    try {
      storage()?.removeItem(key)
    } catch {
      // Same.
    }
  },
}

/** A store that keeps nothing — for a form that must not leave a trace. */
export function memoryDraftStore(): DraftStore {
  const held = new Map<string, string>()
  return {
    read: (key) => held.get(key) ?? null,
    write: (key, text) => void held.set(key, text),
    clear: (key) => void held.delete(key),
  }
}
