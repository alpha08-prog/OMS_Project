# OMS (Office Management System) - Backend API Documentation

A comprehensive backend API for managing office operations including grievances, task tracking, visitor management, train equipment requests, tour programs, news intelligence, and more.

## Table of Contents

- [Project Overview](#project-overview)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Authentication](#authentication)
- [Role-Based Access Control](#role-based-access-control)
- [API Endpoints](#api-endpoints)
  - [Health Check](#1-health-check)
  - [Authentication](#2-authentication-endpoints)
  - [Grievances](#3-grievance-endpoints)
  - [Task Tracker / Action Center](#4-task-tracker--action-center-endpoints)
  - [Birthdays](#5-birthday-endpoints)
  - [Visitors](#6-visitor-endpoints)
  - [Train EQ Requests](#7-train-eq-equipment-endpoints)
  - [Tour Programs](#8-tour-program-endpoints)
  - [News Intelligence](#9-news-intelligence-endpoints)
  - [PDF Generation](#10-pdf-generation-endpoints)
  - [History](#11-history-endpoints)
  - [Statistics / Dashboard](#12-statistics--dashboard-endpoints)
- [Request/Response Format](#requestresponse-format)
- [Error Handling](#error-handling)
- [Android/Flutter Integration](#androidflutter-integration)

---

## Project Overview

OMS is a full-stack office management system with:
- **Backend**: Node.js + Express + TypeScript + Prisma ORM + PostgreSQL
- **Web Frontend**: React + TypeScript + Vite + Tailwind CSS
- **Mobile App**: Flutter/Android (to be connected)

---

## Tech Stack

### Backend
- **Runtime**: Node.js (v18+)
- **Framework**: Express.js
- **Language**: TypeScript
- **ORM**: Prisma
- **Database**: PostgreSQL
- **Authentication**: JWT (JSON Web Tokens)
- **PDF Generation**: PDFKit (with watermarks and letterheads)
- **Validation**: express-validator

### Frontend (Web)
- **Framework**: React 18
- **Build Tool**: Vite
- **Styling**: Tailwind CSS + shadcn/ui
- **HTTP Client**: Axios

---

## Getting Started

### Prerequisites
- Node.js v18 or higher
- PostgreSQL database
- npm or yarn

### Backend Setup

```bash
# Navigate to backend directory
cd OMS_Project/backend

# Install dependencies
npm install

# Create .env file with the following variables
DATABASE_URL="postgresql://username:password@localhost:5432/oms_db"
JWT_SECRET="your-super-secret-jwt-key"
PORT=5000

# Run database migrations
npx prisma migrate dev

# Seed the database (optional)
npx prisma db seed

# Start development server
npm run dev

# For production
npm run build
npm start
```

### Frontend Setup (Web)

```bash
# Navigate to frontend directory
cd OMS_Project/frontend

# Install dependencies
npm install

# Create .env file
VITE_API_URL=http://localhost:5000/api

# Start development server
npm run dev
```

---

## Authentication

### JWT Token Authentication

The API uses JWT (JSON Web Tokens) for authentication. Tokens are obtained through the login endpoint and must be included in subsequent requests.

### How to Authenticate

1. **Login** to get a token:
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "yourpassword"
}
```

2. **Response** contains the token:
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "uuid",
      "name": "John Doe",
      "email": "user@example.com",
      "role": "STAFF"
    }
  }
}
```

3. **Include token** in subsequent requests:
```http
Authorization: Bearer <your-token>
```

### Token for PDF Downloads

For PDF downloads (opening in new browser tab), you can pass the token as a query parameter:
```
GET /api/pdf/grievance/123?token=<your-token>
```

---

## Role-Based Access Control

The system supports three user roles with hierarchical permissions:

| Role | Description | Access Level |
|------|-------------|--------------|
| `STAFF` | Basic staff member | Can create entries, view own data |
| `ADMIN` | Administrator | Can verify, approve, manage all data |
| `SUPER_ADMIN` | Super Administrator | Full access to all features including user management |

### Permission Hierarchy

```
SUPER_ADMIN > ADMIN > STAFF
```

- **STAFF+**: Endpoints accessible by STAFF, ADMIN, and SUPER_ADMIN
- **ADMIN+**: Endpoints accessible by ADMIN and SUPER_ADMIN only
- **SUPER_ADMIN**: Endpoints accessible by SUPER_ADMIN only

---

## API Endpoints

**Base URL**: `http://localhost:5000/api`

### 1. Health Check

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/` | API root with endpoint list | No |
| GET | `/api/health` | Health check | No |

---

### 2. Authentication Endpoints

**Base**: `/api/auth`

| Method | Endpoint | Description | Auth | Role |
|--------|----------|-------------|------|------|
| POST | `/register` | Register new user | No | - |
| POST | `/login` | Login (email/phone + password) | No | - |
| GET | `/me` | Get current user profile | Yes | Any |
| PUT | `/password` | Update own password | Yes | Any |
| GET | `/users` | Get all users | Yes | ADMIN+ |
| PATCH | `/users/:id/role` | Update user role | Yes | ADMIN+ |
| PATCH | `/users/:id/deactivate` | Deactivate user | Yes | ADMIN+ |

#### Register User
```http
POST /api/auth/register
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "9876543210",
  "password": "securepassword123",
  "role": "STAFF"
}
```

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "securepassword123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "id": "clxx...",
      "name": "John Doe",
      "email": "john@example.com",
      "role": "STAFF",
      "isActive": true
    }
  }
}
```

---

### 3. Grievance Endpoints

**Base**: `/api/grievances`

| Method | Endpoint | Description | Auth | Role |
|--------|----------|-------------|------|------|
| POST | `/` | Create new grievance | Yes | STAFF+ |
| GET | `/` | Get all grievances (with filters) | Yes | Any |
| GET | `/queue/verification` | Get verification queue | Yes | ADMIN+ |
| GET | `/:id` | Get grievance by ID | Yes | Any |
| PUT | `/:id` | Update grievance | Yes | Any |
| PATCH | `/:id/verify` | Verify grievance | Yes | ADMIN+ |
| PATCH | `/:id/status` | Update grievance status | Yes | ADMIN+ |
| DELETE | `/:id` | Delete grievance | Yes | ADMIN+ |

#### Grievance Types
- `WATER` - Water supply issues
- `ROAD` - Road maintenance
- `POLICE` - Police related
- `HEALTH` - Health services
- `TRANSFER` - Transfer requests
- `FINANCIAL_AID` - Financial assistance
- `ELECTRICITY` - Power supply
- `EDUCATION` - Education related
- `HOUSING` - Housing issues
- `OTHER` - Other grievances

#### Grievance Statuses
- `OPEN` - Newly created
- `IN_PROGRESS` - Being processed
- `VERIFIED` - Verified by admin
- `RESOLVED` - Issue resolved
- `REJECTED` - Rejected

#### Create Grievance
```http
POST /api/grievances
Authorization: Bearer <token>
Content-Type: application/json

{
  "type": "WATER",
  "title": "Water supply issue in Ward 5",
  "description": "No water supply for 3 days",
  "personName": "Ram Kumar",
  "phone": "9876543210",
  "address": "123, Main Street, Ward 5",
  "constituency": "Constituency A",
  "boothNumber": "45"
}
```

#### Get Grievances with Filters
```http
GET /api/grievances?status=OPEN&type=WATER&page=1&limit=10
Authorization: Bearer <token>
```

---

### 4. Task Tracker / Action Center Endpoints

**Base**: `/api/tasks`

| Method | Endpoint | Description | Auth | Role |
|--------|----------|-------------|------|------|
| POST | `/` | Create new task | Yes | ADMIN+ |
| GET | `/` | Get all tasks | Yes | Any |
| GET | `/my-tasks` | Get current user's tasks | Yes | STAFF+ |
| GET | `/tracking` | Get task tracking dashboard | Yes | ADMIN+ |
| GET | `/staff` | Get staff members list | Yes | ADMIN+ |
| GET | `/:id` | Get task by ID | Yes | Any |
| PATCH | `/:id/progress` | Update task progress | Yes | STAFF+ |
| PATCH | `/:id/status` | Update task status | Yes | ADMIN+ |
| DELETE | `/:id` | Delete task | Yes | ADMIN+ |

#### Task Types
- `GRIEVANCE` - Grievance follow-up
- `TRAIN_REQUEST` - Train EQ request
- `TOUR_PROGRAM` - Tour/invitation
- `GENERAL` - General task

#### Task Statuses
- `ASSIGNED` - Newly assigned
- `IN_PROGRESS` - Being worked on
- `COMPLETED` - Finished
- `ON_HOLD` - Paused

#### Create Task (Admin assigns to Staff)
```http
POST /api/tasks
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "title": "Follow up on grievance #123",
  "description": "Contact the person and verify the issue",
  "type": "GRIEVANCE",
  "assignedToId": "staff-user-id",
  "dueDate": "2026-01-30",
  "priority": "HIGH",
  "relatedGrievanceId": "grievance-id"
}
```

#### Update Task Progress (Staff)
```http
PATCH /api/tasks/:id/progress
Authorization: Bearer <staff-token>
Content-Type: application/json

{
  "progress": 75,
  "notes": "Contacted the person, issue verified"
}
```

---

### 5. Birthday Endpoints

**Base**: `/api/birthdays`

| Method | Endpoint | Description | Auth | Role |
|--------|----------|-------------|------|------|
| POST | `/` | Create birthday entry | Yes | STAFF+ |
| GET | `/` | Get all birthdays | Yes | Any |
| GET | `/today` | Get today's birthdays | Yes | Any |
| GET | `/upcoming` | Get upcoming (next 7 days) | Yes | Any |
| GET | `/:id` | Get birthday by ID | Yes | Any |
| PUT | `/:id` | Update birthday | Yes | Any |
| DELETE | `/:id` | Delete birthday | Yes | ADMIN+ |

#### Create Birthday
```http
POST /api/birthdays
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Rahul Sharma",
  "date": "1990-01-25",
  "phone": "9876543210",
  "address": "123, Main St",
  "constituency": "Constituency A",
  "designation": "Teacher",
  "notes": "VIP guest"
}
```

---

### 6. Visitor Endpoints

**Base**: `/api/visitors`

| Method | Endpoint | Description | Auth | Role |
|--------|----------|-------------|------|------|
| POST | `/` | Create visitor entry | Yes | STAFF+ |
| GET | `/` | Get all visitors | Yes | Any |
| GET | `/birthdays/today` | Get today's visitor birthdays | Yes | Any |
| GET | `/date/:date` | Get visitors by date | Yes | Any |
| GET | `/:id` | Get visitor by ID | Yes | Any |
| PUT | `/:id` | Update visitor | Yes | Any |
| DELETE | `/:id` | Delete visitor | Yes | ADMIN+ |

#### Create Visitor
```http
POST /api/visitors
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Visitor Name",
  "phone": "9876543210",
  "purpose": "Meeting with admin",
  "address": "Address here",
  "constituency": "Constituency B",
  "visitDate": "2026-01-24"
}
```

---

### 7. Train EQ (Equipment) Endpoints

**Base**: `/api/train-requests`

| Method | Endpoint | Description | Auth | Role |
|--------|----------|-------------|------|------|
| POST | `/` | Create train request | Yes | STAFF+ |
| GET | `/` | Get all train requests | Yes | Any |
| GET | `/queue/pending` | Get pending queue | Yes | ADMIN+ |
| GET | `/pnr/:pnr` | Check PNR status | Yes | Any |
| GET | `/:id` | Get request by ID | Yes | Any |
| PUT | `/:id` | Update request | Yes | Any |
| PATCH | `/:id/approve` | Approve request | Yes | ADMIN+ |
| PATCH | `/:id/reject` | Reject request | Yes | ADMIN+ |
| DELETE | `/:id` | Delete request | Yes | ADMIN+ |

#### Create Train Request
```http
POST /api/train-requests
Authorization: Bearer <token>
Content-Type: application/json

{
  "passengerName": "John Doe",
  "phone": "9876543210",
  "trainNumber": "12345",
  "trainName": "Rajdhani Express",
  "fromStation": "Delhi",
  "toStation": "Mumbai",
  "journeyDate": "2026-02-15",
  "classType": "3A",
  "pnrNumber": "1234567890",
  "seatPreference": "Lower berth",
  "remarks": "Senior citizen"
}
```

---

### 8. Tour Program Endpoints

**Base**: `/api/tour-programs`

| Method | Endpoint | Description | Auth | Role |
|--------|----------|-------------|------|------|
| POST | `/` | Create tour/invitation | Yes | STAFF+ |
| GET | `/` | Get all tour programs | Yes | Any |
| GET | `/schedule/today` | Get today's schedule | Yes | Any |
| GET | `/upcoming` | Get upcoming events | Yes | Any |
| GET | `/pending` | Get pending decisions | Yes | ADMIN+ |
| GET | `/:id` | Get by ID | Yes | Any |
| PUT | `/:id` | Update | Yes | Any |
| PATCH | `/:id/decision` | Update decision | Yes | ADMIN+ |
| DELETE | `/:id` | Delete | Yes | ADMIN+ |

#### Decision Values
- `PENDING` - Awaiting decision
- `ACCEPTED` - Invitation accepted
- `REGRET` - Invitation declined

#### Create Tour Program / Invitation
```http
POST /api/tour-programs
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "Foundation Stone Laying Ceremony",
  "organizer": "Municipal Corporation",
  "eventDate": "2026-02-01",
  "eventTime": "10:00",
  "venue": "City Hall",
  "address": "Main Road, City Center",
  "constituency": "Constituency A",
  "description": "Chief guest invitation for ceremony",
  "contactPerson": "Ramesh Kumar",
  "contactPhone": "9876543210"
}
```

---

### 9. News Intelligence Endpoints

**Base**: `/api/news`

| Method | Endpoint | Description | Auth | Role |
|--------|----------|-------------|------|------|
| POST | `/` | Create news entry | Yes | STAFF+ |
| GET | `/` | Get all news | Yes | Any |
| GET | `/alerts/critical` | Get critical alerts | Yes | Any |
| GET | `/:id` | Get news by ID | Yes | Any |
| PUT | `/:id` | Update news | Yes | Any |
| DELETE | `/:id` | Delete news | Yes | ADMIN+ |

#### News Categories
- `DEVELOPMENT_WORK` - Development projects
- `CONSPIRACY_FAKE_NEWS` - Misinformation alerts
- `LEADER_ACTIVITY` - Leader activities
- `PARTY_ACTIVITY` - Party events
- `OPPOSITION` - Opposition activities
- `OTHER` - Other news

#### Priority Levels
- `NORMAL` - Regular news
- `HIGH` - Important news
- `CRITICAL` - Urgent alerts

#### Create News
```http
POST /api/news
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "New Road Construction Started",
  "content": "Road construction has begun in Ward 5...",
  "category": "DEVELOPMENT_WORK",
  "priority": "NORMAL",
  "source": "Field Report",
  "constituency": "Constituency A"
}
```

---

### 10. PDF Generation Endpoints

**Base**: `/api/pdf`

| Method | Endpoint | Description | Auth | Role |
|--------|----------|-------------|------|------|
| GET | `/train-eq/:id` | Generate Train EQ PDF | Yes | ADMIN+ |
| GET | `/train-eq/:id/preview` | Preview Train EQ PDF | Yes | ADMIN+ |
| GET | `/grievance/:id` | Generate Grievance PDF | Yes | ADMIN+ |
| GET | `/grievance/:id/preview` | Preview Grievance PDF | Yes | ADMIN+ |
| GET | `/tour-program` | Generate Tour Program PDF | Yes | ADMIN+ |

**Features:**
- Official letterhead
- Watermark
- Professional formatting

**Token via Query Parameter:**
```
GET /api/pdf/grievance/123?token=eyJhbGciOiJIUzI1NiIs...
```

---

### 11. History Endpoints

**Base**: `/api/history`

| Method | Endpoint | Description | Auth | Role |
|--------|----------|-------------|------|------|
| GET | `/` | Get admin action history | Yes | ADMIN+ |
| GET | `/stats` | Get history statistics | Yes | ADMIN+ |

#### Query Parameters
- `type` - Filter by type (GRIEVANCE, TASK, etc.)
- `action` - Filter by action (CREATED, UPDATED, etc.)
- `startDate` - Start date filter
- `endDate` - End date filter
- `page` - Page number
- `limit` - Items per page

---

### 12. Statistics / Dashboard Endpoints

**Base**: `/api/stats`

| Method | Endpoint | Description | Auth | Role |
|--------|----------|-------------|------|------|
| GET | `/summary` | Get dashboard summary | Yes | ADMIN+ |
| GET | `/grievances/by-type` | Grievances by type | Yes | ADMIN+ |
| GET | `/grievances/by-status` | Grievances by status | Yes | ADMIN+ |
| GET | `/grievances/by-constituency` | Grievances by constituency | Yes | ADMIN+ |
| GET | `/grievances/monthly` | Monthly trends | Yes | ADMIN+ |
| GET | `/monetization` | CSR/Monetization summary | Yes | SUPER_ADMIN |
| GET | `/recent-activity` | Recent activity | Yes | ADMIN+ |

---

## Request/Response Format

### Standard Success Response
```json
{
  "success": true,
  "data": { ... },
  "message": "Operation successful"
}
```

### Paginated Response
```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 100,
    "totalPages": 10
  }
}
```

### Error Response
```json
{
  "success": false,
  "error": "Error message here",
  "code": "ERROR_CODE"
}
```

---

## Error Handling

### HTTP Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request - Invalid input |
| 401 | Unauthorized - Missing/invalid token |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found - Resource doesn't exist |
| 409 | Conflict - Duplicate entry |
| 500 | Internal Server Error |

### Common Error Codes

| Code | Description |
|------|-------------|
| `AUTH_REQUIRED` | Authentication required |
| `INVALID_TOKEN` | Token is invalid or expired |
| `INSUFFICIENT_PERMISSIONS` | User lacks required role |
| `VALIDATION_ERROR` | Input validation failed |
| `NOT_FOUND` | Resource not found |
| `DUPLICATE_ENTRY` | Resource already exists |

---

## Android/Flutter Integration

### Setup HTTP Client

```dart
// lib/services/api_service.dart
import 'package:http/http.dart' as http;
import 'dart:convert';

class ApiService {
  static const String baseUrl = 'http://your-server-ip:5000/api';
  String? _token;

  // Set token after login
  void setToken(String token) {
    _token = token;
  }

  // Clear token on logout
  void clearToken() {
    _token = null;
  }

  // Get headers with auth
  Map<String, String> get headers {
    final headers = {
      'Content-Type': 'application/json',
    };
    if (_token != null) {
      headers['Authorization'] = 'Bearer $_token';
    }
    return headers;
  }

  // Login
  Future<Map<String, dynamic>> login(String email, String password) async {
    final response = await http.post(
      Uri.parse('$baseUrl/auth/login'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'email': email,
        'password': password,
      }),
    );

    final data = jsonDecode(response.body);
    if (data['success']) {
      _token = data['data']['token'];
    }
    return data;
  }

  // Get current user
  Future<Map<String, dynamic>> getCurrentUser() async {
    final response = await http.get(
      Uri.parse('$baseUrl/auth/me'),
      headers: headers,
    );
    return jsonDecode(response.body);
  }

  // Get grievances
  Future<Map<String, dynamic>> getGrievances({
    String? status,
    String? type,
    int page = 1,
    int limit = 10,
  }) async {
    final queryParams = {
      'page': page.toString(),
      'limit': limit.toString(),
      if (status != null) 'status': status,
      if (type != null) 'type': type,
    };
    
    final uri = Uri.parse('$baseUrl/grievances')
        .replace(queryParameters: queryParams);
    
    final response = await http.get(uri, headers: headers);
    return jsonDecode(response.body);
  }

  // Create grievance
  Future<Map<String, dynamic>> createGrievance(Map<String, dynamic> data) async {
    final response = await http.post(
      Uri.parse('$baseUrl/grievances'),
      headers: headers,
      body: jsonEncode(data),
    );
    return jsonDecode(response.body);
  }

  // Get tasks
  Future<Map<String, dynamic>> getMyTasks() async {
    final response = await http.get(
      Uri.parse('$baseUrl/tasks/my-tasks'),
      headers: headers,
    );
    return jsonDecode(response.body);
  }

  // Update task progress
  Future<Map<String, dynamic>> updateTaskProgress(
    String taskId,
    int progress,
    String? notes,
  ) async {
    final response = await http.patch(
      Uri.parse('$baseUrl/tasks/$taskId/progress'),
      headers: headers,
      body: jsonEncode({
        'progress': progress,
        if (notes != null) 'notes': notes,
      }),
    );
    return jsonDecode(response.body);
  }
}
```

### User Model

```dart
// lib/models/user.dart
class User {
  final String id;
  final String name;
  final String email;
  final String? phone;
  final String role; // STAFF, ADMIN, SUPER_ADMIN
  final bool isActive;

  User({
    required this.id,
    required this.name,
    required this.email,
    this.phone,
    required this.role,
    required this.isActive,
  });

  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      id: json['id'],
      name: json['name'],
      email: json['email'],
      phone: json['phone'],
      role: json['role'],
      isActive: json['isActive'] ?? true,
    );
  }

  bool get isStaff => role == 'STAFF';
  bool get isAdmin => role == 'ADMIN' || role == 'SUPER_ADMIN';
  bool get isSuperAdmin => role == 'SUPER_ADMIN';
}
```

### Auth Provider (Using Provider package)

```dart
// lib/providers/auth_provider.dart
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

class AuthProvider extends ChangeNotifier {
  User? _user;
  String? _token;
  final ApiService _api = ApiService();

  User? get user => _user;
  bool get isAuthenticated => _token != null;
  bool get isAdmin => _user?.isAdmin ?? false;
  bool get isStaff => _user?.isStaff ?? false;

  // Login
  Future<bool> login(String email, String password) async {
    try {
      final response = await _api.login(email, password);
      if (response['success']) {
        _token = response['data']['token'];
        _user = User.fromJson(response['data']['user']);
        
        // Save token
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString('auth_token', _token!);
        
        notifyListeners();
        return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  // Logout
  Future<void> logout() async {
    _token = null;
    _user = null;
    _api.clearToken();
    
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('auth_token');
    
    notifyListeners();
  }

  // Check if user has role
  bool hasRole(List<String> allowedRoles) {
    if (_user == null) return false;
    return allowedRoles.contains(_user!.role);
  }
}
```

### Role-Based Navigation

```dart
// lib/widgets/role_guard.dart
class RoleGuard extends StatelessWidget {
  final Widget child;
  final List<String> allowedRoles;
  final Widget? fallback;

  const RoleGuard({
    required this.child,
    required this.allowedRoles,
    this.fallback,
  });

  @override
  Widget build(BuildContext context) {
    final auth = Provider.of<AuthProvider>(context);
    
    if (!auth.isAuthenticated) {
      return fallback ?? const LoginScreen();
    }
    
    if (!auth.hasRole(allowedRoles)) {
      return fallback ?? const AccessDeniedScreen();
    }
    
    return child;
  }
}

// Usage
RoleGuard(
  allowedRoles: ['ADMIN', 'SUPER_ADMIN'],
  child: AdminDashboard(),
)
```

---

## Environment Variables

### Backend (.env)

```env
# Database
DATABASE_URL="postgresql://username:password@localhost:5432/oms_db"

# Authentication
JWT_SECRET="your-super-secret-jwt-key-min-32-chars"
JWT_EXPIRES_IN="7d"

# Server
PORT=5000
NODE_ENV=development

# CORS (comma-separated origins)
ALLOWED_ORIGINS="http://localhost:5173,http://localhost:3000"
```

### Frontend Web (.env)

```env
VITE_API_URL=http://localhost:5000/api
```

### Android/Flutter

```dart
// lib/config/api_config.dart
class ApiConfig {
  // Development
  static const String devBaseUrl = 'http://10.0.2.2:5000/api'; // Android Emulator
  // static const String devBaseUrl = 'http://localhost:5000/api'; // iOS Simulator
  
  // Production
  static const String prodBaseUrl = 'https://your-domain.com/api';
  
  static String get baseUrl {
    // Use kDebugMode or environment flag
    return devBaseUrl;
  }
}
```

---

## Total Endpoints Summary

| Category | Endpoints |
|----------|-----------|
| Health | 2 |
| Authentication | 7 |
| Grievances | 8 |
| Task Tracker | 9 |
| Birthdays | 7 |
| Visitors | 7 |
| Train EQ | 9 |
| Tour Programs | 9 |
| News Intelligence | 6 |
| PDF Generation | 5 |
| History | 2 |
| Statistics | 7 |
| **Total** | **78** |

---

## Support

For issues or questions, contact the development team.

---

*Last Updated: January 24, 2026*
