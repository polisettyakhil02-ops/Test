import Link from 'next/link'
import { notFound } from 'next/navigation'
import { isValidObjectId } from 'mongoose'
import { ArrowLeft } from 'lucide-react'
import { connectToDatabase } from '@/lib/mongodb'
import { Client, type IClient } from '@/models/Client'
import { Item, type IItem } from '@/models/Item'
import { Invoice } from '@/models/Invoice'
import { toClientDTO, toItemDTO, toInvoiceDTO } from '@/lib/dto'
import { InvoiceForm } from '@/app/dashboard/invoices/invoice-form'
import { Button } from '@/components/ui/button'

export const metadata = {
  title: 'Edit invoice · Billing & Invoicing',
}

export default async function EditInvoicePage(
  props: PageProps<'/dashboard/invoices/[id]/edit'>,
) {
  const { id } = await props.params

  if (!isValidObjectId(id)) {
    notFound()
  }

  await connectToDatabase()

  const [invoiceDoc, clientDocs, itemDocs] = await Promise.all([
    Invoice.findById(id).lean(),
    Client.find({}).sort({ name: 1 }).lean<IClient[]>(),
    Item.find({}).sort({ name: 1 }).lean<IItem[]>(),
  ])

  if (!invoiceDoc) {
    notFound()
  }

  const invoice = toInvoiceDTO(invoiceDoc as Parameters<typeof toInvoiceDTO>[0])
  const clients = clientDocs.map((doc) =>
    toClientDTO(doc as Parameters<typeof toClientDTO>[0]),
  )
  const items = itemDocs.map((doc) => toItemDTO(doc as Parameters<typeof toItemDTO>[0]))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="text-muted-foreground w-fit -ml-2"
        >
          <Link href={`/dashboard/invoices/${invoice.id}`}>
            <ArrowLeft />
            Back to invoice
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          {invoice.invoiceNumber}
        </h1>
      </div>

      <InvoiceForm clients={clients} items={items} invoice={invoice} />
    </div>
  )
}
