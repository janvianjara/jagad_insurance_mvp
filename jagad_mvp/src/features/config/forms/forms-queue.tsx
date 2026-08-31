import { dataTableColumns } from '../../../ui/data'
import { Badge, StatusPill } from '../../../ui/signal'
import { DateTime } from '../../../ui/type'
import type { QueueConfig } from '../../../components/WorkQueue'
import { PROBLEM_SEVERITIES, validateFormSchema } from '../../../domain/forms'
import type { FormSchema } from '../../../domain/forms'
import { localPage } from '../shared'
import type { LocalListSpec } from '../shared'
import { SchemaBuilderDrawer } from './SchemaBuilderDrawer'
import { conditionCount, objectLabel } from './schema-draft'

export type FormsQueueInput = {
  readonly schemas: readonly FormSchema[]
}

function fieldCount(schema: FormSchema): number {
  return schema.stages.reduce((total, stage) => total + stage.fields.length, 0)
}

function faultCount(schema: FormSchema): number {
  return validateFormSchema(schema).length
}

function blockingCount(schema: FormSchema): number {
  return validateFormSchema(schema).filter(
    (problem) => problem.severity === PROBLEM_SEVERITIES.blocking,
  ).length
}

const listSpec: LocalListSpec<FormSchema> = {
  search: [(row) => row.objectKey, (row) => row.id, (row) => row.productId],
  filters: {
    object: (row) => row.objectKey,
    status: (row) => (row.active ? 'live' : 'superseded'),
    scope: (row) => (row.productId === null ? 'fallback' : 'product'),
  },
  sorts: {
    object: (row) => row.objectKey,
    version: (row) => row.version,
    stages: (row) => row.stages.length,
    fields: (row) => fieldCount(row),
    published: (row) => row.publishedAt,
  },
}

/**
 * The form catalogue, as a configured `<WorkQueue>`.
 *
 * A row is one published version rather than one object, because that is what a
 * record pins and what an admin actually opens: "the health form as it was in
 * January" is a row here, and the January policies still render under it.
 *
 * The builder itself is the drawer. A schema is a record with detail, not a
 * second list — and two queues on one screen would fight over the same six
 * reserved URL parameters.
 */
export function formsQueue(input: FormsQueueInput): QueueConfig<FormSchema> {
  const column = dataTableColumns<FormSchema>()
  const objects = [...new Set(input.schemas.map((schema) => schema.objectKey))].toSorted()

  return {
    key: 'config-forms',
    title: 'Forms',
    noun: 'form',
    nounPlural: 'form schemas',
    getRowId: (row) => row.id,

    columns: column.columns([
      column.accessor((row) => objectLabel(row.objectKey), { id: 'object', header: 'Captures' }),
      column.accessor((row) => (row.productId === null ? 'Fallback' : row.productId), {
        id: 'scope',
        header: 'Applies to',
        enableSorting: false,
        cell: (info) => {
          const label = String(info.getValue())
          return <Badge tone="neutral">{label === 'Fallback' ? 'Every product' : label}</Badge>
        },
      }),
      column.accessor('version', { header: 'Version' }),
      column.accessor((row) => row.stages.length, { id: 'stages', header: 'Stages' }),
      column.accessor((row) => fieldCount(row), { id: 'fields', header: 'Fields' }),
      column.accessor((row) => conditionCount(row.stages), {
        id: 'branching',
        header: 'Conditions',
        enableSorting: false,
      }),
      column.accessor((row) => row.publishedAt, {
        id: 'published',
        header: 'Published',
        cell: (info) => <DateTime value={String(info.getValue())} />,
      }),
      column.accessor((row) => (row.active ? 'Live' : 'Superseded'), {
        id: 'status',
        header: 'Status',
        enableSorting: false,
        cell: (info) => {
          const label = String(info.getValue())
          return (
            <StatusPill tone={label === 'Live' ? 'ok' : 'idle'} size="sm">
              {label}
            </StatusPill>
          )
        },
      }),
      column.accessor(
        (row) => {
          const blocking = blockingCount(row)
          if (blocking > 0) return `${blocking} blocking`
          const faults = faultCount(row)
          return faults > 0 ? `${faults} advisory` : 'Renders'
        },
        {
          id: 'health',
          header: 'Check',
          enableSorting: false,
          cell: (info) => {
            const label = String(info.getValue())
            return (
              <Badge tone={label === 'Renders' ? 'ok' : label.endsWith('blocking') ? 'bad' : 'warn'}>
                {label}
              </Badge>
            )
          },
        },
      ),
    ]),

    filters: [
      {
        key: 'object',
        label: 'Captures',
        options: objects.map((key) => ({ value: key, label: objectLabel(key) })),
      },
      {
        key: 'status',
        label: 'Status',
        options: [
          { value: 'live', label: 'Live' },
          { value: 'superseded', label: 'Superseded' },
        ],
      },
      {
        key: 'scope',
        label: 'Applies to',
        options: [
          { value: 'fallback', label: 'Every product' },
          { value: 'product', label: 'One product' },
        ],
      },
    ],

    sortable: ['object', 'version', 'stages', 'fields', 'published'],
    defaultSort: { field: 'object', direction: 'asc' },
    searchPlaceholder: 'Search forms',

    // Lime is "needs a person": a schema the validator has something to say
    // about is a form somebody has to open, not an error the platform can fix.
    stripeMapping: (row) => (faultCount(row) > 0 ? 'attn' : undefined),

    load: async (query) => localPage(input.schemas, listSpec, query),

    empty: {
      title: 'No forms published yet',
      explanation:
        'A form is a schema an admin publishes, not a screen a developer writes. Publishing one here gives policy entry, KYC, claim intimation and inquiry capture their stages, fields and branching — and gives every record a version to be captured under.',
    },

    rowTarget: 'drawer',
    drawerTitle: (row) => `${objectLabel(row.objectKey)} · version ${row.version}`,
    drawerSubtitle: (row) =>
      row.productId === null ? 'Fallback for every product' : `Only for ${row.productId}`,
    renderDrawer: (row) => <SchemaBuilderDrawer key={row.id} schema={row} />,
  }
}
