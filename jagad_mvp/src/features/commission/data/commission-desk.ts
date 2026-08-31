/**
 * The commission desk - the reads `/commission` is a pure function of.
 *
 * Read-only, and structurally so: this module exposes one method, it returns
 * data, and it holds no command. §9 ends the commission section with "the
 * Assistant reads this ledger and never writes to it, from any role including
 * admin", and the cheapest way to keep that promise is for there to be no writer
 * to reach for - not on the screen, not in the desk, not in the repository the
 * desk is handed.
 *
 * Everything money-shaped is `commissionChain` from `src/domain/commission`.
 * Nothing here multiplies, divides or rounds an amount.
 *
 * ---------------------------------------------------------------------------
 * Scope is applied here, before a chain is computed
 * ---------------------------------------------------------------------------
 *
 * `book` takes the viewer, and it is not optional. §11's attribute scope is a
 * property of the READ, not a decoration a screen may forget to apply: an agent
 * whose grant is `{ level: 'own', includeSubAgents: true }` must not be able to
 * obtain the agency's whole commission book by calling the desk directly, and a
 * viewer-less overload is exactly the door that would leave open. The filter runs
 * over policies rather than over finished rows, so a policy outside the viewer's
 * reach is never chained, never totalled, and never named in a refusal.
 */

import { commissionChain, COMMISSION_CHANNELS, COMMISSION_TRIGGERS } from '../../../domain/commission'
import type { CommissionChainInput } from '../../../domain/commission'
import { agencyScopeFrom, reasonOf } from '../../../domain/workflows'
import { visibleTo } from '../../../domain/visibility'
import type { ScopeLens, ScopeSource } from '../../../domain/visibility'
import type { Resource, User } from '../../../domain/permissions'
import { LEDGER_ENTRY_KINDS } from '../../../data/repo'
import type {
  Agency,
  AgencyPolicyScope,
  Agent,
  Company,
  LedgerEntry,
  Policy,
  Product,
  Repositories,
  StaffUser,
} from '../../../data/repo'
import { bookTotal, channelTotals } from '../commission-view'
import type { CommissionBook, CommissionChainRow, CommissionRefusal } from '../commission-view'

/** Big enough to hold the whole in-memory set the book is built from. */
const SCAN_SIZE = 10_000

/**
 * §9's payer fork, read off the agency record.
 *
 * `individual` is the own-code case - the agency is appointed directly and the
 * insurance company pays. `broker` is the vendor channel, where the business
 * rides a broking code and the broker pays in.
 *
 * The fixtures carry no separate broker master yet, so the broking code stands
 * in as the payer on that side. When a broker entity exists it replaces the two
 * lines below and nothing else - the chain already takes the payer as an input
 * rather than inferring it.
 */
function payerFor(agency: Agency, company: Company): Pick<CommissionChainInput, 'channel' | 'payer'> {
  if (agency.type === 'broker') {
    return {
      channel: COMMISSION_CHANNELS.brokerChannel,
      payer: { id: agency.id, kind: 'broker', isPlatformUser: false },
    }
  }
  return {
    channel: COMMISSION_CHANNELS.ownCode,
    payer: { id: company.id, kind: 'company' },
  }
}

type Catalogue = {
  readonly agencies: ReadonlyMap<string, Agency>
  readonly agents: ReadonlyMap<string, Agent>
  readonly companies: ReadonlyMap<string, Company>
  readonly products: ReadonlyMap<string, Product>
  readonly customerNames: ReadonlyMap<string, string>
  readonly scopes: readonly AgencyPolicyScope[]
  readonly booked: readonly LedgerEntry[]
  /** Agent id to the staff account that agent signs in as, for owner and team. */
  readonly staffByAgent: ReadonlyMap<string, StaffUser>
}

/**
 * A policy's scope attributes, in §11's vocabulary.
 *
 * `ownerId` and `teamId` come off the staff account behind the agent rather than
 * off the policy, because a policy has no owner column - the person who owns a
 * placement is the agent who sourced it, and their team is the team that
 * sourced it. That is what lets a team-scoped account read the same commission
 * book through the same predicate as an agent-scoped one.
 */
function policyScope(catalogue: Catalogue, policy: Policy): ScopeSource {
  const staff = policy.agentId ? catalogue.staffByAgent.get(policy.agentId) : undefined
  const product = catalogue.products.get(policy.productId)

  return {
    agentId: policy.agentId,
    subAgentId: policy.subAgentId,
    companyId: policy.companyId,
    categoryId: product?.categoryId ?? null,
    ownerId: staff?.id ?? null,
    teamId: staff?.teamId ?? null,
  }
}

function scopeFor(
  catalogue: Catalogue,
  policy: Policy,
): AgencyPolicyScope | undefined {
  return catalogue.scopes.find(
    (scope) =>
      scope.agencyId === policy.agencyId &&
      scope.companyId === policy.companyId &&
      scope.productId === policy.productId &&
      scope.active,
  )
}

/**
 * The scope the Individual lock is enforced through.
 *
 * Built from the agency's own appointed rows rather than from `Agency.companyIds`,
 * because those rows are what carries the per-company-and-product rate. An
 * Individual agency has rows for exactly one company (canvas 6.3), so this list
 * is what makes `placementInsideAgencyScope` refuse a placement on another one.
 */
function appointedScope(catalogue: Catalogue, agencyId: string) {
  return agencyScopeFrom(agencyId, catalogue.scopes)
}

export type CommissionDesk = {
  /**
   * The book this viewer may read. One read, because a per-row read is a
   * hundred requests, and the viewer is required, because an unscoped read of a
   * commission book is the money leak §11 exists to prevent.
   *
   * `through` names the grant the scope is evaluated under, and exists for one
   * reason: §3's role table gives a sub-agent Leads, Customers and **Wallet**,
   * and no commission grant at all. The wallet reads the same lines out of the
   * same chain - a second projection would be a second set of figures to
   * disagree with - but it must read them under the resource that account
   * actually holds. Passing `wallet` narrows to that grant's own scope, which
   * for a sub-agent is `own`; it never widens anything, because `can()` still
   * has to say yes about every row.
   */
  book(viewer: User, through?: Resource): Promise<CommissionBook>
}

export function commissionDesk(repositories: Repositories): CommissionDesk {
  return {
    async book(viewer: User, through: Resource = 'commission'): Promise<CommissionBook> {
      const [policyPage, agencyPage, agentPage, companyPage, productPage, customerPage, ledgerPage, staff] =
        await Promise.all([
          repositories.policies.list({ page: 1, pageSize: SCAN_SIZE, filters: { status: ['issued'] } }),
          repositories.agencies.list({ page: 1, pageSize: SCAN_SIZE }),
          repositories.agents.list({ page: 1, pageSize: SCAN_SIZE }),
          repositories.companies.list({ page: 1, pageSize: SCAN_SIZE }),
          repositories.products.list({ page: 1, pageSize: SCAN_SIZE }),
          repositories.customers.list({ page: 1, pageSize: SCAN_SIZE }),
          repositories.commission.list({ page: 1, pageSize: SCAN_SIZE }),
          repositories.config.users(),
        ])

      const scopeLists = await Promise.all(
        agencyPage.rows.map((agency) => repositories.agencies.scopes(agency.id)),
      )

      const catalogue: Catalogue = {
        agencies: new Map(agencyPage.rows.map((row) => [row.id, row])),
        agents: new Map(agentPage.rows.map((row) => [row.id, row])),
        companies: new Map(companyPage.rows.map((row) => [row.id, row])),
        products: new Map(productPage.rows.map((row) => [row.id, row])),
        customerNames: new Map(customerPage.rows.map((row) => [row.id, row.fullName])),
        scopes: scopeLists.flat(),
        booked: ledgerPage.rows,
        staffByAgent: new Map(
          staff
            .filter((person): person is StaffUser & { agentId: string } => person.agentId !== null)
            .map((person) => [person.agentId, person]),
        ),
      }

      // §11, applied to rows. An allow-list over `can()`: a policy this viewer
      // may not read is dropped before anything is computed about it.
      const policyLens: ScopeLens<Policy> = {
        resource: through,
        attributesOf: (policy) => policyScope(catalogue, policy),
      }
      const readable = visibleTo(viewer, policyPage.rows, policyLens)

      const rows: CommissionChainRow[] = []
      const refusals: CommissionRefusal[] = []

      for (const policy of readable) {
        const outcome = chainFor(catalogue, policy)
        if ('reason' in outcome) {
          refusals.push({ policyId: policy.id, systemNo: policy.systemNo, reason: outcome.reason })
        } else {
          rows.push(outcome)
        }
      }

      // The statement rows are scoped through the same predicate rather than by
      // the policies above, so a booked figure whose policy produced no chain
      // still reaches the ledger - and still only for someone entitled to it.
      const bookedLens: ScopeLens<LedgerEntry> = {
        resource: through,
        attributesOf: (entry) => ({ agentId: entry.agentId, subAgentId: entry.subAgentId }),
      }

      return {
        rows,
        refusals,
        channels: channelTotals(rows),
        totals: bookTotal(rows),
        booked: visibleTo(
          viewer,
          catalogue.booked.filter((entry) => entry.kind === LEDGER_ENTRY_KINDS.commissionBooked),
          bookedLens,
        ),
        payoutsRecorded: visibleTo(
          viewer,
          catalogue.booked.filter((entry) => entry.kind === LEDGER_ENTRY_KINDS.payout),
          bookedLens,
        ),
      }
    },
  }
}

/** Everything one policy needs, or the sentence saying why it has no chain. */
function chainFor(catalogue: Catalogue, policy: Policy): CommissionChainRow | { reason: string } {
  const agency = catalogue.agencies.get(policy.agencyId)
  const company = catalogue.companies.get(policy.companyId)
  const product = catalogue.products.get(policy.productId)

  if (!agency || !company || !product) {
    return { reason: 'The agency, company or policy on this record is no longer in configuration.' }
  }

  // The basis is a typed figure and stays one. Net is what an appointment is
  // reckoned on where it is recorded; Final is the fallback, and neither is
  // derived from the other here (§8, D3).
  const basis = policy.netPremium ?? policy.finalPremium
  if (!basis) {
    return {
      reason: 'No premium has been recorded against this policy yet, so there is nothing to reckon a commission on.',
    }
  }

  const startDate = policy.startDate
  if (!startDate) {
    return { reason: 'This policy has no start date, so there is no date to book a commission against.' }
  }

  const scope = scopeFor(catalogue, policy)
  if (!scope) {
    return {
      reason: `${agency.name} has no active appointment for ${company.name} ${product.name}. Set the scope and its percentage in configuration.`,
    }
  }

  const agent = policy.agentId ? catalogue.agents.get(policy.agentId) : undefined
  const subAgent = policy.subAgentId ? catalogue.agents.get(policy.subAgentId) : undefined

  const result = commissionChain({
    trigger: COMMISSION_TRIGGERS.policyIssued,
    policyId: policy.id,
    basis,
    ...payerFor(agency, company),
    placement: {
      companyId: policy.companyId,
      productId: policy.productId,
      label: `${company.shortName} ${product.name}`,
    },
    agencyScope: appointedScope(catalogue, agency.id),
    agencyPercentBp: scope.commissionPercentBp,
    agent: agent ? { id: agent.id, sharePercentBp: agent.sharePercentBp } : null,
    subAgent: subAgent ? { id: subAgent.id, sharePercentBp: subAgent.sharePercentBp } : null,
    // The cap belongs to the PARENT agent, not to the sub-agent: it is the
    // ceiling the grant was issued under (canvas 6.4).
    capPercentBp: agent?.canGrantSubAgents ? agent.subAgentCapPercentBp : undefined,
    // The projection is dated by the policy's own start, not by a clock: this
    // screen shows what the arrangement implies, and a figure that moved every
    // time somebody opened the page would not be a ledger.
    bookedAt: startDate,
    bookedBy: agency.id,
  })

  if (!result.ok) return { reason: reasonOf(result) }

  const statementRow = catalogue.booked.find(
    (entry) => entry.policyId === policy.id && entry.kind === LEDGER_ENTRY_KINDS.commissionBooked,
  )

  return {
    policyId: policy.id,
    systemNo: policy.systemNo,
    insurerNo: policy.insurerNo,
    customerName: catalogue.customerNames.get(policy.customerId) ?? 'Unknown customer',
    companyName: company.name,
    productName: product.name,
    agencyName: agency.name,
    payerName: agency.type === 'broker' ? agency.name : company.name,
    agentName: agent?.name ?? null,
    subAgentName: subAgent?.name ?? null,
    chain: result.chain,
    // The compile-time bridge: the domain's row shape assigned into the data
    // layer's. If either side gains or loses a field, this line stops building.
    ledgerRows: result.chain.entries,
    bookedFromStatement: statementRow?.amount ?? null,
    scope: policyScope(catalogue, policy),
  }
}
