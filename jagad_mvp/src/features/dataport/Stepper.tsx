import { Icon } from '../../ui/Icon'
import styles from './dataport.module.css'

export type StepperItem = {
  readonly key: string
  readonly label: string
}

export type StepperProps = {
  readonly items: readonly StepperItem[]
  readonly currentKey: string
}

/**
 * Where you are in a four-step job, and what is left.
 *
 * A wizard without a visible stepper is a sequence of screens that could end at
 * any moment, and an operator loading four hundred customers needs to know
 * before they start that step four is where anything is written. Navy marks the
 * step you are on, because navy is this product's action colour; a finished step
 * is the soft navy and a tick.
 *
 * It is a list rather than a row of buttons: moving between steps is the
 * wizard's own decision — you cannot skip mapping — so nothing here is
 * clickable, and pretending otherwise would offer a control that refuses.
 */
export function Stepper({ items, currentKey }: StepperProps) {
  const currentIndex = items.findIndex((item) => item.key === currentKey)

  return (
    <ol className={styles.stepper}>
      {items.map((item, index) => {
        const state = index === currentIndex ? 'current' : index < currentIndex ? 'done' : 'todo'
        return (
          <li
            key={item.key}
            className={styles.step}
            data-state={state}
            aria-current={state === 'current' ? 'step' : undefined}
          >
            {state === 'done' ? (
              <Icon name="check" size="sm" />
            ) : (
              <span className={styles.stepIndex}>{index + 1}</span>
            )}
            {item.label}
          </li>
        )
      })}
    </ol>
  )
}
