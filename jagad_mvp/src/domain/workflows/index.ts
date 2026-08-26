/**
 * The §9 machines, in the order §9 lists them.
 *
 * Everything a screen or a repository needs from a workflow comes through here:
 * the state sets, the machines, and the guards, which are exported individually
 * so a form can call the same function the transition will call and disable a
 * control with the same sentence the refusal would have carried.
 */

export * from './machine'
export * from './inquiry'
export * from './quotation'
export * from './deal'
export * from './policy'
export * from './kycConsent'
export * from './collection'
export * from './claim'
export * from './renewalTask'
export * from './noticeBatch'
export * from './premiumSchedule'
export * from './instalment'
export * from './mandate'
export * from './endorsement'
export * from './commissionShare'
