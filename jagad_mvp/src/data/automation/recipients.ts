/**
 * Who a recipe is about to write to — FR-21, FR-17.3.
 *
 * A recipe's trigger names a subject, and the subject is almost never the
 * customer: `policy.issued` is about a policy, `claim.status_changed` about a
 * claim, `renewal.due` about a renewal task. The consent check is about a
 * person. So something has to walk from the one to the other, and this is it.
 *
 * It is a composition of existing repository reads rather than a new repository
 * method, which is the established pattern for exactly this situation — the same
 * shape as the feature desks under `src/features`. Nothing here is a new
 * interface for the data layer to grow.
 *
 * An entity this does not know is a null and a sentence, never a guess. The
 * failure it prevents is the one that matters most in this file: resolving to
 * the wrong customer and checking the wrong person's consent would produce a
 * message that passed every guard and went to somebody who never agreed to
 * receive it.
 */

import type { Customer, CustomerRepository } from '../repo/customers'
import type { ClaimRepository } from '../repo/claims'
import type { PolicyRepository } from '../repo/policies'
import type { QuotationRepository } from '../repo/quotations'
import type { RenewalRepository } from '../repo/tasks'
import type { EventSubject } from '../../domain/events'

export type RecipientDeps = {
  readonly customers: CustomerRepository
  readonly policies: PolicyRepository
  readonly quotations: QuotationRepository
  readonly claims: ClaimRepository
  readonly renewals: RenewalRepository
}

export type RecipientResult =
  | { readonly ok: true; readonly customer: Customer }
  | { readonly ok: false; readonly reason: string }

export type RecipientResolver = (subject: EventSubject) => Promise<RecipientResult>

/**
 * The entities a recipe's subject may be, and how each one names its customer.
 * Written as a lookup rather than a switch so an entity nobody mapped is a
 * missing key with a sentence, not a fallthrough that silently returns null.
 */
const CUSTOMER_OF: Readonly<Record<string, (deps: RecipientDeps, id: string) => Promise<string | null>>> =
  {
    Customer: async (_deps, id) => id,
    Policy: async (deps, id) => (await deps.policies.get(id))?.customerId ?? null,
    Quotation: async (deps, id) => (await deps.quotations.get(id))?.customerId ?? null,
    Claim: async (deps, id) => (await deps.claims.get(id))?.customerId ?? null,
    RenewalTask: async (deps, id) => (await deps.renewals.get(id))?.customerId ?? null,
  }

export function createRecipientResolver(deps: RecipientDeps): RecipientResolver {
  return async (subject) => {
    const lookup = CUSTOMER_OF[subject.entity]
    if (lookup === undefined) {
      return {
        ok: false,
        reason: `This recipe's trigger is about a ${subject.entity}, and nothing here knows which customer a ${subject.entity} belongs to. Nothing was prepared: a message needs a recipient, and a guessed recipient is worse than none.`,
      }
    }

    const customerId = await lookup(deps, subject.id)
    if (customerId === null) {
      return { ok: false, reason: `${subject.entity} ${subject.id} names no customer on file.` }
    }

    const customer = await deps.customers.get(customerId)
    if (customer === null) {
      return {
        ok: false,
        reason: `${subject.entity} ${subject.id} names customer ${customerId}, and there is no such customer on file.`,
      }
    }

    return { ok: true, customer }
  }
}
