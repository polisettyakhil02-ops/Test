import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { ItemForm } from '@/app/dashboard/items/item-form'
import { Button } from '@/components/ui/button'

export const metadata = {
  title: 'New item · Billing & Invoicing',
}

export default function NewItemPage() {
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
        <h1 className="text-2xl font-semibold tracking-tight">New item</h1>
      </div>

      <ItemForm />
    </div>
  )
}
