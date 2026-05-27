import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Users } from "lucide-react";
import { apiFetch } from "../lib/api";
import type { Area, Booking, TableRecord } from "../types";
import { selectClass } from "../components/resrva/FormField";
import { LoadingState } from "../components/resrva/LoadingState";
import { StatusBadge } from "../components/resrva/StatusBadge";

type TablesPayload = {
  areas: Area[];
  tables: TableRecord[];
};

type DayStats = {
  bookings: Booking[];
  guests: number;
  load: number;
};

const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function parseIsoDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);

  return new Date(year, month - 1, day);
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
  return new Intl.DateTimeFormat("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(parseIsoDate(value));
}

function displayTime(value: string): string {
  const [hoursText = "0", minutesText = "00"] = value.slice(0, 5).split(":");
  const hours = Number(hoursText);
  const suffix = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;

  return `${displayHours}:${minutesText} ${suffix}`;
}

function parseIds(value?: string | null): string[] {
  return value
    ? value
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean)
    : [];
}

function bookingAreaIds(booking: Booking): string[] {
  const functionAreaIds = parseIds(booking.assigned_area_ids);
  if (functionAreaIds.length) return functionAreaIds;

  return booking.assigned_area_id ? [String(booking.assigned_area_id)] : [];
}

function bookingAreaLabel(booking: Booking): string {
  return booking.assigned_area_names || booking.assigned_area_name || "Unassigned";
}

function bookingEventLabel(booking: Booking): string {
  if (booking.booking_type === "table") return "Table booking";

  return booking.event_type || "Function";
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

function eventTypeOptions(bookings: Booking[]) {
  const functionTypes = Array.from(
    new Set(
      bookings
        .filter((booking) => booking.booking_type === "function" && booking.event_type)
        .map((booking) => String(booking.event_type)),
    ),
  ).sort((left, right) => left.localeCompare(right));

  return [
    { value: "all", label: "All event types" },
    { value: "tables", label: "Table bookings" },
    { value: "functions", label: "Functions" },
    ...functionTypes.map((type) => ({ value: type, label: type })),
  ];
}

export default function ResrvaCalendar() {
  const [items, setItems] = useState<Booking[] | null>(null);
  const [tablesData, setTablesData] = useState<TablesPayload | null>(null);
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => toIsoDate(new Date()));
  const [listWidth, setListWidth] = useState(360);
  const [areaFilter, setAreaFilter] = useState("all");
  const [eventTypeFilter, setEventTypeFilter] = useState("all");
  const [error, setError] = useState("");
  const splitRef = useRef<HTMLDivElement | null>(null);

  const loadCalendar = () => {
    setError("");
    Promise.all([apiFetch<{ items: Booking[] }>("calendar"), apiFetch<TablesPayload>("tables")])
      .then(([calendarPayload, tablesPayload]) => {
        setItems(calendarPayload.items);
        setTablesData(tablesPayload);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Calendar failed to load."));
  };

  useEffect(() => {
    loadCalendar();
  }, []);

  const eventOptions = useMemo(() => eventTypeOptions(items || []), [items]);

  const filteredItems = useMemo(() => {
    return (items || []).filter((booking) => {
      const areaMatches = areaFilter === "all" || bookingAreaIds(booking).includes(areaFilter);
      const eventMatches =
        eventTypeFilter === "all" ||
        (eventTypeFilter === "tables" && booking.booking_type === "table") ||
        (eventTypeFilter === "functions" && booking.booking_type === "function") ||
        booking.event_type === eventTypeFilter;

      return areaMatches && eventMatches;
    });
  }, [areaFilter, eventTypeFilter, items]);

  const dailyCapacity = useMemo(() => {
    if (!tablesData) return 1;

    const activeTables = tablesData.tables.filter((table) => {
      const isActive = Boolean(Number(table.active));
      const areaMatches = areaFilter === "all" || String(table.area_id) === areaFilter;

      return isActive && areaMatches;
    });

    return Math.max(
      activeTables.reduce((total, table) => total + Number(table.capacity || 0), 0),
      1,
    );
  }, [areaFilter, tablesData]);

  const statsByDate = useMemo(() => {
    const map = new Map<string, DayStats>();

    for (const booking of filteredItems) {
      const existing = map.get(booking.booking_date) || { bookings: [], guests: 0, load: 0 };
      existing.bookings.push(booking);
      existing.guests += Number(booking.guest_count || 0);
      existing.load = Math.round((existing.guests / dailyCapacity) * 100);
      map.set(booking.booking_date, existing);
    }

    return map;
  }, [dailyCapacity, filteredItems]);

  const visibleDays = useMemo(() => calendarDays(currentMonth), [currentMonth]);
  const selectedBookings = statsByDate.get(selectedDate)?.bookings || [];

  const setMonth = (nextMonth: Date) => {
    const month = startOfMonth(nextMonth);
    setCurrentMonth(month);
    setSelectedDate(toIsoDate(month));
  };

  const startResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const container = splitRef.current;
    if (!container) return;

    const updateWidth = (clientX: number) => {
      const rect = container.getBoundingClientRect();
      const minimumListWidth = 280;
      const minimumCalendarWidth = 520;
      const maximumListWidth = Math.max(minimumListWidth, rect.width - minimumCalendarWidth);
      const nextWidth = rect.right - clientX;

      setListWidth(Math.min(Math.max(nextWidth, minimumListWidth), maximumListWidth));
    };

    updateWidth(event.clientX);

    const handlePointerMove = (moveEvent: PointerEvent) => updateWidth(moveEvent.clientX);
    const stopResize = () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResize);
    window.addEventListener("pointercancel", stopResize);
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
        <div className="flex flex-col gap-4 border-b border-gray-200 p-4 dark:border-gray-800 xl:flex-row xl:items-center xl:justify-between">
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

          <div className="grid w-full max-w-full gap-3 sm:grid-cols-2 xl:w-[520px]">
            <select
              className={selectClass}
              value={areaFilter}
              onChange={(event) => setAreaFilter(event.target.value)}
              aria-label="Area filter"
            >
              <option value="all">All areas</option>
              {tablesData.areas.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.name}
                </option>
              ))}
            </select>
            <select
              className={selectClass}
              value={eventTypeFilter}
              onChange={(event) => setEventTypeFilter(event.target.value)}
              aria-label="Event type filter"
            >
              {eventOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div
          ref={splitRef}
          className="resrva-calendar-split"
          style={{ "--calendar-list-width": `${listWidth}px` } as React.CSSProperties}
        >
          <div className="min-w-0">
            <div className="w-full min-w-0">
              <div className="grid grid-cols-[repeat(7,minmax(0,1fr))] border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-white/[0.03]">
                {weekDays.map((day) => (
                  <div key={day} className="border-r border-gray-200 px-2 py-3 text-center text-xs font-semibold text-gray-500 last:border-r-0 dark:border-gray-800 sm:px-4">
                    {day}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-[repeat(7,minmax(0,1fr))]">
                {visibleDays.map((day) => {
                  const iso = toIsoDate(day);
                  const isCurrentMonth = day.getMonth() === currentMonth.getMonth();
                  const isSelected = iso === selectedDate;
                  const stats = statsByDate.get(iso) || { bookings: [], guests: 0, load: 0 };
                  const style = loadStyle(stats.load);
                  const barWidth = `${Math.min(stats.load, 100)}%`;
                  const eventChips = Array.from(
                    new Set(
                      stats.bookings
                        .filter((booking) => booking.booking_type === "function")
                        .map((booking) => booking.event_type || "Function"),
                    ),
                  ).slice(0, 2);

                  return (
                    <button
                      key={iso}
                      type="button"
                      onClick={() => setSelectedDate(iso)}
                      className={`min-h-[104px] min-w-0 border-b border-r border-gray-200 p-2 text-left transition last:border-r-0 dark:border-gray-800 sm:min-h-[132px] sm:p-4 ${
                        isSelected
                          ? "bg-brand-50/70 ring-2 ring-inset ring-brand-500 dark:bg-brand-500/10"
                          : "bg-white hover:bg-gray-50 dark:bg-transparent dark:hover:bg-white/[0.04]"
                      } ${!isCurrentMonth ? "text-gray-400" : "text-gray-900 dark:text-white/90"}`}
                    >
                      <div className="text-sm font-semibold">{day.getDate()}</div>

                      {stats.bookings.length ? (
                        <div className="mt-3">
                          <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
                            <span>{stats.bookings.length}</span>{" "}
                            <span className="hidden sm:inline">
                              {stats.bookings.length === 1 ? "booking" : "bookings"}
                            </span>
                          </p>
                          <p className="mt-0.5 text-xs font-semibold text-gray-600 dark:text-gray-400">
                            {stats.load}%
                          </p>
                          <div className="mt-2 h-1.5 rounded-full bg-gray-100 dark:bg-gray-800">
                            <div className={`h-1.5 rounded-full ${style.bar}`} style={{ width: barWidth }} />
                          </div>

                          {eventChips.length ? (
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              {eventChips.map((chip) => (
                                <span
                                  key={chip}
                                  className="max-w-full truncate rounded-md bg-gray-100 px-2 py-1 text-[11px] font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                                >
                                  {chip}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <div className="mt-4 h-1.5 w-full max-w-20 rounded-full bg-gray-100 dark:bg-gray-800" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <button
            type="button"
            className="group hidden cursor-col-resize border-l border-r border-gray-200 bg-gray-50 transition hover:bg-brand-50 dark:border-gray-800 dark:bg-white/[0.03] dark:hover:bg-brand-500/10 xl:flex xl:items-center xl:justify-center"
            onPointerDown={startResize}
            aria-label="Resize calendar and booking list"
          >
            <span className="h-12 w-1 rounded-full bg-gray-300 transition group-hover:bg-brand-500 dark:bg-gray-700" />
          </button>

          <aside className="border-t border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-transparent xl:border-t-0">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-base font-semibold text-gray-900 dark:text-white/90">{displayDate(selectedDate)}</p>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {selectedBookings.length} {selectedBookings.length === 1 ? "booking" : "bookings"}
                </p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${loadStyle(statsByDate.get(selectedDate)?.load || 0).chip}`}>
                {statsByDate.get(selectedDate)?.load || 0}%
              </span>
            </div>

            <div className="mt-5 max-h-[720px] overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-800">
              {selectedBookings.length === 0 ? (
                <div className="p-6 text-center text-sm font-medium text-gray-500">
                  No bookings for this date.
                </div>
              ) : (
                selectedBookings
                  .slice()
                  .sort((left, right) => left.start_time.localeCompare(right.start_time))
                  .map((booking) => (
                    <article
                      key={booking.id}
                      className="grid min-h-14 grid-cols-[76px_minmax(0,1fr)_92px] items-start gap-3 border-b border-gray-100 px-3 py-2.5 text-sm last:border-b-0 dark:border-gray-800"
                    >
                      <p className="whitespace-nowrap pt-0.5 font-semibold text-gray-900 dark:text-white/90">
                        {displayTime(booking.start_time)}
                      </p>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-gray-800 dark:text-gray-200">{booking.customer_name}</p>
                        <p className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                          <span className="inline-flex items-center gap-1 whitespace-nowrap">
                            <Users className="size-3.5" />
                            {booking.guest_count}
                          </span>
                          <span className="truncate">
                            {bookingEventLabel(booking)} · {bookingAreaLabel(booking)}
                          </span>
                        </p>
                      </div>
                      <div className="flex justify-end pt-0.5">
                        <StatusBadge status={booking.status} />
                      </div>
                    </article>
                  ))
              )}
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}
