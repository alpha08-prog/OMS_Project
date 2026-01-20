import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // Server
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // JWT
  jwtSecret: process.env.JWT_SECRET || 'fallback-secret-change-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  
  // CORS - Allow multiple frontend ports for development
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5174',
  allowedOrigins: [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
  ],
  
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
