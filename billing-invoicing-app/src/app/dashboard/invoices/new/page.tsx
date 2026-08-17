import Link from 'next/link'
import { ArrowLeft, Users } from 'lucide-react'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { entities } from '@/db/schema'
import { requireRole } from '@/lib/session'
import { listItems, listParties, getDocument } from '@/lib/queries'
import { InvoiceForm } from '@/app/dashboard/invoices/invoice-form'
import { Button } from '@/components/ui/button'

export const metadata = { title: 'New document · Billing' }
export const dynamic = 'force-dynamic'

export default async function NewInvoicePage(props: PageProps<'/dashboard/invoices/new'>) {
  const session = await requireRole('accountant')
  const params = await props.searchParams

  const docType = params.docType === 'credit_note' ? 'credit_note' : 'invoice'
  const corrects = typeof params.corrects === 'string' ? params.corrects : undefined

  const [parties, items, [org]] = await Promise.all([
    listParties(session.entityId, ''),
    listItems(session.entityId, ''),
    db.select().from(entities).where(eq(entities.id, session.entityId)).limit(1),
  ])

  // A credit note starts as a copy of the invoice it corrects.
  const source = corrects ? await getDocument(session.entityId, corrects) : null

  const seed = source
    ? {
        id: '',
        docType,
        partyId: source.doc.partyId,
        issueDate: new Date().toISOString().slice(0, 10),
        dueDate: null,
        discountType: source.doc.discountType,
        discountValue: source.doc.discountValue,
        notes: `Credit note against ${source.doc.docNumber}`,
        terms: source.doc.terms,
        lines: source.lines.map((line) => ({
          itemId: line.itemId,
          description: line.description,
          hsnSac: line.hsnSac,
          unit: line.unit,
          quantity: line.quantity,
          unitPriceMinor: line.unitPriceMinor,
          taxRatePercent: line.taxRatePercent,
        })),
      }
    : undefined

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground w-fit -ml-2">
          <Link href="/dashboard/invoices">
            <ArrowLeft />
            Back to documents
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          {docType === 'credit_note' ? 'New credit note' : 'New invoice'}
        </h1>
        {source ? (
          <p className="text-muted-foreground text-sm">
            Correcting {source.doc.docNumber}. Posting this reduces revenue and settles
            that invoice.
          </p>
        ) : null}
      </div>

      {parties.length === 0 ? (
        <div className="bg-card flex flex-col items-center gap-3 rounded-xl border p-12 text-center">
          <div className="bg-muted text-muted-foreground flex size-11 items-center justify-center rounded-full">
            <Users className="size-5" />
          </div>
          <div>
            <p className="font-medium">Add a client first</p>
            <p className="text-muted-foreground text-sm">A document has to be addressed to someone.</p>
          </div>
          <Button asChild variant="outline">
            <Link href="/dashboard/clients/new">Add a client</Link>
          </Button>
        </div>
      ) : (
        <InvoiceForm
          parties={parties}
          items={items}
          sellerStateCode={org?.stateCode ?? ''}
          docType={docType}
          correctsDocumentId={corrects}
          document={seed}
        />
      )}
    </div>
  )
}
