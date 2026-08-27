import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useExpenses, useLogExpense, useMarkExpensePaid } from "@/hooks/useFinance";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { ErrorState, EmptyState } from "@/components/ui/EmptyState";
import { getApiErrorMessage } from "@/lib/axios";
import { ExpenseCategory, ExpensePaymentStatus, PaymentMode } from "@/types/common.types";
import type { Expense } from "@/types/finance.types";

const STATUS_TONE: Record<ExpensePaymentStatus, BadgeTone> = { PENDING: "yellow", PAID: "green" };

/** Accounts Payable: log non-patient OPEX with a vendor invoice reference, then mark it paid once settled. */
export function AccountsPayable() {
  const [statusFilter, setStatusFilter] = useState<ExpensePaymentStatus | undefined>(undefined);
  const expensesQuery = useExpenses({ paymentStatus: statusFilter });
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [payTarget, setPayTarget] = useState<Expense | null>(null);

  const totalPending = (expensesQuery.data ?? [])
    .filter((e) => e.paymentStatus === ExpensePaymentStatus.PENDING)
    .reduce((sum, e) => sum + e.amount, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Accounts Payable</h1>
          <p className="text-sm text-slate-500">Non-patient hospital expenses — utilities, supplies, vendor payments.</p>
        </div>
        <Button onClick={() => setIsLogOpen(true)}>+ Log Expense</Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-slate-500">Pending Payment</p>
            <p className="text-xl font-semibold text-slate-900">₹{totalPending.toLocaleString("en-IN")}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-2">
        {(["ALL", ExpensePaymentStatus.PENDING, ExpensePaymentStatus.PAID] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s === "ALL" ? undefined : s)}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
              (s === "ALL" && !statusFilter) || statusFilter === s
                ? "border-brand-600 bg-brand-600 text-white"
                : "border-slate-300 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {s === "ALL" ? "All" : s}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Expenses</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {expensesQuery.isLoading && (
            <div className="p-6">
              <FullPageSpinner />
            </div>
          )}
          {expensesQuery.isError && (
            <div className="p-4">
              <ErrorState message={getApiErrorMessage(expensesQuery.error)} />
            </div>
          )}
          {expensesQuery.data && expensesQuery.data.length === 0 && (
            <div className="p-4">
              <EmptyState title="No expenses logged" description="Log an expense to start tracking OPEX." />
            </div>
          )}
          {expensesQuery.data && expensesQuery.data.length > 0 && (
            <div className="divide-y divide-slate-100">
              {expensesQuery.data.map((expense) => (
                <div key={expense._id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {expense.expenseNumber} · {expense.description}
                    </p>
                    <p className="text-xs text-slate-500">
                      {expense.category.replace(/_/g, " ")} · {expense.vendorName ?? "—"} ·{" "}
                      {new Date(expense.expenseDate).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-900">₹{expense.amount.toLocaleString("en-IN")}</span>
                    <Badge tone={STATUS_TONE[expense.paymentStatus]}>{expense.paymentStatus}</Badge>
                    {expense.paymentStatus === ExpensePaymentStatus.PENDING && (
                      <Button size="sm" variant="outline" onClick={() => setPayTarget(expense)}>
                        Mark Paid
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {isLogOpen && <LogExpenseModal onClose={() => setIsLogOpen(false)} />}
      {payTarget && <MarkPaidModal expense={payTarget} onClose={() => setPayTarget(null)} />}
    </div>
  );
}

const formSchema = z.object({
  category: z.nativeEnum(ExpenseCategory),
  description: z.string().min(1, "Required"),
  amount: z.coerce.number().positive("Required"),
  expenseDate: z.string().optional(),
  vendorName: z.string().optional(),
  invoiceDocumentKey: z.string().optional(),
});
type FormValues = z.infer<typeof formSchema>;

function LogExpenseModal({ onClose }: { onClose: () => void }) {
  const logMutation = useLogExpense();
  const [invoiceFileName, setInvoiceFileName] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: { category: ExpenseCategory.UTILITIES } });

  const onSubmit = handleSubmit((values) => {
    logMutation.mutate(values, { onSuccess: onClose });
  });

  return (
    <Modal isOpen onClose={onClose} title="Log Expense" widthClassName="max-w-lg">
      <form className="space-y-4" onSubmit={onSubmit}>
        <div className="grid grid-cols-2 gap-3">
          <Select label="Category" options={Object.values(ExpenseCategory).map((v) => ({ value: v, label: v.replace(/_/g, " ") }))} {...register("category")} />
          <Input label="Amount (₹)" type="number" step="0.01" error={errors.amount?.message} {...register("amount")} />
        </div>
        <Input label="Description" error={errors.description?.message} {...register("description")} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Vendor Name (optional)" {...register("vendorName")} />
          <Input label="Expense Date" type="date" {...register("expenseDate")} />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-700">Vendor Invoice (optional)</label>
          <input
            type="file"
            accept="application/pdf,image/*"
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-slate-200"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              // No object-storage backend exists yet — this stores a stable local reference key
              // (mirroring DischargeSummary.pdfStorageKey) rather than actually uploading bytes.
              setInvoiceFileName(file.name);
              setValue("invoiceDocumentKey", `local:${file.name}`);
            }}
          />
          {invoiceFileName && <p className="mt-1 text-xs text-emerald-700">Attached: {invoiceFileName}</p>}
        </div>

        {logMutation.isError && <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{getApiErrorMessage(logMutation.error)}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={logMutation.isPending}>
            Log Expense
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function MarkPaidModal({ expense, onClose }: { expense: Expense; onClose: () => void }) {
  const payMutation = useMarkExpensePaid(expense._id);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>(PaymentMode.NET_BANKING);
  const [referenceNumber, setReferenceNumber] = useState("");

  return (
    <Modal isOpen onClose={onClose} title={`Mark ${expense.expenseNumber} Paid`} widthClassName="max-w-sm">
      <div className="space-y-3">
        <Select
          label="Payment Mode"
          options={Object.values(PaymentMode).map((v) => ({ value: v, label: v.replace(/_/g, " ") }))}
          value={paymentMode}
          onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
        />
        <Input label="Reference Number (optional)" value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} />
        {payMutation.isError && <p className="text-xs text-red-600">{getApiErrorMessage(payMutation.error)}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            isLoading={payMutation.isPending}
            onClick={() =>
              payMutation.mutate({ paymentMode, paymentReferenceNumber: referenceNumber || undefined }, { onSuccess: onClose })
            }
          >
            Confirm Payment
          </Button>
        </div>
      </div>
    </Modal>
  );
}
