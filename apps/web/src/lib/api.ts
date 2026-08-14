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
 *  2. A 401 triggers ONE silent refresh, then replays the original request.
 *     Concurrent 401s share a single in-flight refresh promise so multiple
 *     requests do not rotate the refresh token at the same time.
 *
 *  3. Errors are thrown as `ApiRequestError`, which carries the field-level
 *     messages from the Zod pipe so a form can attach them to inputs directly.
 */

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:4000/api/v1';

/**
 * These authentication endpoints must never trigger another refresh request.
 *
 * `/auth/me` is deliberately NOT included here because it is a protected
 * endpoint and should refresh the access token when the access token expires.
 */
const NO_REFRESH_PATHS = new Set([
  '/auth/login',
  '/auth/refresh',
  '/auth/logout',
  '/auth/accept-invite',
]);

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

/**
 * Shared promise so several simultaneous 401 responses result in only
 * one refresh request.
 */
let refreshPromise: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  refreshPromise ??= fetch(
    `${BASE_URL}/auth/refresh`,
    {
      method: 'POST',
      credentials: 'include',
    },
  )
    .then((response) => response.ok)
    .catch(() => false)
    .finally(() => {
      /**
       * Clear on the next tick so all simultaneous callers can still
       * receive the result of the same refresh attempt.
       */
      setTimeout(() => {
        refreshPromise = null;
      }, 0);
    });

  return refreshPromise;
}

interface RequestOptions
  extends Omit<RequestInit, 'body'> {
  body?: unknown;

  query?: Record<
    string,
    | string
    | number
    | boolean
    | string[]
    | undefined
    | null
  >;

  /**
   * Internal flag.
   * Prevents a retried request from entering another refresh loop.
   */
  _retried?: boolean;
}

/**
 * Redirect the browser to the login page while preserving the page
 * the user was trying to view.
 */
function redirectToLogin() {
  if (typeof window === 'undefined') {
    return;
  }

  if (
    window.location.pathname.startsWith(
      '/login',
    )
  ) {
    return;
  }

  const next =
    window.location.pathname +
    window.location.search;

  window.location.href =
    `/login?next=${encodeURIComponent(next)}`;
}

export async function apiFetch<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const {
    body,
    query,
    _retried,
    headers,
    ...rest
  } = options;

  const url = new URL(
    `${BASE_URL}${path}`,
  );

  if (query) {
    for (
      const [key, value] of Object.entries(
        query,
      )
    ) {
      if (
        value === undefined ||
        value === null ||
        value === ''
      ) {
        continue;
      }

      if (Array.isArray(value)) {
        value.forEach((item) => {
          url.searchParams.append(
            key,
            String(item),
          );
        });
      } else {
        url.searchParams.set(
          key,
          String(value),
        );
      }
    }
  }

  const hasBody =
    body !== undefined;

  const response = await fetch(
    url.toString(),
    {
      ...rest,

      credentials: 'include',

      headers: {
        ...(hasBody
          ? {
              'Content-Type':
                'application/json',
            }
          : {}),

        ...headers,
      },

      ...(hasBody
        ? {
            body: JSON.stringify(body),
          }
        : {}),
    },
  );

  /**
   * Access-token refresh.
   *
   * IMPORTANT:
   * `/auth/me` is allowed through here.
   *
   * This fixes the issue where an Admin's access token expired,
   * `/auth/me` returned 401, and the presenter page then lost the
   * current user's role and hid "Invite to portal".
   */
  const shouldRefresh =
    response.status === 401 &&
    !_retried &&
    !NO_REFRESH_PATHS.has(path);

  if (shouldRefresh) {
    const refreshed =
      await refreshSession();

    if (refreshed) {
      return apiFetch<T>(
        path,
        {
          ...options,
          _retried: true,
        },
      );
    }

    redirectToLogin();
  }

  if (!response.ok) {
    const payload =
      (await response
        .json()
        .catch(() => null)) as
        | ApiError
        | null;

    throw new ApiRequestError(
      payload ?? {
        statusCode:
          response.status,

        error:
          response.statusText,

        message:
          'The server could not be reached. Check your connection and try again.',
      },
    );
  }

  if (
    response.status === 204
  ) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export const api = {
  get: <T>(
    path: string,
    query?: RequestOptions['query'],
  ) =>
    apiFetch<T>(
      path,
      {
        query,
      },
    ),

  post: <T>(
    path: string,
    body?: unknown,
  ) =>
    apiFetch<T>(
      path,
      {
        method: 'POST',
        body,
      },
    ),

  patch: <T>(
    path: string,
    body?: unknown,
  ) =>
    apiFetch<T>(
      path,
      {
        method: 'PATCH',
        body,
      },
    ),

  delete: <T>(
    path: string,
  ) =>
    apiFetch<T>(
      path,
      {
        method: 'DELETE',
      },
    ),
};

/**
 * Two-step upload:
 *
 * 1. Ask the API for a signed upload URL.
 * 2. Upload the file directly to object storage.
 * 3. Tell the API that the upload completed.
 *
 * The actual file bytes never pass through the PresenterOps API.
 */
export async function uploadFile(
  file: File,

  meta: {
    kind: string;
    assignmentId?: string;
    presenterBrandId?: string;
    versionGroupId?: string;
  },

  onProgress?: (
    percent: number,
  ) => void,
) {
  const presigned =
    await api.post<{
      url: string;
      key: string;
    }>(
      '/files/presign',
      {
        fileName:
          file.name,

        mimeType:
          file.type ||
          'application/octet-stream',

        sizeBytes:
          file.size,

        kind:
          meta.kind,
      },
    );

  await new Promise<void>(
    (
      resolve,
      reject,
    ) => {
      /**
       * XHR is used here because browser fetch still does not provide
       * reliable upload progress events.
       */
      const xhr =
        new XMLHttpRequest();

      xhr.open(
        'PUT',
        presigned.url,
      );

      xhr.setRequestHeader(
        'Content-Type',
        file.type ||
          'application/octet-stream',
      );

      xhr.upload.onprogress =
        (event) => {
          if (
            event.lengthComputable &&
            onProgress
          ) {
            onProgress(
              Math.round(
                (event.loaded /
                  event.total) *
                  100,
              ),
            );
          }
        };

      xhr.onload = () => {
        if (
          xhr.status >= 200 &&
          xhr.status < 300
        ) {
          resolve();
          return;
        }

        reject(
          new Error(
            `Upload failed with status ${xhr.status}`,
          ),
        );
      };

      xhr.onerror = () => {
        reject(
          new Error(
            'Upload failed — check your connection.',
          ),
        );
      };

      xhr.send(file);
    },
  );

  return api.post(
    '/files/confirm',
    {
      storageKey:
        presigned.key,

      fileName:
        file.name,

      mimeType:
        file.type,

      sizeBytes:
        file.size,

      ...meta,
    },
  );
}
