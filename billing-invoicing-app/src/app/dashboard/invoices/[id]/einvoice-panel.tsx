'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { AlertTriangle, Download, Loader2, ShieldCheck } from 'lucide-react'
import { recordIrn } from '@/app/dashboard/invoices/actions'
import { emptyFormState } from '@/lib/form-state'
import type { Blocker } from '@/domain/einvoice'
import { Field, TextareaField } from '@/components/field'
import { Button } from '@/components/ui/button'

/**
 * Registration is a hand-off, not an integration.
 *
 * Calling an IRP needs a GSP contract and credentials this business does not
 * have. Rather than ship a half-configured HTTP client that fails at the worst
 * moment, the panel gives you the exact payload to submit and takes back what
 * the portal returns. The moment credentials exist, the download becomes a POST
 * and nothing else here changes.
 */
export function EinvoicePanel({
  documentId,
  blockers,
  recorded,
  qrDataUrl,
}: {
  documentId: string
  blockers: Blocker[]
  recorded: { irn: string; ackNo: string; ackDate: string } | null
  qrDataUrl: string | null
}) {
  const [state, action] = useActionState(recordIrn.bind(null, documentId), emptyFormState)

  if (recorded) {
    return (
      <div className="bg-card rounded-xl border">
        <div className="flex items-center gap-2 border-b px-5 py-4">
          <ShieldCheck className="size-4 text-emerald-600" />
          <div>
            <h2 className="font-semibold">Registered</h2>
            <p className="text-muted-foreground text-sm">
              This invoice carries an IRN. The QR below is printed on the PDF.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-start gap-6 p-6">
          {/* A data: URI generated on this server -- there is nothing for the
              image optimiser to fetch, cache or bill for. */}
          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrDataUrl} alt="Signed e-invoice QR code" className="size-36" />
          ) : null}

          <dl className="grid gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground text-xs font-medium uppercase">IRN</dt>
              <dd className="font-mono text-xs break-all">{recorded.irn}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs font-medium uppercase">
                Acknowledgement
              </dt>
              <dd className="font-mono text-xs">
                {recorded.ackNo} · {recorded.ackDate}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-card rounded-xl border">
      <div className="border-b px-5 py-4">
        <h2 className="font-semibold">e-Invoicing</h2>
        <p className="text-muted-foreground text-sm">
          Download the IRP payload, register it, then record what comes back. The IRN is
          stamped once and cannot be changed afterwards.
        </p>
      </div>

      {blockers.length > 0 ? (
        <div className="flex items-start gap-3 p-6">
          <AlertTriangle className="text-muted-foreground mt-0.5 size-4 shrink-0" />
          <div>
            <p className="text-sm font-medium">Not registrable yet</p>
            <ul className="text-muted-foreground mt-2 flex list-disc flex-col gap-1 pl-4 text-sm">
              {blockers.map((blocker) => (
                <li key={blocker.field}>{blocker.message}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-6 p-6">
          <Button asChild variant="outline" className="w-fit">
            <a href={`/dashboard/invoices/${documentId}/einvoice`}>
              <Download />
              Download IRP payload
            </a>
          </Button>

          <form action={action} className="flex flex-col gap-4">
            {state.error ? (
              <p className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm">
                {state.error}
              </p>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                name="irn"
                label="IRN"
                error={state.fieldErrors.irn}
                hint="64 hexadecimal characters"
                required
              />
              <Field name="ackNo" label="Acknowledgement no." error={state.fieldErrors.ackNo} required />
              <Field
                name="ackDate"
                label="Acknowledgement date"
                error={state.fieldErrors.ackDate}
                placeholder="2026-08-17 10:32:00"
                required
              />
            </div>

            <TextareaField
              name="signedQrCode"
              label="Signed QR string"
              error={state.fieldErrors.signedQrCode}
              rows={4}
              placeholder="eyJhbGciOi..."
              required
            />

            <SubmitButton />
          </form>
        </div>
      )}
    </div>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" disabled={pending} className="w-fit">
      {pending ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
      Record IRN
    </Button>
  )
}
