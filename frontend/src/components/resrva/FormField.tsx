export function FieldLabel({
  htmlFor,
  children,
}: {
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-gray-700">
      {children}
    </label>
  );
}

export const inputClass =
  "h-11 w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-400 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10";

export const textareaClass =
  "min-h-24 w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-400 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10";

export const selectClass =
  "h-11 w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs focus:border-brand-400 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10";

export function FormMessage({
  type,
  children,
}: {
  type: "error" | "success" | "info";
  children: React.ReactNode;
}) {
  const styles = {
    error: "border-error-200 bg-error-50 text-error-700",
    success: "border-success-200 bg-success-50 text-success-700",
    info: "border-blue-light-200 bg-blue-light-50 text-blue-light-700",
  };

  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${styles[type]}`}>
      {children}
    </div>
  );
}
