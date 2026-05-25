export function LoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex min-h-48 items-center justify-center rounded-lg border border-gray-200 bg-white">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      <span className="ml-3 text-sm text-gray-500">{label}</span>
    </div>
  );
}
