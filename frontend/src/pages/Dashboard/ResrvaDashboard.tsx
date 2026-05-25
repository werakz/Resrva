import { useEffect, useState } from "react";
import { CalendarCheck, Mail, UsersRound, Utensils } from "lucide-react";
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

export default function ResrvaDashboard() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch<DashboardPayload>("dashboard").then(setData).catch((err) => {
      setError(err instanceof Error ? err.message : "Dashboard could not be loaded.");
    });
  }, []);

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
        description="Operational overview for Old Canberra Inn reservations."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Table bookings today"
          value={data.cards.today_bookings}
          icon={<Utensils className="size-5" />}
        />
        <StatCard
          label="Pending functions"
          value={data.cards.pending_functions}
          icon={<CalendarCheck className="size-5" />}
        />
        <StatCard
          label="Guests next 7 days"
          value={data.cards.guests_next_7_days}
          icon={<UsersRound className="size-5" />}
        />
        <StatCard
          label="Emails logged"
          value={data.cards.emails_logged}
          icon={<Mail className="size-5" />}
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-theme-sm">
          <h2 className="text-lg font-semibold text-gray-900">Recent activity</h2>
          <div className="mt-4 overflow-x-auto">
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
                {data.recent.map((booking) => (
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
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-theme-sm">
          <h2 className="text-lg font-semibold text-gray-900">30-day area mix</h2>
          <div className="mt-4 space-y-3">
            {data.area_mix.map((area) => {
              const max = Math.max(...data.area_mix.map((item) => Number(item.total)), 1);
              const width = `${(Number(area.total) / max) * 100}%`;

              return (
                <div key={area.area_name}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium text-gray-700">{area.area_name}</span>
                    <span className="text-gray-500">{area.total}</span>
                  </div>
                  <div className="h-2 rounded-full bg-gray-100">
                    <div className="h-2 rounded-full bg-brand-600" style={{ width }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
