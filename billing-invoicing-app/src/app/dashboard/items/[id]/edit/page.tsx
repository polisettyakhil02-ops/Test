import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { ItemForm } from '@/app/dashboard/items/item-form'
import { Button } from '@/components/ui/button'
import { requireRole } from '@/lib/session'
import { getItem } from '@/lib/queries'

export const metadata = { title: 'Edit item · Billing' }

export default async function EditItemPage(props: PageProps<'/dashboard/items/[id]/edit'>) {
  const session = await requireRole('accountant')
  const { id } = await props.params

  const item = await getItem(session.entityId, id).catch(() => null)
  if (!item) notFound()

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground w-fit -ml-2">
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
