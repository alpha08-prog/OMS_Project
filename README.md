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

### Frontend
- **React (TypeScript)**
- **React Router v6** – client-side routing
- **Tailwind CSS** – utility-first styling
- **shadcn/ui** – accessible UI components
- **Lucide Icons** – icon set

### Styling & Design
- Indigo–Saffron color palette (government-themed)
- Gradient-based backgrounds
- Card-based layout system
- Responsive design (desktop-first, tablet-friendly)

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

## 🧩 Common Design System

### Layout Pattern
- Sidebar (left) + main content (right)
- Consistent max-width container
- Sectioned forms with headers
- Right-side action panels for workflows

### UI Features
- Mandatory fields marked with red `*`
- Subtle background gradients
- Consistent card spacing and typography
- Reusable components (e.g., `ReferencedByField`)

---

## 🔐 Routing & Role Handling

- Role-based routing implemented using `ProtectedRoute`
- Temporary UI-only routing enabled for design preview
- Planned integration with backend authentication (JWT / sessions)

**Current routes include:**
- `/staff/home`
- `/home` (Admin)
- `/super-admin/home`
- `/grievances/new`
- `/visitors/new`
- `/train-eq/new`
- `/tour-program/new`
- `/news-intelligence/new`

---

## 🧪 Current Project Status

✅ UI/UX for all core modules completed  
✅ Role-based dashboard separation implemented  
✅ Consistent design system established  
✅ Frontend routing completed  
⚠ Backend integration pending  
⚠ Data persistence pending  

---

## 🚀 Future Enhancements

- Backend API integration (Node.js / FastAPI)
- Database (PostgreSQL / MongoDB)
- Authentication using JWT
- PDF generation & digital signatures
- Role-based permissions at API level
- Analytics & reporting dashboards
- Push notifications for critical alerts
- Mobile-first optimization

---

## 📂 Project Structure (Simplified)
src/
├── components/
│   ├── layout/
│   ├── ui/
│   └── common/
├── pages/
│   ├── staff/
│   ├── admin/
│   ├── super-admin/
│   ├── grievances/
│   ├── visitors/
│   ├── Train/
│   ├── TourProgram/
│   └── news/
├── lib/
├── App.tsx
└── index.css



---

## 📝 License

This project is currently under development and intended for **academic, internship, and government office digitization purposes**.

---


---

> *This project models real-world government office workflows with a strong focus on clarity, responsibility separation, and scalability.*

