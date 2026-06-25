import { useCallback, useEffect, useMemo, useState } from "react";
import { BriefcaseBusiness, LifeBuoy, Plus, Save, Search } from "lucide-react";
import { useNavigate } from "react-router";
import { apiFetch, toJsonBody } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import type { Account, Venue } from "../types";
import { FieldLabel, FormMessage, SelectInput, ToastMessage, inputClass } from "../components/resrva/FormField";
import { LoadingState } from "../components/resrva/LoadingState";
import { PageHeader } from "../components/resrva/PageHeader";

type ClientForm = {
  business_name: string;
  plan: string;
  billing_status: string;
};

type CreateClientForm = ClientForm & {
  venue_name: string;
  venue_slug: string;
  timezone: string;
  address: string;
  phone: string;
  email: string;
  copy_from_venue_id: string;
  copy_settings: boolean;
  copy_opening_hours: boolean;
  copy_areas_tables: boolean;
  copy_booking_types: boolean;
};

const emptyClientForm: ClientForm = {
  business_name: "",
  plan: "standard",
  billing_status: "active",
};

function accountToForm(account: Account): ClientForm {
  return {
    business_name: account.business_name || "",
    plan: account.plan || "standard",
    billing_status: account.billing_status || "active",
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

export default function ClientsPage() {
  const { currentVenue, refresh, startSupport } = useAuth();
  const navigate = useNavigate();
  const [clients, setClients] = useState<Account[] | null>(null);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<ClientForm>(emptyClientForm);
  const [createForm, setCreateForm] = useState<CreateClientForm>({
    ...emptyClientForm,
    venue_name: "",
    venue_slug: "",
    timezone: "Australia/Sydney",
    address: "",
    phone: "",
    email: "",
    copy_from_venue_id: "",
    copy_settings: true,
    copy_opening_hours: true,
    copy_areas_tables: true,
    copy_booking_types: true,
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  const loadClients = useCallback(async () => {
    const [accountsPayload, venuesPayload] = await Promise.all([
      apiFetch<{ items: Account[] }>("accounts"),
      apiFetch<{ items: Venue[] }>("platform/venues"),
    ]);
    setClients(accountsPayload.items);
    setVenues(venuesPayload.items);
  }, []);

  useEffect(() => {
    loadClients().catch((error) => {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Clients failed to load." });
    });
  }, [loadClients]);

  const selectedClient = useMemo(
    () => clients?.find((client) => client.id === selectedClientId) || null,
    [clients, selectedClientId],
  );

  useEffect(() => {
    if (selectedClient && !isCreating) {
      setForm(accountToForm(selectedClient));
    }
  }, [selectedClient, isCreating]);

  const filteredClients = useMemo(() => {
    const needle = search.toLowerCase();
    return (clients || []).filter((client) =>
      [client.business_name, client.plan, client.billing_status].some((value) =>
        String(value).toLowerCase().includes(needle),
      ),
    );
  }, [clients, search]);

  const venueOptions = venues.map((venue) => ({ value: String(venue.id), label: `${venue.account_name || "Client"} / ${venue.name}` }));

  const startCreate = () => {
    setCreateForm({
      ...emptyClientForm,
      venue_name: "",
      venue_slug: "",
      timezone: currentVenue?.timezone || "Australia/Sydney",
      address: "",
      phone: "",
      email: "",
      copy_from_venue_id: String(currentVenue?.id || venues[0]?.id || ""),
      copy_settings: true,
      copy_opening_hours: true,
      copy_areas_tables: true,
      copy_booking_types: true,
    });
    setIsCreating(true);
    setSelectedClientId(null);
    setMessage(null);
  };

  const createClient = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = await apiFetch<{ item: Account; venue: Venue }>("accounts", {
        method: "POST",
        ...toJsonBody({
          ...createForm,
          copy_from_venue_id: Number(createForm.copy_from_venue_id || currentVenue?.id || 0),
        }),
      });
      setMessage({ type: "success", text: `${payload.item.business_name} created.` });
      setIsCreating(false);
      setSelectedClientId(payload.item.id);
      await Promise.all([loadClients(), refresh()]);
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Client could not be created." });
    } finally {
      setSaving(false);
    }
  };

  const updateClient = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedClient) return;

    setSaving(true);
    try {
      const payload = await apiFetch<{ item: Account }>(`accounts/${selectedClient.id}`, {
        method: "PUT",
        ...toJsonBody(form),
      });
      setMessage({ type: "success", text: `${payload.item.business_name} updated.` });
      await loadClients();
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Client could not be updated." });
    } finally {
      setSaving(false);
    }
  };

  const openSupportMode = async (venueId: number) => {
    setSaving(true);
    try {
      await startSupport(venueId);
      navigate("/app");
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Support mode could not be started." });
    } finally {
      setSaving(false);
    }
  };

  if (!clients && message?.type === "error") {
    return <FormMessage type="error">{message.text}</FormMessage>;
  }

  if (!clients) {
    return <LoadingState label="Loading clients" />;
  }

  const headerTitle = isCreating ? (
    <span className="inline-flex items-center gap-2">
      <button type="button" onClick={() => setIsCreating(false)} className="text-gray-500 hover:text-brand-700">
        Clients
      </button>
      <span className="text-gray-400">/</span>
      <span>Add client</span>
    </span>
  ) : selectedClient ? (
    <span className="inline-flex items-center gap-2">
      <button type="button" onClick={() => setSelectedClientId(null)} className="text-gray-500 hover:text-brand-700">
        Clients
      </button>
      <span className="text-gray-400">/</span>
      <span>{selectedClient.business_name}</span>
    </span>
  ) : (
    "Clients"
  );

  return (
    <>
      <PageHeader
        title={headerTitle}
        action={
          isCreating || selectedClient ? (
            <button
              type="button"
              onClick={() => {
                setIsCreating(false);
                setSelectedClientId(null);
              }}
              className="inline-flex h-10 items-center rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              All clients
            </button>
          ) : (
            <button
              type="button"
              onClick={startCreate}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"
            >
              <Plus className="size-4" />
              Add client
            </button>
          )
        }
      />

      {message ? (
        <ToastMessage type={message.type} onDismiss={() => setMessage(null)}>
          {message.text}
        </ToastMessage>
      ) : null}

      {!selectedClient && !isCreating ? (
        <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-theme-sm">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
            <input className={`${inputClass} pl-10`} placeholder="Search clients" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>

          <div className="mt-5 grid gap-3">
            {filteredClients.map((client) => (
              <button
                key={client.id}
                type="button"
                onClick={() => {
                  setIsCreating(false);
                  setSelectedClientId(client.id);
                  setMessage(null);
                }}
                className="flex min-h-[76px] w-full items-center justify-between gap-4 rounded-lg border border-gray-200 bg-white px-5 py-4 text-left shadow-theme-xs transition hover:border-brand-200 hover:bg-brand-50/40"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600">
                    <BriefcaseBusiness className="size-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-base font-semibold text-gray-900">{client.business_name}</span>
                    <span className="block truncate text-sm text-gray-500">
                      {Number(client.venue_count || 0)} venues
                    </span>
                  </span>
                </span>
                <span className="shrink-0 rounded-full bg-success-50 px-2.5 py-1 text-xs font-medium text-success-700">
                  {client.billing_status || "active"}
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {isCreating ? (
        <form onSubmit={createClient} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-theme-sm">
            <h2 className="text-base font-semibold text-gray-900">Client and first venue</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="client-name">Client name</FieldLabel>
                <input id="client-name" className={inputClass} required value={createForm.business_name} onChange={(event) => setCreateForm((current) => ({ ...current, business_name: event.target.value }))} />
              </div>
              <div>
                <FieldLabel htmlFor="client-plan">Plan</FieldLabel>
                <input id="client-plan" className={inputClass} value={createForm.plan} onChange={(event) => setCreateForm((current) => ({ ...current, plan: event.target.value }))} />
              </div>
              <div>
                <FieldLabel htmlFor="first-venue-name">First venue name</FieldLabel>
                <input id="first-venue-name" className={inputClass} required value={createForm.venue_name} onChange={(event) => setCreateForm((current) => ({ ...current, venue_name: event.target.value }))} />
              </div>
              <div>
                <FieldLabel htmlFor="first-venue-slug">Venue URL ID</FieldLabel>
                <input id="first-venue-slug" className={inputClass} placeholder="old-canberra-inn" value={createForm.venue_slug} onChange={(event) => setCreateForm((current) => ({ ...current, venue_slug: event.target.value }))} />
              </div>
              <div>
                <FieldLabel htmlFor="first-venue-timezone">Timezone</FieldLabel>
                <input id="first-venue-timezone" className={inputClass} value={createForm.timezone} onChange={(event) => setCreateForm((current) => ({ ...current, timezone: event.target.value }))} />
              </div>
              <div>
                <FieldLabel htmlFor="first-venue-phone">Phone</FieldLabel>
                <input id="first-venue-phone" className={inputClass} value={createForm.phone} onChange={(event) => setCreateForm((current) => ({ ...current, phone: event.target.value }))} />
              </div>
              <div>
                <FieldLabel htmlFor="first-venue-email">Email</FieldLabel>
                <input id="first-venue-email" type="email" className={inputClass} value={createForm.email} onChange={(event) => setCreateForm((current) => ({ ...current, email: event.target.value }))} />
              </div>
              <div>
                <FieldLabel htmlFor="first-venue-address">Address</FieldLabel>
                <input id="first-venue-address" className={inputClass} value={createForm.address} onChange={(event) => setCreateForm((current) => ({ ...current, address: event.target.value }))} />
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-theme-sm">
            <h2 className="text-base font-semibold text-gray-900">Copy setup</h2>
            <div className="mt-4 space-y-3">
              <div>
                <FieldLabel htmlFor="client-copy-from">Copy from</FieldLabel>
                <SelectInput
                  id="client-copy-from"
                  value={createForm.copy_from_venue_id}
                  onChange={(value) => setCreateForm((current) => ({ ...current, copy_from_venue_id: value }))}
                  options={venueOptions}
                />
              </div>
              <ToggleRow id="client-copy-settings" label="Settings" checked={createForm.copy_settings} onChange={(checked) => setCreateForm((current) => ({ ...current, copy_settings: checked }))} />
              <ToggleRow id="client-copy-hours" label="Opening hours" checked={createForm.copy_opening_hours} onChange={(checked) => setCreateForm((current) => ({ ...current, copy_opening_hours: checked }))} />
              <ToggleRow id="client-copy-layout" label="Tables and areas" checked={createForm.copy_areas_tables} onChange={(checked) => setCreateForm((current) => ({ ...current, copy_areas_tables: checked }))} />
              <ToggleRow id="client-copy-types" label="Booking types" checked={createForm.copy_booking_types} onChange={(checked) => setCreateForm((current) => ({ ...current, copy_booking_types: checked }))} />
              <button type="submit" disabled={saving} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60">
                <Plus className="size-4" />
                Create client
              </button>
            </div>
          </section>
        </form>
      ) : null}

      {selectedClient ? (
        <form onSubmit={updateClient} className="rounded-lg border border-gray-200 bg-white p-5 shadow-theme-sm">
          <div className="flex flex-col gap-3 border-b border-gray-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-base font-semibold text-gray-900">Client details</h2>
            <button type="submit" disabled={saving} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60">
              <Save className="size-4" />
              Save
            </button>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <FieldLabel htmlFor="edit-client-name">Client name</FieldLabel>
              <input id="edit-client-name" className={inputClass} required value={form.business_name} onChange={(event) => setForm((current) => ({ ...current, business_name: event.target.value }))} />
            </div>
            <div>
              <FieldLabel htmlFor="edit-client-plan">Plan</FieldLabel>
              <input id="edit-client-plan" className={inputClass} value={form.plan} onChange={(event) => setForm((current) => ({ ...current, plan: event.target.value }))} />
            </div>
            <div>
              <FieldLabel htmlFor="edit-client-billing">Billing status</FieldLabel>
              <input id="edit-client-billing" className={inputClass} value={form.billing_status} onChange={(event) => setForm((current) => ({ ...current, billing_status: event.target.value }))} />
            </div>
          </div>

          <div className="mt-6 border-t border-gray-100 pt-4">
            <h3 className="text-sm font-semibold text-gray-900">Venues</h3>
            <div className="mt-3 grid gap-2">
              {venues
                .filter((venue) => venue.account_id === selectedClient.id)
                .map((venue) => (
                  <div key={venue.id} className="flex items-center justify-between gap-4 rounded-lg bg-gray-50 px-4 py-3 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-gray-900">{venue.name}</span>
                      <span className="block truncate text-gray-500">/{venue.slug}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => openSupportMode(venue.id)}
                      disabled={saving}
                      className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-brand-200 bg-white px-3 text-xs font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-60"
                    >
                      <LifeBuoy className="size-3.5" />
                      Open support
                    </button>
                  </div>
                ))}
            </div>
          </div>
        </form>
      ) : null}
    </>
  );
}
