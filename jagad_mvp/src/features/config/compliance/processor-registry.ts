/**
 * The processor registry — FR-20.6.
 *
 * The vendors that handle personal data on the agency's behalf: the WhatsApp
 * Business Solution Provider, the SMS gateway, the SMTP host and the OCR service.
 * Under DPDP the agency stays the data fiduciary for every one of them, so the
 * register has to be able to say who they are, what each of them sees, where it
 * goes and under what contract.
 *
 * ## It keeps no list of its own
 *
 * The rows come from `IntegrationConfig` — the same records `/config/integrations`
 * creates, switches on and exercises. A second list of vendors maintained here
 * would drift the first time somebody added a standby provider on the other
 * screen, and a compliance register that is out of date is worse than no
 * register. Everything that identifies a processor is read off the integration
 * record; the only thing this module adds is the characterisation of the
 * processing, which is keyed by the four kinds `INTEGRATION_KINDS` already
 * defines and cannot fall out of step with the vendor list.
 *
 * ## What it cannot prove, it says
 *
 * There is no field on `IntegrationConfig` for a processor contract, so the
 * registry looks for one in the record's own non-secret settings and, finding
 * none, says so in the row rather than leaving a blank an auditor would read as
 * "yes". Same for where the data goes: a region or a host on the record is
 * evidence; nothing on the record is not.
 */

import { INTEGRATION_KINDS } from '../../../data/repo'
import type { IntegrationConfig, IntegrationKind } from '../../../data/repo'

export const PROCESSOR_KIND_LABELS: Readonly<Record<IntegrationKind, string>> = {
  bsp: 'WhatsApp Business Solution Provider',
  sms: 'SMS gateway',
  smtp: 'Email relay',
  ocr: 'Document extraction',
}

/**
 * What each kind of processor is exposed to. This is the registry's own
 * knowledge — the DPDP characterisation of the processing — and it is keyed by
 * kind rather than by vendor, so it holds for a provider nobody has added yet.
 */
export const PROCESSOR_DATA_CLASSES: Readonly<Record<IntegrationKind, readonly string[]>> = {
  bsp: ['Name', 'Mobile number', 'The text of every message sent'],
  sms: ['Name', 'Mobile number', 'The text of every message sent'],
  smtp: ['Name', 'Email address', 'Message subject and body, and anything attached to it'],
  ocr: [
    'Document images as uploaded',
    'The text extracted from them',
    'Identity documents, which is why this is the highest-exposure processor on the list',
  ],
}

export const PROCESSOR_PURPOSES: Readonly<Record<IntegrationKind, string>> = {
  bsp: 'Sending the WhatsApp messages the platform composes: renewal notices, consent links, payment confirmations.',
  sms: 'Sending transactional SMS where WhatsApp is not available or not consented to.',
  smtp: 'Sending email: proposals, policy documents, statements and consent links.',
  ocr: 'Reading uploaded documents so a person can confirm the extracted values. Nothing an extraction produces is committed without a person confirming it.',
}

/**
 * The one processor whose exposure the constitution names directly. An OCR
 * vendor sees the document as uploaded, so it is the only party in this build
 * that can be exposed to a full Aadhaar number — which is exactly why the
 * platform stores only the last four digits and never renders more.
 */
export const AADHAAR_EXPOSURE_NOTE =
  'This processor sees document images as they were uploaded, so it is the only party here that can be exposed to a full Aadhaar number. The platform stores only the last four digits, shows only those, and admits none of it to Assistant context.'

/** Settings keys that would evidence a contract, in the order they are trusted. */
const CONTRACT_KEYS = ['contractRef', 'dpaRef', 'agreementRef'] as const

/** Settings keys that say where the data physically goes. */
const LOCATION_KEYS = ['dataRegion', 'region', 'host', 'endpoint'] as const

function settingText(
  settings: IntegrationConfig['settings'],
  keys: readonly string[],
): string | null {
  for (const key of keys) {
    const held = settings[key]
    if (held === undefined || held === null) continue
    const text = String(held).trim()
    if (text !== '') return text
  }
  return null
}

export type ProcessorRow = {
  readonly id: string
  readonly key: string
  readonly label: string
  readonly providerName: string
  readonly kind: IntegrationKind
  readonly kindLabel: string
  readonly enabled: boolean
  readonly processes: readonly string[]
  readonly purpose: string
  /** Where the data goes, where the record says. Null means nothing says. */
  readonly dataLocation: string | null
  /** A contract reference on the record. Null means none is recorded. */
  readonly contractRef: string | null
  readonly lastCheckedAt: string | null
  readonly lastCheckOutcome: IntegrationConfig['lastCheckOutcome']
  readonly lastCheckNote: string | null
  /** What this row cannot evidence. One honest line each; usually empty. */
  readonly gaps: readonly string[]
}

export function processorRegistry(
  integrations: readonly IntegrationConfig[],
): readonly ProcessorRow[] {
  return integrations
    .map((record) => {
      const contractRef = settingText(record.settings, CONTRACT_KEYS)
      const dataLocation = settingText(record.settings, LOCATION_KEYS)

      const gaps: string[] = []
      if (contractRef === null) {
        gaps.push(
          'No processor contract is referenced on this record. `IntegrationConfig` has no field for one, so the registry cannot show a contract it has not been given.',
        )
      }
      if (dataLocation === null) {
        gaps.push(
          'Where this processor holds the data is not recorded. Nothing on the integration record names a region or a host.',
        )
      }

      return {
        id: record.id,
        key: record.key,
        label: record.label,
        providerName: record.providerName,
        kind: record.kind,
        kindLabel: PROCESSOR_KIND_LABELS[record.kind],
        enabled: record.enabled,
        processes: PROCESSOR_DATA_CLASSES[record.kind],
        purpose: PROCESSOR_PURPOSES[record.kind],
        dataLocation,
        contractRef,
        lastCheckedAt: record.lastCheckedAt,
        lastCheckOutcome: record.lastCheckOutcome,
        lastCheckNote: record.lastCheckNote,
        gaps,
      }
    })
    .toSorted((a, b) => a.kindLabel.localeCompare(b.kindLabel) || a.label.localeCompare(b.label))
}

/** The kinds §12 names. A kind with no processor configured is itself a finding. */
export function kindsWithoutAProcessor(
  integrations: readonly IntegrationConfig[],
): readonly IntegrationKind[] {
  return Object.values(INTEGRATION_KINDS).filter(
    (kind) => !integrations.some((record) => record.kind === kind && record.enabled),
  )
}

/** Processors with something an auditor would ask about. */
export function processorsWithGaps(rows: readonly ProcessorRow[]): readonly ProcessorRow[] {
  return rows.filter((row) => row.gaps.length > 0)
}
