const statusStyles: Record<string, string> = {
  confirmed: "bg-success-50 text-success-700 ring-success-600/20",
  completed: "bg-gray-100 text-gray-700 ring-gray-500/20",
  seated: "bg-blue-light-50 text-blue-light-700 ring-blue-light-600/20",
  pending: "bg-warning-50 text-warning-700 ring-warning-600/20",
  waitlist: "bg-warning-50 text-warning-700 ring-warning-600/20",
  cancelled: "bg-error-50 text-error-700 ring-error-600/20",
  declined: "bg-error-50 text-error-700 ring-error-600/20",
  no_show: "bg-gray-100 text-gray-700 ring-gray-500/20",
  active: "bg-success-50 text-success-700 ring-success-600/20",
  inactive: "bg-gray-100 text-gray-700 ring-gray-500/20",
  accepted: "bg-success-50 text-success-700 ring-success-600/20",
  overridden: "bg-warning-50 text-warning-700 ring-warning-600/20",
  logged: "bg-blue-light-50 text-blue-light-700 ring-blue-light-600/20",
};

export function StatusBadge({ status }: { status: string }) {
  const label =
    {
      seated: "In progress",
      no_show: "No show",
    }[status] || status.replace("_", " ");
  const style = statusStyles[status] || "bg-gray-100 text-gray-700 ring-gray-500/20";

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ${style}`}
    >
      {label}
    </span>
  );
}
