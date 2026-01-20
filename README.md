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

## �‍💼 User Roles & Dashboards

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

| Module | Features |
| :--- | :--- |
| **Grievance Management** | Petitioner details, categorization, status tracking, letter generation. |
| **Visitor Management** | Visitor logging, efficient data entry, recurring visitor tracking. |
| **Train EQ** | PNR status check, request generation, digital signature workflow. |
| **Tour Program** | Event scheduling, invitation management, calendar view. |
| **News & Intelligence** | Regional news tracking, priority alerts, screenshot/evidence upload. |

---

## 📝 License

This project is intended for **academic, internship, and government office digitization purposes**.

> *Built with modern web standards to ensure scalability, security, and a premium user experience.*
