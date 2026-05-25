import { useEffect, useState } from "react";
import { Bot, Mail } from "lucide-react";
import { apiFetch } from "../lib/api";
import type { AiLog, EmailLog } from "../types";
import { LoadingState } from "../components/resrva/LoadingState";
import { PageHeader } from "../components/resrva/PageHeader";
import { StatusBadge } from "../components/resrva/StatusBadge";

function parseJsonList(value: string): string {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.join(", ") : String(parsed);
  } catch {
    return value;
  }
}

export default function AiLogPage() {
  const [aiLogs, setAiLogs] = useState<AiLog[] | null>(null);
  const [emailLogs, setEmailLogs] = useState<EmailLog[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      apiFetch<{ items: AiLog[] }>("ai-logs"),
      apiFetch<{ items: EmailLog[] }>("email-logs"),
    ])
      .then(([aiPayload, emailPayload]) => {
        setAiLogs(aiPayload.items);
        setEmailLogs(emailPayload.items);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Logs failed to load."));
  }, []);

  if (error) {
    return <div className="rounded-lg border border-error-200 bg-error-50 p-4 text-sm text-error-700">{error}</div>;
  }

  if (!aiLogs || !emailLogs) {
    return <LoadingState label="Loading responsible AI evidence" />;
  }

  return (
    <>
      <PageHeader
        title="AI Assistant Log"
        description="Audit trail for local table assignment suggestions, manager overrides, and simulated emails."
      />

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-theme-sm">
          <div className="mb-4 flex items-center gap-2">
            <Bot className="size-5 text-brand-700" />
            <h2 className="text-lg font-semibold text-gray-900">Assignment suggestions</h2>
          </div>
          <div className="space-y-3">
            {aiLogs.map((log) => (
              <article key={log.id} className="rounded-lg border border-gray-200 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-semibold text-gray-900">{log.booking_reference}</p>
                    <p className="text-sm text-gray-500">
                      {log.customer_name} - {log.booking_date} {log.start_time.slice(0, 5)}
                    </p>
                  </div>
                  <StatusBadge status={Number(log.overridden) ? "overridden" : "accepted"} />
                </div>
                <p className="mt-3 text-sm text-gray-600">{log.explanation}</p>
                <p className="mt-2 text-xs text-gray-500">
                  Suggested tables: {parseJsonList(log.suggested_table_numbers_json)} | Final tables:{" "}
                  {parseJsonList(log.final_table_numbers_json)}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-theme-sm">
          <div className="mb-4 flex items-center gap-2">
            <Mail className="size-5 text-brand-700" />
            <h2 className="text-lg font-semibold text-gray-900">Email log</h2>
          </div>
          <div className="space-y-3">
            {emailLogs.map((log) => (
              <article key={log.id} className="rounded-lg border border-gray-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-gray-900">{log.subject}</p>
                    <p className="mt-1 text-xs text-gray-500">{log.recipient_email}</p>
                  </div>
                  <StatusBadge status={log.status} />
                </div>
                <p className="mt-3 text-sm text-gray-600">{log.body}</p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
