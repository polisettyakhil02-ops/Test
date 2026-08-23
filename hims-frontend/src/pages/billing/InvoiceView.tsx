import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { format } from "date-fns";
import { usePatientByUhid } from "@/hooks/usePatient";
import { useActiveInvoice } from "@/hooks/useActiveInvoice";
import { usePayInvoice } from "@/hooks/usePayInvoice";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { ErrorState, EmptyState } from "@/components/ui/EmptyState";
import { getApiErrorMessage } from "@/lib/axios";
import { InvoiceStatus, PaymentMode } from "@/types/common.types";
import type { BadgeTone } from "@/components/ui/Badge";

const STATUS_TONE: Record<InvoiceStatus, BadgeTone> = {
  DRAFT: "gray",
  FINALIZED: "blue",
  PARTIALLY_PAID: "yellow",
  PAID: "green",
  OVERDUE: "red",
  CANCELLED: "gray",
  REFUNDED: "purple",
};

const PAYMENT_MODE_OPTIONS = Object.values(PaymentMode).map((value) => ({ value, label: value.replace(/_/g, " ") }));
const NON_PAYABLE_STATUSES: InvoiceStatus[] = [InvoiceStatus.CANCELLED, InvoiceStatus.REFUNDED];

function currency(amount: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(amount);
}

function PatientLookupForm() {
  const [uhidInput, setUhidInput] = useState("");
  const navigate = useNavigate();

  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle>Open Patient Invoice</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (uhidInput.trim()) navigate(`/billing/${uhidInput.trim()}`);
          }}
        >
          <Input
            placeholder="Enter patient UHID"
            value={uhidInput}
            onChange={(event) => setUhidInput(event.target.value)}
            className="flex-1"
          />
          <Button type="submit">Open</Button>
        </form>
      </CardContent>
    </Card>
  );
}

function PaymentForm({ patientId, invoiceId, amountDue }: { patientId: string; invoiceId: string; amountDue: number }) {
  const payInvoice = usePayInvoice(patientId);
  const [mode, setMode] = useState<PaymentMode>(PaymentMode.CASH);
  const [amount, setAmount] = useState(amountDue.toString());
  const [referenceNumber, setReferenceNumber] = useState("");

  return (
    <div className="no-print space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <h3 className="text-sm font-semibold text-slate-800">Process Payment</h3>
      <div className="grid grid-cols-2 gap-3">
        <Select
          label="Payment Mode"
          options={PAYMENT_MODE_OPTIONS}
          value={mode}
          onChange={(event) => setMode(event.target.value as PaymentMode)}
        />
        <Input
          label="Amount"
          type="number"
          step="0.01"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
        {(mode === PaymentMode.CARD || mode === PaymentMode.UPI || mode === PaymentMode.NET_BANKING || mode === PaymentMode.CHEQUE) && (
          <Input
            label="Reference Number"
            value={referenceNumber}
            onChange={(event) => setReferenceNumber(event.target.value)}
            className="col-span-2"
          />
        )}
      </div>

      {payInvoice.isError && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{getApiErrorMessage(payInvoice.error)}</p>
      )}

      <Button
        onClick={() =>
          payInvoice.mutate({
            invoiceId,
            mode,
            amount: amount ? Number(amount) : undefined,
            referenceNumber: referenceNumber || undefined,
          })
        }
        isLoading={payInvoice.isPending}
        disabled={!amount || Number(amount) <= 0}
        className="w-full"
      >
        Process Payment ({currency(Number(amount) || 0)})
      </Button>
    </div>
  );
}

/** Print-friendly consolidated invoice for a patient's current DRAFT (unbilled) charges — bed rent, pharmacy, doctor fees, all itemized. Processing a payment invalidates nothing and instead writes straight into the query cache, so the status badge flips instantly. */
export function InvoiceView() {
  const { uhid } = useParams<{ uhid: string }>();
  const patientQuery = usePatientByUhid(uhid);
  const invoiceQuery = useActiveInvoice(patientQuery.data?._id);

  if (!uhid) {
    return <PatientLookupForm />;
  }

  if (patientQuery.isLoading) {
    return <FullPageSpinner />;
  }

  if (patientQuery.isError || !patientQuery.data) {
    return <ErrorState message={patientQuery.error ? getApiErrorMessage(patientQuery.error) : "Patient not found"} />;
  }

  const patient = patientQuery.data;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="no-print flex justify-end">
        <Button variant="outline" onClick={() => window.print()}>
          Print
        </Button>
      </div>

      {invoiceQuery.isLoading && <FullPageSpinner />}
      {invoiceQuery.isError && <ErrorState message={getApiErrorMessage(invoiceQuery.error)} />}

      {invoiceQuery.data === null && (
        <EmptyState title="No active invoice" description={`${patient.firstName} ${patient.lastName} has no unbilled (DRAFT) invoice right now.`} />
      )}

      {invoiceQuery.data && (
        <Card className="print:border-0 print:shadow-none">
          <CardContent className="space-y-6 p-6">
            <div className="flex items-start justify-between border-b border-slate-100 pb-4">
              <div>
                <h1 className="text-xl font-bold text-slate-900">Invoice {invoiceQuery.data.invoice.invoiceNumber}</h1>
                <p className="text-sm text-slate-500">{format(new Date(invoiceQuery.data.invoice.createdAt), "dd MMM yyyy")}</p>
              </div>
              <Badge tone={STATUS_TONE[invoiceQuery.data.invoice.status]}>{invoiceQuery.data.invoice.status}</Badge>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Patient</p>
                <p className="font-medium text-slate-900">
                  {patient.firstName} {patient.lastName}
                </p>
                <p className="text-slate-500">UHID {patient.uhid}</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Category breakdown</p>
                {Object.entries(invoiceQuery.data.summaryByCategory).map(([category, total]) => (
                  <p key={category} className="text-slate-700">
                    {category.replace(/_/g, " ")}: {currency(total)}
                  </p>
                ))}
              </div>
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="py-2">Description</th>
                  <th className="py-2">Category</th>
                  <th className="py-2 text-right">Qty</th>
                  <th className="py-2 text-right">Unit Price</th>
                  <th className="py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {invoiceQuery.data.invoice.lineItems.map((item) => (
                  <tr key={item._id ?? item.description} className="border-b border-slate-100">
                    <td className="py-2 text-slate-800">{item.description}</td>
                    <td className="py-2 text-slate-500">{item.serviceCategory.replace(/_/g, " ")}</td>
                    <td className="py-2 text-right text-slate-700">{item.quantity}</td>
                    <td className="py-2 text-right text-slate-700">{currency(item.unitPrice)}</td>
                    <td className="py-2 text-right font-medium text-slate-900">{currency(item.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="ml-auto max-w-xs space-y-1 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal</span>
                <span>{currency(invoiceQuery.data.invoice.subTotal)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Discount</span>
                <span>-{currency(invoiceQuery.data.invoice.totalDiscount)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Tax</span>
                <span>{currency(invoiceQuery.data.invoice.totalTax)}</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-1 text-base font-semibold text-slate-900">
                <span>Grand Total</span>
                <span>{currency(invoiceQuery.data.invoice.grandTotal)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Paid</span>
                <span>{currency(invoiceQuery.data.invoice.amountPaid)}</span>
              </div>
              <div className="flex justify-between font-semibold text-red-600">
                <span>Amount Due</span>
                <span>{currency(invoiceQuery.data.invoice.amountDue)}</span>
              </div>
            </div>

            {invoiceQuery.data.invoice.amountDue > 0 &&
              !NON_PAYABLE_STATUSES.includes(invoiceQuery.data.invoice.status) && (
                <PaymentForm
                  patientId={patient._id}
                  invoiceId={invoiceQuery.data.invoice._id}
                  amountDue={invoiceQuery.data.invoice.amountDue}
                />
              )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
