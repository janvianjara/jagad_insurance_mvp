/**
 * Every version of this form, and the reason none of them is ever deleted.
 *
 * Canvas 6.2: old records keep their original schema. A policy captured in
 * January under version 1 renders under version 1 for as long as the record
 * exists, which only works while the row survives — so a superseded version is
 * marked superseded and kept, and `<SchemaForm>` refuses to render a record
 * against a version that is not its pinned one rather than showing today's form
 * over last year's answers.
 */

import { Button } from '../../../ui/Button'
import { StatusPill } from '../../../ui/signal'
import { DateTime } from '../../../ui/type'
import type { FormSchema } from '../../../domain/forms'
import layout from '../shared/config-layout.module.css'
import styles from './builder.module.css'

export type VersionStackProps = {
  versions: readonly FormSchema[]
  currentId: string
  onOpen: (schemaId: string) => void
}

export function VersionStack({ versions, currentId, onOpen }: VersionStackProps) {
  return (
    <ul className={styles.versions} aria-label="Versions">
      {versions.map((version) => {
        const fields = version.stages.reduce((total, stage) => total + stage.fields.length, 0)
        return (
          <li
            className={styles.version}
            key={version.id}
            data-version={version.version}
            data-live={version.active ? '' : undefined}
          >
            <span className={layout.rowActions}>
              <StatusPill tone={version.active ? 'ok' : 'idle'} size="sm">
                {version.active ? 'Live' : 'Superseded'}
              </StatusPill>
              <strong>{`Version ${version.version}`}</strong>
              <span className={layout.mono}>{version.id}</span>
            </span>

            <span className={layout.rowActions}>
              <span className={layout.muted}>
                {`${version.stages.length} stages · ${fields} fields · published `}
                <DateTime value={version.publishedAt} />
              </span>
              {version.id === currentId ? (
                <StatusPill tone="info" size="sm">
                  Open
                </StatusPill>
              ) : (
                <Button type="button" variant="quiet" size="sm" onClick={() => onOpen(version.id)}>
                  Open this version
                </Button>
              )}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
