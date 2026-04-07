import dotenv from 'dotenv';

dotenv.config();

function normalizeEnvValue(value: string): string {
  return value.trim().replace(/^['"]+|['"]+$/g, '');
}

function normalizeOrigin(origin: string): string {
  return normalizeEnvValue(origin).replace(/\/+$/, '');
}

function parseOrigins(...values: Array<string | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .flatMap((value) => (value ? value.split(',') : []))
        .map((value) => normalizeOrigin(value))
        .filter(Boolean)
    )
  );
}

export const config = {
  // Server
  port: parseInt(
    process.env.X_ZOHO_CATALYST_LISTEN_PORT || process.env.PORT || '5000',
    10
  ),
  nodeEnv: normalizeEnvValue(process.env.NODE_ENV || 'development'),
  backendUrl: normalizeOrigin(
    process.env.BACKEND_URL || 'https://oms-50040756292.development.catalystappsail.in'
  ),
  
  // JWT
  jwtSecret: process.env.JWT_SECRET || 'fallback-secret-change-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  
  // CORS
  frontendUrl: normalizeOrigin(
    process.env.FRONTEND_URL || 'https://oms-project-pycokznq.onslate.in'
  ),
  allowedOrigins: parseOrigins(
    process.env.FRONTEND_URL,
    process.env.CORS_ORIGINS,
    'https://oms-project-pycokznq.onslate.in',
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174'
  ),
  
  // Database
  databaseUrl: process.env.DATABASE_URL,
  
  // RapidAPI - IRCTC PNR Status
  rapidApi: {
    key: process.env.RAPIDAPI_KEY || '',
    host: process.env.RAPIDAPI_HOST || 'irctc-indian-railway-pnr-status.p.rapidapi.com',
    pnrUrl: process.env.RAPIDAPI_PNR_URL || 'https://irctc-indian-railway-pnr-status.p.rapidapi.com/getPNRStatus',
  },
};

export default config;
