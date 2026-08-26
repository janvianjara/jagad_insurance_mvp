/**
 * Configuration and identity — plan §8, clusters "Identity" and "Configuration".
 *
 * Canvas flow 6 states the requirement as a sentence: "the whole system is
 * configuration, not code." Everything an admin changes on that flow lives here —
 * masters, form schemas, recipes, message templates, retention classes, staff
 * users and their teams — and every one of them is data a repository serves, not
 * a constant a developer edits.
 *
 * Two things deliberately have versions: `FormSchema`, because §8 requires an old
 * record to keep rendering under the schema it was captured with, and `Recipe`,
 * because a TAT that changed last Tuesday must not rewrite what happened last
 * Monday.
 */

import type { StarterTemplateKey } from '../../domain/permissions'
import type { ReadRepository } from './query'

/** A staff account. The permission template is referenced by key, never inlined. */
export type StaffUser = {
  readonly id: string
  readonly name: string
  readonly email: string
  readonly mobile: string
  /** Names a row in the template library; P-10a lets an admin clone and edit those. */
  readonly templateKey: StarterTemplateKey | string
  readonly teamId: string | null
  /** Set when this user is also a channel agent or sub-agent. */
  readonly agentId: string | null
  readonly parentAgentId: string | null
  /** Which inquiry categories this person can be routed work from (flow 1). */
  readonly categoryIds: readonly string[]
  readonly roleLabel: string
  readonly active: boolean
}

export type Team = {
  readonly id: string
  readonly name: string
  readonly leadUserId: string
  readonly memberUserIds: readonly string[]
}

/**
 * An inquiry category, which is also the routing group. §9 requires reassignment
 * to stay inside the group, so the group and the category are one record rather
 * than two that can drift apart.
 */
export type InquiryCategory = {
  readonly id: string
  readonly key: string
  readonly label: string
  readonly line: string
  readonly teamId: string
  /** The §9 TAT parameter. It lives on the routing recipe's category, never in code. */
  readonly tatMinutes: number
  readonly memberUserIds: readonly string[]
}

export type MasterType = {
  readonly id: string
  readonly key: string
  readonly label: string
  /** False for the handful the platform's own logic reads by key. */
  readonly editable: boolean
}

export type MasterValue = {
  readonly id: string
  readonly masterTypeId: string
  readonly key: string
  readonly label: string
  readonly sortOrder: number
  readonly active: boolean
}

/** §9's retention classes. The years come from here; no module hard-codes ten. */
export type RetentionClass = {
  readonly id: string
  readonly key: string
  readonly label: string
  readonly years: number
}

export const FORM_FIELD_KINDS = {
  text: 'text',
  number: 'number',
  money: 'money',
  date: 'date',
  select: 'select',
  boolean: 'boolean',
  file: 'file',
} as const

export type FormFieldKind = (typeof FORM_FIELD_KINDS)[keyof typeof FORM_FIELD_KINDS]

export type FormFieldDef = {
  readonly key: string
  readonly label: string
  readonly kind: FormFieldKind
  readonly required: boolean
  /** Conditional visibility, canvas 6.2. Absent means always shown. */
  readonly visibleWhen: { readonly field: string; readonly equals: string } | null
  readonly masterTypeId: string | null
}

export type FormStage = {
  readonly key: string
  readonly label: string
  readonly fields: readonly FormFieldDef[]
}

/**
 * A stored SKU form. `productId` null means the fallback schema for the object;
 * a product-specific schema wins. Records pin `schemaVersion`, which is what lets
 * canvas 6.2's "old records keep their original schema" actually hold.
 */
export type FormSchema = {
  readonly id: string
  readonly objectKey: string
  readonly productId: string | null
  readonly version: number
  readonly stages: readonly FormStage[]
  readonly publishedAt: string
  readonly active: boolean
}

export type RecipeParameters = Readonly<Record<string, string | number | boolean>>

/**
 * An automation rule. The trigger is a P-02 event name, so a recipe is literally
 * a subscriber on the bus, and the parameters an admin edits (TAT minutes,
 * renewal lead days, auto-share) are the values the guards read.
 */
export type Recipe = {
  readonly id: string
  readonly key: string
  readonly label: string
  readonly version: number
  readonly trigger: string
  readonly parameters: RecipeParameters
  readonly active: boolean
  readonly updatedAt: string
}

export const MESSAGE_CHANNELS = {
  whatsapp: 'whatsapp',
  sms: 'sms',
  email: 'email',
} as const

export type MessageChannel = (typeof MESSAGE_CHANNELS)[keyof typeof MESSAGE_CHANNELS]

export type MessageTemplate = {
  readonly id: string
  readonly key: string
  readonly label: string
  readonly channel: MessageChannel
  readonly subject: string | null
  readonly body: string
  readonly active: boolean
}

export const MESSAGE_STATES = {
  queued: 'queued',
  sent: 'sent',
  failed: 'failed',
} as const

export type MessageState = (typeof MESSAGE_STATES)[keyof typeof MESSAGE_STATES]

/** Proof that the outward message a scenario promises actually went. */
export type MessageLog = {
  readonly id: string
  readonly templateKey: string
  readonly channel: MessageChannel
  readonly toName: string
  readonly toAddress: string
  readonly subjectEntity: string
  readonly subjectId: string
  readonly sentAt: string
  readonly state: MessageState
}

export type ConfigRepository = {
  users(): Promise<readonly StaffUser[]>
  user(id: string): Promise<StaffUser | null>
  teams(): Promise<readonly Team[]>
  categories(): Promise<readonly InquiryCategory[]>
  masterTypes(): Promise<readonly MasterType[]>
  masterValues(masterTypeKey: string): Promise<readonly MasterValue[]>
  retentionClasses(): Promise<readonly RetentionClass[]>
  /** The schema a record renders under: the pinned version, or the live one. */
  formSchema(objectKey: string, productId?: string, version?: number): Promise<FormSchema | null>
  formSchemas(): Promise<readonly FormSchema[]>
  recipes(): Promise<readonly Recipe[]>
  recipe(key: string): Promise<Recipe | null>
  templates(): Promise<readonly MessageTemplate[]>
  messages(subjectEntity: string, subjectId: string): Promise<readonly MessageLog[]>
}

export type MessageLogRepository = ReadRepository<MessageLog>
