import { useEffect, useMemo, useState } from "react";
import { CalendarCheck, Mail, RefreshCw, UsersRound, Utensils } from "lucide-react";
import { Link } from "react-router";
import { apiFetch } from "../../lib/api";
import type { DashboardPayload } from "../../types";
import { LoadingState } from "../../components/resrva/LoadingState";
import { PageHeader } from "../../components/resrva/PageHeader";
import { StatusBadge } from "../../components/resrva/StatusBadge";

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-theme-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="mt-2 text-3xl font-semibold text-gray-900">{value}</p>
        </div>
        <div className="flex size-11 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
          {icon}
        </div>
      </div>
    </div>
  );
}

function DataTable({ data }: { data: DashboardPayload["upcoming"] }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead>
          <tr className="text-left text-xs uppercase text-gray-500">
            <th className="px-3 py-2 font-medium">Ref</th>
            <th className="px-3 py-2 font-medium">Customer</th>
            <th className="px-3 py-2 font-medium">Date</th>
            <th className="px-3 py-2 font-medium">Guests</th>
            <th className="px-3 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {data.map((booking) => (
            <tr key={booking.id}>
              <td className="px-3 py-3 font-medium text-gray-900">{booking.booking_reference}</td>
              <td className="px-3 py-3 text-gray-600">{booking.customer_name}</td>
              <td className="px-3 py-3 text-gray-600">
                {booking.booking_date} {booking.start_time?.slice(0, 5)}
              </td>
              <td className="px-3 py-3 text-gray-600">{booking.guest_count}</td>
              <td className="px-3 py-3">
                <StatusBadge status={booking.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ResrvaDashboard() {
  const [data, setData] = useState<DashboardPayload | null>(null);
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

  const maxArea = useMemo(
    () => Math.max(...(data?.area_mix || []).map((item) => Number(item.total)), 1),
    [data],
  );

  if (error) {
    return <div className="rounded-lg border border-error-200 bg-error-50 p-4 text-sm text-error-700">{error}</div>;
  }

  if (!data) {
    return <LoadingState label="Loading dashboard" />;
  }

  return (
    <>
      <PageHeader
        title="Dashboard"
        action={
          <button
            type="button"
            onClick={loadDashboard}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50"
          >
            <RefreshCw className="size-4" />
            Refresh
          </button>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Today" value={data.cards.today_bookings} icon={<Utensils className="size-5" />} />
        <StatCard label="Pending functions" value={data.cards.pending_functions} icon={<CalendarCheck className="size-5" />} />
        <StatCard label="Next 7 days" value={data.cards.guests_next_7_days} icon={<UsersRound className="size-5" />} />
        <StatCard label="Email logs" value={data.cards.emails_logged} icon={<Mail className="size-5" />} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-theme-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Upcoming</h2>
            <Link to="/app/bookings" className="text-sm font-medium text-brand-700 hover:text-brand-800">
              Open bookings
            </Link>
          </div>
          <DataTable data={data.upcoming.length ? data.upcoming : data.recent} />
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-theme-sm">
          <h2 className="text-lg font-semibold text-gray-900">Areas</h2>
          <div className="mt-4 space-y-3">
            {data.area_mix.map((area) => (
              <div key={area.area_name}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-medium text-gray-700">{area.area_name}</span>
                  <span className="text-gray-500">{area.total}</span>
                </div>
                <div className="h-2 rounded-full bg-gray-100">
                  <div
                    className="h-2 rounded-full bg-brand-600"
                    style={{ width: `${(Number(area.total) / maxArea) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-theme-sm">
          <h2 className="text-lg font-semibold text-gray-900">Status</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {data.status_mix.map((item) => (
              <div key={item.status} className="rounded-lg border border-gray-200 px-3 py-2">
                <StatusBadge status={item.status} />
                <span className="ml-2 text-sm font-semibold text-gray-900">{item.total}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-theme-sm">
          <h2 className="text-lg font-semibold text-gray-900">Activity</h2>
          <div className="mt-4 divide-y divide-gray-100">
            {data.activity.map((item) => (
              <div key={item.id} className="py-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-gray-900">
                    {item.action.replace("_", " ")} {item.entity_type}
                  </span>
                  <span className="text-xs text-gray-500">{item.created_at}</span>
                </div>
                <p className="mt-1 text-gray-500">{item.user_name || "Public"}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
