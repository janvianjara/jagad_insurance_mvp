/**
 * What the configuration screens share — the import surface for P-10b's
 * companies, products, benefits, agencies and agents screens, and for every
 * later form that offers a master-backed field.
 *
 * A sibling screen adds a folder next to `users/` and `masters/` and imports
 * from here; nothing in this folder knows which screens exist, so no screen has
 * to be edited to add one.
 */

export { GatedAction } from './GatedAction'
export type { GatedActionProps } from './GatedAction'

export { SectionNav } from './SectionNav'
export type { Section, SectionNavProps } from './SectionNav'

export { InlineMasterAdd } from './InlineMasterAdd'
export type { InlineMasterAddProps } from './InlineMasterAdd'

export { AgencyQuickAdd, AgentQuickAdd, CompanyQuickAdd, ProductQuickAdd } from './MarketQuickAdd'
export type {
  AgencyQuickAddProps,
  AgentQuickAddProps,
  CompanyQuickAddProps,
  ProductQuickAddProps,
} from './MarketQuickAdd'

export {
  masterKeyFrom,
  masterTypeByKey,
  policyFor,
  templateByKey,
  templateOf,
  useConfigStore,
  usersOnTemplate,
  valuesOfType,
} from './config-store'
export type { ConfigState, MasterTypeInput, MasterValueInput } from './config-store'

export {
  CONFIG_STATUSES,
  TEMPLATE_ORIGINS,
  TWO_FACTOR_EVENTS,
  TWO_FACTOR_EVENT_LABELS,
  TWO_FACTOR_LEVELS,
  TWO_FACTOR_LEVEL_LABELS,
  TWO_FACTOR_UNSET,
} from './config-types'
export type {
  ConfigMasterType,
  ConfigMasterValue,
  ConfigStatus,
  ConfigTemplate,
  ConfigUser,
  MasterValueRevision,
  TemplateOrigin,
  TwoFactorEvent,
  TwoFactorLevel,
  TwoFactorPolicy,
} from './config-types'

export { localPage } from './local-page'
export type { LocalCell, LocalFacet, LocalListSpec } from './local-page'

export {
  DELETION_OFFERS,
  NO_USAGE,
  deletionVerdict,
  describeUsage,
  isProbed,
  usageOf,
} from './master-usage'
export type { DeletionOffer, DeletionVerdict, MasterUsage } from './master-usage'

export {
  DATA_CLASS_LABELS,
  GRANTABLE_CLASSES,
  RESOURCE_LABELS,
  SCOPE_LEVEL_LABELS,
  actionsOn,
  assignmentChanges,
  cloneTemplate,
  copyTemplate,
  grantedResources,
  scopeOf,
  starterLibrary,
  templateChanges,
  templateReach,
  withDataClass,
  withGrant,
  withLabel,
  withScopeCategories,
  withScopeCompanies,
  withScopeLevel,
  withSubAgentReach,
} from './permission-template'
export type { TemplateChange } from './permission-template'

export { accountsFromConfig, resolveUser, syncSession } from './session-sync'

export { useEnsureConfig, useMasterOptions } from './use-config'
export type { ConfigReadState, MasterOptions } from './use-config'

/* ------------------------------------------- market and channel (P-10b) */

export {
  AGENCY_TYPE_LABELS,
  BENEFIT_KIND_LABELS,
  CHECKLIST_PURPOSE_LABELS,
  LIFE_LINE,
  LINE_LABELS,
} from './market-types'
export type {
  ConfigAgency,
  ConfigAgencyScope,
  ConfigAgent,
  ConfigBenefitItem,
  ConfigBenefitMap,
  ConfigChecklist,
  ConfigCompany,
  ConfigCompanyContact,
  ConfigProduct,
} from './market-types'

export {
  bpFromPercent,
  companyLinesFormOneLicence,
  individualAgencyHoldsOneCompany,
  nextAgencyCode,
  nextAgentCode,
  percentFromBp,
  percentIsValid,
  readPercent,
  scopeInsideAppointedCompanies,
  subAgentTeamIsConsistent,
} from './market-rules'
export type {
  AgencyAppointmentContext,
  AgencyScopeContext,
  SubAgentTeamContext,
} from './market-rules'

export {
  agencyById,
  agentsOfAgency,
  benefitById,
  benefitsForLine,
  checkSubAgentShare,
  checklistFor,
  companyById,
  contactsOfCompany,
  mapsOfProduct,
  parentAgentOf,
  placementOptionsFor,
  productById,
  productsOfCompany,
  scopesOfAgency,
  subAgentsOf,
  useMarketStore,
} from './market-store'
export type {
  AgencyInput,
  AgentInput,
  BenefitInput,
  BenefitSheetRow,
  CompanyInput,
  ContactInput,
  MarketRepositories,
  MarketState,
  ProductInput,
  ScopeDraftRow,
} from './market-store'

export { useEnsureMarket } from './use-market'
