import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Download, FileText, Pencil, Undo2 } from 'lucide-react'
import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import { accounts, journalEntries, journalLines } from '@/db/schema'
import { requireSession } from '@/lib/session'
import { getDocument } from '@/lib/queries'
import { postDocument, voidDocument } from '@/app/dashboard/invoices/actions'
import { taxSummary } from '@/domain/pricing'
import {
  DOC_TYPE_LABELS,
  formatDate,
  formatMoney,
  settlementOf,
  SETTLEMENT_LABELS,
  SETTLEMENT_VARIANTS,
  today,
} from '@/lib/dto'
import { PostButton, VoidButton } from '@/components/document-actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export const metadata = { title: 'Document · Billing' }
export const dynamic = 'force-dynamic'

export default async function DocumentPage(props: PageProps<'/dashboard/invoices/[id]'>) {
  const session = await requireSession()
  const { id } = await props.params

  const found = await getDocument(session.entityId, id).catch(() => null)
  if (!found) notFound()

  const { doc, lines, allocatedMinor } = found
  const state = settlementOf({
    status: doc.status,
    totalMinor: doc.totalMinor,
    allocatedMinor,
    dueDate: doc.dueDate,
    today: today(),
  })

  const summary = taxSummary(
    lines.map((line) => ({
      lineSubtotalMinor: line.lineSubtotalMinor,
      lineDiscountMinor: line.lineDiscountMinor,
      lineTaxMinor: line.lineTaxMinor,
      lineTotalMinor: line.lineTotalMinor,
      taxes: [],
    })),
  )

  // The ledger entry this document produced -- shown so the books are visible
  // from the document rather than hidden behind a report.
  const entryLines = doc.status === 'posted' || doc.status === 'voided'
    ? await db
        .select({
          entryId: journalEntries.id,
          memo: journalEntries.memo,
          code: accounts.code,
          name: accounts.name,
          debit: journalLines.debitMinor,
          credit: journalLines.creditMinor,
        })
        .from(journalLines)
        .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
        .innerJoin(accounts, eq(journalLines.accountId, accounts.id))
        .where(and(eq(journalEntries.sourceId, doc.id)))
        .orderBy(journalEntries.postedAt, journalLines.lineNo)
    : []

  const isDraft = doc.status === 'draft'
  const isInvoice = doc.docType === 'invoice'

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground w-fit -ml-2">
          <Link href="/dashboard/invoices">
            <ArrowLeft />
            Back to documents
          </Link>
        </Button>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">
              {doc.docNumber ?? `${DOC_TYPE_LABELS[doc.docType]} draft`}
            </h1>
            <Badge variant={SETTLEMENT_VARIANTS[state]}>{SETTLEMENT_LABELS[state]}</Badge>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isDraft ? (
              <>
                <Button asChild variant="outline">
                  <Link href={`/dashboard/invoices/${doc.id}/edit`}>
                    <Pencil />
                    Edit
                  </Link>
                </Button>
                <PostButton
                  action={postDocument.bind(null, doc.id)}
                  title="Post this document?"
                  description="It gets its number, writes a balanced entry to the ledger, and becomes read-only. Corrections after this are made with a credit note."
                />
              </>
            ) : (
              <>
                <Button asChild variant="outline">
                  <a href={`/dashboard/invoices/${doc.id}/pdf`} target="_blank" rel="noopener noreferrer">
                    <FileText />
                    View PDF
                  </a>
                </Button>
                <Button asChild variant="outline">
                  <a href={`/dashboard/invoices/${doc.id}/pdf?download=1`}>
                    <Download />
                    Download
                  </a>
                </Button>
                {doc.status === 'posted' && isInvoice ? (
                  <Button asChild variant="outline">
                    <Link href={`/dashboard/invoices/new?docType=credit_note&corrects=${doc.id}`}>
                      <Undo2 />
                      Credit note
                    </Link>
                  </Button>
                ) : null}
                {doc.status === 'posted' && session.role === 'admin' ? (
                  <VoidButton
                    action={voidDocument.bind(null, doc.id)}
                    number={doc.docNumber ?? 'this document'}
                  />
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="bg-card grid gap-6 rounded-xl border p-6 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs font-medium uppercase">Billed to</span>
          <span className="font-medium">{doc.partySnapshot.name || '—'}</span>
          {doc.partySnapshot.address ? (
            <span className="text-muted-foreground text-sm">{doc.partySnapshot.address}</span>
          ) : null}
          {doc.partySnapshot.gstin ? (
            <span className="text-muted-foreground font-mono text-xs">
              GSTIN {doc.partySnapshot.gstin}
            </span>
          ) : null}
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <div className="flex gap-2 text-sm">
            <span className="text-muted-foreground">Issued</span>
            <span>{formatDate(doc.issueDate)}</span>
          </div>
          <div className="flex gap-2 text-sm">
            <span className="text-muted-foreground">Due</span>
            <span>{doc.dueDate ? formatDate(doc.dueDate) : '—'}</span>
          </div>
          <div className="flex gap-2 text-sm">
            <span className="text-muted-foreground">Supply</span>
            <span>{doc.supplyKind === 'inter_state' ? 'Inter-state (IGST)' : 'Intra-state (CGST + SGST)'}</span>
          </div>
          {doc.docType !== 'payment' ? (
            <div className="flex gap-2 text-sm">
              <span className="text-muted-foreground">Open</span>
              <span className="font-medium tabular-nums">
                {formatMoney(doc.totalMinor - allocatedMinor)}
              </span>
            </div>
          ) : null}
        </div>
      </div>

      {lines.length > 0 ? (
        <div className="bg-card rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead>HSN / SAC</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">Tax</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell className="font-medium">{line.description}</TableCell>
                  <TableCell className="font-mono text-xs">{line.hsnSac || '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {line.quantity} {line.unit}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(line.unitPriceMinor)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{line.taxRatePercent}%</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(line.lineTotalMinor)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex justify-end border-t p-6">
            <div className="flex w-full max-w-xs flex-col gap-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="tabular-nums">{formatMoney(doc.subtotalMinor)}</span>
              </div>
              {doc.discountMinor > 0 ? (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Discount</span>
                  <span className="tabular-nums">−{formatMoney(doc.discountMinor)}</span>
                </div>
              ) : null}
              {summary.map((row) => (
                <div key={`${row.component}${row.ratePercent}`} className="flex justify-between">
                  <span className="text-muted-foreground">
                    {row.component} @ {row.ratePercent}%
                  </span>
                  <span className="tabular-nums">{formatMoney(row.amountMinor)}</span>
                </div>
              ))}
              <div className="mt-1 flex justify-between border-t pt-3 text-base font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{formatMoney(doc.totalMinor)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Settled</span>
                <span className="tabular-nums">{formatMoney(allocatedMinor)}</span>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {entryLines.length > 0 ? (
        <div className="bg-card rounded-xl border">
          <div className="border-b px-5 py-4">
            <h2 className="font-semibold">Ledger entry</h2>
            <p className="text-muted-foreground text-sm">
              What this document did to the books. Append-only — a correction adds
              a new entry rather than changing this one.
            </p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Memo</TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Credit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entryLines.map((line, index) => (
                <TableRow key={`${line.entryId}-${index}`}>
                  <TableCell>
                    <span className="font-mono text-xs">{line.code}</span> {line.name}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{line.memo}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {line.debit > 0 ? formatMoney(line.debit) : ''}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {line.credit > 0 ? formatMoney(line.credit) : ''}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      {doc.notes || doc.terms ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {doc.notes ? (
            <div className="bg-card rounded-xl border p-6">
              <p className="text-muted-foreground mb-2 text-xs font-medium uppercase">Notes</p>
              <p className="text-sm whitespace-pre-wrap">{doc.notes}</p>
            </div>
          ) : null}
          {doc.terms ? (
            <div className="bg-card rounded-xl border p-6">
              <p className="text-muted-foreground mb-2 text-xs font-medium uppercase">Terms</p>
              <p className="text-sm whitespace-pre-wrap">{doc.terms}</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
