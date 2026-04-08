import express from 'express';
import cors, { type CorsOptions } from 'cors';
import dotenv from 'dotenv';
import routes from './routes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import config, { isWildcardAllowed } from './config';

// Load environment variables
dotenv.config();

// Create Express app
const app = express();

// ===========================================
// Middleware
// ===========================================

function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, '');
}

function isAllowedOrigin(origin: string): boolean {
  const normalizedOrigin = normalizeOrigin(origin);
  return config.allowedOrigins.some((allowedOrigin) => allowedOrigin === normalizedOrigin);
}

// CORS configuration
const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or Postman)
    if (!origin) return callback(null, true);
    
    // Check if origin is allowed (explicit list or wildcard deployment domains)
    if (isAllowedOrigin(origin) || isWildcardAllowed(origin) || config.nodeEnv === 'development') {
      callback(null, true);
    } else {
      console.error(`CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Origin', 'Accept', 'X-Requested-With'],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging in development
if (config.nodeEnv === 'development') {
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} | ${req.method} ${req.path}`);
    next();
  });
}

// ===========================================
// Routes
// ===========================================

// API routes
app.use('/api', routes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Office Management System (OMS) API',
    version: '1.0.0',
    documentation: '/api/health',
    endpoints: {
      auth: '/api/auth',
      grievances: '/api/grievances',
      visitors: '/api/visitors',
      news: '/api/news',
      trainRequests: '/api/train-requests',
      tourPrograms: '/api/tour-programs',
      stats: '/api/stats',
      pdf: '/api/pdf',
    },
  });
});

// ===========================================
// Error Handling
// ===========================================

// 404 handler
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

// ===========================================
// Server Start
// ===========================================

const PORT = config.port;
const serverBaseUrl = config.backendUrl || `http://localhost:${PORT}`;

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   🏛️  Office Management System (OMS) API                      ║
║                                                               ║
║   Server running on: ${serverBaseUrl.padEnd(42)} ║
║   Environment: ${config.nodeEnv.padEnd(46)}                   ║
║                                                               ║
║   API Endpoints:                                              ║
║   • Auth:          /api/auth                                  ║
║   • Grievances:    /api/grievances                            ║
║   • Visitors:      /api/visitors                              ║
║   • News:          /api/news                                  ║
║   • Train Requests:/api/train-requests                        ║
║   • Tour Programs: /api/tour-programs                         ║
║   • Statistics:    /api/stats                                 ║
║   • PDF Generator: /api/pdf                                   ║
║   • Health:        /api/health                                ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
  `);
});

export default app;
