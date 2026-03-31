# 🏛️ Office Management System (OMS)
### Role-Based Dashboard for Minister / MLA Office Operations

---

## 📌 Project Overview

The **Office Management System (OMS)** is a comprehensive, full-stack role-based web application designed to digitize and streamline the daily operational workflows of a Minister/MLA office. By integrating a modern frontend with a robust backend, the system ensures efficient data handling, secure access, and streamlined administrative processes.

**Key Objectives:**
- **Efficient Data Entry:** Streamlined interfaces for staff to input grievances, visitor logs, and more.
- **Verification & Oversight:** Tools for office managers to verify entries, generate letters, and assign tasks.
- **Monitoring:** High-level dashboards for senior authorities to track performance and critical alerts.
- **Workflow Automation:** Automated PDF generation, task assignment, and tracking.

> **For deployment and client handover** (hosting, database, Zoho, Photo Booth, data schema), see **[Deployment & Client Requirements](#-deployment--client-requirements)** below.

---

## 🧱 Technology Stack

### 🎨 Frontend (User Interface)
The frontend is built for performance, accessibility, and a premium user experience.
- **Framework:** React 19 (TypeScript)
- **Build Tool:** Vite
- **Styling:** Tailwind CSS (Utility-first), Shadcn/UI (Components)
- **Routing:** React Router v6
- **State Management:** Zustand
- **Icons:** Lucide React
- **HTTP Client:** Axios

### ⚙️ Backend (API & Logic)
The backend provides a secure and scalable API to handle business logic and data persistence.
- **Runtime:** Node.js (TypeScript)
- **Framework:** Express.js
- **Database:** PostgreSQL
- **ORM:** Prisma
- **Authentication:** JWT (JSON Web Tokens)
- **PDF Generation:** PDFKit
- **External APIs:** RapidAPI (IRCTC PNR Status)

---

## 📂 Project Structure

```bash
OMS_Project/
├── frontend/             # React Client Application
│   ├── src/
│   │   ├── components/   # UI & Layout components
│   │   ├── pages/        # Route pages (Admin, Staff, etc.)
│   │   ├── lib/          # Utilities & helpers
│   │   └── ...
│   └── ...
├── backend/              # Node.js Express API
│   ├── src/
│   │   ├── controllers/  # Request handlers
│   │   ├── routes/       # API endpoints
│   │   ├── middleware/   # Auth & Validation
│   │   ├── prisma/       # DB Schema & Seeders
│   │   └── ...
│   └── ...
└── README.md             # Project Documentation
```

---

## 🛠️ Setup & Installation

### Prerequisites
- Node.js (v18 or higher)
- PostgreSQL (Local or Cloud like Supabase/Neon)

### 1️⃣ Clone the Repository
```bash
git clone <repository-url>
cd OMS_Project
```

### 2️⃣ Backend Setup
Navigate to the backend folder and install dependencies:
```bash
cd backend
npm install
```

**Configuration:**
1. Create a `.env` file based on the template:
   ```bash
   cp env.template .env
   ```
2. Update the `.env` file with your credentials:
   - `DATABASE_URL`: Your PostgreSQL connection string.
   - `JWT_SECRET`: A secure key for authentication.
   - `RAPIDAPI_KEY`: Key for IRCTC PNR status (optional).

**Database Initialization:**
```bash
# Push schema to database
npx prisma db push

# (Optional) Seed initial data
npm run seed
```

**Run Backend:**
```bash
npm run dev
```
*Server runs on `http://localhost:5000` by default.*

### 3️⃣ Frontend Setup
Open a new terminal, navigate to the frontend folder, and install dependencies:
```bash
cd frontend
npm install
```

**Configuration:**
Ensure the frontend is pointing to the correct backend URL (usually configured in `.env` or constants).

**Run Frontend:**
```bash
npm run dev
```
*Client runs on `http://localhost:5173` by default.*

---

## �‍💼 👥 User Roles & Dashboards

The application features three distinct roles with specific permissions:

### 1️⃣ Staff (Data Entry)
- **Focus:** Fast, accurate data entry.
- **Features:**
  - Quick entry for Grievances, Visitors, EQ Requests, etc.
  - View "Today’s Work" checklist.
  - Read-only view of recent submissions.
- **Restrictions:** Cannot verify or analytics data.

### 2️⃣ Admin (Manager)
- **Focus:** Verification, processing, and assignment.
- **Features:**
  - Verification queues for different modules.
  - Letter generation & print center.
  - Task assignment to specific departments.
  - Approval workflows.
- **Restrictions:** No high-level political analytics.

### 3️⃣ Super Admin (Authority)
- **Focus:** Oversight and intelligence.
- **Features:**
  - comprehensive dashboards.
  - Critical alerts and intelligence tracking.
  - System-wide performance monitoring.

---

## 🧩 Implemented Modules


### 📄 Grievance Management
- Petitioner information
- Grievance type, ward/constituency
- Description and monetary value
- Action required and letter template
- Status tracking
- **Referenced By** field
- Mandatory field indicators

---

### 🚶 Visitor Management
- Visitor details and designation
- Date of birth (for birthday alerts)
- Purpose of visit
- **Referenced By** field
- Clean, compact data-entry UI

---

### 🚆 Train Emergency Quota (EQ)
- Passenger details and PNR
- Auto-fill placeholders for train info
- Journey date, class, route
- Digital signature option
- PDF generation button
- **Referenced By** field

---

### 🗓️ Tour Program & Invitations
- Event and organizer details
- Date, time, and venue
- Accept / Regret / Pending decision
- Export Tour Program as PDF
- **Referenced By** field

---

### 📰 Constituency News & Intelligence
- Headline and category
- Region/ward selection
- Priority levels (Normal / High / Critical)
- Source information
- Screenshot/evidence upload
- **Referenced By** field
- Push-alert ready structure

---

## 🎨 UI Component Library & Design System

### Custom Components

**Layout Components:**
- `DashboardSidebar` – Collapsible sidebar with navigation menu
  - Logo and branding
  - Icon-based menu items
  - Active route highlighting
  - Collapse/expand functionality
  - Logout button
- `DashboardHeader` – Top navigation bar
- `GovernmentHeroSection` – Hero section for auth pages

**Dashboard Widgets:**
- `QuickActions` – Grid of action buttons for common tasks
- `StatsCard` – Statistical display cards with trends
- `GrievanceChart` – Chart visualization for grievance data
- `RecentGrievances` – List of recent grievance entries
- `NewsAlerts` – News and intelligence alerts widget
- `BirthdayWidget` – Today's birthdays display
- `TodaySchedule` – Schedule/calendar widget

---

## 🔐 Authentication & Routing

### Authentication System
- **Protected Route Component** (`ProtectedRoute.tsx`) – Route guard implementation
- **Auth State Management** – Zustand store for user session and tokens
- **Session Storage** – Temporary session-based authentication (ready for backend integration)
- **Local Storage** – Support for "Remember Me" functionality
- **Auth API Client** – Axios-based API client with interceptors (`lib/api.ts`)
- **Form Validation** – Client-side validation for login/signup (`lib/validation.ts`)

### Authentication Pages
- **Login Page** (`/auth/login`) – Email/phone + password authentication
- **Signup Page** (`/auth/signup`) – User registration with validation
- **Forgot Password** (`/auth/forgot-password`) – Password recovery flow
- **OTP Verification** (`/auth/otp`) – One-time password verification

### Custom Auth Components
- `PasswordInput` – Secure password input with show/hide toggle
- `PasswordStrengthMeter` – Real-time password strength indicator
- `Input` & `TextInput` – Reusable form inputs with validation
- `Checkbox` – Custom checkbox component
- `Spinner` – Loading state indicator
- `Toast` – Toast notification system with provider

### Routing & Navigation
- **Role-based routing** implemented using `ProtectedRoute` wrapper
- **React Router v7** with nested route support
- **Programmatic navigation** using `useNavigate` hook
- **Active route highlighting** in sidebar navigation
- **Fallback routing** to login for unauthenticated users

**Implemented Routes:**
- `/` → Redirects to `/auth/login`
- `/auth/login` – Login page
- `/auth/signup` – Signup page
- `/auth/forgot-password` – Password recovery
- `/auth/otp` – OTP verification
- `/home` – Admin dashboard (protected)
- `/staff/home` – Staff dashboard
- `/admin/home` – Admin dashboard
- `/grievances/new` – Create grievance (protected)
- `/grievances/verify` – Grievance verification queue
- `/visitors/new` – Log visitor (protected)
- `/train-eq/new` – Train EQ request (protected)
- `/train-eq/queue` – Train EQ approval queue
- `/tour-program/new` – Create tour program (protected)
- `/news-intelligence/new` – News entry (protected)
- `/admin/print-center` – Letter printing center
- `*` → Fallback to login

---

## 📋 Frontend Implementation Details

### ✅ Completed Features

#### 1. **Project Setup & Configuration**
- ✅ Vite + React + TypeScript project initialized
- ✅ Path aliases configured (`@/*` → `src/*`)
- ✅ Tailwind CSS configured with custom theme
- ✅ ESLint and TypeScript strict mode enabled
- ✅ All dependencies installed and configured
- ✅ React Router with BrowserRouter setup
- ✅ Toast notification provider integrated

#### 2. **Authentication System**
- ✅ Complete authentication UI (Login, Signup, Forgot Password, OTP)
- ✅ Form validation with custom validators
- ✅ Password strength meter
- ✅ Protected route wrapper component
- ✅ Auth state management with Zustand
- ✅ Session storage integration
- ✅ API client setup with Axios interceptors
- ✅ Error handling and toast notifications

#### 3. **Layout & Navigation**
- ✅ Responsive sidebar with collapse functionality
- ✅ Active route highlighting
- ✅ Icon-based navigation menu
- ✅ Dashboard header component
- ✅ Government-themed hero section
- ✅ Consistent page layouts across all routes

#### 4. **Role-Based Dashboards**

**Staff Dashboard (`/staff/home`):**
- ✅ Quick entry action buttons (5 modules)
- ✅ Today's work checklist
- ✅ Recently entered items display
- ✅ Role badge indicator
- ✅ Clean, focused data-entry interface

**Admin Dashboard (`/admin/home`):**
- ✅ Primary action cards (4 key functions)
- ✅ Pending approvals list
- ✅ Recently processed items
- ✅ Quick access to verification queues
- ✅ Print center access

**Main Dashboard (`/home`):**
- ✅ Quick actions grid
- ✅ Statistics cards with trends
- ✅ Grievance chart visualization
- ✅ Recent grievances list
- ✅ News alerts widget
- ✅ Birthday widget
- ✅ Today's schedule widget

#### 5. **Data Entry Forms**

**Grievance Management (`/grievances/new`):**
- ✅ Complete form with all required fields
- ✅ Petitioner information section
- ✅ Grievance type and ward selection
- ✅ Description and monetary value
- ✅ Action required field
- ✅ Referenced By field
- ✅ Mandatory field indicators
- ✅ Form validation

**Visitor Management (`/visitors/new`):**
- ✅ Visitor details form
- ✅ Designation and contact info
- ✅ Date of birth (for birthday tracking)
- ✅ Purpose of visit
- ✅ Referenced By field
- ✅ Clean, compact UI

**Train EQ (`/train-eq/new`):**
- ✅ Passenger details form
- ✅ PNR number input
- ✅ Journey details (date, class, route)
- ✅ Auto-fill placeholders
- ✅ Digital signature option
- ✅ PDF generation button (UI ready)
- ✅ Referenced By field

**Tour Program (`/tour-program/new`):**
- ✅ Event and organizer details
- ✅ Date, time, and venue
- ✅ Accept/Regret/Pending decision
- ✅ Export to PDF button (UI ready)
- ✅ Referenced By field

**News & Intelligence (`/news-intelligence/new`):**
- ✅ Headline and category
- ✅ Region/ward selection
- ✅ Priority levels (Normal/High/Critical)
- ✅ Source information
- ✅ Screenshot/evidence upload
- ✅ Referenced By field

#### 6. **Admin Management Pages**

**Grievance Verification (`/grievances/verify`):**
- ✅ Verification queue interface
- ✅ Review and approval workflow
- ✅ Status management

**Train EQ Queue (`/train-eq/queue`):**
- ✅ Request queue display
- ✅ Approval workflow
- ✅ Letter generation access

**Print Center (`/admin/print-center`):**
- ✅ Letter printing interface
- ✅ Document management
- ✅ Print queue

#### 7. **State Management**
- ✅ Zustand store for authentication
- ✅ User state and token management
- ✅ Auth actions (setAuth, clear)
- ✅ Type-safe state with TypeScript

#### 8. **Form Validation**
- ✅ Email validation
- ✅ Phone number validation (10 digits)
- ✅ Password strength validation
- ✅ Full name validation
- ✅ Identifier validation (email or phone)
- ✅ Password matching validation
- ✅ Real-time validation feedback

#### 9. **UI/UX Features**
- ✅ Loading states and spinners
- ✅ Error handling and display
- ✅ Toast notifications
- ✅ Form validation messages
- ✅ Responsive design
- ✅ Hover effects and transitions
- ✅ Consistent color scheme
- ✅ Accessible components (ARIA labels)

#### 10. **Code Quality**
- ✅ TypeScript strict mode
- ✅ ESLint configuration
- ✅ Consistent code formatting
- ✅ Component reusability
- ✅ Type-safe API client
- ✅ Error boundary ready structure

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ and npm
- Modern web browser

### Installation

1. **Navigate to frontend directory:**
   ```bash
   cd OMS_Project/frontend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start development server:**
   ```bash
   npm run dev
   ```

4. **Build for production:**
   ```bash
   npm run build
   ```

5. **Preview production build:**
   ```bash
   npm run preview
   ```

6. **Run linter:**
   ```bash
   npm run lint
   ```

### Development Notes

- The app runs on `http://localhost:5173` (default Vite port)
- Authentication is currently session-based (ready for backend integration)
- All forms are functional with client-side validation
- API endpoints are defined in `src/lib/api.ts` (ready for backend connection)

## 🚀 Future Enhancements

### Backend Integration
- [x] Backend API (Node.js / Express) and PostgreSQL with Prisma
- [x] JWT authentication and role-based access (Staff, Admin, Super Admin)
- [ ] File upload to object storage (news images, grievance attachments); URLs stored in DB
- [ ] Real-time notifications (e.g. Zoho Cliq / email)

### Features
- [ ] PDF generation & digital signatures
- [ ] Email notifications
- [ ] Push notifications for critical alerts
- [ ] Advanced analytics & reporting dashboards
- [ ] Export functionality (Excel, PDF)
- [ ] Search and filtering capabilities
- [ ] Bulk operations
- [ ] Audit logs

### UI/UX Improvements
- [ ] Mobile-first optimization
- [ ] Dark mode support
- [ ] Accessibility improvements (WCAG compliance)
- [ ] Performance optimization
- [ ] Progressive Web App (PWA) support
- [ ] Offline functionality

---

## 📂 Detailed Project Structure

```
frontend/
├── src/
│   ├── components/
│   │   ├── auth/
│   │   │   └── ProtectedRoute.tsx          # Route guard component
│   │   ├── AuthForm/
│   │   │   ├── Checkbox.tsx                # Custom checkbox
│   │   │   ├── Input.tsx                   # Text input component
│   │   │   ├── PasswordInput.tsx           # Secure password input
│   │   │   ├── PasswordStrengthMeter.tsx   # Password strength indicator
│   │   │   ├── Spinner.tsx                 # Loading spinner
│   │   │   └── Toast.tsx                   # Toast notification system
│   │   ├── common/
│   │   │   └── ReferencedByField.tsx       # Reusable referenced by field
│   │   ├── dashboard/
│   │   │   ├── BirthdayWidget.tsx          # Birthday display widget
│   │   │   ├── GrievanceChart.tsx          # Chart visualization
│   │   │   ├── NewsAlerts.tsx              # News alerts widget
│   │   │   ├── QuickActions.tsx            # Quick action buttons
│   │   │   ├── RecentGrievances.tsx        # Recent grievances list
│   │   │   ├── StatsCard.tsx               # Statistics display card
│   │   │   └── TodaySchedule.tsx           # Schedule widget
│   │   ├── layout/
│   │   │   ├── DashboardHeader.tsx         # Top navigation header
│   │   │   └── DashboardSidebar.tsx        # Collapsible sidebar
│   │   ├── ui/                             # 50+ shadcn/ui components
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── input.tsx
│   │   │   ├── form.tsx
│   │   │   ├── table.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── toast.tsx
│   │   │   └── ... (40+ more components)
│   │   └── GovernmentHeroSection.tsx       # Auth page hero
│   ├── pages/
│   │   ├── Auth/
│   │   │   ├── Login.tsx                    # Login page
│   │   │   ├── Signup.tsx                   # Signup page
│   │   │   ├── ForgotPassword.tsx           # Password recovery
│   │   │   └── OTP.tsx                      # OTP verification
│   │   ├── admin/
│   │   │   ├── AdminHome.tsx                # Admin dashboard
│   │   │   ├── GrievienceVerification.tsx   # Grievance verification
│   │   │   ├── PrintCenter.tsx              # Print center
│   │   │   └── TrainEQQueue.tsx             # Train EQ queue
│   │   ├── staff/
│   │   │   └── StaffHome.tsx                # Staff dashboard
│   │   ├── grievances/
│   │   │   └── GrievanceCreate.tsx          # Create grievance form
│   │   ├── visitors/
│   │   │   └── VisitorCreate.tsx            # Visitor entry form
│   │   ├── Train/
│   │   │   └── TrainEQCreate.tsx            # Train EQ form
│   │   ├── Tour/
│   │   │   └── TourProgramCreate.tsx        # Tour program form
│   │   ├── News/
│   │   │   └── NewsIntelligenceCreate.tsx   # News entry form
│   │   └── Home.tsx                         # Main dashboard
│   ├── lib/
│   │   ├── api.ts                           # API client & types
│   │   ├── utils.ts                         # Utility functions
│   │   └── validation.ts                    # Form validators
│   ├── stores/
│   │   └── auth.ts                          # Zustand auth store
│   ├── hooks/
│   │   ├── use-mobile.ts                    # Mobile detection hook
│   │   └── use-toast.ts                     # Toast hook
│   ├── types/
│   │   └── auth.ts                          # Auth type definitions
│   ├── assets/                              # Images and static assets
│   ├── App.tsx                              # Main app component with routes
│   ├── main.tsx                             # Application entry point
│   ├── index.css                            # Global styles
│   └── tailwind.css                         # Tailwind imports
├── public/
│   └── robots.txt
├── package.json                             # Dependencies
├── tsconfig.json                            # TypeScript config
├── tsconfig.app.json                        # App-specific TS config
├── vite.config.ts                           # Vite configuration
├── tailwind.config.ts                       # Tailwind configuration
└── eslint.config.js                         # ESLint configuration
```


---

## 📋 Deployment & Client Requirements

This section is for **client handover and deployment**. It describes what the client must provide, how data is stored, and what is required to run OMS in production (including Zoho and Photo Booth).

---

### 1. What This Project Does (Summary of Delivered Work)

| Area | Delivered |
|------|-----------|
| **Roles** | Super Admin, Admin, Staff – each with separate dashboards and permissions. |
| **Modules** | Grievances, Visitors, Train EQ, Tour Programs, News & Intelligence, Birthdays, Task Assignment, Action Center, Print Center, History. |
| **Super Admin** | Dashboard at `/home`: stats from DB, search (grievances + visitors) with result detail in a dialog (no redirect to admin pages), notification badge from pending counts, Today’s Tour, Recent Grievances, News, Birthdays, Grievance chart. No “View All” on Recent Grievances. |
| **Admin** | Action Center: single “Verify and Assign to Staff” for grievances, train EQ, tour programs (create task + verify/approve/accept). Train EQ Queue & Tour Program Queue use the same flow. Reject/Regret kept separate. |
| **Data entry** | Staff/Admin create grievances, visitors, train requests, tour programs, news, birthdays. All stored in PostgreSQL via Prisma. |
| **Backend** | Node.js + Express + Prisma + JWT. Stats, grievance/visitor search, PDF generation, IRCTC PNR (RapidAPI). |
| **Photo Booth** | Frontend only (public search + employee archive). Events and photos are **mock**; backend/DB for photos not implemented yet. |

---

### 2. Requirements from the Client for Deployment

The client (or their IT/vendor) must provide the following in **detail** before production deployment.

#### 2.1 Hosting & Domains

| Requirement | Details to provide |
|-------------|--------------------|
| **Frontend hosting** | Where will the React app be hosted? (e.g. Zoho Sites, Vercel, Netlify, own server). Base URL (e.g. `https://oms.example.gov.in`). |
| **Backend hosting** | Where will the Node.js API run? (e.g. Zoho Catalyst, own VPS, AWS/GCP). Base URL (e.g. `https://api.oms.example.gov.in`). |
| **Domain & SSL** | Production domain(s), who manages DNS, and that HTTPS (SSL) is enabled. |
| **Environment** | Confirm production vs staging URLs and that frontend `.env` (e.g. `VITE_API_URL`) and backend `.env` are set for the correct environment. |

#### 2.2 Database (PostgreSQL)

| Requirement | Details to provide |
|-------------|--------------------|
| **Provider** | Which PostgreSQL service? (e.g. Zoho Catalyst DB, Neon, Supabase, AWS RDS, self-hosted). |
| **Connection string** | Production `DATABASE_URL` (with username, password, host, port, database name, SSL if required). **Never commit this to git.** |
| **Access** | Who can create DB, run migrations, and backup? IP allowlist or VPN if applicable. |
| **Backups** | Automated backup frequency, retention (e.g. 30 days), and restore process. |
| **Scaling** | Expected number of concurrent users and rows per table (grievances, visitors, etc.) so that connection pooling and plan size can be chosen. |

#### 2.3 Secrets & API Keys

| Requirement | Details to provide |
|-------------|--------------------|
| **JWT_SECRET** | Strong random string (e.g. 32+ chars) for signing tokens. Must be different from dev and kept secret. |
| **RapidAPI (Train EQ)** | If PNR status is used: RapidAPI key and host for IRCTC API. Quota and renewal. |
| **File storage (if any)** | If news images or other files are stored externally: bucket/credentials (e.g. Zoho Storage, S3). |

#### 2.4 Users & Access

| Requirement | Details to provide |
|-------------|--------------------|
| **Initial users** | List of initial Super Admin / Admin / Staff: name, email, role. We can seed via `npm run seed` or a one-time script. |
| **Password policy** | Whether to enforce strong passwords, expiry, or SSO later (e.g. Zoho). |
| **Network** | If the app is only for office network: VPN or IP allowlist for frontend/backend/DB. |

---

### 3. Data-Entry Schema & Where Data Is Stored

All transactional data is stored in **PostgreSQL** via **Prisma**. Schema is in `backend/prisma/schema.prisma`.

#### 3.1 High-Level Flow

1. **Staff/Admin** logs in → JWT issued → uses forms (Grievance, Visitor, Train EQ, Tour, News, Birthday).
2. **Frontend** sends POST to backend API (e.g. `/api/grievances`, `/api/visitors`).
3. **Backend** validates, then Prisma writes to PostgreSQL.
4. **Admin** uses Action Center / queues to verify, assign tasks, approve/reject.
5. **Super Admin** sees dashboard and search; no redirect to admin-only pages from search.

#### 3.2 Main Tables (Data-Entry → Storage)

| Module | Primary table | Key fields (summary) | Who enters |
|--------|----------------|----------------------|------------|
| **Users** | `users` | name, email, phone, password (hashed), role (STAFF/ADMIN/SUPER_ADMIN) | Seeded / Admin (signup if enabled) |
| **Grievances** | `grievances` | petitionerName, mobileNumber, constituency, grievanceType, description, monetaryValue, actionRequired, status, isVerified, createdById | Staff/Admin |
| **Visitors** | `visitors` | name, designation, phone, dob, purpose, visitDate, createdById | Staff/Admin |
| **Train EQ** | `train_requests` | passengerName, pnrNumber, contactNumber, train/journey details, status (PENDING/APPROVED/REJECTED), createdById | Staff/Admin |
| **Tour Programs** | `tour_programs` | eventName, organizer, dateTime, venue, decision (PENDING/ACCEPTED/REGRET), createdById | Staff/Admin |
| **News** | `news_intelligence` | headline, category, priority, mediaSource, region, imageUrl, createdById | Staff/Admin |
| **Birthdays** | `birthdays` | name, phone, dob, relation, createdById | Staff/Admin |
| **Tasks** | `task_assignments` | title, taskType, referenceId/referenceType, assignedToId, status, dueDate | Admin (via Action Center / assign flow) |
| **History** | `audit_logs` (if used) | userId, action, entityType, entityId, oldData, newData | Backend (automated) |

#### 3.3 Where Files Are Stored Today

| Data type | Current storage | Note |
|-----------|------------------|------|
| **News image** | `news_intelligence.imageUrl` (string) | URL or path; actual file storage (e.g. S3/Zoho) must be configured. |
| **Grievance attachment** | Optional field in schema | Backend can be extended to upload to object storage and store URL. |
| **PDFs (letters)** | Generated on-demand | PDFKit; not persisted as files unless you add a step to save to storage. |

For deployment, the client must decide: **where to store uploaded files** (e.g. Zoho Storage, S3) and provide credentials; then backend can be wired to upload and save URLs in the DB.

---

### 4. Zoho Services for Deployment & Database

If the client is considering **Zoho** for deployment and database:

| Zoho service | Use in OMS | What client must do |
|--------------|------------|----------------------|
| **Zoho Catalyst** | Backend (Node.js) and/or PostgreSQL | Create Catalyst project, get DB connection string, set env vars (DATABASE_URL, JWT_SECRET, etc.), deploy backend (e.g. via Git). |
| **Zoho Creator / Zoho DB** | Alternative to PostgreSQL | If they prefer Zoho DB, the app would need a different backend layer (API that talks to Zoho) or migration of schema to Zoho; current codebase expects PostgreSQL. |
| **Zoho Sites / Zoho PageSense** | Frontend hosting | Build React app (`npm run build`), upload static output or connect Git; set `VITE_API_URL` to the backend URL. |
| **Zoho Vault** | Secrets | Store JWT_SECRET, DATABASE_URL, API keys; inject into Catalyst or CI/CD. |
| **Zoho Cliq / Mail** | Notifications (future) | For alerts/mail, backend would call Zoho APIs; not implemented yet. |

**Important:** Current OMS backend is written for **PostgreSQL** (Prisma). For Zoho deployment:

- Use **Zoho Catalyst** with PostgreSQL add-on (or external Neon/Supabase) and keep existing backend as-is, **or**
- If the client insists on Zoho Creator/DB only, a separate integration/migration project is needed (schema mapping, new API or adapters).

Document the chosen option (Catalyst + PostgreSQL vs Zoho Creator) and who will configure DB, env, and backups.

---

### 5. Photo Booth – Requirements & Future Work

The **Photo Booth** in OMS has two parts:

- **Public** (`/photo-booth`, `/photo-booth/public`): User uploads a selfie → “Find my photos” (currently **mock**: no real face recognition, no real backend).
- **Employee** (`/photo-booth/employee`): Browse events and photos (currently **mock** events and photo list).

To make Photo Booth production-ready and support **multi-user**, **long-term storage**, and **retrieval 5+ years later** with **event / year / date** filters, the following is required.

#### 5.1 Functional Requirements (Photo Booth)

| Requirement | Description |
|-------------|-------------|
| **Event creation** | Admin/Staff can create “events” (name, date, venue, optional description). Each event has a unique ID. |
| **Photo upload** | Staff upload photos per event (one or many). Metadata: eventId, captured/upload time, optional caption. |
| **Storage** | Photos stored in **object storage** (e.g. S3, Zoho Storage, Azure Blob), not in DB. DB stores only metadata and file URL/path. |
| **Public search** | User uploads selfie → backend runs face-matching (e.g. face embedding + similarity) against stored event photos → returns list of photos (with event, date) where the person appears. |
| **Filters** | Search/browse by **event**, **year**, **date range**. So “show my photos from event X” or “from year 2024” or “from 1 Jan 2025 to 31 Mar 2025”. |
| **Long-term** | Storage and DB records must be retained for **at least 5 years** (policy/backup/archival). |
| **Multi-user** | Many users can search at the same time; many staff can upload; no single-user assumption. |

#### 5.2 Database Requirements for Photo Booth

A dedicated schema is needed (e.g. in the same PostgreSQL DB or documented for the client):

| Table | Purpose |
|-------|---------|
| **events** | id, name, eventDate, venue, description, createdById, createdAt. Index on eventDate (for year/date filters). |
| **event_photos** | id, eventId (FK), fileUrl (or storage path), fileSize, mimeType, uploadedAt, uploadedById, optional caption. Index on eventId, uploadedAt. |
| **face_embeddings** (optional) | For face search: photoId, embedding (array/vector), person label if needed. Requires vector extension (e.g. pgvector) if face search is in DB. |

- **Scalability:** Indexes on `eventId`, `eventDate`, `uploadedAt` so that “photos by event”, “events by year/date”, and “recent uploads” are fast even with millions of rows.
- **Concurrency:** Normal connection pooling (e.g. Prisma + PgBouncer) is enough for many concurrent users if queries are indexed.

#### 5.3 Photo Storage Requirements (Object Storage)

| Requirement | Details |
|-------------|---------|
| **Durability** | Object storage with high durability (e.g. S3/Zoho Storage) so files are not lost. |
| **Structure** | Suggested path: `photos/{eventId}/{year}/{photoId}.jpg` (or similar) so that lifecycle/archival by year is easy. |
| **Size & format** | Max file size per photo (e.g. 10 MB), allowed types (e.g. JPEG, PNG). Backend should validate and optionally resize. |
| **Access** | Photos can be served via signed URLs (private) or public URLs, depending on policy. |
| **Retention** | Configure retention/archival so that photos are kept for **at least 5 years** (and optionally moved to cold storage after 1–2 years). |
| **Backup** | Backup strategy for object storage (e.g. cross-region replication, periodic backup to another bucket). |

#### 5.4 What the Client Must Decide (Photo Booth)

- **Face recognition:** Use a third-party API (e.g. AWS Rekognition, Azure Face) or self-hosted model? Who pays and what are privacy policies?
- **Storage provider:** S3, Zoho Storage, or other? Credentials and bucket naming.
- **Retention policy:** Minimum 5 years; any longer? Archive vs delete.
- **Privacy/consent:** Consent for storing photos and for face search; disclaimer on public search page.

Photo Booth in the repo is **UI + mock data only**. Backend APIs (event CRUD, photo upload, search by event/date/year, and optional face search) and object storage integration are **not implemented** and must be scoped as a separate phase with the client.

---

### 6. Database Requirements (Overall – Scalable, Multi-User)

These apply to the **existing** OMS modules and, when built, to Photo Booth.

| Requirement | Details |
|-------------|---------|
| **Engine** | PostgreSQL 14+ (recommended). Compatible with Prisma and common cloud providers. |
| **Connection limits** | Support at least 20–50 concurrent connections (typical for 10–50 active users). Use connection pooling (e.g. PgBouncer) if connections exceed DB limit. |
| **Backups** | Daily automated backups; retention at least 30 days. Point-in-time recovery (PITR) if critical. |
| **Migrations** | All schema changes via Prisma migrations (`npx prisma migrate deploy`) in production. No ad-hoc SQL without a migration. |
| **Indexes** | Already defined in `schema.prisma` (e.g. grievance status/type, visitor visitDate, task assignedToId). Add indexes for any new query patterns (e.g. Photo Booth eventDate, eventId). |
| **Security** | DB user with least privilege (read/write to app schema only). No superuser in app. SSL/TLS for connections in production. |
| **Scaling** | Vertical: increase instance size as row counts grow. Horizontal: read replicas for reporting later if needed. For Photo Booth, keep large blobs in object storage, not in DB. |

The client should provide: **DB provider, connection string, backup/restore process, and who is responsible for running migrations and monitoring.**

---

### 7. Deployment Checklist (What You Need to Go Live)

- [ ] **Hosting:** Frontend and backend URLs decided; SSL enabled.
- [ ] **Database:** PostgreSQL provisioned; `DATABASE_URL` set in backend; migrations run; backups configured.
- [ ] **Secrets:** `JWT_SECRET` (and any API keys) set in production; not in git.
- [ ] **Env:** Frontend `VITE_API_URL` points to production backend; backend `.env` has production values.
- [ ] **Users:** Initial Super Admin/Admin/Staff created (seed or script).
- [ ] **File storage (if used):** Bucket and credentials for news images / grievance attachments; backend wired to upload and save URL.
- [ ] **Photo Booth (if required):** Events + photos schema and object storage designed; face search and retention policy agreed; implementation scoped and scheduled.
- [ ] **Zoho (if used):** Catalyst (and/or Sites) configured; DB and secrets in Vault; responsibilities documented.

---

## 📝 License

This project is intended for **academic, internship, and government office digitization purposes**.

> *Built with modern web standards to ensure scalability, security, and a premium user experience.*
