import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  CalendarClock,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { apiFetch, toJsonBody } from "../lib/api";
import { bookingIconOptions, getBookingIcon } from "../lib/bookingTypeIcons";
import type { Area, BookingCustomField, BookingType, BookingTypeSchedule, MetaPayload, TableRecord } from "../types";
import { FieldLabel, MultiSelectInput, SelectInput, ToastMessage, inputClass, textareaClass } from "../components/resrva/FormField";
import { LoadingState } from "../components/resrva/LoadingState";
import { PageHeader } from "../components/resrva/PageHeader";
import { Modal } from "../components/ui/modal";

const dayLabels = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const advanceNoticeOptions = [
  { value: "0", label: "No minimum" },
  { value: "30", label: "30 minutes" },
  { value: "60", label: "1 hour" },
  { value: "120", label: "2 hours" },
  { value: "240", label: "4 hours" },
  { value: "720", label: "12 hours" },
  { value: "1440", label: "1 day" },
  { value: "2880", label: "2 days" },
  { value: "10080", label: "1 week" },
];

type RecurrenceType = BookingTypeSchedule["recurrence_type"];
type BookingTypePanel = "overview" | "setup" | "schedule" | "areas" | "capacity" | "questions" | "upcoming" | "additional";

const panelLabels: Record<BookingTypePanel, string> = {
  overview: "Overview",
  setup: "Setup",
  schedule: "Schedule",
  areas: "Areas",
  capacity: "Capacity & Rules",
  questions: "Custom Questions",
  upcoming: "Upcoming",
  additional: "Additional Settings",
};

type CustomFieldForm = {
  label: string;
  field_type: BookingCustomField["field_type"];
  is_required: boolean;
  options: string;
};

type BookingTypeForm = {
  id?: number;
  template: "dining" | "function" | "trivia" | "event" | "custom";
  name: string;
  category: BookingType["category"];
  description: string;
  customer_button_label: string;
  internal_label: string;
  is_active: boolean;
  display_to_customers: boolean;
  colour: string;
  icon: string;
  capacity_mode: BookingType["capacity_mode"];
  min_guests: string;
  max_guests: string;
  max_capacity: string;
  max_bookings: string;
  requires_approval: boolean;
  auto_confirm: boolean;
  allow_waitlist: boolean;
  booking_cutoff_minutes: string;
  booking_window_days: string;
  cancellation_cutoff_minutes: string;
  sort_order: string;
  schedule: {
    recurrence_type: RecurrenceType;
    day_of_weeks: string[];
    day_of_month: string;
    custom_dates: string[];
    reserved_area_ids: string[];
    start_time: string;
    end_time: string;
    arrival_time: string;
    duration_minutes: string;
  };
  custom_fields: CustomFieldForm[];
};

type BookingTypesPayload = {
  items: BookingType[];
};

type DeleteBookingTypePayload = {
  ok: boolean;
  mode: "deleted" | "archived";
  bookings: number;
};

type TablesPayload = {
  areas: Area[];
  tables: TableRecord[];
};

const templateForms: Record<BookingTypeForm["template"], BookingTypeForm> = {
  dining: {
    template: "dining",
    name: "Dinner",
    category: "dining",
    description: "Standard table booking service.",
    customer_button_label: "Dinner",
    internal_label: "Dinner",
    is_active: true,
    display_to_customers: true,
    colour: "#276749",
    icon: "utensils",
    capacity_mode: "tables",
    min_guests: "8",
    max_guests: "29",
    max_capacity: "",
    max_bookings: "",
    requires_approval: false,
    auto_confirm: true,
    allow_waitlist: false,
    booking_cutoff_minutes: "0",
    booking_window_days: "90",
    cancellation_cutoff_minutes: "0",
    sort_order: "50",
    schedule: {
      recurrence_type: "none",
      day_of_weeks: [],
      day_of_month: "",
      custom_dates: [],
      reserved_area_ids: [],
      start_time: "",
      end_time: "",
      arrival_time: "",
      duration_minutes: "120",
    },
    custom_fields: [],
  },
  function: {
    template: "function",
    name: "Private Event",
    category: "function",
    description: "Larger group or private event enquiry.",
    customer_button_label: "Function Enquiry",
    internal_label: "Functions",
    is_active: true,
    display_to_customers: true,
    colour: "#2f80ed",
    icon: "wine",
    capacity_mode: "area",
    min_guests: "20",
    max_guests: "200",
    max_capacity: "",
    max_bookings: "",
    requires_approval: true,
    auto_confirm: false,
    allow_waitlist: false,
    booking_cutoff_minutes: "0",
    booking_window_days: "90",
    cancellation_cutoff_minutes: "0",
    sort_order: "60",
    schedule: {
      recurrence_type: "none",
      day_of_weeks: [],
      day_of_month: "",
      custom_dates: [],
      reserved_area_ids: [],
      start_time: "",
      end_time: "",
      arrival_time: "",
      duration_minutes: "180",
    },
    custom_fields: [],
  },
  trivia: {
    template: "trivia",
    name: "Trivia Night",
    category: "event",
    description: "Join us every Wednesday for pub trivia.",
    customer_button_label: "Book Trivia",
    internal_label: "Trivia",
    is_active: true,
    display_to_customers: true,
    colour: "#4f8f5d",
    icon: "help-circle",
    capacity_mode: "guests",
    min_guests: "2",
    max_guests: "10",
    max_capacity: "80",
    max_bookings: "",
    requires_approval: false,
    auto_confirm: true,
    allow_waitlist: true,
    booking_cutoff_minutes: "120",
    booking_window_days: "90",
    cancellation_cutoff_minutes: "240",
    sort_order: "40",
    schedule: {
      recurrence_type: "weekly",
      day_of_weeks: ["3"],
      day_of_month: "",
      custom_dates: [],
      reserved_area_ids: [],
      start_time: "19:00",
      end_time: "21:30",
      arrival_time: "18:30",
      duration_minutes: "150",
    },
    custom_fields: [{ label: "Team name", field_type: "text", is_required: true, options: "" }],
  },
  event: {
    template: "event",
    name: "",
    category: "event",
    description: "",
    customer_button_label: "",
    internal_label: "",
    is_active: true,
    display_to_customers: true,
    colour: "#7a5af8",
    icon: "calendar",
    capacity_mode: "guests",
    min_guests: "1",
    max_guests: "",
    max_capacity: "",
    max_bookings: "",
    requires_approval: false,
    auto_confirm: true,
    allow_waitlist: false,
    booking_cutoff_minutes: "120",
    booking_window_days: "90",
    cancellation_cutoff_minutes: "240",
    sort_order: "70",
    schedule: {
      recurrence_type: "weekly",
      day_of_weeks: ["5"],
      day_of_month: "",
      custom_dates: [],
      reserved_area_ids: [],
      start_time: "19:00",
      end_time: "21:00",
      arrival_time: "18:30",
      duration_minutes: "120",
    },
    custom_fields: [],
  },
  custom: {
    template: "custom",
    name: "Custom Booking Type",
    category: "custom",
    description: "",
    customer_button_label: "Book",
    internal_label: "Custom",
    is_active: true,
    display_to_customers: true,
    colour: "#276749",
    icon: "calendar",
    capacity_mode: "guests",
    min_guests: "1",
    max_guests: "",
    max_capacity: "",
    max_bookings: "",
    requires_approval: false,
    auto_confirm: true,
    allow_waitlist: false,
    booking_cutoff_minutes: "0",
    booking_window_days: "90",
    cancellation_cutoff_minutes: "0",
    sort_order: "80",
    schedule: {
      recurrence_type: "none",
      day_of_weeks: [],
      day_of_month: "",
      custom_dates: [],
      reserved_area_ids: [],
      start_time: "",
      end_time: "",
      arrival_time: "",
      duration_minutes: "120",
    },
    custom_fields: [],
  },
};

function cloneTemplate(template: BookingTypeForm["template"]): BookingTypeForm {
  return JSON.parse(JSON.stringify(templateForms[template])) as BookingTypeForm;
}

function truthy(value: number | boolean | undefined | null): boolean {
  return value === true || Number(value) === 1;
}

function formFromBookingType(type: BookingType): BookingTypeForm {
  const schedule = type.schedule;
  const scheduledDays =
    schedule?.day_of_weeks && schedule.day_of_weeks.length > 0
      ? schedule.day_of_weeks
      : schedule?.day_of_week === null || schedule?.day_of_week === undefined
        ? []
        : [schedule.day_of_week];

  return {
    id: type.id,
    template: type.slug === "trivia-night" ? "trivia" : type.category === "event" ? "event" : type.category,
    name: type.name,
    category: type.category,
    description: type.description || "",
    customer_button_label: type.customer_button_label || type.name,
    internal_label: type.internal_label || type.name,
    is_active: truthy(type.is_active),
    display_to_customers: truthy(type.display_to_customers),
    colour: type.colour || "#276749",
    icon: type.icon || "calendar",
    capacity_mode: type.capacity_mode,
    min_guests: String(type.min_guests ?? 1),
    max_guests: type.max_guests ? String(type.max_guests) : "",
    max_capacity: type.max_capacity ? String(type.max_capacity) : "",
    max_bookings: type.max_bookings ? String(type.max_bookings) : "",
    requires_approval: truthy(type.requires_approval),
    auto_confirm: truthy(type.requires_approval) ? false : truthy(type.auto_confirm),
    allow_waitlist: truthy(type.allow_waitlist),
    booking_cutoff_minutes: String(type.booking_cutoff_minutes ?? 0),
    booking_window_days: String(type.booking_window_days ?? 90),
    cancellation_cutoff_minutes: String(type.cancellation_cutoff_minutes ?? 0),
    sort_order: String(type.sort_order ?? 0),
    schedule: {
      recurrence_type: schedule?.recurrence_type || "none",
      day_of_weeks: scheduledDays.map((day) => String(day)),
      day_of_month: schedule?.day_of_month ? String(schedule.day_of_month) : "",
      custom_dates: [...(schedule?.custom_dates || [])].sort(),
      reserved_area_ids: (schedule?.reserved_area_ids || []).map((areaId) => String(areaId)),
      start_time: schedule?.start_time?.slice(0, 5) || "",
      end_time: schedule?.end_time?.slice(0, 5) || "",
      arrival_time: schedule?.arrival_time?.slice(0, 5) || "",
      duration_minutes: String(schedule?.duration_minutes || 120),
    },
    custom_fields: (type.custom_fields || []).map((field) => ({
      label: field.label,
      field_type: field.field_type,
      is_required: truthy(field.is_required),
      options: (field.options || []).join("\n"),
    })),
  };
}

function payloadFromForm(form: BookingTypeForm) {
  return {
    name: form.name.trim(),
    category: form.category,
    description: form.description.trim(),
    customer_button_label: form.customer_button_label.trim() || form.name.trim(),
    internal_label: form.internal_label.trim() || form.name.trim(),
    is_active: form.is_active,
    display_to_customers: form.display_to_customers,
    colour: form.colour,
    icon: form.icon.trim() || "calendar",
    capacity_mode: form.capacity_mode,
    min_guests: Number(form.min_guests || 1),
    max_guests: form.max_guests ? Number(form.max_guests) : null,
    max_capacity: form.max_capacity ? Number(form.max_capacity) : null,
    max_bookings: form.max_bookings ? Number(form.max_bookings) : null,
    requires_approval: !form.auto_confirm,
    auto_confirm: form.auto_confirm,
    allow_waitlist: form.allow_waitlist,
    booking_cutoff_minutes: Number(form.booking_cutoff_minutes || 0),
    booking_window_days: Number(form.booking_window_days || 90),
    cancellation_cutoff_minutes: Number(form.cancellation_cutoff_minutes || 0),
    sort_order: Number(form.sort_order || 0),
    schedule: {
      recurrence_type: form.schedule.recurrence_type,
      day_of_week: form.schedule.day_of_weeks[0] === undefined ? null : Number(form.schedule.day_of_weeks[0]),
      day_of_weeks: form.schedule.day_of_weeks.map((day) => Number(day)),
      day_of_month: form.schedule.day_of_month ? Number(form.schedule.day_of_month) : null,
      custom_dates: form.schedule.recurrence_type === "none" ? form.schedule.custom_dates.slice(0, 1) : form.schedule.custom_dates,
      reserved_area_ids: ["event", "function"].includes(form.category) ? form.schedule.reserved_area_ids.map((areaId) => Number(areaId)) : [],
      start_time: ["dining", "event"].includes(form.category) ? form.schedule.start_time || null : null,
      end_time: ["dining", "event"].includes(form.category) ? form.schedule.end_time || null : null,
      arrival_time: form.schedule.arrival_time || null,
      duration_minutes: Number(form.schedule.duration_minutes || 120),
    },
    custom_fields: form.custom_fields
      .filter((field) => field.label.trim())
      .slice(0, 5)
      .map((field) => ({
        label: field.label.trim(),
        field_type: field.field_type,
        is_required: field.is_required,
        options: field.options
          .split("\n")
          .map((option) => option.trim())
          .filter(Boolean),
      })),
  };
}

function formatSessionParts(session: NonNullable<BookingType["upcoming_sessions"]>[number]) {
  const date = new Date(`${session.date}T00:00:00`);
  const label = date.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
  const start = session.start_time.slice(0, 5);
  const end = session.end_time ? session.end_time.slice(0, 5) : "";
  const time = end ? `${start} - ${end}` : start;

  return { label, time };
}

function selectedDaySummary(days: string[]): string {
  const labels = days
    .map((day) => dayLabels[Number(day)])
    .filter(Boolean);

  if (labels.length === 0) {
    return "Select days";
  }
  if (labels.length === dayLabels.length) {
    return "Every day";
  }

  return labels.map((label) => label.slice(0, 3)).join(", ");
}

function SettingsRow({
  title,
  description,
  detail,
  leadingIcon,
  onClick,
}: {
  title: string;
  description?: string;
  detail?: string;
  leadingIcon?: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white p-4 text-left transition hover:border-gray-300 hover:bg-gray-50 dark:border-gray-800 dark:bg-white/[0.03] dark:hover:bg-white/[0.06]"
    >
      <span className="flex min-w-0 items-center gap-3">
        {leadingIcon ? (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-gray-600">
            {leadingIcon}
          </span>
        ) : null}
        <span className="min-w-0">
          <span className="block truncate text-base font-semibold text-gray-900">{title}</span>
          {description ? <span className="mt-1 block text-sm text-gray-500">{description}</span> : null}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-3 text-sm font-medium text-gray-500">
        {detail ? <span className="hidden max-w-xs truncate lg:block">{detail}</span> : null}
        <ChevronRight className="size-4 text-gray-400" />
      </span>
    </button>
  );
}

function isoFromDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function dateFromIso(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);

  return new Date(year, month - 1, day);
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function formatMonthLabel(date: Date): string {
  return date.toLocaleDateString("en-AU", { month: "long", year: "numeric" });
}

function buildCalendarMonth(monthDate: Date) {
  const first = startOfMonth(monthDate);
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - first.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);

    return {
      iso: isoFromDate(date),
      day: date.getDate(),
      isCurrentMonth: date.getMonth() === first.getMonth(),
    };
  });
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex h-11 w-full min-w-0 items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 text-left text-sm font-medium text-gray-700 transition hover:border-gray-300 hover:bg-gray-50 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-200 dark:hover:bg-white/[0.06]"
      role="switch"
      aria-checked={checked}
    >
      <span className="min-w-0 whitespace-nowrap leading-5">{label}</span>
      <span
        aria-hidden="true"
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          checked ? "bg-brand-500" : "bg-gray-300 dark:bg-gray-700"
        }`}
      >
        <span
          className={`absolute left-0.5 top-1/2 size-5 -translate-y-1/2 rounded-full bg-white shadow-sm transition-transform ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </span>
    </button>
  );
}

function AreaPicker({
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

  if (!areas.length) {
    return (
      <div className="rounded-lg border border-dashed border-gray-200 px-3 py-4 text-sm text-gray-500">
        No active areas found.
      </div>
    );
  }

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
            className={`h-10 rounded-lg border px-3 text-left text-sm font-medium transition ${
              isSelected
                ? "border-brand-500 bg-brand-50 text-brand-700"
                : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            {area.name}
          </button>
        );
      })}
    </div>
  );
}

export default function BookingTypesPage() {
  const [items, setItems] = useState<BookingType[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [tables, setTables] = useState<TableRecord[]>([]);
  const [selectedId, setSelectedId] = useState<number | "new" | null>(null);
  const [form, setForm] = useState<BookingTypeForm>(() => cloneTemplate("event"));
  const [customCalendarMonth, setCustomCalendarMonth] = useState(() => startOfMonth(new Date()));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success" | "info"; text: string } | null>(null);
  const [activePanel, setActivePanel] = useState<BookingTypePanel>("overview");
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  const selectedItem = useMemo(
    () => selectedId === null ? null : items.find((item) => Number(item.id) === Number(selectedId)) || null,
    [items, selectedId],
  );
  const customCalendarDays = useMemo(() => buildCalendarMonth(customCalendarMonth), [customCalendarMonth]);
  const reservedAreaStats = useMemo(() => {
    const selectedAreas = new Set(form.schedule.reserved_area_ids);
    const selectedTables = tables.filter(
      (table) => selectedAreas.has(String(table.area_id)) && (table.active === true || Number(table.active) === 1),
    );

    return {
      tableCount: selectedTables.length,
      guestCapacity: selectedTables.reduce((total, table) => total + Number(table.capacity || 0), 0),
    };
  }, [form.schedule.reserved_area_ids, tables]);

  const loadBookingTypes = async () => {
    const [payload, metaPayload, tablesPayload] = await Promise.all([
      apiFetch<BookingTypesPayload>("booking-types"),
      apiFetch<MetaPayload>("meta"),
      apiFetch<TablesPayload>("tables"),
    ]);
    setItems(payload.items);
    setAreas(metaPayload.areas || []);
    setTables(tablesPayload.tables || []);
    setLoading(false);
  };

  useEffect(() => {
    loadBookingTypes().catch((error) => {
      setLoading(false);
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Booking types failed to load." });
    });
  }, []);

  useEffect(() => {
    setIconPickerOpen(false);
  }, [activePanel, selectedId]);

  const updateForm = <K extends keyof BookingTypeForm>(field: K, value: BookingTypeForm[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const updateSchedule = <K extends keyof BookingTypeForm["schedule"]>(field: K, value: BookingTypeForm["schedule"][K]) => {
    setForm((current) => ({ ...current, schedule: { ...current.schedule, [field]: value } }));
  };

  const updateAutoConfirmation = (checked: boolean) => {
    setForm((current) => ({
      ...current,
      auto_confirm: checked,
      requires_approval: !checked,
    }));
  };

  const chooseRecurrence = (recurrence_type: RecurrenceType) => {
    setForm((current) => ({
      ...current,
      schedule: {
        ...current.schedule,
        recurrence_type,
        day_of_month: recurrence_type === "monthly" && !current.schedule.day_of_month ? "1" : current.schedule.day_of_month,
        custom_dates: recurrence_type === "none" ? current.schedule.custom_dates.slice(0, 1) : current.schedule.custom_dates,
      },
    }));
  };

  const toggleCustomDate = (date: string) => {
    setForm((current) => ({
      ...current,
      schedule: {
        ...current.schedule,
        custom_dates:
          current.schedule.recurrence_type === "none"
            ? current.schedule.custom_dates.includes(date)
              ? []
              : [date]
            : current.schedule.custom_dates.includes(date)
              ? current.schedule.custom_dates.filter((value) => value !== date)
              : [...current.schedule.custom_dates, date].sort(),
      },
    }));
  };

  const removeCustomDate = (date: string) => {
    setForm((current) => ({
      ...current,
      schedule: {
        ...current.schedule,
        custom_dates: current.schedule.custom_dates.filter((value) => value !== date),
      },
    }));
  };

  const updateCustomField = <K extends keyof CustomFieldForm>(index: number, field: K, value: CustomFieldForm[K]) => {
    setForm((current) => ({
      ...current,
      custom_fields: current.custom_fields.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item,
      ),
    }));
  };

  const startNewBookingType = (template: BookingTypeForm["template"]) => {
    setSelectedId("new");
    setForm(cloneTemplate(template));
    setCustomCalendarMonth(startOfMonth(new Date()));
    setMessage(null);
    setActivePanel("overview");
  };

  const showTypeList = () => {
    setSelectedId(null);
    setActivePanel("overview");
    setMessage(null);
  };

  const chooseBookingType = (type: BookingType) => {
    const nextForm = formFromBookingType(type);
    setSelectedId(type.id);
    setForm(nextForm);
    setCustomCalendarMonth(
      nextForm.schedule.custom_dates[0] ? startOfMonth(dateFromIso(nextForm.schedule.custom_dates[0])) : startOfMonth(new Date()),
    );
    setMessage(null);
    setActivePanel("overview");
  };

  const addCustomField = () => {
    if (form.custom_fields.length >= 5) {
      setMessage({ type: "info", text: "This MVP supports up to five custom questions per booking type." });
      return;
    }

    setForm((current) => ({
      ...current,
      custom_fields: [...current.custom_fields, { label: "", field_type: "text", is_required: false, options: "" }],
    }));
  };

  const removeCustomField = (index: number) => {
    setForm((current) => ({
      ...current,
      custom_fields: current.custom_fields.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const saveBookingType = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const route = form.id ? `booking-types/${form.id}` : "booking-types";
      const method = form.id ? "PUT" : "POST";
      const payload = await apiFetch<{ item: BookingType }>(route, {
        method,
        ...toJsonBody(payloadFromForm(form)),
      });
      setMessage({ type: "success", text: `${payload.item.name} saved.` });
      setSelectedId(payload.item.id);
      const nextForm = formFromBookingType(payload.item);
      setForm(nextForm);
      setCustomCalendarMonth(
        nextForm.schedule.custom_dates[0] ? startOfMonth(dateFromIso(nextForm.schedule.custom_dates[0])) : customCalendarMonth,
      );
      await loadBookingTypes();
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Booking type could not be saved." });
    } finally {
      setSaving(false);
    }
  };

  const deleteBookingType = async () => {
    if (!form.id) {
      return;
    }

    const name = form.name.trim() || "this booking type";
    setSaving(true);
    setMessage(null);

    try {
      const result = await apiFetch<DeleteBookingTypePayload>(`booking-types/${form.id}`, {
        method: "DELETE",
      });
      setSelectedId(null);
      setActivePanel("overview");
      setForm(cloneTemplate("event"));
      setDeleteModalOpen(false);
      await loadBookingTypes();
      setMessage({
        type: "success",
        text:
          result.mode === "archived"
            ? `${name} has existing bookings, so it was archived and hidden from customers.`
            : `${name} deleted.`,
      });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Booking type could not be deleted." });
    } finally {
      setSaving(false);
    }
  };

  const currentTitle = form.name.trim() || "New booking type";
  const selectedIconValue = bookingIconOptions.some((option) => option.value === form.icon) ? form.icon : "calendar";
  const selectedIconOption = bookingIconOptions.find((option) => option.value === selectedIconValue) || bookingIconOptions[0];
  const SelectedIcon = selectedIconOption.Icon;
  const visiblePanels: Array<{
    id: Exclude<BookingTypePanel, "overview">;
    title: string;
  }> = [
    {
      id: "setup",
      title: "Setup",
    },
    ...(form.category === "event" || form.category === "dining"
      ? [
          {
            id: "schedule" as const,
            title: form.category === "dining" ? "Service Hours" : "Schedule",
          },
        ]
      : []),
    ...(["event", "function"].includes(form.category)
      ? [
          {
            id: "areas" as const,
            title: "Areas",
          },
        ]
      : []),
    {
      id: "capacity",
      title: "Capacity & Rules",
    },
    {
      id: "questions",
      title: "Custom Questions",
    },
    ...(form.category === "event"
      ? [
          {
            id: "upcoming" as const,
            title: "Upcoming",
          },
        ]
      : []),
    {
      id: "additional",
      title: "Additional Settings",
    },
  ];

  const renderSetupPanel = () => (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <FieldLabel htmlFor="name">Name</FieldLabel>
          <input id="name" required className={inputClass} value={form.name} onChange={(event) => updateForm("name", event.target.value)} />
        </div>
        <div>
          <FieldLabel htmlFor="category">Category</FieldLabel>
          <SelectInput
            id="category"
            value={form.category}
            onChange={(value) => updateForm("category", value as BookingType["category"])}
            options={[
              { value: "dining", label: "Dining" },
              { value: "event", label: "Event" },
              { value: "function", label: "Function" },
              { value: "custom", label: "Custom" },
            ]}
          />
        </div>
        <div>
          <FieldLabel htmlFor="button-label">Customer button label</FieldLabel>
          <input id="button-label" className={inputClass} value={form.customer_button_label} onChange={(event) => updateForm("customer_button_label", event.target.value)} />
        </div>
        <div>
          <FieldLabel htmlFor="internal-label">Internal label</FieldLabel>
          <input id="internal-label" className={inputClass} value={form.internal_label} onChange={(event) => updateForm("internal_label", event.target.value)} />
        </div>
        <div>
          <FieldLabel htmlFor="colour">Colour</FieldLabel>
          <input id="colour" type="color" className={`${inputClass} h-11 p-1`} value={form.colour} onChange={(event) => updateForm("colour", event.target.value)} />
        </div>
        <div className="lg:col-span-2">
          <FieldLabel htmlFor="icon-picker-button">Icon</FieldLabel>
          <div
            className="relative inline-block"
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setIconPickerOpen(false);
              }
            }}
          >
            <button
              id="icon-picker-button"
              type="button"
              aria-haspopup="listbox"
              aria-expanded={iconPickerOpen}
              aria-label={`Selected icon: ${selectedIconOption.label}`}
              onClick={() => setIconPickerOpen((open) => !open)}
              className="inline-flex h-11 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-gray-700 shadow-sm transition hover:bg-gray-50"
            >
              <SelectedIcon className="size-5" style={{ color: form.colour || undefined }} />
              <ChevronDown className={`size-4 text-gray-400 transition ${iconPickerOpen ? "rotate-180" : ""}`} />
            </button>
            {iconPickerOpen ? (
              <div
                role="listbox"
                aria-label="Booking type icons"
                className="absolute left-0 top-full z-20 mt-2 grid w-72 grid-cols-6 gap-1 rounded-xl border border-gray-200 bg-white p-2 shadow-lg"
              >
                {bookingIconOptions.map((option) => {
                  const selected = selectedIconValue === option.value;
                  const Icon = option.Icon;

                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      aria-label={option.label}
                      title={option.label}
                      onClick={() => {
                        updateForm("icon", option.value);
                        setIconPickerOpen(false);
                      }}
                      className={`flex size-10 items-center justify-center rounded-lg border transition ${
                        selected
                          ? "border-brand-500 bg-brand-50 text-brand-700"
                          : "border-transparent text-gray-600 hover:border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      <Icon className="size-5" />
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>
        <div className="lg:col-span-2">
          <FieldLabel htmlFor="description">Description</FieldLabel>
          <textarea id="description" className={textareaClass} value={form.description} onChange={(event) => updateForm("description", event.target.value)} />
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <ToggleRow label="Active" checked={form.is_active} onChange={(checked) => updateForm("is_active", checked)} />
        <ToggleRow label="Show online" checked={form.display_to_customers} onChange={(checked) => updateForm("display_to_customers", checked)} />
      </div>
    </section>
  );

  const renderSchedulePanel = () => {
    if (form.category === "dining") {
      return (
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <FieldLabel htmlFor="service-start">Start time</FieldLabel>
              <input
                id="service-start"
                type="time"
                className={inputClass}
                value={form.schedule.start_time}
                onChange={(event) => updateSchedule("start_time", event.target.value)}
              />
            </div>
            <div>
              <FieldLabel htmlFor="service-end">End time</FieldLabel>
              <input
                id="service-end"
                type="time"
                className={inputClass}
                value={form.schedule.end_time}
                onChange={(event) => updateSchedule("end_time", event.target.value)}
              />
            </div>
          </div>
        </section>
      );
    }

    if (form.category !== "event") {
      return (
        <section className="rounded-2xl border border-gray-200 bg-white p-5 text-sm text-gray-500 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          This booking type does not use a schedule.
        </section>
      );
    }

    return (
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="recurrence">Repeats</FieldLabel>
            <SelectInput
              id="recurrence"
              value={form.schedule.recurrence_type}
              onChange={(value) => chooseRecurrence(value as RecurrenceType)}
              options={[
                { value: "none", label: "No Repeat" },
                { value: "daily", label: "Daily" },
                { value: "weekly", label: "Weekly" },
                { value: "fortnightly", label: "Fortnightly" },
                { value: "monthly", label: "Monthly" },
                { value: "custom", label: "Custom dates" },
              ]}
            />
          </div>
          {["weekly", "fortnightly"].includes(form.schedule.recurrence_type) ? (
            <div>
              <FieldLabel htmlFor="schedule-days">Days</FieldLabel>
              <MultiSelectInput
                id="schedule-days"
                values={form.schedule.day_of_weeks}
                displayValue={selectedDaySummary(form.schedule.day_of_weeks)}
                placeholder="Select days"
                onChange={(values) => updateSchedule("day_of_weeks", values.sort((left, right) => Number(left) - Number(right)))}
                options={dayLabels.map((label, index) => ({
                  value: String(index),
                  label,
                }))}
              />
            </div>
          ) : null}
          {form.schedule.recurrence_type === "monthly" ? (
            <div>
              <FieldLabel htmlFor="month-day">Day of month</FieldLabel>
              <input
                id="month-day"
                type="number"
                min="1"
                max="31"
                className={inputClass}
                value={form.schedule.day_of_month}
                onChange={(event) => updateSchedule("day_of_month", event.target.value)}
              />
            </div>
          ) : null}
          {["none", "custom"].includes(form.schedule.recurrence_type) ? (
            <div className="sm:col-span-2">
              <FieldLabel htmlFor="custom-date-calendar">
                {form.schedule.recurrence_type === "none" ? "Event date" : "Custom dates"}
              </FieldLabel>
              <div id="custom-date-calendar" className="rounded-xl border border-gray-200 p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setCustomCalendarMonth((current) => addMonths(current, -1))}
                    className="inline-flex size-9 items-center justify-center rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50"
                    aria-label="Previous month"
                  >
                    <ChevronLeft className="size-4" />
                  </button>
                  <div className="text-sm font-semibold text-gray-900">{formatMonthLabel(customCalendarMonth)}</div>
                  <button
                    type="button"
                    onClick={() => setCustomCalendarMonth((current) => addMonths(current, 1))}
                    className="inline-flex size-9 items-center justify-center rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50"
                    aria-label="Next month"
                  >
                    <ChevronRight className="size-4" />
                  </button>
                </div>
                <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-gray-500">
                  {dayLabels.map((label) => (
                    <div key={label} className="py-1">
                      {label.slice(0, 3)}
                    </div>
                  ))}
                </div>
                <div className="mt-1 grid grid-cols-7 gap-1">
                  {customCalendarDays.map((day) => {
                    const selected = form.schedule.custom_dates.includes(day.iso);

                    return (
                      <button
                        key={day.iso}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => toggleCustomDate(day.iso)}
                        className={`aspect-square rounded-lg border text-sm font-medium transition ${
                          selected
                            ? "border-brand-500 bg-brand-600 text-white"
                            : day.isCurrentMonth
                              ? "border-transparent bg-white text-gray-800 hover:border-gray-300 hover:bg-gray-50"
                              : "border-transparent bg-white text-gray-300 hover:border-gray-200 hover:text-gray-500"
                        }`}
                      >
                        {day.day}
                      </button>
                    );
                  })}
                </div>
              </div>
              {form.schedule.custom_dates.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {(form.schedule.recurrence_type === "none" ? form.schedule.custom_dates.slice(0, 1) : form.schedule.custom_dates).map((date) => (
                    <span key={date} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                      {date}
                      <button type="button" className="text-gray-400 hover:text-error-600" onClick={() => removeCustomDate(date)} aria-label={`Remove ${date}`}>
                        <Trash2 className="size-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          <div>
            <FieldLabel htmlFor="arrival">Arrival time</FieldLabel>
            <input id="arrival" type="time" className={inputClass} value={form.schedule.arrival_time} onChange={(event) => updateSchedule("arrival_time", event.target.value)} />
          </div>
          <div>
            <FieldLabel htmlFor="start">Start time</FieldLabel>
            <input id="start" type="time" className={inputClass} value={form.schedule.start_time} onChange={(event) => updateSchedule("start_time", event.target.value)} />
          </div>
          <div>
            <FieldLabel htmlFor="event-end">End time</FieldLabel>
            <input id="event-end" type="time" className={inputClass} value={form.schedule.end_time} onChange={(event) => updateSchedule("end_time", event.target.value)} />
          </div>
          <div>
            <FieldLabel htmlFor="booking-duration">Booking duration</FieldLabel>
            <input
              id="booking-duration"
              type="number"
              min="15"
              step="15"
              className={inputClass}
              value={form.schedule.duration_minutes}
              onChange={(event) => updateSchedule("duration_minutes", event.target.value)}
            />
          </div>
        </div>
      </section>
    );
  };

  const renderAreasPanel = () => (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <FieldLabel htmlFor="reserved-areas">{form.category === "function" ? "Function areas" : "Reserved event areas"}</FieldLabel>
          <div id="reserved-areas">
            <AreaPicker
              areas={areas}
              selectedIds={form.schedule.reserved_area_ids}
              onChange={(ids) => updateSchedule("reserved_area_ids", ids)}
            />
          </div>
        </div>
        <div className="grid content-start gap-2 sm:grid-cols-2 lg:grid-cols-1">
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
            <p className="text-xs font-medium uppercase text-gray-500">Selected area seats</p>
            <p className="mt-1 text-lg font-semibold text-gray-900">{reservedAreaStats.guestCapacity} guests</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
            <p className="text-xs font-medium uppercase text-gray-500">Selected tables</p>
            <p className="mt-1 text-lg font-semibold text-gray-900">{reservedAreaStats.tableCount} tables</p>
          </div>
        </div>
      </div>
    </section>
  );

  const renderCapacityPanel = () => (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <FieldLabel htmlFor="max-capacity">Total guest limit</FieldLabel>
          <input
            id="max-capacity"
            type="number"
            min="1"
            placeholder="No limit"
            className={inputClass}
            value={form.max_capacity}
            onChange={(event) => updateForm("max_capacity", event.target.value)}
          />
        </div>
        <div>
          <FieldLabel htmlFor="max-bookings">Booking limit</FieldLabel>
          <input
            id="max-bookings"
            type="number"
            min="1"
            placeholder="No limit"
            className={inputClass}
            value={form.max_bookings}
            onChange={(event) => updateForm("max_bookings", event.target.value)}
          />
        </div>
        <div>
          <FieldLabel htmlFor="min-guests">Min guests per booking</FieldLabel>
          <input id="min-guests" type="number" min="1" placeholder="1" className={inputClass} value={form.min_guests} onChange={(event) => updateForm("min_guests", event.target.value)} />
        </div>
        <div>
          <FieldLabel htmlFor="max-guests">Max guests per booking</FieldLabel>
          <input id="max-guests" type="number" min="1" placeholder="No limit" className={inputClass} value={form.max_guests} onChange={(event) => updateForm("max_guests", event.target.value)} />
        </div>
        {form.category === "event" ? (
          <div>
            <FieldLabel htmlFor="booking-cutoff">Minimum advance notice</FieldLabel>
            <SelectInput
              id="booking-cutoff"
              value={form.booking_cutoff_minutes}
              onChange={(value) => updateForm("booking_cutoff_minutes", value)}
              options={advanceNoticeOptions}
            />
          </div>
        ) : null}
      </div>
      <div className="mt-5 grid gap-3">
        <ToggleRow label="Auto Confirmation" checked={form.auto_confirm} onChange={updateAutoConfirmation} />
        <ToggleRow label="Waitlist" checked={form.allow_waitlist} onChange={(checked) => updateForm("allow_waitlist", checked)} />
      </div>
    </section>
  );

  const renderQuestionsPanel = () => (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Custom Questions</h2>
          <p className="mt-1 text-sm text-gray-500">These render on the customer form for this booking type.</p>
        </div>
        <button
          type="button"
          onClick={addCustomField}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <Plus className="size-4" />
          Add
        </button>
      </div>

      {form.custom_fields.length === 0 ? (
        <div className="flex items-center gap-3 rounded-lg border border-dashed border-gray-200 p-5 text-sm text-gray-500">
          <HelpCircle className="size-4" />
          No custom questions for this type.
        </div>
      ) : (
        <div className="space-y-3">
          {form.custom_fields.map((field, index) => (
            <div key={`${field.label}-${index}`} className="grid gap-3 rounded-lg border border-gray-200 p-4 lg:grid-cols-[1fr_180px_140px_auto]">
              <div>
                <FieldLabel htmlFor={`field-label-${index}`}>Question</FieldLabel>
                <input id={`field-label-${index}`} className={inputClass} value={field.label} onChange={(event) => updateCustomField(index, "label", event.target.value)} />
              </div>
              <div>
                <FieldLabel htmlFor={`field-type-${index}`}>Type</FieldLabel>
                <SelectInput
                  id={`field-type-${index}`}
                  value={field.field_type}
                  onChange={(value) => updateCustomField(index, "field_type", value as BookingCustomField["field_type"])}
                  options={[
                    { value: "text", label: "Text" },
                    { value: "number", label: "Number" },
                    { value: "dropdown", label: "Dropdown" },
                    { value: "checkbox", label: "Checkbox" },
                  ]}
                />
              </div>
              <div className="self-end">
                <ToggleRow label="Required" checked={field.is_required} onChange={(checked) => updateCustomField(index, "is_required", checked)} />
              </div>
              <button
                type="button"
                onClick={() => removeCustomField(index)}
                className="self-end inline-flex size-11 items-center justify-center rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-50"
                aria-label="Remove custom question"
              >
                <Trash2 className="size-4" />
              </button>
              {field.field_type === "dropdown" ? (
                <div className="lg:col-span-4">
                  <FieldLabel htmlFor={`field-options-${index}`}>Dropdown options</FieldLabel>
                  <textarea
                    id={`field-options-${index}`}
                    className={`${textareaClass} min-h-20`}
                    value={field.options}
                    onChange={(event) => updateCustomField(index, "options", event.target.value)}
                  />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );

  const renderUpcomingPanel = () => (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      {selectedItem?.upcoming_sessions?.length ? (
        <div className="grid gap-2">
          {selectedItem.upcoming_sessions.map((session) => {
            const sessionParts = formatSessionParts(session);

            return (
              <div key={session.id} className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2 text-sm">
                <span className="min-w-0 font-medium text-gray-800">{sessionParts.label}</span>
                <span className="shrink-0 rounded-md bg-white px-2 py-1 text-xs font-semibold text-gray-600 shadow-theme-xs">
                  {sessionParts.time}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-lg border border-dashed border-gray-200 p-5 text-sm text-gray-500">
          <CalendarClock className="size-4" />
          No upcoming sessions.
        </div>
      )}
    </section>
  );

  const renderAdditionalPanel = () => (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <FieldLabel htmlFor="sort-order">Sort order</FieldLabel>
          <input id="sort-order" type="number" className={inputClass} value={form.sort_order} onChange={(event) => updateForm("sort_order", event.target.value)} />
        </div>
        {form.category === "event" ? (
          <div>
            <FieldLabel htmlFor="booking-window">Booking window (days)</FieldLabel>
            <input
              id="booking-window"
              type="number"
              min="1"
              max="365"
              className={inputClass}
              value={form.booking_window_days}
              onChange={(event) => updateForm("booking_window_days", event.target.value)}
            />
          </div>
        ) : null}
      </div>
      {form.id ? (
        <div className="mt-6 border-t border-gray-200 pt-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Delete booking type</h2>
              <p className="mt-1 text-sm text-gray-500">
                Remove this booking type from setup and customer booking options.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDeleteModalOpen(true)}
              disabled={saving}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-error-200 bg-white px-4 text-sm font-medium text-error-700 hover:bg-error-50 disabled:opacity-60"
            >
              <Trash2 className="size-4" />
              Delete
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );

  const renderOverviewPanel = () => (
    <section className="space-y-3">
      {visiblePanels.map((panel) => (
        <SettingsRow
          key={panel.id}
          title={panel.title}
          onClick={() => setActivePanel(panel.id)}
        />
      ))}
    </section>
  );

  const renderActivePanel = () => {
    switch (activePanel) {
      case "setup":
        return renderSetupPanel();
      case "schedule":
        return renderSchedulePanel();
      case "areas":
        return renderAreasPanel();
      case "capacity":
        return renderCapacityPanel();
      case "questions":
        return renderQuestionsPanel();
      case "upcoming":
        return renderUpcomingPanel();
      case "additional":
        return renderAdditionalPanel();
      default:
        return renderOverviewPanel();
    }
  };

  if (loading) {
    return <LoadingState label="Loading booking types" />;
  }

  const headerTitle =
    selectedId === null ? (
      "Booking Types"
    ) : (
      <span className="flex min-w-0 flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={showTypeList}
          className="rounded-md text-gray-500 transition hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          Booking Types
        </button>
        <ChevronRight className="size-5 shrink-0 text-gray-400" />
        {activePanel === "overview" ? (
          <span className="min-w-0 truncate text-gray-900">{currentTitle}</span>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setActivePanel("overview")}
              className="min-w-0 rounded-md truncate text-gray-500 transition hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {currentTitle}
            </button>
            <ChevronRight className="size-5 shrink-0 text-gray-400" />
            <span className="min-w-0 truncate text-gray-900">{panelLabels[activePanel]}</span>
          </>
        )}
      </span>
    );

  const headerAction =
    selectedId === null ? (
      <button
        type="button"
        onClick={() => startNewBookingType("event")}
        className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"
      >
        <Plus className="size-4" />
        Add
      </button>
    ) : (
      <button
        type="submit"
        form="booking-type-form"
        disabled={saving}
        className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
      >
        <Save className="size-4" />
        {saving ? "Saving" : "Save"}
      </button>
    );

  const deleteModal = deleteModalOpen ? (
    <Modal isOpen={deleteModalOpen} onClose={() => setDeleteModalOpen(false)} className="m-4 max-w-md" showCloseButton={false}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-booking-type-title"
        className="p-5"
      >
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-error-50 text-error-600">
            <Trash2 className="size-5" />
          </span>
          <div>
            <h2 id="delete-booking-type-title" className="text-lg font-semibold text-gray-900">
              Delete booking type?
            </h2>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              {form.name.trim() || "This booking type"} will be removed from booking type setup and customer booking
              options. If bookings already use it, Resrva will archive it instead so booking history stays intact.
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => setDeleteModalOpen(false)}
            disabled={saving}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={deleteBookingType}
            disabled={saving}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-error-600 px-4 text-sm font-medium text-white hover:bg-error-700 disabled:opacity-60"
          >
            <Trash2 className="size-4" />
            {saving ? "Deleting" : "Delete"}
          </button>
        </div>
      </div>
    </Modal>
  ) : null;

  return (
    <>
      <PageHeader title={headerTitle} action={headerAction} />

      {message ? (
        <ToastMessage type={message.type} onDismiss={() => setMessage(null)}>
          {message.text}
        </ToastMessage>
      ) : null}

      {selectedId === null ? (
        <section className="space-y-3">
          {items.map((item) => {
            const Icon = getBookingIcon(item.icon);

            return (
              <SettingsRow
                key={item.id}
                title={item.name}
                leadingIcon={<Icon className="size-5" style={{ color: item.colour || undefined }} />}
                onClick={() => chooseBookingType(item)}
              />
            );
          })}
        </section>
      ) : (
        <form id="booking-type-form" onSubmit={saveBookingType} className="space-y-5">
          {renderActivePanel()}
        </form>
      )}
      {deleteModal}
    </>
  );
}
