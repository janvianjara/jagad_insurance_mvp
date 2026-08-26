import { useState } from 'react'
import { Button } from '../../../ui/Button'
import { Field, FormRow, Input, Select } from '../../../ui/form'
import { Modal, useToaster } from '../../../ui/surface'
import { masterKeyFrom, useConfigStore } from '../shared'
import type { ConfigUser } from '../shared'
import layout from '../shared/config-layout.module.css'

const BLANK = {
  name: '',
  email: '',
  mobile: '',
  roleLabel: '',
  teamId: '',
  templateKey: '',
}

/**
 * Creating a staff account.
 *
 * A new account starts with a template, never without one: an account with no
 * template resolves to a user who can open nothing, and an empty rail on a first
 * sign-in reads as a broken product rather than as configuration nobody
 * finished. So the template is required here, and the form says what it will
 * open before the account exists.
 */
export function NewUserDialog() {
  const templates = useConfigStore((state) => state.templates)
  const teams = useConfigStore((state) => state.teams)
  const users = useConfigStore((state) => state.users)
  const upsertUser = useConfigStore((state) => state.upsertUser)
  const toaster = useToaster()

  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(BLANK)
  const [error, setError] = useState<string | null>(null)

  function close() {
    setOpen(false)
    setDraft(BLANK)
    setError(null)
  }

  function create() {
    const name = draft.name.trim()
    const email = draft.email.trim()

    if (name === '' || email === '') {
      setError('A name and an email address are needed before an account can exist.')
      return
    }
    if (draft.templateKey === '') {
      setError('Choose the permission template this account starts with.')
      return
    }
    if (users.some((user) => user.email.toLowerCase() === email.toLowerCase())) {
      setError(`${email} already has an account.`)
      return
    }

    const id = `usr-${masterKeyFrom(name).replace(/_/g, '-') || 'new'}-${users.length + 1}`
    const created: ConfigUser = {
      id,
      name,
      email,
      mobile: draft.mobile.trim(),
      templateKey: draft.templateKey,
      teamId: draft.teamId === '' ? null : draft.teamId,
      agentId: null,
      parentAgentId: null,
      categoryIds: [],
      roleLabel: draft.roleLabel.trim() || 'Staff account',
      active: true,
      twoFactorEnrolled: false,
    }

    upsertUser(created)
    toaster.notify({ title: `${name} now has an account`, tone: 'ok' })
    close()
  }

  return (
    <>
      <Button variant="primary" size="sm" icon="plus" onClick={() => setOpen(true)}>
        New account
      </Button>

      <Modal
        open={open}
        onClose={close}
        title="New staff account"
        description="The account is active as soon as it is created, and appears in the rail's account switcher."
        footer={
          <>
            <Button variant="quiet" onClick={close}>
              Cancel
            </Button>
            <Button variant="primary" onClick={create}>
              Create account
            </Button>
          </>
        }
      >
        <div className={layout.stack}>
          <FormRow columns={2}>
            <Field label="Name" required>
              <Input
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              />
            </Field>
            <Field label="Role, in the rail">
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
                mono
                value={draft.mobile}
                onChange={(event) => setDraft({ ...draft, mobile: event.target.value })}
              />
            </Field>
          </FormRow>

          <FormRow columns={2}>
            <Field label="Permission template" required>
              <Select
                value={draft.templateKey}
                placeholder="Choose a template"
                options={templates.map((template) => ({
                  value: template.key,
                  label: template.label,
                }))}
                onChange={(event) => setDraft({ ...draft, templateKey: event.target.value })}
              />
            </Field>
            <Field label="Team">
              <Select
                value={draft.teamId}
                placeholder="No team"
                options={teams.map((team) => ({ value: team.id, label: team.name }))}
                onChange={(event) => setDraft({ ...draft, teamId: event.target.value })}
              />
            </Field>
          </FormRow>

          {error ? (
            <p role="alert" className={layout.muted}>
              {error}
            </p>
          ) : null}
        </div>
      </Modal>
    </>
  )
}
