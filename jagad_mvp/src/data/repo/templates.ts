/**
 * Message templates, as the templates config screen edits them — plan §8
 * ("Configuration": Template), canvas flow 6.
 *
 * The `MessageTemplate` type itself lives in `./config` beside `MessageLog`,
 * which references its key and its channel; this file is the cluster's write
 * surface, because flow 6's promise — "the whole system is configuration, not
 * code" — only holds if an admin can actually change the words a customer
 * receives without a deployment.
 *
 * Two fields are worth reading rather than skimming. `recipeKey` names the
 * automation that fires this template, so the pair is navigable in both
 * directions: a recipe's `parameters.templateKey` says what it sends, and this
 * says what sends it. `version` behaves as `Recipe.version` does — an edit
 * publishes a new version, so the wording that went out last Monday is not
 * rewritten by a change made this Tuesday.
 *
 * §9 gives a template no machine, and `active` is a flag rather than a workflow
 * state, so nothing here assigns a status behind a machine's back.
 */

import type { MessageChannel, MessageTemplate } from './config'
import type { ReadRepository } from './query'
import type { MutationResult } from './result'

export type CreateMessageTemplateCommand = {
  readonly actorId: string
  /** The key a recipe names when it fires this template. Unique across templates. */
  readonly key: string
  readonly label: string
  readonly channel: MessageChannel
  /** Email only; WhatsApp and SMS carry no subject line. */
  readonly subject?: string | null
  readonly body: string
  readonly recipeKey?: string | null
  readonly updatedBy: string
  readonly now?: Date
}

/** An edit. The key never moves, because logs and recipes point at it. */
export type SaveMessageTemplateCommand = {
  readonly actorId: string
  readonly label?: string
  readonly channel?: MessageChannel
  readonly subject?: string | null
  readonly body?: string
  readonly recipeKey?: string | null
  readonly updatedBy: string
  readonly now?: Date
}

export type SetMessageTemplateActiveCommand = {
  readonly actorId: string
  readonly active: boolean
  readonly updatedBy: string
  readonly now?: Date
}

export type MessageTemplateRepository = ReadRepository<MessageTemplate> & {
  byKey(key: string): Promise<MessageTemplate | null>
  forChannel(channel: MessageChannel): Promise<readonly MessageTemplate[]>
  /** Every template one recipe can fire. The config screen groups on this. */
  forRecipe(recipeKey: string): Promise<readonly MessageTemplate[]>

  create(command: CreateMessageTemplateCommand): Promise<MutationResult<MessageTemplate>>
  /** Publishes the edit as the next version; the previous wording stays quoted in the log. */
  save(id: string, command: SaveMessageTemplateCommand): Promise<MutationResult<MessageTemplate>>
  setActive(
    id: string,
    command: SetMessageTemplateActiveCommand,
  ): Promise<MutationResult<MessageTemplate>>
}
