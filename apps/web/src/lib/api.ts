import type { ApiError } from '@presenter-ops/shared';

/**
 * The only place in the web app that talks to the network.
 *
 * Three behaviours worth knowing about:
 *
 *  1. `credentials: 'include'` on every call, because the session lives in an
 *     httpOnly cookie the JavaScript cannot read. This is why CORS on the API
 *     pins an explicit origin list rather than using '*'.
 *
 *  2. A 401 triggers ONE silent refresh, then replays the original request. If
 *     the refresh also fails the user is sent to /login. Concurrent 401s share
 *     a single in-flight refresh promise so ten parallel queries do not fire
 *     ten refreshes and invalidate each other's rotated token.
 *
 *  3. Errors are thrown as `ApiRequestError`, which carries the field-level
 *     messages from the Zod pipe so a form can attach them to inputs directly.
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export class ApiRequestError extends Error {
  readonly status: number;
  readonly fieldErrors?: Record<string, string[]>;
  readonly requestId?: string;

  constructor(payload: ApiError) {
    super(payload.message);
    this.name = 'ApiRequestError';
    this.status = payload.statusCode;
    this.fieldErrors = payload.fieldErrors;
    this.requestId = payload.requestId;
  }
}

let refreshPromise: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  refreshPromise ??= fetch(`${BASE_URL}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  })
    .then((res) => res.ok)
    .catch(() => false)
    .finally(() => {
      // Cleared on the next tick so simultaneous callers all see the same
      // result before a fresh attempt becomes possible.
      setTimeout(() => {
        refreshPromise = null;
      }, 0);
    });

  return refreshPromise;
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  query?: Record<string, string | number | boolean | string[] | undefined | null>;
  /** Internal: prevents an infinite refresh loop. */
  _retried?: boolean;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, query, _retried, headers, ...rest } = options;

  const url = new URL(`${BASE_URL}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue;
      if (Array.isArray(value)) value.forEach((v) => url.searchParams.append(key, String(v)));
      else url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url.toString(), {
    ...rest,
    credentials: 'include',
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (response.status === 401 && !_retried && !path.startsWith('/auth/')) {
    if (await refreshSession()) {
      return apiFetch<T>(path, { ...options, _retried: true });
    }
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    }
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as ApiError | null;
    throw new ApiRequestError(
      payload ?? {
        statusCode: response.status,
        error: response.statusText,
        message: 'The server could not be reached. Check your connection and try again.',
      },
    );
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  get: <T>(path: string, query?: RequestOptions['query']) => apiFetch<T>(path, { query }),
  post: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),
};

/**
 * Two-step upload: ask for a signed url, PUT the file straight to the bucket,
 * then tell the API it landed. The bytes never touch our server.
 */
export async function uploadFile(
  file: File,
  meta: { kind: string; assignmentId?: string; presenterBrandId?: string; versionGroupId?: string },
  onProgress?: (percent: number) => void,
) {
  const presigned = await api.post<{ url: string; key: string }>('/files/presign', {
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
    sizeBytes: file.size,
    kind: meta.kind,
  });

  await new Promise<void>((resolve, reject) => {
    // XHR rather than fetch purely because fetch still cannot report upload
    // progress, and a 90 MB script upload with no progress bar feels broken.
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', presigned.url);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Upload failed with status ${xhr.status}`));
    xhr.onerror = () => reject(new Error('Upload failed — check your connection.'));
    xhr.send(file);
  });

  return api.post('/files/confirm', {
    storageKey: presigned.key,
    fileName: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
    ...meta,
  });
}
