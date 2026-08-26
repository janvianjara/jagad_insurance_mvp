import { useSearchParams } from 'react-router'
import { Badge } from '../../../ui/signal'
import { EmptyState } from '../../../ui/data'
import { templateReach, useConfigStore } from '../shared'
import { TemplateEditor } from './TemplateEditor'
import layout from '../shared/config-layout.module.css'
import styles from './users.module.css'

/**
 * The template library — the starters an agency begins from, and the clones it
 * ends up with.
 *
 * The selected template lives in the URL (`?tab=templates&template=…`) so an
 * admin can send "look at what the renewals copy grants" as a link. No queue is
 * mounted on this section, which is what makes that parameter safe to keep.
 */
export function TemplateLibrary() {
  const templates = useConfigStore((state) => state.templates)
  const users = useConfigStore((state) => state.users)
  const [params, setParams] = useSearchParams()

  const requested = params.get('template')
  const selected =
    templates.find((template) => template.key === requested) ?? templates[0] ?? null

  if (!selected) {
    return (
      <EmptyState
        variant="empty"
        title="The template library is empty"
        explanation="Starter templates ship with the product; a library with none of them means configuration has not been read yet."
      />
    )
  }

  return (
    <div className={layout.split}>
      <div className={styles.library}>
        {templates.map((template) => {
          const held = users.filter((user) => user.templateKey === template.key).length
          const current = template.key === selected.key

          return (
            <button
              key={template.key}
              type="button"
              className={styles.card}
              data-current={current || undefined}
              aria-current={current ? 'true' : undefined}
              onClick={() => setParams({ tab: 'templates', template: template.key })}
            >
              <span className={styles.cardHead}>
                <span className={styles.cardName}>{template.label}</span>
                <Badge tone={template.editable ? 'info' : 'idle'}>
                  {template.editable ? 'Clone' : 'Starter'}
                </Badge>
              </span>
              <span className={layout.mono}>{template.key}</span>
              <span className={styles.cardLine}>{templateReach(template)}</span>
              <span className={styles.cardLine}>
                {held} account{held === 1 ? '' : 's'}
                {template.clonedFrom ? ` · cloned from ${template.clonedFrom}` : ''}
              </span>
            </button>
          )
        })}
      </div>

      <TemplateEditor
        key={selected.key}
        template={selected}
        onCloned={(key) => setParams({ tab: 'templates', template: key })}
      />
    </div>
  )
}
