import { useState } from "react";
import { useDrugSearch } from "@/hooks/useDrugSearch";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import type { DrugSearchResult } from "@/types/emr.types";

/** Medication search/autocomplete for one prescription-builder row. Selecting a result reports the drug back to the parent form via `onSelect`; the parent owns `drugId`/`drugLabel` as the source of truth. */
export function DrugCombobox({
  label,
  onSelect,
}: {
  label: string | undefined;
  onSelect: (drug: DrugSearchResult) => void;
}) {
  const [query, setQuery] = useState(label ?? "");
  const [isOpen, setIsOpen] = useState(false);
  const debouncedQuery = useDebouncedValue(query, 300);
  const searchQuery = useDrugSearch(debouncedQuery);

  return (
    <div className="relative">
      <Input
        placeholder="Search medication…"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setTimeout(() => setIsOpen(false), 150)}
      />
      {isOpen && debouncedQuery.trim().length >= 2 && (
        <div className="absolute z-20 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg">
          {searchQuery.isFetching && (
            <div className="flex justify-center py-2">
              <Spinner className="h-4 w-4" />
            </div>
          )}
          {!searchQuery.isFetching && (searchQuery.data ?? []).length === 0 && (
            <p className="px-3 py-2 text-xs text-slate-400">No medications found</p>
          )}
          {(searchQuery.data ?? []).map((drug) => (
            <button
              type="button"
              key={drug._id}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setQuery(drug.brandName ? `${drug.genericName} (${drug.brandName})` : drug.genericName);
                setIsOpen(false);
                onSelect(drug);
              }}
            >
              <span className="font-medium">{drug.genericName}</span>
              {drug.brandName && <span className="text-slate-500"> · {drug.brandName}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
