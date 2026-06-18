import express from 'express';
import cors, { type CorsOptions } from 'cors';
import compression from 'compression';
import dotenv from 'dotenv';
import routes from './routes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import config, { isWildcardAllowed } from './config';
import { withRequestMetrics } from './lib/request-metrics';
import { catalystRuntimeInfo } from './lib/catalyst-client';
import { useZCQL } from './config/feature-flags';

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

// Catalyst/AppSail can inject CORS headers from platform whitelisting.
// When that is enabled, Express must not add the same headers again.
if (!config.isCatalystRuntime) {
  app.use(cors(corsOptions));
  app.options('*', cors(corsOptions));
}

// Gzip responses. Mostly benefits large JSON (stats, lists); pdfkit output is
// already binary so it's largely a no-op there. Safe even if the AppSail layer
// also compresses — compression skips already-encoded responses.
app.use(compression());

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

// ── DIAGNOSTIC: per-request performance log (remove once latency is resolved) ──
// One line per request: total wall time, how many Catalyst round-trips it made
// and their summed time, whether a fresh OAuth token was minted, whether this
// was the FIRST request since boot (cold-start sentinel), and process uptime.
// This single line distinguishes a cold-start tax (first request slow, rest
// fast) from the every-request serial-round-trip floor (every request slow with
// catalyst=3-4 calls dominating total). Runs in ALL environments on purpose.
let firstRequestSeen = false;
app.use((req, res, next) => {
  const startNs = process.hrtime.bigint();
  const cold = !firstRequestSeen;
  firstRequestSeen = true;
  withRequestMetrics((metrics) => {
    res.on('finish', () => {
      const totalMs = Number(process.hrtime.bigint() - startNs) / 1e6;
      const calls = metrics.catalystCalls;
      const catalystMs = calls.reduce((sum, c) => sum + c.ms, 0);
      const tokenFetched = calls.some((c) => c.tokenFetched);
      console.log(
        `[perf] ${req.method} ${req.originalUrl} ` +
          `total=${totalMs.toFixed(0)}ms ` +
          `catalyst=${calls.length}calls/${catalystMs.toFixed(0)}ms ` +
          `tokenFetch=${tokenFetched} cold=${cold} ` +
          `up=${process.uptime().toFixed(0)}s status=${res.statusCode}`
      );
    });
    next();
  });
});

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

// Fail fast on insecure config. A production or Catalyst deployment must supply
// a real JWT_SECRET — starting with the development fallback would let anyone
// who knows that public default string forge valid auth tokens. Locally we
// allow the fallback but warn loudly.
function assertSecureConfig(): void {
  if (!config.jwtSecretIsFallback) return;
  const isSecureEnv = config.isCatalystRuntime || config.nodeEnv === 'production';
  if (isSecureEnv) {
    console.error(
      'FATAL: JWT_SECRET is not set. Refusing to start in a production/Catalyst ' +
      'environment with the insecure default secret — set JWT_SECRET and redeploy.'
    );
    process.exit(1);
  }
  console.warn(
    '[config] JWT_SECRET not set — using the insecure development fallback. ' +
    'Fine for local dev, but it MUST be set in production.'
  );
}

assertSecureConfig();

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

  // ── DIAGNOSTIC: one-shot boot line exposing the repo-unknowable prod facts ──
  // Confirms which Catalyst datastore environment the header targets (and if it
  // was silently defaulted), whether ZCQL is on, and the resolved nodeEnv/runtime.
  const cat = catalystRuntimeInfo();
  console.log(
    `[boot] nodeEnv=${config.nodeEnv} catalystRuntime=${config.isCatalystRuntime} ` +
      `node=${process.version} useZCQL=${useZCQL()} ` +
      `catalystEnv=${cat.environment}${cat.environmentExplicit ? '' : ' (DEFAULTED!)'} ` +
      `apiHost=${cat.apiHost} oauthConfigured=${cat.oauthConfigured}`
  );
});

export default app;
