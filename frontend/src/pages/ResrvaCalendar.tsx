import { useEffect, useMemo, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import { apiFetch } from "../lib/api";
import type { Booking } from "../types";
import { LoadingState } from "../components/resrva/LoadingState";
import { PageHeader } from "../components/resrva/PageHeader";

export default function ResrvaCalendar() {
  const [items, setItems] = useState<Booking[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch<{ items: Booking[] }>("calendar")
      .then((payload) => setItems(payload.items))
      .catch((err) => setError(err instanceof Error ? err.message : "Calendar failed to load."));
  }, []);

  const events = useMemo(() => {
    return (items || []).map((booking) => ({
      id: String(booking.id),
      title: `${booking.booking_reference} - ${booking.customer_name}`,
      start: `${booking.booking_date}T${booking.start_time}`,
      end: `${booking.booking_date}T${booking.end_time}`,
      backgroundColor: booking.booking_type === "function" ? "#b54708" : "#276749",
      borderColor: booking.booking_type === "function" ? "#b54708" : "#276749",
    }));
  }, [items]);

  if (error) {
    return <div className="rounded-lg border border-error-200 bg-error-50 p-4 text-sm text-error-700">{error}</div>;
  }

  if (!items) {
    return <LoadingState label="Loading calendar" />;
  }

  return (
    <>
      <PageHeader
        title="Calendar"
        description="Combined table booking and function schedule."
      />

      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-theme-sm">
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
          initialView="timeGridWeek"
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "dayGridMonth,timeGridWeek,listWeek",
          }}
          height="auto"
          events={events}
          slotMinTime="12:00:00"
          slotMaxTime="22:30:00"
          nowIndicator
        />
      </div>
    </>
  );
}
