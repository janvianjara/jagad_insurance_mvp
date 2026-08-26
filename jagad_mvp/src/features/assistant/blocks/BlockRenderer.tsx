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
  const segments = splitEmphasis(block.text, block.emphasis)

  return (
    <p className={styles.para}>
      {segments.map((segment, index) =>
        segment.emphasised ? (
          <strong key={index} className={styles.strong}>
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
  )
}

function Table({ block }: { block: TableBlock }) {
  return (
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
                <td key={block.columns[index]?.key ?? index} data-align={block.columns[index]?.align ?? 'start'}>
                  <CellValue cell={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Kv({ block }: { block: KvBlock }) {
  return (
    <div className={styles.kv}>
      <div className={styles.kvHead}>
        <span className={styles.kvTitle}>{block.title}</span>
        {block.tag ? <span className={styles.kvTag}>{block.tag}</span> : null}
      </div>
      <KeyValueList
        dense
        items={block.items.map((item) => ({
          key: item.key,
          label: item.label,
          value: <CellValue cell={item.value} />,
        }))}
      />
    </div>
  )
}

export function BlockRenderer({ blocks }: { blocks: readonly Block[] }) {
  return (
    <div className={styles.blocks}>
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
