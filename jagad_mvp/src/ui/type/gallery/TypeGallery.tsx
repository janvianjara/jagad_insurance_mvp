import type { ReactNode } from 'react'
import {
  DateTime,
  KeyValueList,
  MaskedValue,
  Money,
  RecordId,
  RelativeTime,
  TruncatedText,
} from '..'
import styles from './TypeGallery.module.css'

/** Fixed so the gallery reads the same on every render and in every screenshot. */
const NOW = new Date('2026-08-26T11:30:00')

const PREMIUM_ROWS = [
  {
    systemNo: 'POL-DRAFT-0219',
    insurerNo: null,
    customer: 'Rakesh Patel',
    paise: 12485000,
    issued: '2026-08-24T09:15:00',
  },
  {
    systemNo: 'POL-2214',
    insurerNo: 'HDFC/OPT/2026/551204',
    customer: 'Jayesh Kapadia',
    paise: 124850000,
    issued: '2026-06-01T16:40:00',
  },
  {
    systemNo: 'CLM-0412',
    insurerNo: 'NB/CLM/88213',
    customer: 'Nilesh Bhatt',
    paise: -4500000,
    issued: '2026-08-19T13:05:00',
  },
  {
    systemNo: 'QTN-0332',
    insurerNo: null,
    customer: 'Priya Desai',
    paise: null,
    issued: null,
  },
]

function Block({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <div className={styles.block}>
      <div className={styles.blockHead}>
        <h3>{title}</h3>
        <span className={styles.caps}>src/ui/type</span>
      </div>
      <p className={styles.note}>{note}</p>
      {children}
    </div>
  )
}

/**
 * The data primitives against real fixture shapes — including the ones where
 * the value is absent, because absence is the state these components exist to
 * render honestly.
 */
export default function TypeGallery() {
  return (
    <div className={styles.gallery}>
      <Block
        title="Dual numbering"
        note="Plan §8: systemNo is generated and always present, insurerNo arrives from the insurer and often has not arrived yet. A missing insurer number is drawn as awaited, never left as blank space the eye slides past."
      >
        <div className={styles.pane}>
          <div className={styles.inline}>
            <RecordId systemNo="POL-2214" insurerNo="HDFC/OPT/2026/551204" />
            <RecordId systemNo="POL-DRAFT-0219" />
            <RecordId systemNo="INQ-1041" showInsurer={false} />
          </div>
          <div className={styles.inline} style={{ marginTop: 'var(--sp-4)' }}>
            <RecordId layout="stacked" systemNo="CLM-0412" insurerNo="NB/CLM/88213" />
            <RecordId layout="stacked" systemNo="APP-0774" awaitedText="policy no. awaited" />
          </div>
        </div>
      </Block>

      <Block
        title="Money"
        note="Record-only (D3): this component formats what was recorded and never computes an amount. Integer paise in, en-IN grouping out, so a lakh reads as a lakh. A null amount is not a zero."
      >
        <div className={styles.pane}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Record</th>
                <th>Customer</th>
                <th className={styles.numeric}>Final premium</th>
                <th className={styles.numeric}>Whole rupees</th>
                <th>Recorded</th>
              </tr>
            </thead>
            <tbody>
              {PREMIUM_ROWS.map((row) => (
                <tr key={row.systemNo}>
                  <td>
                    <RecordId systemNo={row.systemNo} insurerNo={row.insurerNo} />
                  </td>
                  <td>{row.customer}</td>
                  <td className={styles.numeric}>
                    <Money paise={row.paise} />
                  </td>
                  <td className={styles.numeric}>
                    <Money paise={row.paise} showPaise={false} symbol={false} emphasis="quiet" />
                  </td>
                  <td>
                    <DateTime value={row.issued} mode="datetime" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className={styles.inline} style={{ marginTop: 'var(--sp-4)' }}>
            <Money paise={124850000} emphasis="strong" />
            <Money paise={0} />
            <Money paise={null} absentText="premium not recorded" />
          </div>
        </div>
      </Block>

      <Block
        title="Time"
        note="Absolute for the record, relative for the reader. Both take an injectable reference so a row does not drift from the one beside it."
      >
        <div className={styles.pane}>
          <KeyValueList
            columns={2}
            items={[
              { key: 'created', label: 'Created', value: <DateTime value="2026-08-24T09:15:00" /> },
              {
                key: 'created-rel',
                label: 'Created',
                value: <RelativeTime value="2026-08-24T09:15:00" now={NOW} />,
              },
              {
                key: 'due',
                label: 'Renewal due',
                value: <DateTime value="2026-09-14T00:00:00" mode="date" />,
              },
              {
                key: 'due-rel',
                label: 'Renewal due',
                value: <RelativeTime value="2026-09-14T00:00:00" now={NOW} />,
              },
              { key: 'short', label: 'In a dense column', value: <DateTime value="2026-08-26T11:30:00" mode="short" /> },
              { key: 'never', label: 'Last contacted', value: <RelativeTime value={null} /> },
            ]}
          />
        </div>
      </Block>

      <Block
        title="Masked identifiers"
        note="Constitution: last four characters maximum, and there is no prop that reveals the rest. The component receives the full string and drops everything but the tail before it builds a single node."
      >
        <div className={styles.pane}>
          <KeyValueList
            items={[
              {
                key: 'aadhaar',
                label: 'Aadhaar',
                value: <MaskedValue value="123412341234" kind="aadhaar" />,
              },
              { key: 'pan', label: 'PAN', value: <MaskedValue value="ABCDE1234F" kind="pan" /> },
              {
                key: 'account',
                label: 'Bank account',
                value: <MaskedValue value="50100234567890" kind="account" />,
              },
              {
                key: 'phone',
                label: 'Mobile',
                value: <MaskedValue value="9825012345" kind="phone" />,
              },
              { key: 'none', label: 'Aadhaar', value: <MaskedValue value={null} kind="aadhaar" /> },
            ]}
          />
        </div>
      </Block>

      <Block
        title="Long text and record summaries"
        note="Clamped text keeps a row at its height. The title attribute is off for anything sensitive, because a title is still text in the DOM."
      >
        <div className={styles.pane}>
          <div className={styles.narrow}>
            <TruncatedText text="Customer wants the same cover as last year plus his father, and asked for two options before Diwali." />
          </div>
          <div className={styles.narrow} style={{ marginTop: 'var(--sp-3)' }}>
            <TruncatedText
              lines={2}
              text="Customer wants the same cover as last year plus his father, and asked for two options before Diwali."
            />
          </div>
          <div style={{ marginTop: 'var(--sp-4)' }}>
            <KeyValueList
              dense
              columns={2}
              items={[
                { key: 'customer', label: 'Customer', value: 'Jayesh Kapadia' },
                { key: 'channel', label: 'Channel', value: 'Referral' },
                { key: 'agency', label: 'Agency', value: 'Jagad Insurance, Surat' },
                { key: 'agent', label: 'Sub-agent', value: null },
              ]}
            />
          </div>
        </div>
      </Block>
    </div>
  )
}
