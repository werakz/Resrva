import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Mail, Save, Sparkles, X } from "lucide-react";
import { apiFetch, toJsonBody } from "../../lib/api";
import type { Booking } from "../../types";
import { FieldLabel, FormMessage, SelectInput, inputClass, textareaClass } from "./FormField";

export type ReplyPurpose = "confirm" | "update" | "decline" | "request_info";

export function replyPurposeForStatus(status: string): ReplyPurpose {
  if (status === "confirmed" || status === "approved") return "confirm";
  if (status === "declined") return "decline";
  return "update";
}

export function statusNeedsCustomerNotice(status: string): boolean {
  return ["confirmed", "approved", "declined", "cancelled"].includes(status);
}

type ReplyDraft = {
  subject: string;
  body: string;
  provider: string;
  model: string;
};

const purposeOptions: Array<{ value: ReplyPurpose; label: string }> = [
  { value: "confirm", label: "Confirm booking" },
  { value: "update", label: "Booking update" },
  { value: "decline", label: "Decline politely" },
  { value: "request_info", label: "Ask for info" },
];

export function AiReplyComposer({
  booking,
  onLogged,
  openRequest,
  buttonClassName = "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-4 text-sm font-medium text-brand-700 hover:bg-brand-100 dark:border-brand-500/20 dark:bg-brand-500/15 dark:text-brand-300",
}: {
  booking: Booking;
  onLogged?: () => void | Promise<void>;
  openRequest?: { token: number; purpose?: ReplyPurpose };
  buttonClassName?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [purpose, setPurpose] = useState<ReplyPurpose>("confirm");
  const [instructions, setInstructions] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [logging, setLogging] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success" | "info"; text: string } | null>(null);

  const defaultPurpose = useCallback((): ReplyPurpose => replyPurposeForStatus(booking.status), [booking.status]);

  const generateDraft = useCallback(async (draftPurpose = purpose, draftInstructions = instructions) => {
    setDrafting(true);
    setMessage(null);

    try {
      const draft = await apiFetch<ReplyDraft>(`bookings/${booking.id}/reply-draft`, {
        method: "POST",
        ...toJsonBody({ purpose: draftPurpose, instructions: draftInstructions }),
      });
      setSubject(draft.subject);
      setBody(draft.body);
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Reply could not be drafted." });
    } finally {
      setDrafting(false);
    }
  }, [booking.id, instructions, purpose]);

  const openComposer = useCallback((requestedPurpose?: ReplyPurpose) => {
    const initialPurpose = requestedPurpose || defaultPurpose();

    setPurpose(initialPurpose);
    setInstructions("");
    setSubject("");
    setBody("");
    setMessage(null);
    setIsOpen(true);
    void generateDraft(initialPurpose, "");
  }, [defaultPurpose, generateDraft]);

  useEffect(() => {
    if (!openRequest) return;

    openComposer(openRequest.purpose);
  }, [openComposer, openRequest]);

  const logReply = async () => {
    if (!subject.trim() || !body.trim()) {
      setMessage({ type: "error", text: "Subject and reply body are required." });
      return;
    }

    setLogging(true);
    setMessage(null);

    try {
      await apiFetch<{ ok: boolean; email_log_id: number }>(`bookings/${booking.id}/reply-log`, {
        method: "POST",
        ...toJsonBody({ subject, body }),
      });
      setMessage({ type: "success", text: "Reply logged to email history." });
      await onLogged?.();
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Reply could not be logged." });
    } finally {
      setLogging(false);
    }
  };

  return (
    <>
      <button type="button" onClick={() => openComposer()} className={buttonClassName}>
        <Sparkles className="size-4" />
        Draft reply
      </button>

      {isOpen && typeof document !== "undefined" ? createPortal(
        <div
          className="fixed inset-0 z-[2147483647] flex items-center justify-center overflow-hidden bg-black/40 px-3 py-3 sm:px-4 sm:py-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`ai-reply-title-${booking.id}`}
        >
          <div className="max-h-[calc(100dvh-1.5rem)] w-full max-w-3xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xl dark:border-gray-800 dark:bg-gray-dark">
            <div className="flex items-center justify-between gap-4 border-b border-gray-200 px-4 py-3 dark:border-gray-800 sm:px-5">
              <div>
                <h2 id={`ai-reply-title-${booking.id}`} className="text-base font-semibold text-gray-900 dark:text-white/90">
                  AI reply draft
                </h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {booking.customer_name} · {booking.booking_reference}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="flex size-9 items-center justify-center rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-white/5"
                aria-label="Close AI reply composer"
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

              <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
                <section className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                  <div>
                    <FieldLabel htmlFor={`ai-reply-purpose-${booking.id}`}>Reply type</FieldLabel>
                    <SelectInput
                      id={`ai-reply-purpose-${booking.id}`}
                      value={purpose}
                      onChange={(value) => setPurpose(value as ReplyPurpose)}
                      options={purposeOptions}
                    />
                  </div>

                  <div className="mt-4">
                    <FieldLabel htmlFor={`ai-reply-instructions-${booking.id}`}>Instructions for AI</FieldLabel>
                    <textarea
                      id={`ai-reply-instructions-${booking.id}`}
                      className={`${textareaClass} min-h-24`}
                      placeholder="Example: mention the deposit, ask for dietary requirements, or keep it shorter."
                      value={instructions}
                      onChange={(event) => setInstructions(event.target.value)}
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => generateDraft()}
                    disabled={drafting}
                    className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-700 disabled:opacity-60"
                  >
                    <Sparkles className="size-4" />
                    {drafting ? "Updating" : body ? "Update draft" : "Generate draft"}
                  </button>

                </section>

                <section className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                  <div>
                    <FieldLabel htmlFor={`ai-reply-subject-${booking.id}`}>Subject</FieldLabel>
                    <input
                      id={`ai-reply-subject-${booking.id}`}
                      className={inputClass}
                      value={subject}
                      onChange={(event) => setSubject(event.target.value)}
                    />
                  </div>

                  <div className="mt-4">
                    <FieldLabel htmlFor={`ai-reply-body-${booking.id}`}>Reply</FieldLabel>
                    <textarea
                      id={`ai-reply-body-${booking.id}`}
                      className={`${textareaClass} min-h-[220px] font-mono text-sm leading-6`}
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
                      onClick={logReply}
                      disabled={logging}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-700 disabled:opacity-60"
                    >
                      {logging ? <Save className="size-4" /> : <Mail className="size-4" />}
                      {logging ? "Logging" : "Log reply"}
                    </button>
                  </div>
                </section>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
