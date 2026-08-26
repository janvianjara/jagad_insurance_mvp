import { useState } from 'react'
import { Button } from '../../../ui/Button'
import { Checkbox, Field, FormRow, FormSection, Input, Select, Toggle } from '../../../ui/form'
import { Badge } from '../../../ui/signal'
import { KeyValueList } from '../../../ui/type'
import {
  GatedAction,
  RESOURCE_LABELS,
  TWO_FACTOR_EVENTS,
  TWO_FACTOR_EVENT_LABELS,
  TWO_FACTOR_LEVEL_LABELS,
  TWO_FACTOR_UNSET,
  assignmentChanges,
  grantedResources,
  resolveUser,
  templateReach,
  useConfigStore,
} from '../shared'
import type { ConfigUser } from '../shared'
import { describeReferences, userReferences } from './user-references'
import layout from '../shared/config-layout.module.css'
import styles from './users.module.css'

/**
 * One staff account, edited — FR-01.
 *
 * Three separate acts, deliberately not one Save button:
 *
 *   Details are the person's own facts, and correcting a mobile number is not an
 *   event anybody needs to confirm.
 *   The permission template decides what this colleague can open, so it is
 *   previewed — the gate lists the modules that appear and disappear, computed
 *   through the same `can()` the rail is rendered from.
 *   Access is the account itself. Deactivation is offered where deletion is
 *   refused, because configuration holds references to people and a dangling one
 *   is silent.
 *
 * Two-factor is shown, never edited here: the policy belongs to the template,
 * and what this screen records against a person is only whether they are
 * enrolled. The MVP implements no TOTP (P-10a), and saying so on the screen is
 * more honest than a switch that does nothing.
 */
export function UserEditor({ user }: { user: ConfigUser }) {
  const templates = useConfigStore((state) => state.templates)
  const teams = useConfigStore((state) => state.teams)
  const categories = useConfigStore((state) => state.categories)
  const twoFactor = useConfigStore((state) => state.twoFactor)
  const allUsers = useConfigStore((state) => state.users)
  const upsertUser = useConfigStore((state) => state.upsertUser)
  const assignTemplate = useConfigStore((state) => state.assignTemplate)
  const setUserActive = useConfigStore((state) => state.setUserActive)
  const deleteUser = useConfigStore((state) => state.deleteUser)

  const [draft, setDraft] = useState<ConfigUser>(user)
  const [templateKey, setTemplateKey] = useState(user.templateKey)

  const current = templates.find((template) => template.key === user.templateKey) ?? null
  const chosen = templates.find((template) => template.key === templateKey) ?? null
  const references = userReferences({ teams, categories, users: allUsers }, user)

  const dirty =
    draft.name !== user.name ||
    draft.email !== user.email ||
    draft.mobile !== user.mobile ||
    draft.roleLabel !== user.roleLabel ||
    draft.teamId !== user.teamId ||
    draft.twoFactorEnrolled !== user.twoFactorEnrolled ||
    draft.categoryIds.join(',') !== user.categoryIds.join(',')

  const policy = twoFactor[user.templateKey] ?? TWO_FACTOR_UNSET

  return (
    <div className={styles.drawer}>
      <FormSection
        title="Details"
        description="The person, as the agency records them."
        actions={
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={!dirty}
            onClick={() => upsertUser(draft)}
          >
            Save details
          </Button>
        }
      >
        <FormRow columns={2}>
          <Field label="Name" required>
            <Input
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
          </Field>
          <Field label="Role, in the rail" hint="The line under the name in the account switcher.">
            <Input
              value={draft.roleLabel}
              onChange={(event) => setDraft({ ...draft, roleLabel: event.target.value })}
            />
          </Field>
        </FormRow>

        <FormRow columns={2}>
          <Field label="Email" required>
            <Input
              type="email"
              value={draft.email}
              onChange={(event) => setDraft({ ...draft, email: event.target.value })}
            />
          </Field>
          <Field label="Mobile">
            <Input
              value={draft.mobile}
              mono
              onChange={(event) => setDraft({ ...draft, mobile: event.target.value })}
            />
          </Field>
        </FormRow>

        <Field label="Team" hint="Team decides what a team-scoped template can reach.">
          <Select
            value={draft.teamId ?? ''}
            placeholder="No team"
            options={teams.map((team) => ({ value: team.id, label: team.name }))}
            onChange={(event) =>
              setDraft({ ...draft, teamId: event.target.value === '' ? null : event.target.value })
            }
          />
        </Field>

        <Field
          label="Routed categories"
          control="group"
          hint="Which inquiry categories this person can be routed work from."
        >
          <div className={styles.checks}>
            {categories.map((category) => (
              <Checkbox
                key={category.id}
                id={`${user.id}-category-${category.id}`}
                label={category.label}
                checked={draft.categoryIds.includes(category.id)}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    categoryIds: event.target.checked
                      ? [...draft.categoryIds, category.id]
                      : draft.categoryIds.filter((id) => id !== category.id),
                  })
                }
              />
            ))}
          </div>
        </Field>
      </FormSection>

      <FormSection
        title="Permission template"
        description="What this account can open, and how far its records reach."
      >
        <Field label="Template">
          <Select
            value={templateKey}
            options={templates.map((template) => ({
              value: template.key,
              label: template.editable ? template.label : `${template.label} — starter`,
            }))}
            onChange={(event) => setTemplateKey(event.target.value)}
          />
        </Field>

        {chosen ? (
          <p className={layout.muted}>
            {templateReach(chosen)}. Modules:{' '}
            {grantedResources(chosen)
              .map((resource) => RESOURCE_LABELS[resource])
              .join(', ') || 'none'}
            .
          </p>
        ) : null}

        <div className={styles.actions}>
          <GatedAction
            label="Assign template"
            variant="primary"
            title={`Assign "${chosen?.label ?? templateKey}" to ${user.name}`}
            disabled={chosen === null || templateKey === user.templateKey}
            changes={
              chosen
                ? assignmentChanges(resolveUser(user, templates), chosen).map((change) => ({
                    key: change.key,
                    label: change.label,
                    from: change.from,
                    to: change.to,
                  }))
                : []
            }
            note={`${user.name} sees a different navigation rail from their next render. Nothing they have already recorded changes.`}
            confirmLabel="Assign"
            receipt={`${user.name} now holds "${chosen?.label ?? ''}".`}
            toast={{ title: `${user.name} moved to ${chosen?.label ?? ''}` }}
            onConfirm={() => assignTemplate(user.id, templateKey)}
          />
          {templateKey !== user.templateKey ? (
            <Button
              type="button"
              variant="quiet"
              size="sm"
              onClick={() => setTemplateKey(user.templateKey)}
            >
              Keep {current?.label ?? user.templateKey}
            </Button>
          ) : null}
        </div>
      </FormSection>

      <FormSection
        title="Two-factor"
        description="Recorded here, not enforced yet — the MVP implements no authenticator."
      >
        <Toggle
          checked={draft.twoFactorEnrolled}
          onCheckedChange={(checked) => setDraft({ ...draft, twoFactorEnrolled: checked })}
          label="A second factor is enrolled for this person"
          description="Save details to record the change."
        />
        <KeyValueList
          dense
          columns={2}
          items={TWO_FACTOR_EVENTS.map((event) => ({
            key: event,
            label: TWO_FACTOR_EVENT_LABELS[event],
            value: TWO_FACTOR_LEVEL_LABELS[policy[event]],
          }))}
        />
        <p className={layout.muted}>
          These come from the template, not from the person. The matrix on this screen edits them.
        </p>
      </FormSection>

      <FormSection title="Access" description="Whether this account can be signed into at all.">
        <div className={styles.actions}>
          <Badge tone={user.active ? 'ok' : 'idle'}>{user.active ? 'Active' : 'Deactivated'}</Badge>
          <GatedAction
            label={user.active ? 'Deactivate account' : 'Reactivate account'}
            title={`${user.active ? 'Deactivate' : 'Reactivate'} ${user.name}`}
            changes={[
              {
                key: 'active',
                label: 'Account',
                from: user.active ? 'Active' : 'Deactivated',
                to: user.active ? 'Deactivated' : 'Active',
              },
            ]}
            note={
              user.active
                ? 'The account stops being offered for sign-in and stops receiving routed work. Everything it recorded stays.'
                : 'The account is offered for sign-in again and can be routed work.'
            }
            confirmLabel={user.active ? 'Deactivate' : 'Reactivate'}
            toast={{ title: `${user.name} is now ${user.active ? 'deactivated' : 'active'}` }}
            onConfirm={() => setUserActive(user.id, !user.active)}
          />
        </div>

        {references.length > 0 ? (
          <p className={styles.refusal}>
            {user.name} cannot be deleted: configuration holds {describeReferences(references)}.
            Deactivating keeps those references intact and stops the account being used.
          </p>
        ) : (
          <GatedAction
            label="Delete account"
            variant="danger"
            title={`Delete ${user.name}`}
            changes={[
              { key: 'user', label: 'Staff account', from: user.name, to: 'Removed' },
              { key: 'email', label: 'Email', from: user.email, to: 'Removed' },
            ]}
            note="Nothing in configuration points at this account. Deletion cannot be undone."
            confirmLabel="Delete"
            toast={{ title: `${user.name} was deleted`, tone: 'bad' }}
            onConfirm={() => deleteUser(user.id)}
          />
        )}
      </FormSection>
    </div>
  )
}
