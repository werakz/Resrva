import { useEffect, useState } from "react";
import { RefreshCw, Save } from "lucide-react";
import { apiFetch, toJsonBody } from "../lib/api";
import type { MetaPayload, OpeningHour } from "../types";
import { FieldLabel, FormMessage, inputClass, selectClass } from "../components/resrva/FormField";
import { LoadingState } from "../components/resrva/LoadingState";
import { PageHeader } from "../components/resrva/PageHeader";

const dayLabels = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function SettingsPage() {
  const [meta, setMeta] = useState<MetaPayload | null>(null);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [openingHours, setOpeningHours] = useState<OpeningHour[]>([]);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  const loadSettings = async () => {
    const payload = await apiFetch<MetaPayload>("settings");
    setMeta(payload);
    setSettings(payload.settings);
    setOpeningHours(payload.opening_hours);
  };

  useEffect(() => {
    loadSettings().catch((err) => {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Settings failed to load." });
    });
  }, []);

  const updateSetting = (key: string, value: string) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const updateHours = (day: number, field: keyof OpeningHour, value: string | boolean) => {
    setOpeningHours((current) =>
      current.map((hours) =>
        Number(hours.day_of_week) === day ? { ...hours, [field]: value } : hours,
      ),
    );
  };

  const saveSettings = async () => {
    await apiFetch<{ ok: boolean }>("settings", {
      method: "PUT",
      ...toJsonBody({ settings, opening_hours: openingHours }),
    });
    setMessage({ type: "success", text: "Settings saved." });
    await loadSettings();
  };

  if (!meta && message?.type === "error") {
    return <FormMessage type="error">{message.text}</FormMessage>;
  }

  if (!meta) {
    return <LoadingState label="Loading settings" />;
  }

  return (
    <>
      <PageHeader
        title="Settings"
        action={
          <>
            <button type="button" onClick={loadSettings} className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50">
              <RefreshCw className="size-4" />
              Refresh
            </button>
            <button type="button" onClick={saveSettings} className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700">
              <Save className="size-4" />
              Save
            </button>
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-theme-sm">
          <h2 className="text-lg font-semibold text-gray-900">Rules</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
            <div>
              <FieldLabel htmlFor="min-guests">Minimum online guests</FieldLabel>
              <input id="min-guests" type="number" className={inputClass} value={settings.min_table_guests || ""} onChange={(event) => updateSetting("min_table_guests", event.target.value)} />
            </div>
            <div>
              <FieldLabel htmlFor="max-guests">Maximum table guests</FieldLabel>
              <input id="max-guests" type="number" className={inputClass} value={settings.max_table_guests || ""} onChange={(event) => updateSetting("max_table_guests", event.target.value)} />
            </div>
            <div>
              <FieldLabel htmlFor="duration">Default duration minutes</FieldLabel>
              <input id="duration" type="number" className={inputClass} value={settings.default_duration_minutes || ""} onChange={(event) => updateSetting("default_duration_minutes", event.target.value)} />
            </div>
            <div>
              <FieldLabel htmlFor="slot">Slot interval minutes</FieldLabel>
              <input id="slot" type="number" className={inputClass} value={settings.slot_interval_minutes || ""} onChange={(event) => updateSetting("slot_interval_minutes", event.target.value)} />
            </div>
            <div>
              <FieldLabel htmlFor="venue-email">Venue email</FieldLabel>
              <input id="venue-email" className={inputClass} value={settings.venue_email || ""} onChange={(event) => updateSetting("venue_email", event.target.value)} />
            </div>
            <div>
              <FieldLabel htmlFor="venue-phone">Venue phone</FieldLabel>
              <input id="venue-phone" className={inputClass} value={settings.venue_phone || ""} onChange={(event) => updateSetting("venue_phone", event.target.value)} />
            </div>
            <div>
              <FieldLabel htmlFor="annual-closed-day">Closed day</FieldLabel>
              <input id="annual-closed-day" className={inputClass} value={settings.annual_closed_day || ""} onChange={(event) => updateSetting("annual_closed_day", event.target.value)} />
            </div>
            <div>
              <FieldLabel htmlFor="venue-name">Venue</FieldLabel>
              <input id="venue-name" className={inputClass} value={settings.venue_name || ""} onChange={(event) => updateSetting("venue_name", event.target.value)} />
            </div>
          </div>
          {message ? <div className="mt-4"><FormMessage type={message.type}>{message.text}</FormMessage></div> : null}
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-theme-sm">
          <h2 className="text-lg font-semibold text-gray-900">Opening hours</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-gray-500">
                  <th className="px-3 py-2 font-medium">Day</th>
                  <th className="px-3 py-2 font-medium">Open</th>
                  <th className="px-3 py-2 font-medium">Close</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {openingHours.map((hours) => {
                  const day = Number(hours.day_of_week);

                  return (
                    <tr key={day}>
                      <td className="px-3 py-3 font-medium text-gray-900">{dayLabels[day]}</td>
                      <td className="px-3 py-3">
                        <input type="time" className={inputClass} value={String(hours.opens_at).slice(0, 5)} onChange={(event) => updateHours(day, "opens_at", event.target.value)} />
                      </td>
                      <td className="px-3 py-3">
                        <input type="time" className={inputClass} value={String(hours.closes_at).slice(0, 5)} onChange={(event) => updateHours(day, "closes_at", event.target.value)} />
                      </td>
                      <td className="px-3 py-3">
                        <select className={selectClass} value={Number(hours.is_closed) ? "1" : "0"} onChange={(event) => updateHours(day, "is_closed", event.target.value === "1")}>
                          <option value="0">Open</option>
                          <option value="1">Closed</option>
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
