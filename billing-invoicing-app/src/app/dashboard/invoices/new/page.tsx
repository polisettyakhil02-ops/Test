import Link from 'next/link'
import { ArrowLeft, Users } from 'lucide-react'
import { connectToDatabase } from '@/lib/mongodb'
import { Client, type IClient } from '@/models/Client'
import { Item, type IItem } from '@/models/Item'
import { toClientDTO, toItemDTO } from '@/lib/dto'
import { InvoiceForm } from '@/app/dashboard/invoices/invoice-form'
import { Button } from '@/components/ui/button'

export const metadata = {
  title: 'New invoice · Billing & Invoicing',
}

export default async function NewInvoicePage() {
  await connectToDatabase()

  const [clientDocs, itemDocs] = await Promise.all([
    Client.find({}).sort({ name: 1 }).lean<IClient[]>(),
    Item.find({}).sort({ name: 1 }).lean<IItem[]>(),
  ])

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
          <Link href="/dashboard/invoices">
            <ArrowLeft />
            Back to invoices
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">New invoice</h1>
      </div>

      {clients.length === 0 ? (
        <div className="bg-card flex flex-col items-center gap-3 rounded-xl border p-12 text-center">
          <div className="bg-muted text-muted-foreground flex size-11 items-center justify-center rounded-full">
            <Users className="size-5" />
          </div>
          <div>
            <p className="font-medium">Add a client first</p>
            <p className="text-muted-foreground text-sm">
              An invoice has to be addressed to someone.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/dashboard/clients/new">Add a client</Link>
          </Button>
        </div>
      ) : (
        <InvoiceForm clients={clients} items={items} />
      )}
    </div>
  )
}
