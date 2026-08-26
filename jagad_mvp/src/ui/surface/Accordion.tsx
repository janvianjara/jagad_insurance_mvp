import { useId, useState } from 'react'
import type { ReactNode } from 'react'
import { Glyph } from './Glyph'
import styles from './Accordion.module.css'

export type AccordionItem = {
  id: string
  title: string
  /** Right-aligned summary that stays readable while the section is shut. */
  meta?: ReactNode
  content: ReactNode
  disabled?: boolean
}

type AccordionProps = {
  items: AccordionItem[]
  /** 'single' keeps one section open at a time; 'multi' lets them stack. */
  mode?: 'single' | 'multi'
  defaultOpenIds?: string[]
  openIds?: string[]
  onOpenChange?: (openIds: string[]) => void
}

/**
 * Progressive disclosure for long records — checklists, document sets, audit
 * detail. Every header is a real button with aria-expanded, so the state is
 * announced rather than implied by a rotated mark.
 */
export function Accordion({
  items,
  mode = 'multi',
  defaultOpenIds,
  openIds,
  onOpenChange,
}: AccordionProps) {
  const [ownOpenIds, setOwnOpenIds] = useState<string[]>(defaultOpenIds ?? [])
  const baseId = useId()

  const currentOpen = openIds ?? ownOpenIds

  function toggle(id: string) {
    const isOpen = currentOpen.includes(id)
    let next: string[]
    if (mode === 'single') next = isOpen ? [] : [id]
    else next = isOpen ? currentOpen.filter((openId) => openId !== id) : [...currentOpen, id]
    setOwnOpenIds(next)
    onOpenChange?.(next)
  }

  return (
    <div className={styles.root}>
      {items.map((item) => {
        const isOpen = currentOpen.includes(item.id)
        return (
          <div key={item.id} className={styles.item} data-open={isOpen ? 'true' : undefined}>
            <h3 className={styles.headingWrap}>
              <button
                type="button"
                className={styles.header}
                id={`${baseId}-header-${item.id}`}
                aria-expanded={isOpen}
                aria-controls={`${baseId}-region-${item.id}`}
                disabled={item.disabled}
                onClick={() => toggle(item.id)}
              >
                <Glyph kind={isOpen ? 'down' : 'right'} className={styles.marker} />
                <span className={styles.title}>{item.title}</span>
                {item.meta ? <span className={styles.meta}>{item.meta}</span> : null}
              </button>
            </h3>
            <div
              role="region"
              id={`${baseId}-region-${item.id}`}
              aria-labelledby={`${baseId}-header-${item.id}`}
              hidden={!isOpen}
              className={styles.content}
            >
              {item.content}
            </div>
          </div>
        )
      })}
    </div>
  )
}
