import type { ReactNode } from 'react'
import type { ConfirmChange } from '../guardrails'
import type { ButtonVariant } from '../../ui/Button'
import type { IconName } from '../../ui/Icon'

/**
 * The machine's answer, as a screen needs it.
 *
 * Structurally what `TransitionResult` (plan §9) already is, restated here so
 * this composite stays a presentation concern: it renders a verdict, it never
 * asks a machine for one. A `TransitionResult` is assignable to it unchanged,
 * so a caller passes `claimMachine.canTransition(...)` straight through.
 */
export type ActionVerdict = { readonly ok: true } | { readonly ok: false; readonly reason: string }

/**
 * One edge of a workflow machine, with everything the screen needs to offer it,
 * refuse it, and preview it before anything is written.
 *
 * `changes` feeds `<ConfirmGate>`, and an empty list is meaningful rather than
 * lazy: the gate refuses to confirm an empty preview, which is how an action
 * whose compulsory field is still blank stays un-runnable without a second
 * validation rule to keep in step.
 */
export type MachineAction = {
  readonly key: string
  readonly label: string
  readonly icon?: IconName
  readonly variant?: ButtonVariant
  /** Asked before the control is drawn, so a refusal reads as prose, not as a dead button. */
  readonly verdict: ActionVerdict
  readonly confirmTitle: ReactNode
  readonly confirmLabel?: string
  readonly changes: readonly ConfirmChange[]
  readonly note?: ReactNode
  readonly receipt?: ReactNode
  /** Compulsory entry this move needs — a reason, a remark, a typed amount. */
  readonly form?: ReactNode
  /** Reached only from Confirm. Cancel never calls it. */
  readonly run: () => void
}
