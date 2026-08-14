import Link from 'next/link'
import { Package, Pencil, Plus } from 'lucide-react'
import { connectToDatabase } from '@/lib/mongodb'
import { Item, type IItem } from '@/models/Item'
import { toItemDTO, formatCurrency } from '@/lib/dto'
import { containsRegex, readQuery } from '@/lib/search'
import { deleteItem } from '@/app/dashboard/items/actions'
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
  title: 'Items · Billing & Invoicing',
}

export default async function ItemsPage(props: PageProps<'/dashboard/items'>) {
  const searchParams = await props.searchParams
  const query = readQuery(searchParams.q)

  await connectToDatabase()

  const filter = query
    ? {
        $or: [
          { name: containsRegex(query) },
          { hsnSac: containsRegex(query) },
          { description: containsRegex(query) },
        ],
      }
    : {}

  const docs = await Item.find(filter).sort({ name: 1 }).lean<IItem[]>()
  const items = docs.map((doc) => toItemDTO(doc as Parameters<typeof toItemDTO>[0]))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Items</h1>
          <p className="text-muted-foreground text-sm">
            {items.length} {items.length === 1 ? 'item' : 'items'}
            {query ? ` matching “${query}”` : ''}
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/items/new">
            <Plus />
            New item
          </Link>
        </Button>
      </div>

      <SearchInput placeholder="Search name, HSN/SAC or description" />

      <div className="bg-card rounded-xl border">
        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-12 text-center">
            <div className="bg-muted text-muted-foreground flex size-11 items-center justify-center rounded-full">
              <Package className="size-5" />
            </div>
            <div>
              <p className="font-medium">
                {query ? 'No matching items' : 'No items yet'}
              </p>
              <p className="text-muted-foreground text-sm">
                {query
                  ? 'Try a different search term.'
                  : 'Add the products or services you bill for.'}
              </p>
            </div>
            {query ? null : (
              <Button asChild variant="outline">
                <Link href="/dashboard/items/new">
                  <Plus />
                  New item
                </Link>
              </Button>
            )}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>HSN / SAC</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Tax</TableHead>
                <TableHead className="w-24 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{item.name}</span>
                      {item.description ? (
                        <span className="text-muted-foreground max-w-sm truncate text-xs">
                          {item.description}
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {item.hsnSac || '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {item.unit}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(item.price)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {item.taxRate}%
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        asChild
                        variant="ghost"
                        size="icon"
                        aria-label={`Edit ${item.name}`}
                      >
                        <Link href={`/dashboard/items/${item.id}/edit`}>
                          <Pencil className="size-4" />
                        </Link>
                      </Button>
                      <DeleteButton
                        action={deleteItem.bind(null, item.id)}
                        title={`Delete ${item.name}?`}
                        description="Invoices already issued keep their own copy of this item's details and are not affected."
                        label="Delete"
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
