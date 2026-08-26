import type { ReactNode } from 'react'
import {
  Badge,
  Clock,
  CountChip,
  SEVERITIES,
  StatusPill,
  StatusStripe,
  SUBTLE_TONES,
  Tag,
  TONES,
} from '..'
import type { Severity, Tone } from '..'
import styles from './SignalGallery.module.css'

/** Fixed reference so every clock below reads the same on every render. */
const NOW = new Date('2026-08-26T11:30:00')

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

const QUEUE = [
  {
    id: 'INQ-1041',
    name: 'Rakesh Patel',
    severity: 'hot' as Severity,
    status: { tone: 'bad' as Tone, text: 'Escalated' },
    startedHoursAgo: 30,
    tatHours: 24,
  },
  {
    id: 'INQ-1039',
    name: 'Jayesh Kapadia',
    severity: 'warm' as Severity,
    status: { tone: 'warn' as Tone, text: 'Awaiting documents' },
    startedHoursAgo: 20,
    tatHours: 24,
  },
  {
    id: 'INQ-1036',
    name: 'Nilesh Bhatt',
    severity: 'cool' as Severity,
    status: { tone: 'info' as Tone, text: 'Quotation shared' },
    startedHoursAgo: 4,
    tatHours: 48,
  },
  {
    id: 'INQ-1030',
    name: 'Falguni Shah',
    severity: 'good' as Severity,
    status: { tone: 'ok' as Tone, text: 'Converted' },
    startedHoursAgo: 2,
    tatHours: 48,
  },
  {
    id: 'INQ-1044',
    name: 'Unassigned pool',
    severity: 'attn' as Severity,
    status: { tone: 'attn' as Tone, text: 'Needs an owner' },
    startedHoursAgo: 9,
    tatHours: 24,
  },
]

function hoursAgo(hours: number): Date {
  return new Date(NOW.getTime() - hours * HOUR)
}

function Block({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <div className={styles.block}>
      <div className={styles.blockHead}>
        <h3>{title}</h3>
        <span className={styles.caps}>src/ui/signal</span>
      </div>
      <p className={styles.note}>{note}</p>
      {children}
    </div>
  )
}

/**
 * The status vocabulary in one place: what each tone means, what it looks like
 * on a pill, a stripe, a badge and a clock, and how a queue row reads when all
 * of them appear together.
 */
export default function SignalGallery() {
  return (
    <div className={styles.gallery}>
      <Block
        title="The six tones"
        note="UX charter U7. Green is brand and positive status only; lime marks what needs a person, which is not the same as something being wrong."
      >
        <div className={styles.pane}>
          <div className={styles.toneGrid}>
            {(Object.keys(TONES) as Tone[]).map((tone) => (
              <div key={tone} style={{ display: 'contents' }}>
                <span className={styles.caps}>{tone}</span>
                <StatusPill tone={tone}>{tone}</StatusPill>
                <span className={styles.note}>{TONES[tone]}</span>
              </div>
            ))}
          </div>
        </div>
      </Block>

      <Block
        title="Severity stripes"
        note="A queue sorts by how much trouble a row is in, so the stripe speaks a shorter language than the pill: hot, warm, cool, good, and waiting on a person."
      >
        <div className={styles.pane}>
          <div className={styles.inline}>
            {(Object.keys(SEVERITIES) as Severity[]).map((severity) => (
              <span key={severity} className={styles.inline}>
                <StatusStripe severity={severity} orientation="horizontal" label={severity} />
                <span className={styles.caps}>
                  {severity} to --{SEVERITIES[severity]}
                </span>
              </span>
            ))}
          </div>
        </div>
      </Block>

      <Block
        title="Badges, counts and tags"
        note="A pill is the record's state in the workflow; a badge is a fact about it that the workflow does not change. A tag can be removed, and its removability is what the remove control announces."
      >
        <div className={styles.pane}>
          <div className={styles.inline}>
            <Badge caps>Retail</Badge>
            <Badge caps tone="info">
              Motor
            </Badge>
            <Badge tone="ok" variant="solid" icon="check">
              Verified
            </Badge>
            <Badge tone="idle" variant="outline" icon="lock">
              Retention locked
            </Badge>
            <Badge tone="attn" icon="spark">
              Draft
            </Badge>
          </div>
          <div className={styles.inline} style={{ marginTop: 'var(--sp-4)' }}>
            {(Object.keys(SUBTLE_TONES) as Array<keyof typeof SUBTLE_TONES>).map((tone) => (
              <CountChip key={tone} count={12} tone={tone} label="items waiting" />
            ))}
            <CountChip count={0} label="items waiting" />
            <CountChip count={248} label="unassigned inquiries" />
            <CountChip count={7} tone="bad" variant="solid" label="breached" />
          </div>
          <div className={styles.inline} style={{ marginTop: 'var(--sp-4)' }}>
            <Tag>Health</Tag>
            <Tag tone="info" onRemove={() => undefined} removeLabel="Remove filter: unassigned">
              Unassigned
            </Tag>
            <Tag tone="warn" onRemove={() => undefined} removeLabel="Remove filter: TAT breached">
              TAT breached
            </Tag>
          </div>
        </div>
      </Block>

      <Block
        title="Clocks"
        note="Turnaround, grace and aging. The allowance is always a parameter — turnaround is per company, per product and per priority, and a default baked into the component would quietly become the number the business runs on."
      >
        <div className={styles.pane}>
          <div className={styles.inline}>
            <Clock mode="tat" start={hoursAgo(2)} durationMs={24 * HOUR} now={NOW} label="TAT" />
            <Clock mode="tat" start={hoursAgo(20)} durationMs={24 * HOUR} now={NOW} label="TAT" />
            <Clock
              mode="tat"
              start={hoursAgo(30)}
              durationMs={24 * HOUR}
              now={NOW}
              label="TAT"
              emphasis="strong"
            />
          </div>
          <div className={styles.inline} style={{ marginTop: 'var(--sp-4)' }}>
            <Clock mode="grace" start={hoursAgo(6 * 24)} durationMs={30 * DAY} now={NOW} />
            <Clock mode="grace" start={hoursAgo(40 * 24)} durationMs={30 * DAY} now={NOW} />
          </div>
          <div className={styles.inline} style={{ marginTop: 'var(--sp-4)' }}>
            <Clock mode="aging" start={hoursAgo(9)} now={NOW} label="In pool" />
            <Clock
              mode="aging"
              start={hoursAgo(9)}
              durationMs={4 * HOUR}
              now={NOW}
              label="In pool"
            />
          </div>
        </div>
      </Block>

      <Block
        title="A queue row, assembled"
        note="Stripe, id, status and clock together: the row states its trouble in colour, in words and in figures, so none of the three is carrying the meaning alone."
      >
        <div className={styles.pane}>
          <div className={styles.queue}>
            {QUEUE.map((row) => (
              <div key={row.id} className={styles.queueRow}>
                <StatusStripe severity={row.severity} />
                <span className={styles.queueId}>{row.id}</span>
                <span className={styles.queueName}>{row.name}</span>
                <StatusPill tone={row.status.tone}>{row.status.text}</StatusPill>
                <Clock
                  mode="tat"
                  start={hoursAgo(row.startedHoursAgo)}
                  durationMs={row.tatHours * HOUR}
                  now={NOW}
                />
              </div>
            ))}
          </div>
        </div>
      </Block>
    </div>
  )
}
