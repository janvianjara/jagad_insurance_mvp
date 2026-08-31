/**
 * The configuration export — plan §6.1, and the mitigation risk R-4 asks for.
 *
 * The zero-hardcoding discipline is the thing this build is proudest of: stages,
 * dispositions, retention periods, templates, recipes, master values and form
 * schemas are all configuration, and none of them is a constant in code. The
 * export is what turns that claim into something a client can hold — a file that
 * carries the whole configured shape of the agency, out of one instance and into
 * another.
 *
 * ## This module assembles the content; it does not write the file
 *
 * Writing a workbook is the import and export engine's job (`src/domain/dataport`
 * and `src/features/dataport`), and there is exactly one of those in this build.
 * A second file writer living in a compliance screen would be a second set of
 * bugs about quoting, encodings and column order. So this module answers the two
 * questions the engine cannot: what goes in, and what an import has to check
 * before it lets any of it land.
 *
 * ## What is deliberately not in it
 *
 * A configuration export is not a data export. No customer, no policy, no
 * document, no message that went to a person, no consent token, and no
 * credential of any kind — the integration records travel with their non-secret
 * settings only, because there is no field on one for a secret and the repository
 * refuses a setting key that reads like one.
 */

export type ExportSection = {
  readonly key: string
  readonly label: string
  readonly count: number
  /** Why this belongs in a configuration export, in one line. */
  readonly note: string
}

export type ConfigExportManifest = {
  readonly generatedAt: string
  readonly sections: readonly ExportSection[]
  readonly rowCount: number
  readonly excluded: readonly string[]
  readonly importRules: readonly string[]
}

export type ConfigExportInput = {
  readonly retentionClasses: number
  readonly masterTypes: number
  readonly masterValues: number
  readonly inquiryStages: number
  readonly dispositions: number
  readonly categories: number
  readonly teams: number
  readonly permissionTemplates: number
  readonly staffUsers: number
  readonly messageTemplates: number
  readonly recipes: number
  readonly formSchemas: number
  readonly integrations: number
}

/** What travels, and why. The order is the order the file is written in. */
export function configExportManifest(
  input: ConfigExportInput,
  now: Date,
): ConfigExportManifest {
  const sections: readonly ExportSection[] = [
    {
      key: 'retention_classes',
      label: 'Retention classes',
      count: input.retentionClasses,
      note: 'The key, the label and the years. Every document and policy stores the key, so the key is what must survive the trip.',
    },
    {
      key: 'master_types',
      label: 'Master types',
      count: input.masterTypes,
      note: 'The lists every form offers, and which list is a child of which.',
    },
    {
      key: 'master_values',
      label: 'Master values',
      count: input.masterValues,
      note: 'The values themselves, with their revisions — a value that was renamed reads the way it read at the time.',
    },
    {
      key: 'inquiry_stages',
      label: 'Inquiry stages',
      count: input.inquiryStages,
      note: 'The pipeline, in order, with the stages that demand a dated next action.',
    },
    {
      key: 'dispositions',
      label: 'Dispositions',
      count: input.dispositions,
      note: 'What a person can record as the outcome of a conversation, and what each one proposes next.',
    },
    {
      key: 'categories',
      label: 'Inquiry categories',
      count: input.categories,
      note: 'What work can be routed as, which is what a staff record is allowed to name.',
    },
    {
      key: 'teams',
      label: 'Teams',
      count: input.teams,
      note: 'The desks work is routed to.',
    },
    {
      key: 'permission_templates',
      label: 'Permission templates',
      count: input.permissionTemplates,
      note: 'What each role can open, including the data classes a template grants.',
    },
    {
      key: 'staff_users',
      label: 'Staff users',
      count: input.staffUsers,
      note: 'Name, template and team. No password, no two-factor secret, no session.',
    },
    {
      key: 'message_templates',
      label: 'Message templates',
      count: input.messageTemplates,
      note: 'The words a customer receives, by version — an edit publishes a version rather than rewriting what already went out.',
    },
    {
      key: 'recipes',
      label: 'Automation recipes',
      count: input.recipes,
      note: 'The trigger and the parameters. A recipe is a subscriber on the event bus, and its parameters are the numbers the business runs on.',
    },
    {
      key: 'form_schemas',
      label: 'Form schemas',
      count: input.formSchemas,
      note: 'Every published version, because records pin the version they were captured under and must keep rendering under it.',
    },
    {
      key: 'integrations',
      label: 'Integrations',
      count: input.integrations,
      note: 'Which provider each channel uses and its non-secret settings. No key, token, password or sender secret: those live in the provider console.',
    },
  ]

  return {
    generatedAt: now.toISOString(),
    sections,
    rowCount: sections.reduce((total, section) => total + section.count, 0),
    excluded: EXPORT_EXCLUSIONS,
    importRules: IMPORT_RULES,
  }
}

export const EXPORT_EXCLUSIONS: readonly string[] = [
  'Customers, members, households and everything on them.',
  'Policies, quotations, deals, claims, endorsements and any money recorded against them.',
  'Documents: neither the files, nor the extracted text, nor the OCR fields.',
  'Consent records and their tokens. A token is a live credential to a login-free page.',
  'The message log: what was sent to a named person is a record about that person.',
  'Every credential, in every form. There is no field in this export one could travel in.',
]

/**
 * What an import has to check before a single row lands.
 *
 * These are the rules the register can state today; the engine enforces them.
 * Each one is a way a configuration import silently breaks records that are
 * already on the books, which is why an import is a gated act with a preview and
 * never a file drop that writes.
 */
export const IMPORT_RULES: readonly string[] = [
  'A key is an identity, not a label. A retention class, master type, master value, stage, disposition, template or recipe arriving under a changed key is a new row, and the records naming the old one are orphaned. An import renames labels; it never renames keys.',
  'A retention class that records already point at cannot be dropped. The import refuses and names the records, rather than leaving them held under a class that no longer exists.',
  'A master value in use cannot be removed. It can be deactivated, which is what stops a form offering it without rewriting history.',
  'A form-schema version that records were captured under cannot be replaced in place. An import publishes a new version.',
  'A settings key that reads like a credential is refused on the way in, with the key named — the same refusal the integration screen and the fixture schema already make.',
  'A recipe naming a trigger this build does not publish is refused. A subscriber to an event that never fires is an automation nobody will ever be able to explain.',
  'Every row is previewed against what is already on file before anything is written, and the write is one gated act.',
]

export const EXPORT_HANDOFF =
  'The file itself is written by the import and export engine, which is the one place in this build that knows about workbooks, encodings and column order. This screen assembles what goes into it and states what an import has to check before any of it lands.'
