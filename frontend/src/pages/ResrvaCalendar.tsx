import { useEffect, useMemo, useState } from "react";
import { Ban, ChevronLeft, ChevronRight, Users } from "lucide-react";
import { apiFetch, toJsonBody } from "../lib/api";
import type { Area, Booking, OnlineBookingBlock, TableRecord } from "../types";
import { LoadingState } from "../components/resrva/LoadingState";
import { StatusBadge } from "../components/resrva/StatusBadge";
import { Modal } from "../components/ui/modal";

type TablesPayload = {
  areas: Area[];
  tables: TableRecord[];
};

type CalendarPayload = {
  items: Booking[];
  online_booking_blocks?: OnlineBookingBlock[];
};

type DayStats = {
  bookings: Booking[];
  guests: number;
  load: number;
  lunchReservedCapacity: number;
  dinnerReservedCapacity: number;
};

type DayStatsDraft = DayStats & {
  lunchTableIds: Set<number>;
  dinnerTableIds: Set<number>;
};

type MealFilter = "all" | "lunch" | "dinner";

const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const mealFilters: Array<{ value: MealFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
];

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);

  return next;
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months, 1);

  return next;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function monthTitle(date: Date): string {
  return new Intl.DateTimeFormat("en-AU", { month: "long", year: "numeric" }).format(date);
}

function displayDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);

  return new Intl.DateTimeFormat("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}

function displayTime(value: string): string {
  const [hoursText = "0", minutesText = "00"] = value.slice(0, 5).split(":");
  const hours = Number(hoursText);
  const suffix = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;

  return `${displayHours}:${minutesText} ${suffix}`;
}

function minutesFromTime(time: string): number {
  const [hours = "0", minutes = "0"] = time.slice(0, 5).split(":");

  return Number(hours) * 60 + Number(minutes);
}

function bookingMeal(booking: Booking): "lunch" | "dinner" {
  return minutesFromTime(booking.start_time) < 17 * 60 ? "lunch" : "dinner";
}

function bookingMatchesMeal(booking: Booking, mealFilter: MealFilter): boolean {
  return mealFilter === "all" || bookingMeal(booking) === mealFilter;
}

function parseIdList(value?: string | null): number[] {
  return value
    ? value
        .split(",")
        .map((id) => Number(id.trim()))
        .filter((id) => Number.isFinite(id) && id > 0)
    : [];
}

function pluralize(count: number, label: string): string {
  return `${count} ${label}${count === 1 ? "" : "s"}`;
}

function bookingAreaLabel(booking: Booking): string {
  return booking.assigned_area_names || booking.assigned_area_name || booking.preferred_area_name || "Unassigned";
}

function bookingEventLabel(booking: Booking): string {
  if (booking.booking_type === "table") return "Table booking";

  return "Function";
}

function calendarStart(month: Date): Date {
  const first = startOfMonth(month);
  const day = first.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;

  return addDays(first, mondayOffset);
}

function calendarDays(month: Date): Date[] {
  const start = calendarStart(month);
  const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const daysFromStartToMonthEnd = Math.round((lastDay.getTime() - start.getTime()) / 86400000) + 1;
  const visibleDayCount = daysFromStartToMonthEnd > 35 ? 42 : 35;

  return Array.from({ length: visibleDayCount }, (_, index) => addDays(start, index));
}

function loadStyle(load: number) {
  if (load > 100) {
    return {
      dot: "bg-purple-500",
      bar: "bg-purple-500",
      chip: "bg-purple-50 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300",
    };
  }
  if (load >= 76) {
    return {
      dot: "bg-error-500",
      bar: "bg-error-500",
      chip: "bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-300",
    };
  }
  if (load >= 51) {
    return {
      dot: "bg-warning-500",
      bar: "bg-warning-500",
      chip: "bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-300",
    };
  }
  if (load >= 26) {
    return {
      dot: "bg-success-500",
      bar: "bg-success-500",
      chip: "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-300",
    };
  }

  return {
    dot: "bg-blue-light-500",
    bar: "bg-blue-light-500",
    chip: "bg-blue-light-50 text-blue-light-700 dark:bg-blue-light-500/15 dark:text-blue-light-300",
  };
}

export default function ResrvaCalendar() {
  const [items, setItems] = useState<Booking[] | null>(null);
  const [tablesData, setTablesData] = useState<TablesPayload | null>(null);
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => toIsoDate(new Date()));
  const [mealFilter, setMealFilter] = useState<MealFilter>("all");
  const [onlineBookingBlocks, setOnlineBookingBlocks] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [detailsMessage, setDetailsMessage] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);

  const loadCalendar = () => {
    setError("");
    Promise.all([apiFetch<CalendarPayload>("calendar"), apiFetch<TablesPayload>("tables")])
      .then(([calendarPayload, tablesPayload]) => {
        setItems(calendarPayload.items);
        setOnlineBookingBlocks((calendarPayload.online_booking_blocks || []).map((block) => block.block_date));
        setTablesData(tablesPayload);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Calendar failed to load."));
  };

  useEffect(() => {
    loadCalendar();
  }, []);

  const filteredItems = useMemo(() => {
    return (items || []).filter((booking) => {
      return bookingMatchesMeal(booking, mealFilter);
    });
  }, [items, mealFilter]);

  const dailyReservableCapacity = useMemo(() => {
    if (!tablesData) return 1;

    const reservableTables = tablesData.tables.filter((table) => Boolean(Number(table.active)));

    return Math.max(
      reservableTables.reduce((total, table) => total + Number(table.capacity || 0), 0),
      1,
    );
  }, [tablesData]);

  const statsByDate = useMemo(() => {
    if (!tablesData) return new Map<string, DayStats>();

    const map = new Map<string, DayStatsDraft>();
    const reservableTableIds = new Set<number>();
    const tableCapacityById = new Map<number, number>();
    const reservableTableIdsByArea = new Map<number, number[]>();

    for (const table of tablesData.tables) {
      const tableId = Number(table.id);
      if (!Number(table.active)) {
        continue;
      }

      reservableTableIds.add(tableId);
      tableCapacityById.set(tableId, Number(table.capacity || 0));
      const areaId = Number(table.area_id);
      reservableTableIdsByArea.set(areaId, [...(reservableTableIdsByArea.get(areaId) || []), tableId]);
    }

    const reservedCapacity = (tableIds: Set<number>) => {
      let capacity = 0;
      for (const tableId of tableIds) {
        capacity += tableCapacityById.get(tableId) || 0;
      }
      return capacity;
    };

    for (const booking of filteredItems) {
      const existing = map.get(booking.booking_date) || {
        bookings: [],
        guests: 0,
        load: 0,
        lunchReservedCapacity: 0,
        dinnerReservedCapacity: 0,
        lunchTableIds: new Set<number>(),
        dinnerTableIds: new Set<number>(),
      };
      const guestCount = Number(booking.guest_count || 0);
      const meal = bookingMeal(booking);
      const reservedTableIds = meal === "lunch" ? existing.lunchTableIds : existing.dinnerTableIds;

      existing.bookings.push(booking);
      existing.guests += guestCount;

      if (booking.booking_type === "function") {
        const areaIds = parseIdList(booking.assigned_area_ids);
        if (!areaIds.length && booking.assigned_area_id) {
          areaIds.push(Number(booking.assigned_area_id));
        }

        for (const areaId of areaIds) {
          for (const tableId of reservableTableIdsByArea.get(areaId) || []) {
            reservedTableIds.add(tableId);
          }
        }
      } else {
        for (const tableId of parseIdList(booking.table_ids)) {
          if (reservableTableIds.has(tableId)) {
            reservedTableIds.add(tableId);
          }
        }
      }

      existing.lunchReservedCapacity = reservedCapacity(existing.lunchTableIds);
      existing.dinnerReservedCapacity = reservedCapacity(existing.dinnerTableIds);
      const loadCapacity =
        mealFilter === "all"
          ? Math.max(existing.lunchReservedCapacity, existing.dinnerReservedCapacity)
          : mealFilter === "lunch"
            ? existing.lunchReservedCapacity
            : existing.dinnerReservedCapacity;
      existing.load = Math.round((loadCapacity / dailyReservableCapacity) * 100);
      map.set(booking.booking_date, existing);
    }

    return map;
  }, [dailyReservableCapacity, filteredItems, mealFilter, tablesData]);

  const visibleDays = useMemo(() => calendarDays(currentMonth), [currentMonth]);
  const onlineBookingBlockSet = useMemo(() => new Set(onlineBookingBlocks), [onlineBookingBlocks]);
  const selectedBookings = useMemo(() => {
    return (statsByDate.get(selectedDate)?.bookings || [])
      .slice()
      .sort((left, right) => left.start_time.localeCompare(right.start_time));
  }, [selectedDate, statsByDate]);
  const selectedGuestCount = selectedBookings.reduce(
    (total, booking) => total + Number(booking.guest_count || 0),
    0,
  );

  const setMonth = (nextMonth: Date) => {
    const month = startOfMonth(nextMonth);
    setCurrentMonth(month);
    setSelectedDate(toIsoDate(month));
  };

  const openDateDetails = (date: string) => {
    setSelectedDate(date);
    setDetailsMessage("");
    setDetailsOpen(true);
  };

  const toggleOnlineBookingBlock = async (date: string) => {
    const isBlocked = onlineBookingBlockSet.has(date);
    setDetailsMessage("");

    try {
      if (isBlocked) {
        await apiFetch<{ ok: boolean }>(`online-booking-blocks/${date}`, { method: "DELETE" });
        setOnlineBookingBlocks((current) => current.filter((blockedDate) => blockedDate !== date));
        setDetailsMessage("Online bookings are open for this date.");
        return;
      }

      await apiFetch<{ item: OnlineBookingBlock }>("online-booking-blocks", {
        method: "POST",
        ...toJsonBody({ date }),
      });
      setOnlineBookingBlocks((current) => Array.from(new Set([...current, date])).sort());
      setDetailsMessage("Online bookings are off for this date.");
    } catch (err) {
      setDetailsMessage(err instanceof Error ? err.message : "Could not update online booking status.");
    }
  };

  if (error) {
    return <div className="rounded-lg border border-error-200 bg-error-50 p-4 text-sm text-error-700">{error}</div>;
  }

  if (!items || !tablesData) {
    return <LoadingState label="Loading calendar" />;
  }

  return (
    <>
      <section className="rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex flex-col gap-3 border-b border-gray-200 p-3 dark:border-gray-800 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setMonth(addMonths(currentMonth, -1))}
              className="inline-flex size-10 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-600 shadow-theme-xs hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
              aria-label="Previous month"
            >
              <ChevronLeft className="size-4" />
            </button>
            <div className="min-w-36 px-3 text-center text-base font-semibold text-gray-900 dark:text-white/90">
              {monthTitle(currentMonth)}
            </div>
            <button
              type="button"
              onClick={() => setMonth(addMonths(currentMonth, 1))}
              className="inline-flex size-10 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-600 shadow-theme-xs hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
              aria-label="Next month"
            >
              <ChevronRight className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                const today = new Date();
                setCurrentMonth(startOfMonth(today));
                setSelectedDate(toIsoDate(today));
              }}
              className="h-10 rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
            >
              Today
            </button>
          </div>

          <div className="flex w-full max-w-full flex-col gap-3 lg:flex-row lg:items-center xl:w-auto">
            <div className="inline-flex h-11 shrink-0 rounded-lg border border-gray-200 bg-gray-50 p-1 dark:border-gray-800 dark:bg-gray-900">
              {mealFilters.map((filter) => {
                const active = mealFilter === filter.value;

                return (
                  <button
                    key={filter.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setMealFilter(filter.value)}
                    className={`min-w-16 rounded-md px-3 text-sm font-medium transition ${
                      active
                        ? "bg-white text-brand-600 shadow-theme-xs dark:bg-white/[0.08] dark:text-brand-400"
                        : "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white/90"
                    }`}
                  >
                    {filter.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="resrva-calendar-split">
          <div className="min-w-0">
            <div className="w-full min-w-0">
              <div className="grid grid-cols-[repeat(7,minmax(0,1fr))] border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-white/[0.03]">
                {weekDays.map((day) => (
                  <div key={day} className="border-r border-gray-200 px-2 py-2 text-center text-xs font-semibold text-gray-500 last:border-r-0 dark:border-gray-800 sm:px-3">
                    {day}
                  </div>
                ))}
              </div>

              <div className="grid auto-rows-[76px] grid-cols-[repeat(7,minmax(0,1fr))] sm:auto-rows-[86px] xl:auto-rows-[90px]">
                {visibleDays.map((day) => {
                  const iso = toIsoDate(day);
                  const isCurrentMonth = day.getMonth() === currentMonth.getMonth();
                  const isSelected = iso === selectedDate;
                  const stats = statsByDate.get(iso) || {
                    bookings: [],
                    guests: 0,
                    load: 0,
                    lunchReservedCapacity: 0,
                    dinnerReservedCapacity: 0,
                  };
                  const style = loadStyle(stats.load);
                  const barWidth = `${Math.min(stats.load, 100)}%`;
                  const hasFunction = stats.bookings.some((booking) => booking.booking_type === "function");
                  const isOnlineBlocked = onlineBookingBlockSet.has(iso);

                  return (
                    <button
                      key={iso}
                      type="button"
                      onClick={() => openDateDetails(iso)}
                      className={`h-full min-w-0 overflow-hidden border-b border-r border-gray-200 p-2 text-left transition last:border-r-0 dark:border-gray-800 sm:p-2.5 ${
                        isSelected
                          ? "bg-brand-50/70 ring-2 ring-inset ring-brand-500 dark:bg-brand-500/10"
                          : "bg-white hover:bg-gray-50 dark:bg-transparent dark:hover:bg-white/[0.04]"
                      } ${!isCurrentMonth ? "text-gray-400" : "text-gray-900 dark:text-white/90"}`}
                    >
                      <div className="flex min-w-0 items-start justify-between gap-2">
                        <div className="shrink-0 text-sm font-semibold">{day.getDate()}</div>
                        {hasFunction ? (
                          <span
                            className="max-w-[calc(100%-2rem)] truncate rounded-md bg-blue-light-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-light-500 dark:bg-blue-light-500/15 dark:text-blue-light-500"
                            title="Function"
                          >
                            Function
                          </span>
                        ) : null}
                        {isOnlineBlocked ? (
                          <span
                            className="rounded-md bg-error-50 px-1.5 py-0.5 text-[10px] font-semibold text-error-600 dark:bg-error-500/15 dark:text-error-400"
                            title="Online bookings off"
                          >
                            Off
                          </span>
                        ) : null}
                      </div>

                      {stats.bookings.length ? (
                        <div className="mt-2">
                          <p className="truncate text-[11px] font-medium text-gray-700 dark:text-gray-300 sm:text-xs">
                            {pluralize(stats.bookings.length, "booking")} · {pluralize(stats.guests, "guest")}
                          </p>
                          <p className="text-[11px] font-semibold text-gray-600 dark:text-gray-400 sm:text-xs">
                            {stats.load}%
                          </p>
                          <div className="mt-1.5 h-1.5 rounded-full bg-gray-100 dark:bg-gray-800">
                            <div className={`h-1.5 rounded-full ${style.bar}`} style={{ width: barWidth }} />
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3 h-1.5 w-full max-w-16 rounded-full bg-gray-100 dark:bg-gray-800" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      <Modal isOpen={detailsOpen} onClose={() => setDetailsOpen(false)} className="m-4 max-w-[900px]">
        <div className="p-5 sm:p-6">
          <div className="flex flex-col gap-4 pr-12 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-lg font-semibold text-gray-900 dark:text-white/90">
                {displayDate(selectedDate)}
              </p>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {pluralize(selectedBookings.length, "booking")} · {pluralize(selectedGuestCount, "guest")}
              </p>
            </div>
            <button
              type="button"
              onClick={() => toggleOnlineBookingBlock(selectedDate)}
              className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium shadow-theme-xs ${
                onlineBookingBlockSet.has(selectedDate)
                  ? "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
                  : "bg-error-600 text-white hover:bg-error-700"
              }`}
            >
              <Ban className="size-4" />
              {onlineBookingBlockSet.has(selectedDate) ? "Turn online bookings on" : "Turn online bookings off"}
            </button>
          </div>

          {onlineBookingBlockSet.has(selectedDate) ? (
            <div className="mt-4 rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm font-medium text-error-700 dark:border-error-500/20 dark:bg-error-500/15 dark:text-error-300">
              Online bookings are off for this date.
            </div>
          ) : null}
          {detailsMessage ? (
            <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium text-gray-700 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-300">
              {detailsMessage}
            </div>
          ) : null}

          <div className="mt-5 max-h-[68vh] overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-800">
            {selectedBookings.length === 0 ? (
              <div className="p-8 text-center text-sm font-medium text-gray-500 dark:text-gray-400">
                No bookings for this date.
              </div>
            ) : (
              selectedBookings.map((booking) => (
                <article
                  key={booking.id}
                  className="grid gap-3 border-b border-gray-100 px-4 py-3 last:border-b-0 dark:border-gray-800 sm:grid-cols-[86px_minmax(0,1fr)_96px]"
                >
                  <p className="whitespace-nowrap text-sm font-semibold text-gray-900 dark:text-white/90">
                    {displayTime(booking.start_time)}
                  </p>
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-gray-800 dark:text-gray-200">
                        {booking.customer_name}
                      </p>
                      {booking.booking_type === "function" ? (
                        <span className="rounded-md bg-blue-light-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-light-500 dark:bg-blue-light-500/15 dark:text-blue-light-500">
                          Function
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                      <span className="inline-flex items-center gap-1 whitespace-nowrap">
                        <Users className="size-3.5" />
                        {pluralize(Number(booking.guest_count || 0), "guest")}
                      </span>
                      <span className="truncate">
                        {bookingEventLabel(booking)} · {bookingAreaLabel(booking)}
                      </span>
                    </p>
                  </div>
                  <div className="flex items-start sm:justify-end">
                    <StatusBadge status={booking.status} />
                  </div>
                </article>
              ))
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}
