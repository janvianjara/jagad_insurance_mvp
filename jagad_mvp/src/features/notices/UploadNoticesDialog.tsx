import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useRepositories } from '../../app/repositories-context'
import { useSessionStore } from '../../app/store'
import { ConfirmGate } from '../../components/guardrails'
import type { Company, OcrTemplate } from '../../data/repo'
import { Button } from '../../ui/Button'
import { Field, Input, QuickAdd, Select } from '../../ui/form'
import { Modal, useToaster } from '../../ui/surface'
import { CompanyQuickAdd, useMarketStore } from '../config/shared'
import styles from './Notices.module.css'

export type UploadNoticesDialogProps = {
  companies: readonly Company[]
  templates: readonly OcrTemplate[]
  onUploaded: () => void
}

/**
 * Canvas 5.3 — "Bulk-upload month's notices, all companies together".
 *
 * The upload records that a file arrived and which insurer's template will be
 * read against it. It extracts nothing: a batch lands in `uploaded`, and
 * extraction is a separate, deliberate move on the batch itself, because the
 * moment a screen both uploads and reads is the moment somebody stops looking
 * at what was read.
 */
export function UploadNoticesDialog({ companies, templates, onUploaded }: UploadNoticesDialogProps) {
  const repositories = useRepositories()
  const navigate = useNavigate()
  const toaster = useToaster()
  const user = useSessionStore((state) => state.user)

  /*
   * Insurers added to the panel during this session live in the configuration
   * store until a write API lands, so the picker reads both and dedupes on id —
   * the store hydrated from these same repositories.
   */
  const sessionCompanies = useMarketStore((state) => state.companies)
  const known = new Set(companies.map((row) => row.id))
  const panel = [
    ...companies.map((row) => ({ id: row.id, name: row.name })),
    ...sessionCompanies.filter((row) => !known.has(row.id)).map((row) => ({ id: row.id, name: row.name })),
  ]

  const [open, setOpen] = useState(false)
  const [companyId, setCompanyId] = useState('')
  const [fileName, setFileName] = useState('')
  const [expiryMonth, setExpiryMonth] = useState('')
  const [refusal, setRefusal] = useState<string | null>(null)

  const template =
    templates.find((row) => row.companyId === companyId && row.docType === 'renewal_notice' && row.active) ??
    null
  const company = panel.find((row) => row.id === companyId) ?? null
  const ready = user !== null && company !== null && fileName.trim() !== '' && expiryMonth !== ''

  function close() {
    setOpen(false)
    setRefusal(null)
  }

  async function upload() {
    if (!user || company === null) return
    const outcome = await repositories.noticeBatches.upload({
      actorId: user.id,
      companyId: company.id,
      fileName: fileName.trim(),
      expiryMonth,
      uploadedBy: user.id,
      ocrTemplateId: template?.id ?? null,
    })

    if (!outcome.ok) {
      setRefusal(outcome.reason)
      return
    }

    close()
    onUploaded()
    toaster.notify({ title: `${outcome.record.systemNo} uploaded`, tone: 'ok' })
    void navigate(`/renewals/notices/${outcome.record.id}`)
  }

  return (
    <>
      <Button variant="primary" icon="upload" onClick={() => setOpen(true)}>
        Upload notices
      </Button>

      <Modal
        open={open}
        onClose={close}
        title="Upload a month of renewal notices"
        dismissOnScrimClick={false}
      >
        <div className={styles.uploadForm}>
          <Field label="Insurer" required>
            <QuickAdd
              label="New company"
              form={(dismiss) => (
                <CompanyQuickAdd
                  onCancel={dismiss}
                  onCreated={(created) => {
                    setCompanyId(created.id)
                    dismiss()
                  }}
                />
              )}
            >
              <Select
                value={companyId}
                placeholder="Which company sent it"
                options={panel.map((row) => ({ value: row.id, label: row.name }))}
                onChange={(event) => setCompanyId(event.target.value)}
              />
            </QuickAdd>
          </Field>

          <Field
            label="File"
            required
            hint="The name of the PDF as the insurer sent it. The file itself is held in the document vault."
          >
            <Input
              value={fileName}
              onChange={(event) => setFileName(event.target.value)}
              autoComplete="off"
            />
          </Field>

          <Field label="Expiry month" required hint="The month the notices cover, as YYYY-MM.">
            <Input
              value={expiryMonth}
              onChange={(event) => setExpiryMonth(event.target.value)}
              placeholder="2026-09"
              autoComplete="off"
            />
          </Field>

          {refusal === null ? null : (
            <p className={styles.blockedReason} role="alert">
              {refusal}
            </p>
          )}

          <ConfirmGate
            title="Record this batch"
            changes={
              ready && company !== null
                ? [
                    { key: 'company', label: 'Insurer', to: company.name },
                    { key: 'file', label: 'File', to: fileName.trim() },
                    { key: 'month', label: 'Expiry month', to: expiryMonth },
                    {
                      key: 'template',
                      label: 'Extraction template',
                      to:
                        template === null
                          ? 'none configured for this insurer yet'
                          : `${template.label} v${template.version}`,
                    },
                  ]
                : []
            }
            confirmLabel="Record the batch"
            receipt="Recorded. Start extraction on the batch when you are ready."
            note="Nothing is read off the file by this step and nothing goes to a customer. Extraction is a separate move on the batch."
            onCancel={close}
            onConfirm={() => void upload()}
          />
        </div>
      </Modal>
    </>
  )
}
