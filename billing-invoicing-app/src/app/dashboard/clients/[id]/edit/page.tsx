import Link from 'next/link'
import { notFound } from 'next/navigation'
import { isValidObjectId } from 'mongoose'
import { ArrowLeft } from 'lucide-react'
import { ClientForm } from '@/app/dashboard/clients/client-form'
import { Button } from '@/components/ui/button'
import { connectToDatabase } from '@/lib/mongodb'
import { Client, type IClient } from '@/models/Client'
import { toClientDTO } from '@/lib/dto'

export const metadata = {
  title: 'Edit client · Billing & Invoicing',
}

export default async function EditClientPage(
  props: PageProps<'/dashboard/clients/[id]/edit'>,
) {
  const { id } = await props.params

  // A malformed id would make Mongoose throw a CastError; 404 instead.
  if (!isValidObjectId(id)) {
    notFound()
  }

  await connectToDatabase()
  const doc = await Client.findById(id).lean<IClient>()

  if (!doc) {
    notFound()
  }

  const client = toClientDTO(doc as Parameters<typeof toClientDTO>[0])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="text-muted-foreground w-fit -ml-2"
        >
          <Link href="/dashboard/clients">
            <ArrowLeft />
            Back to clients
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">{client.name}</h1>
      </div>

      <ClientForm client={client} />
    </div>
  )
}
