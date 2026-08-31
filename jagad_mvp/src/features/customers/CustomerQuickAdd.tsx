import { useState } from 'react'
import { useRepositories } from '../../app/repositories-context'
import { useSessionStore } from '../../app/store'
import { Field, Input, QuickAddForm } from '../../ui/form'
import { useToaster } from '../../ui/surface'
import type { Customer, CustomerSource } from '../../data/repo'

export type CustomerQuickAddProps = {
  /** Where this customer came from, when the form around it already knows. */
  source?: CustomerSource
  onCreated: (customer: Customer) => void
  onCancel: () => void
}

/**
 * The create row behind a `<QuickAdd>` plus on a customer picker.
 *
 * A name and a mobile is what a customer is at the moment somebody first needs
 * to pick one — the same two fields inquiry capture asks for, and for the same
 * reason: the person on the other end of the phone is waiting. Everything else
 * about them is filled in on the 360, and the record goes through
 * `customers.create` like every other, so it lands as a prospect owned by
 * whoever made it and carries a real id straight back into the dropdown.
 */
export function CustomerQuickAdd({ source = 'walk_in', onCreated, onCancel }: CustomerQuickAddProps) {
  const repositories = useRepositories()
  const user = useSessionStore((state) => state.user)
  const toaster = useToaster()

  const [fullName, setFullName] = useState('')
  const [mobile, setMobile] = useState('')
  const [city, setCity] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!user) return
    setError(null)
    setBusy(true)
    const outcome = await repositories.customers.create({
      actorId: user.id,
      fullName: fullName.trim(),
      mobile: mobile.trim(),
      source,
      ownerId: user.id,
      city: city.trim(),
      state: '',
    })
    setBusy(false)

    if (!outcome.ok) {
      // The repository's own sentence, rendered as written.
      setError(outcome.reason)
      return
    }

    toaster.notify({ title: `${outcome.record.fullName} is on the books`, tone: 'ok' })
    onCreated(outcome.record)
  }

  return (
    <QuickAddForm
      error={error}
      busy={busy}
      submitLabel="Add customer"
      onCancel={onCancel}
      onSubmit={() => void submit()}
    >
      <Field label="Full name" required>
        <Input
          autoFocus
          value={fullName}
          onChange={(event) => {
            setFullName(event.target.value)
            setError(null)
          }}
        />
      </Field>

      <Field label="Mobile" required>
        <Input
          value={mobile}
          inputMode="tel"
          onChange={(event) => {
            setMobile(event.target.value)
            setError(null)
          }}
        />
      </Field>

      <Field label="City">
        <Input value={city} onChange={(event) => setCity(event.target.value)} />
      </Field>
    </QuickAddForm>
  )
}
