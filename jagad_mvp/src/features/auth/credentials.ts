/**
 * What "who is signing in" means, as arithmetic — plan §4's `/login`, §11.1.
 *
 * Nothing here touches React, the session store or the configuration store. It
 * takes the staff list a repository served and an identifier a person typed, and
 * says which of three things happened: the identifier names an account that may
 * sign in, it names an account that has been switched off, or it names nobody.
 *
 * The three are kept apart on purpose. "We do not recognise that address" and
 * "that account is no longer active" are different facts about the agency, and a
 * screen that collapses them into one message teaches a person to retype a
 * perfectly correct address. Telling somebody their account exists is not a
 * disclosure worth protecting here: this is a single-tenant staff console whose
 * whole account list is printed on the sign-in page.
 */

import type { StaffUser } from '../../data/repo'

/** An identifier is an email address or an Indian mobile number. Nothing else. */
export const IDENTIFIER_KINDS = {
  email: 'email',
  mobile: 'mobile',
  unknown: 'unknown',
} as const

export type IdentifierKind = (typeof IDENTIFIER_KINDS)[keyof typeof IDENTIFIER_KINDS]

export const SIGN_IN_OUTCOMES = {
  found: 'found',
  inactive: 'inactive',
  unrecognised: 'unrecognised',
  empty: 'empty',
} as const

export type SignInOutcomeKind = (typeof SIGN_IN_OUTCOMES)[keyof typeof SIGN_IN_OUTCOMES]

export type SignInOutcome =
  | { readonly kind: 'found'; readonly staff: StaffUser }
  | { readonly kind: 'inactive'; readonly staff: StaffUser }
  | { readonly kind: 'unrecognised' }
  | { readonly kind: 'empty' }

/** Digits only, and only the last ten of them: +91, 0 and spaces all fall away. */
export function mobileDigits(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  return digits.length > 10 ? digits.slice(-10) : digits
}

export function identifierKind(raw: string): IdentifierKind {
  const value = raw.trim()
  if (value === '') return IDENTIFIER_KINDS.unknown
  if (value.includes('@')) return IDENTIFIER_KINDS.email
  if (mobileDigits(value).length === 10) return IDENTIFIER_KINDS.mobile
  return IDENTIFIER_KINDS.unknown
}

/**
 * The account an identifier names, active or not.
 *
 * Matching is deliberately generous about how the number was typed and exact
 * about the address: people write mobile numbers six ways and email addresses
 * one, minus the capitals.
 */
export function findAccount(
  staff: readonly StaffUser[],
  identifier: string,
): StaffUser | undefined {
  const typed = identifier.trim()
  if (typed === '') return undefined

  const email = typed.toLowerCase()
  const mobile = mobileDigits(typed)

  return staff.find((person) => {
    if (person.email.toLowerCase() === email) return true
    return mobile.length === 10 && mobileDigits(person.mobile) === mobile
  })
}

export function signIn(staff: readonly StaffUser[], identifier: string): SignInOutcome {
  if (identifier.trim() === '') return { kind: SIGN_IN_OUTCOMES.empty }

  const person = findAccount(staff, identifier)
  if (!person) return { kind: SIGN_IN_OUTCOMES.unrecognised }
  if (!person.active) return { kind: SIGN_IN_OUTCOMES.inactive, staff: person }
  return { kind: SIGN_IN_OUTCOMES.found, staff: person }
}

/** What the screen says when an identifier does not resolve to a way in. */
export function refusalFor(outcome: SignInOutcome, identifier: string): string | null {
  switch (outcome.kind) {
    case SIGN_IN_OUTCOMES.empty:
      return 'Enter the email address or mobile number your account was created with.'
    case SIGN_IN_OUTCOMES.unrecognised:
      return `No Jagad Insurance account uses ${identifier.trim()}. Check it, or pick one of the demo accounts listed beside this form.`
    case SIGN_IN_OUTCOMES.inactive:
      return `${outcome.staff.name}'s account has been deactivated, so it cannot sign in. An administrator can reactivate it in Configuration, Users.`
    default:
      return null
  }
}
