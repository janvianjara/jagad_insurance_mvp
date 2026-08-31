import { useState } from 'react'
import { useParams } from 'react-router'
import type { ChangeEvent, ReactNode } from 'react'
import { useRepositories } from '../../app/repositories-context'
import { useResource } from '../../lib/useResource'
import { ConfirmGate } from '../../components/guardrails'
import { BrandMark } from '../../ui/BrandMark'
import { EmptyState } from '../../ui/data'
import { DateTime } from '../../ui/type'
import { useCustomerNow } from '../customers/clock'
import { uploadDesk } from './data/upload-desk'
import type { DocumentType } from '../../data/repo'
import styles from './UploadPage.module.css'

/**
 * `/upload/:token` — FR-11.1, FR-16.8, D21, plan §5 and §11.1.
 *
 * The cashless claim's discharge summary, one tap from a WhatsApp message. §5
 * says it plainly: "A tokenised link is not a stripped-down app. It is the
 * deliberate design in FR-09.9 and D21: the least possible friction at the moment
 * a customer is standing in a hospital corridor."
 *
 * **This page carries no session, and that is structural rather than
 * aspirational.** Registered outside the shell layout, reached through a dynamic
 * import so it is a chunk of its own, and importing no app shell, no session
 * store and no permission evaluator — `upload-isolation.test.ts` walks this
 * module's whole runtime import graph and fails if any of them appear. It is the
 * same mechanic `/consent/:token` uses, for the same reason.
 *
 * **Presence, never content.** The file input hands this page a `File`. It reads
 * three things off it — name, type, size — and sends those. It never reads the
 * bytes, and the desk has nowhere to put them if it did. What lands on the claim
 * is that a document arrived and what it was called, which is the one thing the
 * Assistant may ever know about a document.
 *
 * Two states, two pages, and one deliberate omission. A live link shows the
 * drop-off; a closed one gets a page that says what to do next. There is no
 * third page for "wrong link", because an unknown token and a closed one render
 * identically on purpose — the difference between them is exactly what somebody
 * guessing tokens would be looking for.
 */
export default function UploadTokenScreen() {
  const { token = '' } = useParams()
  const repositories = useRepositories()
  const desk = uploadDesk(repositories)
  const now = useCustomerNow()

  const [offered, setOffered] = useState<OfferedFile | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  const loaded = useResource(() => desk.open(token, now), `upload:${token}`)

  if (loaded.isLoading && !loaded.data) {
    return (
      <UploadShell>
        <p className={styles.loading} aria-busy="true">
          Opening your link.
        </p>
      </UploadShell>
    )
  }

  const view = loaded.data ?? null

  if (!view || view.closed) {
    return <UploadClosedPage reason={view?.closedReason ?? null} />
  }

  async function send(file: OfferedFile) {
    // Name, type and size. The bytes are never read, here or anywhere below.
    const outcome = await desk.accept({
      token,
      docType: file.docType,
      fileName: file.name,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      now,
    })

    setOffered(null)

    if (!outcome.ok) {
      setProblem(outcome.reason)
      return
    }

    setProblem(null)
    // The desk is the only list. An optimistic copy beside it would show the
    // same document twice the moment the re-read landed.
    loaded.reload()
  }

  const arrived = view.accepted

  return (
    <UploadShell>
      <div className={styles.intro}>
        <h1 className={styles.title}>Send us your claim document</h1>
        <p className={styles.lead}>
          This is for claim {view.claimSystemNo}. The link is only for you, it closes on{' '}
          <DateTime value={view.expiresAt} mode="date" />, and it does not sign you in to anything.
        </p>
        <p className={styles.privacy}>
          We record that your document arrived and what it is called. We do not ask for your Aadhaar,
          your PAN or a photograph of you on this page.
        </p>
      </div>

      {arrived.length > 0 ? (
        <div className={styles.arrived}>
          <h2 className={styles.arrivedTitle}>Already sent</h2>
          <ul className={styles.arrivedList} aria-label="Documents already sent">
            {arrived.map((entry) => (
              <li key={`${entry.at}-${entry.fileName}`} className={styles.arrivedItem}>
                {entry.fileName}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {problem ? (
        <p className={styles.problem} role="alert">
          {problem}
        </p>
      ) : null}

      {offered ? (
        <ConfirmGate
          title="Send this to Jagad Insurance"
          changes={[
            { key: 'name', label: 'File', to: offered.name },
            { key: 'kind', label: 'Document', to: LABELS[offered.docType] ?? offered.docType },
            { key: 'size', label: 'Size', to: sizeLabel(offered.sizeBytes) },
          ]}
          note="Sending records the document against your claim. Nothing is sent if you go back."
          confirmLabel="Yes, send it"
          cancelLabel="Go back and choose another"
          receipt="Sent. Thank you."
          onCancel={() => setOffered(null)}
          onConfirm={() => void send(offered)}
        />
      ) : (
        <UploadPicker docTypes={view.docTypes} onOffer={setOffered} />
      )}
    </UploadShell>
  )
}

/* --------------------------------------------------------------- small parts */

type OfferedFile = {
  readonly docType: DocumentType
  readonly name: string
  readonly mimeType: string
  readonly sizeBytes: number
}

const LABELS: Readonly<Record<string, string>> = {
  discharge_summary: 'Discharge summary',
  claim_form: 'Claim form',
}

/**
 * One picker per accepted type, rather than a type dropdown beside one input.
 *
 * A person on a phone in a corridor should be answering "which of these am I
 * holding", not filling a form about a file. It also means the document type is
 * chosen before the file rather than after, so a mislabelled document needs two
 * mistakes instead of one.
 */
function UploadPicker({
  docTypes,
  onOffer,
}: {
  docTypes: readonly DocumentType[]
  onOffer: (file: OfferedFile) => void
}) {
  function pick(docType: DocumentType) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (!file) return
      onOffer({ docType, name: file.name, mimeType: file.type, sizeBytes: file.size })
      // Cleared so choosing the same file twice still fires a change.
      event.target.value = ''
    }
  }

  return (
    <div className={styles.pickers}>
      {docTypes.map((docType) => (
        <label key={docType} className={styles.picker}>
          <span className={styles.pickerLabel}>{LABELS[docType] ?? docType}</span>
          <span className={styles.pickerHint}>Take a photo, or choose a file</span>
          <input
            className={styles.pickerInput}
            type="file"
            accept="image/*,application/pdf"
            onChange={pick(docType)}
          />
        </label>
      ))}
    </div>
  )
}

/**
 * The page frame. Mobile first and only mobile first, the same posture the
 * consent page takes: there is no navigation to offer somebody with no session.
 */
function UploadShell({ children }: { children: ReactNode }) {
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <BrandMark size="md" />
        {children}
        <p className={styles.footer}>
          Jagad Insurance will never ask for a password, a one-time code or your full Aadhaar number
          on this page.
        </p>
      </div>
    </main>
  )
}

/**
 * One page for every closed link, whatever closed it.
 *
 * An unknown token, an expired one and a withdrawn one all land here with the
 * same sentence. That is not laziness: telling somebody which of those it was
 * tells anybody guessing tokens which of their guesses exist.
 */
function UploadClosedPage({ reason }: { reason: string | null }) {
  return (
    <UploadShell>
      <EmptyState
        variant="empty"
        icon="clock"
        title="This link is not open"
        explanation={
          reason ??
          'Reply to the message it arrived in and Jagad Insurance will send you a fresh one. Nothing you have already sent is lost.'
        }
      />
    </UploadShell>
  )
}

/** Rounded for a person, not for a disk. */
function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
