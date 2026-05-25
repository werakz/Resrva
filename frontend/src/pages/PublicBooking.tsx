import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ClipboardList, LogIn, Send, Users } from "lucide-react";
import { Link } from "react-router";
import { apiFetch, toJsonBody } from "../lib/api";
import type { Area, MetaPayload } from "../types";
import {
  FieldLabel,
  FormMessage,
  inputClass,
  selectClass,
  textareaClass,
} from "../components/resrva/FormField";

type BookingForm = {
  name: string;
  email: string;
  phone: string;
  date: string;
  time: string;
  guest_count: string;
  preferred_area_id: string;
  notes: string;
};

const initialForm: BookingForm = {
  name: "",
  email: "",
  phone: "",
  date: "",
  time: "",
  guest_count: "",
  preferred_area_id: "",
  notes: "",
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function areaOptions(areas: Area[]) {
  return areas.map((area) => (
    <option key={area.id} value={area.id}>
      {area.name}
    </option>
  ));
}

export default function PublicBooking() {
  const [meta, setMeta] = useState<MetaPayload | null>(null);
  const [form, setForm] = useState<BookingForm>(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success" | "info"; text: string } | null>(
    null,
  );

  useEffect(() => {
    apiFetch<MetaPayload>("meta").then(setMeta).catch(() => {
      setMessage({
        type: "error",
        text: "The booking service is unavailable. Please check the API and database setup.",
      });
    });
  }, []);

  const guestCount = Number(form.guest_count || 0);
  const policyMessage = useMemo(() => {
    const min = Number(meta?.settings.min_table_guests || 8);
    const max = Number(meta?.settings.max_table_guests || 29);

    if (!guestCount) {
      return null;
    }
    if (guestCount < min) {
      return `Online table bookings are for groups of ${min} or more. Smaller groups are welcome to walk in.`;
    }
    if (guestCount > max) {
      return `Groups over ${max} guests should submit a function request.`;
    }

    return null;
  }, [guestCount, meta]);

  const updateField = (field: keyof BookingForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const submitBooking = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);

    try {
      const response = await apiFetch<{
        booking_reference: string;
        assigned_area: string;
        assigned_tables: number[];
      }>("public/table-bookings", {
        method: "POST",
        ...toJsonBody({
          ...form,
          guest_count: Number(form.guest_count),
          preferred_area_id: form.preferred_area_id || null,
        }),
      });

      setMessage({
        type: "success",
        text: `Booking ${response.booking_reference} confirmed in ${response.assigned_area}. Confirmation email was logged for the demo.`,
      });
      setForm(initialForm);
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Booking could not be submitted.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#f5f7f2] text-gray-900">
      <header className="border-b border-white/70 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link to="/" className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-brand-600 font-semibold text-white">
              R
            </span>
            <span>
              <span className="block text-lg font-semibold">Resrva</span>
              <span className="block text-xs text-gray-500">Old Canberra Inn bookings</span>
            </span>
          </Link>
          <Link
            to="/signin"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50"
          >
            <LogIn className="size-4" />
            Manager
          </Link>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-6 px-4 py-8 lg:grid-cols-[0.85fr_1.15fr] lg:py-12">
        <div className="space-y-5">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-brand-700">
              Table reservations
            </p>
            <h1 className="mt-3 text-4xl font-semibold leading-tight text-gray-950">
              Book a table at Old Canberra Inn
            </h1>
            <p className="mt-4 text-base text-gray-600">
              Groups of 8 to 29 can book online. Larger groups can send a function request
              for manager review.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <div className="rounded-lg border border-white bg-white p-4 shadow-theme-sm">
              <Users className="mb-3 size-5 text-brand-600" />
              <p className="text-sm font-semibold">8-29 guests</p>
              <p className="mt-1 text-sm text-gray-500">Smaller groups are welcome to walk in.</p>
            </div>
            <div className="rounded-lg border border-white bg-white p-4 shadow-theme-sm">
              <CalendarDays className="mb-3 size-5 text-brand-600" />
              <p className="text-sm font-semibold">30-minute slots</p>
              <p className="mt-1 text-sm text-gray-500">Each booking holds tables for 2 hours.</p>
            </div>
            <div className="rounded-lg border border-white bg-white p-4 shadow-theme-sm">
              <ClipboardList className="mb-3 size-5 text-brand-600" />
              <p className="text-sm font-semibold">AI-assisted assignment</p>
              <p className="mt-1 text-sm text-gray-500">The system recommends tables locally.</p>
            </div>
          </div>
        </div>

        <form
          onSubmit={submitBooking}
          className="rounded-lg border border-gray-200 bg-white p-5 shadow-theme-lg sm:p-6"
        >
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Reservation details</h2>
              <p className="mt-1 text-sm text-gray-500">
                You will receive a booking reference after submission.
              </p>
            </div>
            <Link
              to="/functions"
              className="inline-flex h-10 shrink-0 items-center rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Function request
            </Link>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <FieldLabel htmlFor="name">Name</FieldLabel>
              <input
                id="name"
                className={inputClass}
                required
                value={form.name}
                onChange={(event) => updateField("name", event.target.value)}
              />
            </div>
            <div>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <input
                id="email"
                type="email"
                className={inputClass}
                required
                value={form.email}
                onChange={(event) => updateField("email", event.target.value)}
              />
            </div>
            <div>
              <FieldLabel htmlFor="phone">Phone</FieldLabel>
              <input
                id="phone"
                className={inputClass}
                required
                value={form.phone}
                onChange={(event) => updateField("phone", event.target.value)}
              />
            </div>
            <div>
              <FieldLabel htmlFor="guest_count">Guests</FieldLabel>
              <input
                id="guest_count"
                type="number"
                min="1"
                className={inputClass}
                required
                value={form.guest_count}
                onChange={(event) => updateField("guest_count", event.target.value)}
              />
            </div>
            <div>
              <FieldLabel htmlFor="date">Date</FieldLabel>
              <input
                id="date"
                type="date"
                min={todayIso()}
                className={inputClass}
                required
                value={form.date}
                onChange={(event) => updateField("date", event.target.value)}
              />
            </div>
            <div>
              <FieldLabel htmlFor="time">Time</FieldLabel>
              <input
                id="time"
                type="time"
                step="1800"
                className={inputClass}
                required
                value={form.time}
                onChange={(event) => updateField("time", event.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <FieldLabel htmlFor="preferred_area_id">Preferred area</FieldLabel>
              <select
                id="preferred_area_id"
                className={selectClass}
                value={form.preferred_area_id}
                onChange={(event) => updateField("preferred_area_id", event.target.value)}
              >
                <option value="">No preference</option>
                {areaOptions(meta?.areas || [])}
              </select>
            </div>
            <div className="sm:col-span-2">
              <FieldLabel htmlFor="notes">Notes</FieldLabel>
              <textarea
                id="notes"
                className={textareaClass}
                value={form.notes}
                onChange={(event) => updateField("notes", event.target.value)}
                placeholder="Accessibility needs, prams, special occasion, or seating notes"
              />
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {policyMessage ? <FormMessage type="info">{policyMessage}</FormMessage> : null}
            {message ? <FormMessage type={message.type}>{message.text}</FormMessage> : null}
            <button
              type="submit"
              disabled={submitting || Boolean(policyMessage)}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
              <Send className="size-4" />
              {submitting ? "Submitting" : "Confirm booking"}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
