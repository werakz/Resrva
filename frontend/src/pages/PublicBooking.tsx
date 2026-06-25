import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, LogIn } from "lucide-react";
import { Link } from "react-router";
import { apiFetch, toJsonBody } from "../lib/api";
import { bookingTypeColourVars, bookingTypeSoftStyle } from "../lib/bookingTypeColours";
import { publicVenuePath } from "../lib/publicVenue";
import type { BookingCustomField, BookingSession, BookingType, MetaPayload } from "../types";
import { FormMessage } from "../components/resrva/FormField";
import "./PublicBooking.css";

type BookingForm = {
  service: string;
  booking_type_id: string;
  booking_session_id: string;
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
  custom_answers: Record<string, string | boolean>;
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
  booking_type_id: "",
  booking_session_id: "",
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
  custom_answers: {},
  marketing_consent: true,
  terms_agreed: false,
};

type ServiceOption = {
  label: string;
  value: string;
  time: string;
  bookingType?: BookingType;
};

type TimeOption = {
  value: string;
  label: string;
};

function todayIso() {
  return toIsoDate(new Date());
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

function parseAnnualClosedMonthDays(value: string): Set<string> {
  return new Set(
    value
      .split(",")
      .map((date) => date.trim())
      .filter((date) => /^\d{2}-\d{2}$/.test(date)),
  );
}

function monthDayFromIso(iso: string): string {
  const [, month = "", day = ""] = iso.split("-");
  return `${month}-${day}`;
}

function minutesFromTime(time: string) {
  const [hours, minutes] = time.slice(0, 5).split(":").map(Number);

  return hours * 60 + minutes;
}

function timeFromMinutes(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function displayTime(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  const period = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;

  return `${displayHours}:${String(minutes).padStart(2, "0")} ${period}`;
}

function dayOfWeekFromIso(iso: string) {
  return new Date(`${iso}T00:00:00`).getDay();
}

function buildTimeOptions(
  service: BookingForm["service"],
  date: string,
  meta: MetaPayload | null,
): TimeOption[] {
  if (!service || !date) {
    return [];
  }

  const serviceType = meta?.booking_types?.find((type) => `booking-type:${type.id}` === service);
  if (serviceType?.category === "event") {
    return [];
  }

  const dayOfWeek = dayOfWeekFromIso(date);
  const openingHours = meta?.opening_hours.find((hours) => Number(hours.day_of_week) === dayOfWeek);
  if (!openingHours || Number(openingHours.is_closed) === 1) {
    return [];
  }

  const openMinutes = minutesFromTime(openingHours.opens_at);
  const closeMinutes = minutesFromTime(openingHours.closes_at);
  const interval = Math.max(Number(meta?.settings.slot_interval_minutes || 30), 15);
  const duration = serviceType?.category === "function" ? 180 : Number(meta?.settings.default_duration_minutes || 120);
  const latestStart = closeMinutes - duration;
  const minimumNotice = Math.max(Number(meta?.settings.minimum_booking_notice_minutes || 0), 0);
  const now = new Date();
  const minimumStart =
    date === todayIso() ? now.getHours() * 60 + now.getMinutes() + minimumNotice : Number.NEGATIVE_INFINITY;
  const schedule = serviceType?.category === "dining" ? serviceType.schedule : null;
  const serviceStart = schedule?.start_time
    ? minutesFromTime(schedule.start_time)
    : serviceType?.slug === "dinner"
      ? 17 * 60
      : openMinutes;
  const serviceEnd = schedule?.end_time
    ? minutesFromTime(schedule.end_time)
    : serviceType?.slug === "lunch"
      ? Math.min(17 * 60 - interval, latestStart)
    : latestStart;
  const start = Math.max(openMinutes, serviceStart, minimumStart);
  const end = Math.min(latestStart, serviceEnd);

  if (end < start) {
    return [];
  }

  const firstSlot = Math.ceil(start / interval) * interval;
  const options: TimeOption[] = [];

  for (let minutes = firstSlot; minutes <= end; minutes += interval) {
    const value = timeFromMinutes(minutes);
    options.push({ value, label: displayTime(value) });
  }

  return options;
}

function displaySession(session: BookingSession) {
  const date = new Date(`${session.date}T00:00:00`);
  const label = date.toLocaleDateString("en-AU", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
  const start = displayTime(session.start_time.slice(0, 5));
  const end = session.end_time ? displayTime(session.end_time.slice(0, 5)) : "";
  const time = end ? `${start} - ${end}` : start;

  return `${label} - ${time}`;
}

function venueInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "R";
}

function sessionAvailabilityLabel(session: BookingSession) {
  const labels: string[] = [];
  if (session.available_guests !== null && session.available_guests !== undefined) {
    labels.push(`${session.available_guests} guest spots left`);
  }
  if (session.available_bookings !== null && session.available_bookings !== undefined) {
    labels.push(`${session.available_bookings} booking spots left`);
  }

  return labels.length ? labels.join(" · ") : "Available";
}

function EventSessionPanel({
  bookingType,
  selectedSessionId,
  onSelectSession,
}: {
  bookingType: BookingType;
  selectedSessionId: string;
  onSelectSession: (session: BookingSession) => void;
}) {
  const sessions = bookingType.upcoming_sessions || [];

  return (
    <div className="public-booking-event-sessions" style={bookingTypeColourVars(bookingType.colour)}>
      <div className="public-booking-event-sessions-heading">
        <h2>{bookingType.name}</h2>
        {bookingType.description ? <p>{bookingType.description}</p> : null}
      </div>
      {sessions.length ? (
        <div className="public-booking-session-list">
          {sessions.map((session) => (
            <button
              key={session.id}
              type="button"
              onClick={() => onSelectSession(session)}
              className={[
                "public-booking-session",
                selectedSessionId === String(session.id) ? "is-selected" : "",
              ].join(" ")}
            >
              <span>
                <strong>{displaySession(session)}</strong>
                {session.arrival_time ? <small>Arrive from {displayTime(session.arrival_time.slice(0, 5))}</small> : null}
              </span>
              <em>{sessionAvailabilityLabel(session)}</em>
            </button>
          ))}
        </div>
      ) : (
        <p className="public-booking-empty">No upcoming sessions are available yet.</p>
      )}
    </div>
  );
}

function buildCalendarDays(monthDate: Date): CalendarDay[] {
  const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const mondayOffset = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(first.getDate() - mondayOffset);
  const today = todayIso();

  return Array.from({ length: 42 }, (_, index) => {
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
  annualClosedMonthDays,
  onMonthChange,
  onSelectDate,
}: {
  selectedDate: string;
  visibleMonth: Date;
  blockedDates: Set<string>;
  annualClosedMonthDays: Set<string>;
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
            const isBlocked = blockedDates.has(day.iso) || annualClosedMonthDays.has(monthDayFromIso(day.iso));
            const blockedClass = isBlocked ? "is-blocked" : "";
            const disabled = day.disabled || isBlocked;

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
  const activeBookingTypes = useMemo(
    () =>
      (meta?.booking_types || []).filter(
        (type) =>
          ["dining", "function", "event"].includes(type.category) &&
          Number(type.is_active) === 1 &&
          Number(type.display_to_customers) === 1,
      ),
    [meta],
  );
  const services = useMemo<ServiceOption[]>(
    () =>
      activeBookingTypes.map((type) => ({
        label: type.customer_button_label || type.name,
        value: `booking-type:${type.id}`,
        time: type.upcoming_sessions?.[0]?.start_time?.slice(0, 5) || type.schedule?.start_time?.slice(0, 5) || "12:00",
        bookingType: type,
      })),
    [activeBookingTypes],
  );
  const activeService = services.find((service) => service.value === form.service);
  const selectedBookingType = activeService?.bookingType || null;
  const selectedEventType = activeService?.bookingType?.category === "event" ? activeService.bookingType : null;
  const selectedFunctionType = activeService?.bookingType?.category === "function" ? activeService.bookingType : null;
  const selectedDiningType = activeService?.bookingType?.category === "dining" ? activeService.bookingType : null;
  const selectedEventSession =
    selectedEventType?.upcoming_sessions?.find((session) => String(session.id) === form.booking_session_id) || null;
  const venueName = meta?.settings.venue_name || "Old Canberra Inn";
  const venueImageUrl = meta?.settings.venue_image_url || "";
  const blockedOnlineDateSet = useMemo(
    () => new Set((meta?.online_booking_blocks || []).map((block) => block.block_date)),
    [meta],
  );
  const annualClosedMonthDays = useMemo(
    () =>
      parseAnnualClosedMonthDays(
        meta?.settings.annual_closed_days || meta?.settings.annual_closed_day || "",
      ),
    [meta],
  );
  const tableBookingsEnabled = (meta?.settings.online_table_bookings_enabled ?? "1") !== "0";
  const functionRequestsEnabled = (meta?.settings.online_function_requests_enabled ?? "1") !== "0";
  const serviceEnabled = useCallback(
    (serviceValue: BookingForm["service"]) => {
      const type = activeBookingTypes.find((bookingType) => `booking-type:${bookingType.id}` === serviceValue);
      if (!type) return false;
      if (type.category === "event") return true;
      if (type.category === "function") return functionRequestsEnabled;
      if (type.category === "dining") return tableBookingsEnabled;
      return false;
    },
    [activeBookingTypes, functionRequestsEnabled, tableBookingsEnabled],
  );
  const timeOptions = useMemo(
    () => buildTimeOptions(form.service, form.date, meta),
    [form.date, form.service, meta],
  );
  const selectedTimeValue = timeOptions.some((option) => option.value === form.time) ? form.time : "";
  const selectedAreaName =
    meta?.areas.find((area) => String(area.id) === form.preferred_area_id)?.name || "No preference";

  useEffect(() => {
    if (!form.service || timeOptions.length === 0) {
      return;
    }

    if (!timeOptions.some((option) => option.value === form.time)) {
      setForm((current) => ({ ...current, time: timeOptions[0].value }));
    }
  }, [form.service, form.time, timeOptions]);

  const policyMessage = useMemo(() => {
    const min = selectedBookingType
      ? Number(selectedBookingType.min_guests || 1)
      : Number(meta?.settings.min_table_guests || 8);
    const max = selectedBookingType
      ? Number(selectedBookingType.max_guests || 0)
      : Number(meta?.settings.max_table_guests || 29);

    if (form.service && !serviceEnabled(form.service)) {
      if (selectedBookingType?.category === "function") return "Online function requests are currently turned off.";
      if (selectedBookingType?.category === "event") return "This event booking type is not available online.";
      return "Online table bookings are currently turned off.";
    }
    if (!guestCount) {
      return "Please choose the number of guests.";
    }
    if (guestCount < min) {
      if (selectedBookingType) {
        return `${selectedBookingType.name} starts at ${min} guests per booking.`;
      }
      return `Online table bookings are for groups of ${min} or more. Smaller groups are welcome to walk in.`;
    }
    if (max > 0 && guestCount > max) {
      return selectedBookingType
        ? `${selectedBookingType.name} accepts up to ${max} guests per booking.`
        : `Groups over ${max} guests should submit a function request.`;
    }
    if (!form.date) {
      return "Please select a date.";
    }
    if (blockedOnlineDateSet.has(form.date)) {
      return "Online bookings are turned off for this date.";
    }
    if (annualClosedMonthDays.has(monthDayFromIso(form.date))) {
      return "The venue is closed on this date each year.";
    }
    if (!form.service) {
      return "Please choose a service.";
    }
    if (selectedEventType && !form.booking_session_id) {
      return "Please choose an event session.";
    }
    if (selectedEventType) {
      return null;
    }
    if (timeOptions.length === 0) {
      return "No online booking times are available for that service on this date.";
    }
    if (!form.time) {
      return "Please choose a time.";
    }

    return null;
  }, [
    blockedOnlineDateSet,
    annualClosedMonthDays,
    form.booking_session_id,
    form.date,
    form.service,
    form.time,
    guestCount,
    meta,
    selectedBookingType,
    selectedEventType,
    serviceEnabled,
    timeOptions.length,
  ]);

  const requiredCustomFieldsComplete = (selectedEventType?.custom_fields || []).every((field) => {
    if (!Number(field.is_required)) return true;
    const value = form.custom_answers[String(field.id)];
    return field.field_type === "checkbox" ? Boolean(value) : String(value || "").trim() !== "";
  });
  const detailsComplete = Boolean(form.name.trim() && form.email && form.phone && form.terms_agreed && requiredCustomFieldsComplete);

  const updateField = (field: keyof BookingForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const updateBoolean = (
    field: "marketing_consent" | "terms_agreed",
    value: boolean,
  ) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const updateCustomAnswer = (fieldId: number, value: string | boolean) => {
    setForm((current) => ({
      ...current,
      custom_answers: {
        ...current.custom_answers,
        [String(fieldId)]: value,
      },
    }));
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

  const selectEventSession = (session: BookingSession) => {
    setForm((current) => ({
      ...current,
      booking_session_id: String(session.id),
      date: session.date,
      time: session.start_time.slice(0, 5),
    }));
  };

  const selectService = (service: ServiceOption) => {
    if (!serviceEnabled(service.value as BookingForm["service"])) {
      setMessage({
        type: "info",
        text:
          service.bookingType?.category === "function"
            ? "Online function requests are currently turned off."
            : service.bookingType?.category === "event"
              ? "This event booking type is not available online."
              : "Online table bookings are currently turned off.",
      });
      return;
    }

    const bookingType = service.bookingType;
    const isEventType = bookingType?.category === "event";
    const isFunctionType = bookingType?.category === "function";
    const firstSession = isEventType ? bookingType?.upcoming_sessions?.[0] : undefined;
    const nextTimeOptions = buildTimeOptions(service.value, firstSession?.date || form.date, meta);
    const nextForm = {
      ...form,
      service: service.value,
      booking_type_id: bookingType ? String(bookingType.id) : "",
      booking_session_id: firstSession ? String(firstSession.id) : "",
      date: firstSession?.date || form.date,
      time: firstSession?.start_time?.slice(0, 5) || nextTimeOptions[0]?.value || service.time,
      guest_count: bookingType ? String(Math.max(Number(form.guest_count || bookingType.min_guests), Number(bookingType.min_guests || 1))) : form.guest_count,
      event_type: isFunctionType ? form.event_type || bookingType?.name || "Function" : bookingType?.name || "",
      custom_answers: isEventType ? {} : form.custom_answers,
    };
    setForm(nextForm);
    setMessage(null);

    const min = bookingType ? Number(bookingType.min_guests || 1) : Number(meta?.settings.min_table_guests || 8);
    const max = bookingType ? Number(bookingType.max_guests || 0) : Number(meta?.settings.max_table_guests || 29);
    const nextGuestCount = Number(nextForm.guest_count || 0);

    if (!nextGuestCount) {
      setMessage({ type: "info", text: "Please choose the number of guests." });
      return;
    }
    if (nextGuestCount < min) {
      setMessage({
        type: "info",
        text: bookingType
          ? `${bookingType.name} starts at ${min} guests per booking.`
          : `Online table bookings are for groups of ${min} or more. Smaller groups are welcome to walk in.`,
      });
      return;
    }
    if (bookingType && max > 0 && nextGuestCount > max) {
      setMessage({ type: "info", text: `${bookingType.name} accepts up to ${max} guests per booking.` });
    }
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
      if (selectedEventType) {
        const response = await apiFetch<{
          booking_reference: string;
          status: string;
          booking_type_name: string;
        }>("public/event-bookings", {
          method: "POST",
          ...toJsonBody({
            booking_type_id: Number(form.booking_type_id),
            booking_session_id: Number(form.booking_session_id),
            name: fullName,
            email: form.email,
            phone: form.phone,
            guest_count: Number(form.guest_count),
            notes: bookingNotes,
            custom_answers: form.custom_answers,
          }),
        });

        setConfirmation({
          reference: response.booking_reference,
          title: response.status === "waitlist" ? "Added to waitlist" : "Booking submitted",
          body:
            response.status === "waitlist"
              ? "This session is full, so your booking has been added to the waitlist."
              : "Your event booking has been received.",
          service: response.booking_type_name,
          date: selectedEventSession
            ? displaySession(selectedEventSession)
            : `${shortDate(form.date)} at ${displayTime(form.time)}`,
          email: form.email,
        });
        return;
      }

      if (selectedFunctionType) {
        const response = await apiFetch<{
          booking_reference: string;
        }>("public/function-requests", {
          method: "POST",
          ...toJsonBody({
            booking_type_id: Number(form.booking_type_id),
            name: fullName,
            email: form.email,
            phone: form.phone,
            event_date: form.date,
            start_time: form.time,
            guest_count: Number(form.guest_count),
            event_type: form.event_type || selectedFunctionType.name,
            duration_minutes: 180,
            preferred_area_id: form.preferred_area_id || null,
            notes: bookingNotes,
          }),
        });

        setConfirmation({
          reference: response.booking_reference,
          title: "Function request submitted",
          body: "A manager will review your request before confirmation.",
          service: selectedFunctionType.name,
          date: `${shortDate(form.date)} at ${displayTime(form.time)}`,
          email: form.email,
        });
        return;
      }

      const response = await apiFetch<{
        booking_reference: string;
        status: string;
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
          booking_type_id: selectedDiningType ? Number(form.booking_type_id) : null,
          preferred_area_id: form.preferred_area_id || null,
          notes: bookingNotes,
        }),
      });

      setConfirmation({
        reference: response.booking_reference,
        title: "Booking submitted",
        body:
          response.status === "confirmed"
            ? `Your booking has been confirmed in ${response.assigned_area}.`
            : "Your booking has been received. A manager will assign your table before confirmation.",
        service: activeService?.label || form.time,
        date: `${shortDate(form.date)} at ${displayTime(form.time)}`,
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

  const renderCustomField = (field: BookingCustomField) => {
    const fieldId = String(field.id);
    const value = form.custom_answers[fieldId];
    const label = `${field.label}${Number(field.is_required) ? " *" : ""}`;

    if (field.field_type === "checkbox") {
      return (
        <CheckboxField
          key={field.id}
          id={`custom-${field.id}`}
          checked={Boolean(value)}
          onChange={(checked) => updateCustomAnswer(field.id, checked)}
        >
          {field.label}
          {Number(field.is_required) ? " *" : ""}
        </CheckboxField>
      );
    }

    if (field.field_type === "dropdown") {
      return (
        <DetailsField key={field.id} id={`custom-${field.id}`} label={label}>
          <select
            id={`custom-${field.id}`}
            className="public-booking-line-input"
            required={Boolean(Number(field.is_required))}
            value={String(value || "")}
            onChange={(event) => updateCustomAnswer(field.id, event.target.value)}
          >
            <option value="">Select</option>
            {(field.options || []).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </DetailsField>
      );
    }

    return (
      <DetailsField key={field.id} id={`custom-${field.id}`} label={label}>
        <input
          id={`custom-${field.id}`}
          type={field.field_type === "number" ? "number" : "text"}
          className="public-booking-line-input"
          required={Boolean(Number(field.is_required))}
          value={String(value || "")}
          onChange={(event) => updateCustomAnswer(field.id, event.target.value)}
        />
      </DetailsField>
    );
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
          <div className="public-booking-logo">{venueInitials(venueName)}</div>
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
            {selectedEventType ? (
              <EventSessionPanel
                bookingType={selectedEventType}
                selectedSessionId={form.booking_session_id}
                onSelectSession={selectEventSession}
              />
            ) : (
              <CalendarPanel
                selectedDate={form.date}
                visibleMonth={visibleMonth}
                blockedDates={blockedOnlineDateSet}
                annualClosedMonthDays={annualClosedMonthDays}
                onMonthChange={setVisibleMonth}
                onSelectDate={(date) => updateField("date", date)}
              />
            )}

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
                      key={service.value}
                      type="button"
                      disabled={!serviceEnabled(service.value as BookingForm["service"])}
                      onClick={() => selectService(service)}
                      style={bookingTypeColourVars(service.bookingType?.colour)}
                      className={[
                        "public-booking-service",
                        activeService?.value === service.value ? "is-selected" : "",
                        !serviceEnabled(service.value as BookingForm["service"]) ? "is-disabled" : "",
                      ].join(" ")}
                    >
                      {service.label}
                    </button>
                  ))}
                </div>
              </Card>

              <Card className="public-booking-time-card">
                <div className="public-booking-time-heading">
                  <h2 className="public-booking-card-title">{selectedEventType ? "Selected session" : "Select a time"}</h2>
                  <span style={activeService?.bookingType ? bookingTypeSoftStyle(activeService.bookingType.colour) : undefined}>
                    {activeService?.label || "Choose a service first"}
                  </span>
                </div>
                {selectedEventType ? (
                  <div
                    className="public-booking-selected-session"
                    style={bookingTypeSoftStyle(selectedEventType.colour)}
                  >
                    {selectedEventSession ? displaySession(selectedEventSession) : "Choose a session"}
                  </div>
                ) : (
                  <select
                    aria-label="Booking time"
                    value={selectedTimeValue}
                    disabled={!form.service || timeOptions.length === 0}
                    onChange={(event) => updateField("time", event.target.value)}
                    className="public-booking-time-select"
                  >
                    {!form.service ? <option value="">Choose a service first</option> : null}
                    {form.service && timeOptions.length === 0 ? <option value="">No times available</option> : null}
                    {timeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                )}
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
                {selectedFunctionType ? (
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
                {selectedEventType?.custom_fields.map(renderCustomField)}
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
                  I agree to the booking{" "}
                  <Link to={publicVenuePath("terms")} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>
                    Terms and Conditions
                  </Link>
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
                  <span className="public-booking-summary-label">Time</span>
                  <span>{selectedEventSession ? displayTime(selectedEventSession.start_time.slice(0, 5)) : displayTime(form.time)}</span>
                </p>
                <p className="public-booking-summary-row">
                  <span className="public-booking-summary-label">Service</span>
                  <span>{activeService?.label || form.time}</span>
                </p>
                {!selectedEventType ? (
                  <p className="public-booking-summary-row">
                    <span className="public-booking-summary-label">
                      {selectedFunctionType ? "Area request" : "Area preference"}
                    </span>
                    <span>{selectedAreaName}</span>
                  </p>
                ) : null}
                {selectedEventSession ? (
                  <p className="public-booking-summary-row">
                    <span className="public-booking-summary-label">Session</span>
                    <span>{displaySession(selectedEventSession)}</span>
                  </p>
                ) : null}
                {selectedFunctionType ? (
                  <p className="public-booking-summary-row">
                    <span className="public-booking-summary-label">Function type</span>
                    <span>{form.event_type}</span>
                  </p>
                ) : null}
                {selectedEventType?.custom_fields.map((field) => {
                  const answer = form.custom_answers[String(field.id)];
                  if (answer === undefined || answer === "") return null;

                  return (
                    <p key={field.id} className="public-booking-summary-row">
                      <span className="public-booking-summary-label">{field.label}</span>
                      <span>{typeof answer === "boolean" ? (answer ? "Yes" : "No") : answer}</span>
                    </p>
                  );
                })}
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
