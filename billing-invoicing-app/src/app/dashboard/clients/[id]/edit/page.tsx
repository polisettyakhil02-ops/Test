import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { ClientForm } from '@/app/dashboard/clients/client-form'
import { Button } from '@/components/ui/button'
import { requireRole } from '@/lib/session'
import { getParty } from '@/lib/queries'

export const metadata = { title: 'Edit client · Billing' }

export default async function EditClientPage(props: PageProps<'/dashboard/clients/[id]/edit'>) {
  const session = await requireRole('accountant')
  const { id } = await props.params

  const party = await getParty(session.entityId, id)
  if (!party) notFound()

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground w-fit -ml-2">
          <Link href="/dashboard/clients">
            <ArrowLeft />
            Back to clients
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">{party.name}</h1>
      </div>
      <ClientForm party={party} />
    </div>
  )
}
