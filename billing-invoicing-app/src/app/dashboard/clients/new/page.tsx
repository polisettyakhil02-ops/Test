import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { ClientForm } from '@/app/dashboard/clients/client-form'
import { Button } from '@/components/ui/button'

export const metadata = {
  title: 'New client · Billing & Invoicing',
}

export default function NewClientPage() {
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
        <h1 className="text-2xl font-semibold tracking-tight">New client</h1>
      </div>

      <ClientForm />
    </div>
  )
}
