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

/**
 * The engagement stages an inquiry moves through inside `accepted` — FR-06.12.
 *
 * These are configuration and not machine states, which is a deliberate split.
 * The lifecycle machine in `src/domain/workflows/inquiry.ts` still owns
 * new → assigned → accepted → converted/lost and its TAT chain; a stage is a
 * position *inside* `accepted`, and an agency that works its pipeline
 * differently edits rows here rather than waiting for a release.
 *
 * The cost of that choice is that the compiler no longer proves a stage move is
 * legal, so the rules travel with the data — `allowedFromKeys` is the adjacency
 * a transition table would have held — and `canEnterStage` in
 * `src/domain/workflows/inquiryStage.ts` is the single place that reads them.
 */
export type InquiryStage = {
  readonly id: string
  readonly key: string
  readonly label: string
  /** Stages this one may be entered from. Empty means "from any stage". */
  readonly allowedFromKeys: readonly string[]
  /** Leaving this stage demands a dated next action (FR-06.15). */
  readonly requiresNextAction: boolean
  /** Counts towards "open inquiries" in the pipeline and the next-action KPI. */
  readonly countsAsOpen: boolean
  /** No stage follows this one; the inquiry is closed or parked. */
  readonly terminal: boolean
  /**
   * This stage is where a cold lead is parked, so the win-back list is the
   * inquiries sitting in it. A flag rather than a well-known key, because
   * stages are rows an admin edits: an agency that calls it "Cold storage"
   * still has a win-back list, and one that retires the row has none rather
   * than a query that silently returns nothing.
   */
  readonly parksTheLead: boolean
  readonly sortOrder: number
  readonly active: boolean
}

/**
 * What came of one contact — FR-06.14, and the engine of the whole engagement
 * layer.
 *
 * Logging an activity forces one of these, and the row itself decides what the
 * system does next: which stage the inquiry lands in, whether a next action is
 * owed, whether the attempt counter moves, which template to offer and how soon
 * to retry. That is why it is a record and not a switch statement — the seven
 * seeded rows are the agency's current vocabulary, not the platform's.
 *
 * `defaultRetryMinutes` follows §9's rule about the TAT exactly: the interval is
 * a parameter on the row, and no module holds a default of its own.
 */
export type Disposition = {
  readonly id: string
  readonly key: string
  readonly label: string
  /** The channels this outcome can be recorded against. Empty means all. */
  readonly channelKeys: readonly string[]
  /** The stage the inquiry moves to. Null leaves the stage where it is. */
  readonly stageKey: string | null
  readonly requiresNextAction: boolean
  /** Lost needs a reason. FR-06.10 said so already; this keeps it true here. */
  readonly requiresReason: boolean
  readonly incrementsAttempt: boolean
  /** Offered to the person logging it, never sent on their behalf. */
  readonly suggestedTemplateKey: string | null
  /** How far out to date the retry this disposition proposes. */
  readonly defaultRetryMinutes: number | null
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

/**
 * The words a customer receives. Edited on the templates config screen through
 * `MessageTemplateRepository` in `./templates`.
 *
 * `version` is here for the reason `Recipe.version` is: an edit publishes a new
 * version rather than rewriting what already went out. `recipeKey` names the
 * automation that fires this template, which makes the pair navigable in both
 * directions — a recipe's `parameters.templateKey` says what it sends.
 */
export type MessageTemplate = {
  readonly id: string
  readonly key: string
  readonly label: string
  readonly channel: MessageChannel
  /** Email only. WhatsApp and SMS carry no subject line. */
  readonly subject: string | null
  readonly body: string
  /** The recipe that fires it. Null for a template only a person sends by hand. */
  readonly recipeKey: string | null
  readonly version: number
  readonly active: boolean
  readonly updatedAt: string
  readonly updatedBy: string
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
  /** The engagement vocabulary and the stages it moves inquiries between. */
  dispositions(): Promise<readonly Disposition[]>
  inquiryStages(): Promise<readonly InquiryStage[]>
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
