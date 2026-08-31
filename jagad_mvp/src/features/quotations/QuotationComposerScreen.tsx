import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { useRepositories } from '../../app/repositories-context'
import { useSessionStore } from '../../app/store'
import { can } from '../../domain/permissions'
import {
  awardKeyFor,
  dealHasLineItems,
  finalPayablePremiumPresentPerColumn,
  quotationLostRequiresReason,
  resolveSalesCredit,
  revisionRequiresReason,
  shouldAutoShare,
  subAgentRequiresAgent,
} from '../../domain/workflows'
import type { QuotationColumn, QuotationOrigin } from '../../domain/workflows'
import type { DomainEvent } from '../../domain/events'
import { useResource } from '../../lib/useResource'
import { PageHeader } from '../../components/AppShell'
import { BenefitMatrix, draftFromLines, matrixReadyToGenerate, openMatrixDraft, premiumStopMessage, toQuotationLines } from '../../components/BenefitMatrix'
import type { MatrixColumn, MatrixDraft } from '../../components/BenefitMatrix'
import { DocumentViewer, buildQuotationDocument } from '../../components/DocumentViewer'
import type { QuotationDocument } from '../../components/DocumentViewer'
import { ConfirmGate } from '../../components/guardrails'
import type { ConfirmChange } from '../../components/guardrails'
import type { MutationResult, Quotation, QuotationLine } from '../../data/repo'
import { Button } from '../../ui/Button'
import { Icon } from '../../ui/Icon'
import { EmptyState, Skeleton } from '../../ui/data'
import { Checkbox, Field, Input, Textarea } from '../../ui/form'
import { StatusPill } from '../../ui/signal'
import { Panel, useToaster } from '../../ui/surface'
import { KeyValueList, Money as AmountText, RecordId } from '../../ui/type'
import type { ComposerData } from './composer-data'
import { loadComposer } from './composer-data'
import {
  QUOTATION_LABEL,
  QUOTATION_TONE,
  columnsFromLines,
  columnsFromProducts,
  dealLineItemsFor,
  documentColumns,
  documentRows,
  linesOfVersion,
  nameOf,
  personsFor,
  versionsOf,
} from './quotation-view'
import styles from './QuotationComposer.module.css'

/**
 * The quotation composer — plan §5 Composer row, §9's quotation machine, canvas
 * 2.1 to 2.7. This is D18, the client's headline change.
 *
 * The screen owns no rule. Every move below calls a repository, which asks the
 * machine, which either allows it or refuses with a sentence written for the
 * person reading it — and that sentence is what a blocked control shows.
 *
 * Three things here are the §9 bullets made physical:
 *
 *   Generate is blocked until every column carries a typed Final Payable
 *   Premium, and the disabled button carries `premiumStopMessage` — word for
 *   word the sentence `finalPayablePremiumPresentPerColumn` would refuse with.
 *   Nothing on this screen puts a figure into a column: the only writer is the
 *   per-column amount control inside `<BenefitMatrix>`, which reports what was
 *   typed and nothing else (D3). This file imports no amount control, no premium
 *   setter and no money constructor, and a test in this module reads the source
 *   to keep it that way.
 *
 *   Auto-share is a configuration fork, not a code branch. The recipe an admin
 *   edits is read here and handed to `shouldAutoShare`, and the same call decides
 *   it for a generated quotation and for an uploaded one — the origin is passed
 *   and deliberately not consulted, because that identity is the rule (FR-06.9).
 *
 *   A revision opens v+1 and leaves what the customer already saw alone. Prior
 *   versions are read back out of `allLines` and rendered read-only, both as the
 *   matrix they were and as the document that was sent.
 *
 * The matrix is editable in exactly the two states where the repository can
 * write lines — `draft` and `revision_requested`. In every later state the
 * columns are what was recorded, so they render as recorded.
 */
export function QuotationComposerScreen() {
  const { id = '', version: versionParam } = useParams()
  const [searchParams] = useSearchParams()
  const repositories = useRepositories()
  const navigate = useNavigate()
  const toaster = useToaster()
  const user = useSessionStore((state) => state.user)

  const cols = searchParams.get('cols') ?? ''
  const [reads, setReads] = useState(0)
  const loaded = useResource(
    () => loadComposer(repositories, id, cols),
    `quotation:${id}:${cols}:${reads}`,
  )

  const [draft, setDraft] = useState<MatrixDraft | null>(null)
  const [seed, setSeed] = useState('')
  const [armed, setArmed] = useState<string | null>(null)
  const [refusal, setRefusal] = useState<string | null>(null)
  const [accepted, setAccepted] = useState<readonly string[]>([])
  const [lostReason, setLostReason] = useState('')
  const [revisionReason, setRevisionReason] = useState('')
  const [uploadName, setUploadName] = useState('')
  const [sent, setSent] = useState<SendReceipt | null>(null)

  const data = loaded.data ?? null
  const viewing = versionParam ? Number(versionParam) : null

  // Seeding the draft is a render-phase adopt, not an effect: the key names the
  // record, its state and its version, so a move that changes any of them reopens
  // the matrix and an edit inside one state is never thrown away.
  if (data) {
    const key = `${id}:${data.quotation.status}:${data.quotation.version}:${cols}`
    if (seed !== key) {
      setSeed(key)
      setDraft(openDraft(data, cols))
    }
  }

  if (!user || !data || !draft) {
    if (loaded.status === 'ready' && !loaded.data) {
      return (
        <EmptyState
          variant="error"
          title="No quotation answers to that address"
          explanation={`Nothing is stored under ${id}. It may have been raised in another session, or the link may be wrong.`}
          action={
            <Button variant="primary" onClick={() => void navigate('/quotations')}>
              Back to the queue
            </Button>
          }
        />
      )
    }
    return (
      <div className={styles.loading} aria-busy="true">
        <Skeleton width="30%" height="2rem" />
        <Skeleton width="100%" height="20rem" />
      </div>
    )
  }

  const { quotation, customer, allLines, users, autoShare, channel } = data
  const actorId = user.id
  const mayAct = can(user, 'edit', 'quotations')
  const liveLines = linesOfVersion(allLines, quotation.version)
  const versions = versionsOf(allLines)
  /*
   * Which states can still be typed into.
   *
   * `composed` MUST be here. Section 9's only move out of composed is `generated`,
   * guarded by finalPayablePremiumPresentPerColumn - so the premium has to be
   * typed while the quotation is composed. Leaving composed read-only deadlocked
   * the headline flow: the banner said "Final Payable Premium is missing - type
   * the figure from each insurer's quote", the matrix underneath refused to
   * accept one, and Generate could never unblock. The premium-mode radios were
   * absent for the same reason, which is what made it look like the screen had
   * half vanished.
   */
  const editable =
    quotation.status === 'draft' ||
    quotation.status === 'composed' ||
    quotation.status === 'revision_requested'
  const customerName = customer?.fullName ?? quotation.customerId

  function fail(reason: string) {
    // The machine's own words. Nothing was written.
    setRefusal(reason)
    toaster.notify({ title: 'Nothing was changed', detail: reason, tone: 'bad' })
  }

  function reread() {
    setReads((previous) => previous + 1)
  }

  /** FR-06.9's fork. One switch, both origins, asked the same way for each. */
  async function applyShareFork(origin: QuotationOrigin) {
    if (!shouldAutoShare({ autoShare }, origin)) {
      setSent({ origin, auto: false, channel, events: [] })
      toaster.notify({
        title: 'Generated, and not sent',
        detail: 'Auto-share is off in configuration, so a person sends this one.',
        tone: 'warn',
      })
      return
    }

    const shared = await repositories.quotations.share(id, { actorId, channel })
    if (!shared.ok) {
      fail(shared.reason)
      return
    }
    setSent({ origin, auto: true, channel, events: [...shared.events] })
    toaster.notify({ title: `Sent to ${customerName} on ${channel}`, tone: 'ok' })
  }

  async function runGenerate(origin: QuotationOrigin) {
    setArmed(null)
    setRefusal(null)
    if (!draft) return

    if (quotation.status === 'draft') {
      const composed = await repositories.quotations.compose(id, {
        actorId,
        benefitRows: draft.rows,
        lines: toQuotationLines(draft),
      })
      if (!composed.ok) {
        fail(composed.reason)
        return
      }
    }

    const generated: MutationResult<Quotation> =
      quotation.status === 'revision_requested'
        ? await repositories.quotations.regenerate(id, {
            actorId,
            revisionReason: quotation.revisionReason ?? revisionReason,
            lines: toQuotationLines(draft),
          })
        : await repositories.quotations.generate(id, { actorId })

    if (!generated.ok) {
      fail(generated.reason)
      reread()
      return
    }

    await applyShareFork(origin)
    reread()
  }

  async function runShare() {
    setArmed(null)
    setRefusal(null)
    const shared = await repositories.quotations.share(id, { actorId, channel })
    if (!shared.ok) {
      fail(shared.reason)
      return
    }
    setSent({ origin: 'generated', auto: false, channel, events: [...shared.events] })
    toaster.notify({ title: `Sent to ${customerName} on ${channel}`, tone: 'ok' })
    reread()
  }

  async function runRevision() {
    setArmed(null)
    setRefusal(null)
    const outcome = await repositories.quotations.requestRevision(id, {
      actorId,
      revisionReason: revisionReason.trim(),
    })
    if (!outcome.ok) {
      fail(outcome.reason)
      return
    }
    toaster.notify({ title: `Version ${quotation.version + 1} is open for editing`, tone: 'ok' })
    reread()
  }

  async function runLost() {
    setArmed(null)
    setRefusal(null)
    const outcome = await repositories.quotations.markLost(id, {
      actorId,
      lostReason: lostReason.trim(),
    })
    if (!outcome.ok) {
      fail(outcome.reason)
      return
    }
    toaster.notify({ title: 'Marked lost, with the reason on the record', tone: 'ok' })
    reread()
  }

  async function runWon() {
    setArmed(null)
    setRefusal(null)
    const acceptedLines = liveLines.filter((line) => accepted.includes(line.columnKey))

    // Carry first. A quotation must not reach `won` when the columns it was won
    // on cannot produce line items — that leaves a sale recorded with nothing
    // behind it, and nothing downstream can tell the difference.
    const carried = dealLineItemsFor(acceptedLines, quotation.premiumMode)
    if (!carried.ok) {
      fail(carried.reason)
      return
    }

    const credit = resolveSalesCredit({
      quotation: { agentId: quotation.agentId, subAgentId: quotation.subAgentId },
      customer: customer
        ? { agentId: customer.agentId, subAgentId: customer.subAgentId }
        : null,
    })
    // The refusal the commission chain would raise at booking, asked now.
    const arrangement = subAgentRequiresAgent(credit)
    if (!arrangement.ok) {
      fail(arrangement.reason)
      return
    }

    const acceptedColumnKeys = acceptedLines.map((line) => line.columnKey)
    const awardKey = awardKeyFor(id, quotation.version, acceptedColumnKeys)

    /*
     * The replay check, and the reason a second click is harmless.
     *
     * The handoff is three writes, and a person who clicks twice — or whose
     * first attempt failed halfway — must not end up with two applications for
     * one sale. Asking for the award's existing deal first turns the repeat into
     * a no-op that lands them on the application they already have. The deal
     * machine refuses a duplicate as well; this is what stops the refusal being
     * the normal experience of clicking twice.
     */
    const already = await repositories.deals.byAwardKey(awardKey)
    if (already) {
      toaster.notify({ title: `${already.systemNo} is already open for this award`, tone: 'ok' })
      void navigate(`/deals/${already.id}`)
      return
    }

    // Record the decision. Nothing is placed yet and `won` is still out of
    // reach — that is the whole point of the state existing.
    const awarded = await repositories.quotations.markAwarded(id, {
      actorId,
      acceptedColumnKeys,
    })
    if (!awarded.ok) {
      fail(awarded.reason)
      return
    }

    const deal = await repositories.deals.create({
      actorId,
      quotationId: id,
      quotationVersion: quotation.version,
      acceptedColumnKeys,
      customerId: quotation.customerId,
      ownerId: quotation.ownerId,
      // One rung decides the agent. Reading the agent off the quotation and the
      // sub-agent off an unrelated record would pair two people who were never
      // on the same arrangement, and the sub-agent share is carved from that
      // agent's own cut — so the pairing is the fact, not either half of it.
      agentId: credit.agentId,
      subAgentId: credit.subAgentId,
      salesCreditSource: credit.source,
      lineItems: carried.lineItems,
    })
    if (!deal.ok) {
      // The deal machine's own sentence, unedited — including the zero
      // line-item block and the duplicate-award refusal. The quotation stays in
      // `awarded`: the decision was real even though the application failed, and
      // rolling it back would lose the fact that the customer said yes.
      fail(deal.reason)
      reread()
      return
    }

    // `won` last, and only with the application in hand. The guard on this
    // transition is what makes the status mean what every screen reads it as.
    const won = await repositories.quotations.markWon(id, { actorId, dealId: deal.record.id })
    if (!won.ok) {
      fail(won.reason)
      reread()
      return
    }

    toaster.notify({ title: `${deal.record.systemNo} opened from this quotation`, tone: 'ok' })
    void navigate(`/deals/${deal.record.id}`)
  }

  const header = (
    <PageHeader
      breadcrumb={<Link to="/quotations">Quotations</Link>}
      title={customerName}
      meta={
        <>
          <RecordId systemNo={quotation.systemNo} showInsurer={false} />
          <StatusPill tone={QUOTATION_TONE[quotation.status]}>
            {QUOTATION_LABEL[quotation.status]}
          </StatusPill>
          <span className={styles.version}>Version {viewing ?? quotation.version}</span>
        </>
      }
    />
  )

  const switcher = (
    <nav className={styles.versions} aria-label="Versions">
      {versions.map((version) => {
        const current = version === quotation.version
        const active = viewing === null ? current : viewing === version
        return (
          <Link
            key={version}
            className={styles.versionLink}
            to={current ? `/quotations/${id}` : `/quotations/${id}/v/${version}`}
            aria-current={active ? 'page' : undefined}
            data-current={active ? 'true' : undefined}
          >
            Version {version}
            {current ? ' — current' : ''}
          </Link>
        )
      })}
    </nav>
  )

  /* ------------------------------------------------------- a prior version */

  if (viewing !== null && viewing !== quotation.version) {
    const priorLines = linesOfVersion(allLines, viewing)
    if (priorLines.length === 0) {
      return (
        <>
          {header}
          <EmptyState
            title={`Version ${viewing} was never recorded`}
            explanation="Only versions that were generated keep their columns. Use the switcher to open one that was."
          />
        </>
      )
    }

    const priorColumns = columnsFromLines(priorLines, data.companies, data.products)
    const priorDraft = draftFromLines(
      quotation.benefitRows,
      priorColumns,
      priorLines,
      quotation.premiumMode,
    )

    return (
      <>
        {header}
        <div className={styles.screen}>
          {switcher}
          <p className={styles.archived} role="status">
            <Icon name="lock" size="sm" />
            Version {viewing} is archived. It reads exactly as the customer received it and cannot
            be edited.
          </p>
          <Panel title={`Version ${viewing}, as sent`}>
            <BenefitMatrix draft={priorDraft} onDraftChange={noop} readOnly />
          </Panel>
          <Panel title="The document that went out">
            <DocumentViewer document={documentFor(data, viewing, priorLines, priorColumns)} />
          </Panel>
        </div>
      </>
    )
  }

  /* ------------------------------------------------------- the live version */

  const storedColumns: readonly QuotationColumn[] = liveLines.map(toMachineColumn)
  const storedVerdict = finalPayablePremiumPresentPerColumn({
    columns: storedColumns,
    version: quotation.version,
  })

  // One reading of readiness, from the same functions the machine uses.
  const ready = editable ? matrixReadyToGenerate(draft) : storedVerdict.ok
  const stop = editable
    ? premiumStopMessage(draft)
    : storedVerdict.ok
      ? null
      : storedVerdict.reason

  const generateColumns = editable ? draft.columns : columnsFromLines(liveLines, data.companies, data.products)
  const generateChanges: readonly ConfirmChange[] = generateColumns.map((column) => ({
    key: column.columnKey,
    label: column.label,
    to: (
      <AmountText
        paise={premiumOf(draft, liveLines, column, editable)}
        absentText="not recorded"
        emphasis="strong"
      />
    ),
  }))

  const revisionVerdict = revisionRequiresReason({
    columns: [],
    version: quotation.version,
    revisionReason,
  })
  const lostVerdict = quotationLostRequiresReason({
    columns: [],
    version: quotation.version,
    lostReason,
  })
  const acceptedLines = liveLines.filter((line) => accepted.includes(line.columnKey))
  // The carriage is attempted before the deal is offered, so a column with no
  // typed premium blocks here with its own sentence rather than at creation.
  const carriage = dealLineItemsFor(acceptedLines, quotation.premiumMode)
  // `refuse` is a machine primitive and stays inside the domain, so a carriage
  // failure is reported in the same two fields the control already reads.
  const dealVerdict = carriage.ok
    ? dealHasLineItems({ lineItems: carriage.lineItems })
    : { ok: false as const, reason: carriage.reason }

  const showDocument =
    liveLines.length > 0 &&
    (quotation.status === 'generated' ||
      quotation.status === 'shared' ||
      quotation.status === 'won' ||
      quotation.status === 'lost')

  return (
    <>
      {header}

      <div className={styles.screen}>
        {versions.length > 0 ? switcher : null}

        {refusal ? (
          <p className={styles.refusal} role="alert">
            <Icon name="alert" size="sm" />
            {refusal}
          </p>
        ) : null}

        {quotation.status === 'revision_requested' ? (
          <p className={styles.notice} role="status">
            <Icon name="edit" size="sm" />
            Version {quotation.version + 1} is being prepared. {quotation.revisionReason}
          </p>
        ) : null}

        {quotation.status === 'lost' ? (
          <p className={styles.notice} role="status">
            <Icon name="alert" size="sm" />
            Lost. {quotation.lostReason}
          </p>
        ) : null}

        <Panel
          title="The comparison"
          description={
            editable
              ? 'Rows are the union of the picked products’ benefits, each column pre-filled from that company’s own brochure. Add anything the catalogue does not carry as a row of its own.'
              : 'These columns are recorded as they were saved. A revision opens a new version rather than editing this one.'
          }
        >
          {draft.columns.length === 0 ? (
            <EmptyState
              title="This quotation has no columns yet"
              explanation="Pick the companies and products to compare, and the composer opens on the union of their benefits."
              action={
                <Button variant="primary" onClick={() => void navigate('/quotations/new')}>
                  Pick the policies
                </Button>
              }
            />
          ) : (
            <BenefitMatrix
              draft={draft}
              onDraftChange={setDraft}
              readOnly={!editable || !mayAct}
            />
          )}
        </Panel>

        {quotation.status === 'draft' ||
        quotation.status === 'composed' ||
        quotation.status === 'revision_requested' ? (
          <Panel
            title={
              quotation.status === 'revision_requested'
                ? `Generate version ${quotation.version + 1}`
                : 'Generate the quotation'
            }
            description="The figure in each column is the one the insurer quoted and a person typed. The platform does not work it out, and will not generate until every column carries one."
          >
            <div className={styles.actions}>
              <Button
                variant="primary"
                icon="doc"
                disabled={!ready || !mayAct || draft.columns.length === 0}
                aria-describedby={ready ? undefined : 'generate-stop'}
                onClick={() => {
                  setRefusal(null)
                  setArmed('generate')
                }}
              >
                {quotation.status === 'revision_requested'
                  ? `Generate version ${quotation.version + 1}`
                  : 'Generate the quotation'}
              </Button>

              <div className={styles.upload}>
                <Field
                  label="Or record the insurer’s own quotation"
                  hint="An uploaded quotation takes the same auto-share fork a generated one does."
                >
                  <Input
                    value={uploadName}
                    onChange={(event) => setUploadName(event.target.value)}
                    placeholder="File you received"
                    autoComplete="off"
                  />
                </Field>
                <Button
                  variant="quiet"
                  icon="upload"
                  disabled={!ready || !mayAct || uploadName.trim() === ''}
                  aria-describedby={ready ? undefined : 'generate-stop'}
                  onClick={() => {
                    setRefusal(null)
                    setArmed('upload')
                  }}
                >
                  Record an uploaded quotation
                </Button>
              </div>
            </div>

            {stop ? (
              <p className={styles.stop} role="status" id="generate-stop" data-generate-stop="">
                <Icon name="alert" size="sm" />
                {stop}
              </p>
            ) : null}

            {armed === 'generate' ? (
              <ConfirmGate
                title="Generate and send this quotation"
                changes={generateChanges}
                note={
                  autoShare
                    ? `Auto-share is on, so ${customerName} receives this on ${channel} as soon as it exists, and the send is logged.`
                    : 'Auto-share is off in configuration, so this is generated and left for a person to send.'
                }
                confirmLabel="Generate"
                receipt="Generated. The columns above are what went on the document."
                onCancel={() => setArmed(null)}
                onConfirm={() => void runGenerate('generated')}
              />
            ) : null}

            {armed === 'upload' ? (
              <ConfirmGate
                title="Record the insurer’s own quotation"
                changes={[
                  { key: 'file', label: 'File recorded', to: uploadName.trim() },
                  ...generateChanges,
                ]}
                note={
                  autoShare
                    ? `Auto-share applies identically to an uploaded quotation: ${customerName} receives this on ${channel}, and the send is logged.`
                    : 'Auto-share is off in configuration, so this is recorded and left for a person to send.'
                }
                confirmLabel="Record it"
                receipt="Recorded. It took the same share fork a generated quotation takes."
                onCancel={() => setArmed(null)}
                onConfirm={() => void runGenerate('uploaded')}
              />
            ) : null}
          </Panel>
        ) : null}

        {sent ? <SentPanel receipt={sent} data={data} /> : null}
        {sent === null && data.messages.length > 0 ? (
          <SentPanel
            receipt={{ origin: 'generated', auto: autoShare, channel, events: [] }}
            data={data}
          />
        ) : null}

        {quotation.status === 'generated' ? (
          <Panel
            title="Send it to the customer"
            description="Auto-share is off, so this goes out when a person says so."
          >
            <Button variant="primary" icon="msg" disabled={!mayAct} onClick={() => setArmed('share')}>
              Send to the customer
            </Button>
            {armed === 'share' ? (
              <ConfirmGate
                title="Send this quotation"
                changes={[
                  { key: 'to', label: 'To', to: customerName },
                  { key: 'channel', label: 'Channel', to: channel },
                  { key: 'state', label: 'Quotation', from: 'Generated', to: 'Shared' },
                ]}
                note="The send is logged against this quotation."
                confirmLabel="Send"
                receipt="Sent, and logged."
                onCancel={() => setArmed(null)}
                onConfirm={() => void runShare()}
              />
            ) : null}
          </Panel>
        ) : null}

        {quotation.status === 'shared' ? (
          <Panel
            title="The customer’s answer"
            description="Won opens a deal from the accepted columns. Both a revision and a loss need a reason before anything is written."
          >
            <div className={styles.answer}>
              <fieldset className={styles.acceptedSet}>
                <legend className={styles.legend}>Accepted columns</legend>
                {liveLines.map((line) => (
                  <Checkbox
                    key={line.columnKey}
                    label={line.label}
                    description={
                      <AmountText
                        paise={line.finalPayablePremium?.paise ?? null}
                        absentText="not recorded"
                      />
                    }
                    checked={accepted.includes(line.columnKey)}
                    onChange={() =>
                      setAccepted((current) =>
                        current.includes(line.columnKey)
                          ? current.filter((value) => value !== line.columnKey)
                          : [...current, line.columnKey],
                      )
                    }
                  />
                ))}
              </fieldset>

              <div className={styles.actions}>
                <Button
                  variant="primary"
                  icon="check"
                  disabled={!dealVerdict.ok || !mayAct}
                  aria-describedby={dealVerdict.ok ? undefined : 'won-stop'}
                  onClick={() => {
                    setRefusal(null)
                    setArmed('won')
                  }}
                >
                  Mark won and open the deal
                </Button>
              </div>

              {dealVerdict.ok ? null : (
                <p className={styles.stop} role="status" id="won-stop" data-won-stop="">
                  <Icon name="alert" size="sm" />
                  {dealVerdict.reason}
                </p>
              )}

              {armed === 'won' ? (
                <ConfirmGate
                  title="Mark won and open the deal"
                  changes={[
                    { key: 'state', label: 'Quotation', from: 'Shared', to: 'Won' },
                    ...acceptedLines.map((line) => ({
                      key: line.columnKey,
                      label: 'Line item',
                      to: line.label,
                    })),
                    { key: 'customer', label: 'Customer', to: customerName },
                    {
                      key: 'agent',
                      label: 'Agent',
                      to: quotation.agentId ?? 'None recorded',
                    },
                    {
                      key: 'subAgent',
                      label: 'Sub-agent',
                      to: customer?.subAgentId ?? 'None recorded',
                    },
                  ]}
                  note="The deal takes its own application number and carries these line items into policy entry."
                  confirmLabel="Mark won"
                  receipt="Won. The deal is open."
                  onCancel={() => setArmed(null)}
                  onConfirm={() => void runWon()}
                />
              ) : null}

              <Field
                label="Why is a revision needed?"
                required
                hint="A revision opens the next version and leaves this one exactly as the customer saw it."
              >
                <Textarea
                  value={revisionReason}
                  onChange={(event) => setRevisionReason(event.target.value)}
                />
              </Field>
              <div className={styles.actions}>
                <Button
                  variant="quiet"
                  icon="edit"
                  disabled={!revisionVerdict.ok || !mayAct}
                  aria-describedby={revisionVerdict.ok ? undefined : 'revision-stop'}
                  onClick={() => {
                    setRefusal(null)
                    setArmed('revision')
                  }}
                >
                  Open a revision
                </Button>
              </div>
              {revisionVerdict.ok ? null : (
                <p className={styles.stop} role="status" id="revision-stop" data-revision-stop="">
                  <Icon name="alert" size="sm" />
                  {revisionVerdict.reason}
                </p>
              )}
              {armed === 'revision' ? (
                <ConfirmGate
                  title="Open a revision"
                  changes={[
                    {
                      key: 'version',
                      label: 'Version',
                      from: `v${quotation.version}`,
                      to: `v${quotation.version + 1}`,
                    },
                    { key: 'reason', label: 'Reason', to: revisionReason.trim() },
                    {
                      key: 'prior',
                      label: `Version ${quotation.version}`,
                      to: 'Archived, and still viewable',
                    },
                  ]}
                  note="The customer is not told yet. The new version is generated and shared like any other."
                  confirmLabel="Open the revision"
                  receipt="A new version is open."
                  onCancel={() => setArmed(null)}
                  onConfirm={() => void runRevision()}
                />
              ) : null}

              <Field
                label="Why was it lost?"
                required
                hint="The mandatory reason is what makes lost-reason reporting worth reading."
              >
                <Textarea
                  value={lostReason}
                  onChange={(event) => setLostReason(event.target.value)}
                />
              </Field>
              <div className={styles.actions}>
                <Button
                  variant="danger"
                  disabled={!lostVerdict.ok || !mayAct}
                  aria-describedby={lostVerdict.ok ? undefined : 'lost-stop'}
                  onClick={() => {
                    setRefusal(null)
                    setArmed('lost')
                  }}
                >
                  Mark lost
                </Button>
              </div>
              {lostVerdict.ok ? null : (
                <p className={styles.stop} role="status" id="lost-stop" data-lost-stop="">
                  <Icon name="alert" size="sm" />
                  {lostVerdict.reason}
                </p>
              )}
              {armed === 'lost' ? (
                <ConfirmGate
                  title="Mark this quotation lost"
                  changes={[
                    { key: 'state', label: 'Quotation', from: 'Shared', to: 'Lost' },
                    { key: 'reason', label: 'Reason', to: lostReason.trim() },
                  ]}
                  note="The reason is reportable. Nothing further moves from lost."
                  confirmLabel="Mark lost"
                  receipt="Marked lost, with the reason on the record."
                  onCancel={() => setArmed(null)}
                  onConfirm={() => void runLost()}
                />
              ) : null}
            </div>
          </Panel>
        ) : null}

        {quotation.status === 'won' ? (
          <Panel title="Won" description="The deal carries these line items into policy entry.">
            <p className={styles.wonNote}>
              <Icon name="check" size="sm" />
              Accepted at{' '}
              <AmountText
                paise={quotation.finalPayablePremium?.paise ?? null}
                absentText="a figure that was not recorded"
                emphasis="strong"
              />
              , as typed from the insurer’s quote.
            </p>
            <Link className={styles.dealLink} to="/deals">
              Open the deals queue
            </Link>
          </Panel>
        ) : null}

        {showDocument ? (
          <Panel
            title="The document"
            description="One sheet per company, or all of them side by side. Every figure on it was typed."
          >
            <DocumentViewer
              document={documentFor(
                data,
                quotation.version,
                liveLines,
                columnsFromLines(liveLines, data.companies, data.products),
              )}
            />
          </Panel>
        ) : null}

        <Panel title="The record" level={3}>
          <KeyValueList
            columns={2}
            items={[
              { key: 'owner', label: 'Owner', value: nameOf(users, quotation.ownerId) },
              { key: 'customer', label: 'Customer', value: customerName },
              {
                key: 'agent',
                label: 'Agent',
                value: agentName(data.agents, quotation.agentId),
              },
              {
                key: 'subAgent',
                label: 'Sub-agent',
                value: agentName(data.agents, customer?.subAgentId ?? null),
              },
              {
                key: 'autoShare',
                label: 'Auto-share',
                value: autoShare
                  ? `On — quotations go out on ${channel} as soon as they exist`
                  : 'Off — a person sends each quotation',
              },
              {
                key: 'inquiry',
                label: 'From inquiry',
                // The system number, not the storage id: INQ-1025 is what the
                // person sees on every other screen and says down the phone.
                value: data.inquiryNo ?? 'Raised directly',
              },
            ]}
          />
        </Panel>
      </div>
    </>
  )
}

/* ------------------------------------------------------------------ helpers */

type SendReceipt = {
  readonly origin: QuotationOrigin
  readonly auto: boolean
  readonly channel: string
  readonly events: readonly DomainEvent[]
}

const ORIGIN_LABEL: Readonly<Record<QuotationOrigin, string>> = {
  generated: 'Generated in the composer',
  uploaded: 'Uploaded from the insurer',
}

/**
 * The send, as evidence — canvas 2.4's "logged".
 *
 * The origin is printed beside the fork's answer on purpose: the two rows
 * together are the claim FR-06.9 makes, that one switch governs both.
 */
function SentPanel({ receipt, data }: { receipt: SendReceipt; data: ComposerData }) {
  return (
    <Panel
      title="Sent to the customer"
      description="What went out, on which channel, and the log it left behind."
    >
      <KeyValueList
        columns={2}
        items={[
          { key: 'origin', label: 'Origin', value: ORIGIN_LABEL[receipt.origin] },
          { key: 'channel', label: 'Channel', value: receipt.channel },
          {
            key: 'fork',
            label: 'Auto-share',
            value: receipt.auto
              ? 'On — sent as soon as the quotation existed'
              : 'Off — sent when a person asked',
          },
        ]}
      />
      <ul className={styles.log} data-send-log="">
        {receipt.events.map((event, index) => (
          <li key={`${event.name}-${index}`} data-event={event.name}>
            {event.name}
          </li>
        ))}
        {data.messages.map((message) => (
          <li key={message.id} data-message={message.id}>
            {message.templateKey} · {message.channel} · {message.toName}
          </li>
        ))}
      </ul>
    </Panel>
  )
}

function noop(): void {
  // A read-only matrix reports no edits. Nothing to do, and nothing to write.
}

function toMachineColumn(line: QuotationLine): QuotationColumn {
  return {
    label: line.label,
    companyId: line.companyId,
    productId: line.productId,
    ...(line.finalPayablePremium ? { finalPayablePremium: line.finalPayablePremium } : {}),
    ...(line.finalPremiumSource ? { finalPremiumSource: line.finalPremiumSource } : {}),
  }
}

/** Reads a figure back for the preview. It reads; it never supplies one. */
function premiumOf(
  draft: MatrixDraft,
  lines: readonly QuotationLine[],
  column: MatrixColumn,
  editable: boolean,
): number | null {
  if (editable) return draft.premiums[column.columnKey]?.paise ?? null
  return lines.find((line) => line.columnKey === column.columnKey)?.finalPayablePremium?.paise ?? null
}

/** The opening state: saved columns when there are any, the picked ones otherwise. */
function openDraft(data: ComposerData, cols: string): MatrixDraft {
  const live = linesOfVersion(data.allLines, data.quotation.version)

  if (live.length > 0) {
    return draftFromLines(
      data.quotation.benefitRows,
      columnsFromLines(live, data.companies, data.products),
      live,
      data.quotation.premiumMode,
    )
  }

  const order = cols.split(',').map((value) => value.trim()).filter(Boolean)
  const picked = order
    .map((productId) => data.products.find((product) => product.id === productId))
    .filter((product) => product !== undefined)

  return openMatrixDraft({
    columns: columnsFromProducts(picked, data.companies),
    benefitItems: data.benefitItems,
    mapsByProduct: data.mapsByProduct,
    premiumMode: data.quotation.premiumMode,
  })
}

function documentFor(
  data: ComposerData,
  version: number,
  lines: readonly QuotationLine[],
  columns: readonly MatrixColumn[],
): QuotationDocument {
  const { quotation, customer, members, users, agencyName } = data
  return buildQuotationDocument({
    systemNo: quotation.systemNo,
    version,
    issuedOn: quotation.sharedAt ?? quotation.createdAt,
    customerName: customer?.fullName ?? quotation.customerId,
    persons: personsFor(customer, members),
    rows: documentRows(quotation.benefitRows),
    columns: documentColumns(lines, columns),
    premiumMode: quotation.premiumMode,
    preparedBy: nameOf(users, quotation.ownerId),
    agencyName,
  })
}

/** An agent id is a storage key; a person needs the name against it. */
function agentName(agents: readonly { id: string; name: string }[], id: string | null): string {
  if (!id) return 'None recorded'
  return agents.find((agent) => agent.id === id)?.name ?? id
}

export default QuotationComposerScreen
