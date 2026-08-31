import { useState } from 'react'
import { EmptyState } from '../../../ui/data'
import { Badge, StatusPill } from '../../../ui/signal'
import { DateTime } from '../../../ui/type'
import { Button } from '../../../ui/Button'
import { Field, Input } from '../../../ui/form'
import { useToaster } from '../../../ui/surface'
import type { AutomationRuntime, StagedMessage } from '../../../data/automation'
import { GatedAction } from '../shared'
import { channelLabel } from './recipe-readers'
import { useAutomationNow } from './clock'
import { useStagedMessages } from './use-runs'
import layout from '../shared/config-layout.module.css'
import styles from './automation.module.css'

/**
 * Ready to send — where the engine's outward work waits for a person.
 *
 * The constitution says every outward mutation goes through `<ConfirmGate>` and
 * that cancel writes nothing. FR-21 says the platform sends the renewal reminder
 * by itself. Both cannot be true of one act, so the engine splits it: it
 * PREPARES, and a person RELEASES. This is that person's screen.
 *
 * Everything about a row was decided by the engine — recipient, channel,
 * template, the record it is about, the recipe and run that produced it — and
 * the only thing left is the decision a human owes: send it, or say why not. A
 * discard writes nothing outward and keeps the reason on the row, because a
 * customer who was going to be told something and now will not be is a decision
 * somebody has to be able to read later.
 *
 * A row prepared inside quiet hours carries the instant it may go, and Release
 * is refused until then. The hold binds a person exactly as it binds the engine;
 * quiet hours that only stop the automation are not quiet hours.
 */

function heldUntil(row: StagedMessage, now: Date): boolean {
  return row.releaseAfter !== null && now.getTime() < new Date(row.releaseAfter).getTime()
}

export type ReadyToSendProps = {
  readonly runtime: AutomationRuntime | null
  readonly actorId: string
  readonly onChanged: () => void
}

export function ReadyToSend({ runtime, actorId, onChanged }: ReadyToSendProps) {
  const staged = useStagedMessages(runtime)
  const now = useAutomationNow()
  const toaster = useToaster()
  const [discarding, setDiscarding] = useState<string | null>(null)
  const [reason, setReason] = useState('')

  if (runtime === null) {
    return (
      <div className={layout.body}>
        <EmptyState
          title="The engine is not running on this page"
          explanation="Prepared messages live in the running engine rather than in a repository, so there is nothing to show without one. This is what a test sees; in the app the engine starts with the data layer."
        />
      </div>
    )
  }

  const waiting = staged.filter((row) => row.state === 'staged')

  function release(row: StagedMessage) {
    const result = runtime?.outbox.release(row.id, { actorId, now })
    if (result === undefined) return
    toaster.notify(
      result.ok
        ? { title: 'Sent', detail: `${row.toName} on ${channelLabel(row.channel)}`, tone: 'ok' }
        : { title: 'Not sent', detail: result.reason, tone: 'bad' },
    )
    onChanged()
  }

  function discard(row: StagedMessage) {
    const result = runtime?.outbox.discard(row.id, { actorId, reason, now })
    if (result === undefined) return
    if (!result.ok) {
      toaster.notify({ title: 'Not cancelled', detail: result.reason, tone: 'bad' })
      return
    }
    setDiscarding(null)
    setReason('')
    toaster.notify({ title: 'Cancelled', detail: `Nothing was sent to ${row.toName}.` })
    onChanged()
  }

  return (
    <div className={layout.body}>
      <p className={styles.hint}>
        {
          'The engine prepares an outward message and stops. Everything below was decided by a recipe — who it is for, which template, which channel — and none of it has been sent. A person releases it through the same gate a message they wrote themselves would pass.'
        }
      </p>

      {waiting.length === 0 ? (
        <EmptyState
          title="Nothing is waiting to go out"
          explanation="A row appears here when a recipe whose effect is a message to a customer fires — a renewal rung, a claim status change, a policy issued. Recipes that only raise work run to completion on their own and never appear here."
        />
      ) : (
        <ul className={styles.rows} aria-label="Messages ready to send">
          {waiting.map((row) => {
            const held = heldUntil(row, now)
            return (
              <li className={styles.staged} key={row.id} data-held={held ? '' : undefined}>
                <div className={styles.parameterHead}>
                  <span>
                    <strong>{row.toName}</strong>
                    {` · ${channelLabel(row.channel)}`}
                  </span>
                  <span className={styles.chips}>
                    <Badge tone="neutral" caps>
                      {row.templateKey}
                    </Badge>
                    {held ? (
                      <StatusPill tone="attn" size="sm">
                        Held for quiet hours
                      </StatusPill>
                    ) : (
                      <StatusPill tone="warn" size="sm">
                        Waiting on you
                      </StatusPill>
                    )}
                  </span>
                </div>

                <p className={styles.hint}>{row.note}</p>

                <p className={layout.muted}>
                  <span className={layout.mono}>{`${row.recipeKey} · v${row.recipeVersion}`}</span>
                  {' prepared '}
                  <DateTime value={row.stagedAt} mode="datetime" />
                  {row.releaseAfter === null ? '' : ', releasable from '}
                  {row.releaseAfter === null ? null : (
                    <DateTime value={row.releaseAfter} mode="datetime" />
                  )}
                  {` · about ${row.subjectEntity} `}
                  <span className={layout.mono}>{row.subjectId}</span>
                </p>

                <div className={layout.rowActions}>
                  <GatedAction
                    label="Release"
                    variant="primary"
                    title={`Send this ${channelLabel(row.channel)} message to ${row.toName}`}
                    disabled={held}
                    changes={[
                      { key: 'to', label: 'Recipient', from: 'Not sent', to: row.toName },
                      {
                        key: 'channel',
                        label: 'Channel',
                        from: 'Prepared',
                        to: channelLabel(row.channel),
                      },
                      { key: 'template', label: 'Template', from: '—', to: row.templateKey },
                    ]}
                    note={`This leaves the building. It was prepared by ${row.recipeKey} and has not been sent; releasing it records the send against you, not against the recipe.`}
                    confirmLabel="Send"
                    onConfirm={() => release(row)}
                  />
                  {discarding === row.id ? (
                    <>
                      <Field label="Why is this not going out?">
                        <Input
                          value={reason}
                          placeholder="Called the customer instead"
                          onChange={(event) => setReason(event.target.value)}
                        />
                      </Field>
                      <Button
                        type="button"
                        size="sm"
                        disabled={reason.trim() === ''}
                        onClick={() => discard(row)}
                      >
                        Cancel this message
                      </Button>
                      <Button
                        type="button"
                        variant="quiet"
                        size="sm"
                        onClick={() => {
                          setDiscarding(null)
                          setReason('')
                        }}
                      >
                        Keep it
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      variant="quiet"
                      size="sm"
                      onClick={() => setDiscarding(row.id)}
                    >
                      Do not send
                    </Button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
