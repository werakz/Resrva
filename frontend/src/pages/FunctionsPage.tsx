import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Save } from "lucide-react";
import { apiFetch, toJsonBody } from "../lib/api";
import type { Area, Booking, MetaPayload, Paginated } from "../types";
import { FieldLabel, FormMessage, inputClass, selectClass, textareaClass } from "../components/resrva/FormField";
import { LoadingState } from "../components/resrva/LoadingState";
import { PageHeader } from "../components/resrva/PageHeader";
import { StatusBadge } from "../components/resrva/StatusBadge";

const functionStatuses = ["pending", "approved", "confirmed", "declined", "cancelled"];

function functionAreaOptions(areas: Area[]) {
  return areas.map((area) => (
    <option key={area.id} value={area.id}>
      {area.name}
    </option>
  ));
}

export default function FunctionsPage() {
  const [meta, setMeta] = useState<MetaPayload | null>(null);
  const [data, setData] = useState<Paginated<Booking> | null>(null);
  const [filters, setFilters] = useState({ search: "", status: "" });
  const [page, setPage] = useState(1);
  const [edits, setEdits] = useState<Record<number, { status: string; assigned_area_id: string; manager_message: string }>>({});
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), per_page: "10" });
    if (filters.search) params.set("search", filters.search);
    if (filters.status) params.set("status", filters.status);
    return params.toString();
  }, [filters, page]);

  const loadFunctions = useCallback(async () => {
    const [metaPayload, functionPayload] = await Promise.all([
      apiFetch<MetaPayload>("meta"),
      apiFetch<Paginated<Booking>>(`functions?${query}`),
    ]);
    setMeta(metaPayload);
    setData(functionPayload);
  }, [query]);

  useEffect(() => {
    loadFunctions().catch((err) => {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Functions failed to load." });
    });
  }, [loadFunctions]);

  const editFor = (booking: Booking) => edits[booking.id] || {
    status: booking.status,
    assigned_area_id: booking.assigned_area_id ? String(booking.assigned_area_id) : "",
    manager_message: booking.manager_message || "",
  };

  const updateEdit = (booking: Booking, field: "status" | "assigned_area_id" | "manager_message", value: string) => {
    setEdits((current) => ({ ...current, [booking.id]: { ...editFor(booking), [field]: value } }));
  };

  const saveFunction = async (booking: Booking) => {
    const edit = editFor(booking);
    await apiFetch<{ item: Booking }>(`functions/${booking.id}`, {
      method: "PUT",
      ...toJsonBody({
        status: edit.status,
        assigned_area_id: edit.assigned_area_id || null,
        manager_message: edit.manager_message,
      }),
    });
    setMessage({ type: "success", text: `${booking.booking_reference} updated and message logged if provided.` });
    await loadFunctions();
  };

  if (!data || !meta) {
    return <LoadingState label="Loading functions" />;
  }

  return (
    <>
      <PageHeader
        title="Functions"
        description="Function requests need manager review before approval or confirmation."
      />

      <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-theme-sm">
        <div className="grid gap-3 md:grid-cols-[1fr_180px_auto]">
          <input
            className={inputClass}
            placeholder="Search function requests"
            value={filters.search}
            onChange={(event) => {
              setPage(1);
              setFilters((current) => ({ ...current, search: event.target.value }));
            }}
          />
          <select
            className={selectClass}
            value={filters.status}
            onChange={(event) => {
              setPage(1);
              setFilters((current) => ({ ...current, status: event.target.value }));
            }}
          >
            <option value="">All statuses</option>
            {functionStatuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <button type="button" onClick={loadFunctions} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <RefreshCw className="size-4" />
            Refresh
          </button>
        </div>

        {message ? <div className="mt-4"><FormMessage type={message.type}>{message.text}</FormMessage></div> : null}

        <div className="mt-4 grid gap-4">
          {data.items.map((booking) => {
            const edit = editFor(booking);

            return (
              <article key={booking.id} className="rounded-lg border border-gray-200 p-4">
                <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1.2fr_auto]">
                  <div>
                    <p className="font-semibold text-gray-900">{booking.booking_reference}</p>
                    <p className="mt-1 text-sm text-gray-500">{booking.customer_name}</p>
                    <p className="text-sm text-gray-500">{booking.customer_email}</p>
                    <div className="mt-3">
                      <StatusBadge status={booking.status} />
                    </div>
                  </div>

                  <div className="text-sm text-gray-600">
                    <p>
                      <span className="font-medium text-gray-800">When:</span> {booking.booking_date}{" "}
                      {booking.start_time.slice(0, 5)}-{booking.end_time.slice(0, 5)}
                    </p>
                    <p>
                      <span className="font-medium text-gray-800">Guests:</span> {booking.guest_count}
                    </p>
                    <p>
                      <span className="font-medium text-gray-800">Type:</span> {booking.event_type || "Function"}
                    </p>
                    <p>
                      <span className="font-medium text-gray-800">Preferred:</span>{" "}
                      {booking.preferred_area_name || "No preference"}
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                    <div>
                      <FieldLabel htmlFor={`function-status-${booking.id}`}>Status</FieldLabel>
                      <select id={`function-status-${booking.id}`} className={selectClass} value={edit.status} onChange={(event) => updateEdit(booking, "status", event.target.value)}>
                        {functionStatuses.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <FieldLabel htmlFor={`function-area-${booking.id}`}>Confirmed area</FieldLabel>
                      <select id={`function-area-${booking.id}`} className={selectClass} value={edit.assigned_area_id} onChange={(event) => updateEdit(booking, "assigned_area_id", event.target.value)}>
                        <option value="">Unassigned</option>
                        {functionAreaOptions(meta.function_areas)}
                      </select>
                    </div>
                    <div>
                      <FieldLabel htmlFor={`function-message-${booking.id}`}>Customer message</FieldLabel>
                      <textarea id={`function-message-${booking.id}`} className={textareaClass} value={edit.manager_message} onChange={(event) => updateEdit(booking, "manager_message", event.target.value)} />
                    </div>
                  </div>

                  <div className="flex items-start justify-end">
                    <button type="button" onClick={() => saveFunction(booking)} className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-600 px-3 text-sm font-medium text-white hover:bg-brand-700">
                      <Save className="size-4" />
                      Save
                    </button>
                  </div>
                </div>
                {booking.notes ? <p className="mt-3 rounded-lg bg-gray-50 p-3 text-sm text-gray-600">{booking.notes}</p> : null}
              </article>
            );
          })}
        </div>

        <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
          <span>
            Page {data.meta.page} of {Math.max(data.meta.total_pages, 1)}
          </span>
          <div className="flex gap-2">
            <button type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)} className="h-9 rounded-lg border border-gray-300 px-3 disabled:opacity-50">
              Previous
            </button>
            <button type="button" disabled={page >= data.meta.total_pages} onClick={() => setPage((current) => current + 1)} className="h-9 rounded-lg border border-gray-300 px-3 disabled:opacity-50">
              Next
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
