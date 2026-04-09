"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
exports.isWildcardAllowed = isWildcardAllowed;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
function normalizeEnvValue(value) {
    return value.trim().replace(/^['"]+|['"]+$/g, '');
}
function normalizeOrigin(origin) {
    return normalizeEnvValue(origin).replace(/\/+$/, '');
}
function parseOrigins(...values) {
    return Array.from(new Set(values
        .flatMap((value) => (value ? value.split(',') : []))
        .map((value) => normalizeOrigin(value))
        .filter(Boolean)));
}
/** True when origin matches a *.vercel.app, *.onrender.com, or *.catalystappsail.in wildcard */
function isWildcardAllowed(origin) {
    const normalized = normalizeEnvValue(origin).replace(/\/+$/, '');
    return (/^https:\/\/[a-zA-Z0-9-]+\.vercel\.app$/.test(normalized) ||
        /^https:\/\/[a-zA-Z0-9-]+\.onrender\.com$/.test(normalized) ||
        /^https:\/\/[a-zA-Z0-9-]+\.netlify\.app$/.test(normalized) ||
        /^https:\/\/[a-zA-Z0-9-]+\.catalystappsail\.in$/.test(normalized) ||
        /^https:\/\/[a-zA-Z0-9-]+\.zohocatalyst\.com$/.test(normalized) ||
        /^https:\/\/[a-zA-Z0-9-]+\.onslate\.in$/.test(normalized));
}
exports.config = {
    // Server
    port: parseInt(process.env.X_ZOHO_CATALYST_LISTEN_PORT || process.env.PORT || '9000', 10),
    isCatalystRuntime: Boolean(process.env.X_ZOHO_CATALYST_LISTEN_PORT),
    nodeEnv: normalizeEnvValue(process.env.NODE_ENV || 'development'),
    backendUrl: normalizeOrigin(process.env.BACKEND_URL || 'https://omsbackend-50040756292.development.catalystappsail.in'),
    // JWT
    jwtSecret: process.env.JWT_SECRET || 'fallback-secret-change-in-production',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
    // CORS
    frontendUrl: normalizeOrigin(process.env.FRONTEND_URL || 'https://oms-project-dev.onslate.in'),
    allowedOrigins: parseOrigins(process.env.FRONTEND_URL, process.env.CORS_ORIGINS, 'https://oms-project-dev.onslate.in', 'http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175', 'http://127.0.0.1:5173', 'http://127.0.0.1:5174'),
    // Database
    databaseUrl: process.env.DATABASE_URL,
    // RapidAPI - IRCTC PNR Status
    rapidApi: {
        key: process.env.RAPIDAPI_KEY || '',
        host: process.env.RAPIDAPI_HOST || 'irctc-indian-railway-pnr-status.p.rapidapi.com',
        pnrUrl: process.env.RAPIDAPI_PNR_URL || 'https://irctc-indian-railway-pnr-status.p.rapidapi.com/getPNRStatus',
    },
};
exports.default = exports.config;
//# sourceMappingURL=index.js.map