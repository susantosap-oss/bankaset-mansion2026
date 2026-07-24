const REQUIRED_VARS = [
  'AUTH_SECRET',
  'GOOGLE_SHEET_ID',
  'CRM_SHEET_ID',
  'GROQ_API_KEY',
] as const;

const WARN_VARS = [
  'GOOGLE_IMPERSONATE_SA',
  'GOOGLE_SERVICE_ACCOUNT_EMAIL',
] as const;

/**
 * Call once at server startup (e.g. in container.ts or an instrumentation file).
 * Throws if any required variable is missing.
 */
export function validateEnv(): void {
  const missing = REQUIRED_VARS.filter((v) => !process.env[v]);
  if (missing.length > 0) {
    throw new Error(
      `[env] Missing required environment variables: ${missing.join(', ')}\n` +
      'Pastikan file .env.local sudah diisi dengan benar.',
    );
  }

  const hasAuth =
    (process.env.GOOGLE_PRIVATE_KEY && process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) ||
    process.env.GOOGLE_IMPERSONATE_SA;

  if (!hasAuth) {
    const warnMissing = WARN_VARS.filter((v) => !process.env[v]);
    console.warn(
      `[env] WARNING: Google Sheets auth tidak terkonfigurasi. ` +
      `Set salah satu: GOOGLE_IMPERSONATE_SA atau (GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_PRIVATE_KEY). ` +
      `Missing: ${warnMissing.join(', ')}`,
    );
  }
}

export function getEnv(key: string, fallback?: string): string {
  const val = process.env[key] ?? fallback;
  if (val === undefined) {
    throw new Error(`[env] Environment variable '${key}' is not set`);
  }
  return val;
}
