import { useEffect, useRef, useState } from "react";

import { Link, useNavigate } from "react-router";
import { useSidebar } from "../context/SidebarContext";
import { Building2, Check, ChevronDown, LogOut, Search, UserRound } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { Dropdown } from "../components/ui/dropdown/Dropdown";
import { DropdownItem } from "../components/ui/dropdown/DropdownItem";

const AppHeader: React.FC = () => {
  const [isApplicationMenuOpen, setApplicationMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isVenueMenuOpen, setIsVenueMenuOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");
  const { user, venues, currentVenue, supportMode, logout, switchVenue, stopSupport } = useAuth();
  const navigate = useNavigate();
  const { isMobileOpen, toggleSidebar, toggleMobileSidebar } = useSidebar();

  const handleToggle = () => {
    if (window.innerWidth >= 1024) {
      toggleSidebar();
    } else {
      toggleMobileSidebar();
    }
  };

  const toggleApplicationMenu = () => {
    setApplicationMenuOpen(!isApplicationMenuOpen);
  };

  const submitGlobalSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = globalSearch.trim();

    navigate(query ? `/app/bookings?search=${encodeURIComponent(query)}` : "/app/bookings");
  };

  const userInitials =
    user?.name
      ?.split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "M";

  const handleVenueSwitch = async (venueId: number) => {
    if (currentVenue?.id === venueId) {
      setIsVenueMenuOpen(false);
      return;
    }

    await switchVenue(venueId);
    setIsVenueMenuOpen(false);
    window.location.reload();
  };

  const isPlatformAdmin = user?.is_platform_admin === true || user?.is_platform_admin === 1;

  const handleStopSupport = async () => {
    await stopSupport();
    navigate("/app/resrva-admin/clients");
  };

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <header className="sticky top-0 flex w-full bg-white border-gray-200 z-99999 dark:border-gray-800 dark:bg-gray-900 lg:border-b">
      <div className="flex flex-col items-center justify-between grow lg:flex-row lg:px-6">
        <div className="flex items-center justify-between w-full gap-2 px-3 py-3 border-b border-gray-200 dark:border-gray-800 sm:gap-4 lg:justify-normal lg:border-b-0 lg:px-0 lg:py-4">
          <button
            className="items-center justify-center w-10 h-10 text-gray-500 border-gray-200 rounded-lg z-99999 dark:border-gray-800 lg:flex dark:text-gray-400 lg:h-11 lg:w-11 lg:border"
            onClick={handleToggle}
            aria-label="Toggle Sidebar"
          >
            {isMobileOpen ? (
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M6.21967 7.28131C5.92678 6.98841 5.92678 6.51354 6.21967 6.22065C6.51256 5.92775 6.98744 5.92775 7.28033 6.22065L11.999 10.9393L16.7176 6.22078C17.0105 5.92789 17.4854 5.92788 17.7782 6.22078C18.0711 6.51367 18.0711 6.98855 17.7782 7.28144L13.0597 12L17.7782 16.7186C18.0711 17.0115 18.0711 17.4863 17.7782 17.7792C17.4854 18.0721 17.0105 18.0721 16.7176 17.7792L11.999 13.0607L7.28033 17.7794C6.98744 18.0722 6.51256 18.0722 6.21967 17.7794C5.92678 17.4865 5.92678 17.0116 6.21967 16.7187L10.9384 12L6.21967 7.28131Z"
                  fill="currentColor"
                />
              </svg>
            ) : (
              <svg
                width="16"
                height="12"
                viewBox="0 0 16 12"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M0.583252 1C0.583252 0.585788 0.919038 0.25 1.33325 0.25H14.6666C15.0808 0.25 15.4166 0.585786 15.4166 1C15.4166 1.41421 15.0808 1.75 14.6666 1.75L1.33325 1.75C0.919038 1.75 0.583252 1.41422 0.583252 1ZM0.583252 11C0.583252 10.5858 0.919038 10.25 1.33325 10.25L14.6666 10.25C15.0808 10.25 15.4166 10.5858 15.4166 11C15.4166 11.4142 15.0808 11.75 14.6666 11.75L1.33325 11.75C0.919038 11.75 0.583252 11.4142 0.583252 11ZM1.33325 5.25C0.919038 5.25 0.583252 5.58579 0.583252 6C0.583252 6.41421 0.919038 6.75 1.33325 6.75L7.99992 6.75C8.41413 6.75 8.74992 6.41421 8.74992 6C8.74992 5.58579 8.41413 5.25 7.99992 5.25L1.33325 5.25Z"
                  fill="currentColor"
                />
              </svg>
            )}
            {/* Cross Icon */}
          </button>

          <Link to="/app" className="flex items-center gap-2 lg:hidden">
            <img src="/images/logo/resrva-logo.png" alt="Resrva" className="size-9 rounded-lg object-cover" />
            <span className="font-semibold text-gray-900">Resrva</span>
          </Link>

          <button
            onClick={toggleApplicationMenu}
            className="flex items-center justify-center w-10 h-10 text-gray-700 rounded-lg z-99999 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 lg:hidden"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M5.99902 10.4951C6.82745 10.4951 7.49902 11.1667 7.49902 11.9951V12.0051C7.49902 12.8335 6.82745 13.5051 5.99902 13.5051C5.1706 13.5051 4.49902 12.8335 4.49902 12.0051V11.9951C4.49902 11.1667 5.1706 10.4951 5.99902 10.4951ZM17.999 10.4951C18.8275 10.4951 19.499 11.1667 19.499 11.9951V12.0051C19.499 12.8335 18.8275 13.5051 17.999 13.5051C17.1706 13.5051 16.499 12.8335 16.499 12.0051V11.9951C16.499 11.1667 17.1706 10.4951 17.999 10.4951ZM13.499 11.9951C13.499 11.1667 12.8275 10.4951 11.999 10.4951C11.1706 10.4951 10.499 11.1667 10.499 11.9951V12.0051C10.499 12.8335 11.1706 13.5051 11.999 13.5051C12.8275 13.5051 13.499 12.8335 13.499 12.0051V11.9951Z"
                fill="currentColor"
              />
            </svg>
          </button>

          <div className={`hidden ${isPlatformAdmin && !supportMode ? "" : "lg:block"}`}>
            <form onSubmit={submitGlobalSearch}>
              <div className="relative">
                <Search className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-gray-500" />
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Search name, email, phone, or ref"
                  value={globalSearch}
                  onChange={(event) => setGlobalSearch(event.target.value)}
                  className="dark:bg-dark-900 h-11 w-full rounded-lg border border-gray-200 bg-transparent py-2.5 pl-12 pr-14 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:bg-white/[0.03] dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800 xl:w-[430px]"
                />

                <button
                  type="button"
                  onClick={() => inputRef.current?.focus()}
                  className="absolute right-2.5 top-1/2 inline-flex -translate-y-1/2 items-center gap-0.5 rounded-lg border border-gray-200 bg-gray-50 px-[7px] py-[4.5px] text-xs -tracking-[0.2px] text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400"
                >
                  <span> ⌘ </span>
                  <span> K </span>
                </button>
              </div>
            </form>
          </div>
        </div>
        <div
          className={`${
            isApplicationMenuOpen ? "flex" : "hidden"
          } items-center justify-between w-full gap-4 px-5 py-4 lg:flex shadow-theme-md lg:justify-end lg:px-0 lg:shadow-none`}
        >
          <div className="flex items-center gap-2 2xsm:gap-3">
            {supportMode && currentVenue ? (
              <div className="hidden items-center gap-2 rounded-lg border border-warning-200 bg-warning-50 px-3 py-2 text-sm font-medium text-warning-800 lg:flex">
                <span className="max-w-[260px] truncate">
                  Support: {currentVenue.account_name ? `${currentVenue.account_name} / ` : ""}{currentVenue.name}
                </span>
                <button type="button" onClick={handleStopSupport} className="text-warning-900 underline-offset-2 hover:underline">
                  Exit
                </button>
              </div>
            ) : null}
            {currentVenue ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => venues.length > 1 && setIsVenueMenuOpen((current) => !current)}
                  className="dropdown-toggle inline-flex h-10 max-w-[220px] items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-300 dark:hover:bg-white/[0.06]"
                  aria-label="Switch venue"
                >
                  <Building2 className="size-4 shrink-0 text-gray-500" />
                  <span className="truncate">{currentVenue.name}</span>
                  {venues.length > 1 ? (
                    <ChevronDown className={`size-4 shrink-0 text-gray-500 transition ${isVenueMenuOpen ? "rotate-180" : ""}`} />
                  ) : null}
                </button>

                {venues.length > 1 ? (
                  <Dropdown
                    isOpen={isVenueMenuOpen}
                    onClose={() => setIsVenueMenuOpen(false)}
                    className="right-0 mt-2 w-[260px] p-2"
                  >
                    <div className="px-2 pb-2 text-xs font-medium uppercase text-gray-400">Venues</div>
                    <div className="flex flex-col gap-1">
                      {venues.map((venue) => (
                        <DropdownItem
                          key={venue.id}
                          onItemClick={() => {
                            void handleVenueSwitch(venue.id);
                          }}
                          className="flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
                        >
                          <span className="truncate">{venue.name}</span>
                          {currentVenue.id === venue.id ? <Check className="size-4 text-brand-600" /> : null}
                        </DropdownItem>
                      ))}
                    </div>
                  </Dropdown>
                ) : null}
              </div>
            ) : null}
            {currentVenue ? (
              <Link to={currentVenue.slug ? `/${currentVenue.slug}` : "/"} className="text-sm font-medium text-gray-600 hover:text-brand-700">
                Public form
              </Link>
            ) : null}
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsUserMenuOpen((current) => !current)}
                className="dropdown-toggle flex items-center gap-3 rounded-full text-gray-700 dark:text-gray-400"
              >
                <span className="flex size-11 items-center justify-center overflow-hidden rounded-full bg-brand-50 text-sm font-semibold text-brand-600 ring-1 ring-brand-100 dark:bg-brand-500/15 dark:text-brand-300 dark:ring-brand-500/20">
                  {user?.avatar_url ? (
                    <img src={user.avatar_url} alt={user.name} className="h-full w-full object-cover" />
                  ) : (
                    userInitials
                  )}
                </span>
                <span className="hidden text-sm font-medium text-gray-900 dark:text-white/90 sm:block">
                  {user?.name || "Manager"}
                </span>
                <ChevronDown className={`size-4 text-gray-500 transition ${isUserMenuOpen ? "rotate-180" : ""}`} />
              </button>

              <Dropdown
                isOpen={isUserMenuOpen}
                onClose={() => setIsUserMenuOpen(false)}
                className="right-0 mt-[17px] flex w-[260px] flex-col rounded-2xl border border-gray-200 bg-white p-3 shadow-theme-lg dark:border-gray-800 dark:bg-gray-dark"
              >
                <div className="px-2 pb-3">
                  <span className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {user?.name || "Manager"}
                  </span>
                  <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
                    {user?.email}
                  </span>
                </div>

                <ul className="flex flex-col gap-1 border-y border-gray-200 py-3 dark:border-gray-800">
                  <li>
                    <DropdownItem
                      tag="a"
                      to="/app/profile"
                      onItemClick={() => setIsUserMenuOpen(false)}
                      className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-300"
                    >
                      <UserRound className="size-5 text-gray-500 dark:text-gray-400" />
                      Edit profile
                    </DropdownItem>
                  </li>
                </ul>

                <DropdownItem
                  onItemClick={async () => {
                    setIsUserMenuOpen(false);
                    await logout();
                    navigate("/signin");
                  }}
                  className="mt-3 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-300"
                >
                  <LogOut className="size-5 text-gray-500 dark:text-gray-400" />
                  Logout
                </DropdownItem>
              </Dropdown>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default AppHeader;
