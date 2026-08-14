import Link from 'next/link'
import {
  AlertTriangle,
  ArrowRight,
  Clock,
  FileText,
  Package,
  Plus,
  Users,
  Wallet,
} from 'lucide-react'
import { getDashboardMetrics } from '@/lib/metrics'
import {
  formatCurrency,
  formatDate,
  INVOICE_STATUS_LABELS,
  INVOICE_STATUS_VARIANTS,
} from '@/lib/dto'
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
  title: 'Dashboard · Billing & Invoicing',
}

interface StatCardProps {
  label: string
  value: string
  hint: string
  icon: React.ComponentType<{ className?: string }>
  emphasis?: 'default' | 'warning'
}

function StatCard({ label, value, hint, icon: Icon, emphasis = 'default' }: StatCardProps) {
  return (
    <div className="bg-card flex flex-col gap-2 rounded-xl border p-5">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-sm font-medium">{label}</span>
        <Icon
          className={
            emphasis === 'warning'
              ? 'text-destructive size-4'
              : 'text-muted-foreground size-4'
          }
        />
      </div>
      <span className="text-2xl font-semibold tracking-tight tabular-nums">{value}</span>
      <span className="text-muted-foreground text-xs">{hint}</span>
    </div>
  )
}

export default async function DashboardPage() {
  const metrics = await getDashboardMetrics()

  const hasInvoices = metrics.invoiceCount > 0

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm">
            {hasInvoices
              ? `${metrics.invoiceCount} invoice${
                  metrics.invoiceCount === 1 ? '' : 's'
                } on record.`
              : 'No invoices yet.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link href="/dashboard/clients/new">
              <Plus />
              New client
            </Link>
          </Button>
          <Button asChild>
            <Link href="/dashboard/invoices">
              <FileText />
              Invoices
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total revenue"
          value={formatCurrency(metrics.totalPaid)}
          hint={`${formatCurrency(metrics.totalBilled)} billed in total`}
          icon={Wallet}
        />
        <StatCard
          label="Outstanding"
          value={formatCurrency(metrics.totalDue)}
          hint="Billed but not yet received"
          icon={Clock}
        />
        <StatCard
          label="Pending invoices"
          value={String(metrics.pendingCount)}
          hint={
            metrics.draftCount > 0
              ? `${metrics.draftCount} draft${metrics.draftCount === 1 ? '' : 's'} not sent`
              : 'Sent, part-paid or overdue'
          }
          icon={FileText}
        />
        <StatCard
          label="Overdue"
          value={String(metrics.overdueCount)}
          hint="Past the due date and unpaid"
          icon={AlertTriangle}
          emphasis={metrics.overdueCount > 0 ? 'warning' : 'default'}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/dashboard/clients"
          className="bg-card hover:border-foreground/20 flex items-center gap-4 rounded-xl border p-5 transition-colors"
        >
          <div className="bg-muted text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-lg">
            <Users className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-medium">
              {metrics.clientCount} {metrics.clientCount === 1 ? 'client' : 'clients'}
            </p>
            <p className="text-muted-foreground text-sm">Manage the party master</p>
          </div>
          <ArrowRight className="text-muted-foreground size-4 shrink-0" />
        </Link>

        <Link
          href="/dashboard/items"
          className="bg-card hover:border-foreground/20 flex items-center gap-4 rounded-xl border p-5 transition-colors"
        >
          <div className="bg-muted text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-lg">
            <Package className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-medium">
              {metrics.itemCount} {metrics.itemCount === 1 ? 'item' : 'items'}
            </p>
            <p className="text-muted-foreground text-sm">Products and services you bill</p>
          </div>
          <ArrowRight className="text-muted-foreground size-4 shrink-0" />
        </Link>
      </div>

      <div className="bg-card rounded-xl border">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="font-semibold">Recent invoices</h2>
          {metrics.recentInvoices.length > 0 ? (
            <Button asChild variant="ghost" size="sm">
              <Link href="/dashboard/invoices">
                View all
                <ArrowRight />
              </Link>
            </Button>
          ) : null}
        </div>

        {metrics.recentInvoices.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-12 text-center">
            <div className="bg-muted text-muted-foreground flex size-11 items-center justify-center rounded-full">
              <FileText className="size-5" />
            </div>
            <div>
              <p className="font-medium">No invoices yet</p>
              <p className="text-muted-foreground text-sm">
                Revenue and outstanding totals will populate once you raise your
                first invoice.
              </p>
            </div>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Due</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {metrics.recentInvoices.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell className="font-medium">{invoice.invoiceNumber}</TableCell>
                  <TableCell>{invoice.clientName}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDate(invoice.issueDate)}
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  )
}
