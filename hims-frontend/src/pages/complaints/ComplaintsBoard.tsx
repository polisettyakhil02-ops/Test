import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTickets, useCreateTicket, useAssignTicket, useStartTicketProgress, useResolveTicket, useCloseTicket } from "@/hooks/useComplaints";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { ErrorState } from "@/components/ui/EmptyState";
import { getApiErrorMessage } from "@/lib/axios";
import { TicketCategory, TicketPriority, TicketStatus } from "@/types/common.types";
import type { Ticket } from "@/types/complaints.types";

const COLUMNS: { status: TicketStatus; label: string }[] = [
  { status: TicketStatus.OPEN, label: "Open" },
  { status: TicketStatus.ASSIGNED, label: "Assigned" },
  { status: TicketStatus.IN_PROGRESS, label: "In Progress" },
  { status: TicketStatus.RESOLVED, label: "Resolved" },
  { status: TicketStatus.CLOSED, label: "Closed" },
];

const PRIORITY_TONE: Record<TicketPriority, BadgeTone> = { LOW: "gray", MEDIUM: "blue", HIGH: "yellow", CRITICAL: "red" };
const CATEGORY_TONE: Record<TicketCategory, BadgeTone> = {
  FACILITY_MAINTENANCE: "purple",
  PATIENT_GRIEVANCE: "red",
  HOUSEKEEPING: "blue",
  IT_SUPPORT: "gray",
  OTHER: "gray",
};

function patientLabel(ticket: Ticket): string | null {
  if (!ticket.patientId) return null;
  return typeof ticket.patientId === "string" ? ticket.patientId : `${ticket.patientId.firstName} ${ticket.patientId.lastName}`;
}

/** The Facility Manager's Kanban board — one column per TicketStatus, cards move via explicit action buttons rather than drag-and-drop so each transition can be validated server-side. */
export function ComplaintsBoard() {
  const ticketsQuery = useTickets();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState<Ticket | null>(null);

  const byStatus = new Map<TicketStatus, Ticket[]>(COLUMNS.map((c) => [c.status, []]));
  for (const ticket of ticketsQuery.data ?? []) {
    byStatus.get(ticket.status)?.push(ticket);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Complaint & Maintenance Board</h1>
          <p className="text-sm text-slate-500">Facility maintenance and patient grievance tickets, tracked from open to resolved.</p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)}>+ New Ticket</Button>
      </div>

      {ticketsQuery.isLoading && <FullPageSpinner />}
      {ticketsQuery.isError && <ErrorState message={getApiErrorMessage(ticketsQuery.error)} />}

      {ticketsQuery.data && (
        <div className="grid grid-cols-1 gap-3 overflow-x-auto sm:grid-cols-2 lg:grid-cols-5">
          {COLUMNS.map((column) => (
            <div key={column.status} className="min-w-[220px] rounded-lg bg-slate-50 p-2">
              <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {column.label} ({byStatus.get(column.status)?.length ?? 0})
              </p>
              <div className="space-y-2">
                {byStatus.get(column.status)?.map((ticket) => (
                  <button
                    key={ticket._id}
                    type="button"
                    onClick={() => setDetailTarget(ticket)}
                    className="block w-full rounded-md border border-slate-200 bg-white p-2 text-left shadow-sm hover:border-brand-300"
                  >
                    <p className="text-xs font-medium text-slate-900">{ticket.title}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">{ticket.ticketNumber}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      <Badge tone={CATEGORY_TONE[ticket.category]}>{ticket.category.replace(/_/g, " ")}</Badge>
                      <Badge tone={PRIORITY_TONE[ticket.priority]}>{ticket.priority}</Badge>
                    </div>
                    {ticket.assignedToUserId && <p className="mt-1 text-[11px] text-slate-500">→ {ticket.assignedToUserId}</p>}
                    {ticket.resolutionMinutes !== undefined && (
                      <p className="mt-1 text-[11px] text-emerald-700">Resolved in {ticket.resolutionMinutes}m</p>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {isCreateOpen && <CreateTicketModal onClose={() => setIsCreateOpen(false)} />}
      {detailTarget && <TicketDetailModal ticket={detailTarget} onClose={() => setDetailTarget(null)} />}
    </div>
  );
}

const formSchema = z.object({
  category: z.nativeEnum(TicketCategory),
  priority: z.nativeEnum(TicketPriority),
  title: z.string().min(1, "Required"),
  description: z.string().min(1, "Required"),
  locationDescription: z.string().optional(),
  patientId: z.string().optional(),
  raisedByName: z.string().min(1, "Required"),
});
type FormValues = z.infer<typeof formSchema>;

function CreateTicketModal({ onClose }: { onClose: () => void }) {
  const createMutation = useCreateTicket();
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { category: TicketCategory.FACILITY_MAINTENANCE, priority: TicketPriority.MEDIUM },
  });
  const category = watch("category");

  const onSubmit = handleSubmit((values) => {
    createMutation.mutate(values, { onSuccess: onClose });
  });

  return (
    <Modal isOpen onClose={onClose} title="New Ticket" widthClassName="max-w-lg">
      <form className="space-y-4" onSubmit={onSubmit}>
        <div className="grid grid-cols-2 gap-3">
          <Select label="Category" options={Object.values(TicketCategory).map((v) => ({ value: v, label: v.replace(/_/g, " ") }))} {...register("category")} />
          <Select label="Priority" options={Object.values(TicketPriority).map((v) => ({ value: v, label: v }))} {...register("priority")} />
        </div>
        <Input label="Title" error={errors.title?.message} {...register("title")} />
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-700">Description</label>
          <textarea
            rows={3}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            {...register("description")}
          />
          {errors.description && <p className="mt-1 text-xs text-red-600">{errors.description.message}</p>}
        </div>
        {category === TicketCategory.FACILITY_MAINTENANCE && (
          <Input label="Location" placeholder="e.g. ICU Bed 4" {...register("locationDescription")} />
        )}
        {category === TicketCategory.PATIENT_GRIEVANCE && <Input label="Patient ID" placeholder="Patient ObjectId" {...register("patientId")} />}
        <Input label="Raised By (name)" error={errors.raisedByName?.message} {...register("raisedByName")} />

        {createMutation.isError && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{getApiErrorMessage(createMutation.error)}</p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={createMutation.isPending}>
            Raise Ticket
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function TicketDetailModal({ ticket, onClose }: { ticket: Ticket; onClose: () => void }) {
  const assignMutation = useAssignTicket(ticket._id);
  const startMutation = useStartTicketProgress(ticket._id);
  const resolveMutation = useResolveTicket(ticket._id);
  const closeMutation = useCloseTicket(ticket._id);
  const [assignee, setAssignee] = useState("");
  const [resolutionNotes, setResolutionNotes] = useState("");
  const patient = patientLabel(ticket);

  return (
    <Modal isOpen onClose={onClose} title={ticket.title} widthClassName="max-w-lg">
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1">
          <Badge tone={CATEGORY_TONE[ticket.category]}>{ticket.category.replace(/_/g, " ")}</Badge>
          <Badge tone={PRIORITY_TONE[ticket.priority]}>{ticket.priority}</Badge>
        </div>
        <p className="text-sm text-slate-700">{ticket.description}</p>
        {ticket.locationDescription && <p className="text-xs text-slate-500">Location: {ticket.locationDescription}</p>}
        {patient && <p className="text-xs text-slate-500">Patient: {patient}</p>}
        <p className="text-xs text-slate-500">Raised by {ticket.raisedByName}</p>

        {(ticket.status === TicketStatus.OPEN || ticket.status === TicketStatus.ASSIGNED) && (
          <div className="flex gap-2 border-t border-slate-100 pt-3">
            <Input placeholder="Maintenance Staff User ID" value={assignee} onChange={(e) => setAssignee(e.target.value)} className="flex-1" />
            <Button
              type="button"
              size="sm"
              disabled={!assignee.trim()}
              isLoading={assignMutation.isPending}
              onClick={() => assignMutation.mutate({ assignedToUserId: assignee.trim() })}
            >
              {ticket.status === TicketStatus.OPEN ? "Assign" : "Reassign"}
            </Button>
          </div>
        )}
        {ticket.status === TicketStatus.ASSIGNED && (
          <Button type="button" size="sm" isLoading={startMutation.isPending} onClick={() => startMutation.mutate()}>
            Start Progress
          </Button>
        )}
        {ticket.status === TicketStatus.IN_PROGRESS && (
          <div className="space-y-2 border-t border-slate-100 pt-3">
            <Input placeholder="Resolution notes" value={resolutionNotes} onChange={(e) => setResolutionNotes(e.target.value)} />
            <Button
              type="button"
              size="sm"
              disabled={!resolutionNotes.trim()}
              isLoading={resolveMutation.isPending}
              onClick={() => resolveMutation.mutate({ resolutionNotes: resolutionNotes.trim() })}
            >
              Mark Resolved
            </Button>
          </div>
        )}
        {ticket.status === TicketStatus.RESOLVED && (
          <div className="space-y-1 border-t border-slate-100 pt-3">
            <p className="text-xs text-emerald-700">{ticket.resolutionNotes}</p>
            {ticket.resolutionMinutes !== undefined && <p className="text-xs text-slate-500">Resolved in {ticket.resolutionMinutes} minutes</p>}
            <Button type="button" size="sm" variant="outline" isLoading={closeMutation.isPending} onClick={() => closeMutation.mutate()}>
              Close Ticket
            </Button>
          </div>
        )}
        {(assignMutation.isError || startMutation.isError || resolveMutation.isError || closeMutation.isError) && (
          <p className="text-xs text-red-600">
            {getApiErrorMessage(assignMutation.error ?? startMutation.error ?? resolveMutation.error ?? closeMutation.error)}
          </p>
        )}
      </div>
    </Modal>
  );
}
