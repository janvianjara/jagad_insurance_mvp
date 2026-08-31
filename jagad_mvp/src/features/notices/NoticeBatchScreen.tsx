import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useRepositories } from '../../app/repositories-context'
import { useSessionStore } from '../../app/store'
import { WorkQueue } from '../../components/WorkQueue'
import { ConfirmGate } from '../../components/guardrails'
import { can } from '../../domain/permissions'
import { useResource } from '../../lib/useResource'
import { Button } from '../../ui/Button'
import { EmptyState, Skeleton, StatCard } from '../../ui/data'
import { Icon } from '../../ui/Icon'
import { StatusPill } from '../../ui/signal'
import { useToaster } from '../../ui/surface'
import { DateTime } from '../../ui/type'
import { noticeRowsQueue } from './batch-rows-queue'
import { NoticeRowDrawer } from './NoticeRowDrawer'
import { BATCH_LABEL, BATCH_TONE } from './notice-view'
import styles from './Notices.module.css'

/**
 * `/renewals/notices/:batchId` — plan §5 ("Notice bulk ingest"), §9, canvas
 * n33–n36.
 *
 * The screen is the batch's rows, so it is a configured `<WorkQueue>` rather
 * than a table written again: row filter, sort, page and the ticked selection
 * all live in the URL, and the send acts on exactly what the address bar says is
 * selected. Everything a batch has that a row does not — the file it came from,
 * the template extraction ran with, and the counts the send is judged against —
 * sits above the table.
 *
 * The hard block is in `batch-rows-queue.tsx`, where the send's preview is built.
 */
export function NoticeBatchScreen() {
  const { batchId = '' } = useParams()
  const repositories = useRepositories()
  const navigate = useNavigate()
  const toaster = useToaster()
  const user = useSessionStore((state) => state.user)

  /** Bumped by every write, so the queue and the counts re-read together. */
  const [revision, setRevision] = useState(0)
  const [startingOcr, setStartingOcr] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)

  const loaded = useResource(
    () => repositories.noticeBatches.get(batchId),
    `notice-batch:${batchId}:${revision}`,
  )
  const counts = useResource(
    () => repositories.noticeBatches.summary(batchId),
    `notice-batch:summary:${batchId}:${revision}`,
  )
  const context = useResource(async () => {
    const [companies, policies, templates] = await Promise.all([
      repositories.companies.list({ page: 1, pageSize: 200 }),
      repositories.policies.list({ page: 1, pageSize: 500 }),
      repositories.ocrTemplates.list({ page: 1, pageSize: 100 }),
    ])
    return { companies: companies.rows, policies: policies.rows, templates: templates.rows }
  }, 'notices:batch-context')

  const batch = loaded.data ?? null

  if (!user || context.data === null || (loaded.isLoading && batch === null)) {
    return (
      <div className={styles.loading} aria-busy="true">
        <Skeleton width="30%" height="2rem" />
        <Skeleton width="100%" height="18rem" />
      </div>
    )
  }

  if (batch === null) {
    return (
      <EmptyState
        variant="error"
        title="No notice batch answers to that address"
        explanation={`Nothing is stored under ${batchId}. It may have been uploaded in another session, or the link may be wrong.`}
        action={
          <Button variant="primary" onClick={() => void navigate('/renewals/notices')}>
            Back to the batches
          </Button>
        }
      />
    )
  }

  const { companies, policies, templates } = context.data
  const company = companies.find((row) => row.id === batch.companyId) ?? null
  const template = templates.find((row) => row.id === batch.ocrTemplateId) ?? null
  const summary = counts.data ?? null
  const canWork = can(user, 'edit', 'renewals')
  const actorId = user.id

  function afterWrite(title: string) {
    setRevision((held) => held + 1)
    setRefusal(null)
    toaster.notify({ title, tone: 'ok' })
  }

  const config = noticeRowsQueue({
    batch,
    title: `${batch.systemNo} · ${company?.shortName ?? 'Insurer not on file'}`,
    policies,
    canSend: canWork,
    load: (query) => repositories.noticeBatches.rows(batchId, query),
    send: async (rowIds) => {
      const outcome = await repositories.noticeBatches.send(batchId, {
        actorId,
        sentBy: actorId,
        selectedRowIds: rowIds,
      })
      if (!outcome.ok) return { ok: false, message: outcome.reason }
      setRevision((held) => held + 1)
      return {
        ok: true,
        message: `${rowIds.length} renewal ${rowIds.length === 1 ? 'notice' : 'notices'} sent, each with its own PDF and a renewal request.`,
      }
    },
    renderDrawer: (row) => (
      <NoticeRowDrawer
        key={`${row.id}-${revision}`}
        row={row}
        policies={policies}
        canEdit={canWork}
        onLink={async (policyId, confirmedFields) => {
          const outcome = await repositories.noticeBatches.linkRow(row.id, {
            actorId,
            matchedPolicyId: policyId,
            manuallyLinkedBy: actorId,
            confirmedFields,
          })
          if (outcome.ok) afterWrite(`Row ${row.rowNumber} linked`)
          return outcome
        }}
        onReject={async (reason, confirmedFields) => {
          const outcome = await repositories.noticeBatches.rejectRow(row.id, {
            actorId,
            rejectReason: reason,
            confirmedFields,
          })
          if (outcome.ok) afterWrite(`Row ${row.rowNumber} rejected`)
          return outcome
        }}
      />
    ),
  })

  return (
    <WorkQueue
      key={`${batchId}-${revision}`}
      config={config}
      actions={
        <Button variant="quiet" onClick={() => void navigate('/renewals/notices')}>
          All notice batches
        </Button>
      }
    >
      <div className={styles.header}>
        <p className={styles.facts}>
          <StatusPill tone={BATCH_TONE[batch.state]}>{BATCH_LABEL[batch.state]}</StatusPill>
          <span className={styles.printed}>{batch.fileName}</span>
          <span className={styles.absent}>expiry month {batch.expiryMonth}</span>
          <span className={styles.absent}>
            {template === null
              ? 'no extraction template configured for this insurer'
              : `read with ${template.label} v${template.version}`}
          </span>
          {batch.sentAt === null ? null : (
            <span className={styles.absent}>
              sent <DateTime value={batch.sentAt} mode="date" />
            </span>
          )}
        </p>

        {summary === null ? null : (
          <div className={styles.stats}>
            <StatCard label="Rows extracted" value={summary.total} />
            <StatCard label="Matched" value={summary.matched} tone="ok" />
            <StatCard label="Unmatched" value={summary.unmatched} tone="attn" />
            <StatCard label="Rejected" value={summary.rejected} tone="idle" />
            <StatCard
              label="Awaiting a person"
              value={summary.unconfirmedExtractions}
              tone="attn"
              meta="rows holding an unconfirmed read"
            />
          </div>
        )}

        {refusal === null ? null : (
          <div className={styles.blocked} role="alert">
            <Icon name="alert" size="md" />
            <div className={styles.blockedBody}>
              <p className={styles.blockedTitle}>Nothing was changed</p>
              <p className={styles.blockedReason}>{refusal}</p>
            </div>
          </div>
        )}

        {summary !== null && batch.state === 'review' && summary.unmatched > 0 ? (
          <div className={styles.needsPerson} role="note">
            <Icon name="alert" size="md" />
            <div className={styles.blockedBody}>
              <p className={styles.blockedTitle}>
                {summary.unmatched === 1
                  ? '1 row matched nothing this agency holds'
                  : `${summary.unmatched} rows matched nothing this agency holds`}
              </p>
              <p className={styles.blockedReason}>
                An unmatched row cannot go out in a bulk send — a letter with somebody else’s
                premium on it is not a data-quality problem, it is a letter. Open the row to link it
                to a policy by hand, or reject it with a reason.
              </p>
            </div>
          </div>
        ) : null}

        {batch.state === 'uploaded' && canWork ? (
          <div className={styles.section}>
            <p className={styles.prose}>
              This batch has been uploaded and nothing has been read off it yet. Extraction runs
              against{' '}
              {template === null
                ? 'this insurer’s template, once one is configured'
                : `${template.label} v${template.version}`}
              .
            </p>
            <div className={styles.rejectRow}>
              <Button variant="primary" icon="spark" onClick={() => setStartingOcr(true)}>
                Start extraction
              </Button>
            </div>
            {startingOcr ? (
              <ConfirmGate
                title={`Start extraction on ${batch.systemNo}`}
                changes={[
                  { key: 'state', label: 'Batch status', from: 'Uploaded', to: 'Extraction running' },
                  {
                    key: 'template',
                    label: 'Template',
                    to: template === null ? 'none configured' : `${template.label} v${template.version}`,
                  },
                ]}
                confirmLabel="Start extraction"
                receipt="Extraction is running. The rows appear here when it finishes."
                note="Every value it reads arrives unconfirmed. Nothing is filled onto a policy and nothing is sent until a person has checked each one against the notice."
                onCancel={() => setStartingOcr(false)}
                onConfirm={() => {
                  void repositories.noticeBatches.startOcr(batchId, { actorId }).then((outcome) => {
                    setStartingOcr(false)
                    if (!outcome.ok) {
                      setRefusal(outcome.reason)
                      return
                    }
                    afterWrite('Extraction started')
                  })
                }}
              />
            ) : null}
          </div>
        ) : null}

        {batch.state === 'ocr_running' ? (
          <p className={styles.prose}>
            Extraction is running against this insurer’s template. The rows appear here when it
            finishes, each value flagged until somebody has checked it against the paper.
          </p>
        ) : null}

        {batch.state === 'sent' ? (
          <p className={styles.prose}>
            This batch has gone out. Each matched customer received their own PDF and a renewal
            request; the rows below are what went, and what did not.{' '}
            <Link to="/renewals">See the renewal pool</Link>.
          </p>
        ) : null}
      </div>
    </WorkQueue>
  )
}

export default NoticeBatchScreen
