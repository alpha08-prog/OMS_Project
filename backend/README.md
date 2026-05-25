# 🏛️ OMS Backend API

Production-ready REST API for the Office Management System (OMS).

## 🛠️ Tech Stack

- **Node.js** & **Express** - Web framework
- **TypeScript** - Type safety
- **Zoho Catalyst Data Store** - Database (accessed via `zcatalyst-sdk-node`)
- **JWT** - Authentication
- **Bcrypt** - Password hashing

## 📋 Prerequisites

- Node.js 22+
- A Zoho Catalyst project with the required tables provisioned in the Console
- npm

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd OMS_Project/backend
npm install
```

### 2. Configure Environment

Create a `.env` file with at least:

```env
JWT_SECRET="your-super-secret-jwt-key-change-this"
JWT_EXPIRES_IN="7d"
PORT=9000
NODE_ENV="development"
FRONTEND_URL="http://localhost:5173"

# Catalyst credentials are supplied by AppSail at runtime in production.
# For local dev, populate the values your Catalyst project provides.
CATALYST_PROJECT_ID="..."
CATALYST_CLIENT_ID="..."
CATALYST_CLIENT_SECRET="..."

# RapidAPI - IRCTC PNR Status (optional, will use mock data if not set)
RAPIDAPI_KEY="your-rapidapi-key"
RAPIDAPI_HOST="irctc-indian-railway-pnr-status.p.rapidapi.com"
RAPIDAPI_PNR_URL="https://irctc-indian-railway-pnr-status.p.rapidapi.com/getPNRStatus"
```

### 3. Start Server

```bash
# Development mode (with hot reload)
npm run dev

# Production mode
npm run build
npm start
```

Server runs at: `http://localhost:9000`

## 📚 API Endpoints

### Authentication (`/api/auth`)

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| POST | `/register` | Register new user | Public |
| POST | `/login` | Login user | Public |
| GET | `/me` | Get current user profile | Protected |
| PUT | `/password` | Update password | Protected |
| GET | `/users` | Get all users | Admin |
| PATCH | `/users/:id/role` | Update user role | Admin |
| PATCH | `/users/:id/deactivate` | Deactivate user | Admin |

### Grievances (`/api/grievances`)

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| POST | `/` | Create grievance | Staff |
| GET | `/` | List grievances (paginated) | Protected |
| GET | `/queue/verification` | Get verification queue | Admin |
| GET | `/:id` | Get grievance details | Protected |
| PUT | `/:id` | Update grievance | Protected |
| PATCH | `/:id/verify` | Verify grievance | Admin |
| PATCH | `/:id/status` | Update status | Admin |
| DELETE | `/:id` | Delete grievance | Admin |

### Visitors (`/api/visitors`)

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| POST | `/` | Log visitor | Staff |
| GET | `/` | List visitors | Protected |
| GET | `/birthdays/today` | Today's birthdays | Protected |
| GET | `/date/:date` | Visitors by date | Protected |
| GET | `/:id` | Get visitor details | Protected |
| PUT | `/:id` | Update visitor | Protected |
| DELETE | `/:id` | Delete visitor | Admin |

### News Intelligence (`/api/news`)

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| POST | `/` | Create news entry | Staff |
| GET | `/` | List news | Protected |
| GET | `/alerts/critical` | Critical alerts | Protected |
| GET | `/:id` | Get news details | Protected |
| PUT | `/:id` | Update news | Protected |
| DELETE | `/:id` | Delete news | Admin |

### Train Requests (`/api/train-requests`)

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| POST | `/` | Create train request | Staff |
| GET | `/` | List requests | Protected |
| GET | `/queue/pending` | Pending queue | Admin |
| GET | `/pnr/:pnr` | Check PNR status (IRCTC API) | Protected |
| GET | `/:id` | Get request details | Protected |
| PUT | `/:id` | Update request | Protected |
| PATCH | `/:id/approve` | Approve request | Admin |
| PATCH | `/:id/reject` | Reject request | Admin |
| DELETE | `/:id` | Delete request | Admin |

### Tour Programs (`/api/tour-programs`)

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| POST | `/` | Create tour program | Staff |
| GET | `/` | List programs | Protected |
| GET | `/schedule/today` | Today's schedule | Protected |
| GET | `/upcoming` | Upcoming events | Protected |
| GET | `/pending` | Pending decisions | Admin |
| GET | `/:id` | Get program details | Protected |
| PUT | `/:id` | Update program | Protected |
| PATCH | `/:id/decision` | Update decision | Admin |
| DELETE | `/:id` | Delete program | Admin |

### Statistics (`/api/stats`)

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| GET | `/summary` | Dashboard summary | Admin |
| GET | `/grievances/by-type` | Grievances by type | Admin |
| GET | `/grievances/by-status` | Grievances by status | Admin |
| GET | `/grievances/by-constituency` | By constituency | Admin |
| GET | `/grievances/monthly` | Monthly trends | Admin |
| GET | `/monetization` | CSR/Monetization | Super Admin |
| GET | `/recent-activity` | Recent activity | Admin |

## 🚆 IRCTC PNR Status API Integration

The backend integrates with the **IRCTC Indian Railway PNR Status API** via RapidAPI to check real PNR status.

### Setup

1. Sign up at [RapidAPI](https://rapidapi.com)
2. Subscribe to [IRCTC Indian Railway PNR Status API](https://rapidapi.com/spiderwebs0001/api/irctc-indian-railway-pnr-status)
3. Copy your API key
4. Add to `.env`:
   ```
   RAPIDAPI_KEY="your-api-key"
   RAPIDAPI_HOST="irctc-indian-railway-pnr-status.p.rapidapi.com"
   RAPIDAPI_PNR_URL="https://irctc-indian-railway-pnr-status.p.rapidapi.com/getPNRStatus"
   ```

### Usage

```bash
GET /api/train-requests/pnr/1234567890
```

### Response

```json
{
  "success": true,
  "message": "PNR status retrieved successfully",
  "data": {
    "pnrNumber": "1234567890",
    "trainNumber": "12301",
    "trainName": "Rajdhani Express",
    "dateOfJourney": "2024-02-15",
    "from": "NDLS",
    "to": "HWH",
    "class": "AC 2 Tier",
    "passengers": [...],
    "chartStatus": "CHART NOT PREPARED",
    "isMock": false
  }
}
```

> **Note:** If `RAPIDAPI_KEY` is not configured, the API returns mock data with `isMock: true`.

---

## 🔐 User Roles

1. **STAFF** - Data entry role
   - Can create: Grievances, Visitors, News, Train Requests, Tour Programs
   - Cannot verify, approve, or delete

2. **ADMIN** - Manager role
   - All Staff permissions
   - Can verify grievances
   - Can approve/reject train requests
   - Can update tour decisions
   - Can delete records
   - Access to statistics

3. **SUPER_ADMIN** - View-only oversight
   - All Admin permissions
   - Access to monetization/CSR statistics

## 🗄️ Database Management

Schema and rows live in Zoho Catalyst Data Store. Manage tables, indexes,
and security rules via the Catalyst Console; data import/export uses the
Catalyst CLI or Stratus.

## 📁 Project Structure

```
backend/
├── src/
│   ├── config/                  # Configuration & feature flags
│   ├── controllers/             # Google calendar controller (uses Catalyst client)
│   ├── controllers-catalyst/    # Catalyst-backed controllers (primary)
│   ├── lib/                     # Catalyst SDK wrapper, client, cache, stratus
│   ├── middleware/              # Auth, validation, error handling, upload
│   ├── routes/                  # API routes
│   ├── services/                # External integrations (Google)
│   ├── types/                   # TypeScript types
│   ├── utils/                   # JWT, password, pagination, PDF, response helpers
│   └── app.ts                   # Entry point
├── Dockerfile                   # AppSail container
├── package.json
└── tsconfig.json
```

## 🔧 Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start dev server with hot reload |
| `npm run build` | Build for production (tsc → compiled/) |
| `npm start` | Start production server |
| `npm test` | Run vitest test suite |
| `npm run test:watch` | Run vitest in watch mode |

## 🌐 Connecting Frontend

Update the frontend API client to connect to this backend:

```typescript
// frontend/src/lib/api.ts
import axios from 'axios';

const API = axios.create({
  baseURL: 'http://localhost:5000/api',
  withCredentials: true,
});

// Add auth token to requests
API.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default API;
```
