/**
 * The settings editor's working copy — plan §8's `IntegrationConfig`, and the
 * posture `Mandate` set: the platform records that an integration exists and
 * holds no credential of any kind.
 *
 * A settings map is a flat set of plain values, so editing it in a screen means
 * turning it into rows and back. The two things worth reading here are what
 * happens at the edges of that.
 *
 * `readValue` keeps a setting's type rather than turning everything into text. A
 * port that came back as the string "587" would be a change nobody made, and the
 * fixture schema would refuse it on the way back in.
 *
 * `forbiddenIn` is the screen's half of the credential rule. The repository
 * refuses a secret-looking key with a sentence, and so does the fixture schema —
 * this is the same question asked early enough that the person pasting from a
 * provider console is told before they press Save rather than after.
 */

import { secretLikeSettingKeys } from '../../../data/repo'
import type { IntegrationSettingValue, IntegrationSettings } from '../../../data/repo'

export type SettingRow = {
  readonly id: string
  readonly name: string
  readonly value: string
  /** What the stored value was, so a number stays a number when it is saved. */
  readonly kind: 'string' | 'number' | 'boolean'
}

function kindOf(value: IntegrationSettingValue): SettingRow['kind'] {
  if (typeof value === 'number') return 'number'
  if (typeof value === 'boolean') return 'boolean'
  return 'string'
}

export function rowsFrom(settings: IntegrationSettings): readonly SettingRow[] {
  return Object.entries(settings).map(([name, value]) => ({
    id: name,
    name,
    value: String(value),
    kind: kindOf(value),
  }))
}

/**
 * A new row's type, inferred from what was typed. `true`/`false` and a clean
 * number are what they look like; everything else is text. Nothing here guesses
 * at anything a person did not write.
 */
function inferred(text: string): IntegrationSettingValue {
  const trimmed = text.trim()
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  if (trimmed !== '' && Number.isFinite(Number(trimmed))) return Number(trimmed)
  return text
}

export function readValue(row: SettingRow): IntegrationSettingValue {
  if (row.kind === 'number') {
    const parsed = Number(row.value.trim())
    return Number.isFinite(parsed) ? parsed : row.value
  }
  if (row.kind === 'boolean') return row.value.trim() === 'true'
  return inferred(row.value)
}

export function settingsFrom(rows: readonly SettingRow[]): IntegrationSettings {
  const built: Record<string, IntegrationSettingValue> = {}
  for (const row of rows) {
    const name = row.name.trim()
    if (name === '') continue
    built[name] = readValue(row)
  }
  return built
}

/** The setting names this platform will not store, as the screen asks it. */
export function forbiddenIn(rows: readonly SettingRow[]): readonly string[] {
  return secretLikeSettingKeys(settingsFrom(rows))
}

/**
 * The sentence a person sees when they have pasted a credential into the wrong
 * place. It names the keys, because whoever typed them is usually copying from
 * the provider's own console and needs to know the setting has a home — just not
 * this one.
 */
export function credentialRefusal(names: readonly string[]): string {
  return `These settings read like credentials and cannot be stored here: ${names.join(', ')}. The platform records that an integration exists; the key, token or password stays in the provider’s own console, exactly as a mandate’s bank credential stays with the bank.`
}
