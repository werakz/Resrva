import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router";
import flatpickr from "flatpickr";
import type { Instance as FlatpickrInstance } from "flatpickr/dist/types/instance";
import {
  AlertTriangle,
  ArrowUpDown,
  CalendarDays,
  CalendarCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Moon,
  Plus,
  Save,
  Sun,
  User,
  X,
  type LucideIcon,
} from "lucide-react";
import { apiFetch, toJsonBody } from "../lib/api";
import { bookingTypeColourVars } from "../lib/bookingTypeColours";
import { getBookingIcon } from "../lib/bookingTypeIcons";
import type { Area, Booking, BookingType, MetaPayload, Paginated, TableRecord } from "../types";
import {
  FieldLabel,
  FormMessage,
  SelectInput,
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
  guest_count: string;
  table_ids: string[];
  assigned_area_id: string;
  assigned_area_ids: string[];
  notes: string;
  staff_notes: string;
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
  guest_count: "",
  table_ids: [],
  assigned_area_id: "",
  assigned_area_ids: [],
  notes: "",
  staff_notes: "",
};

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

const tableStatuses = ["confirmed", "seated", "completed", "cancelled", "no_show"];
const functionStatuses = ["pending", "approved", "confirmed", "declined", "cancelled"];
const eventStatuses = ["pending", "confirmed", "waitlist", "completed", "cancelled"];
const compactInputClass = `${inputClass} h-10 py-2`;
const compactTextareaClass = `${textareaClass} min-h-[72px] py-2`;

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
  approved:
    "!border-success-200 !bg-success-50 !text-success-600 dark:!border-success-500/20 dark:!bg-success-500/15 dark:!text-success-500",
  pending:
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
    nextStatus === "confirmed" || nextStatus === "approved"
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

function reservableTable(table: TableRecord): boolean {
  return Boolean(Number(table.active));
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
            className={`h-10 rounded-lg border px-3 text-left text-sm font-medium transition ${
              isSelected
                ? "border-brand-500 bg-brand-50 text-brand-700 shadow-theme-xs dark:bg-brand-500/15 dark:text-brand-400"
                : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/5"
            }`}
          >
            {area.name}
          </button>
        );
      })}
    </div>
  );
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
    return ["approved", "confirmed"].includes(booking.status);
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
  const options =
    booking.booking_type === "function"
      ? functionStatuses
      : booking.booking_type === "event"
        ? eventStatuses
        : tableStatuses;

  return options.includes(booking.status) ? options : [booking.status, ...options];
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
      <col className="w-[15%]" />
      <col className="w-[7%]" />
      <col className="w-[14%]" />
      <col className="w-[13%]" />
      <col className="w-[17%]" />
      <col className="w-[16%]" />
      <col className="w-[6%]" />
    </colgroup>
  );
}

function BookingRow({
  booking,
  statusValue,
  onStatusChange,
  onEdit,
}: {
  booking: Booking;
  statusValue: string;
  onStatusChange: (value: string) => void;
  onEdit: () => void;
}) {
  const areaLabel =
    booking.assigned_area_names ||
    booking.assigned_area_name ||
    booking.preferred_area_name ||
    booking.event_reserved_area_names ||
    "";
  const tableLabel = booking.table_numbers
    ? `Table ${booking.table_numbers}`
    : booking.booking_type === "event"
      ? "No table"
      : booking.booking_type === "function"
      ? areaLabel || "Unassigned"
      : "Unassigned";
  const showAreaLabel = areaLabel && areaLabel !== tableLabel;
  const detailText = [booking.custom_answers_summary, booking.notes, booking.event_type]
    .filter(Boolean)
    .join("\n");

  return (
    <TableRow className="bg-white align-top dark:bg-transparent">
      <TableCell className="px-5 py-4 text-start">
        <p className="whitespace-nowrap font-medium text-gray-800 text-theme-sm dark:text-white/90">
          {formatDisplayTime(booking.start_time)}
        </p>
        <p className="mt-1 whitespace-nowrap text-theme-xs text-gray-500 dark:text-gray-400">
          {formatDisplayDate(booking.booking_date)}
        </p>
      </TableCell>
      <TableCell className="px-5 py-4 text-start">
        <p className="font-medium text-gray-800 text-theme-sm dark:text-white/90">{booking.customer_name}</p>
        <p className="mt-1 text-theme-xs text-gray-500 dark:text-gray-400">{booking.customer_phone || "-"}</p>
      </TableCell>
      <TableCell className="px-5 py-4 text-start">
        <div className="inline-flex items-center gap-2 font-medium text-gray-800 text-theme-sm dark:text-white/90">
          <User className="size-4 text-gray-400" />
          {booking.guest_count}
        </div>
      </TableCell>
      <TableCell className="px-5 py-4 text-start">
        <p className="font-medium text-gray-800 text-theme-sm dark:text-white/90">{tableLabel}</p>
        {showAreaLabel ? (
          <p className="mt-1 text-theme-xs text-gray-500 dark:text-gray-400">{areaLabel}</p>
        ) : null}
      </TableCell>
      <TableCell className="px-5 py-4 text-start">
        <SelectInput
          value={statusValue}
          onChange={onStatusChange}
          ariaLabel={`${booking.booking_reference} status`}
          className="inline-flex min-w-[132px]"
          buttonClassName={`!h-8 !rounded-full !py-1 !pl-3 !pr-2 text-center text-theme-xs font-medium capitalize ${
            statusControlStyles[statusValue] || "border-gray-200 bg-gray-50 text-gray-700"
          }`}
          menuClassName="min-w-[160px]"
          options={statusOptionsFor(booking).map((status) => ({
            value: status,
            label: status.replace("_", " "),
          }))}
        />
      </TableCell>
      <TableCell className="px-5 py-4 text-start">
        <p
          className="max-w-[220px] whitespace-pre-line text-theme-sm text-gray-500 dark:text-gray-400"
          title={detailText || "-"}
        >
          {detailText || "-"}
        </p>
      </TableCell>
      <TableCell className="px-5 py-4 text-start">
        <p
          className="max-w-[220px] truncate text-theme-sm text-gray-500 dark:text-gray-400"
          title={booking.staff_notes || "-"}
        >
          {booking.staff_notes || "-"}
        </p>
      </TableCell>
      <TableCell className="px-5 py-4 text-start">
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            className="inline-flex size-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5"
            title="Edit booking"
            onClick={onEdit}
          >
            <MoreHorizontal className="size-4" />
          </button>
        </div>
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
  const [editForm, setEditForm] = useState<ManualBookingForm>(emptyManualBooking);
  const [statusEdits, setStatusEdits] = useState<Record<number, string>>({});
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
    if (!editingBooking || !editForm.date) {
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
  }, [editingBooking, editForm.date]);

  const groupedBookings = useMemo(
    () => groupBookings(sortedBookings(data?.items || [], sortKey), meta?.booking_types || []),
    [data, meta?.booking_types, sortKey],
  );
  const defaultDurationMinutes = Number(meta?.settings.default_duration_minutes || 120);
  const editDurationMinutes = bookingDurationMinutes(editingBooking, defaultDurationMinutes);
  const createTableAvailability = useMemo(
    () =>
      buildTableAvailability({
        bookings: createAvailability.items,
        date: form.date,
        time: form.time,
        durationMinutes: defaultDurationMinutes,
      }),
    [createAvailability.items, defaultDurationMinutes, form.date, form.time],
  );
  const editTableAvailability = useMemo(
    () =>
      buildTableAvailability({
        bookings: editAvailability.items,
        date: editForm.date,
        time: editForm.time,
        durationMinutes: editDurationMinutes,
        excludeBookingId: editingBooking?.id,
        contextBookingType: editingBooking?.booking_type,
        contextBookingSessionId: editingBooking?.booking_session_id ?? null,
      }),
    [editAvailability.items, editDurationMinutes, editForm.date, editForm.time, editingBooking?.booking_session_id, editingBooking?.booking_type, editingBooking?.id],
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
    if (!editingBooking || !tablesData) return;

    setEditForm((current) => {
      const availableIds = current.table_ids.filter(
        (tableId) => !isTableUnavailable(tableId, tablesData.tables, editTableAvailability),
      );
      return availableIds.length === current.table_ids.length ? current : { ...current, table_ids: availableIds };
    });
  }, [editAvailabilityKey, editTableAvailability, editingBooking, tablesData]);

  const updateForm = <K extends keyof ManualBookingForm>(field: K, value: ManualBookingForm[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const updateEditForm = <K extends keyof ManualBookingForm>(
    field: K,
    value: ManualBookingForm[K],
  ) => {
    setEditForm((current) => ({ ...current, [field]: value }));
  };

  const openCreateModal = () => {
    setModalMessage(null);
    setForm({
      ...emptyManualBooking,
      date: todayIso(),
      time: "18:00",
      guest_count: "8",
    });
    setIsCreateOpen(true);
  };

  const closeCreateModal = () => {
    setModalMessage(null);
    setIsCreateOpen(false);
  };

  const openEditModal = (booking: Booking) => {
    setModalMessage(null);
    setEditingBooking(booking);
    setEditForm({
      name: booking.customer_name || "",
      email: booking.customer_email || "",
      phone: booking.customer_phone || "",
      date: booking.booking_date || "",
      time: booking.start_time?.slice(0, 5) || "",
      guest_count: String(booking.guest_count || ""),
      table_ids: parseTableIds(booking.table_ids),
      assigned_area_id: booking.assigned_area_id ? String(booking.assigned_area_id) : "",
      assigned_area_ids: parseTableIds(booking.assigned_area_ids || (booking.assigned_area_id ? String(booking.assigned_area_id) : "")),
      notes: booking.notes || "",
      staff_notes: booking.staff_notes || "",
      status: booking.status,
      event_type: booking.event_type || "",
    });
  };

  const closeEditModal = () => {
    setModalMessage(null);
    setEditingBooking(null);
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
      if (!form.table_ids.length) {
        setModalMessage({ type: "error", text: "Select at least one table." });
        return;
      }

      const response = await apiFetch<{ booking_reference: string; assigned_area: string }>("bookings", {
        method: "POST",
        ...toJsonBody({
          ...form,
          guest_count: Number(form.guest_count),
          table_ids: form.table_ids.map(Number),
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

  const saveEditBooking = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingBooking) return;
    setModalMessage(null);

    const payload =
      editingBooking.booking_type === "table"
        ? {
            table_ids: editForm.table_ids.map(Number),
          }
        : editingBooking.booking_type === "function"
          ? {
              assigned_area_ids: editForm.assigned_area_ids.map(Number),
              assigned_area_id: editForm.assigned_area_ids[0] || null,
            }
          : editingBooking.booking_type === "event"
            ? {
                table_ids: editForm.table_ids.map(Number),
              }
            : {};

    if (editingBooking.booking_type === "table" && !editForm.table_ids.length) {
      setModalMessage({ type: "error", text: "Select at least one table." });
      return;
    }
    if (
      editingBooking.booking_type === "event" &&
      !editForm.table_ids.length &&
      !["pending", "waitlist", "cancelled", "declined", "no_show"].includes(editForm.status || editingBooking.status)
    ) {
      setModalMessage({ type: "error", text: "Select at least one table for this event booking." });
      return;
    }

    try {
      const response = await apiFetch<{ item: Booking }>(`bookings/${editingBooking.id}`, {
        method: "PUT",
        ...toJsonBody({
          name: editForm.name,
          email: editForm.email,
          phone: editForm.phone,
          date: editForm.date,
          time: editForm.time,
          guest_count: Number(editForm.guest_count),
          notes: editForm.notes,
          staff_notes: editForm.staff_notes,
          status: editForm.status,
          event_type: editForm.event_type || null,
          ...payload,
        }),
      });

      setMessage({ type: "success", text: "Booking updated." });
      const nextStatus = editForm.status || editingBooking.status;
      const prompt = customerNoticeForStatusChange(editingBooking.status, nextStatus, response.item);
      closeEditModal();
      setEditForm(emptyManualBooking);
      await loadBookings();
      if (prompt) {
        setNotifyPrompt(prompt);
      }
    } catch (err) {
      setModalMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Booking could not be updated.",
      });
    }
  };

  if ((!data || !meta || !tablesData) && message?.type === "error") {
    return <FormMessage type="error">{message.text}</FormMessage>;
  }

  if (!data || !meta || !tablesData) {
    return <LoadingState label="Loading bookings" />;
  }

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
                        <FieldLabel htmlFor="manual-name">Name</FieldLabel>
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
                          required
                          value={form.email}
                          onChange={(event) => updateForm("email", event.target.value)}
                        />
                      </div>
                      <div>
                        <FieldLabel htmlFor="manual-phone">Phone</FieldLabel>
                        <input
                          id="manual-phone"
                          className={compactInputClass}
                          required
                          value={form.phone}
                          onChange={(event) => updateForm("phone", event.target.value)}
                        />
                      </div>
                    </div>
                  </section>

                  <section className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
                    <h3 className="mb-3 text-xs font-semibold uppercase text-gray-500">Booking</h3>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div>
                        <FieldLabel htmlFor="manual-guests">Guests</FieldLabel>
                        <input
                          id="manual-guests"
                          type="number"
                          min="8"
                          max="29"
                          className={compactInputClass}
                          required
                          value={form.guest_count}
                          onChange={(event) => updateForm("guest_count", event.target.value)}
                        />
                      </div>
                      <div>
                        <FieldLabel htmlFor="manual-date">Date</FieldLabel>
                        <SingleDatePicker
                          id="manual-date"
                          required
                          value={form.date}
                          onChange={(value) => updateForm("date", value)}
                        />
                      </div>
                      <div>
                        <FieldLabel htmlFor="manual-time">Time</FieldLabel>
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
                    </div>
                  </section>

                  <section className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
                    <div className="grid gap-3 sm:grid-cols-2">
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

                <section className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
                  <h3 className="mb-3 text-xs font-semibold uppercase text-gray-500">Tables</h3>
                  <div id="manual-tables">
                    <TablePicker
                      areas={tablesData.areas}
                      tables={tablesData.tables}
                      selectedIds={form.table_ids}
                      onChange={(ids) => updateForm("table_ids", ids)}
                      unavailableTableIds={createTableAvailability.unavailableTableIds}
                      blockedAreaIds={createTableAvailability.blockedAreaIds}
                      isAvailabilityLoading={createAvailability.loading}
                      availabilityLabel={availabilityStatusLabel(form.date, form.time, createAvailability)}
                    />
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
          aria-labelledby="edit-booking-title"
        >
          <div className="w-full max-w-6xl rounded-2xl border border-gray-200 bg-white shadow-theme-xl dark:border-gray-800 dark:bg-gray-dark">
            <div className="flex items-center justify-between gap-4 border-b border-gray-200 px-5 py-3 dark:border-gray-800">
              <h2 id="edit-booking-title" className="text-base font-semibold text-gray-900 dark:text-white/90">
                Edit booking
              </h2>
              <div className="flex items-center gap-2">
                <AiReplyComposer booking={editingBooking} onLogged={loadBookings} />
                <button
                  type="button"
                  onClick={closeEditModal}
                  className="flex size-8 items-center justify-center rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-white/5"
                  aria-label="Close edit booking modal"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>

            <form onSubmit={saveEditBooking} className="max-h-[calc(100vh-8rem)] overflow-y-auto p-4">
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
                        <FieldLabel htmlFor="edit-name">Name</FieldLabel>
                        <input
                          id="edit-name"
                          className={compactInputClass}
                          required
                          value={editForm.name}
                          onChange={(event) => updateEditForm("name", event.target.value)}
                        />
                      </div>
                      <div>
                        <FieldLabel htmlFor="edit-email">Email</FieldLabel>
                        <input
                          id="edit-email"
                          type="email"
                          className={compactInputClass}
                          required
                          value={editForm.email}
                          onChange={(event) => updateEditForm("email", event.target.value)}
                        />
                      </div>
                      <div>
                        <FieldLabel htmlFor="edit-phone">Phone</FieldLabel>
                        <input
                          id="edit-phone"
                          className={compactInputClass}
                          required
                          value={editForm.phone}
                          onChange={(event) => updateEditForm("phone", event.target.value)}
                        />
                      </div>
                    </div>
                  </section>

                  <section className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
                    <h3 className="mb-3 text-xs font-semibold uppercase text-gray-500">Booking</h3>
                    <div className="grid gap-3 sm:grid-cols-4">
                      <div>
                        <FieldLabel htmlFor="edit-guests">Guests</FieldLabel>
                        <input
                          id="edit-guests"
                          type="number"
                          min={editingBooking.booking_type === "table" ? "8" : "1"}
                          max={editingBooking.booking_type === "table" ? "29" : undefined}
                          className={compactInputClass}
                          required
                          value={editForm.guest_count}
                          onChange={(event) => updateEditForm("guest_count", event.target.value)}
                        />
                      </div>
                      <div>
                        <FieldLabel htmlFor="edit-status">Status</FieldLabel>
                        <SelectInput
                          id="edit-status"
                          value={editForm.status || editingBooking.status}
                          onChange={(value) => updateEditForm("status", value)}
                          buttonClassName="!h-10 !py-2"
                          options={statusOptionsFor(editingBooking).map((status) => ({
                            value: status,
                            label: status.replace("_", " "),
                          }))}
                        />
                      </div>
                      <div>
                        <FieldLabel htmlFor="edit-date">Date</FieldLabel>
                        <SingleDatePicker
                          id="edit-date"
                          required
                          value={editForm.date}
                          onChange={(value) => updateEditForm("date", value)}
                        />
                      </div>
                      <div>
                        <FieldLabel htmlFor="edit-time">Time</FieldLabel>
                        <input
                          id="edit-time"
                          type="time"
                          step="1800"
                          className={compactInputClass}
                          required
                          value={editForm.time}
                          onChange={(event) => updateEditForm("time", event.target.value)}
                        />
                      </div>
                    </div>
                  </section>

                  {editingBooking.booking_type === "function" ? (
                    <section className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
                      <h3 className="mb-3 text-xs font-semibold uppercase text-gray-500">Function</h3>
                      <div className="grid gap-3">
                        <div>
                          <FieldLabel htmlFor="edit-area">Areas</FieldLabel>
                          <div id="edit-area">
                            <FunctionAreaPicker
                              areas={meta.function_areas}
                              selectedIds={editForm.assigned_area_ids}
                              onChange={(ids) => {
                                updateEditForm("assigned_area_ids", ids);
                                updateEditForm("assigned_area_id", ids[0] || "");
                              }}
                            />
                          </div>
                        </div>
                        <div>
                          <FieldLabel htmlFor="edit-event-type">Event type</FieldLabel>
                          <input
                            id="edit-event-type"
                            className={compactInputClass}
                            value={editForm.event_type || ""}
                            onChange={(event) => updateEditForm("event_type", event.target.value)}
                          />
                        </div>
                      </div>
                    </section>
                  ) : null}

                  {editingBooking.booking_type === "event" ? (
                    <section className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
                      <h3 className="mb-3 text-xs font-semibold uppercase text-gray-500">Event</h3>
                      <dl className="grid gap-3 text-sm sm:grid-cols-3 lg:grid-cols-1">
                        <div>
                          <dt className="text-gray-500">Booking type</dt>
                          <dd className="font-medium text-gray-900">
                            {editingBooking.booking_type_name || editingBooking.event_type || "-"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-gray-500">Reserved area</dt>
                          <dd className="font-medium text-gray-900">
                            {editingBooking.event_reserved_area_names || "No reserved area"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-gray-500">Custom answers</dt>
                          <dd className="whitespace-pre-line font-medium text-gray-900">
                            {editingBooking.custom_answers_summary || "-"}
                          </dd>
                        </div>
                      </dl>
                    </section>
                  ) : null}

                  <section className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <FieldLabel htmlFor="edit-notes">Notes</FieldLabel>
                        <textarea
                          id="edit-notes"
                          className={compactTextareaClass}
                          value={editForm.notes}
                          onChange={(event) => updateEditForm("notes", event.target.value)}
                        />
                      </div>
                      <div>
                        <FieldLabel htmlFor="edit-staff-notes">Staff Notes</FieldLabel>
                        <textarea
                          id="edit-staff-notes"
                          className={compactTextareaClass}
                          value={editForm.staff_notes}
                          onChange={(event) => updateEditForm("staff_notes", event.target.value)}
                        />
                      </div>
                    </div>
                  </section>
                </div>

                {editingBooking.booking_type === "table" || editingBooking.booking_type === "event" ? (
                  <section className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
                    <h3 className="mb-3 text-xs font-semibold uppercase text-gray-500">Tables</h3>
                    <div id="edit-tables">
                      <TablePicker
                        areas={tablesData.areas}
                        tables={tablesData.tables}
                        selectedIds={editForm.table_ids}
                        onChange={(ids) => updateEditForm("table_ids", ids)}
                        unavailableTableIds={editTableAvailability.unavailableTableIds}
                        blockedAreaIds={editTableAvailability.blockedAreaIds}
                        visibleAreaIds={
                          editingBooking.booking_type === "event"
                            ? parseTableIds(editingBooking.event_reserved_area_ids)
                            : undefined
                        }
                        isAvailabilityLoading={editAvailability.loading}
                        availabilityLabel={availabilityStatusLabel(editForm.date, editForm.time, editAvailability)}
                      />
                    </div>
                  </section>
                ) : (
                  <section className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-white/[0.03]">
                    <h3 className="mb-3 text-xs font-semibold uppercase text-gray-500">Request</h3>
                    <dl className="grid gap-3 text-sm sm:grid-cols-3 lg:grid-cols-1">
                      <div>
                        <dt className="text-gray-500">Reference</dt>
                        <dd className="font-medium text-gray-900">{editingBooking.booking_reference}</dd>
                      </div>
                      <div>
                        <dt className="text-gray-500">Preferred area</dt>
                        <dd className="font-medium text-gray-900">{editingBooking.preferred_area_name || "-"}</dd>
                      </div>
                      <div>
                        <dt className="text-gray-500">Current area</dt>
                        <dd className="font-medium text-gray-900">
                          {editingBooking.assigned_area_names || editingBooking.assigned_area_name || "Unassigned"}
                        </dd>
                      </div>
                    </dl>
                  </section>
                )}
              </div>

              <div className="mt-4 flex flex-col-reverse gap-2 border-t border-gray-100 pt-3 sm:flex-row sm:justify-end dark:border-gray-800">
                <button
                  type="button"
                  onClick={closeEditModal}
                  className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600"
                >
                  <Save className="size-4" />
                  Save changes
                </button>
              </div>
            </form>
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

            {message ? (
              <div className="px-6 py-4">
                <FormMessage type={message.type}>{message.text}</FormMessage>
              </div>
            ) : null}
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

            return (
              <section
                key={group.key}
                className={`overflow-hidden rounded-2xl border border-t-4 border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] ${styles.accent}`}
                style={{ ...colourStyle, borderTopColor: "var(--booking-type-colour)" }}
              >
                <button
                  type="button"
                  className="flex w-full items-center gap-4 px-6 py-5 text-left transition hover:bg-gray-50 dark:hover:bg-white/[0.03]"
                  onClick={() => toggleGroup(group.key)}
                  aria-expanded={isExpanded}
                >
                  <span
                    className={`flex size-12 flex-none items-center justify-center rounded-xl ${styles.iconWrap}`}
                    style={{ backgroundColor: "color-mix(in srgb, var(--booking-type-colour) 12%, white)" }}
                  >
                    <Icon className={`size-5 ${styles.icon}`} style={{ color: "var(--booking-type-colour)" }} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">{group.title}</h2>
                      <span className="text-sm font-medium text-gray-500 dark:text-gray-400">{group.timeRange || styles.timeRange}</span>
                      <span className="inline-flex items-center justify-center rounded-full bg-gray-100 px-2.5 py-0.5 text-theme-xs font-medium text-gray-700 dark:bg-white/5 dark:text-white/80">
                        {pluralize(group.items.length, "booking")}
                      </span>
                      <span className="inline-flex items-center justify-center rounded-full bg-gray-100 px-2.5 py-0.5 text-theme-xs font-medium text-gray-700 dark:bg-white/5 dark:text-white/80">
                        {pluralize(guestTotal, "guest")}
                      </span>
                    </div>
                  </div>
                  <ChevronDown
                    className={`size-5 flex-none text-gray-500 transition-transform dark:text-gray-400 ${isExpanded ? "rotate-180" : ""}`}
                  />
                </button>

                {isExpanded ? (
                  <div className="border-t border-gray-100 bg-white dark:border-gray-800 dark:bg-transparent">
                    {group.items.length ? (
                      <div className="max-w-full overflow-x-auto">
                      <Table className="min-w-[1360px] table-fixed">
                        <BookingTableColumns />
                        <TableHeader className="border-b border-gray-100 bg-gray-50 dark:border-white/[0.05] dark:bg-white/[0.02]">
                          <TableRow>
                            <TableCell isHeader className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                              Time
                            </TableCell>
                            <TableCell isHeader className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                              Guest
                            </TableCell>
                            <TableCell isHeader className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                              Party
                            </TableCell>
                            <TableCell isHeader className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                              Table
                            </TableCell>
                            <TableCell isHeader className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                              Status
                            </TableCell>
                            <TableCell isHeader className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                              Notes
                            </TableCell>
                            <TableCell isHeader className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                              Staff Notes
                            </TableCell>
                            <TableCell isHeader className="px-5 py-3 font-medium text-gray-500 text-end text-theme-xs dark:text-gray-400">
                              Actions
                            </TableCell>
                          </TableRow>
                        </TableHeader>
                        <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                          {group.items.map((booking) => (
                            <BookingRow
                              key={booking.id}
                              booking={booking}
                              statusValue={statusEdits[booking.id] || booking.status}
                              onStatusChange={(value) => saveStatus(booking, value)}
                              onEdit={() => openEditModal(booking)}
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
