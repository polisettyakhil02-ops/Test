import Link from 'next/link'
import { notFound } from 'next/navigation'
import { isValidObjectId } from 'mongoose'
import { ArrowLeft } from 'lucide-react'
import { ItemForm } from '@/app/dashboard/items/item-form'
import { Button } from '@/components/ui/button'
import { connectToDatabase } from '@/lib/mongodb'
import { Item, type IItem } from '@/models/Item'
import { toItemDTO } from '@/lib/dto'

export const metadata = {
  title: 'Edit item · Billing & Invoicing',
}

export default async function EditItemPage(
  props: PageProps<'/dashboard/items/[id]/edit'>,
) {
  const { id } = await props.params

  // A malformed id would make Mongoose throw a CastError; 404 instead.
  if (!isValidObjectId(id)) {
    notFound()
  }

  await connectToDatabase()
  const doc = await Item.findById(id).lean<IItem>()

  if (!doc) {
    notFound()
  }

  const item = toItemDTO(doc as Parameters<typeof toItemDTO>[0])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="text-muted-foreground w-fit -ml-2"
        >
          <Link href="/dashboard/items">
            <ArrowLeft />
            Back to items
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">{item.name}</h1>
      </div>

      <ItemForm item={item} />
    </div>
  )
}
