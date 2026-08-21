import type { Db as MongoDatabase, Document } from 'mongodb'

/**
 * Indexes and document validators.
 *
 * This is the Mongo equivalent of the SQL migrations: there is no schema to
 * "migrate" in the Postgres sense (a collection accepts any document until you
 * tell it otherwise), so instead this creates the indexes uniqueness depends on
 * and the validators that stand in for the CHECK constraints and the balance
 * trigger. Running it twice is a no-op — `createIndex` with an identical spec
 * and `collMod` on an existing validator both just re-assert the same state —
 * so unlike the old migration runner there is no `applied_migrations` table to
 * maintain: idempotency here falls out of the operations themselves rather
 * than being bookkept by hand.
 *
 * What moved from "the database enforces this for every writer, including a
 * raw driver session" to "the application enforces this, and only through the
 * one code path everything goes through" — and why — is explained where each
 * one used to be a Postgres trigger:
 *
 *   - The balance check (debits equal credits per journal entry) is still a
 *     real MongoDB validator below, and still fires on a raw insert. Embedding
 *     a journal entry's lines on the entry itself is what makes that possible:
 *     the check is a single document's own arithmetic, not something that has
 *     to compare across separate rows the way a Postgres deferred constraint
 *     trigger did.
 *
 *   - "A posted document (or a journal entry, ever) cannot be edited or
 *     deleted" cannot be expressed the same way. A MongoDB validator sees only
 *     the document being written, never the one it is replacing, so there is no
 *     stateless rule that says "unless this used to be posted". That guarantee
 *     now lives entirely in domain/posting.ts, which is the only code path
 *     permitted to write to `documents` and `journal_entries` — see the comment
 *     there, and test/ledger.test.ts, which tests the boundary of that
 *     protection explicitly rather than assuming it.
 */

async function upsertValidator(db: MongoDatabase, name: string, validator: Document): Promise<void> {
  try {
    await db.createCollection(name, { validator, validationLevel: 'strict', validationAction: 'error' })
  } catch (error) {
    // 48 = NamespaceExists. Anything else is a real failure.
    if ((error as { code?: number }).code !== 48) throw error
    await db.command({ collMod: name, validator, validationLevel: 'strict', validationAction: 'error' })
  }
}

export async function ensureIndexes(db: MongoDatabase): Promise<void> {
  // ---------------------------------------------------------------- users
  await db
    .collection('users')
    .createIndex({ email: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } })

  // ------------------------------------------------------------- accounts
  await db.collection('accounts').createIndex({ entityId: 1, code: 1 }, { unique: true })

  // ------------------------------------------------------------- periods
  await db.collection('accounting_periods').createIndex({ entityId: 1, startsOn: 1 }, { unique: true })
  await upsertValidator(db, 'accounting_periods', {
    $expr: { $gte: ['$endsOn', '$startsOn'] },
  })

  // --------------------------------------------------------- number series
  await db
    .collection('number_series')
    .createIndex({ entityId: 1, docType: 1, fiscalYear: 1 }, { unique: true })
  await upsertValidator(db, 'number_series', {
    $expr: { $gte: ['$nextValue', 1] },
  })

  // ---------------------------------------------------------------- parties
  await db.collection('parties').createIndex({ entityId: 1, name: 1 })

  // ------------------------------------------------------------------ items
  await db.collection('items').createIndex({ entityId: 1, name: 1 })
  await upsertValidator(db, 'items', {
    $expr: { $gte: ['$unitPriceMinor', 0] },
  })

  // -------------------------------------------------------------- documents
  const documents = db.collection('documents')
  await documents.createIndex(
    { entityId: 1, docType: 1, docNumber: 1 },
    { unique: true, partialFilterExpression: { docNumber: { $type: 'string' } } },
  )
  await documents.createIndex({ partyId: 1, issueDate: 1 })
  await documents.createIndex({ entityId: 1, docType: 1, status: 1, issueDate: -1 })
  await documents.createIndex({ entityId: 1, status: 1, docType: 1, issueDate: 1 })
  await documents.createIndex({ correctsDocumentId: 1 })
  // A posted document must carry a number and a posting stamp; a draft must
  // carry neither, the total can never go negative, and a document can never
  // be allocated for more than it is worth. All of this is stateless — "this
  // document, as written, is internally consistent" — so it stays a real
  // validator. The allocation bound is the direct replacement for Postgres's
  // `assert_allocation_within_total` trigger: there, the check ran against a
  // SUM over a separate `allocations` table; here, `allocatedMinor` is a
  // running total kept on the document itself specifically so the same check
  // can be this document's own arithmetic. See `allocateAmount` in
  // domain/posting.ts for how it stays correct under concurrent payments.
  await upsertValidator(db, 'documents', {
    $expr: {
      $and: [
        {
          $or: [
            { $ne: ['$status', 'posted'] },
            { $and: [{ $ne: ['$docNumber', null] }, { $ne: ['$postedAt', null] }] },
          ],
        },
        { $gte: ['$totalMinor', 0] },
        { $gte: ['$allocatedMinor', 0] },
        { $lte: ['$allocatedMinor', '$totalMinor'] },
      ],
    },
  })

  // ------------------------------------------------------------ journal entries
  const journalEntries = db.collection('journal_entries')
  await journalEntries.createIndex({ sourceType: 1, sourceId: 1 })
  await journalEntries.createIndex({ periodId: 1 })
  await journalEntries.createIndex({ entityId: 1, entryDate: 1 })
  await journalEntries.createIndex({ entityId: 1, 'lines.partyId': 1, entryDate: 1 })
  await journalEntries.createIndex({ reversalOfId: 1 })

  // The ledger's central invariant: every entry balances, every line is a
  // debit or a credit (never both, never negative, never empty), and an entry
  // needs at least one line. All of it is arithmetic over this one document's
  // own embedded array, so it holds even for a write that goes straight at the
  // collection, bypassing domain/posting.ts entirely.
  await upsertValidator(db, 'journal_entries', {
    $expr: {
      $and: [
        { $gt: [{ $size: '$lines' }, 0] },
        { $eq: [{ $sum: '$lines.debitMinor' }, { $sum: '$lines.creditMinor' }] },
        {
          $allElementsTrue: {
            $map: {
              input: '$lines',
              as: 'l',
              in: {
                $and: [
                  { $gte: ['$$l.debitMinor', 0] },
                  { $gte: ['$$l.creditMinor', 0] },
                  { $or: [{ $eq: ['$$l.debitMinor', 0] }, { $eq: ['$$l.creditMinor', 0] }] },
                  { $or: [{ $gt: ['$$l.debitMinor', 0] }, { $gt: ['$$l.creditMinor', 0] }] },
                ],
              },
            },
          },
        },
      ],
    },
  })

  // -------------------------------------------------------------- allocations
  const allocations = db.collection('allocations')
  await allocations.createIndex({ toDocumentId: 1 })
  await allocations.createIndex({ fromDocumentId: 1 })
  await upsertValidator(db, 'allocations', {
    $expr: { $gt: ['$amountMinor', 0] },
  })

  // ---------------------------------------------------------------- audit log
  await db.collection('audit_log').createIndex({ recordType: 1, recordId: 1 })
  await db.collection('audit_log').createIndex({ at: 1 })

  // -------------------------------------------------------------------- outbox
  await db.collection('outbox').createIndex({ deliveredAt: 1, nextAttemptAt: 1 })
  await db.collection('outbox').createIndex({ createdAt: 1 })
}
