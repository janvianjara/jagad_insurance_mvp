/**
 * What an `accept` attribute means, in words a person can act on.
 *
 * The browser enforces `accept` by GREYING OUT every other file in the picker,
 * and says nothing about why. A person whose folder happens to hold no matching
 * file opens the dialog, finds everything dimmed, and concludes the upload is
 * broken — which is exactly how this was reported: "there is no option or way to
 * add files". Nothing was wrong; the field wanted a PDF or an image and never
 * said so anywhere on the screen.
 *
 * So the zone states its own terms. This is a label, not help text: it is the
 * shortest true answer to "what can I put here", and it is derived from the same
 * string the input enforces, so the two cannot drift.
 */

/** Full MIME types worth naming outright. */
const EXACT: Readonly<Record<string, string>> = {
  'application/pdf': 'PDF',
  'text/csv': 'CSV',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel',
  'application/vnd.ms-excel': 'Excel',
}

/** `image/*` and friends. */
const WILDCARD: Readonly<Record<string, string>> = {
  image: 'image',
  video: 'video',
  audio: 'audio',
  text: 'text file',
}

/** Bare extensions, which is how the import specs write theirs. */
const EXTENSION: Readonly<Record<string, string>> = {
  '.pdf': 'PDF',
  '.csv': 'CSV',
  '.xlsx': 'Excel',
  '.xls': 'Excel',
  '.png': 'PNG',
  '.jpg': 'JPEG',
  '.jpeg': 'JPEG',
}

function wordFor(token: string): string | null {
  const value = token.trim().toLowerCase()
  if (value === '') return null
  if (EXACT[value]) return EXACT[value]
  if (EXTENSION[value]) return EXTENSION[value]
  if (value.endsWith('/*')) return WILDCARD[value.slice(0, -2)] ?? null
  return null
}

/**
 * A readable summary of an `accept` string, or `null` when there is nothing
 * worth saying.
 *
 * `null` on an unrecognised token rather than a guess: printing a raw MIME type
 * at somebody is worse than printing nothing, and an accept string this does not
 * understand is a signal to add a word here, not to leak the attribute.
 */
export function acceptSummary(accept: string | undefined): string | null {
  if (accept === undefined) return null

  const words: string[] = []
  for (const token of accept.split(',')) {
    const word = wordFor(token)
    // One unknown token and the whole summary is withheld: a partial list reads
    // as an exhaustive one, and would make a legal file look unwelcome.
    if (word === null) return null
    if (!words.includes(word)) words.push(word)
  }

  if (words.length === 0) return null
  if (words.length === 1) return `${words[0]} only`
  const last = words[words.length - 1]
  return `${words.slice(0, -1).join(', ')} or ${last}`
}
