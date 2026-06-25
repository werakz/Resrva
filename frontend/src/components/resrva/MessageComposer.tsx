import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Mail, Send, X } from "lucide-react";
import { apiFetch, toJsonBody } from "../../lib/api";
import type { Booking } from "../../types";
import { FieldLabel, FormMessage, inputClass, textareaClass } from "./FormField";

export type MessagePurpose = "confirm" | "update" | "decline" | "request_info";

export function messagePurposeForStatus(status: string): MessagePurpose {
  if (status === "confirmed") return "confirm";
  if (status === "declined") return "decline";
  return "update";
}

export function statusNeedsCustomerNotice(status: string): boolean {
  return ["confirmed", "declined", "cancelled"].includes(status);
}

function defaultSubject(booking: Booking, purpose: MessagePurpose): string {
  if (purpose === "confirm") return `Booking ${booking.booking_reference} confirmation`;
  if (purpose === "decline") return `Booking ${booking.booking_reference} update`;
  if (purpose === "request_info") return `Question about booking ${booking.booking_reference}`;
  return `Booking ${booking.booking_reference} update`;
}

export function MessageComposer({
  booking,
  onLogged,
  openRequest,
  buttonLabel = "Send message",
  buttonClassName = "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-4 text-sm font-medium text-brand-700 hover:bg-brand-100 dark:border-brand-500/20 dark:bg-brand-500/15 dark:text-brand-300",
}: {
  booking: Booking;
  onLogged?: () => void | Promise<void>;
  openRequest?: { token: number; purpose?: MessagePurpose };
  buttonLabel?: string;
  buttonClassName?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [purpose, setPurpose] = useState<MessagePurpose>("update");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success" | "info"; text: string } | null>(null);
  const handledOpenTokenRef = useRef<number | null>(null);

  const openComposer = useCallback((requestedPurpose?: MessagePurpose) => {
    const nextPurpose = requestedPurpose || messagePurposeForStatus(booking.status);

    setPurpose(nextPurpose);
    setSubject(defaultSubject(booking, nextPurpose));
    setBody("");
    setMessage(null);
    setIsOpen(true);
  }, [booking]);

  useEffect(() => {
    if (!openRequest) return;
    if (handledOpenTokenRef.current === openRequest.token) return;

    handledOpenTokenRef.current = openRequest.token;
    openComposer(openRequest.purpose);
  }, [openComposer, openRequest]);

  const sendMessage = async () => {
    if (!subject.trim() || !body.trim()) {
      setMessage({ type: "error", text: "Subject and message are required." });
      return;
    }

    setSending(true);
    setMessage(null);

    try {
      await apiFetch<{ ok: boolean; email_log_id: number }>(`bookings/${booking.id}/message`, {
        method: "POST",
        ...toJsonBody({ subject, body, purpose }),
      });
      setMessage({ type: "success", text: "Message sent." });
      await onLogged?.();
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Message could not be sent." });
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <button type="button" onClick={() => openComposer()} className={buttonClassName}>
        <Mail className="size-4" />
        {buttonLabel}
      </button>

      {isOpen && typeof document !== "undefined" ? createPortal(
        <div
          className="fixed inset-0 z-[2147483647] flex items-center justify-center overflow-hidden bg-black/40 px-3 py-3 sm:px-4 sm:py-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`message-title-${booking.id}`}
        >
          <div className="max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xl dark:border-gray-800 dark:bg-gray-dark">
            <div className="flex items-center justify-between gap-4 border-b border-gray-200 px-4 py-3 dark:border-gray-800 sm:px-5">
              <div>
                <h2 id={`message-title-${booking.id}`} className="text-base font-semibold text-gray-900 dark:text-white/90">
                  Send message
                </h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {booking.customer_name} · {booking.booking_reference}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="flex size-9 items-center justify-center rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-white/5"
                aria-label="Close message composer"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="max-h-[calc(100dvh-6.5rem)] overflow-y-auto p-4 sm:p-5">
              {message ? (
                <div className="mb-4">
                  <FormMessage type={message.type}>{message.text}</FormMessage>
                </div>
              ) : null}

              <div>
                <FieldLabel htmlFor={`message-subject-${booking.id}`} required>Subject</FieldLabel>
                <input
                  id={`message-subject-${booking.id}`}
                  className={inputClass}
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                />
              </div>

              <div className="mt-4">
                <FieldLabel htmlFor={`message-body-${booking.id}`} required>Message</FieldLabel>
                <textarea
                  id={`message-body-${booking.id}`}
                  className={`${textareaClass} min-h-[260px] text-sm leading-6`}
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                />
              </div>

              <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={sendMessage}
                  disabled={sending}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-700 disabled:opacity-60"
                >
                  <Send className="size-4" />
                  {sending ? "Sending" : "Send message"}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
