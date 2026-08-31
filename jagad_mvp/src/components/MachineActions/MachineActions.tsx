import type { ReactNode } from 'react'
import { ConfirmGate } from '../guardrails'
import { Button } from '../../ui/Button'
import { Icon } from '../../ui/Icon'
import type { MachineAction } from './machine-action'
import styles from './MachineActions.module.css'

export type MachineActionsProps = {
  /** Every edge leaving the record's current state, refusals included. */
  actions: readonly MachineAction[]
  /** The action whose gate is open, by key. `null` means none is armed. */
  armed: string | null
  onArm: (key: string | null) => void
  /** Permission, not workflow. False disables every control and says why once. */
  permitted?: boolean
  permissionNote?: ReactNode
  /** What a terminal state says. Never "no actions available". */
  emptyText: string
  className?: string
}

/**
 * A workflow machine with a face on it — plan §9, shared by the claim and
 * renewal detail screens.
 *
 * The one rule it exists to hold: a control the machine has refused is drawn
 * disabled with the machine's own sentence underneath it, wired by
 * `aria-describedby` so the reason is announced rather than merely visible. §9
 * writes those refusals as prose for exactly this position, and a screen that
 * swallowed them would send somebody to a developer to find out which rule
 * fired.
 *
 * Nothing here writes. Arming an action opens a `<ConfirmGate>`; only Confirm
 * calls `run`, and Cancel disarms and writes nothing.
 */
export function MachineActions({
  actions,
  armed,
  onArm,
  permitted = true,
  permissionNote,
  emptyText,
  className,
}: MachineActionsProps) {
  const armedAction = actions.find((action) => action.key === armed) ?? null

  if (actions.length === 0) {
    return <p className={styles.none}>{emptyText}</p>
  }

  return (
    <div className={className}>
      {permitted ? null : (
        <p className={styles.permission} role="note">
          <Icon name="lock" size="sm" />
          {permissionNote ?? 'Your role can read this record but not move it on.'}
        </p>
      )}

      <ul className={styles.actions}>
        {actions.map((action) => (
          <li key={action.key} className={styles.action}>
            <Button
              variant={action.variant ?? 'quiet'}
              {...(action.icon === undefined ? {} : { icon: action.icon })}
              disabled={!permitted || !action.verdict.ok}
              aria-describedby={action.verdict.ok ? undefined : `${action.key}-blocked`}
              onClick={() => onArm(action.key)}
            >
              {action.label}
            </Button>
            {action.verdict.ok ? null : (
              <p className={styles.blocked} id={`${action.key}-blocked`}>
                {action.verdict.reason}
              </p>
            )}
          </li>
        ))}
      </ul>

      {armedAction ? (
        <div className={styles.gate}>
          {armedAction.form}
          <ConfirmGate
            title={armedAction.confirmTitle}
            changes={armedAction.changes}
            {...(armedAction.note === undefined ? {} : { note: armedAction.note })}
            {...(armedAction.receipt === undefined ? {} : { receipt: armedAction.receipt })}
            confirmLabel={armedAction.confirmLabel ?? armedAction.label}
            onCancel={() => onArm(null)}
            onConfirm={armedAction.run}
          />
        </div>
      ) : null}
    </div>
  )
}
