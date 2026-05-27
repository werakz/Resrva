import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  BarChart3,
  CalendarCheck,
  Clock3,
  Table2,
  UsersRound,
  Utensils,
} from "lucide-react";
import { Link } from "react-router";
import Chart from "react-apexcharts";
import type { ApexOptions } from "apexcharts";
import { apiFetch } from "../../lib/api";
import type { Booking, DashboardPayload } from "../../types";
import { LoadingState } from "../../components/resrva/LoadingState";
import { PageHeader } from "../../components/resrva/PageHeader";
import { StatusBadge } from "../../components/resrva/StatusBadge";

type MealFilter = "all" | "lunch" | "dinner";
type ChartRange = "weekly" | "monthly";

const mealFilters: Array<{ value: MealFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
];

const chartRanges: Array<{ value: ChartRange; label: string }> = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

function formatDate(value: string, options: Intl.DateTimeFormatOptions = {}) {
  return new Intl.DateTimeFormat("en-AU", options).format(new Date(`${value}T00:00:00`));
}

function formatTime(value: string) {
  if (!value) return "";

  const [hour, minute] = value.slice(0, 5).split(":").map(Number);
  return new Intl.DateTimeFormat("en-AU", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(2024, 0, 1, hour, minute));
}

function areaLabel(booking: Booking) {
  if (booking.booking_type === "function") {
    return booking.assigned_area_names || booking.assigned_area_name || booking.preferred_area_name || "Unassigned";
  }

  return booking.table_numbers
    ? `Table ${booking.table_numbers}`
    : booking.assigned_area_name || booking.preferred_area_name || "No table";
}

function DashboardSection({
  title,
  action,
  children,
  className = "",
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03] ${className}`}>
      <div className="flex items-center justify-between gap-4 border-b border-gray-100 px-5 py-4 dark:border-gray-800">
        <h2 className="text-base font-medium text-gray-800 dark:text-white/90">{title}</h2>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="inline-flex h-10 rounded-lg border border-gray-200 bg-gray-50 p-1 dark:border-gray-800 dark:bg-gray-900">
      {options.map((option) => {
        const active = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={`min-w-16 rounded-md px-3 text-sm font-medium transition ${
              active
                ? "bg-white text-brand-600 shadow-theme-xs dark:bg-white/[0.08] dark:text-brand-400"
                : "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white/90"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function TodayKpi({
  data,
  mealFilter,
  onMealFilterChange,
}: {
  data: DashboardPayload["today"];
  mealFilter: MealFilter;
  onMealFilterChange: (filter: MealFilter) => void;
}) {
  const metrics = data[mealFilter] || data.all;

  return (
    <DashboardSection
      title="Today's bookings"
      action={<SegmentedControl value={mealFilter} options={mealFilters} onChange={onMealFilterChange} />}
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        <div className="rounded-xl bg-gray-50 p-4 dark:bg-white/[0.04]">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Bookings</p>
            <Utensils className="size-5 text-brand-500" />
          </div>
          <p className="mt-3 text-4xl font-semibold text-gray-900 dark:text-white">{metrics.bookings}</p>
        </div>
        <div className="rounded-xl bg-gray-50 p-4 dark:bg-white/[0.04]">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Guests</p>
            <UsersRound className="size-5 text-success-600" />
          </div>
          <p className="mt-3 text-4xl font-semibold text-gray-900 dark:text-white">{metrics.guests}</p>
        </div>
      </div>
    </DashboardSection>
  );
}

function PendingActionsCard({ actions }: { actions: DashboardPayload["pending_actions"] }) {
  const total = actions.function_requests + actions.bookings_without_tables;

  return (
    <DashboardSection title="Pending actions">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Needs attention</p>
          <p className="mt-3 text-4xl font-semibold text-gray-900 dark:text-white">{total}</p>
        </div>
        <div className="flex size-12 items-center justify-center rounded-xl bg-warning-50 text-warning-600 dark:bg-warning-500/15 dark:text-warning-400">
          <AlertCircle className="size-6" />
        </div>
      </div>

      <div className="mt-5 space-y-3">
        <Link
          to="/app/functions"
          className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 px-4 py-3 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-white/[0.04]"
        >
          <span className="inline-flex items-center gap-3 text-sm font-medium text-gray-700 dark:text-gray-300">
            <CalendarCheck className="size-4 text-warning-600" />
            Function requests
          </span>
          <strong className="text-sm text-gray-900 dark:text-white">{actions.function_requests}</strong>
        </Link>
        <Link
          to="/app/bookings"
          className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 px-4 py-3 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-white/[0.04]"
        >
          <span className="inline-flex items-center gap-3 text-sm font-medium text-gray-700 dark:text-gray-300">
            <Table2 className="size-4 text-error-600" />
            Bookings with no table
          </span>
          <strong className="text-sm text-gray-900 dark:text-white">{actions.bookings_without_tables}</strong>
        </Link>
      </div>
    </DashboardSection>
  );
}

function GuestChart({
  points,
  range,
  onRangeChange,
}: {
  points: Array<{ date: string; guests: number }>;
  range: ChartRange;
  onRangeChange: (range: ChartRange) => void;
}) {
  const maxGuests = Math.max(...points.map((point) => Number(point.guests)), 1);
  const hasGuests = points.some((point) => Number(point.guests) > 0);
  const categories = points.map((point) =>
    range === "weekly"
      ? formatDate(point.date, { weekday: "short" })
      : formatDate(point.date, { day: "numeric", month: "short" }),
  );
  const options: ApexOptions = {
    colors: ["#465FFF"],
    chart: {
      fontFamily: "Outfit, sans-serif",
      type: "bar",
      toolbar: { show: false },
      animations: { enabled: true },
    },
    plotOptions: {
      bar: {
        horizontal: false,
        columnWidth: range === "weekly" ? "46%" : "58%",
        borderRadius: 5,
        borderRadiusApplication: "end",
      },
    },
    dataLabels: { enabled: false },
    grid: {
      borderColor: "#E5E7EB",
      yaxis: { lines: { show: true } },
      xaxis: { lines: { show: false } },
    },
    xaxis: {
      categories,
      axisBorder: { show: false },
      axisTicks: { show: false },
      labels: {
        rotate: range === "monthly" ? -45 : 0,
        style: {
          colors: "#667085",
          fontSize: "12px",
        },
      },
      tooltip: { enabled: false },
    },
    yaxis: {
      min: 0,
      max: maxGuests <= 5 ? 5 : undefined,
      tickAmount: 4,
      labels: {
        style: {
          colors: ["#667085"],
          fontSize: "12px",
        },
        formatter: (value) => `${Math.round(value)}`,
      },
    },
    fill: { opacity: 1 },
    tooltip: {
      x: { show: true },
      y: {
        formatter: (value: number) => `${value} guests`,
      },
    },
  };
  const series = [
    {
      name: "Guests",
      data: points.map((point) => Number(point.guests)),
    },
  ];

  return (
    <DashboardSection
      title="Overview"
      action={<SegmentedControl value={range} options={chartRanges} onChange={onRangeChange} />}
    >
      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
        <BarChart3 className="size-4" />
        Number of guests
      </div>
      <div className="mt-5 max-w-full overflow-x-auto custom-scrollbar">
        <div className={range === "monthly" ? "min-w-[760px]" : "min-w-full"}>
          <Chart options={options} series={series} type="bar" height={240} />
        </div>
      </div>
      {!hasGuests ? (
        <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-sm font-medium text-gray-500 dark:bg-white/[0.04] dark:text-gray-400">
          No guest bookings in this range yet.
        </p>
      ) : null}
    </DashboardSection>
  );
}

function TodayBookingsList({ bookings }: { bookings: Booking[] }) {
  return (
    <DashboardSection
      title="Today's bookings"
      action={
        <Link to="/app/bookings" className="text-sm font-medium text-brand-700 hover:text-brand-800 dark:text-brand-400">
          Open bookings
        </Link>
      }
    >
      {bookings.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm font-medium text-gray-500 dark:border-gray-800 dark:text-gray-400">
          No bookings today.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-800">
            <thead>
              <tr className="text-left text-xs uppercase text-gray-500 dark:text-gray-400">
                <th className="px-3 py-2 font-medium">Time</th>
                <th className="px-3 py-2 font-medium">Customer</th>
                <th className="px-3 py-2 font-medium">Guests</th>
                <th className="px-3 py-2 font-medium">Area / table</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {bookings.map((booking) => (
                <tr key={booking.id}>
                  <td className="whitespace-nowrap px-3 py-3 font-medium text-gray-900 dark:text-white">
                    {formatTime(booking.start_time)}
                  </td>
                  <td className="px-3 py-3 text-gray-700 dark:text-gray-300">
                    <div className="font-medium text-gray-900 dark:text-white">{booking.customer_name}</div>
                    <div className="text-xs text-gray-500">{booking.booking_reference}</div>
                  </td>
                  <td className="px-3 py-3 text-gray-700 dark:text-gray-300">{booking.guest_count}</td>
                  <td className="px-3 py-3 text-gray-700 dark:text-gray-300">{areaLabel(booking)}</td>
                  <td className="px-3 py-3">
                    <StatusBadge status={booking.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DashboardSection>
  );
}

function UpcomingFunctionsCard({ functions }: { functions: Booking[] }) {
  return (
    <DashboardSection
      title="Upcoming functions"
      action={
        <Link to="/app/functions" className="text-sm font-medium text-brand-700 hover:text-brand-800 dark:text-brand-400">
          Open functions
        </Link>
      }
    >
      {functions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm font-medium text-gray-500 dark:border-gray-800 dark:text-gray-400">
          No upcoming functions.
        </div>
      ) : (
        <div className="space-y-3">
          {functions.map((booking) => (
            <div key={booking.id} className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {booking.event_type || "Function"}
                  </p>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{booking.customer_name}</p>
                </div>
                <StatusBadge status={booking.status} />
              </div>
              <div className="mt-3 grid gap-2 text-sm text-gray-600 dark:text-gray-300 sm:grid-cols-2">
                <span className="inline-flex items-center gap-2">
                  <Clock3 className="size-4 text-gray-400" />
                  {formatDate(booking.booking_date, { day: "numeric", month: "short" })} at {formatTime(booking.start_time)}
                </span>
                <span className="inline-flex items-center gap-2">
                  <UsersRound className="size-4 text-gray-400" />
                  {booking.guest_count} guests
                </span>
              </div>
              <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">{areaLabel(booking)}</p>
            </div>
          ))}
        </div>
      )}
    </DashboardSection>
  );
}

export default function ResrvaDashboard() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [mealFilter, setMealFilter] = useState<MealFilter>("all");
  const [chartRange, setChartRange] = useState<ChartRange>("weekly");
  const [error, setError] = useState("");

  const loadDashboard = () => {
    setError("");
    apiFetch<DashboardPayload>("dashboard")
      .then(setData)
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Dashboard could not be loaded.");
      });
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const chartPoints = useMemo(
    () => data?.guest_chart[chartRange] || [],
    [chartRange, data],
  );

  if (error) {
    return <div className="rounded-lg border border-error-200 bg-error-50 p-4 text-sm text-error-700">{error}</div>;
  }

  if (!data) {
    return <LoadingState label="Loading dashboard" />;
  }

  return (
    <>
      <PageHeader title="Dashboard" />

      <div className="grid gap-5 xl:grid-cols-3">
        <TodayKpi data={data.today} mealFilter={mealFilter} onMealFilterChange={setMealFilter} />
        <PendingActionsCard actions={data.pending_actions} />
        <GuestChart points={chartPoints} range={chartRange} onRangeChange={setChartRange} />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <TodayBookingsList bookings={data.today_bookings} />
        <UpcomingFunctionsCard functions={data.upcoming_functions} />
      </div>
    </>
  );
}
