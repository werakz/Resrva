import { useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { apiFetch, toJsonBody } from "../lib/api";
import type { Area, TableRecord } from "../types";
import { FieldLabel, FormMessage, inputClass, selectClass } from "../components/resrva/FormField";
import { LoadingState } from "../components/resrva/LoadingState";
import { PageHeader } from "../components/resrva/PageHeader";

type TablesPayload = {
  areas: Area[];
  tables: TableRecord[];
};

type TableForm = {
  area_id: string;
  table_number: string;
  capacity: string;
  active: string;
};

type AreaForm = {
  name: string;
  code: string;
  function_enabled: string;
  sort_order: string;
};

const emptyTableForm: TableForm = {
  area_id: "",
  table_number: "",
  capacity: "8",
  active: "1",
};

const emptyAreaForm: AreaForm = {
  name: "",
  code: "",
  function_enabled: "0",
  sort_order: "0",
};

function isActive(value: number | boolean): boolean {
  return Boolean(Number(value));
}

function codeFromName(name: string): string {
  return name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 20);
}

export default function TablesAreasPage() {
  const [data, setData] = useState<TablesPayload | null>(null);
  const [selectedTableId, setSelectedTableId] = useState("");
  const [selectedAreaId, setSelectedAreaId] = useState("");
  const [tableForm, setTableForm] = useState<TableForm>(emptyTableForm);
  const [areaForm, setAreaForm] = useState<AreaForm>(emptyAreaForm);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  const activeAreas = useMemo(() => (data?.areas || []).filter((area) => isActive(area.active)), [data]);
  const visibleTables = useMemo(() => data?.tables || [], [data]);

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
    for (const table of visibleTables) {
      grouped.set(Number(table.area_id), [...(grouped.get(Number(table.area_id)) || []), table]);
    }
    for (const tables of grouped.values()) {
      tables.sort((left, right) => Number(left.table_number) - Number(right.table_number));
    }
    return grouped;
  }, [visibleTables]);

  const selectedTable = useMemo(() => {
    return visibleTables.find((table) => String(table.id) === selectedTableId) || null;
  }, [selectedTableId, visibleTables]);

  const selectedArea = useMemo(() => {
    return activeAreas.find((area) => String(area.id) === selectedAreaId) || null;
  }, [activeAreas, selectedAreaId]);

  const activeTables = useMemo(
    () => visibleTables.filter((table) => isActive(table.active)).length,
    [visibleTables],
  );

  useEffect(() => {
    if (!selectedTable) return;
    setTableForm({
      area_id: String(selectedTable.area_id),
      table_number: String(selectedTable.table_number),
      capacity: String(selectedTable.capacity),
      active: String(Number(selectedTable.active)),
    });
  }, [selectedTable]);

  useEffect(() => {
    if (!selectedArea) return;
    setAreaForm({
      name: selectedArea.name,
      code: selectedArea.code,
      function_enabled: String(Number(selectedArea.function_enabled)),
      sort_order: String(selectedArea.sort_order ?? 0),
    });
  }, [selectedArea]);

  const showError = (err: unknown, fallback: string) => {
    setMessage({ type: "error", text: err instanceof Error ? err.message : fallback });
  };

  const newTable = (areaId = "") => {
    setSelectedTableId("");
    setTableForm({
      ...emptyTableForm,
      area_id: areaId || String(activeAreas[0]?.id || ""),
    });
  };

  const newArea = () => {
    setSelectedAreaId("");
    setAreaForm({
      ...emptyAreaForm,
      sort_order: String(((activeAreas[activeAreas.length - 1]?.sort_order || activeAreas.length * 10) ?? 0) + 10),
    });
  };

  const saveTable = async () => {
    if (!tableForm.area_id || !tableForm.table_number) {
      setMessage({ type: "error", text: "Choose an area and table number." });
      return;
    }

    const payload = {
      area_id: Number(tableForm.area_id),
      table_number: Number(tableForm.table_number),
      capacity: Number(tableForm.capacity),
      active: tableForm.active === "1",
    };

    try {
      if (selectedTable) {
        await apiFetch<{ ok: boolean }>(`tables/${selectedTable.id}`, {
          method: "PUT",
          ...toJsonBody(payload),
        });
        setMessage({ type: "success", text: `Table ${payload.table_number} updated.` });
      } else {
        const result = await apiFetch<{ ok: boolean; id: number }>("tables", {
          method: "POST",
          ...toJsonBody(payload),
        });
        setSelectedTableId(String(result.id));
        setMessage({ type: "success", text: `Table ${payload.table_number} added.` });
      }
      await loadTables();
    } catch (err) {
      showError(err, "Table could not be saved.");
    }
  };

  const deleteTable = async () => {
    if (!selectedTable) return;
    const confirmed = window.confirm(`Delete table ${selectedTable.table_number}? Existing booking history is protected.`);
    if (!confirmed) return;

    try {
      await apiFetch<{ ok: boolean }>(`tables/${selectedTable.id}`, { method: "DELETE" });
      setMessage({ type: "success", text: `Table ${selectedTable.table_number} deleted.` });
      newTable(String(selectedTable.area_id));
      await loadTables();
    } catch (err) {
      showError(err, "Table could not be deleted.");
    }
  };

  const saveArea = async () => {
    if (!areaForm.name.trim()) {
      setMessage({ type: "error", text: "Section name is required." });
      return;
    }

    const payload = {
      name: areaForm.name.trim(),
      code: areaForm.code.trim() || codeFromName(areaForm.name),
      function_enabled: areaForm.function_enabled === "1",
      sort_order: Number(areaForm.sort_order || 0),
    };

    try {
      if (selectedArea) {
        await apiFetch<{ ok: boolean }>(`areas/${selectedArea.id}`, {
          method: "PUT",
          ...toJsonBody(payload),
        });
        setMessage({ type: "success", text: `${payload.name} updated.` });
      } else {
        const result = await apiFetch<{ ok: boolean; id: number }>("areas", {
          method: "POST",
          ...toJsonBody(payload),
        });
        setSelectedAreaId(String(result.id));
        setMessage({ type: "success", text: `${payload.name} added.` });
      }
      await loadTables();
    } catch (err) {
      showError(err, "Section could not be saved.");
    }
  };

  const deleteArea = async () => {
    if (!selectedArea) return;
    const confirmed = window.confirm(`Remove ${selectedArea.name}? Move or delete its tables first.`);
    if (!confirmed) return;

    try {
      await apiFetch<{ ok: boolean }>(`areas/${selectedArea.id}`, { method: "DELETE" });
      setMessage({ type: "success", text: `${selectedArea.name} removed.` });
      newArea();
      await loadTables();
    } catch (err) {
      showError(err, "Section could not be removed.");
    }
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
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => newArea()}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50"
            >
              <Plus className="size-4" />
              Section
            </button>
            <button
              type="button"
              onClick={() => newTable()}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-600 px-3 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-700"
            >
              <Plus className="size-4" />
              Table
            </button>
            <button
              type="button"
              onClick={() => loadTables().catch((err) => showError(err, "Tables failed to load."))}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50"
            >
              <RefreshCw className="size-4" />
              Refresh
            </button>
          </div>
        }
      />

      <div className="mb-5 grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-theme-sm">
          <p className="text-sm text-gray-500">Sections</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">{activeAreas.length}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-theme-sm">
          <p className="text-sm text-gray-500">Tables</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">{visibleTables.length}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-theme-sm">
          <p className="text-sm text-gray-500">Active</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">{activeTables}</p>
        </div>
      </div>

      {message ? <div className="mb-5"><FormMessage type={message.type}>{message.text}</FormMessage></div> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_420px]">
        <div className="grid gap-4 md:grid-cols-2">
          {activeAreas.map((area) => {
            const tables = tablesByArea.get(area.id) || [];
            const activeCount = tables.filter((table) => isActive(table.active)).length;

            return (
              <section key={area.id} className="rounded-lg border border-gray-200 bg-white p-5 shadow-theme-sm">
                <div className="flex items-start justify-between gap-3">
                  <button type="button" className="min-w-0 text-left" onClick={() => setSelectedAreaId(String(area.id))}>
                    <h2 className="truncate text-lg font-semibold text-gray-900">{area.name}</h2>
                    <p className="mt-1 text-sm text-gray-500">
                      {tables.length ? `Tables ${tables[0].table_number}-${tables[tables.length - 1].table_number}` : "No tables yet"}
                    </p>
                  </button>
                  <span className="shrink-0 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
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
                        String(table.id) === selectedTableId
                          ? "border-brand-500 bg-brand-100 text-brand-800 ring-2 ring-brand-500/15"
                          : isActive(table.active)
                            ? "border-brand-200 bg-brand-50 text-brand-800"
                            : "border-gray-200 bg-gray-100 text-gray-400"
                      }`}
                      title={`Table ${table.table_number}, capacity ${table.capacity}`}
                    >
                      {table.table_number}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => newTable(String(area.id))}
                    className="flex h-9 min-w-9 items-center justify-center rounded-lg border border-dashed border-gray-300 px-2 text-xs font-medium text-gray-500 hover:border-brand-300 hover:text-brand-600"
                    title={`Add table to ${area.name}`}
                  >
                    <Plus className="size-4" />
                  </button>
                </div>

                {isActive(area.function_enabled) ? (
                  <span className="mt-4 inline-flex rounded-full bg-blue-light-50 px-2 py-1 text-xs font-medium text-blue-light-500">
                    Function
                  </span>
                ) : null}
              </section>
            );
          })}
        </div>

        <aside className="space-y-5">
          <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-theme-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-gray-900">{selectedTable ? "Edit table" : "Add table"}</h2>
              <button type="button" onClick={() => newTable()} className="text-sm font-medium text-brand-600 hover:text-brand-700">
                New
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <FieldLabel htmlFor="table-area">Section</FieldLabel>
                <select
                  id="table-area"
                  className={selectClass}
                  value={tableForm.area_id}
                  onChange={(event) => setTableForm((current) => ({ ...current, area_id: event.target.value }))}
                >
                  <option value="">Choose a section</option>
                  {activeAreas.map((area) => (
                    <option key={area.id} value={area.id}>
                      {area.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <FieldLabel htmlFor="table-number">Table number</FieldLabel>
                  <input
                    id="table-number"
                    type="number"
                    min="1"
                    className={inputClass}
                    value={tableForm.table_number}
                    onChange={(event) => setTableForm((current) => ({ ...current, table_number: event.target.value }))}
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="capacity">Capacity</FieldLabel>
                  <input
                    id="capacity"
                    type="number"
                    min="1"
                    className={inputClass}
                    value={tableForm.capacity}
                    onChange={(event) => setTableForm((current) => ({ ...current, capacity: event.target.value }))}
                  />
                </div>
              </div>
              <div>
                <FieldLabel htmlFor="active">Status</FieldLabel>
                <select
                  id="active"
                  className={selectClass}
                  value={tableForm.active}
                  onChange={(event) => setTableForm((current) => ({ ...current, active: event.target.value }))}
                >
                  <option value="1">Active</option>
                  <option value="0">Inactive</option>
                </select>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={saveTable} className="inline-flex h-11 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700">
                  <Save className="size-4" />
                  Save table
                </button>
                {selectedTable ? (
                  <button type="button" onClick={deleteTable} className="inline-flex h-11 items-center gap-2 rounded-lg border border-error-200 bg-error-50 px-4 text-sm font-medium text-error-700 hover:bg-error-100">
                    <Trash2 className="size-4" />
                    Delete
                  </button>
                ) : null}
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-theme-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-gray-900">{selectedArea ? "Edit section" : "Add section"}</h2>
              <button type="button" onClick={newArea} className="text-sm font-medium text-brand-600 hover:text-brand-700">
                New
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <FieldLabel htmlFor="area-select">Existing section</FieldLabel>
                <select id="area-select" className={selectClass} value={selectedAreaId} onChange={(event) => setSelectedAreaId(event.target.value)}>
                  <option value="">New section</option>
                  {activeAreas.map((area) => (
                    <option key={area.id} value={area.id}>
                      {area.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <FieldLabel htmlFor="area-name">Name</FieldLabel>
                  <input
                    id="area-name"
                    className={inputClass}
                    value={areaForm.name}
                    onChange={(event) => {
                      const name = event.target.value;
                      setAreaForm((current) => ({
                        ...current,
                        name,
                        code: selectedArea ? current.code : codeFromName(name),
                      }));
                    }}
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="area-code">Code</FieldLabel>
                  <input
                    id="area-code"
                    className={inputClass}
                    value={areaForm.code}
                    onChange={(event) => setAreaForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))}
                  />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <FieldLabel htmlFor="function-enabled">Function area</FieldLabel>
                  <select
                    id="function-enabled"
                    className={selectClass}
                    value={areaForm.function_enabled}
                    onChange={(event) => setAreaForm((current) => ({ ...current, function_enabled: event.target.value }))}
                  >
                    <option value="0">No</option>
                    <option value="1">Yes</option>
                  </select>
                </div>
                <div>
                  <FieldLabel htmlFor="sort-order">Order</FieldLabel>
                  <input
                    id="sort-order"
                    type="number"
                    className={inputClass}
                    value={areaForm.sort_order}
                    onChange={(event) => setAreaForm((current) => ({ ...current, sort_order: event.target.value }))}
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={saveArea} className="inline-flex h-11 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700">
                  <Save className="size-4" />
                  Save section
                </button>
                {selectedArea ? (
                  <button type="button" onClick={deleteArea} className="inline-flex h-11 items-center gap-2 rounded-lg border border-error-200 bg-error-50 px-4 text-sm font-medium text-error-700 hover:bg-error-100">
                    <Trash2 className="size-4" />
                    Remove
                  </button>
                ) : null}
              </div>
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}
