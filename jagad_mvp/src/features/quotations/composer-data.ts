/**
 * Everything the composer reads, in one load — plan §7's repository seam.
 *
 * A screen never touches a fixture: the whole opening state of canvas 2.1 comes
 * back from repositories here, including the two halves the matrix needs — the
 * union of the picked products' mapped benefits, and each product's own map so a
 * cell can be pre-filled from that company's brochure and nobody else's.
 */

import type {
  Agent,
  BenefitItem,
  Company,
  Customer,
  Member,
  MessageLog,
  PolicyBenefitMap,
  Product,
  Quotation,
  QuotationLine,
  Repositories,
  StaffUser,
} from '../../data/repo'

export type ComposerData = {
  readonly quotation: Quotation
  readonly customer: Customer | null
  readonly members: readonly Member[]
  /** Every version's lines, so a prior version stays viewable exactly as sent. */
  readonly allLines: readonly QuotationLine[]
  readonly companies: readonly Company[]
  readonly products: readonly Product[]
  readonly benefitItems: readonly BenefitItem[]
  readonly mapsByProduct: Readonly<Record<string, readonly PolicyBenefitMap[]>>
  readonly users: readonly StaffUser[]
  /**
   * Agents and the source inquiry, resolved here rather than printed as ids.
   * The record block was showing `agt-kiran-solanki` and `inq-1025` beside a
   * properly resolved owner and customer - a person reading the screen has no
   * way to turn either back into a name.
   */
  readonly agents: readonly Agent[]
  readonly inquiryNo: string | null
  readonly agencyName: string
  /** FR-06.9's config fork, read from the recipe an admin edits. */
  readonly autoShare: boolean
  readonly channel: string
  readonly messages: readonly MessageLog[]
}

const AUTO_SHARE_RECIPE = 'quotation.autoShare'

/**
 * The columns this quotation is about.
 *
 * Once a version has lines, they are the answer. Before that the quotation is a
 * `draft` with no columns on it (§8: the matrix arrives at `compose`), so the
 * picked products come off the address — which is what keeps the composer
 * reconstructible from its URL rather than from something a screen remembered.
 */
export function productIdsFor(
  quotation: Quotation,
  allLines: readonly QuotationLine[],
  fromUrl: string,
): readonly string[] {
  const live = allLines.filter((line) => line.version === quotation.version)
  if (live.length > 0) return [...new Set(live.map((line) => line.productId))]
  return [...new Set(fromUrl.split(',').map((value) => value.trim()).filter(Boolean))]
}

export async function loadComposer(
  repositories: Repositories,
  id: string,
  colsParam: string,
): Promise<ComposerData | null> {
  const quotation = await repositories.quotations.get(id)
  if (!quotation) return null

  const allLines = await repositories.quotations.allLines(id)
  const productIds = productIdsFor(quotation, allLines, colsParam)

  const [
    customer,
    members,
    products,
    companies,
    catalogue,
    users,
    recipe,
    agencies,
    messages,
    union,
    agentPage,
    sourceInquiry,
  ] =
    await Promise.all([
      repositories.customers.get(quotation.customerId),
      repositories.customers.members(quotation.customerId),
      repositories.products.getMany(productIds),
      repositories.companies.list({ page: 1, pageSize: 200 }),
      repositories.benefits.list({ page: 1, pageSize: 500 }),
      repositories.config.users(),
      repositories.config.recipe(AUTO_SHARE_RECIPE),
      repositories.agencies.list({ page: 1, pageSize: 50 }),
      repositories.config.messages('Quotation', id),
      repositories.benefits.unionForProducts(productIds),
      repositories.agents.list({ page: 1, pageSize: 200 }),
      quotation.inquiryId ? repositories.inquiries.get(quotation.inquiryId) : Promise.resolve(null),
    ])

  const maps = await Promise.all(
    productIds.map(async (productId) => {
      const forProduct = await repositories.benefits.mapsForProduct(productId)
      return [productId, forProduct] as const
    }),
  )

  // The union names which catalogue items this comparison is about; the
  // per-product maps say what each column's cell starts as.
  const inUnion = new Set(union.map((entry) => entry.benefitItemId))

  return {
    quotation,
    customer,
    members,
    allLines,
    companies: companies.rows,
    products,
    benefitItems: catalogue.rows.filter((item) => inUnion.has(item.id)),
    mapsByProduct: Object.fromEntries(maps),
    users,
    agents: agentPage.rows,
    inquiryNo: sourceInquiry?.systemNo ?? null,
    agencyName: agencies.rows[0]?.name ?? 'Jagad Insurance',
    autoShare: recipe?.parameters.autoShare === true,
    channel: typeof recipe?.parameters.channel === 'string' ? recipe.parameters.channel : 'whatsapp',
    messages,
  }
}
