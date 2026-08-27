import { Fragment, type ReactNode } from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type OnChangeFn,
  type PaginationState,
  type SortingState,
} from "@tanstack/react-table";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

export interface DataTableProps<T> {
  columns: ColumnDef<T, any>[];
  data: T[];
  pageCount: number;
  pagination: PaginationState;
  onPaginationChange: OnChangeFn<PaginationState>;
  sorting: SortingState;
  onSortingChange: OnChangeFn<SortingState>;
  isLoading?: boolean;
  isFetching?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  getRowId: (row: T) => string;
  /** When provided alongside `expandedRowId`, renders an accordion row directly under the row whose id matches — used by AuditInspector for the JSON payload detail. */
  renderExpandedRow?: (row: T) => ReactNode;
  expandedRowId?: string | null;
  onRowClick?: (row: T) => void;
}

/**
 * Generic, headless-table-powered data grid shared by every admin
 * directory page. Sorting and pagination are "manual" (server-driven) —
 * this component only renders the state TanStack Table tracks and fires
 * the change callbacks; the parent page owns fetching the matching page
 * of data via its own TanStack Query hook. That's a deliberate choice
 * for directories that can hold thousands of rows: true fuzzy client-side
 * filtering over an unpaginated dataset doesn't scale, so search/filter
 * also happen server-side (see each page's search/filter controls) while
 * this component focuses purely on rendering + sort/page interaction.
 */
export function DataTable<T>({
  columns,
  data,
  pageCount,
  pagination,
  onPaginationChange,
  sorting,
  onSortingChange,
  isLoading = false,
  isFetching = false,
  emptyTitle = "No records found",
  emptyDescription,
  getRowId,
  renderExpandedRow,
  expandedRowId,
  onRowClick,
}: DataTableProps<T>) {
  const table = useReactTable({
    data,
    columns,
    pageCount,
    state: { pagination, sorting },
    onPaginationChange,
    onSortingChange,
    manualPagination: true,
    manualSorting: true,
    getCoreRowModel: getCoreRowModel(),
  });

  const columnCount = table.getVisibleFlatColumns().length;

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full min-w-max text-sm">
          <thead className="border-b border-slate-200 bg-slate-50">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sortState = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      className={cn(
                        "px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500",
                        canSort && "cursor-pointer select-none hover:text-slate-700",
                      )}
                      onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                    >
                      <span className="inline-flex items-center gap-1">
                        {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                        {canSort && (
                          <span className="text-slate-400">{sortState === "asc" ? "▲" : sortState === "desc" ? "▼" : ""}</span>
                        )}
                      </span>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && (
              <tr>
                <td colSpan={columnCount} className="px-3 py-10 text-center">
                  <Spinner className="mx-auto" />
                </td>
              </tr>
            )}

            {!isLoading && data.length === 0 && (
              <tr>
                <td colSpan={columnCount} className="px-3 py-10">
                  <EmptyState title={emptyTitle} description={emptyDescription} />
                </td>
              </tr>
            )}

            {!isLoading &&
              table.getRowModel().rows.map((row) => {
                const rowId = getRowId(row.original);
                const isExpanded = expandedRowId === rowId;
                return (
                  <Fragment key={row.id}>
                    <tr
                      onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                      className={cn("hover:bg-slate-50", onRowClick && "cursor-pointer")}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="px-3 py-2.5 text-slate-700">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                    {renderExpandedRow && isExpanded && (
                      <tr className="bg-slate-50">
                        <td colSpan={columnCount} className="px-3 py-3">
                          {renderExpandedRow(row.original)}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-slate-500">
        <span>
          Page {pagination.pageIndex + 1} of {Math.max(pageCount, 1)}
          {isFetching && <Spinner className="ml-2 inline-block h-3.5 w-3.5 align-middle" />}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={pagination.pageIndex === 0}
            onClick={() => table.previousPage()}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={pagination.pageIndex + 1 >= pageCount}
            onClick={() => table.nextPage()}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
