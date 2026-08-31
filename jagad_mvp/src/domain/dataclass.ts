/**
 * Field classification — plan §14.1, layer 1 of three.
 *
 * Every field on every entity carries a class. This is the foundation the
 * Assistant boundary rests on: the projection in `src/data/assistant/` is built
 * as an allow-list, and the CI boundary test (P-05) asserts that allow-list never
 * intersects the two classes below that the Assistant must not receive.
 *
 * Telling a model not to reveal an Aadhaar number is not a control. The value has
 * to be absent from the query, and this registry is where absence is decided.
 *
 * Adding a field without classifying it is a type error: entity types are declared
 * against `Classified<E>` and checked with `AssertFullyClassified<E, T>`, so an
 * unregistered field fails the build rather than defaulting to something safe-
 * looking. See dataclass.test.ts for the check in use.
 */

export const DATA_CLASSES = ['operational', 'contact', 'sensitive', 'document-content'] as const
export type DataClass = (typeof DATA_CLASSES)[number]

/**
 * The two classes the Assistant never receives, in any form.
 *
 * Note that a masked identifier is classed `sensitive` too. Staff with the grant
 * see the last four digits; the Assistant sees neither, because a masked
 * identifier is still an identifier for correlation purposes (§14.1).
 */
export const ASSISTANT_FORBIDDEN_CLASSES = ['sensitive', 'document-content'] as const
export type AssistantForbiddenClass = (typeof ASSISTANT_FORBIDDEN_CLASSES)[number]

/**
 * The registry.
 *
 * Seeded with the seven M0 entities; later steps extend it as entities land. The
 * `satisfies` clause keeps every value a real DataClass while `as const` keeps
 * each field name literal, so `FieldOf<'Customer'>` is a union of names rather
 * than `string`.
 */
export const FIELD_CLASSES = {
  Customer: {
    id: 'operational',
    systemNo: 'operational',
    householdId: 'operational',
    status: 'operational',
    source: 'operational',
    createdAt: 'operational',
    ownerId: 'operational',
    agentId: 'operational',
    subAgentId: 'operational',
    kycState: 'operational',
    consentState: 'operational',
    lastConsentChaseAt: 'operational',
    consentChaseCount: 'operational',
    fullName: 'contact',
    mobile: 'contact',
    altMobile: 'contact',
    email: 'contact',
    addressLine: 'contact',
    city: 'contact',
    state: 'contact',
    pincode: 'contact',
    dateOfBirth: 'contact',
    aadhaarNumber: 'sensitive',
    aadhaarLast4: 'sensitive',
    panNumber: 'sensitive',
    bankAccountNumber: 'sensitive',
    bankIfsc: 'sensitive',
  },

  Member: {
    id: 'operational',
    customerId: 'operational',
    householdId: 'operational',
    coveredUnderPolicyIds: 'operational',
    fullName: 'contact',
    relationship: 'contact',
    dateOfBirth: 'contact',
    gender: 'contact',
    mobile: 'contact',
    aadhaarNumber: 'sensitive',
    aadhaarLast4: 'sensitive',
    healthDeclaration: 'sensitive',
    preExistingConditions: 'sensitive',
    diagnosis: 'sensitive',
  },

  Policy: {
    id: 'operational',
    systemNo: 'operational',
    insurerNo: 'operational',
    customerId: 'operational',
    companyId: 'operational',
    productId: 'operational',
    agencyId: 'operational',
    agentId: 'operational',
    subAgentId: 'operational',
    status: 'operational',
    startDate: 'operational',
    expiryDate: 'operational',
    sumInsured: 'operational',
    netPremium: 'operational',
    gstAmount: 'operational',
    finalPremium: 'operational',
    premiumMode: 'operational',
    paymentState: 'operational',
    memberIds: 'operational',
    retentionClass: 'operational',
    provenance: 'operational',
    schemaVersion: 'operational',
    proposerBankAccount: 'sensitive',
    nomineeAadhaarLast4: 'sensitive',
    medicalReportSummary: 'document-content',
  },

  Document: {
    id: 'operational',
    systemNo: 'operational',
    subjectEntity: 'operational',
    subjectId: 'operational',
    docType: 'operational',
    version: 'operational',
    submittedAt: 'operational',
    verifiedAt: 'operational',
    verifiedBy: 'operational',
    reviewState: 'operational',
    retentionClass: 'operational',
    /** Presence, never content: the Assistant may know a file exists (FR-22.14). */
    isPresent: 'operational',
    uploadedByName: 'contact',
    fileName: 'document-content',
    fileUrl: 'document-content',
    mimeType: 'document-content',
    extractedText: 'document-content',
    ocrFields: 'document-content',
  },

  Inquiry: {
    id: 'operational',
    systemNo: 'operational',
    status: 'operational',
    source: 'operational',
    categoryId: 'operational',
    productInterest: 'operational',
    ownerId: 'operational',
    teamId: 'operational',
    agentId: 'operational',
    subAgentId: 'operational',
    assignedAt: 'operational',
    tatDueAt: 'operational',
    assignmentHistory: 'operational',
    escalationLevel: 'operational',
    createdAt: 'operational',
    customerId: 'operational',
    /*
     * Who referred this lead. `contact` rather than `operational` because the
     * object carries a person's name when the referrer is outside the system,
     * and a name is contact data wherever it sits.
     */
    referral: 'contact',
    /*
     * Engagement, FR-06.12 to .17. All five are operational on purpose: they say
     * that contact happened, when, how many times and what is next — never what
     * was said. The words themselves live on `Activity.notes`, which is
     * `document-content` and outside the allow-list for good.
     */
    stageKey: 'operational',
    stageEnteredAt: 'operational',
    contactAttempts: 'operational',
    lastActivityAt: 'operational',
    nextActionAt: 'operational',
    contactName: 'contact',
    contactMobile: 'contact',
    contactEmail: 'contact',
    notes: 'contact',
    /*
     * The discard mark — FR-20.2. `contact` rather than `operational` because
     * the mark carries the note a staff member typed when they discarded the
     * row, and a note explaining a duplicate routinely names the person it
     * duplicates.
     */
    discard: 'contact',
  },

  Quotation: {
    id: 'operational',
    systemNo: 'operational',
    version: 'operational',
    status: 'operational',
    customerId: 'operational',
    inquiryId: 'operational',
    ownerId: 'operational',
    agentId: 'operational',
    subAgentId: 'operational',
    companyIds: 'operational',
    productIds: 'operational',
    benefitRows: 'operational',
    premiumMode: 'operational',
    finalPayablePremium: 'operational',
    sharedAt: 'operational',
    acceptedColumnKeys: 'operational',
    awardedAt: 'operational',
    revisionReason: 'operational',
    lostReason: 'operational',
    createdAt: 'operational',
    documentId: 'document-content',
    /*
     * The discard mark — FR-20.2. `contact` rather than `operational` because
     * the mark carries the note a staff member typed when they discarded the
     * row, and a note explaining a duplicate routinely names the person it
     * duplicates.
     */
    discard: 'contact',
  },

  Deal: {
    id: 'operational',
    systemNo: 'operational',
    status: 'operational',
    quotationId: 'operational',
    customerId: 'operational',
    ownerId: 'operational',
    agentId: 'operational',
    subAgentId: 'operational',
    agencyId: 'operational',
    lineItems: 'operational',
    quotationVersion: 'operational',
    acceptedColumnKeys: 'operational',
    awardKey: 'operational',
    salesCreditSource: 'operational',
    createdAt: 'operational',
    consumedByPolicyId: 'operational',
    /*
     * The discard mark — FR-20.2. `contact` rather than `operational` because
     * the mark carries the note a staff member typed when they discarded the
     * row, and a note explaining a duplicate routinely names the person it
     * duplicates.
     */
    discard: 'contact',
  },
} as const satisfies Record<string, Record<string, DataClass>>

export type EntityName = keyof typeof FIELD_CLASSES
export type FieldOf<E extends EntityName> = Extract<keyof (typeof FIELD_CLASSES)[E], string>

export const ENTITY_NAMES = Object.keys(FIELD_CLASSES) as EntityName[]

/**
 * The shape an entity type must cover. Declare `interface Customer extends
 * Classified<'Customer'>` and every classified field has to exist on the entity.
 */
export type Classified<E extends EntityName> = Record<FieldOf<E>, unknown>

/**
 * The other direction, and the one that matters: resolves to `true` only when the
 * entity type introduces no field this registry has not classified. Assign it to
 * a `true` literal at the entity declaration and an unclassified field becomes a
 * compile error naming the offending field.
 */
export type AssertFullyClassified<E extends EntityName, T> =
  Exclude<Extract<keyof T, string>, FieldOf<E>> extends never
    ? true
    : { unclassifiedFields: Exclude<Extract<keyof T, string>, FieldOf<E>> }

export function classOf<E extends EntityName>(entity: E, field: FieldOf<E>): DataClass {
  return FIELD_CLASSES[entity][field] as DataClass
}

export function fieldsOf<E extends EntityName>(entity: E): FieldOf<E>[] {
  return Object.keys(FIELD_CLASSES[entity]) as FieldOf<E>[]
}

export function fieldsWithClass<E extends EntityName>(
  entity: E,
  ...classes: readonly DataClass[]
): FieldOf<E>[] {
  return fieldsOf(entity).filter((field) => classes.includes(classOf(entity, field)))
}

/** Every field the Assistant must never receive, for any entity. Used by P-05's boundary test. */
export function assistantForbiddenFields<E extends EntityName>(entity: E): FieldOf<E>[] {
  return fieldsWithClass(entity, ...ASSISTANT_FORBIDDEN_CLASSES)
}

export function isDataClass(value: string): value is DataClass {
  return (DATA_CLASSES as readonly string[]).includes(value)
}
