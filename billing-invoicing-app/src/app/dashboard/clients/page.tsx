import Link from 'next/link'
import { Pencil, Plus, Users } from 'lucide-react'
import { connectToDatabase } from '@/lib/mongodb'
import { Client, type IClient } from '@/models/Client'
import { toClientDTO, formatAddress } from '@/lib/dto'
import { containsRegex, readQuery } from '@/lib/search'
import { deleteClient } from '@/app/dashboard/clients/actions'
import { DeleteButton } from '@/components/delete-button'
import { SearchInput } from '@/components/search-input'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export const metadata = {
  title: 'Clients · Billing & Invoicing',
}

export default async function ClientsPage(props: PageProps<'/dashboard/clients'>) {
  const searchParams = await props.searchParams
  const query = readQuery(searchParams.q)

  await connectToDatabase()

  const filter = query
    ? {
        $or: [
          { name: containsRegex(query) },
          { email: containsRegex(query) },
          { gstin: containsRegex(query) },
        ],
      }
    : {}

  const docs = await Client.find(filter).sort({ name: 1 }).lean<IClient[]>()
  const clients = docs.map((doc) => toClientDTO(doc as Parameters<typeof toClientDTO>[0]))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clients</h1>
          <p className="text-muted-foreground text-sm">
            {clients.length} {clients.length === 1 ? 'client' : 'clients'}
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
        {clients.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-12 text-center">
            <div className="bg-muted text-muted-foreground flex size-11 items-center justify-center rounded-full">
              <Users className="size-5" />
            </div>
            <div>
              <p className="font-medium">
                {query ? 'No matching clients' : 'No clients yet'}
              </p>
              <p className="text-muted-foreground text-sm">
                {query
                  ? 'Try a different search term.'
                  : 'Add your first client to start invoicing.'}
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
                <TableHead>Address</TableHead>
                <TableHead className="w-24 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.map((client) => {
                const address = formatAddress(client.billingAddress)

                return (
                  <TableRow key={client.id}>
                    <TableCell className="font-medium">{client.name}</TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span>{client.email || '—'}</span>
                        <span className="text-muted-foreground text-xs">
                          {client.phone || '—'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {client.gstin || '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-xs truncate text-sm">
                      {address || '—'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          asChild
                          variant="ghost"
                          size="icon"
                          aria-label={`Edit ${client.name}`}
                        >
                          <Link href={`/dashboard/clients/${client.id}/edit`}>
                            <Pencil className="size-4" />
                          </Link>
                        </Button>
                        <DeleteButton
                          action={deleteClient.bind(null, client.id)}
                          title={`Delete ${client.name}?`}
                          description="This cannot be undone. Clients with existing invoices cannot be deleted."
                          label="Delete"
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  )
}
