import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { apiFetch, toJsonBody } from "../lib/api";
import type { User, Venue } from "../types";

type AuthPayload = {
  user: User | null;
  venues?: Venue[];
  current_venue?: Venue | null;
  support_mode?: boolean;
};

type AuthContextValue = {
  user: User | null;
  venues: Venue[];
  currentVenue: Venue | null;
  supportMode: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  switchVenue: (venueId: number) => Promise<void>;
  startSupport: (venueId: number) => Promise<void>;
  stopSupport: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [currentVenue, setCurrentVenue] = useState<Venue | null>(null);
  const [supportMode, setSupportMode] = useState(false);
  const [loading, setLoading] = useState(true);

  const applyAuthPayload = useCallback((payload: AuthPayload) => {
    setUser(payload.user);
    setVenues(payload.venues || []);
    setCurrentVenue(payload.current_venue || null);
    setSupportMode(Boolean(payload.support_mode));
  }, []);

  const refresh = useCallback(async () => {
    const response = await apiFetch<AuthPayload>("auth/me");
    applyAuthPayload(response);
  }, [applyAuthPayload]);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const response = await apiFetch<AuthPayload>("auth/login", {
      method: "POST",
      ...toJsonBody({ email, password }),
    });
    applyAuthPayload(response);
  }, [applyAuthPayload]);

  const logout = useCallback(async () => {
    await apiFetch<{ ok: boolean }>("auth/logout", { method: "POST" });
    setUser(null);
    setVenues([]);
    setCurrentVenue(null);
    setSupportMode(false);
  }, []);

  const switchVenue = useCallback(async (venueId: number) => {
    const response = await apiFetch<AuthPayload>("venues/switch", {
      method: "POST",
      ...toJsonBody({ venue_id: venueId }),
    });
    applyAuthPayload(response);
  }, [applyAuthPayload]);

  const startSupport = useCallback(async (venueId: number) => {
    const response = await apiFetch<AuthPayload>("support/start", {
      method: "POST",
      ...toJsonBody({ venue_id: venueId }),
    });
    applyAuthPayload(response);
  }, [applyAuthPayload]);

  const stopSupport = useCallback(async () => {
    const response = await apiFetch<AuthPayload>("support/stop", {
      method: "POST",
    });
    applyAuthPayload(response);
  }, [applyAuthPayload]);

  const value = useMemo(
    () => ({ user, venues, currentVenue, supportMode, loading, login, logout, refresh, switchVenue, startSupport, stopSupport }),
    [user, venues, currentVenue, supportMode, loading, login, logout, refresh, switchVenue, startSupport, stopSupport],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }

  return context;
}
