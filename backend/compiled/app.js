"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const routes_1 = __importDefault(require("./routes"));
const errorHandler_1 = require("./middleware/errorHandler");
const config_1 = __importStar(require("./config"));
// Load environment variables
dotenv_1.default.config();
// Create Express app
const app = (0, express_1.default)();
// ===========================================
// Middleware
// ===========================================
function normalizeOrigin(origin) {
    return origin.trim().replace(/\/+$/, '');
}
function isAllowedOrigin(origin) {
    const normalizedOrigin = normalizeOrigin(origin);
    return config_1.default.allowedOrigins.some((allowedOrigin) => allowedOrigin === normalizedOrigin);
}
// CORS configuration
const corsOptions = {
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or Postman)
        if (!origin)
            return callback(null, true);
        // Check if origin is allowed (explicit list or wildcard deployment domains)
        if (isAllowedOrigin(origin) || (0, config_1.isWildcardAllowed)(origin) || config_1.default.nodeEnv === 'development') {
            callback(null, true);
        }
        else {
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
if (!config_1.default.isCatalystRuntime) {
    app.use((0, cors_1.default)(corsOptions));
    app.options('*', (0, cors_1.default)(corsOptions));
}
// Body parsing
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
// Request logging in development
if (config_1.default.nodeEnv === 'development') {
    app.use((req, res, next) => {
        console.log(`${new Date().toISOString()} | ${req.method} ${req.path}`);
        next();
    });
}
// ===========================================
// Routes
// ===========================================
// API routes
app.use('/api', routes_1.default);
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
app.use(errorHandler_1.notFoundHandler);
// Global error handler
app.use(errorHandler_1.errorHandler);
// ===========================================
// Server Start
// ===========================================
const PORT = config_1.default.port;
const serverBaseUrl = config_1.default.backendUrl || `http://localhost:${PORT}`;
app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   🏛️  Office Management System (OMS) API                      ║
║                                                               ║
║   Server running on: ${serverBaseUrl.padEnd(42)} ║
║   Environment: ${config_1.default.nodeEnv.padEnd(46)}                   ║
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
exports.default = app;
//# sourceMappingURL=app.js.map