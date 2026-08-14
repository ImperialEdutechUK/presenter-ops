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

const emailJsEnabled =
  process.env.EMAILJS_ENABLED === 'true';

const configuration = () => ({
  env:
    process.env.NODE_ENV ??
    'development',

  port:
    Number(process.env.PORT ?? 4000),

  appUrl:
    process.env.APP_URL ??
    'http://localhost:3000',

  database: {
    url: required('DATABASE_URL'),
  },

  // ==========================================================================
  // Authentication
  // ==========================================================================

  auth: {
    jwtSecret:
      required('JWT_SECRET'),

    accessTokenTtl:
      process.env.ACCESS_TOKEN_TTL ??
      '15m',

    refreshTokenTtlDays:
      Number(
        process.env
          .REFRESH_TOKEN_TTL_DAYS ??
          30,
      ),

    cookieDomain:
      process.env.COOKIE_DOMAIN ||
      undefined,

    cookieSameSite: (
      process.env.COOKIE_SAMESITE ??
      'none'
    ) as 'none' | 'lax' | 'strict',

    cookieSecure:
      process.env.NODE_ENV ===
      'production',

    inviteTtlDays:
      Number(
        process.env.INVITE_TTL_DAYS ??
          14,
      ),
  },

  // ==========================================================================
  // Object storage
  // ==========================================================================

  storage: {
    endpoint:
      process.env.S3_ENDPOINT ||
      undefined,

    region:
      process.env.S3_REGION ??
      'auto',

    bucket:
      process.env.S3_BUCKET ??
      'presenter-ops',

    accessKeyId:
      process.env
        .S3_ACCESS_KEY_ID ??
      '',

    secretAccessKey:
      process.env
        .S3_SECRET_ACCESS_KEY ??
      '',

    forcePathStyle:
      process.env
        .S3_FORCE_PATH_STYLE ===
      'true',

    presignTtlSeconds:
      Number(
        process.env.S3_PRESIGN_TTL ??
          900,
      ),

    maxUploadBytes:
      Number(
        process.env
          .MAX_UPLOAD_BYTES ??
          100 * 1024 * 1024,
      ),
  },

  // ==========================================================================
  // Existing SMTP email
  // ==========================================================================

  /**
   * SMTP is retained for assignment/reminder emails.
   *
   * MAIL_ENABLED can remain false while presenter
   * invitation emails are handled by EmailJS.
   */
  mail: {
    enabled:
      process.env.MAIL_ENABLED ===
      'true',

    host:
      process.env.SMTP_HOST ??
      '',

    port:
      Number(
        process.env.SMTP_PORT ??
          587,
      ),

    user:
      process.env.SMTP_USER ??
      '',

    pass:
      process.env.SMTP_PASS ??
      '',

    from:
      process.env.MAIL_FROM ??
      'PresenterOps <no-reply@example.com>',
  },

  // ==========================================================================
  // EmailJS
  // ==========================================================================

  /**
   * EmailJS is used for presenter account
   * invitation / activation emails.
   *
   * Private Key is required because EmailJS
   * server-side API access is running in
   * strict mode.
   */
  emailjs: {
    enabled:
      emailJsEnabled,

    serviceId:
      emailJsEnabled
        ? required(
            'EMAILJS_SERVICE_ID',
          )
        : '',

    templateId:
      emailJsEnabled
        ? required(
            'EMAILJS_TEMPLATE_ID',
          )
        : '',

    publicKey:
      emailJsEnabled
        ? required(
            'EMAILJS_PUBLIC_KEY',
          )
        : '',

    privateKey:
      emailJsEnabled
        ? required(
            'EMAILJS_PRIVATE_KEY',
          )
        : '',
  },

  // ==========================================================================
  // AI
  // ==========================================================================

  ai: {
    enabled:
      process.env.AI_ENABLED ===
      'true',

    apiKey:
      process.env
        .OPENROUTER_API_KEY ??
      '',

    baseUrl:
      process.env
        .OPENROUTER_BASE_URL ??
      'https://openrouter.ai/api/v1',

    model:
      process.env.OPENROUTER_MODEL ??
      'anthropic/claude-3.5-sonnet',

    siteUrl:
      process.env
        .OPENROUTER_SITE_URL ??
      'https://presenter-ops.local',

    siteName:
      process.env
        .OPENROUTER_SITE_NAME ??
      'PresenterOps',

    maxTokens:
      Number(
        process.env
          .OPENROUTER_MAX_TOKENS ??
          1500,
      ),

    timeoutMs:
      Number(
        process.env
          .OPENROUTER_TIMEOUT_MS ??
          45_000,
      ),
  },
});

export default configuration;

export type AppConfig =
  ReturnType<typeof configuration>;
