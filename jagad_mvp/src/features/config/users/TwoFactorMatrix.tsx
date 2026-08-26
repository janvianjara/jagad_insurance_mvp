import { Select } from '../../../ui/form'
import { Badge } from '../../../ui/signal'
import { Panel } from '../../../ui/surface'
import {
  TWO_FACTOR_EVENTS,
  TWO_FACTOR_EVENT_LABELS,
  TWO_FACTOR_LEVELS,
  TWO_FACTOR_LEVEL_LABELS,
  TWO_FACTOR_UNSET,
  useConfigStore,
} from '../shared'
import layout from '../shared/config-layout.module.css'
import styles from './users.module.css'

/**
 * The two-factor enforcement matrix — recorded in M0, enforced later.
 *
 * P-10a's scope note is explicit: we record the policy, we do not implement
 * TOTP. So this screen is honest about being a record. It says what the agency
 * asks for, per permission template and per moment, and it shows how many people
 * holding each template are actually enrolled — which is the number that makes
 * the policy mean something before there is any code to enforce it.
 *
 * The rows are templates rather than people on purpose. A policy that is set per
 * person is a policy nobody can state, and FR-01 already makes the template the
 * unit that carries what a role may do.
 */
export function TwoFactorMatrix() {
  const templates = useConfigStore((state) => state.templates)
  const users = useConfigStore((state) => state.users)
  const twoFactor = useConfigStore((state) => state.twoFactor)
  const setTwoFactor = useConfigStore((state) => state.setTwoFactor)

  return (
    <Panel
      title="Two-factor policy"
      description="What a second factor is asked for, per permission template. Recorded here; no authenticator is implemented in this build."
    >
      <div className={styles.matrixScroll}>
        <table className={styles.matrix}>
          <caption className={layout.muted}>
            Enrolment is recorded against each person on their account; this table records what the
            agency asks of the template they hold.
          </caption>
          <thead>
            <tr>
              <th scope="col">Permission template</th>
              {TWO_FACTOR_EVENTS.map((event) => (
                <th scope="col" key={event}>
                  {TWO_FACTOR_EVENT_LABELS[event]}
                </th>
              ))}
              <th scope="col">Enrolled</th>
            </tr>
          </thead>
          <tbody>
            {templates.map((template) => {
              const policy = twoFactor[template.key] ?? TWO_FACTOR_UNSET
              const held = users.filter((user) => user.templateKey === template.key)
              const enrolled = held.filter((user) => user.twoFactorEnrolled).length
              const shortfall = TWO_FACTOR_EVENTS.some(
                (event) => policy[event] === TWO_FACTOR_LEVELS.required,
              )

              return (
                <tr key={template.key}>
                  <th scope="row" className={styles.resource}>
                    {template.label}
                  </th>
                  {TWO_FACTOR_EVENTS.map((event) => (
                    <td key={event} className={styles.scopeCell}>
                      <Select
                        aria-label={`${template.label}: ${TWO_FACTOR_EVENT_LABELS[event]}`}
                        value={policy[event]}
                        options={Object.values(TWO_FACTOR_LEVELS).map((level) => ({
                          value: level,
                          label: TWO_FACTOR_LEVEL_LABELS[level],
                        }))}
                        onChange={(fired) =>
                          setTwoFactor(
                            template.key,
                            event,
                            fired.target.value as (typeof TWO_FACTOR_LEVELS)[keyof typeof TWO_FACTOR_LEVELS],
                          )
                        }
                      />
                    </td>
                  ))}
                  <td>
                    {held.length === 0 ? (
                      <span className={layout.muted}>no accounts</span>
                    ) : (
                      <Badge
                        tone={
                          enrolled === held.length ? 'ok' : shortfall && enrolled < held.length ? 'attn' : 'neutral'
                        }
                      >
                        {enrolled} of {held.length}
                      </Badge>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className={layout.muted}>
        Lime means the template requires a second factor somewhere and not everyone holding it is
        enrolled — a person has to do something about it, which is exactly what lime is for.
      </p>
    </Panel>
  )
}
