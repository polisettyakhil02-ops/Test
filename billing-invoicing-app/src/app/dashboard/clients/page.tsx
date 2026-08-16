import Link from 'next/link'
import { Pencil, Plus, Users } from 'lucide-react'
import { requireSession } from '@/lib/session'
import { listParties } from '@/lib/queries'
import { deleteParty } from '@/app/dashboard/clients/actions'
import { formatAddress, stateName } from '@/lib/dto'
import { DeleteButton } from '@/components/delete-button'
import { SearchInput } from '@/components/search-input'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export const metadata = { title: 'Clients · Billing' }
export const dynamic = 'force-dynamic'

export default async function ClientsPage(props: PageProps<'/dashboard/clients'>) {
  const session = await requireSession()
  const params = await props.searchParams
  const query = typeof params.q === 'string' ? params.q.trim() : ''
  const rows = await listParties(session.entityId, query)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clients</h1>
          <p className="text-muted-foreground text-sm">
            {rows.length} {rows.length === 1 ? 'client' : 'clients'}
            {query ? ` matching “${query}”` : ''}
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/clients/new">
            <Plus />
            New client
          </Link>
        </Button>
      </div>

      <SearchInput placeholder="Search name, email or GSTIN" />

      <div className="bg-card rounded-xl border">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-12 text-center">
            <div className="bg-muted text-muted-foreground flex size-11 items-center justify-center rounded-full">
              <Users className="size-5" />
            </div>
            <div>
              <p className="font-medium">{query ? 'No matching clients' : 'No clients yet'}</p>
              <p className="text-muted-foreground text-sm">
                {query ? 'Try a different search term.' : 'Add your first client to start invoicing.'}
              </p>
            </div>
            {query ? null : (
              <Button asChild variant="outline">
                <Link href="/dashboard/clients/new">
                  <Plus />
                  New client
                </Link>
              </Button>
            )}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>GSTIN</TableHead>
                <TableHead>Place of supply</TableHead>
                <TableHead className="w-24 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((party) => (
                <TableRow key={party.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{party.name}</span>
                      <span className="text-muted-foreground max-w-xs truncate text-xs">
                        {formatAddress(party.billingAddress) || '—'}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span>{party.email || '—'}</span>
                      <span className="text-muted-foreground text-xs">{party.phone || '—'}</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{party.gstin || '—'}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {party.stateCode ? stateName(party.stateCode) : '—'}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button asChild variant="ghost" size="icon" aria-label={`Edit ${party.name}`}>
                        <Link href={`/dashboard/clients/${party.id}/edit`}>
                          <Pencil className="size-4" />
                        </Link>
                      </Button>
                      <DeleteButton
                        action={deleteParty.bind(null, party.id)}
                        title={`Delete ${party.name}?`}
                        description="Clients with documents cannot be deleted."
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  )
}
