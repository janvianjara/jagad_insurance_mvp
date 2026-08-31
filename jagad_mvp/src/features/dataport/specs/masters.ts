/**
 * Master values — FR-02.4, which asks for import and export of master sets by
 * name.
 *
 * A master set is the vocabulary the rest of the product picks from: occupations,
 * relationships, document types, loss causes. Loading one is the single most
 * common first act of setting a system up, and typing four hundred occupations
 * into a form is how a rollout stalls.
 *
 * Two rules travel with the data rather than with the screen, because
 * `config-store` enforces them and this spec must not offer a way round them:
 * a value's `key` is what records store and is immutable once written, so the
 * column is optional and is only honoured on creation; and a value belongs to a
 * master type that already exists, which is why the type is a reference and not
 * free text — an import may fill a set, never invent one.
 */

import { FIELD_KINDS } from '../../../domain/dataport'
import type { ImportSpec } from '../../../domain/dataport'

export const MASTER_VALUE_SPEC: ImportSpec = {
  key: 'master-values',
  label: 'Master values',
  noun: 'value',
  nounPlural: 'values',
  summary:
    'Fills a configured master set — occupations, relationships, document types. The set itself must already exist.',
  sheetName: 'Master values',
  identity: ['masterTypeId', 'label'],
  writable: true,
  commitNote:
    'Each row is added to the named master set as an active value. Records store the key, so a key added here can never be changed afterwards.',
  fields: [
    {
      key: 'masterTypeId',
      label: 'Master set',
      kind: FIELD_KINDS.reference,
      resolverKey: 'masterType',
      required: true,
      synonyms: ['set', 'master', 'master type', 'list', 'category'],
      help: 'The name or key of a master set already in configuration.',
      example: 'Occupation',
    },
    {
      key: 'label',
      label: 'Value',
      kind: FIELD_KINDS.text,
      required: true,
      synonyms: ['label', 'name', 'option', 'display'],
      example: 'Chartered Accountant',
    },
    {
      key: 'key',
      label: 'Key',
      kind: FIELD_KINDS.text,
      synonyms: ['code', 'value key', 'slug'],
      help: 'Optional. Left empty, a key is made from the value. A key can never be changed afterwards, because records store it.',
      example: 'chartered_accountant',
    },
  ],
}
