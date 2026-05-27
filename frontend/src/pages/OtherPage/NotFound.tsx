import { Link } from "react-router";
import PageMeta from "../../components/common/PageMeta";

export default function NotFound() {
  return (
    <>
      <PageMeta
        title="Page not found | Resrva"
        description="The requested Resrva page could not be found."
      />
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
        <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-8 text-center shadow-theme-sm">
          <img src="/images/logo/resrva-mark.svg" alt="Resrva" className="mx-auto size-16" />
          <p className="mt-6 text-sm font-semibold uppercase tracking-wide text-brand-700">404</p>
          <h1 className="mt-2 text-2xl font-semibold text-gray-950">Page not found</h1>
          <p className="mt-3 text-sm leading-6 text-gray-500">
            The page you are looking for does not exist or has moved.
          </p>

          <Link
            to="/"
            className="mt-6 inline-flex h-10 items-center justify-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-700"
          >
            Back to public booking
          </Link>
        </div>
      </div>
    </>
  );
}
