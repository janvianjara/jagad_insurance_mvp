import { useId, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import { Icon } from '../Icon'
import { useControlAria, useField } from './field-context'
import { cx } from './cx'
import styles from './FileDrop.module.css'

export type FileDropProps = {
  onFiles?: (files: File[]) => void
  accept?: string
  multiple?: boolean
  /** The instruction shown in the zone. */
  prompt?: string
  /** What is accepted, in the customer-facing words the checklist uses. */
  hint?: string
  /** Files already attached, owned by the caller. */
  files?: readonly File[]
  disabled?: boolean
  invalid?: boolean
  id?: string
  className?: string
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * The upload affordance for policy copies, cheques, claim documents and KYC
 * proofs. It only hands the files to the caller: nothing here reads a document,
 * and extraction results reach a form through `<OcrField>` (P-07), never
 * straight into a value.
 */
export function FileDrop({
  onFiles,
  accept,
  multiple = false,
  prompt = 'Drop files here',
  hint,
  files,
  disabled,
  invalid,
  id,
  className,
}: FileDropProps) {
  const generated = useId()
  const field = useField()
  const wiring = useControlAria({ id, invalid, disabled })
  const inputId = wiring.props.id ?? `${generated}-input`
  const [dragging, setDragging] = useState(false)

  function emit(list: FileList | null) {
    if (!list || list.length === 0) return
    onFiles?.(Array.from(list))
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    emit(event.target.files)
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragging(false)
    if (wiring.disabled) return
    emit(event.dataTransfer?.files ?? null)
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    if (!wiring.disabled) setDragging(true)
  }

  return (
    <div
      className={cx(styles.zone, className)}
      data-dragging={dragging || undefined}
      data-disabled={wiring.disabled || undefined}
      data-invalid={wiring.invalid || undefined}
      onDragOver={handleDragOver}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      <Icon name="folder" size="lg" />
      <input
        type="file"
        className={styles.native}
        id={inputId}
        accept={accept}
        multiple={multiple}
        disabled={wiring.props.disabled}
        aria-describedby={wiring.props['aria-describedby']}
        aria-labelledby={field?.labelId}
        onChange={handleChange}
      />
      <label className={styles.prompt} htmlFor={inputId}>
        {prompt} <span className={styles.trigger}>or browse</span>
      </label>
      {hint ? <span className={styles.hint}>{hint}</span> : null}
      {files && files.length > 0 ? (
        <ul className={styles.files}>
          {files.map((file) => (
            <li key={file.name} className={styles.file}>
              <Icon name="doc" size="sm" />
              <span className={styles.fileName}>{file.name}</span>
              <span className={styles.fileSize}>{formatSize(file.size)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
