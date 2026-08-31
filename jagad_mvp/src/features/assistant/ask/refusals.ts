/**
 * The questions the Assistant declines — plan §14.1, FR-22.5, FR-22.13.
 *
 * There is a difference between "I do not know that" and "I will not do that",
 * and until now this feature only had the first. A person who types "what is
 * the customer's Aadhaar number" and gets back "this build answers a fixed set
 * of questions" has been told nothing about the boundary; they are left to
 * assume the answer exists somewhere and this build is simply thin.
 *
 * So a boundary question gets a boundary answer. It is the strongest thing this
 * product can show a person and it costs one turn: the Assistant says plainly
 * that the field is absent from what it reads rather than filtered out of what
 * it says, and names where that is enforced.
 *
 * Two design points, both deliberate:
 *
 *   The refusal text is not written here. Every rule points at an entry in
 *   `NEVER` — the same list the capabilities page prints — so the promise a
 *   person reads on the reading page and the promise they get when they test
 *   it cannot drift apart. One list, two surfaces.
 *
 *   This is not the enforcement and must never be mistaken for one. The
 *   enforcement is that the field is not in `ASSISTANT_ALLOW`, which is why
 *   there is nothing here for a rephrasing to get around: a question these
 *   patterns miss still reaches a projection that does not carry the field, and
 *   is answered with what the projection has. Pattern matching on the way in is
 *   an explanation, not a control. Layer 1 is the classification, layer 2 the
 *   allow-list, layer 3 the boundary test; this is the sentence that tells a
 *   person the three exist.
 */

import { NEVER } from '../capabilities/capabilities'
import type { Block } from '../blocks/blocks'
import type { CardAnswer } from './card-kit'

/** What a refused turn is tagged with, where an answered one carries its kind. */
export const REFUSAL_TAG = 'Refused'

export const REFUSAL_KINDS = {
  /** An identity or bank number, in any form, masked included. */
  identity: 'identity',
  /** A diagnosis, a health declaration, a medical history. */
  health: 'health',
  /** The body text of a document, its file, its name, its extraction. */
  document: 'document',
  /** A figure the Assistant would have to work out — D3, FR-22.5. */
  money: 'money',
} as const

export type RefusalKind = (typeof REFUSAL_KINDS)[keyof typeof REFUSAL_KINDS]

/** The key of the promise on the capabilities page this refusal is keeping. */
type NeverKey = (typeof NEVER)[number]['key']

export type Refusal = {
  readonly kind: RefusalKind
  readonly headline: string
  readonly never: NeverKey
}

type Rule = Refusal & { readonly pattern: RegExp }

/**
 * The rules, in the order they are tried.
 *
 * Each pattern is deliberately narrow. A wrongly refused question is a product
 * that looks evasive, which is nearly as bad as one that answers everything —
 * so "health" on its own is not a trigger (a health inquiry is ordinary work),
 * while "health declaration" is.
 */
const RULES: readonly Rule[] = [
  {
    kind: REFUSAL_KINDS.identity,
    never: 'sensitive',
    pattern:
      /\b(aadhaar|aadhar|uidai|pan\s*(number|card|no)|bank\s*(account|details)|account\s*number|ifsc|identity\s*number|last\s*(4|four)\s*(digits)?)\b/i,
    headline:
      'I cannot answer that, and not because I was told not to. An identity number is absent from everything I read — an Aadhaar in any form, its last four digits included, a PAN, a bank account. It was never in the query, so there is nothing here to withhold.',
  },
  {
    kind: REFUSAL_KINDS.health,
    never: 'health',
    pattern:
      /\b(diagnos\w*|illness|disease|ailment|prescription|pre[\s-]?existing|medical\s*(report|record|history|note)s?|health\s*(declaration|record|history|condition)s?)\b/i,
    headline:
      'I cannot answer that. A diagnosis, a health declaration and a medical history are outside what I read entirely. I can tell you where a claim has got to, what is outstanding on its checklist and how long it has waited — never what it is for.',
  },
  {
    kind: REFUSAL_KINDS.document,
    never: 'sensitive',
    pattern:
      /\b(ocr|extracted\s*text|file\s*name|filename|document\s*(text|body|contents?)|contents?\s*of\s*the\s*(document|file|scan|pdf)|(read|open|show)\s*(me\s*)?the\s*(document|file|scan|pdf|attachment)|what\s*does\s*the\s*(document|file|scan|pdf)\s*say)\b/i,
    headline:
      'I cannot answer that. I see that a document exists, what type it is, when it was submitted and whether it has been verified. I never see the file itself, its name, or the text taken off it.',
  },
  {
    kind: REFUSAL_KINDS.money,
    never: 'money',
    pattern:
      /\b(calculate|compute|work\s*out|estimate|suggest\s*a\s*(premium|amount|settlement|refund)|what\s*should\s*the\s*(premium|settlement|refund|amount)|how\s*much\s*should|total\s*the|sum\s*the|add\s*up)\b/i,
    headline:
      'I will not work that out. No premium, settlement, refund or endorsement delta is ever calculated, suggested or defaulted here — not by me, and not by the platform. I can repeat a figure somebody recorded against a record; I cannot produce one.',
  },
]

/** The rule a typed question trips, or null if it trips none. */
export function refusalFor(question: string): Refusal | null {
  for (const rule of RULES) {
    if (rule.pattern.test(question)) {
      return { kind: rule.kind, headline: rule.headline, never: rule.never }
    }
  }
  return null
}

function promiseFor(key: NeverKey): (typeof NEVER)[number] {
  const found = NEVER.find((entry) => entry.key === key)
  // The keys are literal types off the same array, so this cannot be missing;
  // the fallback exists so a refusal degrades to a shorter refusal rather than
  // to a crash if that array is ever reordered by hand.
  return found ?? NEVER[0]
}

/**
 * The refused turn.
 *
 * Two blocks and no third. The sentence says what will not happen; the note
 * restates the standing promise and names the file that keeps it, so the claim
 * is checkable rather than merely reassuring. There is no chip, no alternative
 * phrasing offered and no "but I could…", because every one of those reads as
 * an invitation to try again with different words.
 */
export function refusalAnswer(refusal: Refusal): CardAnswer {
  const promise = promiseFor(refusal.never)

  const blocks: Block[] = [
    { kind: 'para', text: refusal.headline },
    {
      kind: 'note',
      text: `${promise.claim}: never. ${promise.detail} Where that is enforced: ${promise.where}.`,
    },
  ]

  return { blocks }
}
