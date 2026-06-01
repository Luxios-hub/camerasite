const dotenv = require('dotenv');
const { z } = require('zod');

dotenv.config({ quiet: true });

const DEFAULT_DATABASE_URL = 'postgres://camerasnyc:camerasnyc@localhost:5432/camerasnyc';
const DEFAULT_SESSION_SECRET = 'development-session-secret-change-me';
const SAMPLE_DATABASE_URL = 'postgres://camerasnyc:change-me@localhost:5432/camerasnyc';
const SAMPLE_SESSION_SECRET = 'replace-with-a-long-random-string';

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  PORT: z.coerce.number().int().positive().max(65535),
  DATABASE_URL: z.string().url(),
  SESSION_SECRET: z.string().min(16),
  PUBLIC_BASE_URL: z.string().url(),
  UPLOAD_ROOT: z.string().min(1)
});

const parsed = envSchema.safeParse({
  NODE_ENV: nodeEnv,
  PORT: process.env.PORT || '3000',
  DATABASE_URL: process.env.DATABASE_URL || (isProduction ? undefined : DEFAULT_DATABASE_URL),
  SESSION_SECRET: process.env.SESSION_SECRET || (isProduction ? undefined : DEFAULT_SESSION_SECRET),
  PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL || 'http://localhost:3000',
  UPLOAD_ROOT: process.env.UPLOAD_ROOT || 'uploads'
});

if (!parsed.success) {
  throw new Error(`Invalid environment configuration: ${z.prettifyError(parsed.error)}`);
}

const env = parsed.data;

if (env.NODE_ENV === 'production') {
  const missing = ['DATABASE_URL', 'SESSION_SECRET'].filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required production environment variables: ${missing.join(', ')}`);
  }

  const usesPlaceholderValues = env.DATABASE_URL === DEFAULT_DATABASE_URL
    || env.DATABASE_URL === SAMPLE_DATABASE_URL
    || env.SESSION_SECRET === DEFAULT_SESSION_SECRET
    || env.SESSION_SECRET === SAMPLE_SESSION_SECRET;

  if (usesPlaceholderValues) {
    throw new Error('Production DATABASE_URL and SESSION_SECRET must not use placeholder values.');
  }
}

module.exports = {
  env
};
