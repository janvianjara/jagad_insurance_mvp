/**
 * Integrations, as the integrations config screen edits them — plan §8
 * ("Configuration": IntegrationConfig), canvas flow 6.
 *
 * The posture is `Mandate`'s, transplanted: the platform records that an
 * integration exists and what happened the last time it was exercised, and it
 * holds no credential of any kind. A WhatsApp Business Solution Provider key, an
 * SMTP password, an SMS sender token and an OCR subscription key all live in the
 * provider's own console; what this record holds is which provider, whether it is
 * switched on, and the non-secret settings an admin actually needs to see —
 * sender id, from-address, endpoint region.
 *
 * `settings` is deliberately a flat map of plain values rather than an open
 * object, and the fixture schema refuses a key that reads like a secret
 * (`apiKey`, `token`, `password`, `secret`, `credential`). `save` refuses the
 * same keys with a sentence, so the rule holds against a screen as well as
 * against a fixture. There is no field on this type a credential could live in
 * even by accident, which is the point.
 */

import type { ReadRepository } from './query'
import type { MutationResult } from './result'

/** The four kinds the MVP configures. §8 names them; nothing here invents a fifth. */
export const INTEGRATION_KINDS = {
  /** WhatsApp Business Solution Provider. */
  bsp: 'bsp',
  sms: 'sms',
  smtp: 'smtp',
  ocr: 'ocr',
} as const

export type IntegrationKind = (typeof INTEGRATION_KINDS)[keyof typeof INTEGRATION_KINDS]

export const INTEGRATION_CHECK_OUTCOMES = {
  ok: 'ok',
  failed: 'failed',
} as const

export type IntegrationCheckOutcome =
  (typeof INTEGRATION_CHECK_OUTCOMES)[keyof typeof INTEGRATION_CHECK_OUTCOMES]

/** A non-secret setting. Anything that needs hiding does not belong in here. */
export type IntegrationSettingValue = string | number | boolean

export type IntegrationSettings = Readonly<Record<string, IntegrationSettingValue>>

export type IntegrationConfig = {
  readonly id: string
  readonly key: string
  readonly kind: IntegrationKind
  readonly label: string
  /** Who provides it, as a person would say it: Gupshup, Amazon SES, Textract. */
  readonly providerName: string
  readonly enabled: boolean
  /** Non-secret only. No key, token, password or credential ever lands here. */
  readonly settings: IntegrationSettings
  readonly lastCheckedAt: string | null
  readonly lastCheckOutcome: IntegrationCheckOutcome | null
  /** The provider's own words when a check failed. Never a credential. */
  readonly lastCheckNote: string | null
  readonly updatedAt: string
  readonly updatedBy: string
}

/**
 * Setting keys this platform refuses to store, matched case-insensitively as a
 * substring. A refusal names the key, because the person typing it is usually
 * pasting from the provider's own console and needs to know where it may go.
 */
export const FORBIDDEN_SETTING_KEYS = [
  'key',
  'token',
  'secret',
  'password',
  'credential',
  'auth',
] as const

/** The forbidden keys found in a settings map, in the order they appear. */
export function secretLikeSettingKeys(settings: IntegrationSettings): readonly string[] {
  return Object.keys(settings).filter((name) => {
    const lowered = name.toLowerCase()
    return FORBIDDEN_SETTING_KEYS.some((banned) => lowered.includes(banned))
  })
}

export type CreateIntegrationCommand = {
  readonly actorId: string
  readonly key: string
  readonly kind: IntegrationKind
  readonly label: string
  readonly providerName: string
  readonly settings?: IntegrationSettings
  readonly updatedBy: string
  readonly now?: Date
}

/** An edit. Refused outright when a setting key reads like a credential. */
export type SaveIntegrationCommand = {
  readonly actorId: string
  readonly label?: string
  readonly providerName?: string
  readonly settings?: IntegrationSettings
  readonly updatedBy: string
  readonly now?: Date
}

export type SetIntegrationEnabledCommand = {
  readonly actorId: string
  readonly enabled: boolean
  readonly updatedBy: string
  readonly now?: Date
}

/** The outcome of exercising an integration, recorded exactly as it came back. */
export type RecordIntegrationCheckCommand = {
  readonly actorId: string
  readonly outcome: IntegrationCheckOutcome
  readonly note?: string | null
  readonly now?: Date
}

export type IntegrationRepository = ReadRepository<IntegrationConfig> & {
  byKey(key: string): Promise<IntegrationConfig | null>
  forKind(kind: IntegrationKind): Promise<readonly IntegrationConfig[]>
  enabled(): Promise<readonly IntegrationConfig[]>

  create(command: CreateIntegrationCommand): Promise<MutationResult<IntegrationConfig>>
  save(id: string, command: SaveIntegrationCommand): Promise<MutationResult<IntegrationConfig>>
  setEnabled(
    id: string,
    command: SetIntegrationEnabledCommand,
  ): Promise<MutationResult<IntegrationConfig>>
  recordCheck(
    id: string,
    command: RecordIntegrationCheckCommand,
  ): Promise<MutationResult<IntegrationConfig>>
}
