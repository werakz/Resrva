import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, LogIn } from "lucide-react";
import { Link } from "react-router";
import { apiFetch, toJsonBody } from "../lib/api";
import type { MetaPayload } from "../types";
import { FormMessage } from "../components/resrva/FormField";
import "./PublicBooking.css";

type BookingForm = {
  service: "lunch" | "dinner" | "function" | "";
  name: string;
  email: string;
  phone: string;
  company_name: string;
  date: string;
  time: string;
  guest_count: string;
  preferred_area_id: string;
  event_type: string;
  notes: string;
  marketing_consent: boolean;
  terms_agreed: boolean;
};

type CalendarDay = {
  iso: string;
  label: string;
  currentMonth: boolean;
  disabled: boolean;
};

type Confirmation = {
  reference: string;
  title: string;
  body: string;
  service: string;
  date: string;
  email: string;
};

const initialForm: BookingForm = {
  service: "",
  name: "",
  email: "",
  phone: "",
  company_name: "",
  date: "",
  time: "",
  guest_count: "8",
  preferred_area_id: "",
  event_type: "",
  notes: "",
  marketing_consent: true,
  terms_agreed: false,
};

const services = [
  { label: "Lunch", value: "lunch", time: "12:00" },
  { label: "Dinner", value: "dinner", time: "18:00" },
  { label: "Function", value: "function", time: "18:00" },
] as const;

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function monthName(date: Date) {
  return date.toLocaleDateString("en-AU", { month: "long", year: "numeric" });
}

function shortDate(iso: string) {
  const date = iso ? new Date(`${iso}T00:00:00`) : new Date();

  return date.toLocaleDateString("en-AU", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function selectedDateParts(iso: string) {
  const date = iso ? new Date(`${iso}T00:00:00`) : new Date();

  return {
    year: date.getFullYear(),
    label: shortDate(toIsoDate(date)),
  };
}

function buildCalendarDays(monthDate: Date): CalendarDay[] {
  const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const mondayOffset = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(first.getDate() - mondayOffset);
  const today = todayIso();

  return Array.from({ length: 35 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const iso = toIsoDate(date);

    return {
      iso,
      label: String(date.getDate()),
      currentMonth: date.getMonth() === monthDate.getMonth(),
      disabled: iso < today,
    };
  });
}

function Stepper({ step }: { step: number }) {
  const items = ["Booking", "Your Details", "Summary"];

  return (
    <div className="public-booking-stepper">
      {items.map((item, index) => {
        const number = index + 1;
        const active = step === number;
        const done = step > number;

        return (
          <div key={item} className="public-booking-step">
            <span
              className={[
                "public-booking-step-number",
                active ? "is-active" : "",
                done ? "is-done" : "",
              ].join(" ")}
            >
              {number}
            </span>
            <span className={["public-booking-step-label", active ? "is-active" : ""].join(" ")}>
              {item}
            </span>
            {number < 3 ? <span className="public-booking-step-line" /> : null}
          </div>
        );
      })}
    </div>
  );
}

function CalendarPanel({
  selectedDate,
  visibleMonth,
  blockedDates,
  onMonthChange,
  onSelectDate,
}: {
  selectedDate: string;
  visibleMonth: Date;
  blockedDates: Set<string>;
  onMonthChange: (date: Date) => void;
  onSelectDate: (date: string) => void;
}) {
  const days = buildCalendarDays(visibleMonth);
  const selected = selectedDateParts(selectedDate || todayIso());

  const moveMonth = (amount: number) => {
    onMonthChange(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + amount, 1));
  };

  return (
    <div className="public-booking-calendar">
      <div className="public-booking-date-strip">
        <p className="public-booking-year">{selected.year}</p>
        <p className="public-booking-selected-date">{selected.label}</p>
      </div>

      <div className="public-booking-calendar-body">
        <div className="public-booking-calendar-top">
          <button
            type="button"
            onClick={() => moveMonth(-1)}
            className="public-booking-month-button"
            aria-label="Previous month"
          >
            <ChevronLeft size={28} />
          </button>
          <p className="public-booking-month-title">{monthName(visibleMonth)}</p>
          <button
            type="button"
            onClick={() => moveMonth(1)}
            className="public-booking-month-button"
            aria-label="Next month"
          >
            <ChevronRight size={28} />
          </button>
        </div>

        <div className="public-booking-calendar-grid">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
            <span key={day} className="public-booking-weekday">
              {day}
            </span>
          ))}

          {days.map((day) => {
            const selectedClass = day.iso === selectedDate ? "is-selected" : "";
            const todayClass = day.iso === todayIso() ? "is-today" : "";
            const mutedClass = !day.currentMonth ? "is-muted" : "";
            const blockedClass = blockedDates.has(day.iso) ? "is-blocked" : "";
            const disabled = day.disabled || blockedDates.has(day.iso);

            return (
              <button
                key={day.iso}
                type="button"
                disabled={disabled}
                onClick={() => onSelectDate(day.iso)}
                className={["public-booking-day", selectedClass, todayClass, mutedClass, blockedClass].join(" ")}
              >
                {day.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={["public-booking-card", className].join(" ")}>{children}</div>;
}

function DetailsField({
  id,
  label,
  children,
  className = "",
}: {
  id: string;
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={["public-booking-field", className].filter(Boolean).join(" ")}>
      <label htmlFor={id} className="public-booking-label">
        {label}
      </label>
      {children}
    </div>
  );
}

function CheckboxField({
  id,
  checked,
  onChange,
  children,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={id} className="public-booking-checkbox-row">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="public-booking-checkbox"
      />
      <span>{children}</span>
    </label>
  );
}

export default function PublicBooking() {
  const [meta, setMeta] = useState<MetaPayload | null>(null);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<BookingForm>(() => ({ ...initialForm, date: todayIso() }));
  const [visibleMonth, setVisibleMonth] = useState(() => new Date());
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
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
  const activeService = services.find((service) => service.value === form.service);
  const venueName = meta?.settings.venue_name || "Old Canberra Inn";
  const venueImageUrl = meta?.settings.venue_image_url || "";
  const blockedOnlineDateSet = useMemo(
    () => new Set((meta?.online_booking_blocks || []).map((block) => block.block_date)),
    [meta],
  );
  const tableBookingsEnabled = (meta?.settings.online_table_bookings_enabled ?? "1") !== "0";
  const functionRequestsEnabled = (meta?.settings.online_function_requests_enabled ?? "1") !== "0";
  const serviceEnabled = (serviceValue: BookingForm["service"]) =>
    serviceValue === "function" ? functionRequestsEnabled : tableBookingsEnabled;
  const selectedAreaName =
    meta?.areas.find((area) => String(area.id) === form.preferred_area_id)?.name || "No preference";
  const policyMessage = useMemo(() => {
    const min = Number(meta?.settings.min_table_guests || 8);
    const max = Number(meta?.settings.max_table_guests || 29);

    if (form.service && !serviceEnabled(form.service)) {
      return form.service === "function"
        ? "Online function requests are currently turned off."
        : "Online table bookings are currently turned off.";
    }
    if (!guestCount) {
      return "Please choose the number of guests.";
    }
    if (guestCount < min) {
      return `Online table bookings are for groups of ${min} or more. Smaller groups are welcome to walk in.`;
    }
    if (form.service !== "function" && guestCount > max) {
      return `Groups over ${max} guests should submit a function request.`;
    }
    if (!form.date) {
      return "Please select a date.";
    }
    if (blockedOnlineDateSet.has(form.date)) {
      return "Online bookings are turned off for this date.";
    }
    if (!form.service) {
      return "Please choose a service.";
    }
    if (!form.time) {
      return "Please choose a time.";
    }

    return null;
  }, [blockedOnlineDateSet, form.date, form.service, form.time, functionRequestsEnabled, guestCount, meta, tableBookingsEnabled]);

  const detailsComplete = Boolean(form.name.trim() && form.email && form.phone && form.terms_agreed);

  const updateField = (field: keyof BookingForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const updateBoolean = (
    field: "marketing_consent" | "terms_agreed",
    value: boolean,
  ) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const fullName = form.name.trim();
  const bookingNotes = [form.notes, form.company_name ? `Company: ${form.company_name}` : ""]
    .filter(Boolean)
    .join("\n");

  const updateGuests = (amount: number) => {
    setForm((current) => {
      const nextGuests = Math.max(1, Number(current.guest_count || 1) + amount);

      return { ...current, guest_count: String(nextGuests) };
    });
  };

  const selectService = (service: (typeof services)[number]) => {
    if (!serviceEnabled(service.value as BookingForm["service"])) {
      setMessage({
        type: "info",
        text:
          service.value === "function"
            ? "Online function requests are currently turned off."
            : "Online table bookings are currently turned off.",
      });
      return;
    }

    const nextForm = {
      ...form,
      service: service.value as BookingForm["service"],
      time: service.time,
      event_type: service.value === "function" ? form.event_type || "Function" : "",
    };
    setForm(nextForm);
    setMessage(null);

    const min = Number(meta?.settings.min_table_guests || 8);
    const max = Number(meta?.settings.max_table_guests || 29);
    const nextGuestCount = Number(nextForm.guest_count || 0);

    if (!nextGuestCount) {
      setMessage({ type: "info", text: "Please choose the number of guests." });
      return;
    }
    if (nextGuestCount < min) {
      setMessage({
        type: "info",
        text:
          service.value === "function"
            ? `Function requests must be for at least ${min} guests.`
            : `Online table bookings are for groups of ${min} or more. Smaller groups are welcome to walk in.`,
      });
      return;
    }
    if (service.value !== "function" && nextGuestCount > max) {
      setMessage({ type: "info", text: `Groups over ${max} guests should submit a function request.` });
      return;
    }

    setStep(2);
  };

  const goNext = () => {
    setMessage(null);
    if (step === 1 && policyMessage) {
      setMessage({ type: "info", text: policyMessage });
      return;
    }
    if (step === 2 && !detailsComplete) {
      setMessage({ type: "info", text: "Please complete your details and accept the booking terms." });
      return;
    }

    setStep((current) => Math.min(current + 1, 3));
  };

  const goBack = () => {
    setMessage(null);
    setStep((current) => Math.max(current - 1, 1));
  };

  const startNewBooking = () => {
    setConfirmation(null);
    setMessage(null);
    setStep(1);
    setForm({ ...initialForm, date: todayIso() });
    setVisibleMonth(new Date());
  };

  const submitBooking = async () => {
    setSubmitting(true);
    setMessage(null);

    try {
      if (form.service === "function") {
        const response = await apiFetch<{
          booking_reference: string;
        }>("public/function-requests", {
          method: "POST",
          ...toJsonBody({
            name: fullName,
            email: form.email,
            phone: form.phone,
            event_date: form.date,
            start_time: form.time,
            guest_count: Number(form.guest_count),
            event_type: form.event_type || "Function",
            duration_minutes: 180,
            preferred_area_id: form.preferred_area_id || null,
            notes: bookingNotes,
          }),
        });

        setConfirmation({
          reference: response.booking_reference,
          title: "Function request submitted",
          body: "A manager will review your request before confirmation.",
          service: "Function",
          date: shortDate(form.date),
          email: form.email,
        });
        return;
      }

      const response = await apiFetch<{
        booking_reference: string;
        assigned_area: string;
      }>("public/table-bookings", {
        method: "POST",
        ...toJsonBody({
          name: fullName,
          email: form.email,
          phone: form.phone,
          date: form.date,
          time: form.time,
          guest_count: Number(form.guest_count),
          preferred_area_id: form.preferred_area_id || null,
          notes: bookingNotes,
        }),
      });

      setConfirmation({
        reference: response.booking_reference,
        title: "Booking submitted",
        body: `Your booking has been confirmed in ${response.assigned_area}.`,
        service: activeService?.label || form.time,
        date: shortDate(form.date),
        email: form.email,
      });
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
    <main className="public-booking-page">
      <header className="public-booking-header">
        <Link to="/signin" className="public-booking-manager">
          <LogIn size={17} />
          Manager
        </Link>
        {venueImageUrl ? (
          <img src={venueImageUrl} alt={venueName} className="public-booking-venue-image" />
        ) : (
          <div className="public-booking-logo">OCI</div>
        )}
        <p className="public-booking-name">{venueName}</p>
      </header>

      {confirmation ? (
        <section className="public-booking-confirmation">
          <Card className="public-booking-confirmation-card">
            <div className="public-booking-confirmation-mark">OK</div>
            <h1>{confirmation.title}</h1>
            <p className="public-booking-confirmation-body">{confirmation.body}</p>
            <div className="public-booking-confirmation-details">
              <p>
                <span>Reference</span>
                <strong>{confirmation.reference}</strong>
              </p>
              <p>
                <span>Service</span>
                <strong>{confirmation.service}</strong>
              </p>
              <p>
                <span>Date</span>
                <strong>{confirmation.date}</strong>
              </p>
              <p>
                <span>Email</span>
                <strong>{confirmation.email}</strong>
              </p>
            </div>
            <button type="button" onClick={startNewBooking} className="public-booking-confirmation-button">
              Make another booking
            </button>
          </Card>
        </section>
      ) : (
        <>
          <Stepper step={step} />

          <section className="public-booking-content">
        {step === 1 ? (
          <div className="public-booking-layout">
            <CalendarPanel
              selectedDate={form.date}
              visibleMonth={visibleMonth}
              blockedDates={blockedOnlineDateSet}
              onMonthChange={setVisibleMonth}
              onSelectDate={(date) => updateField("date", date)}
            />

            <div className="public-booking-side">
              <Card>
                <h1 className="public-booking-card-title">
                  Booking for {form.guest_count || 1} people
                </h1>
                <div className="public-booking-guests-row">
                  <label className="public-booking-floating-field">
                    <span>Booking for</span>
                    <input
                      aria-label="Guests"
                      type="number"
                      min="1"
                      value={form.guest_count}
                      onChange={(event) => updateField("guest_count", event.target.value)}
                      className="public-booking-guest-input"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => updateGuests(-1)}
                    className="public-booking-round-button"
                    aria-label="Decrease guests"
                  >
                    <span aria-hidden="true">-</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => updateGuests(1)}
                    className="public-booking-round-button"
                    aria-label="Increase guests"
                  >
                    <span aria-hidden="true">+</span>
                  </button>
                </div>
              </Card>

              <Card className="public-booking-service-card">
                <h2 className="public-booking-card-title">Which service are you booking for?</h2>
                <div className="public-booking-services">
                  {services.map((service) => (
                    <button
                      key={service.label}
                      type="button"
                      disabled={!serviceEnabled(service.value as BookingForm["service"])}
                      onClick={() => selectService(service)}
                      className={[
                        "public-booking-service",
                        activeService?.label === service.label ? "is-selected" : "",
                        !serviceEnabled(service.value as BookingForm["service"]) ? "is-disabled" : "",
                      ].join(" ")}
                    >
                      {service.label}
                    </button>
                  ))}
                </div>
              </Card>

              {message ? <FormMessage type={message.type}>{message.text}</FormMessage> : null}
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="public-booking-details-layout">
            <Card className="public-booking-details-card">
              <div className="public-booking-details-heading">
                <h1>Customer Details</h1>
              </div>

              <div className="public-booking-line-fields">
                <DetailsField id="name" label="Name *" className="public-booking-field-full">
                  <input
                    id="name"
                    className="public-booking-line-input"
                    required
                    value={form.name}
                    onChange={(event) => updateField("name", event.target.value)}
                  />
                </DetailsField>

                <DetailsField id="phone" label="Phone *">
                  <div className="public-booking-phone-line">
                    <span className="public-booking-country">AU +61</span>
                    <input
                      id="phone"
                      className="public-booking-line-input"
                      required
                      placeholder="Mobile"
                      value={form.phone}
                      onChange={(event) => updateField("phone", event.target.value)}
                    />
                  </div>
                </DetailsField>

                <DetailsField id="email" label="Email *">
                  <input
                    id="email"
                    type="email"
                    className="public-booking-line-input"
                    required
                    value={form.email}
                    onChange={(event) => updateField("email", event.target.value)}
                  />
                </DetailsField>

                <DetailsField id="company_name" label="Company Name">
                  <input
                    id="company_name"
                    className="public-booking-line-input"
                    value={form.company_name}
                    onChange={(event) => updateField("company_name", event.target.value)}
                  />
                </DetailsField>
                {form.service === "function" ? (
                  <DetailsField id="event_type" label="Function type">
                    <input
                      id="event_type"
                      className="public-booking-line-input"
                      required
                      value={form.event_type}
                      onChange={(event) => updateField("event_type", event.target.value)}
                    />
                  </DetailsField>
                ) : null}
              </div>
            </Card>

            <Card className="public-booking-details-card">
              <DetailsField id="notes" label="Notes">
                <textarea
                  id="notes"
                  className="public-booking-notes-line"
                  value={form.notes}
                  onChange={(event) => updateField("notes", event.target.value)}
                />
              </DetailsField>

              <div className="public-booking-consents">
                <CheckboxField
                  id="marketing_consent"
                  checked={form.marketing_consent}
                  onChange={(checked) => updateBoolean("marketing_consent", checked)}
                >
                  I agree to receive special invitations and updates from {venueName}
                </CheckboxField>
                <CheckboxField
                  id="terms_agreed"
                  checked={form.terms_agreed}
                  onChange={(checked) => updateBoolean("terms_agreed", checked)}
                >
                  I agree to the booking <a href="#terms">Terms and Conditions</a>
                </CheckboxField>
              </div>
            </Card>

            {message ? (
              <div className="public-booking-message">
                <FormMessage type={message.type}>{message.text}</FormMessage>
              </div>
            ) : null}
          </div>
        ) : null}

        {step === 3 ? (
          <div className="public-booking-panel">
            <Card>
              <h1 className="public-booking-card-title">Summary</h1>
              <div className="public-booking-summary">
                <p className="public-booking-summary-row">
                  <span className="public-booking-summary-label">Venue</span>
                  <span>{venueName}</span>
                </p>
                <p className="public-booking-summary-row">
                  <span className="public-booking-summary-label">Guests</span>
                  <span>{form.guest_count}</span>
                </p>
                <p className="public-booking-summary-row">
                  <span className="public-booking-summary-label">Date</span>
                  <span>{shortDate(form.date)}</span>
                </p>
                <p className="public-booking-summary-row">
                  <span className="public-booking-summary-label">Service</span>
                  <span>{activeService?.label || form.time}</span>
                </p>
                <p className="public-booking-summary-row">
                  <span className="public-booking-summary-label">
                    {form.service === "function" ? "Area request" : "Area preference"}
                  </span>
                  <span>{selectedAreaName}</span>
                </p>
                {form.service === "function" ? (
                  <p className="public-booking-summary-row">
                    <span className="public-booking-summary-label">Function type</span>
                    <span>{form.event_type}</span>
                  </p>
                ) : null}
                <p className="public-booking-summary-row">
                  <span className="public-booking-summary-label">Name</span>
                  <span>{fullName}</span>
                </p>
                <p className="public-booking-summary-row">
                  <span className="public-booking-summary-label">Email</span>
                  <span>{form.email}</span>
                </p>
              </div>
              {message ? (
                <div className="public-booking-message">
                  <FormMessage type={message.type}>{message.text}</FormMessage>
                </div>
              ) : null}
            </Card>
          </div>
        ) : null}

        <div className="public-booking-actions">
          <button
            type="button"
            onClick={goBack}
            disabled={step === 1}
            className="public-booking-back"
          >
            BACK
          </button>
          {step < 3 ? (
            <button type="button" onClick={goNext} className="public-booking-next">
              NEXT
            </button>
          ) : (
            <button
              type="button"
              onClick={submitBooking}
              disabled={submitting}
              className="public-booking-next"
            >
              {submitting ? "SENDING" : "CONFIRM"}
            </button>
          )}
        </div>
          </section>
        </>
      )}
    </main>
  );
}
