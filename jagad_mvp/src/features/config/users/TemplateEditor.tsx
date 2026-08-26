import { Fragment, useState } from 'react'
import { useRepositories } from '../../../app/repositories-context'
import { useResource } from '../../../lib/useResource'
import { ACTIONS, RESOURCES, SCOPE_LEVELS } from '../../../domain/permissions'
import type { Resource, ScopeLevel } from '../../../domain/permissions'
import { Button } from '../../../ui/Button'
import { Checkbox, Field, FormSection, Input, Select, Toggle } from '../../../ui/form'
import { Badge } from '../../../ui/signal'
import { Panel } from '../../../ui/surface'
import {
  DATA_CLASS_LABELS,
  GRANTABLE_CLASSES,
  GatedAction,
  RESOURCE_LABELS,
  SCOPE_LEVEL_LABELS,
  actionsOn,
  scopeOf,
  templateChanges,
  templateReach,
  useConfigStore,
  usersOnTemplate,
  withDataClass,
  withGrant,
  withLabel,
  withScopeCategories,
  withScopeCompanies,
  withScopeLevel,
  withSubAgentReach,
} from '../shared'
import type { ConfigTemplate } from '../shared'
import layout from '../shared/config-layout.module.css'
import styles from './users.module.css'

/**
 * The permission-template editor — FR-01.2/.3, clone-and-edit.
 *
 * The grid below is a control matrix, not a record queue: its rows are the
 * product's sixteen modules and its cells are the seven actions `can()` knows
 * about, read straight out of `RESOURCES` and `ACTIONS`. Nothing is transcribed,
 * so a module added to the evaluator appears here on its own.
 *
 * A starter renders read-only and offers one button: clone. That is the rule
 * P-10a states, and putting it in the component means an admin cannot reach an
 * edit control for a starter to begin with — the store refuses the write as
 * well, so neither layer is trusting the other.
 *
 * Saving is previewed. A template edit is felt by everybody who holds it, and
 * "Sales manager loses approve on policies" is the sort of change that should be
 * read once before it happens rather than discovered in a queue.
 */
export function TemplateEditor({
  template,
  onCloned,
}: {
  template: ConfigTemplate
  /** Told the key of the copy, so the library can select it straight away. */
  onCloned?: (key: string) => void
}) {
  const repositories = useRepositories()
  const categories = useConfigStore((state) => state.categories)
  const users = useConfigStore(
    (state) => usersOnTemplate(state, template.key).length,
  )
  const cloneTemplateFrom = useConfigStore((state) => state.cloneTemplateFrom)
  const saveTemplate = useConfigStore((state) => state.saveTemplate)
  const deleteTemplate = useConfigStore((state) => state.deleteTemplate)

  const [draft, setDraft] = useState<ConfigTemplate>(template)
  const [openScopes, setOpenScopes] = useState<readonly Resource[]>([])

  const companies = useResource(
    () => repositories.companies.list({ pageSize: 100 }),
    'config:companies',
  )
  const companyRows = companies.data?.rows ?? []

  const changes = templateChanges(template, draft)

  if (!template.editable) {
    return (
      <Panel
        title={template.label}
        description="A starter template. Starters are the library an agency begins from, so they are cloned rather than edited — the copy is yours to change."
        actions={
          <Button
            variant="primary"
            size="sm"
            icon="plus"
            onClick={() => {
              const key = cloneTemplateFrom(template.key)
              if (key) onCloned?.(key)
            }}
          >
            Clone and edit
          </Button>
        }
      >
        <div className={layout.stack}>
          <p className={layout.muted}>
            {templateReach(template)} · held by {users} account{users === 1 ? '' : 's'}
          </p>
          <div className={styles.matrixScroll}>
            <Matrix template={template} readOnly />
          </div>
        </div>
      </Panel>
    )
  }

  return (
    <Panel
      title={draft.label}
      description={`${templateReach(draft)} · held by ${users} account${users === 1 ? '' : 's'}`}
      actions={
        <Button
          variant="quiet"
          size="sm"
          icon="plus"
          onClick={() => {
            const key = cloneTemplateFrom(template.key)
            if (key) onCloned?.(key)
          }}
        >
          Clone this one
        </Button>
      }
    >
      <div className={layout.stack}>
        <Field label="Template name" required>
          <Input
            value={draft.label}
            onChange={(event) => setDraft(withLabel(draft, event.target.value))}
          />
        </Field>

        <FormSection
          title="Modules and actions"
          description="What the template opens, and how far each module's records reach."
        >
          <div className={styles.matrixScroll}>
            <Matrix
              template={draft}
              openScopes={openScopes}
              companies={companyRows.map((company) => ({
                id: company.id,
                label: company.shortName,
              }))}
              categories={categories.map((category) => ({
                id: category.id,
                label: category.label,
              }))}
              onToggleScope={(resource) =>
                setOpenScopes(
                  openScopes.includes(resource)
                    ? openScopes.filter((open) => open !== resource)
                    : [...openScopes, resource],
                )
              }
              onGrant={(resource, action, granted) =>
                setDraft(withGrant(draft, resource, action, granted))
              }
              onLevel={(resource, level) => setDraft(withScopeLevel(draft, resource, level))}
              onCompanies={(resource, ids) => setDraft(withScopeCompanies(draft, resource, ids))}
              onCategories={(resource, ids) => setDraft(withScopeCategories(draft, resource, ids))}
              onSubAgents={(resource, held) => setDraft(withSubAgentReach(draft, resource, held))}
            />
          </div>
        </FormSection>

        <FormSection
          title="Field classes"
          description="Operational and contact fields are visible to every template. These two are grants."
        >
          {GRANTABLE_CLASSES.map((dataClass) => (
            <Checkbox
              key={dataClass}
              label={DATA_CLASS_LABELS[dataClass] ?? dataClass}
              checked={draft.dataClasses.includes(dataClass)}
              onChange={(event) =>
                setDraft(withDataClass(draft, dataClass, event.target.checked))
              }
            />
          ))}
          <p className={layout.muted}>
            Holding a class lets this template read those fields on screen. It never puts them in
            front of the Assistant, which reads a projection that has no such fields at all.
          </p>
        </FormSection>

        <div className={styles.actions}>
          <GatedAction
            label="Save template"
            variant="primary"
            title={`Save "${draft.label}"`}
            changes={changes.map((change) => ({
              key: change.key,
              label: change.label,
              from: change.from,
              to: change.to,
            }))}
            disabled={changes.length === 0}
            note={`${users} account${users === 1 ? '' : 's'} hold this template. The change reaches them the moment it is saved.`}
            confirmLabel="Save"
            receipt="Saved. Everyone holding this template sees the new reach."
            toast={{ title: `"${draft.label}" saved` }}
            onConfirm={() => saveTemplate(draft)}
          />

          {changes.length > 0 ? (
            <Button type="button" variant="quiet" size="sm" onClick={() => setDraft(template)}>
              Discard changes
            </Button>
          ) : (
            <span className={layout.muted}>No unsaved changes.</span>
          )}

          {users === 0 ? (
            <GatedAction
              label="Delete template"
              variant="danger"
              title={`Delete "${template.label}"`}
              changes={[
                { key: 'template', label: 'Template', from: template.label, to: 'Removed' },
              ]}
              note="No account holds it, so nobody's access changes."
              confirmLabel="Delete"
              toast={{ title: `"${template.label}" was deleted`, tone: 'bad' }}
              onConfirm={() => deleteTemplate(template.key)}
            />
          ) : (
            <span className={layout.muted}>
              Held by {users} account{users === 1 ? '' : 's'}, so it cannot be deleted.
            </span>
          )}
        </div>
      </div>
    </Panel>
  )
}

/* ------------------------------------------------------------------- matrix */

type Option = { readonly id: string; readonly label: string }

type MatrixProps = {
  template: ConfigTemplate
  readOnly?: boolean
  openScopes?: readonly Resource[]
  companies?: readonly Option[]
  categories?: readonly Option[]
  onToggleScope?: (resource: Resource) => void
  onGrant?: (resource: Resource, action: (typeof ACTIONS)[number], granted: boolean) => void
  onLevel?: (resource: Resource, level: ScopeLevel) => void
  onCompanies?: (resource: Resource, ids: readonly string[]) => void
  onCategories?: (resource: Resource, ids: readonly string[]) => void
  onSubAgents?: (resource: Resource, held: boolean) => void
}

function Matrix({
  template,
  readOnly = false,
  openScopes = [],
  companies = [],
  categories = [],
  onToggleScope,
  onGrant,
  onLevel,
  onCompanies,
  onCategories,
  onSubAgents,
}: MatrixProps) {
  return (
    <table className={styles.matrix}>
      <caption className={layout.muted}>
        Every module the permission evaluator knows about, with the actions it can grant.
      </caption>
      <thead>
        <tr>
          <th scope="col">Module</th>
          {ACTIONS.map((action) => (
            <th scope="col" key={action} className={styles.action}>
              {action}
            </th>
          ))}
          <th scope="col" className={styles.scopeCell}>
            Reach
          </th>
          {readOnly ? null : <th scope="col">Narrow</th>}
        </tr>
      </thead>
      <tbody>
        {RESOURCES.map((resource) => {
          const held = actionsOn(template, resource)
          const scope = scopeOf(template, resource)
          const open = openScopes.includes(resource)

          return (
            <Fragment key={resource}>
              <tr>
                <th scope="row" className={styles.resource}>
                  {RESOURCE_LABELS[resource]}
                </th>
                {ACTIONS.map((action) => (
                  <td key={action} className={styles.action}>
                    <Checkbox
                      label={
                        <span className={styles.srOnly}>{`${RESOURCE_LABELS[resource]}: ${action}`}</span>
                      }
                      checked={held.includes(action)}
                      disabled={readOnly}
                      onChange={(event) => onGrant?.(resource, action, event.target.checked)}
                    />
                  </td>
                ))}
                <td className={styles.scopeCell}>
                  {held.length === 0 ? (
                    <span className={layout.muted}>no access</span>
                  ) : readOnly ? (
                    <span>{SCOPE_LEVEL_LABELS[scope.level]}</span>
                  ) : (
                    <Select
                      aria-label={`${RESOURCE_LABELS[resource]} reach`}
                      value={scope.level}
                      options={SCOPE_LEVELS.map((level) => ({
                        value: level,
                        label: SCOPE_LEVEL_LABELS[level],
                      }))}
                      onChange={(event) => onLevel?.(resource, event.target.value as ScopeLevel)}
                    />
                  )}
                </td>
                {readOnly ? null : (
                  <td>
                    {held.length === 0 ? null : (
                      <Button
                        type="button"
                        variant="quiet"
                        size="sm"
                        aria-expanded={open}
                        onClick={() => onToggleScope?.(resource)}
                      >
                        {scope.companies || scope.categories || scope.includeSubAgents ? (
                          <Badge tone="info">narrowed</Badge>
                        ) : (
                          'By attribute'
                        )}
                      </Button>
                    )}
                  </td>
                )}
              </tr>

              {open && !readOnly ? (
                <tr className={styles.detail}>
                  <td colSpan={ACTIONS.length + 3}>
                    <div className={styles.detailGrid}>
                      <Field label={`${RESOURCE_LABELS[resource]}: companies`} control="group">
                        <div className={styles.checks}>
                          {companies.map((company) => (
                            <Checkbox
                              key={company.id}
                              id={`${template.key}-${resource}-company-${company.id}`}
                              label={company.label}
                              checked={scope.companies?.includes(company.id) ?? false}
                              onChange={(event) => {
                                const current = scope.companies ?? []
                                onCompanies?.(
                                  resource,
                                  event.target.checked
                                    ? [...current, company.id]
                                    : current.filter((id) => id !== company.id),
                                )
                              }}
                            />
                          ))}
                        </div>
                      </Field>

                      <Field label={`${RESOURCE_LABELS[resource]}: categories`} control="group">
                        <div className={styles.checks}>
                          {categories.map((category) => (
                            <Checkbox
                              key={category.id}
                              id={`${template.key}-${resource}-category-${category.id}`}
                              label={category.label}
                              checked={scope.categories?.includes(category.id) ?? false}
                              onChange={(event) => {
                                const current = scope.categories ?? []
                                onCategories?.(
                                  resource,
                                  event.target.checked
                                    ? [...current, category.id]
                                    : current.filter((id) => id !== category.id),
                                )
                              }}
                            />
                          ))}
                        </div>
                      </Field>

                      <Toggle
                        checked={scope.includeSubAgents === true}
                        onCheckedChange={(checked) => onSubAgents?.(resource, checked)}
                        label="Include sub-agents' records"
                        description="Extends own records to the book of sub-agents reporting to this person. A sibling sub-agent stays out."
                      />
                    </div>
                    <p className={layout.muted}>
                      Nothing ticked means every company and every category. The narrowings
                      intersect: a template scoped to two companies and one category reaches
                      records that match both.
                    </p>
                  </td>
                </tr>
              ) : null}
            </Fragment>
          )
        })}
      </tbody>
    </table>
  )
}
