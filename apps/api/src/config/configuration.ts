/**
 * All environment configuration in one place, read once at boot.
 *
 * Anything missing that the app cannot run without throws here rather than
 * failing at 3am on the first request that needs it.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. See .env.example for the full list.`,
    );
  }
  return value;
}

const configuration = () => ({
  env: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),
  appUrl: process.env.APP_URL ?? 'http://localhost:3000',

  database: {
    url: required('DATABASE_URL'),
  },

  auth: {
    jwtSecret: required('JWT_SECRET'),
    accessTokenTtl: process.env.ACCESS_TOKEN_TTL ?? '15m',
    refreshTokenTtlDays: Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 30),
    cookieDomain: process.env.COOKIE_DOMAIN || undefined,
    // Cross-site cookies are required because api.* and app.* are different
    // registrable domains on Railway/Vercel unless a custom domain is set up.
    cookieSameSite: (process.env.COOKIE_SAMESITE ?? 'none') as 'none' | 'lax' | 'strict',
    cookieSecure: process.env.NODE_ENV === 'production',
    inviteTtlDays: Number(process.env.INVITE_TTL_DAYS ?? 14),
  },

  storage: {
    /**
     * Any S3-compatible endpoint. Verified working with:
     *   AWS S3          — leave endpoint unset
     *   Cloudflare R2   — https://<account>.r2.cloudflarestorage.com
     *   MinIO (local)   — http://localhost:9000 with forcePathStyle
     */
    endpoint: process.env.S3_ENDPOINT || undefined,
    region: process.env.S3_REGION ?? 'auto',
    bucket: process.env.S3_BUCKET ?? 'presenter-ops',
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    /** Seconds a pre-signed upload/download URL stays valid. */
    presignTtlSeconds: Number(process.env.S3_PRESIGN_TTL ?? 900),
    maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES ?? 100 * 1024 * 1024),
  },

  mail: {
    enabled: process.env.MAIL_ENABLED === 'true',
    host: process.env.SMTP_HOST ?? '',
    port: Number(process.env.SMTP_PORT ?? 587),
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from: process.env.MAIL_FROM ?? 'PresenterOps <no-reply@example.com>',
  },

  ai: {
    enabled: process.env.AI_ENABLED === 'true',
    apiKey: process.env.OPENROUTER_API_KEY ?? '',
    // Verified against OpenRouter's API reference: POST to this URL with an
    // OpenAI-compatible body. https://openrouter.ai/docs/api/api-reference/chat/send-chat-completion-request
    baseUrl: process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1',
    model: process.env.OPENROUTER_MODEL ?? 'anthropic/claude-3.5-sonnet',
    /** Sent as HTTP-Referer / X-Title so usage is attributable in OpenRouter. */
    siteUrl: process.env.OPENROUTER_SITE_URL ?? 'https://presenter-ops.local',
    siteName: process.env.OPENROUTER_SITE_NAME ?? 'PresenterOps',
    maxTokens: Number(process.env.OPENROUTER_MAX_TOKENS ?? 1500),
    timeoutMs: Number(process.env.OPENROUTER_TIMEOUT_MS ?? 45_000),
  },
});

export default configuration;
export type AppConfig = ReturnType<typeof configuration>;
