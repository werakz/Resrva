import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router";
import { apiFetch } from "../lib/api";
import type { MetaPayload } from "../types";
import { FormMessage } from "../components/resrva/FormField";
import { LoadingState } from "../components/resrva/LoadingState";

const fallbackTerms =
  "Bookings are subject to venue availability and confirmation.\n\nPlease arrive on time for your booking. Tables may be released if guests arrive late without contacting the venue.\n\nGuest numbers should be accurate at the time of booking. If your party size changes, please contact the venue before your visit.\n\nSpecial requests are noted but cannot be guaranteed. The venue will do its best to accommodate seating preferences, accessibility needs, allergies, and dietary requirements when notified in advance.\n\nThe venue may contact you using the details provided to confirm, update, or manage your booking.\n\nThe venue may cancel or amend bookings where required due to operational needs, private events, safety requirements, or incorrect booking information.\n\nBy submitting a booking, you agree to these terms and confirm that the details provided are accurate.";

function termsParagraphs(value: string): string[] {
  return value
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

export default function PublicTerms() {
  const [meta, setMeta] = useState<MetaPayload | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch<MetaPayload>("meta")
      .then(setMeta)
      .catch((err) => setError(err instanceof Error ? err.message : "Terms could not be loaded."));
  }, []);

  const venueName = meta?.settings.venue_name || "Resrva";
  const venueEmail = meta?.settings.venue_email || "";
  const venuePhone = meta?.settings.venue_phone || "";
  const paragraphs = useMemo(
    () => termsParagraphs(meta?.settings.booking_terms_and_conditions || fallbackTerms),
    [meta],
  );

  if (error) {
    return (
      <main className="min-h-screen bg-gray-50 px-4 py-8 text-gray-900">
        <div className="mx-auto max-w-3xl">
          <FormMessage type="error">{error}</FormMessage>
        </div>
      </main>
    );
  }

  if (!meta) {
    return <LoadingState label="Loading terms" />;
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8 text-gray-900">
      <div className="mx-auto max-w-3xl">
        <Link to="/" className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-brand-700 hover:text-brand-800">
          <ArrowLeft className="size-4" />
          Back to booking
        </Link>

        <article className="rounded-lg border border-gray-200 bg-white p-6 shadow-theme-sm sm:p-8">
          <div className="border-b border-gray-100 pb-5">
            <p className="text-sm font-medium uppercase tracking-wide text-brand-700">{venueName}</p>
            <h1 className="mt-2 text-2xl font-semibold text-gray-950">Booking Terms and Conditions</h1>
            <p className="mt-2 text-sm text-gray-500">
              Please read these terms before submitting an online booking.
            </p>
          </div>

          <div className="mt-6 space-y-4 text-sm leading-6 text-gray-600">
            {paragraphs.map((paragraph, index) => (
              <p key={`${paragraph.slice(0, 24)}-${index}`}>{paragraph}</p>
            ))}
          </div>

          {venueEmail || venuePhone ? (
            <div className="mt-8 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
              <p className="font-medium text-gray-800">Questions about your booking?</p>
              <p className="mt-1">
                {venuePhone ? <span>{venuePhone}</span> : null}
                {venuePhone && venueEmail ? <span> · </span> : null}
                {venueEmail ? <span>{venueEmail}</span> : null}
              </p>
            </div>
          ) : null}
        </article>
      </div>
    </main>
  );
}
