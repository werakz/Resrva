import { useEffect, useState } from "react";
import { ArrowLeft, Send } from "lucide-react";
import { Link } from "react-router";
import { apiFetch, toJsonBody } from "../lib/api";
import type { MetaPayload } from "../types";
import {
  FieldLabel,
  FormMessage,
  inputClass,
  selectClass,
  textareaClass,
} from "../components/resrva/FormField";

type FunctionForm = {
  name: string;
  email: string;
  phone: string;
  event_date: string;
  start_time: string;
  duration_minutes: string;
  guest_count: string;
  event_type: string;
  preferred_area_id: string;
  notes: string;
};

const initialFunctionForm: FunctionForm = {
  name: "",
  email: "",
  phone: "",
  event_date: "",
  start_time: "",
  duration_minutes: "180",
  guest_count: "",
  event_type: "",
  preferred_area_id: "",
  notes: "",
};

export default function PublicFunctionRequest() {
  const [meta, setMeta] = useState<MetaPayload | null>(null);
  const [form, setForm] = useState<FunctionForm>(initialFunctionForm);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  useEffect(() => {
    apiFetch<MetaPayload>("meta").then(setMeta).catch(() => {
      setMessage({ type: "error", text: "Function request service is unavailable." });
    });
  }, []);

  const updateField = (field: keyof FunctionForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const submitRequest = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);

    try {
      const response = await apiFetch<{ booking_reference: string }>(
        "public/function-requests",
        {
          method: "POST",
          ...toJsonBody({
            ...form,
            guest_count: Number(form.guest_count),
            duration_minutes: Number(form.duration_minutes),
            preferred_area_id: form.preferred_area_id || null,
          }),
        },
      );
      setMessage({
        type: "success",
        text: `Function request ${response.booking_reference} received. A manager will review and send a confirmation message.`,
      });
      setForm(initialFunctionForm);
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Request could not be submitted.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#f5f7f2] px-4 py-6 text-gray-900">
      <div className="mx-auto max-w-4xl">
        <Link
          to="/"
          className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-brand-700 hover:text-brand-800"
        >
          <ArrowLeft className="size-4" />
          Table bookings
        </Link>

        <form onSubmit={submitRequest} className="rounded-lg border border-gray-200 bg-white p-5 shadow-theme-lg sm:p-6">
          <div className="mb-5">
            <p className="text-sm font-medium uppercase tracking-wide text-brand-700">
              Functions and events
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-gray-950">Request a function booking</h1>
            <p className="mt-2 text-sm text-gray-500">
              Preferred areas are Schumack, Wisteria, and Kookaburra. A manager confirms
              the final area after review.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <FieldLabel htmlFor="function-name">Name</FieldLabel>
              <input
                id="function-name"
                className={inputClass}
                required
                value={form.name}
                onChange={(event) => updateField("name", event.target.value)}
              />
            </div>
            <div>
              <FieldLabel htmlFor="function-email">Email</FieldLabel>
              <input
                id="function-email"
                type="email"
                className={inputClass}
                required
                value={form.email}
                onChange={(event) => updateField("email", event.target.value)}
              />
            </div>
            <div>
              <FieldLabel htmlFor="function-phone">Phone</FieldLabel>
              <input
                id="function-phone"
                className={inputClass}
                required
                value={form.phone}
                onChange={(event) => updateField("phone", event.target.value)}
              />
            </div>
            <div>
              <FieldLabel htmlFor="event-type">Event type</FieldLabel>
              <input
                id="event-type"
                className={inputClass}
                required
                placeholder="Birthday, work party, community event"
                value={form.event_type}
                onChange={(event) => updateField("event_type", event.target.value)}
              />
            </div>
            <div>
              <FieldLabel htmlFor="event-date">Date</FieldLabel>
              <input
                id="event-date"
                type="date"
                className={inputClass}
                required
                value={form.event_date}
                onChange={(event) => updateField("event_date", event.target.value)}
              />
            </div>
            <div>
              <FieldLabel htmlFor="start-time">Start time</FieldLabel>
              <input
                id="start-time"
                type="time"
                step="1800"
                className={inputClass}
                required
                value={form.start_time}
                onChange={(event) => updateField("start_time", event.target.value)}
              />
            </div>
            <div>
              <FieldLabel htmlFor="duration">Duration</FieldLabel>
              <select
                id="duration"
                className={selectClass}
                value={form.duration_minutes}
                onChange={(event) => updateField("duration_minutes", event.target.value)}
              >
                <option value="120">2 hours</option>
                <option value="180">3 hours</option>
                <option value="240">4 hours</option>
              </select>
            </div>
            <div>
              <FieldLabel htmlFor="function-guests">Guests</FieldLabel>
              <input
                id="function-guests"
                type="number"
                min="8"
                className={inputClass}
                required
                value={form.guest_count}
                onChange={(event) => updateField("guest_count", event.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <FieldLabel htmlFor="preferred-function-area">Preferred area</FieldLabel>
              <select
                id="preferred-function-area"
                className={selectClass}
                value={form.preferred_area_id}
                onChange={(event) => updateField("preferred_area_id", event.target.value)}
              >
                <option value="">No preference</option>
                {(meta?.function_areas || []).map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <FieldLabel htmlFor="function-notes">Notes</FieldLabel>
              <textarea
                id="function-notes"
                className={textareaClass}
                value={form.notes}
                onChange={(event) => updateField("notes", event.target.value)}
                placeholder="Tell us about seating needs, timing, entertainment, or accessibility requirements"
              />
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {message ? <FormMessage type={message.type}>{message.text}</FormMessage> : null}
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-700 disabled:opacity-60"
            >
              <Send className="size-4" />
              {submitting ? "Submitting" : "Submit request"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
