/**
 * The workflow-machine action list (plan §9) — the edges leaving a record's
 * current state, each one previewed by `<ConfirmGate>` and each refusal rendered
 * as the machine's own prose under the control it disabled.
 */
export { MachineActions } from './MachineActions'
export type { MachineActionsProps } from './MachineActions'
export type { ActionVerdict, MachineAction } from './machine-action'
