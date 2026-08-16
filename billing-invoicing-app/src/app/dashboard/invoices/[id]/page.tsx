import Link from 'next/link'
import { notFound } from 'next/navigation'
import { isValidObjectId } from 'mongoose'
import { ArrowLeft, Download, FileText, Pencil } from 'lucide-react'
import { connectToDatabase } from '@/lib/mongodb'
import { Invoice } from '@/models/Invoice'
import { taxBreakdown } from '@/lib/invoice-math'
import {
  formatCurrency,
  formatDate,
  toInvoiceDTO,
  INVOICE_STATUS_LABELS,
  INVOICE_STATUS_VARIANTS,
} from '@/lib/dto'
import { InvoiceStatusSelect } from '@/components/invoice-status-select'
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

export const metadata = {
  title: 'Invoice · Billing & Invoicing',
}

export default async function InvoiceDetailPage(
  props: PageProps<'/dashboard/invoices/[id]'>,
) {
  const { id } = await props.params

  if (!isValidObjectId(id)) {
    notFound()
  }

  await connectToDatabase()
  const doc = await Invoice.findById(id).lean()

  if (!doc) {
    notFound()
  }

  const invoice = toInvoiceDTO(doc as Parameters<typeof toInvoiceDTO>[0])
  const breakdown = taxBreakdown(invoice.lineItems)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="text-muted-foreground w-fit -ml-2"
        >
          <Link href="/dashboard/invoices">
            <ArrowLeft />
            Back to invoices
          </Link>
        </Button>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">
              {invoice.invoiceNumber}
            </h1>
            <Badge variant={INVOICE_STATUS_VARIANTS[invoice.status] ?? 'secondary'}>
              {INVOICE_STATUS_LABELS[invoice.status] ?? invoice.status}
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <InvoiceStatusSelect invoiceId={invoice.id} status={invoice.status} />
            <Button asChild variant="outline">
              <Link href={`/dashboard/invoices/${invoice.id}/edit`}>
                <Pencil />
                Edit
              </Link>
            </Button>
            {/* Opens in the browser's PDF viewer, which is also how you print. */}
            <Button asChild variant="outline">
              <a
                href={`/dashboard/invoices/${invoice.id}/pdf`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <FileText />
                View PDF
              </a>
            </Button>
            <Button asChild>
              <a href={`/dashboard/invoices/${invoice.id}/pdf?download=1`}>
                <Download />
                Download
              </a>
            </Button>
          </div>
        </div>
      </div>

      <div className="bg-card grid gap-6 rounded-xl border p-6 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs font-medium uppercase">
            Billed to
          </span>
          <span className="font-medium">{invoice.clientSnapshot.name || '—'}</span>
          {invoice.clientSnapshot.address ? (
            <span className="text-muted-foreground text-sm">
              {invoice.clientSnapshot.address}
            </span>
          ) : null}
          {invoice.clientSnapshot.gstin ? (
            <span className="text-muted-foreground font-mono text-xs">
              GSTIN {invoice.clientSnapshot.gstin}
            </span>
          ) : null}
          {invoice.clientSnapshot.email ? (
            <span className="text-muted-foreground text-sm">
              {invoice.clientSnapshot.email}
            </span>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 sm:items-end">
          <div className="flex gap-2 text-sm">
            <span className="text-muted-foreground">Issued</span>
            <span>{formatDate(invoice.issueDate)}</span>
          </div>
          <div className="flex gap-2 text-sm">
            <span className="text-muted-foreground">Due</span>
            <span>{invoice.dueDate ? formatDate(invoice.dueDate) : '—'}</span>
          </div>
          <div className="flex gap-2 text-sm">
            <span className="text-muted-foreground">Balance</span>
            <span className="font-medium tabular-nums">
              {formatCurrency(invoice.amountDue)}
            </span>
          </div>
        </div>
      </div>

      <div className="bg-card rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Description</TableHead>
              <TableHead>HSN / SAC</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Rate</TableHead>
              <TableHead className="text-right">Tax</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoice.lineItems.map((line) => (
              <TableRow key={line.id}>
                <TableCell className="font-medium">{line.description}</TableCell>
                <TableCell className="font-mono text-xs">{line.hsnSac || '—'}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {line.quantity} {line.unit}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(line.unitPrice)}
                </TableCell>
                <TableCell className="text-right tabular-nums">{line.taxRate}%</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(line.lineTotal)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div className="flex justify-end border-t p-6">
          <div className="flex w-full max-w-xs flex-col gap-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="tabular-nums">{formatCurrency(invoice.subtotal)}</span>
            </div>
            {invoice.discountAmount > 0 ? (
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Discount
                  {invoice.discountType === 'percentage'
                    ? ` (${invoice.discountValue}%)`
                    : ''}
                </span>
                <span className="tabular-nums">
                  −{formatCurrency(invoice.discountAmount)}
                </span>
              </div>
            ) : null}
            {breakdown
              .filter((row) => row.rate > 0)
              .map((row) => (
                <div key={row.rate} className="flex justify-between">
                  <span className="text-muted-foreground">Tax @ {row.rate}%</span>
                  <span className="tabular-nums">{formatCurrency(row.tax)}</span>
                </div>
              ))}
            <div className="mt-1 flex justify-between border-t pt-3 text-base font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{formatCurrency(invoice.total)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Paid</span>
              <span className="tabular-nums">{formatCurrency(invoice.amountPaid)}</span>
            </div>
            <div className="flex justify-between font-medium">
              <span>Balance due</span>
              <span className="tabular-nums">{formatCurrency(invoice.amountDue)}</span>
            </div>
          </div>
        </div>
      </div>

      {invoice.notes || invoice.terms ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {invoice.notes ? (
            <div className="bg-card rounded-xl border p-6">
              <p className="text-muted-foreground mb-2 text-xs font-medium uppercase">
                Notes
              </p>
              <p className="text-sm whitespace-pre-wrap">{invoice.notes}</p>
            </div>
          ) : null}
          {invoice.terms ? (
            <div className="bg-card rounded-xl border p-6">
              <p className="text-muted-foreground mb-2 text-xs font-medium uppercase">
                Terms
              </p>
              <p className="text-sm whitespace-pre-wrap">{invoice.terms}</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
