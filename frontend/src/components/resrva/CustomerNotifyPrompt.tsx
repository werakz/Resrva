import { createPortal } from "react-dom";
import { Mail, Sparkles } from "lucide-react";
import type { Booking } from "../../types";
import type { ReplyPurpose } from "./AiReplyComposer";

export function CustomerNotifyPrompt({
  booking,
  purpose,
  message,
  onDismiss,
  onDraft,
}: {
  booking: Booking;
  purpose: ReplyPurpose;
  message: string;
  onDismiss: () => void;
  onDraft: (booking: Booking, purpose: ReplyPurpose) => void;
}) {
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[2147483646] flex items-center justify-center bg-black/40 px-4 py-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`notify-customer-title-${booking.id}`}
    >
      <div className="w-full max-w-[460px] rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xl dark:border-gray-800 dark:bg-gray-dark">
        <div className="flex items-start gap-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
            <Mail className="size-5" />
          </span>
          <div className="min-w-0">
            <h3 id={`notify-customer-title-${booking.id}`} className="text-base font-semibold text-gray-900 dark:text-white/90">
              Notify customer?
            </h3>
            <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
              {message}
            </p>
            <p className="mt-2 text-xs font-medium text-gray-400">
              {booking.customer_name} · {booking.booking_reference}
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onDismiss}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/5"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={() => onDraft(booking, purpose)}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-700"
          >
            <Sparkles className="size-4" />
            Draft reply
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
