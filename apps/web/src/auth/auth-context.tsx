import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, configureApiSession, setApiAccessToken } from "../lib/api";

export type AuthProfile = {
  id: string; email: string; displayName: string;
  company: { id: string; name: string; slug: string };
  role: { key: string; name: string };
  permissions: string[];
};
type AuthResponse = { accessToken: string; expiresInSeconds: number; profile: AuthProfile };
type AuthContextValue = {
  profile?: AuthProfile; loading: boolean;
  login(input: { email: string; password: string; workspace?: string }): Promise<void>;
  logout(): Promise<void>;
  updateCompanyProfile(company: Pick<AuthProfile["company"], "name">): void;
};

const AuthContext = createContext<AuthContextValue | null>(null);
let refreshInFlight: Promise<AuthResponse | undefined> | undefined;

function rotateRefreshSession() {
  if (!refreshInFlight) {
    refreshInFlight = api<AuthResponse>("/auth/refresh", { method: "POST" }, false)
      .catch(() => undefined)
      .finally(() => { refreshInFlight = undefined; });
  }
  return refreshInFlight;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<AuthProfile>();
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const response = await rotateRefreshSession();
    if (response) {
      setApiAccessToken(response.accessToken); setProfile(response.profile); return response.accessToken;
    }
    setApiAccessToken(undefined); setProfile(undefined); return undefined;
  }, []);

  useEffect(() => {
    configureApiSession({ refresh });
    void refresh().finally(() => setLoading(false));
    return () => configureApiSession({});
  }, [refresh]);

  const value = useMemo<AuthContextValue>(() => ({
    profile, loading,
    async login(input) {
      const response = await api<AuthResponse>("/auth/login", { method: "POST", body: JSON.stringify(input) }, false);
      setApiAccessToken(response.accessToken); setProfile(response.profile);
    },
    async logout() {
      try { await api<void>("/auth/logout", { method: "POST" }, false); } finally { setApiAccessToken(undefined); setProfile(undefined); }
    },
    updateCompanyProfile(company) {
      setProfile((current) => current ? { ...current, company: { ...current.company, ...company } } : current);
    },
  }), [profile, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
