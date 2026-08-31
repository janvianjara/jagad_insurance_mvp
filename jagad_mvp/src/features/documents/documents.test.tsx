import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { MockRepositories } from '../../data/mock'
import { resolveAccount } from '../../app/store'
import { MASK_CHAR } from '../../ui/type'
import { documentVault, loadVaultSubjects, mayOpen } from './data/vault'
import { WALKTHROUGH_NOW, WHO, freshRepositories, renderVault, signIn } from './test-harness'

/**
 * The document vault — plan §5, §14.1.
 *
 * Four promises, and every one of them is the kind that fails silently:
 *
 *   1. the list is METADATA. No file name, no MIME type, no extracted text, no
 *      OCR value reaches the DOM — a `document-content` field in a list is a
 *      content leak with a filter box on it;
 *   2. every open is logged, once per open, against the person who did it;
 *   3. no identity number is ever rendered in full, anywhere;
 *   4. the ACL is per record: a document is in the list only when the asker's
 *      scope reaches its SUBJECT, and a document has no owner of its own.
 *
 * Nothing here imports a fixture. Every expectation is read back through the same
 * repository the screen reads.
 */

let repositories: MockRepositories

beforeEach(async () => {
  repositories = freshRepositories()
  await signIn(repositories, WHO.priya)
})

async function userFor(repositories: MockRepositories, id: string) {
  const staff = await repositories.config.users()
  const person = staff.find((candidate) => candidate.id === id)
  if (!person) throw new Error(`No staff record for ${id}.`)
  return resolveAccount(person).user
}

async function everyDocument(repositories: MockRepositories) {
  const page = await repositories.documents.list({ page: 1, pageSize: 10_000 })
  return page.rows
}

describe('the list is metadata', () => {
  it('puts no document-content field on the screen', async () => {
    const documents = await everyDocument(repositories)

    renderVault(repositories)
    await screen.findByRole('heading', { name: 'Documents' })
    await screen.findByText(`${documents.length} documents`)

    const markup = document.body.textContent ?? ''

    for (const record of documents) {
      // fileName, mimeType, extractedText and every OCR value are classed
      // `document-content` in the registry. None of them belongs in a list.
      if (record.fileName) expect(markup).not.toContain(record.fileName)
      if (record.mimeType) expect(markup).not.toContain(record.mimeType)
      if (record.extractedText) expect(markup).not.toContain(record.extractedText)
      for (const field of record.ocrFields) {
        expect(markup).not.toContain(field.value)
      }
    }
  })

  it('carries the metadata a person searches on', async () => {
    const documents = await everyDocument(repositories)
    const withVersion = documents.find((record) => record.version > 1)

    renderVault(repositories)
    await screen.findByRole('heading', { name: 'Documents' })

    // Type, version, review state, retention class — the operational fields.
    expect(await screen.findByLabelText('Retention class')).toBeInTheDocument()
    if (withVersion) {
      const row = await screen.findByRole('row', { name: new RegExp(withVersion.systemNo) })
      expect(row.textContent).toContain(`v${withVersion.version}`)
    }
  })
})

describe('every open is logged', () => {
  it('records exactly one access entry per open, against the person who opened it', async () => {
    const vault = documentVault(repositories)
    const priya = await userFor(repositories, WHO.priya)
    const subjects = await loadVaultSubjects(repositories)
    const target = (await everyDocument(repositories))[0]

    expect(vault.accessLog()).toHaveLength(0)

    const opened = await vault.open(priya, subjects, target.id, {
      actorId: priya.id,
      now: WALKTHROUGH_NOW,
    })

    expect(opened?.document.id).toBe(target.id)

    const log = vault.accessLog()
    expect(log).toHaveLength(1)
    expect(log[0].documentId).toBe(target.id)
    expect(log[0].systemNo).toBe(target.systemNo)
    expect(log[0].actorId).toBe(priya.id)
    expect(log[0].openedAt).toBe(WALKTHROUGH_NOW.toISOString())
    // The MVP serves metadata; the entry says so rather than letting a later
    // audit read this as somebody having seen the paper.
    expect(log[0].shown).toBe('metadata')

    // Replaying the same open — React's development StrictMode does exactly
    // this — is the same open, not a second one.
    await vault.open(priya, subjects, target.id, { actorId: priya.id, now: WALKTHROUGH_NOW })
    expect(vault.accessLog(target.id)).toHaveLength(1)

    // Opening it again later is a second open, and gets its own entry.
    const later = new Date(WALKTHROUGH_NOW.getTime() + 60_000)
    await vault.open(priya, subjects, target.id, { actorId: priya.id, now: later })
    expect(vault.accessLog(target.id)).toHaveLength(2)
  })

  it('writes nothing to the log when the open is refused', async () => {
    const vault = documentVault(repositories)
    const kiran = await userFor(repositories, WHO.kiran)
    const subjects = await loadVaultSubjects(repositories)

    const refusable = (await everyDocument(repositories)).find(
      (record) => !mayOpen(kiran, subjects, record),
    )
    expect(refusable).toBeDefined()

    const opened = await vault.open(kiran, subjects, refusable!.id, {
      actorId: kiran.id,
      now: WALKTHROUGH_NOW,
    })

    expect(opened).toBeNull()
    expect(vault.accessLog()).toHaveLength(0)
  })

  it('records the open the address asks for, and shows it back', async () => {
    const target = (await everyDocument(repositories))[0]

    renderVault(repositories, `/documents?record=${target.id}`)

    // The log is shown to the person it is about — a log people are surprised
    // by is a log that gets worked around.
    await screen.findByText(/1 open recorded in this session/)
    expect(await screen.findAllByText(target.systemNo)).not.toHaveLength(0)
  })
})

describe('no identity number is ever rendered in full', () => {
  it('shows a customer’s Aadhaar and PAN only as their last four characters', async () => {
    const documents = await everyDocument(repositories)
    const identity = documents.find(
      (record) => record.docType === 'aadhaar' && record.subjectEntity === 'Customer',
    )
    expect(identity).toBeDefined()

    const customer = await repositories.customers.get(identity!.subjectId)
    expect(customer).not.toBeNull()

    renderVault(repositories, `/documents?record=${identity!.id}`)

    await screen.findByText('What it evidences')

    const markup = document.body.textContent ?? ''
    if (customer?.panNumber) {
      // The full PAN never reaches the DOM; the masked form does.
      expect(markup).not.toContain(customer.panNumber)
      expect(markup).toContain(MASK_CHAR)
      expect(markup).toContain(customer.panNumber.slice(-4))
    }
    // The store holds no full Aadhaar at all — the field is typed `null` and
    // never populated — so there is nothing here that could be unmasked.
    expect(customer?.aadhaarNumber).toBeNull()
  })
})

describe('the ACL is a record-level test', () => {
  it('gives an agent fewer documents than the back office, and only ones their scope reaches', async () => {
    const vault = documentVault(repositories)
    const priya = await userFor(repositories, WHO.priya)
    const kiran = await userFor(repositories, WHO.kiran)
    const subjects = await loadVaultSubjects(repositories)

    const whole = await vault.list(priya, subjects, { page: 1, pageSize: 10_000 })
    const own = await vault.list(kiran, subjects, { page: 1, pageSize: 10_000 })

    expect(own.total).toBeLessThan(whole.total)
    for (const record of own.rows) {
      expect(mayOpen(kiran, subjects, record)).toBe(true)
    }
  })

  it('fails closed on a document whose subject cannot be resolved', async () => {
    const kiran = await userFor(repositories, WHO.kiran)
    const priya = await userFor(repositories, WHO.priya)
    const orphan = {
      ...(await everyDocument(repositories))[0],
      subjectEntity: 'Nothing',
      subjectId: 'no-such-id',
    }

    // An unknown subject is tested as a record with no attributes: `all` passes,
    // anything narrower does not.
    expect(mayOpen(kiran, {}, orphan)).toBe(false)
    expect(mayOpen(priya, {}, orphan)).toBe(true)
  })
})
