// Small HTTP client for authentication. Tokens live in sessionStorage (per tab), so an admin tab and
// several team tabs can run side by side on one computer, and a refresh keeps the session.

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

async function request<T>(path: string, init: { method?: string; body?: unknown; token?: string | null } = {}): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? 'GET',
    headers: { 'content-type': 'application/json', ...(init.token ? { authorization: `Bearer ${init.token}` } : {}) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'error');
  return data as T;
}

export const api = {
  adminLogin: (password: string) => request<{ token: string }>('/api/admin/login', { method: 'POST', body: { password } }),
  createRoom: (token: string) => request<{ code: string }>('/api/admin/rooms', { method: 'POST', body: {}, token }),
  listRooms: (token: string) => request<{ code: string; phase: string; createdAt: number }[]>('/api/admin/rooms', { token }),
  join: (code: string, pin: string) => request<{ token: string; teamName: string; code: string }>('/api/join', { method: 'POST', body: { code, pin } }),
  createScreenPairing: (token: string, code: string) =>
    request<{ secret: string; expiresAt: number }>(`/api/admin/rooms/${encodeURIComponent(code)}/screen-pairing`, { method: 'POST', body: {}, token }),
  revokeScreens: (token: string, code: string) =>
    request<{ revoked: number }>(`/api/admin/rooms/${encodeURIComponent(code)}/screen-revoke`, { method: 'POST', body: {}, token }),
  screenPair: (secret: string) => request<{ token: string; roomCode: string; expiresAt: number }>('/api/screen/pair', { method: 'POST', body: { secret } }),
};

export function describeAuthError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 429) return 'Thử quá nhiều lần. Vui lòng đợi vài phút rồi thử lại.';
    if (err.status === 401) return 'Thông tin không đúng. Kiểm tra lại và thử lại.';
  }
  return 'Không kết nối được máy chủ.';
}

export const storage = {
  get(key: string): string | null {
    try {
      return sessionStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string | null) {
    try {
      if (value === null) sessionStorage.removeItem(key);
      else sessionStorage.setItem(key, value);
    } catch {
      /* storage unavailable: session lasts until refresh */
    }
  },
};
