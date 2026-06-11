import { useEffect, useMemo, useState } from "react";
import { Building2, ExternalLink, Plus, Save, Search } from "lucide-react";
import { apiFetch, toJsonBody } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import type { Account, User, Venue } from "../types";
import {
  FieldLabel,
  FormMessage,
  MultiSelectInput,
  SelectInput,
  inputClass,
} from "../components/resrva/FormField";
import { LoadingState } from "../components/resrva/LoadingState";
import { PageHeader } from "../components/resrva/PageHeader";

type VenueForm = {
  name: string;
  slug: string;
  timezone: string;
  address: string;
  phone: string;
  email: string;
  active: boolean;
};

type CreateVenueForm = VenueForm & {
  account_id: string;
  copy_from_venue_id: string;
  copy_settings: boolean;
  copy_opening_hours: boolean;
  copy_areas_tables: boolean;
  copy_booking_types: boolean;
};

const emptyVenueForm: VenueForm = {
  name: "",
  slug: "",
  timezone: "Australia/Sydney",
  address: "",
  phone: "",
  email: "",
  active: true,
};

function venueToForm(venue: Venue): VenueForm {
  return {
    name: venue.name || "",
    slug: venue.slug || "",
    timezone: venue.timezone || "Australia/Sydney",
    address: venue.address || "",
    phone: venue.phone || "",
    email: venue.email || "",
    active: venue.active !== false && venue.active !== 0,
  };
}

function ToggleRow({
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
    <div className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 px-4 py-3">
      <label htmlFor={id} className="text-sm font-medium text-gray-700">
        {label}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
          checked ? "bg-brand-500" : "bg-gray-300"
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

function publicUrlFor(slug: string): string {
  if (typeof window === "undefined") return `/${slug}`;
  return `${window.location.origin}/${slug}`;
}

export default function VenuesPage() {
  const { currentVenue, refresh } = useAuth();
  const [venues, setVenues] = useState<Venue[] | null>(null);
  const [clients, setClients] = useState<Account[]>([]);
  const [selectedVenueId, setSelectedVenueId] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<VenueForm>(emptyVenueForm);
  const [createForm, setCreateForm] = useState<CreateVenueForm>({
    ...emptyVenueForm,
    account_id: "",
    copy_from_venue_id: "",
    copy_settings: true,
    copy_opening_hours: true,
    copy_areas_tables: true,
    copy_booking_types: true,
  });
  const [venueUsers, setVenueUsers] = useState<User[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  const loadVenues = async () => {
    const [payload, clientsPayload] = await Promise.all([
      apiFetch<{ items: Venue[]; current_venue: Venue | null }>("venues"),
      apiFetch<{ items: Account[] }>("accounts"),
    ]);
    setVenues(payload.items);
    setClients(clientsPayload.items);
    if (!selectedVenueId && !isCreating) {
      const startingVenue = payload.current_venue || payload.items[0] || null;
      if (startingVenue) {
        setSelectedVenueId(startingVenue.id);
        setForm(venueToForm(startingVenue));
      }
    }
  };

  useEffect(() => {
    loadVenues().catch((error) => {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Venues failed to load." });
    });
  }, []);

  const selectedVenue = useMemo(
    () => venues?.find((venue) => venue.id === selectedVenueId) || null,
    [venues, selectedVenueId],
  );

  useEffect(() => {
    if (selectedVenue && !isCreating) {
      setForm(venueToForm(selectedVenue));
    }
  }, [selectedVenue, isCreating]);

  const loadVenueUsers = async (venueId: number) => {
    setLoadingUsers(true);
    try {
      const payload = await apiFetch<{ items: User[] }>(`venues/${venueId}/users`);
      setVenueUsers(payload.items);
      setSelectedUserIds(
        payload.items
          .filter((user) => user.has_access === true || user.has_access === 1)
          .map((user) => String(user.id)),
      );
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    if (!selectedVenueId || isCreating) return;
    loadVenueUsers(selectedVenueId).catch((error) => {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Venue users failed to load." });
    });
  }, [selectedVenueId, isCreating]);

  const filteredVenues = useMemo(() => {
    const needle = search.toLowerCase();
    return (venues || []).filter((venue) =>
      [venue.name, venue.slug, venue.account_name || "", venue.address || "", venue.email || ""].some((value) =>
        value.toLowerCase().includes(needle),
      ),
    );
  }, [venues, search]);

  const venueOptions = (venues || []).map((venue) => ({ value: String(venue.id), label: venue.name }));
  const clientOptions = clients.map((client) => ({ value: String(client.id), label: client.business_name }));

  const startCreate = () => {
    const sourceId = currentVenue?.id || venues?.[0]?.id || "";
    const accountId = currentVenue?.account_id || clients[0]?.id || "";
    setCreateForm({
      ...emptyVenueForm,
      account_id: String(accountId),
      copy_from_venue_id: String(sourceId),
      copy_settings: true,
      copy_opening_hours: true,
      copy_areas_tables: true,
      copy_booking_types: true,
    });
    setIsCreating(true);
    setSelectedVenueId(null);
    setMessage(null);
  };

  const chooseVenue = (venue: Venue) => {
    setIsCreating(false);
    setSelectedVenueId(venue.id);
    setMessage(null);
  };

  const createVenue = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = await apiFetch<{ item: Venue }>("venues", {
        method: "POST",
        ...toJsonBody({
          ...createForm,
          account_id: Number(createForm.account_id || currentVenue?.account_id || 0),
          copy_from_venue_id: Number(createForm.copy_from_venue_id || currentVenue?.id || 0),
        }),
      });
      setMessage({ type: "success", text: `${payload.item.name} created.` });
      setIsCreating(false);
      setSelectedVenueId(payload.item.id);
      await Promise.all([loadVenues(), refresh()]);
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Venue could not be created." });
    } finally {
      setSaving(false);
    }
  };

  const updateVenue = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedVenue) return;

    setSaving(true);
    try {
      const payload = await apiFetch<{ item: Venue }>(`venues/${selectedVenue.id}`, {
        method: "PUT",
        ...toJsonBody(form),
      });
      setMessage({ type: "success", text: `${payload.item.name} updated.` });
      await Promise.all([loadVenues(), refresh()]);
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Venue could not be updated." });
    } finally {
      setSaving(false);
    }
  };

  const saveVenueUsers = async () => {
    if (!selectedVenue) return;

    setSaving(true);
    try {
      await apiFetch<{ ok: boolean }>(`venues/${selectedVenue.id}/users`, {
        method: "PUT",
        ...toJsonBody({ user_ids: selectedUserIds.map((id) => Number(id)) }),
      });
      setMessage({ type: "success", text: "Venue access updated." });
      await loadVenueUsers(selectedVenue.id);
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Venue access could not be saved." });
    } finally {
      setSaving(false);
    }
  };

  if (!venues && message?.type === "error") {
    return <FormMessage type="error">{message.text}</FormMessage>;
  }

  if (!venues) {
    return <LoadingState label="Loading venues" />;
  }

  const headerTitle = isCreating ? (
    <span className="inline-flex items-center gap-2">
      <button type="button" onClick={() => setIsCreating(false)} className="text-gray-500 hover:text-brand-700">
        Venues
      </button>
      <span className="text-gray-400">/</span>
      <span>Add venue</span>
    </span>
  ) : selectedVenue ? (
    <span className="inline-flex items-center gap-2">
      <button type="button" onClick={() => setSelectedVenueId(null)} className="text-gray-500 hover:text-brand-700">
        Venues
      </button>
      <span className="text-gray-400">/</span>
      <span>{selectedVenue.name}</span>
    </span>
  ) : (
    "Venues"
  );

  return (
    <>
      <PageHeader
        title={headerTitle}
        action={
          isCreating || selectedVenue ? (
            <button
              type="button"
              onClick={() => {
                setIsCreating(false);
                setSelectedVenueId(null);
              }}
              className="inline-flex h-10 items-center rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              All venues
            </button>
          ) : (
            <button
              type="button"
              onClick={startCreate}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"
            >
              <Plus className="size-4" />
              Add venue
            </button>
          )
        }
      />

      {message ? <div className="mb-4"><FormMessage type={message.type}>{message.text}</FormMessage></div> : null}

      {!selectedVenue && !isCreating ? (
        <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-theme-sm">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
            <input
              className={`${inputClass} pl-10`}
              placeholder="Search venues"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <div className="mt-5 grid gap-3">
            {filteredVenues.map((venue) => (
              <button
                key={venue.id}
                type="button"
                onClick={() => chooseVenue(venue)}
                className="flex min-h-[76px] w-full items-center justify-between gap-4 rounded-lg border border-gray-200 bg-white px-5 py-4 text-left shadow-theme-xs transition hover:border-brand-200 hover:bg-brand-50/40"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600">
                    <Building2 className="size-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-base font-semibold text-gray-900">{venue.name}</span>
                    <span className="block truncate text-sm text-gray-500">
                      {venue.account_name ? `${venue.account_name} / ${venue.slug}` : `/${venue.slug}`}
                    </span>
                  </span>
                </span>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                    venue.active === false || venue.active === 0
                      ? "bg-gray-100 text-gray-600"
                      : "bg-success-50 text-success-700"
                  }`}
                >
                  {venue.active === false || venue.active === 0 ? "Inactive" : "Active"}
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {isCreating ? (
        <form onSubmit={createVenue} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-theme-sm">
            <h2 className="text-base font-semibold text-gray-900">Venue details</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="create-venue-client">Client</FieldLabel>
                <SelectInput
                  id="create-venue-client"
                  value={createForm.account_id}
                  onChange={(value) => setCreateForm((current) => ({ ...current, account_id: value }))}
                  options={clientOptions}
                />
              </div>
              <div>
                <FieldLabel htmlFor="create-venue-name">Venue name</FieldLabel>
                <input id="create-venue-name" className={inputClass} required value={createForm.name} onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))} />
              </div>
              <div>
                <FieldLabel htmlFor="create-venue-slug">URL ID</FieldLabel>
                <input id="create-venue-slug" className={inputClass} placeholder="old-canberra-inn" value={createForm.slug} onChange={(event) => setCreateForm((current) => ({ ...current, slug: event.target.value }))} />
              </div>
              <div>
                <FieldLabel htmlFor="create-venue-timezone">Timezone</FieldLabel>
                <input id="create-venue-timezone" className={inputClass} value={createForm.timezone} onChange={(event) => setCreateForm((current) => ({ ...current, timezone: event.target.value }))} />
              </div>
              <div>
                <FieldLabel htmlFor="create-venue-phone">Phone</FieldLabel>
                <input id="create-venue-phone" className={inputClass} value={createForm.phone} onChange={(event) => setCreateForm((current) => ({ ...current, phone: event.target.value }))} />
              </div>
              <div>
                <FieldLabel htmlFor="create-venue-email">Email</FieldLabel>
                <input id="create-venue-email" type="email" className={inputClass} value={createForm.email} onChange={(event) => setCreateForm((current) => ({ ...current, email: event.target.value }))} />
              </div>
              <div>
                <FieldLabel htmlFor="create-venue-address">Address</FieldLabel>
                <input id="create-venue-address" className={inputClass} value={createForm.address} onChange={(event) => setCreateForm((current) => ({ ...current, address: event.target.value }))} />
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-theme-sm">
            <h2 className="text-base font-semibold text-gray-900">Copy setup</h2>
            <div className="mt-4 space-y-3">
              <div>
                <FieldLabel htmlFor="copy-from-venue">Copy from</FieldLabel>
                <SelectInput
                  id="copy-from-venue"
                  value={createForm.copy_from_venue_id}
                  onChange={(value) => setCreateForm((current) => ({ ...current, copy_from_venue_id: value }))}
                  options={venueOptions}
                />
              </div>
              <ToggleRow id="copy-settings" label="Settings" checked={createForm.copy_settings} onChange={(checked) => setCreateForm((current) => ({ ...current, copy_settings: checked }))} />
              <ToggleRow id="copy-hours" label="Opening hours" checked={createForm.copy_opening_hours} onChange={(checked) => setCreateForm((current) => ({ ...current, copy_opening_hours: checked }))} />
              <ToggleRow id="copy-layout" label="Tables and areas" checked={createForm.copy_areas_tables} onChange={(checked) => setCreateForm((current) => ({ ...current, copy_areas_tables: checked }))} />
              <ToggleRow id="copy-types" label="Booking types" checked={createForm.copy_booking_types} onChange={(checked) => setCreateForm((current) => ({ ...current, copy_booking_types: checked }))} />
              <button type="submit" disabled={saving} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60">
                <Plus className="size-4" />
                Create venue
              </button>
            </div>
          </section>
        </form>
      ) : null}

      {selectedVenue ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <form onSubmit={updateVenue} className="rounded-lg border border-gray-200 bg-white p-5 shadow-theme-sm">
            <div className="flex flex-col gap-3 border-b border-gray-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Venue details</h2>
                <a
                  href={publicUrlFor(form.slug)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-sm text-brand-700 hover:text-brand-800"
                >
                  /{form.slug}
                  <ExternalLink className="size-3.5" />
                </a>
              </div>
              <button type="submit" disabled={saving} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60">
                <Save className="size-4" />
                Save
              </button>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="venue-name">Venue name</FieldLabel>
                <input id="venue-name" className={inputClass} required value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
              </div>
              <div>
                <FieldLabel htmlFor="venue-slug">URL ID</FieldLabel>
                <input id="venue-slug" className={inputClass} required value={form.slug} onChange={(event) => setForm((current) => ({ ...current, slug: event.target.value }))} />
              </div>
              <div>
                <FieldLabel htmlFor="venue-timezone">Timezone</FieldLabel>
                <input id="venue-timezone" className={inputClass} value={form.timezone} onChange={(event) => setForm((current) => ({ ...current, timezone: event.target.value }))} />
              </div>
              <div>
                <FieldLabel htmlFor="venue-phone">Phone</FieldLabel>
                <input id="venue-phone" className={inputClass} value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} />
              </div>
              <div>
                <FieldLabel htmlFor="venue-email">Email</FieldLabel>
                <input id="venue-email" type="email" className={inputClass} value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} />
              </div>
              <div>
                <FieldLabel htmlFor="venue-address">Address</FieldLabel>
                <input id="venue-address" className={inputClass} value={form.address} onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))} />
              </div>
            </div>

            <div className="mt-4">
              <ToggleRow id="venue-active" label="Active venue" checked={form.active} onChange={(checked) => setForm((current) => ({ ...current, active: checked }))} />
            </div>
          </form>

          <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-theme-sm">
            <h2 className="text-base font-semibold text-gray-900">Manager access</h2>
            <div className="mt-4">
              {loadingUsers ? (
                <LoadingState label="Loading access" />
              ) : (
                <>
                  <FieldLabel htmlFor="venue-users">Managers</FieldLabel>
                  <MultiSelectInput
                    id="venue-users"
                    values={selectedUserIds}
                    onChange={setSelectedUserIds}
                    placeholder="Select managers"
                    displayValue={`${selectedUserIds.length} selected`}
                    options={venueUsers.map((user) => ({ value: String(user.id), label: user.name }))}
                  />
                  <button
                    type="button"
                    onClick={saveVenueUsers}
                    disabled={saving}
                    className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
                  >
                    <Save className="size-4" />
                    Save access
                  </button>
                </>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
