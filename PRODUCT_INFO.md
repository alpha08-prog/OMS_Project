# OMS — Office Management System

## 1. Product Overview

**Product Name:** OMS (Office Management System)
**Version:** 1.0
**Purpose:** A comprehensive digital platform for managing government / Member of Parliament (MP) office operations — grievances, visitors, tour programs, train requests, news alerts, birthdays, events, and internal workflows — in one unified system.

**Vision:** To leverage technology for transparency and efficiency in government operations by simplifying workflows, improving accountability, and enhancing public service delivery.

**Platforms:**
- **Mobile App:** Flutter (Android + iOS) — Material design on Android, Cupertino design on iOS
- **Web Dashboard:** React + Tailwind CSS
- **Backend:** Node.js + PostgreSQL

---

## 2. User Roles

OMS uses a three-tier role-based access system:

| Role | Description | Key Capabilities |
|---|---|---|
| **STAFF** | Front-desk / data-entry users | Create grievances, log visitors, add news, invitations, train requests, view own history |
| **ADMIN** | Office administrator | Verify and manage all submissions, run action center, manage users, full edit/approve rights |
| **SUPER_ADMIN** | Top-level oversight | All admin rights + view-only Super Admin hubs for events, tours, dashboards |

---

## 3. Core Modules

### 3.1 Grievance Management
The flagship module — handles public grievances end-to-end.
- **Submission types:** Public Grievance, Office Grievance, Old (historical) Grievance
- **11-stage tracking pipeline:** Received → Under Review → Forwarded to Department → Department Processing → Awaiting Response → Response Received → Letter Generated → Letter Sent → Follow-Up → Completed → Closed
- **Status states:** Open, In Progress, Closed
- **Letter generation:** built-in letter template engine with in-app HTML preview
- **Verification queue** for admins to approve/reject staff submissions
- **Rejected grievances** view for staff to track returned items
- **Complete & Lock** action freezes a grievance after resolution
- **Tracking history** with department, officer name, file location, remarks per update

### 3.2 Visitor Management
- Staff log walk-in visitors with purpose, contact details, and photo
- Admins see full visitor list, filterable and exportable

### 3.3 Tour Programs & Events
- **Staff:** Submit invitation requests, file post-event reports
- **Admin:** Tour queue to accept / reject / schedule programs
- **Super Admin:** Hubs for Today's Events / Upcoming Events / All Events and the same for Tour Programs (view-only oversight)

### 3.4 Train EQ (Emergency Quota) Requests
- Staff submit train ticket requests on behalf of constituents (PNR, passenger details, journey info)
- Admin Train Queue for verification and approval

### 3.5 News Intelligence
- Staff add news articles / alerts relevant to the constituency
- Admin reviews and pushes Critical News Alerts to the home dashboard
- Categorized feed visible to relevant roles

### 3.6 Birthday Tracker
- Staff add birthdays of constituents / key contacts
- Admin & Super Admin see Today's Birthdays widget + full directory filterable by month and name

### 3.7 Tasks
- Admins assign tasks to staff
- Staff view their own task list and mark them done

### 3.8 Action Center (Admin)
A consolidated control panel containing:
- Verification Queue (grievances)
- Train EQ Queue
- Tour Queue
- Print Center (batch letter printing)
- User Management (create / edit / disable users, assign roles)
- Action History (audit log of all admin decisions)
- View Birthdays directory

### 3.9 Calendar
- Unified calendar showing tour programs, events, follow-ups, and key dates
- Role-aware: each role sees relevant entries

### 3.10 Notifications
- In-app notification bell with unread count
- Real-time alerts for new grievances, queue items, approvals, rejections

### 3.11 History
- Staff: personal activity log (own submissions and their statuses)
- General history page (role-aware) for cross-module audit trail

### 3.12 Profile & Settings
- My Profile (view / edit personal info, avatar)
- Change Password (secure flow)
- Dark / Light theme toggle
- About page (team, vision, version)

---

## 4. Technical Features

- **Platform-adaptive UI:** automatically switches between Material (Android) and Cupertino (iOS) widgets
- **Secure authentication:** token-based login, encrypted storage (flutter_secure_storage), automatic logout on 401
- **Theming:** Light and Dark mode with persistent user preference
- **File uploads:** Images (camera/gallery) and PDFs supported
- **In-app document viewer:** PDF preview, HTML letter rendering
- **Offline-friendly error handling:** clear messages for "no internet / server error"
- **Charts & analytics:** fl_chart-powered dashboards for grievance status, pending actions, etc.
- **Role-aware navigation:** every entry point checks the user's role and routes them to the correct screen (e.g., Staff → "Add Invitation" form; Admin → "Tour Queue")
- **Backend response envelope:** all API responses follow `{success, message, data}` for consistent error handling

---

## 5. Dashboard at a Glance

The home screen adapts to the user's role:

- **Staff:** Welcome banner, rejected-grievances alert, quick-action buttons, today's birthdays, news alerts
- **Admin:** Stats cards (Total / Open / In Progress / Resolved grievances), Pending actions (Train + Tour + Verification queue counts), birthdays, recent grievances, critical news
- **Super Admin:** Tour Program card, Grievance Status pie chart, Recent Grievances list, Today's Birthdays — all view-only oversight widgets

---

## 6. Frequently Asked Questions

**Q. Who can submit a grievance?**
Any STAFF member through Public Grievance, Office Grievance, or Old Grievance forms. ADMINs and above review and verify them.

**Q. What does "Complete & Lock" do?**
Marks the grievance as resolved and prevents any further modifications. This is irreversible from the app.

**Q. Can a staff member edit a grievance after submitting?**
Only until the admin verifies it. After verification, only admins can update status/stage.

**Q. What happens to rejected grievances?**
They appear in the Staff's "Rejected Grievances" list with the admin's reason for rejection, so the staff can re-submit or correct.

**Q. How are letters generated?**
Each grievance can be linked to a letter template. The system fills in petitioner details, generates the letter, and admins can print in batches via the Print Center.

**Q. Is the data secure?**
Yes — tokens are stored in encrypted device storage, all API calls are authenticated, and sessions auto-expire on inactivity.

**Q. What if I forget my password?**
Use the Change Password screen if logged in. Otherwise, contact your office admin who can reset it via User Management.

**Q. Does the app work offline?**
Submissions require an internet connection. Cached data may show briefly, but all writes need the backend to be reachable.

**Q. Which devices are supported?**
Android (5.0+) and iOS (12.0+) smartphones and tablets. A web version is also available for desktop browsers.

---

## 7. Our Team

| Member | Role |
|---|---|
| **Dr. Manjunath K. Vanhalli** | Mentor & Guide — providing guidance and mentorship for project development and implementation |
| **Shree Vats** | Team Leader & Backend Developer — Node.js + PostgreSQL infrastructure |
| **Atharva Agrawal** | Frontend Developer — React, Tailwind CSS, modern UI/UX |
| **Om Pandey** | Mobile/App Developer — Flutter app for Android and iOS |

---

## 8. Support & Contact

For issues, feature requests, or assistance:
- **In-app:** About → Connect on LinkedIn with team members
- **Email:** [add your support email]
- **Office:** [add office address / phone]

**App Version:** OMS v1.0
**Last Updated:** May 2026
