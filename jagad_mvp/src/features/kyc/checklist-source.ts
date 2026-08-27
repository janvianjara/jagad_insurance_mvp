/**
 * Which checklist this customer's KYC is measured against.
 *
 * §8: a `DocChecklist` hangs off a company, and optionally off one product of
 * that company. So "the per-product checklist" is a lookup, not a constant, and
 * `ProductRepository.checklist` already does the precedence — the product's own
 * list, then the company's. What this module decides is the input to that
 * lookup: which of the customer's policies names the cover being written now.
 *
 * A customer with no policy has no company yet, so there is no checklist and
 * this returns null rather than inventing a default set. The KYC screen then
 * says so and names where to configure one, which is the honest answer and the
 * one that actually gets fixed.
 */

import type { DocChecklist, Repositories } from '../../data/repo'
import type { CustomerDossier } from '../customers/data/customer-desk'

export type ChecklistSource = {
  readonly checklist: DocChecklist | null
  /** Caption for the panel: "HDFC Ergo Optima Secure · KYC". */
  readonly label: string
}

const UNCONFIGURED = 'No company or product on file yet'

/** Most recent first: the list that applies is the one for the cover being written now. */
export function latestPolicyOf(dossier: CustomerDossier) {
  return [...dossier.policies].sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''))[0]
}

export async function loadKycChecklist(
  repositories: Repositories,
  dossier: CustomerDossier,
): Promise<ChecklistSource> {
  const latest = latestPolicyOf(dossier)
  if (!latest) return { checklist: null, label: UNCONFIGURED }

  const [checklist, product, company] = await Promise.all([
    repositories.products.checklist(latest.productId, 'kyc'),
    repositories.products.get(latest.productId),
    repositories.companies.get(latest.companyId),
  ])

  if (!checklist) {
    return {
      checklist: null,
      label: `${company?.name ?? latest.companyId} has no KYC checklist configured`,
    }
  }

  const scope =
    checklist.productId === null ? (company?.name ?? 'Company') : (product?.name ?? 'Product')
  return { checklist, label: `${scope} · KYC` }
}
