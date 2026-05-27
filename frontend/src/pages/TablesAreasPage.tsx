import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Save } from "lucide-react";
import { apiFetch, toJsonBody } from "../lib/api";
import type { Area, TableRecord } from "../types";
import { FieldLabel, FormMessage, inputClass, selectClass } from "../components/resrva/FormField";
import { LoadingState } from "../components/resrva/LoadingState";
import { PageHeader } from "../components/resrva/PageHeader";

type TablesPayload = {
  areas: Area[];
  tables: TableRecord[];
};

export default function TablesAreasPage() {
  const [data, setData] = useState<TablesPayload | null>(null);
  const [selectedTableId, setSelectedTableId] = useState("");
  const [capacity, setCapacity] = useState("8");
  const [active, setActive] = useState("1");
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  const loadTables = async () => {
    const payload = await apiFetch<TablesPayload>("tables");
    setData(payload);
  };

  useEffect(() => {
    loadTables().catch((err) => {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Tables failed to load." });
    });
  }, []);

  const tablesByArea = useMemo(() => {
    const grouped = new Map<number, TableRecord[]>();
    for (const table of data?.tables || []) {
      grouped.set(table.area_id, [...(grouped.get(table.area_id) || []), table]);
    }
    return grouped;
  }, [data]);

  const selectedTable = useMemo(() => {
    return data?.tables.find((table) => String(table.id) === selectedTableId) || null;
  }, [data, selectedTableId]);

  const activeTables = useMemo(
    () => (data?.tables || []).filter((table) => Number(table.active)).length,
    [data],
  );

  useEffect(() => {
    if (selectedTable) {
      setCapacity(String(selectedTable.capacity));
      setActive(String(Number(selectedTable.active)));
    }
  }, [selectedTable]);

  const saveTable = async () => {
    if (!selectedTable) return;

    await apiFetch<{ ok: boolean }>(`tables/${selectedTable.id}`, {
      method: "PUT",
      ...toJsonBody({ capacity: Number(capacity), active: active === "1" }),
    });
    setMessage({ type: "success", text: `Table ${selectedTable.table_number} updated.` });
    await loadTables();
  };

  if (!data && message?.type === "error") {
    return <FormMessage type="error">{message.text}</FormMessage>;
  }

  if (!data) {
    return <LoadingState label="Loading tables and areas" />;
  }

  return (
    <>
      <PageHeader
        title="Tables / Areas"
        action={
          <button type="button" onClick={loadTables} className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50">
            <RefreshCw className="size-4" />
            Refresh
          </button>
        }
      />

      <div className="mb-5 grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-theme-sm">
          <p className="text-sm text-gray-500">Areas</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">{data.areas.length}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-theme-sm">
          <p className="text-sm text-gray-500">Tables</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">{data.tables.length}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-theme-sm">
          <p className="text-sm text-gray-500">Active</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">{activeTables}</p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="grid gap-4 md:grid-cols-2">
          {data.areas.map((area) => {
            const tables = tablesByArea.get(area.id) || [];
            const activeCount = tables.filter((table) => Boolean(Number(table.active))).length;

            return (
              <section key={area.id} className="rounded-lg border border-gray-200 bg-white p-5 shadow-theme-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">{area.name}</h2>
                    <p className="mt-1 text-sm text-gray-500">
                      Tables {tables[0]?.table_number}-{tables[tables.length - 1]?.table_number}
                    </p>
                  </div>
                  <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                    {activeCount}/{tables.length} active
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {tables.map((table) => (
                    <button
                      key={table.id}
                      type="button"
                      onClick={() => setSelectedTableId(String(table.id))}
                      className={`flex h-9 min-w-9 items-center justify-center rounded-lg border px-2 text-xs font-medium ${
                        Number(table.active)
                          ? "border-brand-200 bg-brand-50 text-brand-800"
                          : "border-gray-200 bg-gray-100 text-gray-400"
                      }`}
                      title={`Table ${table.table_number}, capacity ${table.capacity}`}
                    >
                      {table.table_number}
                    </button>
                  ))}
                </div>
                {Number(area.function_enabled) ? (
                  <span className="mt-4 inline-flex rounded-full bg-warning-50 px-2 py-1 text-xs font-medium text-warning-700">
                    Function
                  </span>
                ) : null}
              </section>
            );
          })}
        </div>

        <aside className="rounded-lg border border-gray-200 bg-white p-5 shadow-theme-sm">
          <h2 className="text-lg font-semibold text-gray-900">Table</h2>

          <div className="mt-4 space-y-4">
            <div>
              <FieldLabel htmlFor="table-select">Table</FieldLabel>
              <select id="table-select" className={selectClass} value={selectedTableId} onChange={(event) => setSelectedTableId(event.target.value)}>
                <option value="">Choose a table</option>
                {data.tables.map((table) => (
                  <option key={table.id} value={table.id}>
                    Table {table.table_number}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel htmlFor="capacity">Capacity</FieldLabel>
              <input id="capacity" type="number" min="1" className={inputClass} value={capacity} onChange={(event) => setCapacity(event.target.value)} />
            </div>
            <div>
              <FieldLabel htmlFor="active">Status</FieldLabel>
              <select id="active" className={selectClass} value={active} onChange={(event) => setActive(event.target.value)}>
                <option value="1">Active</option>
                <option value="0">Inactive</option>
              </select>
            </div>
            {message ? <FormMessage type={message.type}>{message.text}</FormMessage> : null}
            <button type="button" disabled={!selectedTable} onClick={saveTable} className="inline-flex h-11 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
              <Save className="size-4" />
              Save table
            </button>
          </div>
        </aside>
      </div>
    </>
  );
}
