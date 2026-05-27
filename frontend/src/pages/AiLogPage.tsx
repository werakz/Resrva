import { useEffect, useMemo, useState } from "react";
import { Bot, Clock3, Mail, RefreshCw } from "lucide-react";
import { apiFetch } from "../lib/api";
import type { ActivityLog, AiLog, EmailLog } from "../types";
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
  const [activityLogs, setActivityLogs] = useState<ActivityLog[] | null>(null);
  const [tab, setTab] = useState<"ai" | "email" | "activity">("ai");
  const [error, setError] = useState("");

  const loadLogs = () => {
    setError("");
    Promise.all([
      apiFetch<{ items: AiLog[] }>("ai-logs"),
      apiFetch<{ items: EmailLog[] }>("email-logs"),
      apiFetch<{ items: ActivityLog[] }>("activity-logs"),
    ])
      .then(([aiPayload, emailPayload, activityPayload]) => {
        setAiLogs(aiPayload.items);
        setEmailLogs(emailPayload.items);
        setActivityLogs(activityPayload.items);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Logs failed to load."));
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const tabs = useMemo(
    () => [
      { key: "ai" as const, label: "AI", count: aiLogs?.length || 0, icon: <Bot className="size-4" /> },
      { key: "email" as const, label: "Email", count: emailLogs?.length || 0, icon: <Mail className="size-4" /> },
      { key: "activity" as const, label: "Activity", count: activityLogs?.length || 0, icon: <Clock3 className="size-4" /> },
    ],
    [activityLogs, aiLogs, emailLogs],
  );

  if (error) {
    return <div className="rounded-lg border border-error-200 bg-error-50 p-4 text-sm text-error-700">{error}</div>;
  }

  if (!aiLogs || !emailLogs || !activityLogs) {
    return <LoadingState label="Loading logs" />;
  }

  return (
    <>
      <PageHeader
        title="AI Assistant Log"
        action={
          <button type="button" onClick={loadLogs} className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50">
            <RefreshCw className="size-4" />
            Refresh
          </button>
        }
      />

      <div className="mb-5 flex flex-wrap gap-2">
        {tabs.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={`inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium ${
              tab === item.key
                ? "bg-brand-600 text-white"
                : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            {item.icon}
            {item.label}
            <span className="rounded-full bg-white/20 px-2 text-xs">{item.count}</span>
          </button>
        ))}
      </div>

      {tab === "ai" ? (
        <section className="grid gap-3">
          {aiLogs.map((log) => (
            <article key={log.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-theme-xs">
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
                Suggested: {parseJsonList(log.suggested_table_numbers_json)} | Final:{" "}
                {parseJsonList(log.final_table_numbers_json)}
              </p>
            </article>
          ))}
        </section>
      ) : null}

      {tab === "email" ? (
        <section className="grid gap-3">
          {emailLogs.map((log) => (
            <article key={log.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-theme-xs">
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
        </section>
      ) : null}

      {tab === "activity" ? (
        <section className="rounded-lg border border-gray-200 bg-white shadow-theme-sm">
          <div className="divide-y divide-gray-100">
            {activityLogs.map((log) => (
              <div key={log.id} className="grid gap-2 p-4 text-sm md:grid-cols-[1fr_160px_180px]">
                <div>
                  <p className="font-medium text-gray-900">
                    {log.action.replace("_", " ")} {log.entity_type}
                  </p>
                  <p className="mt-1 text-gray-500">{log.user_name || "Public"}</p>
                </div>
                <p className="text-gray-500">{log.entity_id ? `#${log.entity_id}` : ""}</p>
                <p className="text-gray-500">{log.created_at}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
