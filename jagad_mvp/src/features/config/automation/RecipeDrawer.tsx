/**
 * One recipe's parameters — the P1 half of `/config/automation`.
 *
 * The trigger and the key are shown and never edited. A recipe that changed
 * which event it subscribes to would be a different recipe, and every record
 * already written names this one; the visual builder that would let somebody
 * rewire triggers is P3, and pretending otherwise here would be a screen making
 * a promise the platform has not made.
 *
 * What is editable is the part an agency actually changes: how long a TAT
 * allows, who a lapse escalates to, how many days ahead a renewal opens, which
 * channel a notice goes on. Each carries the sentence naming the screen that
 * reads it, so nobody has to guess whether a change will be felt.
 */

import { useState } from 'react'
import { Button } from '../../../ui/Button'
import { Field, FormSection, Input, NumberInput, Select, Toggle } from '../../../ui/form'
import { Badge, StatusPill } from '../../../ui/signal'
import { DateTime } from '../../../ui/type'
import { MESSAGE_CHANNELS } from '../../../data/repo'
import type { Recipe, RecipeParameters } from '../../../data/repo'
import { GatedAction, useConfigStore } from '../shared'
import { useAutomationStore } from './automation-store'
import {
  PARAMETER_KINDS,
  PARAMETER_UNITS,
  RECIPE_NOTES,
  UNREAD_NOTE,
  channelLabel,
  parameterKind,
  parameterLabel,
} from './recipe-readers'
import type { RecipeActivity } from './run-stats'
import layout from '../shared/config-layout.module.css'
import styles from './automation.module.css'

const ROUTING_RECIPE_KEY = 'inquiry.routing'

function readValue(
  parameters: RecipeParameters,
  key: string,
): RecipeParameters[string] {
  return parameters[key]
}

export function RecipeDrawer({
  recipe,
  activity,
}: {
  recipe: Recipe
  /** What it has actually done, from the run ledger. See `run-stats.ts`. */
  activity: RecipeActivity
}) {
  const saveParameters = useAutomationStore((state) => state.saveParameters)
  const setRecipeActive = useAutomationStore((state) => state.setRecipeActive)
  const templates = useAutomationStore((state) => state.templates)

  const users = useConfigStore((state) => state.users)
  const categories = useConfigStore((state) => state.categories)

  const [draft, setDraft] = useState<RecipeParameters>(recipe.parameters)

  const keys = Object.keys(recipe.parameters)
  const changedKeys = keys.filter((key) => draft[key] !== recipe.parameters[key])
  const notes = RECIPE_NOTES[recipe.key]

  function display(key: string, value: RecipeParameters[string]): string {
    const kind = parameterKind(key, recipe.parameters[key])
    if (kind === PARAMETER_KINDS.user) {
      return users.find((user) => user.id === value)?.name ?? String(value)
    }
    if (kind === PARAMETER_KINDS.channel) return channelLabel(String(value))
    if (kind === PARAMETER_KINDS.template) {
      return templates.find((template) => template.key === value)?.label ?? String(value)
    }
    if (kind === PARAMETER_KINDS.flag) return value === true ? 'Yes' : 'No'
    const unit = PARAMETER_UNITS[kind]
    return unit ? `${value} ${unit}` : String(value)
  }

  function set(key: string, value: RecipeParameters[string]) {
    setDraft({ ...draft, [key]: value })
  }

  return (
    <div className={styles.drawer}>
      <FormSection
        title="The rule"
        description="A recipe subscribes to one event and does one thing when it happens. The event it listens for is fixed here; what it does with it is the parameters below."
      >
        <div className={styles.chips}>
          <StatusPill tone={recipe.active ? 'ok' : 'idle'} size="sm">
            {recipe.active ? 'Running' : 'Stopped'}
          </StatusPill>
          <Badge tone="neutral" caps>
            {recipe.trigger}
          </Badge>
          <span className={layout.mono}>{`${recipe.key} · version ${recipe.version}`}</span>
        </div>

        <p className={styles.hint}>{notes?.effect ?? 'Configured ahead of the step that runs it.'}</p>
        <p className={layout.muted}>
          {'Last changed '}
          <DateTime value={recipe.updatedAt} mode="datetime" />
          {'. Editing a parameter publishes a new version rather than rewriting this one, so what ran last week stays answerable for.'}
        </p>
      </FormSection>

      {/* -------------------------------------------------- what it has done */}
      <FormSection
        title="What it has done"
        description="From the run ledger, which records every evaluation this recipe has made — including the ones that decided not to act. FR-21.5 asks that an automated action trace back to a recipe and a trigger; these are this recipe's."
      >
        {activity.total === 0 ? (
          <p className={styles.hint}>
            {recipe.active
              ? 'It is subscribed and has not been reached yet. Nothing has happened that matches its trigger since the engine started; the run log will show it the moment something does.'
              : 'It is stopped, so nothing reaches it. Anything it did before it was stopped is still in the run log.'}
          </p>
        ) : (
          <>
            <div className={styles.chips}>
              <Badge tone="ok">{`${activity.fired} fired`}</Badge>
              {activity.skipped === 0 ? null : (
                <Badge tone="attn">{`${activity.skipped} declined`}</Badge>
              )}
              {activity.refused === 0 ? null : (
                <Badge tone="bad">{`${activity.refused} refused`}</Badge>
              )}
            </div>
            <p className={layout.muted}>
              {activity.lastFiredAt === null ? (
                'It has been reached and has never once fired — every run declined or was refused.'
              ) : (
                <>
                  {'Last fired '}
                  <DateTime value={activity.lastFiredAt} mode="datetime" />
                  {'.'}
                </>
              )}
            </p>
            {activity.lastDeclineReason === null ? null : (
              <p className={styles.reader}>
                <span className={styles.readerWhere}>Most recent decline</span>
                {activity.lastDeclineReason}
              </p>
            )}
          </>
        )}
      </FormSection>

      {/* ------------------------------------------------------- parameters */}
      <FormSection
        title="Parameters"
        description="The numbers and names the rule reads when it fires. Nothing here is a default the platform invented — every one of them came from the agency."
      >
        <ul className={styles.rows} aria-label="Parameters">
          {keys.map((key) => {
            const kind = parameterKind(key, recipe.parameters[key])
            const value = readValue(draft, key)
            const reader = notes?.readers.find((entry) => entry.parameter === key) ?? null

            return (
              <li className={styles.parameter} key={key} data-parameter={key}>
                <div className={styles.parameterHead}>
                  <span className={layout.mono}>{key}</span>
                  {changedKeys.includes(key) ? <Badge tone="warn">Changed</Badge> : null}
                </div>

                {kind === PARAMETER_KINDS.flag ? (
                  <Toggle
                    checked={value === true}
                    label={parameterLabel(key)}
                    onCheckedChange={(checked) => set(key, checked)}
                  />
                ) : kind === PARAMETER_KINDS.user ? (
                  <Field label={parameterLabel(key)}>
                    <Select
                      value={String(value)}
                      placeholder="Nobody named"
                      options={users
                        .filter((user) => user.active)
                        .map((user) => ({ value: user.id, label: `${user.name} · ${user.roleLabel}` }))}
                      onChange={(event) => set(key, event.target.value)}
                    />
                  </Field>
                ) : kind === PARAMETER_KINDS.channel ? (
                  <Field label={parameterLabel(key)}>
                    <Select
                      value={String(value)}
                      options={Object.values(MESSAGE_CHANNELS).map((channel) => ({
                        value: channel,
                        label: channelLabel(channel),
                      }))}
                      onChange={(event) => set(key, event.target.value)}
                    />
                  </Field>
                ) : kind === PARAMETER_KINDS.template ? (
                  <Field label={parameterLabel(key)}>
                    <Select
                      value={String(value)}
                      options={templates.map((template) => ({
                        value: template.key,
                        label: template.label,
                      }))}
                      onChange={(event) => set(key, event.target.value)}
                    />
                  </Field>
                ) : typeof recipe.parameters[key] === 'number' ? (
                  <Field label={parameterLabel(key)}>
                    <NumberInput
                      value={typeof value === 'number' ? value : null}
                      unit={PARAMETER_UNITS[kind]}
                      min={0}
                      onValueChange={(next) => set(key, next ?? 0)}
                    />
                  </Field>
                ) : (
                  <Field label={parameterLabel(key)}>
                    <Input value={String(value)} onChange={(event) => set(key, event.target.value)} />
                  </Field>
                )}

                <p className={styles.reader} data-unread={reader ? undefined : ''}>
                  <span className={styles.readerWhere}>{reader ? reader.where : 'Not read yet'}</span>
                  {reader ? reader.sentence : UNREAD_NOTE}
                </p>
              </li>
            )
          })}
        </ul>

        <div className={layout.rowActions}>
          <GatedAction
            label="Save parameters"
            variant="primary"
            title={`Save "${recipe.label}"`}
            disabled={changedKeys.length === 0}
            changes={changedKeys.map((key) => ({
              key,
              label: parameterLabel(key),
              from: display(key, recipe.parameters[key]),
              to: display(key, draft[key]),
            }))}
            note={`Version ${recipe.version + 1} takes effect on the next ${recipe.trigger}. Everything this recipe has already done stays recorded under the version that did it.`}
            confirmLabel="Save"
            toast={{ title: 'Parameters saved', detail: recipe.label }}
            onConfirm={() => saveParameters(recipe.id, draft)}
          />
          <Button
            type="button"
            variant="quiet"
            size="sm"
            disabled={changedKeys.length === 0}
            onClick={() => setDraft(recipe.parameters)}
          >
            Discard changes
          </Button>
        </div>
      </FormSection>

      {/* --------------------------- the TAT the inquiry desk actually reads */}
      {recipe.key === ROUTING_RECIPE_KEY ? (
        <FormSection
          title="The allowance each category is measured against"
          description="This is the same figure /inquiries renders its TAT clock against — held per routing group, so Health and Travel can differ. §9 forbids a constant anywhere else, which is why a category with no allowance shows no clock rather than a guessed one."
        >
          <ul className={styles.categories} aria-label="Category allowances">
            {categories.map((category) => (
              <li
                className={styles.category}
                key={category.id}
                data-category={category.key}
                data-unset={category.tatMinutes > 0 ? undefined : ''}
              >
                <span>{category.label}</span>
                <span className={layout.mono}>
                  {category.tatMinutes > 0 ? `${category.tatMinutes} minutes` : 'No allowance set'}
                </span>
              </li>
            ))}
          </ul>
        </FormSection>
      ) : null}

      {/* --------------------------------------------------------- running */}
      <FormSection
        title="Running"
        description="A stopped recipe does nothing when its event fires. Everything it has already done stays recorded."
      >
        <div className={styles.chips}>
          <GatedAction
            label={recipe.active ? 'Stop this recipe' : 'Start this recipe'}
            title={`${recipe.active ? 'Stop' : 'Start'} "${recipe.label}"`}
            changes={[
              {
                key: 'active',
                label: recipe.label,
                from: recipe.active ? 'Running' : 'Stopped',
                to: recipe.active ? 'Stopped' : 'Running',
              },
            ]}
            note={
              recipe.active
                ? `Nothing will happen on ${recipe.trigger} until it is started again. Anything this rule already did is untouched.`
                : `It fires on the next ${recipe.trigger}. Events that happened while it was stopped are not replayed.`
            }
            confirmLabel={recipe.active ? 'Stop' : 'Start'}
            toast={{ title: `"${recipe.label}" is ${recipe.active ? 'stopped' : 'running'}` }}
            onConfirm={() => setRecipeActive(recipe.id, !recipe.active)}
          />
        </div>
      </FormSection>
    </div>
  )
}
