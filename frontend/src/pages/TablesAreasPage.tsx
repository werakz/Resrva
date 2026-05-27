import { useEffect, useMemo, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { apiFetch, toJsonBody } from "../lib/api";
import type { Area, TableRecord } from "../types";
import { FieldLabel, FormMessage, SelectInput, inputClass } from "../components/resrva/FormField";
import { LoadingState } from "../components/resrva/LoadingState";
import { PageHeader } from "../components/resrva/PageHeader";
import { Modal } from "../components/ui/modal";

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
  const [newTableForm, setNewTableForm] = useState<TableForm>(emptyTableForm);
  const [newAreaForm, setNewAreaForm] = useState<AreaForm>(emptyAreaForm);
  const [isTableModalOpen, setTableModalOpen] = useState(false);
  const [isAreaModalOpen, setAreaModalOpen] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  const activeAreas = useMemo(() => (data?.areas || []).filter((area) => isActive(area.active)), [data]);
  const visibleTables = useMemo(() => data?.tables || [], [data]);
  const areaOptions = useMemo(
    () => activeAreas.map((area) => ({ value: String(area.id), label: area.name })),
    [activeAreas],
  );
  const activeOptions = [
    { value: "1", label: "Active" },
    { value: "0", label: "Inactive" },
  ];
  const yesNoOptions = [
    { value: "0", label: "No" },
    { value: "1", label: "Yes" },
  ];

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

  const nextAreaSortOrder = () => {
    const lastOrder = activeAreas[activeAreas.length - 1]?.sort_order;
    return String((lastOrder ?? activeAreas.length * 10) + 10);
  };

  const openNewTableModal = (areaId = "") => {
    setNewTableForm({
      ...emptyTableForm,
      area_id: areaId || String(activeAreas[0]?.id || ""),
    });
    setTableModalOpen(true);
  };

  const openNewAreaModal = () => {
    setNewAreaForm({
      ...emptyAreaForm,
      sort_order: nextAreaSortOrder(),
    });
    setAreaModalOpen(true);
  };

  const saveTable = async () => {
    if (!selectedTable) return;
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
      await apiFetch<{ ok: boolean }>(`tables/${selectedTable.id}`, {
        method: "PUT",
        ...toJsonBody(payload),
      });
      setMessage({ type: "success", text: `Table ${payload.table_number} updated.` });
      await loadTables();
    } catch (err) {
      showError(err, "Table could not be saved.");
    }
  };

  const createTable = async () => {
    if (!newTableForm.area_id || !newTableForm.table_number) {
      setMessage({ type: "error", text: "Choose an area and table number." });
      return;
    }

    const payload = {
      area_id: Number(newTableForm.area_id),
      table_number: Number(newTableForm.table_number),
      capacity: Number(newTableForm.capacity),
      active: newTableForm.active === "1",
    };

    try {
      const result = await apiFetch<{ ok: boolean; id: number }>("tables", {
        method: "POST",
        ...toJsonBody(payload),
      });
      setSelectedTableId(String(result.id));
      setTableModalOpen(false);
      setMessage({ type: "success", text: `Table ${payload.table_number} added.` });
      await loadTables();
    } catch (err) {
      showError(err, "Table could not be added.");
    }
  };

  const deleteTable = async () => {
    if (!selectedTable) return;
    const confirmed = window.confirm(`Delete table ${selectedTable.table_number}? Existing booking history is protected.`);
    if (!confirmed) return;

    try {
      await apiFetch<{ ok: boolean }>(`tables/${selectedTable.id}`, { method: "DELETE" });
      setMessage({ type: "success", text: `Table ${selectedTable.table_number} deleted.` });
      setSelectedTableId("");
      setTableForm(emptyTableForm);
      await loadTables();
    } catch (err) {
      showError(err, "Table could not be deleted.");
    }
  };

  const saveArea = async () => {
    if (!selectedArea) return;
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
      await apiFetch<{ ok: boolean }>(`areas/${selectedArea.id}`, {
        method: "PUT",
        ...toJsonBody(payload),
      });
      setMessage({ type: "success", text: `${payload.name} updated.` });
      await loadTables();
    } catch (err) {
      showError(err, "Section could not be saved.");
    }
  };

  const createArea = async () => {
    if (!newAreaForm.name.trim()) {
      setMessage({ type: "error", text: "Section name is required." });
      return;
    }

    const payload = {
      name: newAreaForm.name.trim(),
      code: newAreaForm.code.trim() || codeFromName(newAreaForm.name),
      function_enabled: newAreaForm.function_enabled === "1",
      sort_order: Number(newAreaForm.sort_order || 0),
    };

    try {
      const result = await apiFetch<{ ok: boolean; id: number }>("areas", {
        method: "POST",
        ...toJsonBody(payload),
      });
      setSelectedAreaId(String(result.id));
      setAreaModalOpen(false);
      setMessage({ type: "success", text: `${payload.name} added.` });
      await loadTables();
    } catch (err) {
      showError(err, "Section could not be added.");
    }
  };

  const deleteArea = async () => {
    if (!selectedArea) return;
    const confirmed = window.confirm(`Remove ${selectedArea.name}? Move or delete its tables first.`);
    if (!confirmed) return;

    try {
      await apiFetch<{ ok: boolean }>(`areas/${selectedArea.id}`, { method: "DELETE" });
      setMessage({ type: "success", text: `${selectedArea.name} removed.` });
      setSelectedAreaId("");
      setAreaForm(emptyAreaForm);
      await loadTables();
    } catch (err) {
      showError(err, "Section could not be removed.");
    }
  };

  const selectArea = (areaId: number) => {
    setSelectedAreaId(String(areaId));
  };

  if (!data && message?.type === "error") {
    return <FormMessage type="error">{message.text}</FormMessage>;
  }

  if (!data) {
    return <LoadingState label="Loading tables and areas" />;
  }

  return (
    <>
      <PageHeader title="Tables / Areas" />

      {message ? <div className="mb-5"><FormMessage type={message.type}>{message.text}</FormMessage></div> : null}

      <div className="tables-areas-layout">
        <div className="tables-areas-list">
          {activeAreas.map((area) => {
            const tables = tablesByArea.get(area.id) || [];
            const activeCount = tables.filter((table) => isActive(table.active)).length;

            return (
              <section
                key={area.id}
                role="button"
                tabIndex={0}
                onClick={() => selectArea(area.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    selectArea(area.id);
                  }
                }}
                className={`cursor-pointer rounded-lg border bg-white p-5 shadow-theme-sm transition hover:border-brand-300 hover:shadow-theme-md ${
                  String(area.id) === selectedAreaId
                    ? "border-brand-500 ring-2 ring-brand-500/15"
                    : "border-gray-200"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 text-left">
                    <h2 className="truncate text-lg font-semibold text-gray-900">{area.name}</h2>
                    <p className="mt-1 text-sm text-gray-500">
                      {tables.length ? `Tables ${tables[0].table_number}-${tables[tables.length - 1].table_number}` : "No tables yet"}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                    {activeCount}/{tables.length} active
                  </span>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {tables.map((table) => (
                    <button
                      key={table.id}
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedTableId(String(table.id));
                      }}
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
                    onClick={(event) => {
                      event.stopPropagation();
                      openNewTableModal(String(area.id));
                    }}
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

        <aside className="space-y-5 lg:sticky lg:top-24">
          <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-theme-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-gray-900">Edit table</h2>
              <button type="button" onClick={() => openNewTableModal()} className="text-sm font-medium text-brand-600 hover:text-brand-700">
                Add table
              </button>
            </div>

            {selectedTable ? (
              <div className="mt-4 space-y-4">
                <div>
                  <FieldLabel htmlFor="table-area">Section</FieldLabel>
                  <SelectInput
                    id="table-area"
                    value={tableForm.area_id}
                    onChange={(value) => setTableForm((current) => ({ ...current, area_id: value }))}
                    options={[{ value: "", label: "Choose a section" }, ...areaOptions]}
                  />
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
                  <SelectInput
                    id="active"
                    value={tableForm.active}
                    onChange={(value) => setTableForm((current) => ({ ...current, active: value }))}
                    options={activeOptions}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={saveTable} className="inline-flex h-11 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700">
                    <Save className="size-4" />
                    Save table
                  </button>
                  <button type="button" onClick={deleteTable} className="inline-flex h-11 items-center gap-2 rounded-lg border border-error-200 bg-error-50 px-4 text-sm font-medium text-error-700 hover:bg-error-100">
                    <Trash2 className="size-4" />
                    Delete
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-lg border border-dashed border-gray-200 p-5 text-sm text-gray-500">
                No table selected.
              </div>
            )}
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-theme-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-gray-900">Edit section</h2>
              <button type="button" onClick={openNewAreaModal} className="text-sm font-medium text-brand-600 hover:text-brand-700">
                Add section
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <FieldLabel htmlFor="area-select">Existing section</FieldLabel>
                <SelectInput
                  id="area-select"
                  value={selectedAreaId}
                  onChange={setSelectedAreaId}
                  options={[{ value: "", label: "New section" }, ...areaOptions]}
                />
              </div>
              {selectedArea ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <FieldLabel htmlFor="area-name">Name</FieldLabel>
                      <input
                        id="area-name"
                        className={inputClass}
                        value={areaForm.name}
                        onChange={(event) => setAreaForm((current) => ({ ...current, name: event.target.value }))}
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
                      <SelectInput
                        id="function-enabled"
                        value={areaForm.function_enabled}
                        onChange={(value) => setAreaForm((current) => ({ ...current, function_enabled: value }))}
                        options={yesNoOptions}
                      />
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
                    <button type="button" onClick={deleteArea} className="inline-flex h-11 items-center gap-2 rounded-lg border border-error-200 bg-error-50 px-4 text-sm font-medium text-error-700 hover:bg-error-100">
                      <Trash2 className="size-4" />
                      Remove
                    </button>
                  </div>
                </>
              ) : (
                <div className="rounded-lg border border-dashed border-gray-200 p-5 text-sm text-gray-500">
                  No section selected.
                </div>
              )}
            </div>
          </section>
        </aside>
      </div>

      <Modal isOpen={isTableModalOpen} onClose={() => setTableModalOpen(false)} className="m-4 max-w-[560px]">
        <div className="p-5 sm:p-6">
          <div className="pr-12">
            <h2 className="text-lg font-semibold text-gray-900">Add table</h2>
          </div>

          <div className="mt-5 space-y-4">
            <div>
              <FieldLabel htmlFor="new-table-area">Section</FieldLabel>
              <SelectInput
                id="new-table-area"
                value={newTableForm.area_id}
                onChange={(value) => setNewTableForm((current) => ({ ...current, area_id: value }))}
                options={[{ value: "", label: "Choose a section" }, ...areaOptions]}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="new-table-number">Table number</FieldLabel>
                <input
                  id="new-table-number"
                  type="number"
                  min="1"
                  className={inputClass}
                  value={newTableForm.table_number}
                  onChange={(event) => setNewTableForm((current) => ({ ...current, table_number: event.target.value }))}
                />
              </div>
              <div>
                <FieldLabel htmlFor="new-table-capacity">Capacity</FieldLabel>
                <input
                  id="new-table-capacity"
                  type="number"
                  min="1"
                  className={inputClass}
                  value={newTableForm.capacity}
                  onChange={(event) => setNewTableForm((current) => ({ ...current, capacity: event.target.value }))}
                />
              </div>
            </div>
            <div>
              <FieldLabel htmlFor="new-table-active">Status</FieldLabel>
              <SelectInput
                id="new-table-active"
                value={newTableForm.active}
                onChange={(value) => setNewTableForm((current) => ({ ...current, active: value }))}
                options={activeOptions}
              />
            </div>
            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <button type="button" onClick={() => setTableModalOpen(false)} className="h-11 rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
              <button type="button" onClick={createTable} className="inline-flex h-11 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700">
                <Plus className="size-4" />
                Add table
              </button>
            </div>
          </div>
        </div>
      </Modal>

      <Modal isOpen={isAreaModalOpen} onClose={() => setAreaModalOpen(false)} className="m-4 max-w-[620px]">
        <div className="p-5 sm:p-6">
          <div className="pr-12">
            <h2 className="text-lg font-semibold text-gray-900">Add section</h2>
          </div>

          <div className="mt-5 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="new-area-name">Name</FieldLabel>
                <input
                  id="new-area-name"
                  className={inputClass}
                  value={newAreaForm.name}
                  onChange={(event) => {
                    const name = event.target.value;
                    setNewAreaForm((current) => ({ ...current, name, code: codeFromName(name) }));
                  }}
                />
              </div>
              <div>
                <FieldLabel htmlFor="new-area-code">Code</FieldLabel>
                <input
                  id="new-area-code"
                  className={inputClass}
                  value={newAreaForm.code}
                  onChange={(event) => setNewAreaForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))}
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="new-function-enabled">Function area</FieldLabel>
                <SelectInput
                  id="new-function-enabled"
                  value={newAreaForm.function_enabled}
                  onChange={(value) => setNewAreaForm((current) => ({ ...current, function_enabled: value }))}
                  options={yesNoOptions}
                />
              </div>
              <div>
                <FieldLabel htmlFor="new-sort-order">Order</FieldLabel>
                <input
                  id="new-sort-order"
                  type="number"
                  className={inputClass}
                  value={newAreaForm.sort_order}
                  onChange={(event) => setNewAreaForm((current) => ({ ...current, sort_order: event.target.value }))}
                />
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <button type="button" onClick={() => setAreaModalOpen(false)} className="h-11 rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
              <button type="button" onClick={createArea} className="inline-flex h-11 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700">
                <Plus className="size-4" />
                Add section
              </button>
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}
