import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import flatpickr from "flatpickr";
import type { Instance as FlatpickrInstance } from "flatpickr/dist/types/instance";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Mail,
  MapPin,
  Phone,
  Plus,
  Save,
  Users,
  X,
} from "lucide-react";
import { apiFetch, toJsonBody } from "../lib/api";
import type { Area, Booking, MetaPayload, Paginated } from "../types";
import { FieldLabel, FormMessage, SelectInput, inputClass, textareaClass } from "../components/resrva/FormField";
import { LoadingState } from "../components/resrva/LoadingState";
import { StatusBadge } from "../components/resrva/StatusBadge";
import {
  AiReplyComposer,
  replyPurposeForStatus,
  statusNeedsCustomerNotice,
  type ReplyPurpose,
} from "../components/resrva/AiReplyComposer";
import { CustomerNotifyPrompt } from "../components/resrva/CustomerNotifyPrompt";

const functionStatuses = ["pending", "approved", "confirmed", "declined", "cancelled"] as const;
const dateScopeTabs = [
  { label: "Today", value: "today" },
  { label: "Upcoming", value: "upcoming" },
  { label: "Past", value: "past" },
] as const;
const detailLabelClass = "mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300";
const detailSectionTitleClass = "text-base font-medium text-gray-800 dark:text-white/90";

type DateScope = (typeof dateScopeTabs)[number]["value"];
type FunctionEditState = {
  date: string;
  time: string;
  end_time: string;
  guest_count: string;
  event_type: string;
  preferred_area_id: string;
  status: string;
  assigned_area_ids: string[];
  staff_notes: string;
};
type FunctionCreateForm = {
  name: string;
  email: string;
  phone: string;
  date: string;
  time: string;
  duration_minutes: string;
  guest_count: string;
  event_type: string;
  status: string;
  assigned_area_ids: string[];
  notes: string;
  staff_notes: string;
};
type NotifyPromptState = {
  booking: Booking;
  purpose: ReplyPurpose;
  message: string;
};

const emptyCreateFunction: FunctionCreateForm = {
  name: "",
  email: "",
  phone: "",
  date: todayIso(),
  time: "18:00",
  duration_minutes: "180",
  guest_count: "30",
  event_type: "",
  status: "pending",
  assigned_area_ids: [],
  notes: "",
  staff_notes: "",
};

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function todayIso() {
  return toIsoDate(new Date());
}

function addDaysIso(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);

  return toIsoDate(date);
}

function dateFromIso(value: string): Date | null {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;

  return new Date(year, month - 1, day);
}

function formatDate(value: string): string {
  const date = dateFromIso(value);
  if (!date) return value;

  return new Intl.DateTimeFormat("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatTime(value: string): string {
  const [hoursText = "0", minutesText = "00"] = value.slice(0, 5).split(":");
  const hours = Number(hoursText);
  const suffix = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;

  return `${displayHours}:${minutesText} ${suffix}`;
}

function minutesFromTime(value: string): number {
  const [hoursText, minutesText] = value.split(":");
  const hours = Number(hoursText);
  const minutes = Number(minutesText);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return Number.NaN;

  return hours * 60 + minutes;
}

function minutesBetween(start: string, end: string): number {
  return minutesFromTime(end) - minutesFromTime(start);
}

function statusLabel(status: string): string {
  return status
    .replace("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function parseIds(value?: string | null): string[] {
  return value
    ? value
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean)
    : [];
}

function assignedAreaLabel(booking: Booking): string {
  return booking.assigned_area_names || booking.assigned_area_name || "Unassigned";
}

function customerNoticeForStatusChange(previousStatus: string, nextStatus: string, booking: Booking): NotifyPromptState | null {
  if (previousStatus === nextStatus || !statusNeedsCustomerNotice(nextStatus)) {
    return null;
  }

  const message =
    nextStatus === "confirmed" || nextStatus === "approved"
      ? "This function is now confirmed. Do you want to draft a confirmation reply for the customer?"
      : nextStatus === "declined"
        ? "This function has been declined. Do you want to draft a polite reply for the customer?"
        : "This function has been cancelled. Do you want to draft an update for the customer?";

  return {
    booking,
    purpose: replyPurposeForStatus(nextStatus),
    message,
  };
}

function editForBooking(booking: Booking): FunctionEditState {
  return {
    date: booking.booking_date,
    time: booking.start_time.slice(0, 5),
    end_time: booking.end_time.slice(0, 5),
    guest_count: String(booking.guest_count),
    event_type: booking.event_type || "",
    preferred_area_id: booking.preferred_area_id ? String(booking.preferred_area_id) : "",
    status: booking.status,
    assigned_area_ids: parseIds(booking.assigned_area_ids || (booking.assigned_area_id ? String(booking.assigned_area_id) : "")),
    staff_notes: booking.staff_notes || "",
  };
}

function FunctionAreaPicker({
  areas,
  selectedIds,
  onChange,
}: {
  areas: Area[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const selected = new Set(selectedIds);

  const toggleArea = (areaId: string) => {
    if (selected.has(areaId)) {
      onChange(selectedIds.filter((id) => id !== areaId));
      return;
    }

    onChange([...selectedIds, areaId]);
  };

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {areas.map((area) => {
        const id = String(area.id);
        const isSelected = selected.has(id);

        return (
          <button
            key={area.id}
            type="button"
            aria-pressed={isSelected}
            onClick={() => toggleArea(id)}
            className={`flex h-11 items-center justify-between rounded-lg border px-3 text-left text-sm font-medium transition ${
              isSelected
                ? "border-brand-500 bg-brand-50 text-brand-700 shadow-theme-xs dark:border-brand-400/40 dark:bg-brand-500/15 dark:text-brand-300"
                : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.04]"
            }`}
          >
            <span>{area.name}</span>
            <span className={`size-2 rounded-full ${isSelected ? "bg-brand-500" : "bg-gray-300"}`} />
          </button>
        );
      })}
    </div>
  );
}

function SingleDatePicker({
  id,
  value,
  onChange,
  required = false,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const pickerRef = useRef<FlatpickrInstance | null>(null);
  const onChangeRef = useRef(onChange);
  const initialDateRef = useRef(value || undefined);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!inputRef.current) return undefined;

    const picker = flatpickr(inputRef.current, {
      appendTo: document.body,
      positionElement: inputRef.current,
      position: "auto center",
      monthSelectorType: "static",
      dateFormat: "Y-m-d",
      disableMobile: true,
      defaultDate: initialDateRef.current,
      onChange: (selectedDates, dateString) => {
        onChangeRef.current(dateString || (selectedDates[0] ? toIsoDate(selectedDates[0]) : ""));
        pickerRef.current?.close();
      },
    });

    if (!Array.isArray(picker)) {
      pickerRef.current = picker;
    }

    return () => {
      if (!Array.isArray(picker)) {
        picker.destroy();
      }
      pickerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const picker = pickerRef.current;
    if (!picker) return;

    picker.setDate(value || "", false, "Y-m-d");
    if (inputRef.current) {
      inputRef.current.value = value;
    }
  }, [value]);

  return (
    <div className="relative">
      <input
        id={id}
        ref={inputRef}
        readOnly
        required={required}
        value={value}
        onClick={() => pickerRef.current?.open()}
        className={`${inputClass} pr-10`}
      />
      <CalendarDays className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
    </div>
  );
}

export default function FunctionsPage() {
  const [meta, setMeta] = useState<MetaPayload | null>(null);
  const [data, setData] = useState<Paginated<Booking> | null>(null);
  const [filters, setFilters] = useState(() => ({
    search: "",
    status: "",
    date_from: todayIso(),
    date_to: todayIso(),
    date_scope: "today" as DateScope,
  }));
  const [page, setPage] = useState(1);
  const [selectedBookingId, setSelectedBookingId] = useState<number | null>(null);
  const [edits, setEdits] = useState<Record<number, FunctionEditState>>({});
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<FunctionCreateForm>(emptyCreateFunction);
  const [modalMessage, setModalMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [notifyPrompt, setNotifyPrompt] = useState<NotifyPromptState | null>(null);
  const [replyTarget, setReplyTarget] = useState<Booking | null>(null);
  const [replyOpenRequest, setReplyOpenRequest] = useState<{ token: number; purpose: ReplyPurpose } | undefined>();

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), per_page: "20" });
    if (filters.search) params.set("search", filters.search);
    if (filters.status) params.set("status", filters.status);
    if (filters.date_from) params.set("date_from", filters.date_from);
    if (filters.date_to) params.set("date_to", filters.date_to);

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

  useEffect(() => {
    const items = data?.items || [];

    if (items.length === 0) {
      if (selectedBookingId !== null) {
        setSelectedBookingId(null);
      }
      return;
    }

    if (!items.some((booking) => booking.id === selectedBookingId)) {
      setSelectedBookingId(items[0].id);
    }
  }, [data, selectedBookingId]);

  const selectedBooking = useMemo(() => {
    if (!data?.items.length) return null;

    return data.items.find((booking) => booking.id === selectedBookingId) || data.items[0];
  }, [data, selectedBookingId]);

  const editFor = (booking: Booking) => edits[booking.id] || editForBooking(booking);

  const updateEdit = (booking: Booking, patch: Partial<FunctionEditState>) => {
    setEdits((current) => ({ ...current, [booking.id]: { ...editFor(booking), ...patch } }));
  };

  const updateCreateForm = <K extends keyof FunctionCreateForm>(field: K, value: FunctionCreateForm[K]) => {
    setCreateForm((current) => ({ ...current, [field]: value }));
  };

  const openCreateModal = () => {
    setModalMessage(null);
    setCreateForm({ ...emptyCreateFunction, date: todayIso() });
    setIsCreateOpen(true);
  };

  const closeCreateModal = () => {
    setModalMessage(null);
    setIsCreateOpen(false);
  };

  const openReplyFromPrompt = (booking: Booking, purpose: ReplyPurpose) => {
    setReplyTarget(booking);
    setNotifyPrompt(null);
    setReplyOpenRequest({ token: Date.now(), purpose });
  };

  const updateDateScope = (scope: DateScope) => {
    const today = todayIso();
    setPage(1);
    setFilters((current) => ({
      ...current,
      date_from: scope === "past" ? "" : scope === "upcoming" ? addDaysIso(1) : today,
      date_to: scope === "today" ? today : scope === "past" ? addDaysIso(-1) : "",
      date_scope: scope,
    }));
  };

  const createFunction = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    setModalMessage(null);

    if (["approved", "confirmed"].includes(createForm.status) && createForm.assigned_area_ids.length === 0) {
      setModalMessage({ type: "error", text: "Select at least one function area before approving." });
      return;
    }

    try {
      const response = await apiFetch<{ item: Booking }>("functions", {
        method: "POST",
        ...toJsonBody({
          ...createForm,
          guest_count: Number(createForm.guest_count),
          duration_minutes: Number(createForm.duration_minutes),
          assigned_area_ids: createForm.assigned_area_ids.map(Number),
          assigned_area_id: createForm.assigned_area_ids[0] || null,
        }),
      });
      const created = response.item;
      const nextScope = created.booking_date === todayIso() ? "today" : "upcoming";

      setMessage({ type: "success", text: `${created.booking_reference} created.` });
      setSelectedBookingId(created.id);
      setPage(1);
      setFilters((current) => ({
        ...current,
        search: "",
        status: "",
        date_from: nextScope === "today" ? todayIso() : addDaysIso(1),
        date_to: nextScope === "today" ? todayIso() : "",
        date_scope: nextScope,
      }));
      closeCreateModal();
      await loadFunctions();
    } catch (err) {
      setModalMessage({ type: "error", text: err instanceof Error ? err.message : "Function could not be created." });
    }
  };

  const saveFunction = async (booking: Booking) => {
    const edit = editFor(booking);
    const guestCount = Number(edit.guest_count);
    const durationMinutes = minutesBetween(edit.time, edit.end_time);
    setMessage(null);

    if (!edit.date || !edit.time || !edit.end_time || !Number.isFinite(guestCount) || guestCount < 1) {
      setMessage({ type: "error", text: "Enter a valid date, time, and guest count." });
      return;
    }

    if (!Number.isFinite(durationMinutes) || durationMinutes < 120) {
      setMessage({ type: "error", text: "Function time must be at least 2 hours." });
      return;
    }

    if (["approved", "confirmed"].includes(edit.status) && edit.assigned_area_ids.length === 0) {
      setMessage({ type: "error", text: "Select at least one function area before approving." });
      return;
    }

    try {
      const response = await apiFetch<{ item: Booking }>(`functions/${booking.id}`, {
        method: "PUT",
        ...toJsonBody({
          date: edit.date,
          time: edit.time,
          duration_minutes: durationMinutes,
          guest_count: guestCount,
          event_type: edit.event_type.trim(),
          preferred_area_id: edit.preferred_area_id || null,
          status: edit.status,
          assigned_area_ids: edit.assigned_area_ids.map(Number),
          assigned_area_id: edit.assigned_area_ids[0] || null,
          staff_notes: edit.staff_notes,
        }),
      });

      setMessage({ type: "success", text: `${booking.booking_reference} updated.` });
      const prompt = customerNoticeForStatusChange(booking.status, edit.status, response.item);
      setEdits((current) => {
        const next = { ...current };
        delete next[booking.id];
        return next;
      });
      await loadFunctions();
      if (prompt) {
        setNotifyPrompt(prompt);
      }
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Function could not be updated." });
    }
  };

  if ((!data || !meta) && message?.type === "error") {
    return <FormMessage type="error">{message.text}</FormMessage>;
  }

  if (!data || !meta) {
    return <LoadingState label="Loading functions" />;
  }

  const selectedEdit = selectedBooking ? editFor(selectedBooking) : null;

  return (
    <>
      {notifyPrompt ? (
        <CustomerNotifyPrompt
          booking={notifyPrompt.booking}
          purpose={notifyPrompt.purpose}
          message={notifyPrompt.message}
          onDismiss={() => setNotifyPrompt(null)}
          onDraft={openReplyFromPrompt}
        />
      ) : null}

      {replyTarget ? (
        <AiReplyComposer
          booking={replyTarget}
          onLogged={loadFunctions}
          openRequest={replyOpenRequest}
          buttonClassName="hidden"
        />
      ) : null}

      {isCreateOpen ? (
        <div
          className="fixed inset-0 z-999999 flex items-center justify-center overflow-y-auto bg-black/40 px-4 py-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-function-title"
        >
          <div className="w-full max-w-5xl rounded-2xl border border-gray-200 bg-white shadow-theme-xl dark:border-gray-800 dark:bg-gray-dark">
            <div className="flex items-center justify-between gap-4 border-b border-gray-200 px-5 py-3 dark:border-gray-800">
              <h2 id="create-function-title" className="text-base font-semibold text-gray-900 dark:text-white/90">
                Create function
              </h2>
              <button
                type="button"
                onClick={closeCreateModal}
                className="flex size-8 items-center justify-center rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-white/5"
                aria-label="Close create function modal"
              >
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={createFunction} className="max-h-[calc(100vh-8rem)] overflow-y-auto p-4">
              {modalMessage ? (
                <div className="mb-4">
                  <FormMessage type={modalMessage.type}>{modalMessage.text}</FormMessage>
                </div>
              ) : null}

              <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
                <section className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <FieldLabel htmlFor="create-function-name">Name</FieldLabel>
                      <input
                        id="create-function-name"
                        className={inputClass}
                        required
                        value={createForm.name}
                        onChange={(event) => updateCreateForm("name", event.target.value)}
                      />
                    </div>
                    <div>
                      <FieldLabel htmlFor="create-function-phone">Phone</FieldLabel>
                      <input
                        id="create-function-phone"
                        className={inputClass}
                        required
                        value={createForm.phone}
                        onChange={(event) => updateCreateForm("phone", event.target.value)}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <FieldLabel htmlFor="create-function-email">Email</FieldLabel>
                      <input
                        id="create-function-email"
                        type="email"
                        className={inputClass}
                        required
                        value={createForm.email}
                        onChange={(event) => updateCreateForm("email", event.target.value)}
                      />
                    </div>
                    <div>
                      <FieldLabel htmlFor="create-function-date">Date</FieldLabel>
                      <SingleDatePicker
                        id="create-function-date"
                        required
                        value={createForm.date}
                        onChange={(value) => updateCreateForm("date", value)}
                      />
                    </div>
                    <div>
                      <FieldLabel htmlFor="create-function-time">Time</FieldLabel>
                      <input
                        id="create-function-time"
                        type="time"
                        step="1800"
                        className={inputClass}
                        required
                        value={createForm.time}
                        onChange={(event) => updateCreateForm("time", event.target.value)}
                      />
                    </div>
                    <div>
                      <FieldLabel htmlFor="create-function-duration">Duration</FieldLabel>
                      <SelectInput
                        id="create-function-duration"
                        value={createForm.duration_minutes}
                        onChange={(value) => updateCreateForm("duration_minutes", value)}
                        options={[
                          { value: "120", label: "2 hours" },
                          { value: "180", label: "3 hours" },
                          { value: "240", label: "4 hours" },
                          { value: "300", label: "5 hours" },
                        ]}
                      />
                    </div>
                    <div>
                      <FieldLabel htmlFor="create-function-guests">Guests</FieldLabel>
                      <input
                        id="create-function-guests"
                        type="number"
                        min="8"
                        className={inputClass}
                        required
                        value={createForm.guest_count}
                        onChange={(event) => updateCreateForm("guest_count", event.target.value)}
                      />
                    </div>
                    <div>
                      <FieldLabel htmlFor="create-function-event-type">Event type</FieldLabel>
                      <input
                        id="create-function-event-type"
                        className={inputClass}
                        required
                        value={createForm.event_type}
                        onChange={(event) => updateCreateForm("event_type", event.target.value)}
                      />
                    </div>
                    <div>
                      <FieldLabel htmlFor="create-function-status">Status</FieldLabel>
                      <SelectInput
                        id="create-function-status"
                        value={createForm.status}
                        onChange={(value) => updateCreateForm("status", value)}
                        options={functionStatuses.map((status) => ({
                          value: status,
                          label: statusLabel(status),
                        }))}
                      />
                    </div>
                  </div>
                </section>

                <section className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                  <div>
                    <FieldLabel htmlFor="create-function-areas">Areas</FieldLabel>
                    <div id="create-function-areas">
                      <FunctionAreaPicker
                        areas={meta.function_areas}
                        selectedIds={createForm.assigned_area_ids}
                        onChange={(ids) => updateCreateForm("assigned_area_ids", ids)}
                      />
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div>
                      <FieldLabel htmlFor="create-function-notes">Guest note</FieldLabel>
                      <textarea
                        id="create-function-notes"
                        className={`${textareaClass} min-h-28`}
                        value={createForm.notes}
                        onChange={(event) => updateCreateForm("notes", event.target.value)}
                      />
                    </div>
                    <div>
                      <FieldLabel htmlFor="create-function-staff-notes">Staff note</FieldLabel>
                      <textarea
                        id="create-function-staff-notes"
                        className={`${textareaClass} min-h-28`}
                        value={createForm.staff_notes}
                        onChange={(event) => updateCreateForm("staff_notes", event.target.value)}
                      />
                    </div>
                  </div>
                </section>
              </div>

              <div className="mt-4 flex flex-col-reverse gap-2 border-t border-gray-100 pt-3 sm:flex-row sm:justify-end dark:border-gray-800">
                <button
                  type="button"
                  onClick={closeCreateModal}
                  className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600"
                >
                  <Plus className="size-4" />
                  Create function
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex w-fit rounded-xl bg-gray-100 p-1 dark:bg-gray-800">
          {dateScopeTabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => updateDateScope(tab.value)}
              className={`h-10 rounded-lg px-4 text-sm font-medium transition ${
                filters.date_scope === tab.value
                  ? "bg-white text-brand-500 shadow-theme-xs dark:bg-gray-900 dark:text-brand-400"
                  : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex h-10 w-fit items-center gap-2 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600"
        >
          <Plus className="size-4" />
          Create function
        </button>
      </div>

      {message ? (
        <div className="mt-4">
          <FormMessage type={message.type}>{message.text}</FormMessage>
        </div>
      ) : null}

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(360px,0.85fr)_minmax(0,1.45fr)]">
        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-800">
            <p className="text-base font-semibold text-gray-900 dark:text-white/90">Requests</p>
            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
              {data.items.length} shown
            </span>
          </div>

          <div className="max-h-[calc(100vh-22rem)] min-h-[420px] overflow-y-auto">
            {data.items.length === 0 ? (
              <div className="flex h-60 items-center justify-center px-6 text-center text-sm font-medium text-gray-500">
                No functions found.
              </div>
            ) : (
              data.items.map((booking) => {
                const isSelected = selectedBooking?.id === booking.id;

                return (
                  <button
                    key={booking.id}
                    type="button"
                    onClick={() => setSelectedBookingId(booking.id)}
                    className={`block w-full border-b border-gray-100 px-4 py-4 text-left transition last:border-b-0 dark:border-gray-800 ${
                      isSelected
                        ? "bg-brand-50/80 shadow-[inset_4px_0_0_#124734] dark:bg-brand-500/10"
                        : "bg-white hover:bg-gray-50 dark:bg-transparent dark:hover:bg-white/[0.04]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white/90">{booking.customer_name}</p>
                        <p className="mt-1 text-xs font-medium text-gray-500 dark:text-gray-400">{booking.booking_reference}</p>
                      </div>
                      <StatusBadge status={booking.status} />
                    </div>

                    <div className="mt-3 grid gap-2 text-sm text-gray-600 dark:text-gray-400">
                      <span className="inline-flex items-center gap-2">
                        <CalendarDays className="size-4 text-gray-400" />
                        {formatDate(booking.booking_date)}
                      </span>
                      <span className="inline-flex items-center gap-2">
                        <Clock className="size-4 text-gray-400" />
                        {formatTime(booking.start_time)} - {formatTime(booking.end_time)}
                      </span>
                      <span className="inline-flex items-center gap-2">
                        <Users className="size-4 text-gray-400" />
                        {booking.guest_count} guests
                      </span>
                      <span className="inline-flex items-center gap-2">
                        <MapPin className="size-4 text-gray-400" />
                        {assignedAreaLabel(booking)}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
            <span>
              Page {data.meta.page} of {Math.max(data.meta.total_pages, 1)}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((current) => current - 1)}
                className="inline-flex size-9 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
                aria-label="Previous page"
              >
                <ChevronLeft className="size-4" />
              </button>
              <button
                type="button"
                disabled={page >= data.meta.total_pages}
                onClick={() => setPage((current) => current + 1)}
                className="inline-flex size-9 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
                aria-label="Next page"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03] xl:sticky xl:top-24">
          {!selectedBooking || !selectedEdit ? (
            <div className="flex min-h-[520px] items-center justify-center px-6 text-sm font-medium text-gray-500">
              No function selected.
            </div>
          ) : (
            <div>
              <div className="flex flex-col gap-4 border-b border-gray-200 px-5 py-4 dark:border-gray-800 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white/90">
                      {selectedBooking.customer_name}
                    </h2>
                    <StatusBadge status={selectedBooking.status} />
                  </div>
                  <p className="mt-1 text-sm font-medium text-gray-500 dark:text-gray-400">
                    {selectedBooking.booking_reference}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <AiReplyComposer booking={selectedBooking} onLogged={loadFunctions} />
                  <button
                    type="button"
                    onClick={() => saveFunction(selectedBooking)}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600"
                  >
                    <Save className="size-4" />
                    Save changes
                  </button>
                </div>
              </div>

              <div className="max-h-[calc(100vh-16rem)] overflow-y-auto">
                <div className="border-b border-gray-100 px-5 py-5 dark:border-gray-800">
                  <h3 className={detailSectionTitleClass}>Details</h3>

                  <div className="mt-5 grid gap-x-5 gap-y-5 lg:grid-cols-2">
                    <div>
                      <label htmlFor="function-detail-date" className={detailLabelClass}>
                        Date
                      </label>
                      <SingleDatePicker
                        id="function-detail-date"
                        value={selectedEdit.date}
                        required
                        onChange={(value) => updateEdit(selectedBooking, { date: value })}
                      />
                    </div>

                    <div>
                      <label htmlFor="function-detail-time" className={detailLabelClass}>
                        Time
                      </label>
                      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                        <input
                          id="function-detail-time"
                          type="time"
                          step="900"
                          required
                          aria-label="Start time"
                          className={inputClass}
                          value={selectedEdit.time}
                          onChange={(event) => updateEdit(selectedBooking, { time: event.target.value })}
                        />
                        <span className="text-sm font-medium text-gray-400 dark:text-gray-500">to</span>
                        <input
                          type="time"
                          step="900"
                          required
                          aria-label="End time"
                          className={inputClass}
                          value={selectedEdit.end_time}
                          onChange={(event) => updateEdit(selectedBooking, { end_time: event.target.value })}
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="function-detail-guests" className={detailLabelClass}>
                        Guests
                      </label>
                      <input
                        id="function-detail-guests"
                        type="number"
                        min="1"
                        className={inputClass}
                        value={selectedEdit.guest_count}
                        onChange={(event) => updateEdit(selectedBooking, { guest_count: event.target.value })}
                      />
                    </div>

                    <div>
                      <label htmlFor="function-detail-event" className={detailLabelClass}>
                        Event
                      </label>
                      <input
                        id="function-detail-event"
                        className={inputClass}
                        value={selectedEdit.event_type}
                        onChange={(event) => updateEdit(selectedBooking, { event_type: event.target.value })}
                      />
                    </div>

                    <div>
                      <label htmlFor="function-detail-preferred" className={detailLabelClass}>
                        Preferred
                      </label>
                      <SelectInput
                        id="function-detail-preferred"
                        value={selectedEdit.preferred_area_id}
                        onChange={(value) => updateEdit(selectedBooking, { preferred_area_id: value })}
                        options={[
                          { value: "", label: "-" },
                          ...meta.function_areas.map((area) => ({ value: String(area.id), label: area.name })),
                        ]}
                      />
                    </div>
                  </div>
                </div>

                <div className="grid gap-6 border-b border-gray-100 px-5 py-5 dark:border-gray-800 lg:grid-cols-[0.8fr_1.2fr]">
                  <div className="space-y-4">
                    <div>
                      <FieldLabel htmlFor="function-detail-status">Status</FieldLabel>
                      <SelectInput
                        id="function-detail-status"
                        value={selectedEdit.status}
                        onChange={(value) => updateEdit(selectedBooking, { status: value })}
                        className="max-w-[220px]"
                        menuClassName="min-w-[220px]"
                        options={functionStatuses.map((status) => ({
                          value: status,
                          label: statusLabel(status),
                        }))}
                      />
                    </div>

                    <div className="border-t border-gray-100 pt-4 dark:border-gray-800">
                      <h3 className={detailSectionTitleClass}>Contact</h3>
                      <div className="mt-3 space-y-3 text-sm">
                        <p className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                          <Mail className="size-4 text-gray-400" />
                          {selectedBooking.customer_email}
                        </p>
                        <p className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                          <Phone className="size-4 text-gray-400" />
                          {selectedBooking.customer_phone}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className={detailSectionTitleClass}>Areas</h3>
                    <div id="function-detail-areas" className="mt-4">
                      <FunctionAreaPicker
                        areas={meta.function_areas}
                        selectedIds={selectedEdit.assigned_area_ids}
                        onChange={(ids) => updateEdit(selectedBooking, { assigned_area_ids: ids })}
                      />
                    </div>
                  </div>
                </div>

                <div className="grid gap-5 px-5 py-5 lg:grid-cols-2">
                  <div>
                    <FieldLabel htmlFor="function-notes">Guest note</FieldLabel>
                    <div
                      id="function-notes"
                      className="min-h-36 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-300"
                    >
                      {selectedBooking.notes || "-"}
                    </div>
                  </div>
                  <div>
                    <FieldLabel htmlFor="function-staff-notes">Staff note</FieldLabel>
                    <textarea
                      id="function-staff-notes"
                      className={`${textareaClass} min-h-36`}
                      value={selectedEdit.staff_notes}
                      onChange={(event) => updateEdit(selectedBooking, { staff_notes: event.target.value })}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
