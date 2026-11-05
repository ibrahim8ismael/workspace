/** Runtime configuration from the server (/config): invite requirement, edit policy and STUN/TURN servers.
    Keys arrive once in the URL (?key=, ?admin=), are kept per office in this browser and removed from the address bar. */
export type OfficeConfig = {
  accessRequired: boolean;
  editPolicy: 'everyone' | 'admins';
  iceServers: RTCIceServer[];
  accounts: 'off' | 'optional' | 'required';
  sfu?: boolean;
};
let current: OfficeConfig = {
  accessRequired: false,
  editPolicy: 'everyone',
  iceServers: [],
  accounts: 'off',
  sfu: false,
};
export const officeConfig = () => current;
export async function loadConfig(): Promise<OfficeConfig> {
  try {
    const response = await fetch('/config', { cache: 'no-store' });
    if (response.ok) current = { ...current, ...(await response.json()) };
  } catch {
    /* development without the server: defaults */
  }
  return current;
}
const storageKey = (kind: 'key' | 'admin', room: string) => `office-${kind}-${room}`;
export function rememberKeysFromUrl(room: string) {
  const url = new URL(location.href);
  let changed = false;
  for (const [param, kind] of [
    ['key', 'key'],
    ['admin', 'admin'],
  ] as const) {
    const value = url.searchParams.get(param);
    if (value) {
      try {
        localStorage.setItem(storageKey(kind, room), value.slice(0, 200));
      } catch {
        /* storage unavailable */
      }
      url.searchParams.delete(param);
      changed = true;
    }
  }
  if (changed) history.replaceState(null, '', url);
}
export const storedKey = (kind: 'key' | 'admin', room: string) => {
  try {
    return localStorage.getItem(storageKey(kind, room)) ?? '';
  } catch {
    return '';
  }
};
export const storeKey = (kind: 'key' | 'admin', room: string, value: string) => {
  try {
    if (value) localStorage.setItem(storageKey(kind, room), value);
    else localStorage.removeItem(storageKey(kind, room));
  } catch {
    /* storage unavailable */
  }
};

/** Personal accounts (when the office enables them). The session token lives in this browser only. */
export type Account = { id: string; email: string; name: string };
export const sessionToken = () => {
  try {
    return localStorage.getItem('office-session') ?? '';
  } catch {
    return '';
  }
};
const setSession = (token: string) => {
  try {
    if (token) localStorage.setItem('office-session', token);
    else localStorage.removeItem('office-session');
  } catch {
    /* storage unavailable */
  }
};
async function post(path: string, body: unknown) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { ok: response.ok, data: await response.json().catch(() => ({})) };
}
export async function currentAccount(): Promise<Account | null> {
  const token = sessionToken();
  if (!token) return null;
  const { ok, data } = await post('/api/me', { token });
  if (!ok) {
    setSession('');
    return null;
  }
  return data.user as Account;
}
export async function signIn(
  kind: 'login' | 'register',
  form: { email: string; password: string; name?: string },
): Promise<{ account?: Account; error?: string }> {
  const { ok, data } = await post(kind === 'login' ? '/api/login' : '/api/register', form);
  if (!ok) return { error: data.error ?? 'error' };
  setSession(data.token);
  return { account: data.user };
}
export async function signOut() {
  const token = sessionToken();
  setSession('');
  if (token) await post('/api/logout', { token }).catch(() => undefined);
}
