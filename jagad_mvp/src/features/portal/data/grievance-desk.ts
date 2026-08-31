/**
 * The grievance desk — plan §12 (DPDP and the Consumer Protection Act 2019),
 * the compliance surface the gap analysis records as having no code.
 *
 * §12 asks for a reachable grievance channel with a category, a description and
 * a reference the complainant can quote. Two of those three the data layer can
 * already carry; the third it cannot. `TaskKind` (§8) is a closed union of nine
 * operational kinds — none of them a grievance — and `Task` is the only writable
 * work record there is. Widening that union is a change to the shared data layer
 * and to every exhaustive label map keyed on it, which is a bigger decision than
 * this feature is entitled to make on its own.
 *
 * So this takes the answer the repository already established for exactly this
 * situation: the feature-layer desk `upload-desk.ts` uses, holding only what no
 * repository can hold, keyed on the repository set so a grievance filed on one
 * screen is visible on the next. When a `GrievanceRepository` lands this
 * collapses to a delegate and no screen changes.
 *
 * The screen says this out loud rather than implying a case-management system
 * that does not exist. An honest receipt with a reference is a real compliance
 * affordance; a receipt that pretends a ticket was raised in a queue nobody
 * built is not.
 */

import type { Repositories } from '../../../data/repo'

/**
 * The categories §12 needs to tell apart: a data-protection grievance under DPDP
 * has a statutory route and a statutory clock, and a complaint about service
 * does not. A single free-text box would lose that distinction at intake, which
 * is the only place it can still be recorded cheaply.
 */
export const GRIEVANCE_CATEGORIES = [
  { value: 'service', label: 'Service or response time' },
  { value: 'claim', label: 'How a claim was handled' },
  { value: 'money', label: 'Premium, receipt or refund' },
  { value: 'data', label: 'My personal data (DPDP)' },
  { value: 'other', label: 'Something else' },
] as const

export type GrievanceCategory = (typeof GRIEVANCE_CATEGORIES)[number]['value']

export type Grievance = {
  /** What the complainant quotes. Sequential within the session, like every id here. */
  readonly reference: string
  readonly customerId: string
  readonly category: GrievanceCategory
  readonly description: string
  readonly raisedAt: string
}

export type FileGrievanceCommand = {
  readonly customerId: string
  readonly category: GrievanceCategory
  readonly description: string
  readonly now?: Date
}

export type GrievanceDesk = {
  file(command: FileGrievanceCommand): Promise<Grievance>
  /** This customer's own grievances, newest first. Scoped like every other read. */
  forCustomer(customerId: string): Promise<readonly Grievance[]>
}

type Store = { readonly rows: Grievance[] }

const CACHE = new WeakMap<Repositories, GrievanceDesk>()

/** `GRV-0001`, in the shape every other reference in the product takes. */
function referenceFor(sequence: number): string {
  return `GRV-${String(sequence).padStart(4, '0')}`
}

export function grievanceDesk(repositories: Repositories): GrievanceDesk {
  const existing = CACHE.get(repositories)
  if (existing) return existing

  const store: Store = { rows: [] }

  const built: GrievanceDesk = {
    async file(command) {
      const description = command.description.trim()
      if (description === '') {
        throw new Error('A grievance needs a description. Nothing was recorded.')
      }

      const record: Grievance = {
        reference: referenceFor(store.rows.length + 1),
        customerId: command.customerId,
        category: command.category,
        description,
        raisedAt: (command.now ?? new Date()).toISOString(),
      }
      store.rows.unshift(record)
      return record
    },

    async forCustomer(customerId) {
      return store.rows.filter((row) => row.customerId === customerId)
    },
  }

  CACHE.set(repositories, built)
  return built
}
