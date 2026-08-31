import { useState } from 'react'
import { useRepositories } from '../../../app/repositories-context'
import { useSessionStore } from '../../../app/store'
import { ConfirmGate } from '../../../components/guardrails'
import { MESSAGE_CHANNELS } from '../../../data/repo'
import type { MessageChannel, Recipe } from '../../../data/repo'
import { Button } from '../../../ui/Button'
import { Field, Input, Select, Textarea } from '../../../ui/form'
import { Modal, useToaster } from '../../../ui/surface'
import { CHANNEL_LABEL } from './templates-queue'
import styles from './templates.module.css'

export type NewTemplateDialogProps = {
  recipes: readonly Recipe[]
  onCreated: () => void
}

/** A new template starts at v1 and active, which is what `create` writes. */
export function NewTemplateDialog({ recipes, onCreated }: NewTemplateDialogProps) {
  const repositories = useRepositories()
  const toaster = useToaster()
  const user = useSessionStore((state) => state.user)

  const [open, setOpen] = useState(false)
  const [key, setKey] = useState('')
  const [label, setLabel] = useState('')
  const [channel, setChannel] = useState<MessageChannel>(MESSAGE_CHANNELS.whatsapp)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [recipeKey, setRecipeKey] = useState('')
  const [refusal, setRefusal] = useState<string | null>(null)

  const carriesSubject = channel === MESSAGE_CHANNELS.email
  const ready = key.trim() !== '' && label.trim() !== '' && body.trim() !== ''

  function close() {
    setOpen(false)
    setRefusal(null)
  }

  async function create() {
    if (!user) return
    const outcome = await repositories.templates.create({
      actorId: user.id,
      key: key.trim(),
      label: label.trim(),
      channel,
      subject: carriesSubject && subject.trim() !== '' ? subject.trim() : null,
      body,
      recipeKey: recipeKey === '' ? null : recipeKey,
      updatedBy: user.id,
    })

    if (!outcome.ok) {
      setRefusal(outcome.reason)
      return
    }

    close()
    onCreated()
    toaster.notify({ title: `${outcome.record.key} added at v1`, tone: 'ok' })
  }

  return (
    <>
      <Button variant="primary" icon="plus" onClick={() => setOpen(true)}>
        New template
      </Button>

      <Modal
        open={open}
        onClose={close}
        title="Add a message template"
        description="The words a customer receives, and the automation that sends them."
        dismissOnScrimClick={false}
      >
        <div className={styles.dialog}>
          <Field label="Key" required hint="What a recipe names to fire it. It never changes afterwards.">
            <Input value={key} onChange={(event) => setKey(event.target.value)} autoComplete="off" />
          </Field>

          <Field label="Name" required>
            <Input value={label} onChange={(event) => setLabel(event.target.value)} autoComplete="off" />
          </Field>

          <Field label="Channel" required>
            <Select
              value={channel}
              options={Object.values(MESSAGE_CHANNELS).map((value) => ({
                value,
                label: CHANNEL_LABEL[value],
              }))}
              onChange={(event) => setChannel(event.target.value as MessageChannel)}
            />
          </Field>

          {carriesSubject ? (
            <Field label="Subject">
              <Input
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                autoComplete="off"
              />
            </Field>
          ) : null}

          <Field label="Body" required>
            <Textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={4}
              className={styles.body}
            />
          </Field>

          <Field label="Fired by">
            <Select
              value={recipeKey}
              placeholder="Nothing — sent by hand"
              options={recipes.map((recipe) => ({ value: recipe.key, label: recipe.label }))}
              onChange={(event) => setRecipeKey(event.target.value)}
            />
          </Field>

          {refusal === null ? null : (
            <p className={styles.refusal} role="alert">
              {refusal}
            </p>
          )}

          <ConfirmGate
            title="Add this template"
            changes={
              ready
                ? [
                    { key: 'key', label: 'Key', to: key.trim() },
                    { key: 'label', label: 'Name', to: label.trim() },
                    { key: 'channel', label: 'Channel', to: CHANNEL_LABEL[channel] },
                    {
                      key: 'recipe',
                      label: 'Fired by',
                      to:
                        recipeKey === ''
                          ? 'nothing — sent by hand'
                          : (recipes.find((recipe) => recipe.key === recipeKey)?.label ?? recipeKey),
                    },
                    { key: 'version', label: 'Version', to: 'v1' },
                  ]
                : []
            }
            confirmLabel="Add the template"
            receipt="Added at v1, and active."
            note="A new template is active straight away. Nothing is sent until the recipe that names it fires."
            onCancel={close}
            onConfirm={() => void create()}
          />
        </div>
      </Modal>
    </>
  )
}
