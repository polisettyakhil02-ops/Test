import Link from 'next/link'
import { FileText, Pencil, Plus } from 'lucide-react'
import { connectToDatabase } from '@/lib/mongodb'
import { Invoice } from '@/models/Invoice'
import { INVOICE_STATUSES } from '@/lib/invoice-math'
import {
  formatCurrency,
  formatDate,
  toInvoiceDTO,
  INVOICE_STATUS_LABELS,
  INVOICE_STATUS_VARIANTS,
} from '@/lib/dto'
import { containsRegex, readQuery } from '@/lib/search'
import { deleteInvoice } from '@/app/dashboard/invoices/actions'
import { DeleteButton } from '@/components/delete-button'
import { SearchInput } from '@/components/search-input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

export const metadata = {
  title: 'Invoices · Billing & Invoicing',
}

export default async function InvoicesPage(props: PageProps<'/dashboard/invoices'>) {
  const searchParams = await props.searchParams
  const query = readQuery(searchParams.q)
  const rawStatus = readQuery(searchParams.status)
  const status = (INVOICE_STATUSES as readonly string[]).includes(rawStatus)
    ? rawStatus
    : ''

  await connectToDatabase()

  const filter: Record<string, unknown> = {}

  if (query) {
    filter.$or = [
      { invoiceNumber: containsRegex(query) },
      { 'clientSnapshot.name': containsRegex(query) },
    ]
  }

  if (status) {
    filter.status = status
  }

  const docs = await Invoice.find(filter)
    .sort({ createdAt: -1 })
    .limit(200)
    .lean()

  const invoices = docs.map((doc) => toInvoiceDTO(doc as Parameters<typeof toInvoiceDTO>[0]))

  const buildHref = (nextStatus: string) => {
    const params = new URLSearchParams()
    if (query) params.set('q', query)
    if (nextStatus) params.set('status', nextStatus)
    const search = params.toString()
    return search ? `/dashboard/invoices?${search}` : '/dashboard/invoices'
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Invoices</h1>
          <p className="text-muted-foreground text-sm">
            {invoices.length} {invoices.length === 1 ? 'invoice' : 'invoices'}
            {status ? ` · ${INVOICE_STATUS_LABELS[status]}` : ''}
            {query ? ` matching “${query}”` : ''}
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/invoices/new">
            <Plus />
            New invoice
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SearchInput placeholder="Search number or client" />
        <div className="flex flex-wrap gap-1">
          <Link
            href={buildHref('')}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              status === ''
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            All
          </Link>
          {INVOICE_STATUSES.map((value) => (
            <Link
              key={value}
              href={buildHref(value)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                status === value
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              {INVOICE_STATUS_LABELS[value]}
            </Link>
          ))}
        </div>
      </div>

      <div className="bg-card rounded-xl border">
        {invoices.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-12 text-center">
            <div className="bg-muted text-muted-foreground flex size-11 items-center justify-center rounded-full">
              <FileText className="size-5" />
            </div>
            <div>
              <p className="font-medium">
                {query || status ? 'No matching invoices' : 'No invoices yet'}
              </p>
              <p className="text-muted-foreground text-sm">
                {query || status
                  ? 'Try a different search or filter.'
                  : 'Raise your first invoice to get started.'}
              </p>
            </div>
            {query || status ? null : (
              <Button asChild variant="outline">
                <Link href="/dashboard/invoices/new">
                  <Plus />
                  New invoice
                </Link>
              </Button>
            )}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Issued</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead className="w-24 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/dashboard/invoices/${invoice.id}`}
                      className="hover:underline"
                    >
                      {invoice.invoiceNumber}
                    </Link>
                  </TableCell>
                  <TableCell>{invoice.clientSnapshot.name || '—'}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDate(invoice.issueDate)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {invoice.dueDate ? formatDate(invoice.dueDate) : '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={INVOICE_STATUS_VARIANTS[invoice.status] ?? 'secondary'}>
                      {INVOICE_STATUS_LABELS[invoice.status] ?? invoice.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(invoice.total)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(invoice.amountDue)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        asChild
                        variant="ghost"
                        size="icon"
                        aria-label={`Edit ${invoice.invoiceNumber}`}
                      >
                        <Link href={`/dashboard/invoices/${invoice.id}/edit`}>
                          <Pencil className="size-4" />
                        </Link>
                      </Button>
                      <DeleteButton
                        action={deleteInvoice.bind(null, invoice.id)}
                        title={`Delete ${invoice.invoiceNumber}?`}
                        description="This cannot be undone. The invoice number will not be reused."
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
