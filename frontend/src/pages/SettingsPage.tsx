import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import flatpickr from "flatpickr";
import type { Instance as FlatpickrInstance } from "flatpickr/dist/types/instance";
import { CalendarDays, ChevronRight, ImageIcon, Save, Trash2, Upload, X } from "lucide-react";
import { apiFetch, apiUpload, toJsonBody } from "../lib/api";
import type { MetaPayload, OpeningHour } from "../types";
import { FieldLabel, FormMessage, SelectInput, ToastMessage, inputClass, textareaClass } from "../components/resrva/FormField";
import { LoadingState } from "../components/resrva/LoadingState";
import { PageHeader } from "../components/resrva/PageHeader";

const dayLabels = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const defaultSettings: Record<string, string> = {
  min_table_guests: "8",
  max_table_guests: "29",
  default_duration_minutes: "120",
  slot_interval_minutes: "30",
  minimum_booking_notice_minutes: "0",
  annual_closed_day: "12-25",
  annual_closed_days: "12-25",
  venue_name: "Old Canberra Inn",
  venue_phone: "(02) 6134 6000",
  venue_email: "manager@oldcanberrainn.com.au",
  venue_image_url: "",
  booking_policy_note: "Online bookings are for groups of 8 or more. Smaller groups are welcome to walk in.",
  booking_terms_and_conditions:
    "Bookings are subject to venue availability and confirmation.\n\nPlease arrive on time for your booking. Tables may be released if guests arrive late without contacting the venue.\n\nGuest numbers should be accurate at the time of booking. If your party size changes, please contact the venue before your visit.\n\nSpecial requests are noted but cannot be guaranteed. The venue will do its best to accommodate seating preferences, accessibility needs, allergies, and dietary requirements when notified in advance.\n\nThe venue may contact you using the details provided to confirm, update, or manage your booking.\n\nThe venue may cancel or amend bookings where required due to operational needs, private events, safety requirements, or incorrect booking information.\n\nBy submitting a booking, you agree to these terms and confirm that the details provided are accurate.",
  online_table_bookings_enabled: "1",
  online_function_requests_enabled: "1",
  auto_assignment_enabled: "1",
};
const annualPickerYear = 2024;

type SettingsPanel = "overview" | "venue" | "online" | "blocked" | "rules" | "assignment" | "hours";

const panelLabels: Record<SettingsPanel, string> = {
  overview: "Overview",
  venue: "Venue Details",
  online: "Online Bookings",
  blocked: "Blocked Dates",
  rules: "Booking Rules",
  assignment: "Auto Assignment",
  hours: "Opening Hours",
};

const settingsPanels: Array<{ id: Exclude<SettingsPanel, "overview">; title: string }> = [
  { id: "venue", title: "Venue Details" },
  { id: "online", title: "Online Bookings" },
  { id: "blocked", title: "Blocked Dates" },
  { id: "rules", title: "Booking Rules" },
  { id: "assignment", title: "Auto Assignment" },
  { id: "hours", title: "Opening Hours" },
];

function parseClosedMonthDays(value: string): string[] {
  return value
    .split(",")
    .map((date) => date.trim())
    .filter((date) => /^\d{2}-\d{2}$/.test(date))
    .filter((date, index, dates) => dates.indexOf(date) === index)
    .sort();
}

function monthDayFromDate(date: Date): string {
  return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function pickerDateFromMonthDay(monthDay: string): string {
  return `${annualPickerYear}-${monthDay}`;
}

function closedDateLabel(monthDay: string): string {
  const [month, day] = monthDay.split("-").map(Number);
  const date = new Date(annualPickerYear, month - 1, day);

  return new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short" }).format(date);
}

function closedDatesDisplay(value: string): string {
  const dates = parseClosedMonthDays(value);

  return dates.length > 0 ? dates.map(closedDateLabel).join(", ") : "No annual closed dates";
}

function blockedDateLabel(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  return new Intl.DateTimeFormat("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function SettingsSection({
  title,
  children,
  className = "",
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03] ${className}`}>
      {title ? (
        <div className="border-b border-gray-100 px-5 py-4 dark:border-gray-800">
          <h2 className="text-base font-medium text-gray-800 dark:text-white/90">{title}</h2>
        </div>
      ) : null}
      <div className="p-5">{children}</div>
    </section>
  );
}

function SettingsRow({
  title,
  onClick,
}: {
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[76px] w-full items-center justify-between gap-4 rounded-2xl border border-gray-200 bg-white px-5 py-4 text-left shadow-theme-xs transition hover:border-brand-200 hover:bg-brand-50/40 dark:border-gray-800 dark:bg-white/[0.03] dark:hover:border-brand-500/30 dark:hover:bg-brand-500/10"
    >
      <span className="min-w-0 text-base font-semibold text-gray-900 dark:text-white/90">{title}</span>
      <ChevronRight className="size-5 shrink-0 text-gray-400" />
    </button>
  );
}

function SettingSwitch({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 px-4 py-3 dark:border-gray-800">
      <label htmlFor={id} className="text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
          checked ? "bg-brand-500" : "bg-gray-300 dark:bg-gray-700"
        }`}
      >
        <span
          className={`inline-block size-5 rounded-full bg-white shadow-theme-xs transition ${
            checked ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}

function AnnualClosedDatesPicker({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const pickerRef = useRef<FlatpickrInstance | null>(null);
  const onChangeRef = useRef(onChange);
  const initialValueRef = useRef(value);
  const initialDatesRef = useRef(parseClosedMonthDays(value).map(pickerDateFromMonthDay));

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!inputRef.current) return undefined;

    const picker = flatpickr(inputRef.current, {
      appendTo: document.body,
      mode: "multiple",
      dateFormat: "Y-m-d",
      disableMobile: true,
      defaultDate: initialDatesRef.current,
      onChange: (selectedDates) => {
        const nextValue = selectedDates.map(monthDayFromDate).sort().join(",");
        onChangeRef.current(nextValue);
        if (inputRef.current) {
          inputRef.current.value = closedDatesDisplay(nextValue);
        }
      },
    });

    if (!Array.isArray(picker)) {
      pickerRef.current = picker;
      if (inputRef.current) {
        inputRef.current.value = closedDatesDisplay(initialValueRef.current);
      }
    }

    return () => {
      if (!Array.isArray(picker)) {
        picker.destroy();
      }
      pickerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const picker = pickerRef.current;
    if (!picker) return;

    picker.setDate(parseClosedMonthDays(value).map(pickerDateFromMonthDay), false, "Y-m-d");
    if (inputRef.current) {
      inputRef.current.value = closedDatesDisplay(value);
    }
  }, [value]);

  return (
    <div className="relative">
      <input
        id={id}
        ref={inputRef}
        readOnly
        value={closedDatesDisplay(value)}
        onClick={() => pickerRef.current?.open()}
        className={`${inputClass} pr-10`}
      />
      <CalendarDays className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
    </div>
  );
}

export default function SettingsPage() {
  const [meta, setMeta] = useState<MetaPayload | null>(null);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [openingHours, setOpeningHours] = useState<OpeningHour[]>([]);
  const [blockedOnlineDates, setBlockedOnlineDates] = useState<string[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [activePanel, setActivePanel] = useState<SettingsPanel>("overview");

  const loadSettings = async () => {
    const payload = await apiFetch<MetaPayload>("settings");
    const nextSettings = {
      ...defaultSettings,
      ...payload.settings,
      annual_closed_days:
        payload.settings.annual_closed_days || payload.settings.annual_closed_day || defaultSettings.annual_closed_days,
    };
    setMeta(payload);
    setSettings(nextSettings);
    setOpeningHours(payload.opening_hours);
    setBlockedOnlineDates((payload.online_booking_blocks || []).map((block) => block.block_date).sort());
  };

  useEffect(() => {
    loadSettings().catch((err) => {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Settings failed to load." });
    });
  }, []);

  const updateSetting = (key: string, value: string) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const settingValue = (key: string) => settings[key] ?? defaultSettings[key] ?? "";

  const updateSettingToggle = (key: string, value: boolean) => {
    updateSetting(key, value ? "1" : "0");
  };

  const settingEnabled = (key: string) => settingValue(key) !== "0";

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

  const removeBlockedOnlineDate = async (date: string) => {
    try {
      await apiFetch<{ ok: boolean }>(`online-booking-blocks/${date}`, { method: "DELETE" });
      setBlockedOnlineDates((current) => current.filter((blockedDate) => blockedDate !== date));
      setMessage({ type: "success", text: "Blocked date removed." });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Blocked date could not be removed." });
    }
  };

  const uploadVenueImage = async (file: File | undefined) => {
    if (!file) return;

    const formData = new FormData();
    formData.append("image", file);
    setUploadingImage(true);

    try {
      const response = await apiUpload<{ url: string }>("settings/venue-image", formData);
      updateSetting("venue_image_url", response.url);
      setMessage({ type: "success", text: "Venue image updated." });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Venue image could not be uploaded." });
    } finally {
      setUploadingImage(false);
    }
  };

  const removeVenueImage = async () => {
    try {
      await apiFetch<{ ok: boolean }>("settings/venue-image", { method: "DELETE" });
      updateSetting("venue_image_url", "");
      setMessage({ type: "success", text: "Venue image removed." });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Venue image could not be removed." });
    }
  };

  const renderOverviewPanel = () => (
    <section className="space-y-3">
      {settingsPanels.map((panel) => (
        <SettingsRow
          key={panel.id}
          title={panel.title}
          onClick={() => {
            setActivePanel(panel.id);
            setMessage(null);
          }}
        />
      ))}
    </section>
  );

  const renderVenuePanel = () => (
    <SettingsSection>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <FieldLabel htmlFor="venue-name">Venue name</FieldLabel>
          <input id="venue-name" className={inputClass} value={settingValue("venue_name")} onChange={(event) => updateSetting("venue_name", event.target.value)} />
        </div>
        <div>
          <FieldLabel htmlFor="venue-phone">Phone</FieldLabel>
          <input id="venue-phone" className={inputClass} value={settingValue("venue_phone")} onChange={(event) => updateSetting("venue_phone", event.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <FieldLabel htmlFor="venue-email">Email</FieldLabel>
          <input id="venue-email" type="email" className={inputClass} value={settingValue("venue_email")} onChange={(event) => updateSetting("venue_email", event.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <FieldLabel htmlFor="venue-image">Venue image</FieldLabel>
          <div className="grid gap-4 rounded-lg border border-gray-200 p-4 dark:border-gray-800 sm:grid-cols-[168px_1fr]">
            <div className="flex h-32 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900">
              {settingValue("venue_image_url") ? (
                <img
                  src={settingValue("venue_image_url")}
                  alt={settingValue("venue_name") || "Venue"}
                  className="h-full w-full object-cover"
                />
              ) : (
                <ImageIcon className="size-8 text-gray-400" />
              )}
            </div>
            <div className="flex flex-wrap content-start items-center gap-3">
              <input
                id="venue-image"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="sr-only"
                onChange={(event) => {
                  uploadVenueImage(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
              <label
                htmlFor="venue-image"
                className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"
              >
                <Upload className="size-4" />
                {uploadingImage ? "Uploading" : settingValue("venue_image_url") ? "Replace image" : "Upload image"}
              </label>
              {settingValue("venue_image_url") ? (
                <button
                  type="button"
                  onClick={removeVenueImage}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
                >
                  <Trash2 className="size-4" />
                  Remove
                </button>
              ) : null}
            </div>
          </div>
        </div>
        <div>
          <FieldLabel htmlFor="annual-closed-days">Annual closed dates</FieldLabel>
          <AnnualClosedDatesPicker
            id="annual-closed-days"
            value={settingValue("annual_closed_days") || settingValue("annual_closed_day")}
            onChange={(value) => {
              updateSetting("annual_closed_days", value);
              updateSetting("annual_closed_day", parseClosedMonthDays(value)[0] || "");
            }}
          />
        </div>
      </div>
    </SettingsSection>
  );

  const renderOnlinePanel = () => (
    <SettingsSection>
      <div className="space-y-4">
        <SettingSwitch
          id="online-table-bookings"
          label="Table bookings"
          checked={settingEnabled("online_table_bookings_enabled")}
          onChange={(checked) => updateSettingToggle("online_table_bookings_enabled", checked)}
        />
        <SettingSwitch
          id="online-function-requests"
          label="Function requests"
          checked={settingEnabled("online_function_requests_enabled")}
          onChange={(checked) => updateSettingToggle("online_function_requests_enabled", checked)}
        />
        <div>
          <FieldLabel htmlFor="booking-policy-note">Policy note</FieldLabel>
          <textarea
            id="booking-policy-note"
            className={`${textareaClass} min-h-28`}
            value={settingValue("booking_policy_note")}
            onChange={(event) => updateSetting("booking_policy_note", event.target.value)}
          />
        </div>
        <div>
          <FieldLabel htmlFor="booking-terms">Terms and conditions</FieldLabel>
          <textarea
            id="booking-terms"
            className={`${textareaClass} min-h-56`}
            value={settingValue("booking_terms_and_conditions")}
            onChange={(event) => updateSetting("booking_terms_and_conditions", event.target.value)}
          />
        </div>
      </div>
    </SettingsSection>
  );

  const renderBlockedPanel = () => (
    <SettingsSection>
      {blockedOnlineDates.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-200 px-4 py-5 text-sm font-medium text-gray-500 dark:border-gray-800 dark:text-gray-400">
          No dates blocked.
        </div>
      ) : (
        <div className="space-y-2">
          {blockedOnlineDates.map((date) => (
            <div
              key={date}
              className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-4 py-3 dark:border-gray-800"
            >
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {blockedDateLabel(date)}
              </span>
              <button
                type="button"
                onClick={() => removeBlockedOnlineDate(date)}
                className="inline-flex size-8 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
                aria-label={`Remove ${blockedDateLabel(date)}`}
              >
                <X className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </SettingsSection>
  );

  const renderRulesPanel = () => (
    <SettingsSection>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <FieldLabel htmlFor="min-guests">Minimum online guests</FieldLabel>
          <input id="min-guests" type="number" min="1" className={inputClass} value={settingValue("min_table_guests")} onChange={(event) => updateSetting("min_table_guests", event.target.value)} />
        </div>
        <div>
          <FieldLabel htmlFor="max-guests">Maximum table guests</FieldLabel>
          <input id="max-guests" type="number" min="1" className={inputClass} value={settingValue("max_table_guests")} onChange={(event) => updateSetting("max_table_guests", event.target.value)} />
        </div>
        <div>
          <FieldLabel htmlFor="minimum-notice">Minimum advance notice</FieldLabel>
          <SelectInput
            id="minimum-notice"
            value={settingValue("minimum_booking_notice_minutes")}
            onChange={(value) => updateSetting("minimum_booking_notice_minutes", value)}
            options={[
              { value: "0", label: "No minimum" },
              { value: "30", label: "30 minutes" },
              { value: "60", label: "1 hour" },
              { value: "120", label: "2 hours" },
              { value: "240", label: "4 hours" },
              { value: "720", label: "12 hours" },
              { value: "1440", label: "1 day" },
              { value: "2880", label: "2 days" },
              { value: "10080", label: "1 week" },
            ]}
          />
        </div>
        <div>
          <FieldLabel htmlFor="duration">Default duration</FieldLabel>
          <SelectInput
            id="duration"
            value={settingValue("default_duration_minutes")}
            onChange={(value) => updateSetting("default_duration_minutes", value)}
            options={[
              { value: "60", label: "60 minutes" },
              { value: "90", label: "90 minutes" },
              { value: "120", label: "120 minutes" },
              { value: "150", label: "150 minutes" },
              { value: "180", label: "180 minutes" },
            ]}
          />
        </div>
        <div>
          <FieldLabel htmlFor="slot">Slot interval</FieldLabel>
          <SelectInput
            id="slot"
            value={settingValue("slot_interval_minutes")}
            onChange={(value) => updateSetting("slot_interval_minutes", value)}
            options={[
              { value: "15", label: "15 minutes" },
              { value: "30", label: "30 minutes" },
              { value: "45", label: "45 minutes" },
              { value: "60", label: "60 minutes" },
            ]}
          />
        </div>
      </div>
    </SettingsSection>
  );

  const renderAssignmentPanel = () => (
    <SettingsSection>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <SettingSwitch
            id="auto-assignment-enabled"
            label="Auto assign online bookings"
            checked={settingEnabled("auto_assignment_enabled")}
            onChange={(checked) => updateSettingToggle("auto_assignment_enabled", checked)}
          />
        </div>
      </div>
    </SettingsSection>
  );

  const renderHoursPanel = () => (
    <SettingsSection>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-800">
          <thead>
            <tr className="text-left text-xs uppercase text-gray-500 dark:text-gray-400">
              <th className="px-3 py-2 font-medium">Day</th>
              <th className="px-3 py-2 font-medium">Open</th>
              <th className="px-3 py-2 font-medium">Close</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {openingHours.map((hours) => {
              const day = Number(hours.day_of_week);

              return (
                <tr key={day}>
                  <td className="px-3 py-3 font-medium text-gray-900 dark:text-white/90">{dayLabels[day]}</td>
                  <td className="px-3 py-3">
                    <input type="time" className={inputClass} value={String(hours.opens_at).slice(0, 5)} onChange={(event) => updateHours(day, "opens_at", event.target.value)} />
                  </td>
                  <td className="px-3 py-3">
                    <input type="time" className={inputClass} value={String(hours.closes_at).slice(0, 5)} onChange={(event) => updateHours(day, "closes_at", event.target.value)} />
                  </td>
                  <td className="px-3 py-3">
                    <SelectInput
                      value={Number(hours.is_closed) ? "1" : "0"}
                      onChange={(value) => updateHours(day, "is_closed", value === "1")}
                      ariaLabel={`${dayLabels[day]} status`}
                      options={[
                        { value: "0", label: "Open" },
                        { value: "1", label: "Closed" },
                      ]}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </SettingsSection>
  );

  const renderActivePanel = () => {
    switch (activePanel) {
      case "venue":
        return renderVenuePanel();
      case "online":
        return renderOnlinePanel();
      case "blocked":
        return renderBlockedPanel();
      case "rules":
        return renderRulesPanel();
      case "assignment":
        return renderAssignmentPanel();
      case "hours":
        return renderHoursPanel();
      default:
        return renderOverviewPanel();
    }
  };

  if (!meta && message?.type === "error") {
    return <FormMessage type="error">{message.text}</FormMessage>;
  }

  if (!meta) {
    return <LoadingState label="Loading settings" />;
  }

  const showSettingsList = () => {
    setActivePanel("overview");
    setMessage(null);
  };

  const headerTitle =
    activePanel === "overview" ? (
      "Settings"
    ) : (
      <span className="flex min-w-0 flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={showSettingsList}
          className="rounded-md text-gray-500 transition hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          Settings
        </button>
        <ChevronRight className="size-5 shrink-0 text-gray-400" />
        <span className="min-w-0 truncate text-gray-900">{panelLabels[activePanel]}</span>
      </span>
    );

  const headerAction =
    activePanel === "overview" ? null : (
      <button
        type="button"
        onClick={saveSettings}
        className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"
      >
        <Save className="size-4" />
        Save
      </button>
    );

  return (
    <>
      <PageHeader title={headerTitle} action={headerAction} />

      {message ? (
        <ToastMessage type={message.type} onDismiss={() => setMessage(null)}>
          {message.text}
        </ToastMessage>
      ) : null}

      {renderActivePanel()}
    </>
  );
}
