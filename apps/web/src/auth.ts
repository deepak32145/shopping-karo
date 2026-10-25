import { useEffect, useSyncExternalStore } from 'react';
import { ApiError, ensureOk } from './http';

export { ApiError } from './http';

export interface User {
  id: string;
  email: string;
  name: string;
  roles: string[];
}

interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

const REFRESH_KEY = 'sk-refresh';

// ---------- tiny session store ----------
// The short-lived access token lives only in memory; the rotating refresh token is the only thing persisted.

interface Snapshot {
  user: User | null;
  ready: boolean;
}

let accessToken: string | null = null;
let snapshot: Snapshot = { user: null, ready: false };
const listeners = new Set<() => void>();

function publish(next: Partial<Snapshot>) {
  snapshot = { ...snapshot, ...next };
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

const readRefresh = (): string | null => {
  try {
    return localStorage.getItem(REFRESH_KEY);
  } catch {
    return null;
  }
};
const writeRefresh = (token: string | null) => {
  try {
    if (token) localStorage.setItem(REFRESH_KEY, token);
    else localStorage.removeItem(REFRESH_KEY);
  } catch {
    /* storage unavailable: the user simply has to sign in again next visit */
  }
};

function accept(t: TokenResponse) {
  writeRefresh(t.refreshToken);
  accessToken = t.accessToken;
  publish({ user: t.user });
}

function clearSession() {
  writeRefresh(null);
  accessToken = null;
  publish({ user: null });
}

// ---------- raw calls to auth-service ----------

async function post(path: string, body: unknown): Promise<Response> {
  return fetch(`/api/auth${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function tokens(res: Response): Promise<TokenResponse> {
  await ensureOk(res);
  return res.json();
}

// ---------- session refresh (single-flight) ----------

let refreshing: Promise<boolean> | null = null;

/**
 * Trades the stored refresh token for a new pair. Refresh tokens are single-use, so concurrent callers (React dev
 * double-effects, several requests failing at once) must share ONE call; a second use of the same token would fail.
 */
export function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    const stored = readRefresh();
    if (!stored) return false;
    try {
      accept(await tokens(await post('/refresh', { refreshToken: stored })));
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) clearSession(); // token really is dead
      return false; // network trouble: keep the token and try again later
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

let started = false;
function startSession() {
  if (started) return;
  started = true;
  void refreshSession().finally(() => publish({ ready: true }));
}

/** fetch() with the signed-in user's access token. If it has expired, refreshes once and retries. */
export async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const send = () =>
    fetch(path, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init.headers as Record<string, string> | undefined),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
    });
  let res = await send();
  if (res.status === 401 && (await refreshSession())) res = await send();
  return res;
}

// ---------- actions ----------

const login = async (email: string, password: string) => accept(await tokens(await post('/login', { email, password })));

/** Creates the account and emails a code. The user is NOT signed in until verifyEmail succeeds. */
const register = async (name: string, email: string, password: string) => ensureOk(await post('/register', { name, email, password }));

const verifyEmail = async (email: string, otp: string) => accept(await tokens(await post('/verify-email', { email, otp })));
const resendOtp = async (email: string) => ensureOk(await post('/resend-otp', { email }));

/** Sign in / sign up with the ID token from the Google button. Google already verified the email. */
const googleLogin = async (credential: string) => accept(await tokens(await post('/google', { credential })));

const forgotPassword = async (email: string) => ensureOk(await post('/forgot-password', { email }));
const resetPassword = async (token: string, newPassword: string) => ensureOk(await post('/reset-password', { token, newPassword }));

const logout = async () => {
  const stored = readRefresh();
  clearSession();
  if (stored) await post('/logout', { refreshToken: stored }).catch(() => undefined);
};

export function useAuth() {
  const { user, ready } = useSyncExternalStore(subscribe, () => snapshot);
  useEffect(startSession, []);
  return { user, ready, login, register, verifyEmail, resendOtp, googleLogin, forgotPassword, resetPassword, logout };
}
