import { Link } from 'react-router'
import { Clock, StatusPill, StatusStripe } from '../../../ui/signal'
import { DateTime, KeyValueList, Money, RecordId } from '../../../ui/type'
import { splitEmphasis } from './blocks'
import type { Block, Cell, KvBlock, ParaBlock, RowsBlock, TableBlock } from './blocks'
import styles from './BlockRenderer.module.css'

/**
 * The block renderer — the render edge, and the only place a value is formatted.
 *
 * Everything above this file works in recorded values: paise, ISO strings,
 * `systemNo` plus `insurerNo`. Everything below it is a `src/ui` primitive that
 * already knows how to draw one. That split is what keeps the money invariant
 * structural: a block cannot carry a formatted amount, so no amount can be
 * produced on the way to a screen.
 */

function CellValue({ cell }: { cell: Cell }) {
  if (cell.cell === 'text') return <span className={styles.text}>{cell.value}</span>

  if (cell.cell === 'id') {
    return <RecordId systemNo={cell.systemNo} insurerNo={cell.insurerNo} showInsurer={false} />
  }

  if (cell.cell === 'money') return <Money paise={cell.paise} showPaise={false} />

  if (cell.cell === 'date') return <DateTime value={cell.value} mode={cell.mode ?? 'date'} />

  if (cell.cell === 'status') {
    return (
      <StatusPill tone={cell.tone} size="sm">
        {cell.value}
      </StatusPill>
    )
  }

  // A turnaround clock cannot be drawn without the allowance it is measured
  // against, so the block has to have carried one.
  if (cell.mode === 'tat') {
    return (
      <Clock mode="tat" start={cell.start} durationMs={cell.durationMs ?? 0} label={cell.label} />
    )
  }

  return (
    <Clock
      mode="aging"
      start={cell.start}
      {...(cell.durationMs === undefined ? {} : { durationMs: cell.durationMs })}
      label={cell.label}
    />
  )
}

function Para({ block }: { block: ParaBlock }) {
  const segments = splitEmphasis(block.text, block.emphasis, block.mono)

  return (
    <p className={styles.para}>
      {segments.map((segment, index) =>
        segment.emphasised ? (
          <strong key={index} className={segment.mono ? styles.record : styles.strong}>
            {segment.text}
          </strong>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </p>
  )
}

function Rows({ block }: { block: RowsBlock }) {
  return (
    <div className={styles.card}>
      {block.caption ? <p className={styles.cardHead}>{block.caption}</p> : null}
      <ul className={styles.rows}>
        {block.rows.map((row) => (
          <li key={row.id} className={styles.row}>
            <StatusStripe severity={row.severity} />
            <span className={styles.rowMain}>
              <span className={styles.rowPrimary}>
                {row.to ? (
                  <Link to={row.to} className={styles.rowLink}>
                    {row.primary}
                  </Link>
                ) : (
                  row.primary
                )}
              </span>
              <span className={styles.rowSecondary}>{row.secondary}</span>
            </span>
            {row.right ? (
              <span className={styles.rowRight}>
                <CellValue cell={row.right} />
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}

function Table({ block }: { block: TableBlock }) {
  return (
    <div className={styles.card}>
      <div className={styles.tableScroll}>
        <table className={styles.table}>
          {block.caption ? <caption className={styles.caption}>{block.caption}</caption> : null}
          <thead>
            <tr>
              {block.columns.map((column) => (
                <th key={column.key} scope="col" data-align={column.align ?? 'start'}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row) => (
              <tr key={row.id}>
                {row.cells.map((cell, index) => (
                  <td
                    key={block.columns[index]?.key ?? index}
                    data-align={block.columns[index]?.align ?? 'start'}
                  >
                    <CellValue cell={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Kv({ block }: { block: KvBlock }) {
  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <span>{block.title}</span>
        {block.tag ? <span className={styles.cardTag}>{block.tag}</span> : null}
      </div>
      <div className={styles.kvBody}>
        <KeyValueList
          dense
          items={block.items.map((item) => ({
            key: item.key,
            label: item.label,
            value: <CellValue cell={item.value} />,
          }))}
        />
      </div>
    </div>
  )
}

/**
 * `prominent` raises the reading size of the prose inside a turn.
 *
 * It is the whole of the hierarchy between the opening briefing and an answer,
 * and it is deliberately a *size* rather than a colour: the briefing is neither
 * a positive state nor an attention state, so green and lime are both wrong for
 * it under U7, and navy is reserved for action. Density owns the actual step —
 * `--text-reading` is 15px comfortable and 13px compact — so a person working
 * the queue all day in compact does not get a landing screen shouting at them.
 *
 * A `note` renders as its own card rather than inside one, which is what the
 * prototype does when a note is the whole block (`blk(b)` wraps a lone note in a
 * `.blk` of its own). The rows, table and key-value blocks each own a card and
 * put their caption inside it as the prototype's `.blk .h` header.
 */
export function BlockRenderer({
  blocks,
  prominent,
  variant,
}: {
  blocks: readonly Block[]
  prominent?: boolean
  /**
   * `notice` puts the lime rule back on the reason line, and nowhere else.
   * `quiet` is the briefing of a queue with nothing in it — a result, so it is
   * stated at headline size rather than shrinking into a half-empty card.
   */
  variant?: 'notice' | 'quiet'
}) {
  return (
    <div className={styles.blocks} data-prominent={prominent ? '' : undefined} data-variant={variant}>
      {blocks.map((block, index) => {
        if (block.kind === 'para') return <Para key={index} block={block} />
        if (block.kind === 'note') {
          return (
            <p key={index} className={styles.note}>
              {block.text}
            </p>
          )
        }
        if (block.kind === 'rows') return <Rows key={index} block={block} />
        if (block.kind === 'table') return <Table key={index} block={block} />
        return <Kv key={index} block={block} />
      })}
    </div>
  )
}
