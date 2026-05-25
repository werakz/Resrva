import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Save } from "lucide-react";
import { apiFetch, toJsonBody } from "../lib/api";
import type { Area, Booking, MetaPayload, Paginated } from "../types";
import { FieldLabel, FormMessage, inputClass, selectClass, textareaClass } from "../components/resrva/FormField";
import { LoadingState } from "../components/resrva/LoadingState";
import { PageHeader } from "../components/resrva/PageHeader";
import { StatusBadge } from "../components/resrva/StatusBadge";

type ManualBookingForm = {
  name: string;
  email: string;
  phone: string;
  date: string;
  time: string;
  guest_count: string;
  preferred_area_id: string;
  notes: string;
};

const emptyManualBooking: ManualBookingForm = {
  name: "",
  email: "",
  phone: "",
  date: "",
  time: "",
  guest_count: "",
  preferred_area_id: "",
  notes: "",
};

const tableStatuses = ["confirmed", "seated", "completed", "cancelled", "no_show"];

function areaSelectOptions(areas: Area[]) {
  return areas.map((area) => (
    <option key={area.id} value={area.id}>
      {area.name}
    </option>
  ));
}

export default function BookingsPage() {
  const [meta, setMeta] = useState<MetaPayload | null>(null);
  const [data, setData] = useState<Paginated<Booking> | null>(null);
  const [filters, setFilters] = useState({ search: "", status: "", date: "" });
  const [page, setPage] = useState(1);
  const [form, setForm] = useState<ManualBookingForm>(emptyManualBooking);
  const [statusEdits, setStatusEdits] = useState<Record<number, string>>({});
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), per_page: "10" });
    if (filters.search) params.set("search", filters.search);
    if (filters.status) params.set("status", filters.status);
    if (filters.date) params.set("date", filters.date);
    return params.toString();
  }, [filters, page]);

  const loadBookings = useCallback(async () => {
    const [metaPayload, bookingPayload] = await Promise.all([
      apiFetch<MetaPayload>("meta"),
      apiFetch<Paginated<Booking>>(`bookings?${query}`),
    ]);
    setMeta(metaPayload);
    setData(bookingPayload);
  }, [query]);

  useEffect(() => {
    loadBookings().catch((err) => {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Bookings failed to load." });
    });
  }, [loadBookings]);

  const updateForm = (field: keyof ManualBookingForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const createBooking = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);

    try {
      const response = await apiFetch<{ booking_reference: string; assigned_area: string }>("bookings", {
        method: "POST",
        ...toJsonBody({
          ...form,
          guest_count: Number(form.guest_count),
          preferred_area_id: form.preferred_area_id || null,
        }),
      });
      setMessage({
        type: "success",
        text: `Booking ${response.booking_reference} created and assigned to ${response.assigned_area}.`,
      });
      setForm(emptyManualBooking);
      await loadBookings();
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Booking could not be created." });
    }
  };

  const saveStatus = async (booking: Booking) => {
    const status = statusEdits[booking.id] || booking.status;
    await apiFetch<{ item: Booking }>(`bookings/${booking.id}`, {
      method: "PUT",
      ...toJsonBody({ status }),
    });
    setMessage({ type: "success", text: `${booking.booking_reference} updated.` });
    await loadBookings();
  };

  if (!data || !meta) {
    return <LoadingState label="Loading bookings" />;
  }

  return (
    <>
      <PageHeader
        title="Bookings"
        description="Confirmed table bookings with search, filters, pagination, and manager status updates."
      />

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.4fr]">
        <form onSubmit={createBooking} className="rounded-lg border border-gray-200 bg-white p-5 shadow-theme-sm">
          <h2 className="text-lg font-semibold text-gray-900">Create booking</h2>
          <p className="mt-1 text-sm text-gray-500">
            Manual manager bookings use the same AI assignment rules as public bookings.
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
            <div>
              <FieldLabel htmlFor="manual-name">Name</FieldLabel>
              <input id="manual-name" className={inputClass} required value={form.name} onChange={(event) => updateForm("name", event.target.value)} />
            </div>
            <div>
              <FieldLabel htmlFor="manual-email">Email</FieldLabel>
              <input id="manual-email" type="email" className={inputClass} required value={form.email} onChange={(event) => updateForm("email", event.target.value)} />
            </div>
            <div>
              <FieldLabel htmlFor="manual-phone">Phone</FieldLabel>
              <input id="manual-phone" className={inputClass} required value={form.phone} onChange={(event) => updateForm("phone", event.target.value)} />
            </div>
            <div>
              <FieldLabel htmlFor="manual-guests">Guests</FieldLabel>
              <input id="manual-guests" type="number" min="8" max="29" className={inputClass} required value={form.guest_count} onChange={(event) => updateForm("guest_count", event.target.value)} />
            </div>
            <div>
              <FieldLabel htmlFor="manual-date">Date</FieldLabel>
              <input id="manual-date" type="date" className={inputClass} required value={form.date} onChange={(event) => updateForm("date", event.target.value)} />
            </div>
            <div>
              <FieldLabel htmlFor="manual-time">Time</FieldLabel>
              <input id="manual-time" type="time" step="1800" className={inputClass} required value={form.time} onChange={(event) => updateForm("time", event.target.value)} />
            </div>
            <div className="sm:col-span-2 xl:col-span-1">
              <FieldLabel htmlFor="manual-area">Preferred area</FieldLabel>
              <select id="manual-area" className={selectClass} value={form.preferred_area_id} onChange={(event) => updateForm("preferred_area_id", event.target.value)}>
                <option value="">No preference</option>
                {areaSelectOptions(meta.areas)}
              </select>
            </div>
            <div className="sm:col-span-2 xl:col-span-1">
              <FieldLabel htmlFor="manual-notes">Notes</FieldLabel>
              <textarea id="manual-notes" className={textareaClass} value={form.notes} onChange={(event) => updateForm("notes", event.target.value)} />
            </div>
          </div>

          <button type="submit" className="mt-4 inline-flex h-11 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700">
            <Plus className="size-4" />
            Create booking
          </button>
        </form>

        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-theme-sm">
          <div className="grid gap-3 md:grid-cols-[1fr_160px_160px_auto]">
            <input
              className={inputClass}
              placeholder="Search name, email, phone, ref"
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
              {tableStatuses.map((status) => (
                <option key={status} value={status}>
                  {status.replace("_", " ")}
                </option>
              ))}
            </select>
            <input
              type="date"
              className={inputClass}
              value={filters.date}
              onChange={(event) => {
                setPage(1);
                setFilters((current) => ({ ...current, date: event.target.value }));
              }}
            />
            <button type="button" onClick={loadBookings} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50">
              <RefreshCw className="size-4" />
              Refresh
            </button>
          </div>

          {message ? <div className="mt-4"><FormMessage type={message.type}>{message.text}</FormMessage></div> : null}

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-gray-500">
                  <th className="px-3 py-2 font-medium">Booking</th>
                  <th className="px-3 py-2 font-medium">Customer</th>
                  <th className="px-3 py-2 font-medium">When</th>
                  <th className="px-3 py-2 font-medium">Area/tables</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.items.map((booking) => (
                  <tr key={booking.id}>
                    <td className="px-3 py-3">
                      <p className="font-medium text-gray-900">{booking.booking_reference}</p>
                      <p className="text-xs text-gray-500">{booking.guest_count} guests</p>
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-medium text-gray-700">{booking.customer_name}</p>
                      <p className="text-xs text-gray-500">{booking.customer_phone}</p>
                    </td>
                    <td className="px-3 py-3 text-gray-600">
                      {booking.booking_date}
                      <br />
                      {booking.start_time.slice(0, 5)}-{booking.end_time.slice(0, 5)}
                    </td>
                    <td className="px-3 py-3 text-gray-600">
                      {booking.assigned_area_name || "Unassigned"}
                      <br />
                      <span className="text-xs text-gray-500">{booking.table_numbers || "No tables"}</span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="mb-2">
                        <StatusBadge status={booking.status} />
                      </div>
                      <select
                        className={selectClass}
                        value={statusEdits[booking.id] || booking.status}
                        onChange={(event) => setStatusEdits((current) => ({ ...current, [booking.id]: event.target.value }))}
                      >
                        {tableStatuses.map((status) => (
                          <option key={status} value={status}>
                            {status.replace("_", " ")}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-3">
                      <button type="button" onClick={() => saveStatus(booking)} className="inline-flex h-9 items-center gap-2 rounded-lg bg-brand-600 px-3 text-xs font-medium text-white hover:bg-brand-700">
                        <Save className="size-3.5" />
                        Save
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
      </div>
    </>
  );
}
