# 🏛️ Office Management System (OMS)
### Role-Based Dashboard for Minister / MLA Office Operations

---

## 📌 Project Overview

The **Office Management System (OMS)** is a role-based web application designed to digitize and streamline the daily operational workflows of a Minister/MLA office.

The system focuses on:
- Efficient data entry by staff
- Verification, printing, and task assignment by office managers
- Monitoring, alerts, and oversight by senior authorities

The project is currently implemented as a **frontend-first system**, with a strong emphasis on **UI/UX consistency, role-based access, and real-world administrative workflows**. Backend integration is planned as future work.

---

## 🧱 Technology Stack

### Frontend Core
- **React 19.2.0** with **TypeScript 5.9.3** – Modern React with full type safety
- **Vite 7.2.4** – Fast build tool and development server
- **React Router DOM 7.10.1** – Client-side routing with protected routes
- **Zustand 5.0.9** – Lightweight state management for authentication
- **Axios 1.13.2** – HTTP client with interceptors for API calls
- **React Hook Form 7.68.0** – Performant form handling and validation

### UI & Styling
- **Tailwind CSS 3.4.19** – Utility-first CSS framework
- **shadcn/ui** – Accessible component library built on Radix UI
- **Lucide React 0.561.0** – Modern icon library
- **Recharts 3.5.1** – Charting library for data visualization
- **Sonner 2.0.7** – Toast notification system
- **React Day Picker 9.12.0** – Date picker component
- **Class Variance Authority** – Component variant management

### Development Tools
- **ESLint 9.39.1** with TypeScript ESLint – Code linting
- **PostCSS & Autoprefixer** – CSS processing
- **Babel React Compiler** – React optimization
- **TypeScript ESLint** – TypeScript-specific linting rules

### Styling & Design System
- **Indigo–Saffron color palette** (government-themed)
- **Gradient-based backgrounds** for visual depth
- **Card-based layout system** with consistent spacing
- **Responsive design** (desktop-first, tablet-friendly)
- **Rounded corners** (rounded-2xl) for modern aesthetics
- **Consistent typography** hierarchy

---

## 🧑‍💼 User Roles & Dashboards

The application supports **three distinct user roles**, each with a dedicated dashboard and responsibilities.

### 1️⃣ Staff (Data Entry Role)
**Purpose:** Fast and accurate data entry

**Dashboard Features:**
- Quick Entry actions for:
  - Grievances
  - Visitor logging
  - Train EQ requests
  - Tour program entries
  - News & intelligence entry
- Today’s work checklist
- Recently entered items (read-only)

**Restrictions:**
- No verification
- No printing
- No analytics access

---

### 2️⃣ Admin (Manager Role)
**Purpose:** Verification, printing, and task coordination

**Dashboard Features:**
- Verification queues for grievances and requests
- Letter generation and print center
- Train EQ approval workflow
- Task assignment to departments
- View pending approvals
- View recently processed entries

**Restrictions:**
- No raw data entry
- No high-level political analytics

---

### 3️⃣ Super Admin
**Purpose:** Monitoring, intelligence, and oversight

**Dashboard Features:**
- High-level overview dashboard
- Alerts and critical intelligence tracking
- Performance and workload visibility
- Strategic monitoring (future scope)

---

## 🧩 Implemented Modules

### 📄 Grievance Management
- Petitioner information
- Grievance type, ward/constituency
- Description and monetary value
- Action required and letter template
- Status tracking
- **Referenced By** field (optional)
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

### shadcn/ui Components (50+ Components)
The project uses a comprehensive set of accessible UI components from shadcn/ui:

**Layout & Navigation:**
- `Sidebar` – Collapsible sidebar navigation
- `Sheet` – Slide-over panels
- `Tabs` – Tab navigation
- `Breadcrumb` – Breadcrumb navigation
- `Navigation Menu` – Complex navigation structures

**Form Components:**
- `Input` – Text input fields
- `Textarea` – Multi-line text input
- `Select` – Dropdown select
- `Checkbox` – Checkbox input
- `Radio Group` – Radio button groups
- `Switch` – Toggle switch
- `Slider` – Range slider
- `Calendar` – Date picker
- `Input OTP` – OTP input fields
- `Form` – Form wrapper with validation

**Data Display:**
- `Card` – Container cards
- `Table` – Data tables
- `Badge` – Status badges
- `Avatar` – User avatars
- `Separator` – Visual dividers
- `Skeleton` – Loading placeholders
- `Progress` – Progress bars
- `Chart` – Chart components

**Feedback:**
- `Alert` – Alert messages
- `Toast` / `Sonner` – Toast notifications
- `Dialog` – Modal dialogs
- `Alert Dialog` – Confirmation dialogs
- `Popover` – Popover tooltips
- `Tooltip` – Hover tooltips
- `Hover Card` – Hover information cards

**Interactive:**
- `Button` – Buttons with variants
- `Dropdown Menu` – Context menus
- `Context Menu` – Right-click menus
- `Command` – Command palette
- `Menubar` – Application menu bar
- `Toggle` / `Toggle Group` – Toggle buttons
- `Accordion` – Collapsible sections
- `Collapsible` – Expandable content

**Advanced:**
- `Carousel` – Image/content carousel
- `Resizable` – Resizable panels
- `Scroll Area` – Custom scrollbars
- `Aspect Ratio` – Maintain aspect ratios

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

**Form Components:**
- `ReferencedByField` – Reusable "Referenced By" input field
- Custom form inputs with validation states
- Password strength meter
- File upload components

### Design System Principles

**Layout Pattern:**
- Sidebar (left) + main content (right) layout
- Consistent max-width container (max-w-7xl)
- Sectioned forms with clear headers
- Right-side action panels for workflows
- Responsive grid layouts

**Color Palette:**
- **Primary:** Indigo (indigo-600, indigo-700, indigo-900)
- **Accent:** Amber/Saffron (amber-400, amber-500)
- **Success:** Emerald/Green (emerald-100, emerald-700)
- **Warning:** Amber/Yellow (amber-100, amber-700)
- **Error:** Red (red-600, red-700)
- **Neutral:** Slate/Gray (slate-700, muted-foreground)

**Typography:**
- Consistent font sizes and weights
- Clear hierarchy (h1, h2, h3, body, caption)
- Proper text color contrast

**Spacing:**
- Consistent padding and margins
- Card spacing (p-4, p-5, p-6)
- Gap spacing in grids (gap-4, gap-6)

**UI Features:**
- Mandatory fields marked with red `*`
- Subtle background gradients (from-indigo-50/60 to-white)
- Consistent card styling (rounded-2xl, shadow-sm, border)
- Hover effects and transitions
- Loading states and spinners
- Error states and validation messages

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

### ⚠️ Pending Integration

- ⚠️ Backend API integration (endpoints ready in `lib/api.ts`)
- ⚠️ Database persistence
- ⚠️ Real JWT authentication (currently session-based)
- ⚠️ PDF generation functionality
- ⚠️ File upload handling
- ⚠️ Real-time data fetching
- ⚠️ Role-based API permissions
- ⚠️ Super Admin dashboard implementation  

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
- [ ] Backend API integration (Node.js / FastAPI / Express)
- [ ] Database setup (PostgreSQL / MongoDB)
- [ ] Real JWT authentication with refresh tokens
- [ ] Role-based API permissions
- [ ] File upload handling (images, documents)
- [ ] Real-time data synchronization

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

## 📝 License

This project is currently under development and intended for **academic, internship, and government office digitization purposes**.

---


---

> *This project models real-world government office workflows with a strong focus on clarity, responsibility separation, and scalability.*

