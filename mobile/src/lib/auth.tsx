import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { errorMessage, get, loginRequest, logoutRequest, refreshSession, setSessionExpiredHandler, type SessionUser } from '@/services/api';
import type { CompanySettings, Role } from './types';

interface AuthState {
  loading: boolean;
  /** true when a previously valid session was ended by the server (refresh failed); cleared on next sign-in. */
  sessionExpired: boolean;
  user: SessionUser | null;
  /** lower-case role used by the UI; the server decides what it may actually do. */
  role: Role;
  profile: { fullName: string; email: string } | null;
  employee: { id: string; fullName: string } | null;
  settings: CompanySettings;
  signIn: (email: string, password: string, remember?: boolean) => Promise<string | null>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const defaultSettings: CompanySettings = { companyName: 'HR Connect', timezone: 'Europe/London', country: 'GB', lateGraceMinutes: 5, overtimeMultiplier: 1.5, retentionMonths: 36 };
const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [settings, setSettings] = useState<CompanySettings>(defaultSettings);

  const loadSettings = useCallback(async () => { try { setSettings(await get<CompanySettings>('/settings')); } catch { /* keep defaults */ } }, []);

  useEffect(() => {
    setSessionExpiredHandler(() => { setUser(null); setSessionExpired(true); });
    let alive = true;
    // Restore the session: native uses the SecureStore refresh token, web uses the HttpOnly cookie.
    refreshSession().then(async (u) => {
      if (!alive) return;
      setUser(u);
      if (u) await loadSettings();
      if (alive) setLoading(false);
    });
    return () => { alive = false; };
  }, [loadSettings]);

  const value = useMemo<AuthState>(() => ({
    loading, user, sessionExpired,
    role: (user?.role.toLowerCase() as Role | undefined) ?? 'staff',
    profile: user ? { fullName: user.fullName, email: user.email } : null,
    employee: user?.employeeId ? { id: user.employeeId, fullName: user.fullName } : null,
    settings,
    signIn: async (email, password, remember = true) => {
      try { const u = await loginRequest(email.trim(), password, remember); setSessionExpired(false); setUser(u); await loadSettings(); return null; } catch (e) { return errorMessage(e); }
    },
    signOut: async () => { await logoutRequest(); setSessionExpired(false); setUser(null); },
    refresh: async () => { await loadSettings(); },
  }), [loading, user, sessionExpired, settings, loadSettings]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}
