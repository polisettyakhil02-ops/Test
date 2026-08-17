import Link from 'next/link'
import { Download, FileSpreadsheet } from 'lucide-react'
import { requireSession } from '@/lib/session'
import { listReturnDocuments } from '@/lib/queries'
import { buildGstr1, B2CL_THRESHOLD_MINOR } from '@/domain/gst-returns'
import { endOfMonth, formatDate, formatMoney, startOfMonth, stateName, today } from '@/lib/dto'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export const metadata = { title: 'GSTR-1 · Billing' }
export const dynamic = 'force-dynamic'

export default async function Gstr1Page(props: PageProps<'/dashboard/reports/gstr1'>) {
  const session = await requireSession()
  const params = await props.searchParams

  const from = typeof params.from === 'string' && params.from ? params.from : startOfMonth(today())
  const to = typeof params.to === 'string' && params.to ? params.to : endOfMonth(from)

  const documents = await listReturnDocuments(session.entityId, { from, to })
  const report = buildGstr1(documents, { from, to })

  const csvHref = `/dashboard/reports/gstr1/csv?from=${from}&to=${to}`
  const empty = report.totals.documentCount === 0

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">GSTR-1</h1>
          <p className="text-muted-foreground text-sm">
            Outward supplies for {formatDate(from)} – {formatDate(to)}, split into the
            sections the return is filed in. Only posted documents appear; a voided one
            never happened.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          {/* A plain GET form: the period ends up in the URL, so a filed period
              can be bookmarked and re-opened exactly as it was reported. */}
          <form className="flex flex-wrap items-end gap-3" action="/dashboard/reports/gstr1">
            <div className="flex flex-col gap-2">
              <Label htmlFor="from">From</Label>
              <Input id="from" name="from" type="date" defaultValue={from} className="w-40" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="to">To</Label>
              <Input id="to" name="to" type="date" defaultValue={to} className="w-40" />
            </div>
            <Button type="submit" variant="outline">
              Show
            </Button>
          </form>

          <Button asChild disabled={empty}>
            <a href={csvHref}>
              <Download />
              CSV
            </a>
          </Button>
        </div>
      </div>

      <div className="grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-4">
        <Figure label="Documents" value={String(report.totals.documentCount)} />
        <Figure label="Taxable value" value={formatMoney(report.totals.taxableMinor)} />
        <Figure label="Tax" value={formatMoney(report.totals.taxMinor)} />
        <Figure
          label="Invoice value"
          value={formatMoney(report.totals.taxableMinor + report.totals.taxMinor)}
        />
      </div>

      {empty ? (
        <div className="bg-card flex flex-col items-center gap-3 rounded-xl border p-12 text-center">
          <div className="bg-muted text-muted-foreground flex size-11 items-center justify-center rounded-full">
            <FileSpreadsheet className="size-5" />
          </div>
          <div>
            <p className="font-medium">Nothing to file for this period</p>
            <p className="text-muted-foreground text-sm">
              No posted invoices or credit notes fall between these dates.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/dashboard/invoices">Open documents</Link>
          </Button>
        </div>
      ) : null}

      <Section
        title="B2B"
        subtitle="Registered buyers. Reported invoice by invoice."
        rows={report.b2b.length}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>GSTIN</TableHead>
              <TableHead>Receiver</TableHead>
              <TableHead>Invoice</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Place of supply</TableHead>
              <TableHead className="text-right">Rate</TableHead>
              <TableHead className="text-right">Taxable</TableHead>
              <TableHead className="text-right">Invoice value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.b2b.map((row, index) => (
              <TableRow key={`${row.invoiceNumber}-${row.ratePercent}-${index}`}>
                <TableCell className="font-mono text-xs">{row.gstin}</TableCell>
                <TableCell>{row.receiver}</TableCell>
                <TableCell className="font-medium">{row.invoiceNumber}</TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {formatDate(row.invoiceDate)}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {stateName(row.placeOfSupply)}
                </TableCell>
                <TableCell className="text-right tabular-nums">{row.ratePercent}%</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMoney(row.taxableMinor)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMoney(row.invoiceValueMinor)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      <Section
        title="B2CL"
        subtitle={`Unregistered buyers, inter-state, above ${formatMoney(B2CL_THRESHOLD_MINOR)}.`}
        rows={report.b2cl.length}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Place of supply</TableHead>
              <TableHead className="text-right">Rate</TableHead>
              <TableHead className="text-right">Taxable</TableHead>
              <TableHead className="text-right">Invoice value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.b2cl.map((row, index) => (
              <TableRow key={`${row.invoiceNumber}-${row.ratePercent}-${index}`}>
                <TableCell className="font-medium">{row.invoiceNumber}</TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {formatDate(row.invoiceDate)}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {stateName(row.placeOfSupply)}
                </TableCell>
                <TableCell className="text-right tabular-nums">{row.ratePercent}%</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMoney(row.taxableMinor)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMoney(row.invoiceValueMinor)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      <Section
        title="B2CS"
        subtitle="Everything else to unregistered buyers, summarised by place of supply and rate. Credit notes are netted off here rather than reported separately."
        rows={report.b2cs.length}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Place of supply</TableHead>
              <TableHead className="text-right">Rate</TableHead>
              <TableHead className="text-right">Taxable</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.b2cs.map((row) => (
              <TableRow key={`${row.placeOfSupply}-${row.ratePercent}`}>
                <TableCell>{row.type}</TableCell>
                <TableCell>{stateName(row.placeOfSupply)}</TableCell>
                <TableCell className="text-right tabular-nums">{row.ratePercent}%</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMoney(row.taxableMinor)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      <Section
        title="CDNR"
        subtitle="Credit notes issued to registered buyers, against the invoice each one corrects."
        rows={report.cdnr.length}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>GSTIN</TableHead>
              <TableHead>Note</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Against invoice</TableHead>
              <TableHead className="text-right">Rate</TableHead>
              <TableHead className="text-right">Taxable</TableHead>
              <TableHead className="text-right">Note value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.cdnr.map((row, index) => (
              <TableRow key={`${row.noteNumber}-${row.ratePercent}-${index}`}>
                <TableCell className="font-mono text-xs">{row.gstin}</TableCell>
                <TableCell className="font-medium">{row.noteNumber}</TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {formatDate(row.noteDate)}
                </TableCell>
                <TableCell>
                  {row.originalInvoiceNumber || '—'}
                  {row.originalInvoiceDate ? (
                    <span className="text-muted-foreground text-xs">
                      {' '}
                      · {formatDate(row.originalInvoiceDate)}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="text-right tabular-nums">{row.ratePercent}%</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMoney(row.taxableMinor)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMoney(row.noteValueMinor)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      <Section
        title="HSN summary"
        subtitle="Across every section, by HSN/SAC code."
        rows={report.hsn.length}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>HSN / SAC</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>UQC</TableHead>
              <TableHead className="text-right">Quantity</TableHead>
              <TableHead className="text-right">Taxable</TableHead>
              <TableHead className="text-right">Tax</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.hsn.map((row) => (
              <TableRow key={row.hsnSac}>
                <TableCell className="font-mono text-xs">{row.hsnSac}</TableCell>
                <TableCell>{row.description}</TableCell>
                <TableCell className="text-muted-foreground text-sm">{row.unit}</TableCell>
                <TableCell className="text-right tabular-nums">{row.quantity}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMoney(row.taxableMinor)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMoney(row.taxMinor)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>
    </div>
  )
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card p-4">
      <p className="text-muted-foreground text-xs font-medium uppercase">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  )
}

function Section({
  title,
  subtitle,
  rows,
  children,
}: {
  title: string
  subtitle: string
  rows: number
  children: React.ReactNode
}) {
  if (rows === 0) return null

  return (
    <div className="bg-card rounded-xl border">
      <div className="border-b px-5 py-4">
        <h2 className="font-semibold">{title}</h2>
        <p className="text-muted-foreground text-sm">{subtitle}</p>
      </div>
      {children}
    </div>
  )
}
