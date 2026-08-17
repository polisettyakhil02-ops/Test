import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { entities } from '@/db/schema'
import { requireRole } from '@/lib/session'
import { allItems, allParties, getDocument } from '@/lib/queries'
import { InvoiceForm } from '@/app/dashboard/invoices/invoice-form'
import { Button } from '@/components/ui/button'

export const metadata = { title: 'Edit draft · Billing' }
export const dynamic = 'force-dynamic'

export default async function EditInvoicePage(props: PageProps<'/dashboard/invoices/[id]/edit'>) {
  const session = await requireRole('accountant')
  const { id } = await props.params

  const found = await getDocument(session.entityId, id)
  if (!found) notFound()

  // Posted documents are immutable; there is nothing to edit.
  if (found.doc.status !== 'draft') redirect(`/dashboard/invoices/${id}`)

  const [parties, items, [org]] = await Promise.all([
    allParties(session.entityId),
    allItems(session.entityId),
    db.select().from(entities).where(eq(entities.id, session.entityId)).limit(1),
  ])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground w-fit -ml-2">
          <Link href={`/dashboard/invoices/${id}`}>
            <ArrowLeft />
            Back to document
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Edit draft</h1>
      </div>

      <InvoiceForm
        parties={parties}
        items={items}
        sellerStateCode={org?.stateCode ?? ''}
        docType={found.doc.docType as 'invoice' | 'credit_note'}
        document={{
          id: found.doc.id,
          docType: found.doc.docType,
          partyId: found.doc.partyId,
          issueDate: found.doc.issueDate,
          dueDate: found.doc.dueDate,
          discountType: found.doc.discountType,
          discountValue: found.doc.discountValue,
          notes: found.doc.notes,
          terms: found.doc.terms,
          lines: found.lines.map((line) => ({
            itemId: line.itemId,
            description: line.description,
            hsnSac: line.hsnSac,
            unit: line.unit,
            quantity: line.quantity,
            unitPriceMinor: line.unitPriceMinor,
            taxRatePercent: line.taxRatePercent,
          })),
        }}
      />
    </div>
  )
}
