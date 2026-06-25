import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useLocation } from "react-router";
import flatpickr from "flatpickr";
import type { Instance as FlatpickrInstance } from "flatpickr/dist/types/instance";
import {
  AlertTriangle,
  ArrowUpDown,
  Calendar,
  CalendarDays,
  CalendarCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  History,
  Mail,
  MapPin,
  Moon,
  Pencil,
  Phone,
  Plus,
  Save,
  Sun,
  Table2,
  TableProperties,
  Tag,
  User,
  UserRound,
  Users,
  Utensils,
  X,
  type LucideIcon,
} from "lucide-react";
import { apiFetch, toJsonBody } from "../lib/api";
import { bookingTypeColourVars } from "../lib/bookingTypeColours";
import { getBookingIcon } from "../lib/bookingTypeIcons";
import type { ActivityLog, Area, Booking, BookingType, MetaPayload, Paginated, TableRecord } from "../types";
import {
  FieldLabel,
  FormMessage,
  MultiSelectInput,
  SelectInput,
  ToastMessage,
  inputClass,
  textareaClass,
} from "../components/resrva/FormField";
import { LoadingState } from "../components/resrva/LoadingState";
import { PageHeader } from "../components/resrva/PageHeader";
import {
  AiReplyComposer,
  replyPurposeForStatus,
  statusNeedsCustomerNotice,
  type ReplyPurpose,
} from "../components/resrva/AiReplyComposer";
import { CustomerNotifyPrompt } from "../components/resrva/CustomerNotifyPrompt";
import Button from "../components/ui/button/Button";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "../components/ui/table";

type ManualBookingForm = {
  name: string;
  email: string;
  phone: string;
  date: string;
  time: string;
  end_time: string;
  guest_count: string;
  booking_type_id: string;
  preferred_area_id: string;
  table_ids: string[];
  assigned_area_id: string;
  assigned_area_ids: string[];
  table_marked: boolean;
  notes: string;
  staff_notes: string;
  staff_name: string;
  status?: string;
  event_type?: string;
};

type TablesPayload = {
  areas: Area[];
  tables: TableRecord[];
};

type BookingGroup = {
  key: string;
  title: string;
  items: Booking[];
  timeRange?: string;
  colour?: string | null;
  icon?: string | null;
};

type BookingModalMode = "view" | "edit";

type ReserveSignConfirmState = {
  groupKey: string;
  groupTitle: string;
  date: string;
  bookingIds: number[];
  tableMarked: boolean;
  actionLabel: "Place" | "Clear";
  resultLabel: "placed" | "cleared";
};

type AvailabilityLoadState = {
  items: Booking[];
  loading: boolean;
  error?: string;
};

type TableAvailability = {
  unavailableTableIds: Set<string>;
  blockedAreaIds: Set<number>;
};

const bookingGroupStyles: Record<
  string,
  {
    accent: string;
    iconWrap: string;
    icon: string;
    timeRange: string;
    Icon: LucideIcon;
  }
> = {
  lunch: {
    accent: "border-t-brand-500",
    iconWrap: "bg-brand-50 dark:bg-brand-500/15",
    icon: "text-brand-500 dark:text-brand-400",
    timeRange: "11:00 AM - 2:30 PM",
    Icon: Sun,
  },
  dinner: {
    accent: "border-t-warning-500",
    iconWrap: "bg-warning-50 dark:bg-warning-500/15",
    icon: "text-warning-500 dark:text-orange-400",
    timeRange: "5:00 PM - 10:00 PM",
    Icon: Moon,
  },
  functions: {
    accent: "border-t-blue-light-500",
    iconWrap: "bg-blue-light-50 dark:bg-blue-light-500/15",
    icon: "text-blue-light-500",
    timeRange: "All Day",
    Icon: CalendarCheck,
  },
};

const eventGroupStyle = {
  accent: "border-t-success-500",
  iconWrap: "bg-success-50 dark:bg-success-500/15",
  icon: "text-success-600 dark:text-success-500",
  timeRange: "Event",
  Icon: CalendarCheck,
};

const emptyManualBooking: ManualBookingForm = {
  name: "",
  email: "",
  phone: "",
  date: "",
  time: "",
  end_time: "",
  guest_count: "",
  booking_type_id: "",
  preferred_area_id: "",
  table_ids: [],
  assigned_area_id: "",
  assigned_area_ids: [],
  table_marked: false,
  notes: "",
  staff_notes: "",
  staff_name: "",
};

function editFormFromBooking(booking: Booking): ManualBookingForm {
  return {
    name: booking.customer_name || "",
    email: booking.customer_email || "",
    phone: booking.customer_phone || "",
    date: booking.booking_date || "",
    time: booking.start_time?.slice(0, 5) || "",
    end_time: booking.end_time?.slice(0, 5) || "",
    guest_count: String(booking.guest_count || ""),
    booking_type_id: booking.booking_type_id ? String(booking.booking_type_id) : "",
    preferred_area_id: booking.preferred_area_id ? String(booking.preferred_area_id) : "",
    table_ids: parseTableIds(booking.table_ids),
    assigned_area_id: booking.assigned_area_id ? String(booking.assigned_area_id) : "",
    assigned_area_ids: parseTableIds(
      booking.assigned_area_ids || (booking.assigned_area_id ? String(booking.assigned_area_id) : ""),
    ),
    table_marked: truthy(booking.table_marked),
    notes: booking.notes || "",
    staff_notes: booking.staff_notes || "",
    staff_name: booking.staff_name || "",
    status: booking.status,
    event_type: booking.event_type || "",
  };
}

const dateScopeTabs = [
  { label: "Today", value: "today" },
  { label: "Upcoming", value: "upcoming" },
  { label: "Past", value: "past" },
] as const;

type DateScope = (typeof dateScopeTabs)[number]["value"] | "";

const sortOptions = [
  { label: "Time Earliest", value: "time_earliest" },
  { label: "Time Latest", value: "time_latest" },
  { label: "Created Newest", value: "created_newest" },
  { label: "Created Oldest", value: "created_oldest" },
  { label: "Large to Small", value: "party_desc" },
  { label: "Small to Large", value: "party_asc" },
] as const;

type SortKey = (typeof sortOptions)[number]["value"];

const bookingStatuses = ["pending", "waitlist", "confirmed", "seated", "completed", "cancelled", "declined", "no_show"];
const bulkReserveSignStatuses = new Set(["pending", "waitlist", "confirmed", "seated", "completed"]);
const statusLabels: Record<string, string> = {
  pending: "Pending",
  waitlist: "Waitlist",
  confirmed: "Confirmed",
  seated: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
  declined: "Declined",
  no_show: "No show",
};
const compactInputClass = `${inputClass} h-10 py-2`;
const compactTextareaClass = `${textareaClass} min-h-[72px] py-2`;

function statusDisplayLabel(status: string): string {
  return statusLabels[status] || status.replace("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function bookingTypeColourFor(
  booking: Booking,
  bookingTypes: BookingType[] = [],
): string | null {
  if (booking.booking_type_colour) return booking.booking_type_colour;
  if (booking.booking_type_id) {
    return bookingTypes.find((type) => Number(type.id) === Number(booking.booking_type_id))?.colour || null;
  }
  const fallbackSlug =
    booking.booking_type === "function"
      ? "function-enquiry"
      : booking.booking_type === "table" && minutesFromTime(booking.start_time) < 17 * 60
        ? "lunch"
        : booking.booking_type === "table"
          ? "dinner"
          : "";

  return (
    bookingTypes.find((type) => type.slug === fallbackSlug)?.colour ||
    (booking.booking_type === "function" ? bookingTypes.find((type) => type.category === "function")?.colour : null) ||
    null
  );
}

function bookingTypeIconFor(
  booking: Booking,
  bookingTypes: BookingType[] = [],
): string | null {
  if (booking.booking_type_icon) return booking.booking_type_icon;
  if (booking.booking_type_id) {
    return bookingTypes.find((type) => Number(type.id) === Number(booking.booking_type_id))?.icon || null;
  }
  const fallbackSlug =
    booking.booking_type === "function"
      ? "function-enquiry"
      : booking.booking_type === "table" && minutesFromTime(booking.start_time) < 17 * 60
        ? "lunch"
        : booking.booking_type === "table"
          ? "dinner"
          : "";

  return (
    bookingTypes.find((type) => type.slug === fallbackSlug)?.icon ||
    (booking.booking_type === "function" ? bookingTypes.find((type) => type.category === "function")?.icon : null) ||
    null
  );
}

const statusControlStyles: Record<string, string> = {
  confirmed:
    "!border-success-200 !bg-success-50 !text-success-600 dark:!border-success-500/20 dark:!bg-success-500/15 dark:!text-success-500",
  pending:
    "!border-warning-200 !bg-warning-50 !text-warning-600 dark:!border-warning-500/20 dark:!bg-warning-500/15 dark:!text-orange-400",
  waitlist:
    "!border-warning-200 !bg-warning-50 !text-warning-600 dark:!border-warning-500/20 dark:!bg-warning-500/15 dark:!text-orange-400",
  seated:
    "!border-blue-light-200 !bg-blue-light-50 !text-blue-light-500 dark:!border-blue-light-500/20 dark:!bg-blue-light-500/15 dark:!text-blue-light-500",
  completed: "!border-gray-200 !bg-gray-100 !text-gray-700 dark:!border-gray-700 dark:!bg-white/5 dark:!text-white/80",
  cancelled:
    "!border-error-200 !bg-error-50 !text-error-600 dark:!border-error-500/20 dark:!bg-error-500/15 dark:!text-error-500",
  declined:
    "!border-error-200 !bg-error-50 !text-error-600 dark:!border-error-500/20 dark:!bg-error-500/15 dark:!text-error-500",
  no_show: "!border-gray-200 !bg-gray-100 !text-gray-700 dark:!border-gray-700 dark:!bg-white/5 dark:!text-white/80",
};

type NotifyPromptState = {
  booking: Booking;
  purpose: ReplyPurpose;
  message: string;
};

function customerNoticeForStatusChange(previousStatus: string, nextStatus: string, booking: Booking): NotifyPromptState | null {
  if (previousStatus === nextStatus || !statusNeedsCustomerNotice(nextStatus)) {
    return null;
  }

  const message =
    nextStatus === "confirmed"
      ? "This booking is now confirmed. Do you want to draft a confirmation reply for the customer?"
      : nextStatus === "declined"
        ? "This booking has been declined. Do you want to draft a polite reply for the customer?"
        : "This booking has been cancelled. Do you want to draft an update for the customer?";

  return {
    booking,
    purpose: replyPurposeForStatus(nextStatus),
    message,
  };
}

function todayIso() {
  return toIsoDate(new Date());
}

function bookingFiltersFromLocation(search: string) {
  const query = (new URLSearchParams(search).get("search") || "").trim();

  if (query) {
    return {
      search: query,
      status: "",
      date_from: "",
      date_to: "",
      date_scope: "" as DateScope,
    };
  }

  return {
    search: "",
    status: "",
    date_from: todayIso(),
    date_to: todayIso(),
    date_scope: "today" as DateScope,
  };
}

function addDaysIso(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function parseIsoDate(value?: string | null): Date | null {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;

  return new Date(year, month - 1, day);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);

  return next;
}

function compareIso(left: string, right: string): number {
  return left.localeCompare(right);
}

function normalizedRange(start: string, end: string): [string, string] {
  return compareIso(start, end) <= 0 ? [start, end] : [end, start];
}

function parseTableIds(value?: string | null): string[] {
  return value
    ? value
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean)
    : [];
}

function truthy(value: number | boolean | string | undefined | null): boolean {
  return value === true || value === 1 || value === "1";
}

function reservableTable(table: TableRecord): boolean {
  return Boolean(Number(table.active));
}

function TablePicker({
  areas,
  tables,
  selectedIds,
  onChange,
  unavailableTableIds,
  blockedAreaIds,
  visibleAreaIds,
  availabilityLabel,
  isAvailabilityLoading = false,
}: {
  areas: Area[];
  tables: TableRecord[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  unavailableTableIds?: Set<string>;
  blockedAreaIds?: Set<number>;
  visibleAreaIds?: string[];
  availabilityLabel?: string;
  isAvailabilityLoading?: boolean;
}) {
  const [walkInConfirmation, setWalkInConfirmation] = useState<{
    tableId: string;
    tableNumber: number;
  } | null>(null);
  const selected = new Set(selectedIds);
  const unavailable = unavailableTableIds ?? new Set<string>();
  const blockedAreas = blockedAreaIds ?? new Set<number>();
  const visibleAreaSet = visibleAreaIds?.length ? new Set(visibleAreaIds) : null;
  const visibleAreas = visibleAreaSet
    ? areas.filter((area) => visibleAreaSet.has(String(area.id)))
    : areas;
  const selectedTables = tables
    .filter((table) => selected.has(String(table.id)))
    .sort((left, right) => Number(left.table_number) - Number(right.table_number));
  const selectedCapacity = selectedTables.reduce((total, table) => total + Number(table.capacity), 0);
  const selectedNumbers = selectedTables.map((table) => table.table_number).join(", ");

  const toggleTable = (tableId: string, bookedTable = false, walkInTable = false, tableNumber = 0) => {
    if (bookedTable && !selected.has(tableId)) {
      return;
    }

    if (selected.has(tableId)) {
      onChange(selectedIds.filter((id) => id !== tableId));
      return;
    }

    if (walkInTable) {
      setWalkInConfirmation({ tableId, tableNumber });
      return;
    }

    onChange([...selectedIds, tableId]);
  };

  const confirmWalkInTable = () => {
    if (!walkInConfirmation) return;

    if (!selected.has(walkInConfirmation.tableId)) {
      onChange([...selectedIds, walkInConfirmation.tableId]);
    }

    setWalkInConfirmation(null);
  };

  return (
    <>
      <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-col gap-2 border-b border-gray-200 px-3 py-2 sm:flex-row sm:items-center sm:justify-between dark:border-gray-800">
          <div className="text-theme-xs text-gray-500 dark:text-gray-400">
            <span className="font-medium text-gray-800 dark:text-white/90">
              {selectedIds.length ? `Table ${selectedNumbers}` : "No tables selected"}
            </span>
            {selectedIds.length ? <span className="ml-2">Capacity {selectedCapacity}</span> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-theme-xs">
            <span className="inline-flex items-center gap-1 text-gray-500 dark:text-gray-400">
              <span className="size-2 rounded-full bg-white ring-1 ring-gray-300" />
              Available
            </span>
            <span className="inline-flex items-center gap-1 text-gray-500 dark:text-gray-400">
              <span className="size-2 rounded-full bg-gray-200 ring-1 ring-gray-300" />
              Walk-ins
            </span>
            <span className="inline-flex items-center gap-1 text-error-600">
              <span className="size-2 rounded-full bg-error-100 ring-1 ring-error-200" />
              Booked
            </span>
            {selectedIds.length ? (
              <button
                type="button"
                onClick={() => onChange([])}
                className="ml-1 w-fit font-medium text-brand-500 hover:text-brand-600"
              >
                Clear
              </button>
            ) : null}
          </div>
        </div>
        {availabilityLabel || isAvailabilityLoading ? (
          <div className="border-b border-gray-100 px-3 py-2 text-theme-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
            {isAvailabilityLoading ? "Checking availability..." : availabilityLabel}
          </div>
        ) : null}
        <div className="max-h-[360px] space-y-2 overflow-y-auto p-3">
        {visibleAreas.map((area) => {
          const areaTables = tables
            .filter((table) => Number(table.area_id) === Number(area.id))
            .sort((left, right) => Number(left.table_number) - Number(right.table_number));

          if (!areaTables.length) {
            return null;
          }

          const areaBlocked = blockedAreas.has(Number(area.id));
          const bookedCount = areaTables.filter((table) => areaBlocked || unavailable.has(String(table.id))).length;
          const reservableCount = areaTables.filter(reservableTable).length;

          return (
            <div key={area.id} className="rounded-lg border border-gray-100 bg-gray-50 p-2.5 dark:border-gray-800 dark:bg-white/[0.03]">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase text-gray-500">{area.name}</p>
                <span className="text-xs text-gray-400">
                  {bookedCount ? `${bookedCount} booked` : `${reservableCount}/${areaTables.length} reservable`}
                </span>
              </div>
              <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-8 md:grid-cols-10">
                {areaTables.map((table) => {
                  const id = String(table.id);
                  const isSelected = selected.has(id);
                  const isBooked = areaBlocked || unavailable.has(id);
                  const isWalkInTable = !reservableTable(table);

                  return (
                    <button
                      key={table.id}
                      type="button"
                      aria-pressed={isSelected}
                      disabled={isBooked && !isSelected}
                      title={
                        isBooked
                          ? "Booked for the selected date and time"
                          : isWalkInTable
                            ? "Usually reserved for walk-ins"
                            : "Reservable"
                      }
                      onClick={() => toggleTable(id, isBooked, isWalkInTable, Number(table.table_number))}
                      className={`h-8 rounded-lg border text-theme-xs font-semibold ${
                        isSelected
                          ? "border-brand-600 bg-brand-600 text-white shadow-theme-xs"
                          : isBooked
                            ? "cursor-not-allowed border-error-200 bg-error-50 text-error-600 opacity-80"
                            : isWalkInTable
                              ? "border-gray-200 bg-gray-100 text-gray-500 opacity-80 hover:border-gray-300 hover:bg-gray-200"
                              : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      {table.table_number}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
        </div>
      </div>

      {walkInConfirmation ? (
        <div
          className="fixed inset-0 z-[1000000] flex items-center justify-center bg-black/40 px-4 py-8"
          role="dialog"
          aria-modal="true"
          aria-labelledby="walk-in-table-confirm-title"
        >
          <div className="w-full max-w-[420px] rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xl dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-start gap-4">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-warning-50 text-warning-600 dark:bg-warning-500/15 dark:text-orange-400">
                <AlertTriangle className="size-5" />
              </span>
              <div className="min-w-0">
                <h3 id="walk-in-table-confirm-title" className="text-base font-semibold text-gray-900 dark:text-white/90">
                  Use walk-in table?
                </h3>
                <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
                  Table {walkInConfirmation.tableNumber} is usually reserved for walk-ins. Are you sure you want to assign it to this booking?
                </p>
              </div>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setWalkInConfirmation(null)}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmWalkInTable}
                className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-700"
              >
                Select table
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function minutesFromTime(time: string): number {
  const [hours = "0", minutes = "0"] = time.slice(0, 5).split(":");
  return Number(hours) * 60 + Number(minutes);
}

function bookingDurationMinutes(booking: Booking | null | undefined, fallback: number): number {
  if (!booking?.start_time || !booking?.end_time) {
    return fallback;
  }

  const duration = minutesFromTime(booking.end_time) - minutesFromTime(booking.start_time);
  return duration > 0 ? duration : fallback;
}

function timeFromMinutes(totalMinutes: number): string {
  const normalized = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function endTimeFromStart(startTime: string, durationMinutes: number): string {
  if (!startTime) return "";

  return timeFromMinutes(minutesFromTime(startTime) + durationMinutes);
}

function durationFromTimeRange(startTime: string, endTime: string, fallbackMinutes: number): number {
  if (!startTime || !endTime) return fallbackMinutes;

  const duration = minutesFromTime(endTime) - minutesFromTime(startTime);
  return duration > 0 ? duration : fallbackMinutes;
}

function bookingTimeValue(booking: Booking): number {
  return Date.parse(`${booking.booking_date}T${booking.start_time.slice(0, 5)}:00`) || 0;
}

function createdValue(booking: Booking): number {
  return Date.parse(booking.created_at || booking.updated_at || "") || 0;
}

function sortedBookings(bookings: Booking[], sortKey: SortKey): Booking[] {
  return bookings
    .map((booking, index) => ({ booking, index }))
    .sort((left, right) => {
      let result = 0;

      switch (sortKey) {
        case "time_latest":
          result = bookingTimeValue(right.booking) - bookingTimeValue(left.booking);
          break;
        case "created_newest":
          result = createdValue(right.booking) - createdValue(left.booking);
          break;
        case "created_oldest":
          result = createdValue(left.booking) - createdValue(right.booking);
          break;
        case "party_desc":
          result = Number(right.booking.guest_count) - Number(left.booking.guest_count);
          break;
        case "party_asc":
          result = Number(left.booking.guest_count) - Number(right.booking.guest_count);
          break;
        case "time_earliest":
        default:
          result = bookingTimeValue(left.booking) - bookingTimeValue(right.booking);
          break;
      }

      return result || left.index - right.index;
    })
    .map(({ booking }) => booking);
}

function bookingBlocksTableAvailability(booking: Booking): boolean {
  if (booking.booking_type === "function") {
    return ["confirmed", "seated", "completed"].includes(booking.status);
  }

  return !["cancelled", "no_show", "declined", "waitlist"].includes(booking.status);
}

function bookingOverlapsSelection(booking: Booking, date: string, time: string, durationMinutes: number): boolean {
  if (!date || !time || booking.booking_date !== date) {
    return false;
  }

  const selectedStart = minutesFromTime(time);
  const selectedEnd = selectedStart + durationMinutes;
  const bookingStart = minutesFromTime(booking.start_time);
  const bookingEnd = minutesFromTime(booking.end_time);

  return bookingStart < selectedEnd && bookingEnd > selectedStart;
}

function buildTableAvailability({
  bookings,
  date,
  time,
  durationMinutes,
  excludeBookingId,
  contextBookingType,
  contextBookingSessionId,
}: {
  bookings: Booking[];
  date: string;
  time: string;
  durationMinutes: number;
  excludeBookingId?: number;
  contextBookingType?: Booking["booking_type"];
  contextBookingSessionId?: number | null;
}): TableAvailability {
  const unavailableTableIds = new Set<string>();
  const blockedAreaIds = new Set<number>();

  for (const booking of bookings) {
    if (excludeBookingId && Number(booking.id) === Number(excludeBookingId)) {
      continue;
    }

    if (!bookingBlocksTableAvailability(booking)) {
      continue;
    }

    if (!bookingOverlapsSelection(booking, date, time, durationMinutes)) {
      continue;
    }

    if (booking.booking_type === "function") {
      const functionAreaIds = parseTableIds(booking.assigned_area_ids);
      if (!functionAreaIds.length && booking.assigned_area_id) {
        functionAreaIds.push(String(booking.assigned_area_id));
      }
      for (const areaId of functionAreaIds) {
        blockedAreaIds.add(Number(areaId));
      }
      continue;
    }

    if (booking.booking_type === "event") {
      const reservedAreaIds = parseTableIds(booking.event_reserved_area_ids);
      const sameEventSession =
        contextBookingType === "event" &&
        booking.booking_session_id !== null &&
        booking.booking_session_id !== undefined &&
        contextBookingSessionId !== null &&
        contextBookingSessionId !== undefined &&
        Number(booking.booking_session_id) === Number(contextBookingSessionId);

      if (!sameEventSession) {
        for (const areaId of reservedAreaIds) {
          blockedAreaIds.add(Number(areaId));
        }
      }
    }

    for (const tableId of parseTableIds(booking.table_ids)) {
      unavailableTableIds.add(tableId);
    }
  }

  return { unavailableTableIds, blockedAreaIds };
}

function tableAvailabilityKey(availability: TableAvailability): string {
  const tables = [...availability.unavailableTableIds].sort().join(",");
  const areas = [...availability.blockedAreaIds].sort((left, right) => left - right).join(",");

  return `${tables}|${areas}`;
}

function isTableUnavailable(tableId: string, tables: TableRecord[], availability: TableAvailability): boolean {
  if (availability.unavailableTableIds.has(tableId)) {
    return true;
  }

  const table = tables.find((candidate) => String(candidate.id) === tableId);
  return table ? availability.blockedAreaIds.has(Number(table.area_id)) : false;
}

function availabilityStatusLabel(date: string, time: string, state: AvailabilityLoadState): string {
  if (!date || !time) {
    return "Choose a date and time to show availability.";
  }

  if (state.error) {
    return state.error;
  }

  return `Availability for ${formatRangeDate(date)} at ${formatDisplayTime(time)}`;
}

function groupBookings(bookings: Booking[], bookingTypes: BookingType[] = []): BookingGroup[] {
  const lunch: Booking[] = [];
  const dinner: Booking[] = [];
  const functions: Booking[] = [];
  const events = new Map<string, BookingGroup>();

  for (const booking of bookings) {
    if (booking.booking_type === "function") {
      functions.push(booking);
      continue;
    }

    if (booking.booking_type === "event") {
      const typeName = booking.booking_type_name || booking.event_type || "Event";
      const key = `event-${booking.booking_session_id || booking.booking_type_id || typeName}-${booking.booking_date}`;
      const group = events.get(key) || {
        key,
        title: `${typeName} - ${formatDisplayDate(booking.booking_date)}`,
        timeRange: formatDisplayTime(booking.start_time),
        colour: bookingTypeColourFor(booking, bookingTypes),
        icon: bookingTypeIconFor(booking, bookingTypes),
        items: [],
      };
      group.items.push(booking);
      events.set(key, group);
      continue;
    }

    if (minutesFromTime(booking.start_time) < 17 * 60) {
      lunch.push(booking);
    } else {
      dinner.push(booking);
    }
  }

  const lunchType = bookingTypes.find((type) => type.slug === "lunch");
  const dinnerType = bookingTypes.find((type) => type.slug === "dinner");
  const functionType = bookingTypes.find((type) => type.slug === "function-enquiry") || bookingTypes.find((type) => type.category === "function");

  return [
    {
      key: "lunch",
      title: "Lunch",
      colour: lunchType?.colour || lunch.find((booking) => booking.booking_type_colour)?.booking_type_colour,
      icon: lunchType?.icon || lunch.find((booking) => booking.booking_type_icon)?.booking_type_icon,
      items: lunch,
    },
    {
      key: "dinner",
      title: "Dinner",
      colour: dinnerType?.colour || dinner.find((booking) => booking.booking_type_colour)?.booking_type_colour,
      icon: dinnerType?.icon || dinner.find((booking) => booking.booking_type_icon)?.booking_type_icon,
      items: dinner,
    },
    {
      key: "functions",
      title: "Functions",
      colour: functionType?.colour || functions.find((booking) => booking.booking_type_colour)?.booking_type_colour,
      icon: functions.find((booking) => booking.booking_type_icon)?.booking_type_icon || functionType?.icon,
      items: functions,
    },
    ...Array.from(events.values()),
  ].filter((group) => group.items.length > 0);
}

function statusOptionsFor(booking: Booking) {
  return statusOptionsForMode(booking.booking_type, booking.status);
}

function statusOptionsForMode(_mode: Booking["booking_type"], currentStatus: string) {
  return bookingStatuses.includes(currentStatus) ? bookingStatuses : [currentStatus, ...bookingStatuses];
}

function formatDisplayTime(time: string): string {
  const [hoursText = "0", minutesText = "0"] = time.slice(0, 5).split(":");
  const hours = Number(hoursText);
  const suffix = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutesText} ${suffix}`;
}

function formatDisplayDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return date;
  }

  return parsed.toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function formatRangeDate(date: string): string {
  const parsed = parseIsoDate(date);
  if (!parsed) return date;
  const weekday = parsed.toLocaleDateString("en-AU", { weekday: "short" });
  const month = parsed.toLocaleDateString("en-AU", { month: "short" });

  return `${weekday}, ${parsed.getDate()} ${month} ${parsed.getFullYear()}`;
}

function formatRangeLabel(start: string, end: string): string {
  if (start && end) {
    return start === end ? formatRangeDate(start) : `${formatRangeDate(start)} - ${formatRangeDate(end)}`;
  }

  if (start) {
    return `From ${formatRangeDate(start)}`;
  }

  if (end) {
    return `Until ${formatRangeDate(end)}`;
  }

  return "Select date range";
}

function totalGuests(bookings: Booking[]): number {
  return bookings.reduce((total, booking) => total + Number(booking.guest_count || 0), 0);
}

function pluralize(count: number, label: string): string {
  return `${count} ${label}${count === 1 ? "" : "s"}`;
}

function bookingAreaLabel(booking: Booking): string {
  return (
    booking.assigned_area_names ||
    booking.assigned_area_name ||
    booking.preferred_area_name ||
    booking.event_reserved_area_names ||
    ""
  );
}

function bookingTableLabel(booking: Booking): string {
  const areaLabel = bookingAreaLabel(booking);

  if (booking.table_numbers) {
    return `Table ${booking.table_numbers}`;
  }

  if (booking.booking_type === "event") {
    return "No table";
  }

  if (booking.booking_type === "function") {
    return areaLabel || "Unassigned";
  }

  return "Unassigned";
}

function bookingCanBeTableMarked(booking: Booking): boolean {
  return Boolean(booking.id);
}

function bookingCanBulkUpdateReserveSign(booking: Booking): boolean {
  return bulkReserveSignStatuses.has(booking.status);
}

function bookingNeedsBulkReserveSign(booking: Booking): boolean {
  return bookingCanBulkUpdateReserveSign(booking) && !truthy(booking.table_marked);
}

function bookingServiceLabel(booking: Booking): string {
  if (booking.booking_type_name) {
    return booking.booking_type_name;
  }

  if (booking.booking_type === "function") {
    return booking.event_type || "Function";
  }

  if (booking.booking_type === "event") {
    return booking.event_type || "Event";
  }

  return minutesFromTime(booking.start_time) < 17 * 60 ? "Lunch" : "Dinner";
}

function bookingModeFromBookingType(
  bookingType: BookingType | null | undefined,
  fallback: Booking["booking_type"] = "table",
): Booking["booking_type"] {
  if (!bookingType) return fallback;
  if (bookingType.category === "dining") return "table";
  if (bookingType.category === "function") return "function";
  return "event";
}

function bookingTypeReservedAreaIds(bookingType: BookingType | null | undefined): string[] {
  const reservedAreaIds = bookingType?.schedule?.reserved_area_ids;
  if (Array.isArray(reservedAreaIds)) {
    return reservedAreaIds.map(String).filter(Boolean);
  }

  const reservedAreaIdsJson = bookingType?.schedule?.reserved_area_ids_json;
  if (reservedAreaIdsJson) {
    try {
      const parsed = JSON.parse(reservedAreaIdsJson);
      return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
    } catch {
      return [];
    }
  }

  return [];
}

function formatDateTimeLabel(value?: string): string {
  if (!value) return "-";

  const parsed = new Date(value.replace(" ", "T"));
  if (Number.isNaN(parsed.getTime())) return value;

  return parsed.toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function DetailItem({
  label,
  children,
  icon: Icon,
  className = "",
}: {
  label: string;
  children: ReactNode;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <div className={`flex gap-3 ${className}`}>
      {Icon ? (
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-gray-50 text-gray-500 ring-1 ring-gray-100 dark:bg-white/[0.04] dark:text-gray-400 dark:ring-white/[0.08]">
          <Icon className="size-4" />
        </span>
      ) : null}
      <div className="min-w-0">
        <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</dt>
        <dd className="mt-1 break-words text-sm font-semibold text-gray-950 dark:text-white/90">{children}</dd>
      </div>
    </div>
  );
}

function DetailSection({
  title,
  icon: Icon,
  iconClassName,
  children,
  className = "",
}: {
  title: string;
  icon: LucideIcon;
  iconClassName: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-lg border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03] ${className}`}>
      <div className="mb-5 flex items-center gap-3">
        <span className={`flex size-9 items-center justify-center rounded-lg ${iconClassName}`}>
          <Icon className="size-4" />
        </span>
        <h3 className="text-base font-semibold text-gray-950 dark:text-white">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function ReadOnlyEditControl({
  label,
  children,
  icon: Icon,
}: {
  label: string;
  children: ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <div className="min-w-0">
      <span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
      <div className="flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-gray-50 px-3 text-sm font-medium text-gray-800 shadow-theme-xs dark:border-gray-700 dark:bg-white/[0.03] dark:text-white/90">
        {Icon ? <Icon className="size-4 shrink-0 text-gray-400" /> : null}
        <span className="min-w-0 truncate">{children}</span>
      </div>
    </div>
  );
}

function ActivityItem({
  tone,
  date,
  title,
  byline,
}: {
  tone: "success" | "brand" | "muted";
  date: string;
  title: string;
  byline: string;
}) {
  const dotClass =
    tone === "success" ? "bg-success-500" : tone === "brand" ? "bg-brand-500" : "bg-gray-400";

  return (
    <li className="grid grid-cols-[16px_minmax(0,1fr)_minmax(130px,0.75fr)] gap-3 text-sm">
      <span className={`mt-2 size-2 rounded-full ${dotClass}`} />
      <span className="min-w-0 text-gray-500 dark:text-gray-400">{date}</span>
      <span className="min-w-0">
        <span className="block font-semibold text-gray-950 dark:text-white/90">{title}</span>
        <span className="mt-1 block text-xs font-medium text-gray-500 dark:text-gray-400">{byline}</span>
      </span>
    </li>
  );
}

const bookingActivityEntityTypes = ["booking", "event_booking", "function_booking", "function_request"];

function titleCaseAction(action: string): string {
  return action
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function parseActivityDetails(log: ActivityLog): Record<string, unknown> {
  if (!log.details_json) return {};

  try {
    const details = JSON.parse(log.details_json);
    return details && typeof details === "object" && !Array.isArray(details) ? details : {};
  } catch {
    return {};
  }
}

function bookingActivityTitle(log: ActivityLog): string {
  if (log.action === "created") return "Booking created";
  if (log.action === "updated") {
    const details = parseActivityDetails(log);
    if (typeof details.change_summary === "string" && details.change_summary.trim()) {
      return details.change_summary.trim();
    }
    if (Array.isArray(details.changes)) {
      const changes = details.changes.filter((change): change is string => typeof change === "string" && change.trim() !== "");
      if (changes.length) {
        return changes.join("; ");
      }
    }

    return "Booking updated";
  }
  if (log.action === "drafted_ai_reply") return "Reply drafted";
  if (log.action === "logged_ai_reply") return "Reply logged";

  return titleCaseAction(log.action);
}

function bookingActivityByline(log: ActivityLog): string {
  const details = parseActivityDetails(log);
  if (typeof details.staff_name === "string" && details.staff_name.trim()) {
    return `by ${details.staff_name.trim()}`;
  }
  if (log.user_name) return `by ${log.user_name}`;

  if (details.source === "public") return "from public booking";
  if (details.source === "manager") return "by manager";

  return "by System";
}

function bookingActivityTone(log: ActivityLog): "success" | "brand" | "muted" {
  if (log.action === "updated") return "success";
  if (log.action === "created") return "brand";

  return "muted";
}

function BookingDetailsPanel({ booking }: { booking: Booking }) {
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const areaLabel = bookingAreaLabel(booking);
  const tableLabel = bookingTableLabel(booking);
  const showAreaLabel = areaLabel && areaLabel !== tableLabel;
  const timeRange = booking.end_time
    ? `${formatDisplayTime(booking.start_time)} - ${formatDisplayTime(booking.end_time)}`
    : formatDisplayTime(booking.start_time);
  const ServiceIcon = getBookingIcon(booking.booking_type_icon, booking.booking_type === "table" ? Utensils : CalendarCheck);
  const serviceColour = bookingTypeColourVars(booking.booking_type_colour);
  const canMarkTable = bookingCanBeTableMarked(booking);
  const tableMarked = truthy(booking.table_marked);
  const guestNotes = [booking.notes, booking.custom_answers_summary].filter(Boolean).join("\n");

  useEffect(() => {
    let cancelled = false;
    setActivityLoading(true);

    const params = new URLSearchParams({
      entity_id: String(booking.id),
      entity_types: bookingActivityEntityTypes.join(","),
      limit: "20",
    });

    apiFetch<{ items: ActivityLog[] }>(`activity-logs?${params.toString()}`)
      .then((response) => {
        if (!cancelled) {
          setActivityLogs(response.items || []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setActivityLogs([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setActivityLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [booking.id, booking.updated_at]);

  return (
    <div className="max-h-[calc(100vh-8rem)] overflow-y-auto bg-gray-50/40 p-5 dark:bg-white/[0.01]">
      <div className="grid items-stretch gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="grid gap-5">
          <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_150px_150px_150px] lg:items-center">
              <div className="flex min-w-0 items-center gap-4">
                <span
                  className="flex size-16 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--booking-type-colour)_12%,white)] text-[var(--booking-type-colour)]"
                  style={serviceColour}
                >
                  <ServiceIcon className="size-7" />
                </span>
                <div className="min-w-0">
                  <h3 className="truncate text-2xl font-semibold text-gray-950 dark:text-white">
                    {booking.customer_name}
                  </h3>
                  <p className="mt-1 text-sm font-semibold text-gray-500 dark:text-gray-400">
                    {bookingServiceLabel(booking)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 border-gray-100 lg:border-l lg:pl-5 dark:border-gray-800">
                <Users className="size-5 text-gray-500" />
                <div>
                  <p className="text-sm font-semibold text-gray-950 dark:text-white/90">{pluralize(Number(booking.guest_count || 0), "guest")}</p>
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Party size</p>
                </div>
              </div>
              <div className="flex items-center gap-3 border-gray-100 lg:border-l lg:pl-5 dark:border-gray-800">
                <Table2 className="size-5 text-gray-500" />
                <div>
                  <p className="flex items-center gap-2 text-sm font-semibold text-gray-950 dark:text-white/90">
                    <span>{tableLabel}</span>
                    {canMarkTable ? (
                      <span
                        title={tableMarked ? "Reserve Sign placed" : "Reserve Sign not placed"}
                        className={`inline-flex size-6 items-center justify-center rounded-md ${
                          tableMarked
                            ? "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-300"
                            : "bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-orange-300"
                        }`}
                      >
                        <TableProperties className="size-3.5" />
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{showAreaLabel ? areaLabel : "Table"}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 border-gray-100 lg:border-l lg:pl-5 dark:border-gray-800">
                <Tag className="size-5 text-gray-500" />
                <div>
                  <p className="text-sm font-semibold text-gray-950 dark:text-white/90">{bookingServiceLabel(booking)}</p>
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Booking type</p>
                </div>
              </div>
            </div>
          </section>

          <DetailSection title="Reservation" icon={Calendar} iconClassName="bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-400">
            <dl className="grid gap-x-6 gap-y-8 sm:grid-cols-3">
              <DetailItem label="Date" icon={CalendarDays}>{formatDisplayDate(booking.booking_date)}</DetailItem>
              <DetailItem label="Time" icon={Clock}>{timeRange}</DetailItem>
              <DetailItem label="Preferences" icon={MapPin}>{booking.preferred_area_name || "-"}</DetailItem>
            </dl>
          </DetailSection>
        </div>

        <DetailSection title="Guest & Contact" icon={UserRound} iconClassName="bg-purple-50 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300" className="h-full">
          <dl className="grid gap-5">
            <DetailItem label="Name" icon={UserRound}>{booking.customer_name}</DetailItem>
            <DetailItem label="Phone" icon={Phone}>{booking.customer_phone || "-"}</DetailItem>
            <DetailItem label="Email" icon={Mail}>{booking.customer_email || "-"}</DetailItem>
          </dl>
        </DetailSection>

        <DetailSection title="Notes" icon={FileText} iconClassName="bg-warning-50 text-warning-600 dark:bg-warning-500/15 dark:text-orange-300" className="h-[252px]">
          <dl className="grid h-[140px] items-stretch gap-x-8 gap-y-6 lg:grid-cols-2">
            <div className="min-h-0 rounded-lg border border-gray-100 bg-gray-50/70 p-4 dark:border-gray-800 dark:bg-white/[0.03]">
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Guest notes</dt>
              <dd className="mt-3 max-h-[70px] overflow-y-auto whitespace-pre-line pr-1 text-sm font-semibold text-gray-950 dark:text-white/90">
                {guestNotes || "-"}
              </dd>
            </div>
            <div className="min-h-0 rounded-lg border border-gray-100 bg-gray-50/70 p-4 dark:border-gray-800 dark:bg-white/[0.03]">
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Staff notes</dt>
              <dd className="mt-3 max-h-[70px] overflow-y-auto whitespace-pre-line pr-1 text-sm font-semibold text-gray-950 dark:text-white/90">
                {booking.staff_notes || "-"}
              </dd>
            </div>
          </dl>
        </DetailSection>

        <DetailSection title="Activity" icon={History} iconClassName="bg-blue-light-50 text-blue-light-600 dark:bg-blue-light-500/15 dark:text-blue-light-300" className="flex h-[252px] flex-col overflow-hidden">
          <ol className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
            {activityLoading && !activityLogs.length ? (
              <li className="text-sm font-medium text-gray-500 dark:text-gray-400">Loading activity...</li>
            ) : null}
            {activityLogs.length ? (
              activityLogs.map((log) => (
                <ActivityItem
                  key={log.id}
                  tone={bookingActivityTone(log)}
                  date={formatDateTimeLabel(log.created_at)}
                  title={bookingActivityTitle(log)}
                  byline={bookingActivityByline(log)}
                />
              ))
            ) : (
              <>
                {booking.updated_at ? (
                  <ActivityItem
                    tone="success"
                    date={formatDateTimeLabel(booking.updated_at)}
                    title="Booking updated"
                    byline={booking.staff_name ? `by ${booking.staff_name}` : "by manager"}
                  />
                ) : null}
                {booking.created_at ? (
                  <ActivityItem
                    tone="brand"
                    date={formatDateTimeLabel(booking.created_at)}
                    title="Booking created"
                    byline={booking.booking_type === "event" ? "from event booking" : booking.booking_type === "function" ? "from function request" : "from table booking"}
                  />
                ) : null}
              </>
            )}
            <ActivityItem
              tone="muted"
              date={formatDisplayDate(booking.booking_date)}
              title={`${bookingServiceLabel(booking)} scheduled`}
              byline={timeRange}
            />
          </ol>
        </DetailSection>
      </div>
    </div>
  );
}

function SortDropdown({
  value,
  open,
  onToggle,
  onChange,
}: {
  value: SortKey;
  open: boolean;
  onToggle: () => void;
  onChange: (value: SortKey) => void;
}) {
  const current = sortOptions.find((option) => option.value === value) || sortOptions[0];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        className={`flex h-11 w-full items-center gap-3 rounded-lg border bg-white px-4 text-left shadow-theme-xs outline-hidden transition dark:bg-gray-900 ${
          open
            ? "border-brand-300 ring-3 ring-brand-500/10 dark:border-brand-800"
            : "border-gray-300 hover:border-gray-400 dark:border-gray-700"
        }`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <ArrowUpDown className="size-4 flex-none text-gray-400" />
        <span className="min-w-0 flex-1 truncate text-sm text-gray-800 dark:text-white/90">{current.label}</span>
        <ChevronDown className={`size-4 flex-none text-gray-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open ? (
        <div
          className="absolute left-0 top-[calc(100%+10px)] z-50 w-full min-w-72 rounded-xl border border-gray-200 bg-white p-3 shadow-theme-lg dark:border-gray-800 dark:bg-gray-dark"
          role="listbox"
        >
          {sortOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={value === option.value}
              onClick={() => onChange(option.value)}
              className={`flex h-12 w-full items-center rounded-lg px-3 text-left text-sm font-semibold ${
                value === option.value
                  ? "bg-brand-50 text-brand-500 dark:bg-brand-500/15 dark:text-brand-400"
                  : "text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function DateRangePicker({
  start,
  end,
  onRangeChange,
  onStepRange,
  onOpen,
}: {
  start: string;
  end: string;
  onRangeChange: (start: string, end: string) => void;
  onStepRange: (days: number) => void;
  onOpen?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const pickerRef = useRef<FlatpickrInstance | null>(null);
  const onRangeChangeRef = useRef(onRangeChange);
  const initialDatesRef = useRef([start, end].filter(Boolean));

  useEffect(() => {
    onRangeChangeRef.current = onRangeChange;
  }, [onRangeChange]);

  useEffect(() => {
    if (!inputRef.current) return undefined;

    const picker = flatpickr(inputRef.current, {
      mode: "range",
      static: true,
      monthSelectorType: "static",
      dateFormat: "Y-m-d",
      disableMobile: true,
      defaultDate: initialDatesRef.current,
      onChange: (selectedDates) => {
        if (selectedDates.length === 0) {
          onRangeChangeRef.current("", "");
          return;
        }

        if (selectedDates.length === 1) {
          onRangeChangeRef.current(toIsoDate(selectedDates[0]), "");
          return;
        }

        const [dateFrom, dateTo] = normalizedRange(
          toIsoDate(selectedDates[0]),
          toIsoDate(selectedDates[1]),
        );
        onRangeChangeRef.current(dateFrom, dateTo);
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

    picker.setDate([start, end].filter(Boolean), false, "Y-m-d");
    if (start || end) {
      picker.jumpToDate(start || end);
    }
    if (inputRef.current) {
      inputRef.current.value = formatRangeLabel(start, end);
    }
  }, [start, end]);

  const openPicker = () => {
    onOpen?.();
    pickerRef.current?.open();
  };

  return (
    <div className="relative date-range-control">
      <div className="flex h-11 items-center rounded-lg border border-gray-300 bg-white shadow-theme-xs dark:border-gray-700 dark:bg-gray-900">
        <div className="relative min-w-0 flex-1">
          <input
            ref={inputRef}
            readOnly
            value={formatRangeLabel(start, end)}
            onClick={openPicker}
            className="h-11 w-full rounded-l-lg bg-transparent py-2 pl-12 pr-3 text-sm text-gray-800 outline-hidden dark:text-white/90"
            aria-label="Date range"
          />
          <CalendarDays className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-gray-500" />
        </div>
        <div className="flex items-center gap-1 border-l border-gray-200 px-2 dark:border-gray-800">
          <button
            type="button"
            onClick={() => onStepRange(-1)}
            className="inline-flex size-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-white/5"
            aria-label="Previous date range"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => onStepRange(1)}
            className="inline-flex size-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-white/5"
            aria-label="Next date range"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>
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
      static: true,
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
        className={`${compactInputClass} pr-10`}
      />
      <CalendarDays className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
    </div>
  );
}

function BookingTableColumns() {
  return (
    <colgroup>
      <col className="w-[12%]" />
      <col className="w-[16%]" />
      <col className="w-[7%]" />
      <col className="w-[14%]" />
      <col className="w-[13%]" />
      <col className="w-[16%]" />
      <col className="w-[13%]" />
      <col className="w-[9%]" />
    </colgroup>
  );
}

function BookingRow({
  booking,
  statusValue,
  tableMarkedValue,
  isTableMarkSaving,
  onStatusChange,
  onTableMarkToggle,
  onOpen,
}: {
  booking: Booking;
  statusValue: string;
  tableMarkedValue?: boolean;
  isTableMarkSaving?: boolean;
  onStatusChange: (value: string) => void;
  onTableMarkToggle: (value: boolean) => void;
  onOpen: () => void;
}) {
  const areaLabel = bookingAreaLabel(booking);
  const tableLabel = bookingTableLabel(booking);
  const showAreaLabel = areaLabel && areaLabel !== tableLabel;
  const canMarkTable = bookingCanBeTableMarked(booking);
  const tableMarked = tableMarkedValue ?? truthy(booking.table_marked);
  const detailText = [booking.custom_answers_summary, booking.notes, booking.event_type]
    .filter(Boolean)
    .join("\n");

  return (
    <TableRow
      role="button"
      tabIndex={0}
      aria-label={`Open ${booking.booking_reference} details`}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      className="cursor-pointer bg-white align-top transition hover:bg-gray-50/60 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:bg-transparent dark:hover:bg-white/[0.03]"
    >
      <TableCell className="px-5 py-5 text-start">
        <p className="whitespace-nowrap text-sm font-semibold text-gray-900 dark:text-white/90">
          {formatDisplayTime(booking.start_time)}
        </p>
        <p className="mt-1 whitespace-nowrap text-theme-xs text-gray-500 dark:text-gray-400">
          {formatDisplayDate(booking.booking_date)}
        </p>
      </TableCell>
      <TableCell className="px-5 py-5 text-start">
        <p className="font-semibold text-gray-900 text-theme-sm dark:text-white/90">{booking.customer_name}</p>
        <p className="mt-1 text-theme-xs text-gray-500 dark:text-gray-400">{booking.customer_phone || "-"}</p>
      </TableCell>
      <TableCell className="px-5 py-5 text-start">
        <div className="inline-flex items-center gap-2 font-semibold text-gray-900 text-theme-sm dark:text-white/90">
          <User className="size-4 text-gray-400" />
          {booking.guest_count}
        </div>
      </TableCell>
      <TableCell className="px-5 py-5 text-start">
        <p className="font-semibold text-gray-900 text-theme-sm dark:text-white/90">{tableLabel}</p>
        {showAreaLabel ? (
          <p className="mt-1 text-theme-xs text-gray-500 dark:text-gray-400">{areaLabel}</p>
        ) : null}
      </TableCell>
      <TableCell className="px-5 py-5 text-start">
        <div onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
          <SelectInput
            value={statusValue}
            onChange={onStatusChange}
            ariaLabel={`${booking.booking_reference} status`}
            className="inline-flex min-w-[148px]"
            buttonClassName={`!h-9 !rounded-lg !py-1 !pl-3 !pr-2 text-center text-theme-xs font-semibold capitalize ${
              statusControlStyles[statusValue] || "border-gray-200 bg-gray-50 text-gray-700"
            }`}
            menuClassName="min-w-[160px]"
            options={statusOptionsFor(booking).map((status) => ({
              value: status,
              label: statusDisplayLabel(status),
            }))}
          />
        </div>
      </TableCell>
      <TableCell className="px-5 py-5 text-start">
        <p
          className="max-w-[220px] truncate text-theme-sm text-gray-500 dark:text-gray-400"
          title={detailText || "-"}
        >
          {detailText || "-"}
        </p>
      </TableCell>
      <TableCell className="px-5 py-5 text-start">
        <p
          className="max-w-[220px] truncate text-theme-sm text-gray-500 dark:text-gray-400"
          title={booking.staff_notes || "-"}
        >
          {booking.staff_notes || "-"}
        </p>
      </TableCell>
      <TableCell className="px-3 py-5 text-center">
        <button
          type="button"
          disabled={!canMarkTable || isTableMarkSaving}
          title={
            canMarkTable
              ? tableMarked
                ? "Reserve Sign placed. Click to clear."
                : "Reserve Sign not placed. Click once placed."
              : "Reserve Sign unavailable"
          }
          aria-label={
            canMarkTable
              ? tableMarked
                ? `Clear Reserve Sign for ${booking.booking_reference}`
                : `Set Reserve Sign placed for ${booking.booking_reference}`
              : `${booking.booking_reference} Reserve Sign is unavailable`
          }
          onClick={(event) => {
            event.stopPropagation();
            if (canMarkTable && !isTableMarkSaving) {
              onTableMarkToggle(!tableMarked);
            }
          }}
          onKeyDown={(event) => event.stopPropagation()}
          className={`inline-flex size-9 items-center justify-center rounded-lg border transition ${
            !canMarkTable
              ? "cursor-not-allowed border-gray-200 bg-gray-50 text-gray-300 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-600"
              : tableMarked
                ? "border-success-200 bg-success-50 text-success-700 hover:bg-success-100 dark:border-success-500/30 dark:bg-success-500/15 dark:text-success-300"
                : "border-warning-200 bg-warning-50 text-warning-700 hover:bg-warning-100 dark:border-warning-500/30 dark:bg-warning-500/15 dark:text-orange-300"
          } ${isTableMarkSaving ? "opacity-60" : ""}`}
        >
          <TableProperties className="size-4" />
        </button>
      </TableCell>
    </TableRow>
  );
}

export default function BookingsPage() {
  const location = useLocation();
  const [meta, setMeta] = useState<MetaPayload | null>(null);
  const [tablesData, setTablesData] = useState<TablesPayload | null>(null);
  const [data, setData] = useState<Paginated<Booking> | null>(null);
  const [filters, setFilters] = useState(() => bookingFiltersFromLocation(location.search));
  const [page, setPage] = useState(1);
  const [form, setForm] = useState<ManualBookingForm>(emptyManualBooking);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);
  const [bookingModalMode, setBookingModalMode] = useState<BookingModalMode>("view");
  const [editActionsReady, setEditActionsReady] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isCreateEndTimeManual, setIsCreateEndTimeManual] = useState(false);
  const [isEditEndTimeManual, setIsEditEndTimeManual] = useState(false);
  const [isEditTablePickerOpen, setIsEditTablePickerOpen] = useState(false);
  const [editForm, setEditForm] = useState<ManualBookingForm>(emptyManualBooking);
  const [statusEdits, setStatusEdits] = useState<Record<number, string>>({});
  const [tableMarkEdits, setTableMarkEdits] = useState<Record<number, boolean | undefined>>({});
  const [bulkReserveSignGroupKey, setBulkReserveSignGroupKey] = useState<string | null>(null);
  const [reserveSignConfirm, setReserveSignConfirm] = useState<ReserveSignConfirmState | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("time_earliest");
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<BookingGroup["key"], boolean>>({
    lunch: true,
    dinner: true,
    functions: true,
  });
  const [createAvailability, setCreateAvailability] = useState<AvailabilityLoadState>({
    items: [],
    loading: false,
  });
  const [editAvailability, setEditAvailability] = useState<AvailabilityLoadState>({
    items: [],
    loading: false,
  });
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [modalMessage, setModalMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [notifyPrompt, setNotifyPrompt] = useState<NotifyPromptState | null>(null);
  const [replyTarget, setReplyTarget] = useState<Booking | null>(null);
  const [replyOpenRequest, setReplyOpenRequest] = useState<{ token: number; purpose: ReplyPurpose } | undefined>();

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), per_page: "50", type: "all" });
    if (filters.search) params.set("search", filters.search);
    if (filters.status) params.set("status", filters.status);
    if (filters.date_from) params.set("date_from", filters.date_from);
    if (filters.date_to) params.set("date_to", filters.date_to);
    return params.toString();
  }, [filters, page]);

  const loadBookings = useCallback(async () => {
    const [metaPayload, bookingPayload, tablesPayload] = await Promise.all([
      apiFetch<MetaPayload>("meta"),
      apiFetch<Paginated<Booking>>(`bookings?${query}`),
      apiFetch<TablesPayload>("tables"),
    ]);
    setMeta(metaPayload);
    setData(bookingPayload);
    setTablesData(tablesPayload);
  }, [query]);

  useEffect(() => {
    loadBookings().catch((err) => {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Bookings failed to load.",
      });
    });
  }, [loadBookings]);

  useEffect(() => {
    setPage(1);
    setFilters(bookingFiltersFromLocation(location.search));
  }, [location.search]);

  useEffect(() => {
    if (!isCreateOpen || !form.date) {
      setCreateAvailability({ items: [], loading: false });
      return undefined;
    }

    let cancelled = false;
    const params = new URLSearchParams({
      page: "1",
      per_page: "100",
      type: "all",
      date_from: form.date,
      date_to: form.date,
    });

    setCreateAvailability((current) => ({ ...current, loading: true, error: undefined }));
    apiFetch<Paginated<Booking>>(`bookings?${params.toString()}`)
      .then((payload) => {
        if (!cancelled) {
          setCreateAvailability({ items: payload.items, loading: false });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setCreateAvailability({
            items: [],
            loading: false,
            error: err instanceof Error ? err.message : "Availability could not be checked.",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isCreateOpen, form.date]);

  useEffect(() => {
    if (!editingBooking || bookingModalMode !== "edit" || !editForm.date) {
      setEditAvailability({ items: [], loading: false });
      return undefined;
    }

    let cancelled = false;
    const params = new URLSearchParams({
      page: "1",
      per_page: "100",
      type: "all",
      date_from: editForm.date,
      date_to: editForm.date,
    });

    setEditAvailability((current) => ({ ...current, loading: true, error: undefined }));
    apiFetch<Paginated<Booking>>(`bookings?${params.toString()}`)
      .then((payload) => {
        if (!cancelled) {
          setEditAvailability({ items: payload.items, loading: false });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setEditAvailability({
            items: [],
            loading: false,
            error: err instanceof Error ? err.message : "Availability could not be checked.",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [bookingModalMode, editingBooking, editForm.date]);

  const groupedBookings = useMemo(
    () => groupBookings(sortedBookings(data?.items || [], sortKey), meta?.booking_types || []),
    [data, meta?.booking_types, sortKey],
  );
  const defaultDurationMinutes = Number(meta?.settings.default_duration_minutes || 120);
  const selectedCreateBookingType = (meta?.booking_types || []).find((type) => String(type.id) === form.booking_type_id);
  const selectedCreateMode = bookingModeFromBookingType(selectedCreateBookingType, "table");
  const selectedEditBookingType = (meta?.booking_types || []).find((type) => String(type.id) === editForm.booking_type_id);
  const selectedEditMode = editingBooking
    ? bookingModeFromBookingType(selectedEditBookingType, editingBooking.booking_type)
    : "table";
  const autoCreateDurationMinutes = Math.max(Number(selectedCreateBookingType?.schedule?.duration_minutes || defaultDurationMinutes), 15);
  const createDurationMinutes = durationFromTimeRange(form.time, form.end_time, autoCreateDurationMinutes);
  const autoEditDurationMinutes = bookingDurationMinutes(editingBooking, defaultDurationMinutes);
  const editDurationMinutes = durationFromTimeRange(editForm.time, editForm.end_time, autoEditDurationMinutes);
  const createTableAvailability = useMemo(
    () =>
      buildTableAvailability({
        bookings: createAvailability.items,
        date: form.date,
        time: form.time,
        durationMinutes: createDurationMinutes,
        contextBookingType: selectedCreateMode,
      }),
    [createAvailability.items, createDurationMinutes, form.date, form.time, selectedCreateMode],
  );
  const editTableAvailability = useMemo(
    () =>
      buildTableAvailability({
        bookings: editAvailability.items,
        date: editForm.date,
        time: editForm.time,
        durationMinutes: editDurationMinutes,
        excludeBookingId: editingBooking?.id,
        contextBookingType: selectedEditMode,
        contextBookingSessionId: editingBooking?.booking_session_id ?? null,
      }),
    [editAvailability.items, editDurationMinutes, editForm.date, editForm.time, editingBooking?.booking_session_id, editingBooking?.id, selectedEditMode],
  );
  const createAvailabilityKey = tableAvailabilityKey(createTableAvailability);
  const editAvailabilityKey = tableAvailabilityKey(editTableAvailability);

  useEffect(() => {
    if (!isCreateOpen || !tablesData) return;

    setForm((current) => {
      const availableIds = current.table_ids.filter(
        (tableId) => !isTableUnavailable(tableId, tablesData.tables, createTableAvailability),
      );
      return availableIds.length === current.table_ids.length ? current : { ...current, table_ids: availableIds };
    });
  }, [createAvailabilityKey, createTableAvailability, isCreateOpen, tablesData]);

  useEffect(() => {
    if (!isCreateOpen || isCreateEndTimeManual) return;

    const nextEndTime = endTimeFromStart(form.time, autoCreateDurationMinutes);
    if (!nextEndTime || form.end_time === nextEndTime) return;

    setForm((current) => (
      current.end_time === nextEndTime ? current : { ...current, end_time: nextEndTime }
    ));
  }, [autoCreateDurationMinutes, form.end_time, form.time, isCreateEndTimeManual, isCreateOpen]);

  useEffect(() => {
    if (!editingBooking || bookingModalMode !== "edit" || !tablesData) return;
    if (selectedEditMode === "function") return;

    setEditForm((current) => {
      const availableIds = current.table_ids.filter(
        (tableId) => !isTableUnavailable(tableId, tablesData.tables, editTableAvailability),
      );
      return availableIds.length === current.table_ids.length ? current : { ...current, table_ids: availableIds };
    });
  }, [bookingModalMode, editAvailabilityKey, editTableAvailability, editingBooking, selectedEditMode, tablesData]);

  useEffect(() => {
    if (!editingBooking || bookingModalMode !== "edit" || isEditEndTimeManual) return;

    const nextEndTime = endTimeFromStart(editForm.time, autoEditDurationMinutes);
    if (!nextEndTime || editForm.end_time === nextEndTime) return;

    setEditForm((current) => (
      current.end_time === nextEndTime ? current : { ...current, end_time: nextEndTime }
    ));
  }, [autoEditDurationMinutes, bookingModalMode, editForm.end_time, editForm.time, editingBooking, isEditEndTimeManual]);

  useEffect(() => {
    if (!editingBooking || bookingModalMode !== "edit") {
      setEditActionsReady(false);
      return undefined;
    }

    const readyTimer = window.setTimeout(() => setEditActionsReady(true), 250);
    return () => window.clearTimeout(readyTimer);
  }, [bookingModalMode, editingBooking]);

  useEffect(() => {
    if (selectedEditMode === "function") {
      setIsEditTablePickerOpen(false);
    }
  }, [selectedEditMode]);

  const updateForm = <K extends keyof ManualBookingForm>(field: K, value: ManualBookingForm[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const updateEditForm = <K extends keyof ManualBookingForm>(
    field: K,
    value: ManualBookingForm[K],
  ) => {
    setEditForm((current) => ({ ...current, [field]: value }));
  };

  const updateCreateBookingType = (bookingTypeId: string) => {
    const bookingType = (meta?.booking_types || []).find((type) => String(type.id) === bookingTypeId);
    const nextMode = bookingModeFromBookingType(bookingType, "table");

    setIsCreateEndTimeManual(false);
    setForm((current) => ({
      ...current,
      booking_type_id: bookingTypeId,
      table_ids: nextMode === "function" ? [] : current.table_ids,
      assigned_area_id: nextMode === "function" ? current.assigned_area_id : "",
      assigned_area_ids:
        nextMode === "function"
          ? current.assigned_area_ids.length
            ? current.assigned_area_ids
            : current.assigned_area_id
              ? [current.assigned_area_id]
              : []
          : [],
      event_type: nextMode === "table" ? "" : bookingType?.name || current.event_type || "",
    }));
  };

  const updateEditBookingType = (bookingTypeId: string) => {
    const bookingType = (meta?.booking_types || []).find((type) => String(type.id) === bookingTypeId);
    const nextMode = bookingModeFromBookingType(bookingType, editingBooking?.booking_type || "table");

    if (nextMode === "function") {
      setIsEditTablePickerOpen(false);
    }

    setEditForm((current) => ({
      ...current,
      booking_type_id: bookingTypeId,
      table_ids: nextMode === "function" ? [] : current.table_ids,
      assigned_area_id: nextMode === "function" ? current.assigned_area_id : "",
      assigned_area_ids:
        nextMode === "function"
          ? current.assigned_area_ids.length
            ? current.assigned_area_ids
            : current.assigned_area_id
              ? [current.assigned_area_id]
              : []
          : [],
      event_type: nextMode === "function" ? current.event_type || bookingType?.name || "" : current.event_type,
    }));
  };

  const openCreateModal = () => {
    const defaultBookingType = (meta?.booking_types || []).find((type) => Number(type.is_active) === 1);
    const defaultMode = bookingModeFromBookingType(defaultBookingType, "table");

    setModalMessage(null);
    setIsCreateEndTimeManual(false);
    setForm({
      ...emptyManualBooking,
      booking_type_id: defaultBookingType ? String(defaultBookingType.id) : "",
      event_type: defaultMode === "table" ? "" : defaultBookingType?.name || "",
      date: todayIso(),
      time: "18:00",
      guest_count: "8",
    });
    setIsCreateOpen(true);
  };

  const closeCreateModal = () => {
    setModalMessage(null);
    setIsCreateEndTimeManual(false);
    setIsCreateOpen(false);
  };

  const openBookingModal = (booking: Booking, mode: BookingModalMode = "view") => {
    setModalMessage(null);
    setIsSavingEdit(false);
    setIsEditEndTimeManual(false);
    setIsEditTablePickerOpen(false);
    setEditingBooking(booking);
    setBookingModalMode(mode);
    setEditActionsReady(mode === "edit");
    setEditForm(editFormFromBooking(booking));
  };

  const closeEditModal = () => {
    setModalMessage(null);
    setIsSavingEdit(false);
    setIsEditEndTimeManual(false);
    setIsEditTablePickerOpen(false);
    setEditActionsReady(false);
    setEditingBooking(null);
    setBookingModalMode("view");
    setEditForm(emptyManualBooking);
  };

  const startEditBooking = (event?: React.MouseEvent<HTMLButtonElement>) => {
    event?.preventDefault();
    event?.stopPropagation();
    if (!editingBooking) return;
    setModalMessage(null);
    setIsSavingEdit(false);
    setIsEditEndTimeManual(false);
    setIsEditTablePickerOpen(false);
    setEditActionsReady(false);
    setEditForm(editFormFromBooking(editingBooking));
    setBookingModalMode("edit");
  };

  const cancelEditBooking = () => {
    if (editingBooking) {
      setEditForm(editFormFromBooking(editingBooking));
    }
    setModalMessage(null);
    setIsSavingEdit(false);
    setIsEditEndTimeManual(false);
    setIsEditTablePickerOpen(false);
    setEditActionsReady(false);
    setBookingModalMode("view");
  };

  const openReplyFromPrompt = (booking: Booking, purpose: ReplyPurpose) => {
    setReplyTarget(booking);
    setNotifyPrompt(null);
    setReplyOpenRequest({ token: Date.now(), purpose });
  };

  const updateDateRange = (dateFrom: string, dateTo: string, scope: DateScope = "") => {
    setPage(1);
    setFilters((current) => ({
      ...current,
      date_from: dateFrom,
      date_to: dateTo,
      date_scope: scope,
    }));

  };

  const updateDateScope = (scope: Exclude<DateScope, "">) => {
    const today = todayIso();
    updateDateRange(
      scope === "past" ? "" : scope === "upcoming" ? addDaysIso(1) : today,
      scope === "today" ? today : scope === "past" ? addDaysIso(-1) : "",
      scope,
    );
  };

  const toggleGroup = (groupKey: BookingGroup["key"]) => {
    setExpandedGroups((current) => ({
      ...current,
      [groupKey]: !current[groupKey],
    }));
  };

  const updateSort = (value: SortKey) => {
    setSortKey(value);
    setIsSortOpen(false);
  };

  const stepDateRange = (days: number) => {
    const currentStart = parseIsoDate(filters.date_from);
    const currentEnd = parseIsoDate(filters.date_to);
    const fallback = parseIsoDate(todayIso()) || new Date();
    const nextStart = addDays(currentStart || currentEnd || fallback, days);
    const nextEnd = addDays(currentEnd || currentStart || fallback, days);

    updateDateRange(toIsoDate(nextStart), toIsoDate(nextEnd));
  };

  const createBooking = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    setModalMessage(null);

    try {
      const submittedEndTime = form.end_time || endTimeFromStart(form.time, createDurationMinutes);

      if (!submittedEndTime || minutesFromTime(submittedEndTime) <= minutesFromTime(form.time)) {
        setModalMessage({ type: "error", text: "End time must be after the start time." });
        return;
      }

      if (selectedCreateMode === "function" && !form.assigned_area_ids.length) {
        setModalMessage({ type: "error", text: "Select at least one function area." });
        return;
      }

      if (selectedCreateMode !== "function" && !form.table_ids.length) {
        setModalMessage({ type: "error", text: "Select at least one table." });
        return;
      }

      const response = await apiFetch<{ booking_reference: string; assigned_area: string }>("bookings", {
        method: "POST",
        ...toJsonBody({
          ...form,
          guest_count: Number(form.guest_count),
          end_time: submittedEndTime,
          booking_type_id: form.booking_type_id ? Number(form.booking_type_id) : undefined,
          table_ids: form.table_ids.map(Number),
          table_marked: createCanMarkTable && form.table_marked,
          assigned_area_ids: form.assigned_area_ids.map(Number),
          assigned_area_id: form.assigned_area_ids[0] || null,
          event_type: selectedCreateMode === "table" ? undefined : form.event_type || selectedCreateBookingType?.name || undefined,
        }),
      });
      setMessage({
        type: "success",
        text: `Booking ${response.booking_reference} created and assigned to ${response.assigned_area}.`,
      });
      setForm(emptyManualBooking);
      closeCreateModal();
      await loadBookings();
    } catch (err) {
      setModalMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Booking could not be created.",
      });
    }
  };

  const saveStatus = async (booking: Booking, status: string) => {
    setStatusEdits((current) => ({ ...current, [booking.id]: status }));

    try {
      const response = await apiFetch<{ item: Booking }>(`bookings/${booking.id}`, {
        method: "PUT",
        ...toJsonBody({ status }),
      });
      setMessage({ type: "success", text: `${booking.booking_reference} updated.` });
      const prompt = customerNoticeForStatusChange(booking.status, status, response.item);
      setEditingBooking((current) => (current?.id === booking.id ? response.item : current));
      setEditForm((current) => (booking.id === editingBooking?.id ? { ...current, status } : current));
      if (prompt) {
        setNotifyPrompt(prompt);
      }
      setStatusEdits((current) => {
        const next = { ...current };
        delete next[booking.id];
        return next;
      });
      await loadBookings();
    } catch (err) {
      setStatusEdits((current) => {
        const next = { ...current };
        delete next[booking.id];
        return next;
      });
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Status could not be updated.",
      });
    }
  };

  const saveTableMark = async (booking: Booking, tableMarked: boolean) => {
    if (!bookingCanBeTableMarked(booking)) return;

    setTableMarkEdits((current) => ({ ...current, [booking.id]: tableMarked }));

    try {
      const response = await apiFetch<{ item: Booking }>(`bookings/${booking.id}`, {
        method: "PUT",
        ...toJsonBody({ table_marked: tableMarked }),
      });
      setMessage({ type: "success", text: tableMarked ? "Reserve Sign placed." : "Reserve Sign cleared." });
      setEditingBooking((current) => (current?.id === booking.id ? response.item : current));
      setEditForm((current) => (booking.id === editingBooking?.id ? { ...current, table_marked: tableMarked } : current));
      await loadBookings();
      setTableMarkEdits((current) => {
        const next = { ...current };
        delete next[booking.id];
        return next;
      });
    } catch (err) {
      setTableMarkEdits((current) => {
        const next = { ...current };
        delete next[booking.id];
        return next;
      });
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Reserve Sign could not be updated.",
      });
    }
  };

  const openBulkReserveSignConfirm = (group: BookingGroup) => {
    const date = filters.date_from && filters.date_to && filters.date_from === filters.date_to
      ? filters.date_from
      : "";

    if (!date) {
      setMessage({ type: "error", text: "Select a single day before updating Reserve Signs by group." });
      return;
    }

    const eligibleBookings = group.items.filter(bookingCanBulkUpdateReserveSign);
    const shouldPlaceReserveSigns = eligibleBookings.some((booking) => !truthy(booking.table_marked));
    const bookingIds = eligibleBookings
      .filter((booking) => truthy(booking.table_marked) !== shouldPlaceReserveSigns)
      .map((booking) => booking.id);

    if (!eligibleBookings.length) {
      setMessage({ type: "success", text: `${group.title} has no active bookings to update.` });
      return;
    }

    if (!bookingIds.length) {
      setMessage({ type: "success", text: `${group.title} Reserve Signs are already up to date.` });
      return;
    }

    const actionLabel = shouldPlaceReserveSigns ? "Place" : "Clear";
    const resultLabel = shouldPlaceReserveSigns ? "placed" : "cleared";
    setReserveSignConfirm({
      groupKey: group.key,
      groupTitle: group.title,
      date,
      bookingIds,
      tableMarked: shouldPlaceReserveSigns,
      actionLabel,
      resultLabel,
    });
  };

  const confirmBulkReserveSigns = async () => {
    if (!reserveSignConfirm) return;

    try {
      setBulkReserveSignGroupKey(reserveSignConfirm.groupKey);
      const response = await apiFetch<{ updated: number; date: string; table_marked: number }>("bookings/reserve-signs/bulk", {
        method: "POST",
        ...toJsonBody({
          date: reserveSignConfirm.date,
          table_marked: reserveSignConfirm.tableMarked,
          booking_ids: reserveSignConfirm.bookingIds,
        }),
      });
      setMessage({
        type: "success",
        text: response.updated === 1
          ? `Reserve Sign ${reserveSignConfirm.resultLabel} for 1 ${reserveSignConfirm.groupTitle} booking.`
          : `Reserve Signs ${reserveSignConfirm.resultLabel} for ${response.updated} ${reserveSignConfirm.groupTitle} bookings.`,
      });
      setReserveSignConfirm(null);
      await loadBookings();
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : `${reserveSignConfirm.groupTitle} Reserve Signs could not be updated.`,
      });
    } finally {
      setBulkReserveSignGroupKey(null);
    }
  };

  const saveEditBooking = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingBooking) return;
    if (!editActionsReady || isSavingEdit) return;
    setModalMessage(null);

    const submittedEndTime = editForm.end_time || endTimeFromStart(editForm.time, editDurationMinutes);

    if (!submittedEndTime || minutesFromTime(submittedEndTime) <= minutesFromTime(editForm.time)) {
      setModalMessage({ type: "error", text: "End time must be after the start time." });
      return;
    }

    const payload =
      selectedEditMode === "table"
        ? {
            table_ids: editForm.table_ids.map(Number),
          }
        : selectedEditMode === "function"
          ? {
              assigned_area_ids: editForm.assigned_area_ids.map(Number),
              assigned_area_id: editForm.assigned_area_ids[0] || null,
            }
          : selectedEditMode === "event"
            ? {
                table_ids: editForm.table_ids.map(Number),
              }
            : {};

    if (selectedEditMode === "table" && !editForm.table_ids.length) {
      setModalMessage({ type: "error", text: "Select at least one table." });
      return;
    }
    if (selectedEditMode === "function" && !editForm.assigned_area_ids.length) {
      setModalMessage({ type: "error", text: "Select at least one function area." });
      return;
    }
    if (
      selectedEditMode === "event" &&
      !editForm.table_ids.length &&
      !["pending", "waitlist", "cancelled", "declined", "no_show"].includes(editForm.status || editingBooking.status)
    ) {
      setModalMessage({ type: "error", text: "Select at least one table for this event booking." });
      return;
    }

    try {
      setIsSavingEdit(true);
      const response = await apiFetch<{ item: Booking }>(`bookings/${editingBooking.id}`, {
        method: "PUT",
        ...toJsonBody({
          name: editForm.name,
          email: editForm.email,
          phone: editForm.phone,
          date: editForm.date,
          time: editForm.time,
          end_time: submittedEndTime,
          guest_count: Number(editForm.guest_count),
          booking_type_id: editForm.booking_type_id ? Number(editForm.booking_type_id) : undefined,
          preferred_area_id: editForm.preferred_area_id ? Number(editForm.preferred_area_id) : null,
          notes: editForm.notes,
          staff_notes: editForm.staff_notes,
          staff_name: editForm.staff_name,
          table_marked: editCanMarkTable && editForm.table_marked,
          status: editForm.status,
          event_type:
            selectedEditMode === "function"
              ? editForm.event_type || editServiceLabel
              : selectedEditMode === "event"
                ? editServiceLabel
                : null,
          ...payload,
        }),
      });

      setMessage({ type: "success", text: "Booking updated." });
      const nextStatus = editForm.status || editingBooking.status;
      const prompt = customerNoticeForStatusChange(editingBooking.status, nextStatus, response.item);
      setEditingBooking(response.item);
      setEditForm(editFormFromBooking(response.item));
      setBookingModalMode("view");
      await loadBookings();
      if (prompt) {
        setNotifyPrompt(prompt);
      }
    } catch (err) {
      setModalMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Booking could not be updated.",
      });
    } finally {
      setIsSavingEdit(false);
    }
  };

  if ((!data || !meta || !tablesData) && message?.type === "error") {
    return <FormMessage type="error">{message.text}</FormMessage>;
  }

  if (!data || !meta || !tablesData) {
    return <LoadingState label="Loading bookings" />;
  }

  const createBookingTypeOptions = [
    ...(meta.booking_types || [])
      .filter((type) => Number(type.is_active) === 1)
      .map((type) => ({ value: String(type.id), label: type.name })),
  ];
  const createTypeReservedAreaIds = bookingTypeReservedAreaIds(selectedCreateBookingType);
  const createTableVisibleAreaIds = selectedCreateMode === "event" && createTypeReservedAreaIds.length
    ? createTypeReservedAreaIds
    : undefined;
  const createFunctionAreaOptions = (meta.function_areas || []).map((area) => ({
    value: String(area.id),
    label: area.name,
  }));
  const createFunctionAreaDisplay = createFunctionAreaOptions
    .filter((option) => form.assigned_area_ids.includes(option.value))
    .map((option) => option.label)
    .join(", ");
  const createCanMarkTable = true;
  const createEndTime = form.end_time || endTimeFromStart(form.time, createDurationMinutes);
  const editEndTime = editForm.end_time || endTimeFromStart(editForm.time, editDurationMinutes);
  const selectedTypeReservedAreaIds = bookingTypeReservedAreaIds(selectedEditBookingType);
  const existingEventReservedAreaIds = editingBooking ? parseTableIds(editingBooking.event_reserved_area_ids) : [];
  const editTableVisibleAreaIds =
    selectedEditMode === "event"
      ? selectedTypeReservedAreaIds.length
        ? selectedTypeReservedAreaIds
        : existingEventReservedAreaIds
      : undefined;
  const editTableVisibleAreaSet = editTableVisibleAreaIds?.length ? new Set(editTableVisibleAreaIds) : null;
  const editSelectedTables = tablesData.tables
    .filter((table) => editForm.table_ids.includes(String(table.id)))
    .sort((left, right) => Number(left.table_number) - Number(right.table_number));
  const editSelectedTableNumbers = editSelectedTables.map((table) => table.table_number).join(", ");
  const editSelectedTableCapacity = editSelectedTables.reduce((total, table) => total + Number(table.capacity), 0);
  const editSelectedAreaNames = Array.from(
    new Set(
      editSelectedTables
        .map((table) => tablesData.areas.find((area) => Number(area.id) === Number(table.area_id))?.name)
        .filter(Boolean),
    ),
  ).join(", ");
  const editHasTableChoices = tablesData.tables
    .filter((table) => !editTableVisibleAreaSet || editTableVisibleAreaSet.has(String(table.area_id)))
    .length > 0;
  const bookingHeaderStatus = editingBooking
    ? bookingModalMode === "edit"
      ? editForm.status || editingBooking.status
      : statusEdits[editingBooking.id] || editingBooking.status
    : "";
  const EditServiceIcon = editingBooking
    ? getBookingIcon(
        (meta.booking_types || []).find((type) => String(type.id) === editForm.booking_type_id)?.icon || editingBooking.booking_type_icon,
        selectedEditMode === "table" ? Utensils : CalendarCheck,
      )
    : CalendarCheck;
  const editServiceLabel = editingBooking
    ? selectedEditBookingType?.name || bookingServiceLabel(editingBooking)
    : "";
  const editServiceColour = editingBooking
    ? bookingTypeColourVars(selectedEditBookingType?.colour || editingBooking.booking_type_colour)
    : undefined;
  const editBookingTypeOptions =
    editingBooking
      ? (meta.booking_types || [])
          .filter((type) => {
            const isCurrent = String(type.id) === editForm.booking_type_id;
            return Number(type.is_active) === 1 || isCurrent;
          })
          .map((type) => ({ value: String(type.id), label: type.name }))
      : [];
  const editFunctionAreaOptions = (meta.function_areas || []).map((area) => ({
    value: String(area.id),
    label: area.name,
  }));
  const editPreferredAreaOptions = [
    { value: "", label: "No preference" },
    ...tablesData.areas
      .filter((area) => Number(area.active) === 1)
      .map((area) => ({ value: String(area.id), label: area.name })),
  ];
  const editFunctionAreaDisplay = editFunctionAreaOptions
    .filter((option) => editForm.assigned_area_ids.includes(option.value))
    .map((option) => option.label)
    .join(", ");
  const editAreaLabel =
    selectedEditMode === "function"
      ? editFunctionAreaDisplay || editingBooking?.assigned_area_names || editingBooking?.assigned_area_name || "Unassigned"
      : editSelectedAreaNames
        ? editSelectedAreaNames
      : editingBooking
        ? bookingAreaLabel(editingBooking)
        : "";
  const editCanMarkTable = true;
  const bulkReserveSignDate = filters.date_from && filters.date_to && filters.date_from === filters.date_to
    ? filters.date_from
    : "";
  const isReserveSignConfirmSaving = reserveSignConfirm
    ? bulkReserveSignGroupKey === reserveSignConfirm.groupKey
    : false;

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
          onLogged={loadBookings}
          openRequest={replyOpenRequest}
          buttonClassName="hidden"
        />
      ) : null}

      {message ? (
        <ToastMessage type={message.type} onDismiss={() => setMessage(null)}>
          {message.text}
        </ToastMessage>
      ) : null}

      {reserveSignConfirm ? (
        <div
          className="fixed inset-0 z-[1000000] flex items-center justify-center bg-black/45 px-4 py-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reserve-sign-confirm-title"
        >
          <div className="w-full max-w-md overflow-hidden rounded-lg border border-gray-200 bg-white shadow-theme-xl dark:border-gray-800 dark:bg-gray-dark">
            <div className="flex items-start gap-4 border-b border-gray-100 px-5 py-4 dark:border-gray-800">
              <span
                className={`flex size-11 shrink-0 items-center justify-center rounded-lg ${
                  reserveSignConfirm.tableMarked
                    ? "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-300"
                    : "bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-orange-300"
                }`}
              >
                <TableProperties className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 id="reserve-sign-confirm-title" className="text-lg font-semibold text-gray-950 dark:text-white">
                  {reserveSignConfirm.actionLabel} Reserve Signs
                </h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {reserveSignConfirm.groupTitle} · {formatDisplayDate(reserveSignConfirm.date)}
                </p>
              </div>
              <button
                type="button"
                disabled={isReserveSignConfirmSaving}
                onClick={() => setReserveSignConfirm(null)}
                className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:hover:bg-white/5"
                aria-label="Close Reserve Sign confirmation"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="px-5 py-5">
              <p className="text-sm leading-6 text-gray-700 dark:text-gray-300">
                {reserveSignConfirm.actionLabel} Reserve Signs for{" "}
                <span className="font-semibold text-gray-950 dark:text-white">
                  {pluralize(reserveSignConfirm.bookingIds.length, "booking")}
                </span>
                ?
              </p>
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-gray-100 px-5 py-4 dark:border-gray-800 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={isReserveSignConfirmSaving}
                onClick={() => setReserveSignConfirm(null)}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isReserveSignConfirmSaving}
                onClick={confirmBulkReserveSigns}
                className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold text-white shadow-theme-xs disabled:cursor-not-allowed disabled:opacity-60 ${
                  reserveSignConfirm.tableMarked
                    ? "bg-success-600 hover:bg-success-700"
                    : "bg-warning-600 hover:bg-warning-700"
                }`}
              >
                <TableProperties className="size-4" />
                {isReserveSignConfirmSaving ? "Updating..." : reserveSignConfirm.actionLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <PageHeader
        title="Bookings"
        action={
          <Button
            size="sm"
            onClick={openCreateModal}
            startIcon={<Plus className="size-4" />}
          >
            Create booking
          </Button>
        }
      />

      {isCreateOpen ? (
        <div
          className="fixed inset-0 z-999999 flex items-center justify-center overflow-y-auto bg-black/40 px-4 py-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-booking-title"
        >
          <div className="w-full max-w-6xl rounded-2xl border border-gray-200 bg-white shadow-theme-xl dark:border-gray-800 dark:bg-gray-dark">
            <div className="flex items-center justify-between gap-4 border-b border-gray-200 px-5 py-3 dark:border-gray-800">
              <h2 id="create-booking-title" className="text-base font-semibold text-gray-900 dark:text-white/90">
                Create booking
              </h2>
              <button
                type="button"
                onClick={closeCreateModal}
                className="flex size-8 items-center justify-center rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-white/5"
                aria-label="Close create booking modal"
              >
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={createBooking} className="max-h-[calc(100vh-8rem)] overflow-y-auto p-4">
              {modalMessage ? (
                <div className="mb-4">
                  <FormMessage type={modalMessage.type}>{modalMessage.text}</FormMessage>
                </div>
              ) : null}

              <div className="grid gap-4 lg:grid-cols-[1fr_1.05fr]">
                <div className="space-y-3">
                  <section className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
                    <h3 className="mb-3 text-xs font-semibold uppercase text-gray-500">Customer</h3>
                    <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-2">
                      <div>
                        <FieldLabel htmlFor="manual-name" required>Name</FieldLabel>
                        <input
                          id="manual-name"
                          className={compactInputClass}
                          required
                          value={form.name}
                          onChange={(event) => updateForm("name", event.target.value)}
                        />
                      </div>
                      <div>
                        <FieldLabel htmlFor="manual-email">Email</FieldLabel>
                        <input
                          id="manual-email"
                          type="email"
                          className={compactInputClass}
                          value={form.email}
                          onChange={(event) => updateForm("email", event.target.value)}
                        />
                      </div>
                      <div>
                        <FieldLabel htmlFor="manual-phone">Phone</FieldLabel>
                        <input
                          id="manual-phone"
                          className={compactInputClass}
                          value={form.phone}
                          onChange={(event) => updateForm("phone", event.target.value)}
                        />
                      </div>
                    </div>
                  </section>

                  <section className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
                    <h3 className="mb-3 text-xs font-semibold uppercase text-gray-500">Booking</h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <FieldLabel htmlFor="manual-booking-type" required>Booking type</FieldLabel>
                        <SelectInput
                          id="manual-booking-type"
                          value={form.booking_type_id}
                          onChange={updateCreateBookingType}
                          buttonClassName="!h-10 !py-2"
                          menuClassName="min-w-[220px]"
                          options={
                            createBookingTypeOptions.length
                              ? createBookingTypeOptions
                              : [{ value: "", label: "No booking types available", disabled: true }]
                          }
                        />
                      </div>
                      <div>
                        <FieldLabel htmlFor="manual-guests" required>Guests</FieldLabel>
                        <input
                          id="manual-guests"
                          type="number"
                          min="1"
                          className={compactInputClass}
                          required
                          value={form.guest_count}
                          onChange={(event) => updateForm("guest_count", event.target.value)}
                        />
                      </div>
                      <div>
                        <FieldLabel htmlFor="manual-date" required>Date</FieldLabel>
                        <SingleDatePicker
                          id="manual-date"
                          required
                          value={form.date}
                          onChange={(value) => updateForm("date", value)}
                        />
                      </div>
                      <div>
                        <FieldLabel htmlFor="manual-time" required>Time</FieldLabel>
                        <input
                          id="manual-time"
                          type="time"
                          step="1800"
                          className={compactInputClass}
                          required
                          value={form.time}
                          onChange={(event) => updateForm("time", event.target.value)}
                        />
                      </div>
                      <div>
                        <FieldLabel htmlFor="manual-end-time" required>Time end</FieldLabel>
                        <input
                          id="manual-end-time"
                          type="time"
                          step="1800"
                          className={compactInputClass}
                          required
                          value={createEndTime}
                          onChange={(event) => {
                            setIsCreateEndTimeManual(true);
                            updateForm("end_time", event.target.value);
                          }}
                        />
                      </div>
                    </div>
                  </section>

                  <section className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <FieldLabel htmlFor="manual-staff-name">Staff name</FieldLabel>
                        <input
                          id="manual-staff-name"
                          className={compactInputClass}
                          value={form.staff_name}
                          onChange={(event) => updateForm("staff_name", event.target.value)}
                        />
                      </div>
                      <label
                        htmlFor="manual-table-marked"
                        className={`sm:col-span-2 flex items-start gap-3 rounded-lg border px-3 py-3 text-sm ${
                          createCanMarkTable
                            ? "border-gray-200 bg-white text-gray-700 dark:border-gray-800 dark:bg-white/[0.02] dark:text-gray-300"
                            : "border-gray-200 bg-gray-50 text-gray-400 dark:border-gray-800 dark:bg-white/[0.02]"
                        }`}
                      >
                        <input
                          id="manual-table-marked"
                          type="checkbox"
                          className="mt-1 size-4 rounded border-gray-300 text-success-600 focus:ring-success-500/20 disabled:cursor-not-allowed"
                          checked={createCanMarkTable && form.table_marked}
                          disabled={!createCanMarkTable}
                          onChange={(event) => updateForm("table_marked", event.target.checked)}
                        />
                        <span>
                          <span className="block font-semibold text-gray-900 dark:text-white/90">Reserve Sign placed</span>
                          <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
                            Reserve Sign has been placed for this booking.
                          </span>
                        </span>
                      </label>
                      <div>
                        <FieldLabel htmlFor="manual-notes">Notes</FieldLabel>
                        <textarea
                          id="manual-notes"
                          className={compactTextareaClass}
                          value={form.notes}
                          onChange={(event) => updateForm("notes", event.target.value)}
                        />
                      </div>
                      <div>
                        <FieldLabel htmlFor="manual-staff-notes">Staff Notes</FieldLabel>
                        <textarea
                          id="manual-staff-notes"
                          className={compactTextareaClass}
                          value={form.staff_notes}
                          onChange={(event) => updateForm("staff_notes", event.target.value)}
                        />
                      </div>
                    </div>
                  </section>
                </div>

                {selectedCreateMode === "function" ? (
                  <section className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
                    <h3 className="mb-3 text-xs font-semibold uppercase text-gray-500">Function areas</h3>
                    <MultiSelectInput
                      id="manual-function-areas"
                      values={form.assigned_area_ids}
                      onChange={(values) => updateForm("assigned_area_ids", values)}
                      placeholder="Select areas"
                      displayValue={createFunctionAreaDisplay || undefined}
                      buttonClassName="!h-10 !py-2"
                      menuClassName="min-w-[260px]"
                      options={
                        createFunctionAreaOptions.length
                          ? createFunctionAreaOptions
                          : [{ value: "", label: "No function areas available", disabled: true }]
                      }
                    />
                  </section>
                ) : (
                  <section className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
                    <h3 className="mb-3 text-xs font-semibold uppercase text-gray-500">Tables</h3>
                    <div id="manual-tables">
                      <TablePicker
                        areas={tablesData.areas}
                        tables={tablesData.tables}
                        selectedIds={form.table_ids}
                        onChange={(ids) => {
                          setForm((current) => ({
                            ...current,
                            table_ids: ids,
                          }));
                        }}
                        unavailableTableIds={createTableAvailability.unavailableTableIds}
                        blockedAreaIds={createTableAvailability.blockedAreaIds}
                        visibleAreaIds={createTableVisibleAreaIds}
                        isAvailabilityLoading={createAvailability.loading}
                        availabilityLabel={availabilityStatusLabel(form.date, form.time, createAvailability)}
                      />
                    </div>
                  </section>
                )}
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
                  Create booking
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {editingBooking ? (
        <div
          className="fixed inset-0 z-999999 flex items-center justify-center overflow-y-auto bg-black/40 px-4 py-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="booking-modal-title"
        >
          <div className="w-full max-w-7xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xl dark:border-gray-800 dark:bg-gray-dark">
            <div className="flex flex-col gap-4 border-b border-gray-200 px-5 py-4 dark:border-gray-800 lg:flex-row lg:flex-nowrap lg:items-center lg:justify-between lg:gap-6">
              <div className="flex min-w-0 items-center gap-4 lg:flex-1">
                <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-400">
                  <CalendarDays className="size-6" />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 id="booking-modal-title" className="text-xl font-semibold text-gray-950 dark:text-white">
                      {bookingModalMode === "edit" ? "Edit booking" : "Booking details"}
                    </h2>
                    <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600 dark:bg-white/10 dark:text-gray-300">
                      {editingBooking.booking_reference}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex w-full flex-wrap items-center justify-end gap-2 lg:w-auto lg:shrink-0 lg:flex-nowrap">
                <SelectInput
                  value={bookingHeaderStatus}
                  onChange={(value) => {
                    if (bookingModalMode === "edit") {
                      updateEditForm("status", value);
                      return;
                    }

                    saveStatus(editingBooking, value);
                  }}
                  ariaLabel={`${editingBooking.booking_reference} status`}
                  className="w-full sm:w-[170px] lg:w-[170px] lg:shrink-0"
                  buttonClassName={`!h-10 !rounded-lg !py-2 !pl-4 !pr-3 text-sm font-semibold capitalize ${
                    statusControlStyles[bookingHeaderStatus] || "border-gray-200 bg-gray-50 text-gray-700"
                  }`}
                  menuClassName="min-w-[170px]"
                  options={(bookingModalMode === "edit"
                    ? statusOptionsForMode(selectedEditMode, bookingHeaderStatus)
                    : statusOptionsFor(editingBooking)
                  ).map((status) => ({
                    value: status,
                    label: statusDisplayLabel(status),
                  }))}
                />
                {bookingModalMode === "view" ? (
                  <>
                    <button
                      type="button"
                      onClick={startEditBooking}
                      className="inline-flex h-10 min-w-[150px] items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-success-200 bg-success-50 px-4 text-sm font-semibold text-success-700 shadow-theme-xs hover:bg-success-100 dark:border-success-500/20 dark:bg-success-500/15 dark:text-success-300"
                    >
                      <Pencil className="size-4" />
                      Edit booking
                    </button>
                    <AiReplyComposer
                      booking={editingBooking}
                      onLogged={loadBookings}
                      buttonLabel="Send / Reply"
                      buttonClassName="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 shadow-theme-xs hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/5"
                    />
                  </>
                ) : (
                  <>
                    <button
                      type="submit"
                      form={`booking-edit-form-${editingBooking.id}`}
                      disabled={!editActionsReady || isSavingEdit}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-success-600 px-4 text-sm font-semibold text-white shadow-theme-xs hover:bg-success-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Save className="size-4" />
                      {isSavingEdit ? "Saving" : "Save changes"}
                    </button>
                    <button
                      type="button"
                      onClick={cancelEditBooking}
                      className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 shadow-theme-xs hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/5"
                    >
                      Cancel
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={closeEditModal}
                  className="flex size-10 items-center justify-center rounded-lg border border-gray-300 text-gray-500 shadow-theme-xs hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-white/5"
                  aria-label="Close booking modal"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>

            {bookingModalMode === "view" ? (
              <BookingDetailsPanel booking={editingBooking} />
            ) : (
            <form
              id={`booking-edit-form-${editingBooking.id}`}
              onSubmit={saveEditBooking}
              className="max-h-[calc(100vh-8rem)] overflow-y-auto bg-gray-50/40 p-5 dark:bg-white/[0.01]"
            >
              {modalMessage ? (
                <div className="mb-4">
                  <FormMessage type={modalMessage.type}>{modalMessage.text}</FormMessage>
                </div>
              ) : null}

              <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
                <div className="grid min-w-0 gap-5">
                  <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
                    <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(120px,140px)_minmax(180px,220px)] lg:items-end">
                      <div className="flex min-w-0 items-center gap-4 lg:items-center">
                        <span
                          className="flex size-16 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--booking-type-colour)_12%,white)] text-[var(--booking-type-colour)]"
                          style={editServiceColour}
                        >
                          <EditServiceIcon className="size-7" />
                        </span>
                        <div className="min-w-0">
                          <h3 className="truncate text-2xl font-semibold text-gray-950 dark:text-white">
                            {editForm.name || editingBooking.customer_name}
                          </h3>
                          <p className="mt-1 text-sm font-semibold text-gray-500 dark:text-gray-400">
                            {editServiceLabel}
                          </p>
                        </div>
                      </div>

                      <div className="min-w-0">
                        <FieldLabel htmlFor="edit-guests" required>Party size</FieldLabel>
                        <div className="relative">
                          <Users className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
                          <input
                            id="edit-guests"
                            type="number"
                            min="1"
                            className={`${compactInputClass} pl-10`}
                            required
                            value={editForm.guest_count}
                            onChange={(event) => updateEditForm("guest_count", event.target.value)}
                          />
                        </div>
                      </div>

                      {selectedEditMode === "table" || selectedEditMode === "event" ? (
                        <div className="min-w-0">
                          <FieldLabel htmlFor="edit-assigned-table" required>Assigned tables</FieldLabel>
                          <button
                            id="edit-assigned-table"
                            type="button"
                            disabled={!editHasTableChoices}
                            onClick={() => setIsEditTablePickerOpen(true)}
                            aria-haspopup="dialog"
                            className="flex h-10 w-full min-w-0 items-center justify-between gap-3 rounded-lg border border-gray-300 bg-white px-3 py-2 text-left text-sm font-semibold text-gray-800 shadow-theme-xs transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:hover:bg-white/5 dark:disabled:bg-white/[0.03]"
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              <Table2 className="size-4 shrink-0 text-gray-400" />
                              <span className="min-w-0 truncate">
                                {editSelectedTables.length
                                  ? `Table ${editSelectedTableNumbers}`
                                  : editHasTableChoices
                                    ? "Select tables"
                                    : "No tables available"}
                              </span>
                            </span>
                            {editSelectedTables.length ? (
                              <span className="shrink-0 text-xs font-semibold text-gray-500 dark:text-gray-400">
                                {editSelectedTableCapacity} seats
                              </span>
                            ) : null}
                          </button>
                        </div>
                      ) : (
                        <div className="min-w-0">
                          <FieldLabel htmlFor="edit-assigned-areas" required>Assigned areas</FieldLabel>
                          <MultiSelectInput
                            id="edit-assigned-areas"
                            values={editForm.assigned_area_ids}
                            onChange={(values) => updateEditForm("assigned_area_ids", values)}
                            placeholder="Select areas"
                            displayValue={editFunctionAreaDisplay || undefined}
                            buttonClassName="!h-10 !py-2"
                            menuClassName="min-w-[220px]"
                            options={
                              editFunctionAreaOptions.length
                                ? editFunctionAreaOptions
                                : [{ value: "", label: "No function areas available", disabled: true }]
                            }
                          />
                        </div>
                      )}

                      <ReadOnlyEditControl label="Area / Section" icon={MapPin}>
                        {editAreaLabel || "-"}
                      </ReadOnlyEditControl>

                      <div className="min-w-0">
                        <FieldLabel htmlFor="edit-booking-type" required>Booking type</FieldLabel>
                        <SelectInput
                          id="edit-booking-type"
                          value={editForm.booking_type_id}
                          onChange={updateEditBookingType}
                          buttonClassName="!h-10 !py-2"
                          menuClassName="min-w-[220px]"
                          options={
                            editBookingTypeOptions.length
                              ? editBookingTypeOptions
                              : [{ value: editForm.booking_type_id, label: editServiceLabel || "No booking types available", disabled: true }]
                          }
                        />
                      </div>
                    </div>
                  </section>

                  <DetailSection title="Reservation" icon={Calendar} iconClassName="bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-400">
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      <div>
                        <FieldLabel htmlFor="edit-date" required>Date</FieldLabel>
                        <SingleDatePicker
                          id="edit-date"
                          required
                          value={editForm.date}
                          onChange={(value) => updateEditForm("date", value)}
                        />
                      </div>
                      <div>
                        <FieldLabel htmlFor="edit-time" required>Time start</FieldLabel>
                        <div className="relative">
                          <Clock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
                          <input
                            id="edit-time"
                            type="time"
                            step="1800"
                            className={`${compactInputClass} pl-10`}
                            required
                            value={editForm.time}
                            onChange={(event) => updateEditForm("time", event.target.value)}
                          />
                        </div>
                      </div>
                      <div>
                        <FieldLabel htmlFor="edit-end-time" required>Time end</FieldLabel>
                        <div className="relative">
                          <Clock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
                          <input
                            id="edit-end-time"
                            type="time"
                            step="1800"
                            className={`${compactInputClass} pl-10`}
                            required
                            value={editEndTime}
                            onChange={(event) => {
                              setIsEditEndTimeManual(true);
                              updateEditForm("end_time", event.target.value);
                            }}
                          />
                        </div>
                      </div>
                      <div>
                        <FieldLabel htmlFor="edit-preferred-area">Preferred area</FieldLabel>
                        <SelectInput
                          id="edit-preferred-area"
                          value={editForm.preferred_area_id}
                          onChange={(value) => updateEditForm("preferred_area_id", value)}
                          buttonClassName="!h-10 !py-2"
                          menuClassName="min-w-[220px]"
                          options={editPreferredAreaOptions}
                        />
                      </div>
                      {selectedEditMode === "function" ? (
                        <div className="sm:col-span-2">
                          <FieldLabel htmlFor="edit-event-type">Event type</FieldLabel>
                          <input
                            id="edit-event-type"
                            className={compactInputClass}
                            value={editForm.event_type || ""}
                            onChange={(event) => updateEditForm("event_type", event.target.value)}
                          />
                        </div>
                      ) : null}
                    </div>
                  </DetailSection>

                  {selectedEditMode === "event" ? (
                    <DetailSection title="Event" icon={CalendarCheck} iconClassName="bg-blue-light-50 text-blue-light-600 dark:bg-blue-light-500/15 dark:text-blue-light-300">
                      <dl className="grid gap-4 text-sm sm:grid-cols-3">
                        <div>
                          <dt className="text-gray-500 dark:text-gray-400">Reserved area</dt>
                          <dd className="mt-1 font-semibold text-gray-900 dark:text-white/90">
                            {editingBooking.event_reserved_area_names || "No reserved area"}
                          </dd>
                        </div>
                        <div className="sm:col-span-2">
                          <dt className="text-gray-500 dark:text-gray-400">Custom answers</dt>
                          <dd className="mt-1 whitespace-pre-line font-semibold text-gray-900 dark:text-white/90">
                            {editingBooking.custom_answers_summary || "-"}
                          </dd>
                        </div>
                      </dl>
                    </DetailSection>
                  ) : null}

                  <DetailSection title="Notes" icon={FileText} iconClassName="bg-warning-50 text-warning-600 dark:bg-warning-500/15 dark:text-orange-300">
                    <div className="grid gap-4 lg:grid-cols-2">
                      <div>
                        <FieldLabel htmlFor="edit-notes">Guest notes</FieldLabel>
                        <textarea
                          id="edit-notes"
                          className={`${compactTextareaClass} min-h-[120px]`}
                          value={editForm.notes}
                          onChange={(event) => updateEditForm("notes", event.target.value)}
                        />
                      </div>
                      <div>
                        <FieldLabel htmlFor="edit-staff-notes">Staff notes</FieldLabel>
                        <textarea
                          id="edit-staff-notes"
                          className={`${compactTextareaClass} min-h-[120px]`}
                          value={editForm.staff_notes}
                          onChange={(event) => updateEditForm("staff_notes", event.target.value)}
                        />
                      </div>
                    </div>
                  </DetailSection>
                </div>

                <div className="grid min-w-0 gap-5">
                  <DetailSection title="Guest & Contact" icon={UserRound} iconClassName="bg-purple-50 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300">
                    <div className="grid gap-4">
                      <div>
                        <FieldLabel htmlFor="edit-name" required>Name</FieldLabel>
                        <div className="relative">
                          <UserRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
                          <input
                            id="edit-name"
                            className={`${compactInputClass} pl-10`}
                            required
                            value={editForm.name}
                            onChange={(event) => updateEditForm("name", event.target.value)}
                          />
                        </div>
                      </div>
                      <div>
                        <FieldLabel htmlFor="edit-phone">Phone</FieldLabel>
                        <div className="relative">
                          <Phone className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
                          <input
                            id="edit-phone"
                            className={`${compactInputClass} pl-10`}
                            value={editForm.phone}
                            onChange={(event) => updateEditForm("phone", event.target.value)}
                          />
                        </div>
                      </div>
                      <div>
                        <FieldLabel htmlFor="edit-email">Email</FieldLabel>
                        <div className="relative">
                          <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
                          <input
                            id="edit-email"
                            type="email"
                            className={`${compactInputClass} pl-10`}
                            value={editForm.email}
                            onChange={(event) => updateEditForm("email", event.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  </DetailSection>

                  <DetailSection title="Staff name" icon={UserRound} iconClassName="bg-blue-light-50 text-blue-light-600 dark:bg-blue-light-500/15 dark:text-blue-light-300">
                    <FieldLabel htmlFor="edit-staff-name">Staff name</FieldLabel>
                    <div className="relative">
                      <UserRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
                      <input
                        id="edit-staff-name"
                        className={`${compactInputClass} pl-10`}
                        value={editForm.staff_name}
                        onChange={(event) => updateEditForm("staff_name", event.target.value)}
                      />
                    </div>
                  </DetailSection>

                  <DetailSection title="Floor prep" icon={Table2} iconClassName="bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-400">
                    <label
                      htmlFor="edit-table-marked"
                      className={`flex items-start gap-3 rounded-lg border px-3 py-3 text-sm ${
                        editCanMarkTable
                          ? "border-gray-200 bg-white text-gray-700 dark:border-gray-800 dark:bg-white/[0.02] dark:text-gray-300"
                          : "border-gray-200 bg-gray-50 text-gray-400 dark:border-gray-800 dark:bg-white/[0.02]"
                      }`}
                    >
                      <input
                        id="edit-table-marked"
                        type="checkbox"
                        className="mt-1 size-4 rounded border-gray-300 text-success-600 focus:ring-success-500/20 disabled:cursor-not-allowed"
                        checked={editCanMarkTable && editForm.table_marked}
                        disabled={!editCanMarkTable}
                        onChange={(event) => updateEditForm("table_marked", event.target.checked)}
                      />
                      <span>
                        <span className="block font-semibold text-gray-900 dark:text-white/90">Reserve Sign placed</span>
                        <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
                          Reserve Sign has been placed for this booking.
                        </span>
                      </span>
                    </label>
                  </DetailSection>
                </div>
              </div>
            </form>
            )}
          </div>
        </div>
      ) : null}

      {editingBooking && bookingModalMode === "edit" && isEditTablePickerOpen ? (
        <div
          className="fixed inset-0 z-[1000010] flex items-center justify-center overflow-y-auto bg-black/50 px-4 py-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-table-picker-title"
        >
          <div className="w-full max-w-5xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xl dark:border-gray-800 dark:bg-gray-dark">
            <div className="flex flex-col gap-3 border-b border-gray-200 px-5 py-4 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-400">
                  <Table2 className="size-5" />
                </span>
                <div className="min-w-0">
                  <h3 id="edit-table-picker-title" className="text-base font-semibold text-gray-950 dark:text-white">
                    Select tables
                  </h3>
                  <p className="mt-1 truncate text-sm text-gray-500 dark:text-gray-400">
                    {editForm.date ? formatDisplayDate(editForm.date) : "Select a date"} - {editForm.time ? formatDisplayTime(editForm.time) : "Select a time"}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditTablePickerOpen(false)}
                  className="inline-flex h-10 items-center justify-center rounded-lg bg-success-600 px-4 text-sm font-semibold text-white shadow-theme-xs hover:bg-success-700"
                >
                  Done
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditTablePickerOpen(false)}
                  className="flex size-10 items-center justify-center rounded-lg border border-gray-300 text-gray-500 shadow-theme-xs hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-white/5"
                  aria-label="Close table selector"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>

            <div className="max-h-[calc(100vh-9rem)] overflow-y-auto p-5">
              <TablePicker
                areas={tablesData.areas}
                tables={tablesData.tables}
                selectedIds={editForm.table_ids}
                onChange={(ids) => {
                  setEditForm((current) => ({
                    ...current,
                    table_ids: ids,
                  }));
                }}
                unavailableTableIds={editTableAvailability.unavailableTableIds}
                blockedAreaIds={editTableAvailability.blockedAreaIds}
                visibleAreaIds={editTableVisibleAreaIds}
                isAvailabilityLoading={editAvailability.loading}
                availabilityLabel={availabilityStatusLabel(editForm.date, editForm.time, editAvailability)}
              />
            </div>
          </div>
        </div>
      ) : null}

      <div className="space-y-5">
          <section className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] sm:p-5">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="inline-flex w-fit rounded-xl bg-gray-100 p-1 dark:bg-gray-800">
                  {dateScopeTabs.map((tab) => (
                    <button
                      key={tab.label}
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

                <div className="grid w-full gap-3 sm:grid-cols-[minmax(180px,220px)_minmax(280px,380px)] xl:w-auto">
                  <SortDropdown
                    value={sortKey}
                    open={isSortOpen}
                    onToggle={() => {
                      setIsSortOpen((current) => !current);
                    }}
                    onChange={updateSort}
                  />
                  <DateRangePicker
                    start={filters.date_from}
                    end={filters.date_to}
                    onRangeChange={(dateFrom, dateTo) => updateDateRange(dateFrom, dateTo)}
                    onStepRange={stepDateRange}
                    onOpen={() => setIsSortOpen(false)}
                  />
                </div>
              </div>
            </div>

          </section>

          {groupedBookings.length === 0 ? (
            <section className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-10 text-center text-theme-sm font-medium text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
              No bookings match the current date range.
            </section>
          ) : null}

          {groupedBookings.map((group) => {
            const styles = bookingGroupStyles[group.key] || eventGroupStyle;
            const isExpanded = expandedGroups[group.key] ?? true;
            const Icon = getBookingIcon(group.icon, styles.Icon);
            const guestTotal = totalGuests(group.items);
            const colourStyle = bookingTypeColourVars(group.colour);
            const groupReserveSignEligibleCount = group.items.filter(bookingCanBulkUpdateReserveSign).length;
            const groupReserveSignUnplacedCount = group.items.filter(bookingNeedsBulkReserveSign).length;
            const shouldPlaceGroupReserveSigns = groupReserveSignUnplacedCount > 0;
            const isGroupReserveSignSaving = bulkReserveSignGroupKey === group.key;
            const canToggleGroupReserveSigns = Boolean(bulkReserveSignDate) && groupReserveSignEligibleCount > 0 && bulkReserveSignGroupKey === null;

            return (
              <section
                key={group.key}
                className="relative overflow-hidden rounded-lg border border-gray-200 bg-white shadow-theme-sm dark:border-gray-800 dark:bg-white/[0.03]"
                style={colourStyle}
              >
                <span
                  aria-hidden="true"
                  className="absolute inset-y-0 left-0 w-1 bg-[var(--booking-type-colour)]"
                />
                <div className="flex w-full items-center gap-3 px-6 py-6 pl-7 transition hover:bg-gray-50/70 dark:hover:bg-white/[0.03] sm:px-7 sm:pl-8">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-4 text-left focus:outline-none"
                    onClick={() => toggleGroup(group.key)}
                    aria-expanded={isExpanded}
                  >
                    <span
                      className={`flex size-14 flex-none items-center justify-center rounded-lg ${styles.iconWrap}`}
                      style={{ backgroundColor: "color-mix(in srgb, var(--booking-type-colour) 12%, white)" }}
                    >
                      <Icon className={`size-6 ${styles.icon}`} style={{ color: "var(--booking-type-colour)" }} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white/90">{group.title}</h2>
                        <span className="text-sm font-semibold text-gray-500 dark:text-gray-400">{group.timeRange || styles.timeRange}</span>
                        <span
                          className="inline-flex items-center justify-center rounded-full px-3 py-1 text-theme-xs font-semibold"
                          style={{
                            backgroundColor: "color-mix(in srgb, var(--booking-type-colour) 12%, white)",
                            color: "var(--booking-type-colour)",
                          }}
                        >
                          {pluralize(group.items.length, "booking")}
                        </span>
                        <span className="inline-flex items-center justify-center rounded-full bg-gray-100 px-3 py-1 text-theme-xs font-semibold text-gray-700 dark:bg-white/5 dark:text-white/80">
                          {pluralize(guestTotal, "guest")}
                        </span>
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    disabled={!canToggleGroupReserveSigns}
                    title={
                      !bulkReserveSignDate
                        ? "Select one day to update Reserve Signs for this group"
                        : groupReserveSignEligibleCount === 0
                          ? `${group.title} has no active bookings to update`
                          : shouldPlaceGroupReserveSigns
                            ? `Place Reserve Signs for ${groupReserveSignUnplacedCount} ${group.title} booking${groupReserveSignUnplacedCount === 1 ? "" : "s"}`
                            : `Clear Reserve Signs for ${groupReserveSignEligibleCount} ${group.title} booking${groupReserveSignEligibleCount === 1 ? "" : "s"}`
                    }
                    aria-label={`${shouldPlaceGroupReserveSigns ? "Place" : "Clear"} Reserve Signs for ${group.title}`}
                    onClick={() => openBulkReserveSignConfirm(group)}
                    className={`inline-flex size-10 flex-none items-center justify-center rounded-lg border transition ${
                      !shouldPlaceGroupReserveSigns && bulkReserveSignDate && groupReserveSignEligibleCount > 0
                        ? "border-success-200 bg-success-50 text-success-700 dark:border-success-500/30 dark:bg-success-500/15 dark:text-success-300"
                        : "border-warning-200 bg-warning-50 text-warning-700 hover:bg-warning-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-warning-500/30 dark:bg-warning-500/15 dark:text-orange-300"
                    } ${isGroupReserveSignSaving ? "opacity-60" : ""}`}
                  >
                    <TableProperties className="size-4" />
                  </button>
                  <button
                    type="button"
                    className="inline-flex size-10 flex-none items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/[0.05]"
                    onClick={() => toggleGroup(group.key)}
                    aria-label={`${isExpanded ? "Collapse" : "Expand"} ${group.title}`}
                    aria-expanded={isExpanded}
                  >
                    <ChevronDown
                      className={`size-5 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                    />
                  </button>
                </div>

                {isExpanded ? (
                  <div className="border-t border-gray-200 bg-white dark:border-gray-800 dark:bg-transparent">
                    {group.items.length ? (
                      <div className="max-w-full overflow-x-auto">
                      <Table className="min-w-[1360px] table-fixed">
                        <BookingTableColumns />
                        <TableHeader className="border-b border-gray-200 bg-gray-50/80 dark:border-white/[0.05] dark:bg-white/[0.02]">
                          <TableRow>
                            <TableCell isHeader className="px-5 py-4 font-semibold text-gray-500 text-start text-theme-xs dark:text-gray-400">
                              Time
                            </TableCell>
                            <TableCell isHeader className="px-5 py-4 font-semibold text-gray-500 text-start text-theme-xs dark:text-gray-400">
                              Guest
                            </TableCell>
                            <TableCell isHeader className="px-5 py-4 font-semibold text-gray-500 text-start text-theme-xs dark:text-gray-400">
                              Party
                            </TableCell>
                            <TableCell isHeader className="px-5 py-4 font-semibold text-gray-500 text-start text-theme-xs dark:text-gray-400">
                              Table
                            </TableCell>
                            <TableCell isHeader className="px-5 py-4 font-semibold text-gray-500 text-start text-theme-xs dark:text-gray-400">
                              Status
                            </TableCell>
                            <TableCell isHeader className="px-5 py-4 font-semibold text-gray-500 text-start text-theme-xs dark:text-gray-400">
                              Notes
                            </TableCell>
                            <TableCell isHeader className="px-5 py-4 font-semibold text-gray-500 text-start text-theme-xs dark:text-gray-400">
                              Staff Notes
                            </TableCell>
                            <TableCell isHeader className="whitespace-nowrap px-3 py-4 font-semibold text-gray-500 text-center text-theme-xs dark:text-gray-400">
                              Reserve Sign
                            </TableCell>
                          </TableRow>
                        </TableHeader>
                        <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                          {group.items.map((booking) => (
                            <BookingRow
                              key={booking.id}
                              booking={booking}
                              statusValue={statusEdits[booking.id] || booking.status}
                              tableMarkedValue={tableMarkEdits[booking.id]}
                              isTableMarkSaving={tableMarkEdits[booking.id] !== undefined}
                              onStatusChange={(value) => saveStatus(booking, value)}
                              onTableMarkToggle={(value) => saveTableMark(booking, value)}
                              onOpen={() => openBookingModal(booking)}
                            />
                          ))}
                        </TableBody>
                      </Table>
                      </div>
                    ) : (
                      <div className="p-6 text-theme-sm text-gray-500 dark:text-gray-400">
                        No {group.title.toLowerCase()} bookings match the current filters.
                      </div>
                    )}
                  </div>
                ) : null}
              </section>
            );
          })}

          <div className="flex items-center justify-between text-theme-sm text-gray-500 dark:text-gray-400">
            <span>
              Page {data.meta.page} of {Math.max(data.meta.total_pages, 1)}
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((current) => current - 1)}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= data.meta.total_pages}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </Button>
            </div>
          </div>
      </div>
    </>
  );
}
