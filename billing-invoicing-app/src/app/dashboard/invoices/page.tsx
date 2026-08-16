import Link from 'next/link'
import { FileText, Pencil, Plus, Wallet } from 'lucide-react'
import { requireSession } from '@/lib/session'
import { listDocuments } from '@/lib/queries'
import { deleteDraft } from '@/app/dashboard/invoices/actions'
import {
  DOC_TYPE_LABELS,
  formatDate,
  formatMoney,
  settlementOf,
  SETTLEMENT_LABELS,
  SETTLEMENT_VARIANTS,
  today,
} from '@/lib/dto'
import { DeleteButton } from '@/components/delete-button'
import { SearchInput } from '@/components/search-input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

export const metadata = { title: 'Documents · Billing' }
export const dynamic = 'force-dynamic'

const TABS = [
  { key: '', label: 'All' },
  { key: 'invoice', label: 'Invoices' },
  { key: 'credit_note', label: 'Credit notes' },
  { key: 'payment', label: 'Payments' },
] as const

export default async function InvoicesPage(props: PageProps<'/dashboard/invoices'>) {
  const session = await requireSession()
  const params = await props.searchParams
  const query = typeof params.q === 'string' ? params.q.trim() : ''
  const rawType = typeof params.docType === 'string' ? params.docType : ''
  const docType = (['invoice', 'credit_note', 'payment'] as const).find((t) => t === rawType)
  const asOf = today()

  const rows = await listDocuments(session.entityId, { docType, query })

  const href = (type: string) => {
    const p = new URLSearchParams()
    if (query) p.set('q', query)
    if (type) p.set('docType', type)
    const s = p.toString()
    return s ? `/dashboard/invoices?${s}` : '/dashboard/invoices'
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Documents</h1>
          <p className="text-muted-foreground text-sm">
            {rows.length} {rows.length === 1 ? 'document' : 'documents'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link href="/dashboard/invoices/payment">
              <Wallet />
              Record payment
            </Link>
          </Button>
          <Button asChild>
            <Link href="/dashboard/invoices/new">
              <Plus />
              New invoice
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SearchInput placeholder="Search number or client" />
        <div className="flex flex-wrap gap-1">
          {TABS.map((tab) => (
            <Link
              key={tab.key}
              href={href(tab.key)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                (docType ?? '') === tab.key
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              {tab.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="bg-card rounded-xl border">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-12 text-center">
            <div className="bg-muted text-muted-foreground flex size-11 items-center justify-center rounded-full">
              <FileText className="size-5" />
            </div>
            <div>
              <p className="font-medium">Nothing here yet</p>
              <p className="text-muted-foreground text-sm">
                Raise your first invoice to get started.
              </p>
            </div>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Issued</TableHead>
                <TableHead>State</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Open</TableHead>
                <TableHead className="w-24 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const state = settlementOf({ ...row, today: asOf })
                const isDraft = row.status === 'draft'
                return (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">
                      <Link href={`/dashboard/invoices/${row.id}`} className="hover:underline">
                        {row.docNumber ?? 'Draft'}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {DOC_TYPE_LABELS[row.docType]}
                    </TableCell>
                    <TableCell>{row.partyName}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDate(row.issueDate)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={SETTLEMENT_VARIANTS[state]}>
                        {SETTLEMENT_LABELS[state]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(row.totalMinor)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.docType === 'payment'
                        ? '—'
                        : formatMoney(row.totalMinor - row.allocatedMinor)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        {isDraft ? (
                          <>
                            <Button asChild variant="ghost" size="icon" aria-label="Edit draft">
                              <Link href={`/dashboard/invoices/${row.id}/edit`}>
                                <Pencil className="size-4" />
                              </Link>
                            </Button>
                            <DeleteButton
                              action={deleteDraft.bind(null, row.id)}
                              title="Delete this draft?"
                              description="Only drafts can be deleted. Posted documents are corrected with a credit note."
                            />
                          </>
                        ) : (
                          <span className="text-muted-foreground text-xs">Posted</span>
                        )}
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
