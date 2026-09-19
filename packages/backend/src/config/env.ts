import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

function requireEnv(key: string, fallback?: string): string {
  const val = process.env[key] ?? fallback;
  if (val === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return val;
}

export const config = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  PORT: parseInt(process.env.PORT ?? '4000', 10),
  FRONTEND_URL: process.env.FRONTEND_URL ?? 'http://localhost:3000',

  // JWT
  JWT_SECRET: requireEnv('JWT_SECRET', 'dev_jwt_secret_change_in_production_at_least_64_chars'),
  JWT_EXPIRY: process.env.JWT_EXPIRY ?? '8h',

  // Database
  DATABASE_URL: requireEnv(
    'DATABASE_URL',
    'postgresql://nexora:nexora_pass@localhost:5432/nexora_ai'
  ),

  // Security
  BCRYPT_ROUNDS: parseInt(process.env.BCRYPT_ROUNDS ?? '12', 10),
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? '900000', 10),
  RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX ?? '100', 10),
  MAX_UPLOAD_SIZE_MB: parseInt(process.env.MAX_UPLOAD_SIZE_MB ?? '10', 10),
  ALLOWED_UPLOAD_TYPES: (
    process.env.ALLOWED_UPLOAD_TYPES ??
    'image/jpeg,image/png,image/webp,application/pdf'
  ).split(','),

  // Optional services — undefined means "use mock adapter"
  MAPBOX_TOKEN: process.env.MAPBOX_TOKEN,
  WEATHER_API_KEY: process.env.WEATHER_API_KEY,
  WEATHER_API_BASE_URL:
    process.env.WEATHER_API_BASE_URL ?? 'https://api.openweathermap.org/data/2.5',
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: parseInt(process.env.SMTP_PORT ?? '587', 10),
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
  EMAIL_FROM: process.env.EMAIL_FROM ?? 'noreply@nexora-ai.in',
  TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
  TWILIO_FROM_NUMBER: process.env.TWILIO_FROM_NUMBER,
  IBM_COS_ENDPOINT: process.env.IBM_COS_ENDPOINT,
  IBM_COS_API_KEY: process.env.IBM_COS_API_KEY,
  IBM_COS_BUCKET: process.env.IBM_COS_BUCKET,
  IBM_COS_SERVICE_INSTANCE_ID: process.env.IBM_COS_SERVICE_INSTANCE_ID,
  WATSONX_API_KEY: process.env.WATSONX_API_KEY,
  WATSONX_URL: process.env.WATSONX_URL,
  WATSONX_PROJECT_ID: process.env.WATSONX_PROJECT_ID,
  ANALYTICS_SERVICE_URL: process.env.ANALYTICS_SERVICE_URL,
  TOTP_ISSUER: process.env.TOTP_ISSUER ?? 'NEXORA_AI',
};
