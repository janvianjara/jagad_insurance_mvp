import { useState } from 'react'
import { MESSAGE_CHANNELS } from '../../../data/repo'
import type { MessageChannel, MessageTemplate, Recipe } from '../../../data/repo'
import type { ConfirmChange } from '../../../components/guardrails'
import { Field, Input, Select, Textarea } from '../../../ui/form'
import { Badge } from '../../../ui/signal'
import { DateTime, KeyValueList } from '../../../ui/type'
import { GatedAction } from '../shared'
import { CHANNEL_LABEL } from './templates-queue'
import styles from './templates.module.css'

export type TemplateDrawerProps = {
  template: MessageTemplate
  recipes: readonly Recipe[]
  authorName: string
  canEdit: boolean
  onSave: (draft: TemplateDraft) => void
  onSetActive: (active: boolean) => void
}

export type TemplateDraft = {
  readonly label: string
  readonly channel: MessageChannel
  readonly subject: string | null
  readonly body: string
  readonly recipeKey: string | null
}

/** The placeholders the seeded templates use, offered rather than validated. */
function tokensIn(body: string): readonly string[] {
  return [...body.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1])
}

/**
 * One template, edited — canvas flow 6, "the whole system is configuration, not
 * code".
 *
 * Two rules are visible here rather than merely enforced underneath. The key
 * never moves: recipes point at it and every message log quotes it, so it is
 * shown and not editable. And saving publishes the next version rather than
 * rewriting the wording that already went out — which is why the gate's preview
 * names the version it is about to create before anything is written.
 *
 * A subject line exists only on email. WhatsApp and SMS carry none, so the field
 * is absent rather than disabled on those channels, and switching a template to
 * one of them drops the subject it was holding.
 */
export function TemplateDrawer({
  template,
  recipes,
  authorName,
  canEdit,
  onSave,
  onSetActive,
}: TemplateDrawerProps) {
  const [label, setLabel] = useState(template.label)
  const [channel, setChannel] = useState<MessageChannel>(template.channel)
  const [subject, setSubject] = useState(template.subject ?? '')
  const [body, setBody] = useState(template.body)
  const [recipeKey, setRecipeKey] = useState(template.recipeKey ?? '')

  const carriesSubject = channel === MESSAGE_CHANNELS.email
  const draft: TemplateDraft = {
    label: label.trim(),
    channel,
    subject: carriesSubject && subject.trim() !== '' ? subject.trim() : null,
    body,
    recipeKey: recipeKey === '' ? null : recipeKey,
  }

  const recipeLabel = (key: string | null) =>
    key === null ? 'sent by hand' : (recipes.find((recipe) => recipe.key === key)?.label ?? key)

  const changes: readonly ConfirmChange[] = [
    ...(draft.label === template.label
      ? []
      : [{ key: 'label', label: 'Name', from: template.label, to: draft.label }]),
    ...(draft.channel === template.channel
      ? []
      : [
          {
            key: 'channel',
            label: 'Channel',
            from: CHANNEL_LABEL[template.channel],
            to: CHANNEL_LABEL[draft.channel],
          },
        ]),
    ...(draft.subject === template.subject
      ? []
      : [
          {
            key: 'subject',
            label: 'Subject',
            from: template.subject ?? 'none',
            to: draft.subject ?? 'none — this channel carries no subject',
          },
        ]),
    ...(draft.body === template.body
      ? []
      : [{ key: 'body', label: 'Wording', from: 'the version below', to: 'what is in the box now' }]),
    ...(draft.recipeKey === template.recipeKey
      ? []
      : [
          {
            key: 'recipe',
            label: 'Fired by',
            from: recipeLabel(template.recipeKey),
            to: recipeLabel(draft.recipeKey),
          },
        ]),
  ]

  const versionChange: ConfirmChange = {
    key: 'version',
    label: 'Version',
    from: `v${template.version}`,
    to: `v${template.version + 1}`,
  }

  return (
    <div className={styles.drawer}>
      <KeyValueList
        columns={2}
        items={[
          { key: 'key', label: 'Key', value: <span className={styles.key}>{template.key}</span> },
          { key: 'version', label: 'Live version', value: `v${template.version}` },
          {
            key: 'updated',
            label: 'Last saved',
            value: <DateTime value={template.updatedAt} mode="datetime" />,
          },
          { key: 'by', label: 'Saved by', value: authorName },
        ]}
      />

      <p className={styles.prose}>
        The key never moves. Recipes name it to fire this template and every message log quotes it,
        so renaming it would orphan both. Change the wording instead — an edit publishes the next
        version and leaves what already went out exactly as it was sent.
      </p>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>What it says</h3>

        <Field label="Name">
          <Input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            disabled={!canEdit}
            autoComplete="off"
          />
        </Field>

        <Field label="Channel" hint="Only email carries a subject line.">
          <Select
            value={channel}
            options={Object.values(MESSAGE_CHANNELS).map((value) => ({
              value,
              label: CHANNEL_LABEL[value],
            }))}
            disabled={!canEdit}
            onChange={(event) => setChannel(event.target.value as MessageChannel)}
          />
        </Field>

        {carriesSubject ? (
          <Field label="Subject">
            <Input
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              disabled={!canEdit}
              autoComplete="off"
            />
          </Field>
        ) : null}

        <Field
          label="Body"
          hint="Placeholders in double braces are filled from the record the message is about."
        >
          <Textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            disabled={!canEdit}
            rows={5}
            className={styles.body}
          />
        </Field>

        <div className={styles.tokens}>
          {tokensIn(body).map((token) => (
            <Badge key={token} tone="neutral">
              {token}
            </Badge>
          ))}
        </div>

        <Field label="Fired by" hint="The automation that sends it. Left empty, somebody sends it by hand.">
          <Select
            value={recipeKey}
            placeholder="Nothing — sent by hand"
            options={recipes.map((recipe) => ({ value: recipe.key, label: recipe.label }))}
            disabled={!canEdit}
            onChange={(event) => setRecipeKey(event.target.value)}
          />
        </Field>
      </section>

      <div className={styles.actions}>
        <GatedAction
          label="Save template"
          title={`Publish ${template.key} as v${template.version + 1}`}
          variant="primary"
          size="md"
          disabled={!canEdit || changes.length === 0 || draft.label === '' || draft.body.trim() === ''}
          changes={changes.length === 0 ? [] : [...changes, versionChange]}
          note="Saving publishes a new version. Messages already sent keep the wording they were sent with, and the log still quotes it."
          confirmLabel="Publish the new version"
          receipt="Published. The next message on this template uses the new wording."
          toast={{ title: `${template.key} published as v${template.version + 1}` }}
          onConfirm={() => onSave(draft)}
        />

        <GatedAction
          label={template.active ? 'Deactivate' : 'Activate'}
          title={`${template.active ? 'Deactivate' : 'Activate'} ${template.key}`}
          disabled={!canEdit}
          changes={[
            {
              key: 'active',
              label: 'Status',
              from: template.active ? 'Active' : 'Inactive',
              to: template.active ? 'Inactive' : 'Active',
            },
          ]}
          note={
            template.active
              ? 'A deactivated template is not sent by its recipe. The recipe still runs; it simply has nothing to send.'
              : 'Activating it means the recipe that names it starts sending it again.'
          }
          receipt="Done. The change applies to the next message."
          onConfirm={() => onSetActive(!template.active)}
        />
      </div>
    </div>
  )
}
