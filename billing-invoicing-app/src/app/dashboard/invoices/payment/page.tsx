import Link from 'next/link'
import { ArrowLeft, Users } from 'lucide-react'
import { requireRole } from '@/lib/session'
import { listParties, openInvoicesFor } from '@/lib/queries'
import { PaymentForm } from '@/app/dashboard/invoices/payment/payment-form'
import { Button } from '@/components/ui/button'

export const metadata = { title: 'Record payment · Billing' }
export const dynamic = 'force-dynamic'

export default async function PaymentPage(props: PageProps<'/dashboard/invoices/payment'>) {
  const session = await requireRole('accountant')
  const params = await props.searchParams

  const parties = await listParties(session.entityId, '')
  const selected = typeof params.partyId === 'string' ? params.partyId : parties[0]?.id ?? ''
  const openInvoices = selected ? await openInvoicesFor(session.entityId, selected) : []

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground w-fit -ml-2">
          <Link href="/dashboard/invoices">
            <ArrowLeft />
            Back to documents
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Record payment</h1>
        <p className="text-muted-foreground text-sm">
          Posts Dr Bank / Cr Accounts Receivable and settles the invoices you apply it to.
        </p>
      </div>

      {parties.length === 0 ? (
        <div className="bg-card flex flex-col items-center gap-3 rounded-xl border p-12 text-center">
          <div className="bg-muted text-muted-foreground flex size-11 items-center justify-center rounded-full">
            <Users className="size-5" />
          </div>
          <p className="font-medium">Add a client first</p>
          <Button asChild variant="outline">
            <Link href="/dashboard/clients/new">Add a client</Link>
          </Button>
        </div>
      ) : (
        <PaymentForm parties={parties} openInvoices={openInvoices} selectedPartyId={selected} />
      )}
    </div>
  )
}
