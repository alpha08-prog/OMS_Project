import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import { ErrorBoundary } from "./components/common/ErrorBoundary";
import { Spinner } from "./components/AuthForm/Spinner";
import "./index.css";

const Login = lazy(() => import("./pages/Auth/Login"));
const Signup = lazy(() => import("./pages/Auth/Signup"));
const Home = lazy(() => import("./pages/Home"));
const GrievanceCreate = lazy(() => import("./pages/grievances/GrievanceCreate"));
const OfficeGrievanceCreate = lazy(() => import("./pages/grievances/OfficeGrievanceCreate"));
const GrievanceView = lazy(() => import("./pages/grievances/GrievanceView"));
const VisitorCreate = lazy(() => import("./pages/visitors/VisitorCreate"));
const TrainEQCreate = lazy(() => import("./pages/Train/TrainEQCreate"));
const TourProgramCreate = lazy(() => import("./pages/Tour/TourProgramCreate"));
const NewsIntelligenceCreate = lazy(() => import("./pages/News/NewsIntelligenceCreate"));
const BirthdayCreate = lazy(() => import("./pages/Birthday/BirthdayCreate"));
const StaffHome = lazy(() => import("./pages/staff/StaffHome"));
const StaffTasks = lazy(() => import("./pages/staff/StaffTasks"));
const StaffHistory = lazy(() => import("./pages/staff/StaffHistory"));
const PrintCenter = lazy(() => import("./pages/admin/PrintCenter"));
const TourProgramQueue = lazy(() => import("./pages/admin/TourProgramQueue"));
const NewsIntelligenceView = lazy(() => import("./pages/admin/NewsIntelligenceView"));
const AdminHistory = lazy(() => import("./pages/admin/History"));
const Birthdays = lazy(() => import("./pages/admin/Birthdays"));
const VisitorView = lazy(() => import("./pages/admin/VisitorView"));
const ActionCenter = lazy(() => import("./pages/admin/ActionCenter"));
const TaskTracker = lazy(() => import("./pages/admin/TaskTracker"));
const AdminOfficeTasks = lazy(() => import("./pages/admin/AdminOfficeTasks"));
const AdminActivityLog = lazy(() => import("./pages/admin/AdminActivityLog"));
const GrievanceVerification = lazy(() => import("./pages/admin/GrievienceVerification"));
const TrainEQQueue = lazy(() => import("./pages/admin/TrainEQQueue"));
const ViewVisitors = lazy(() => import("./pages/admin/ViewVisitors"));
const AdminHome = lazy(() => import("./pages/admin/AdminHome"));
const PhotoBooth = lazy(() => import("./pages/PhotoBooth/PhotoBooth.tsx"));
const AboutUs = lazy(() => import("./pages/AboutUs"));
const EventReport = lazy(() => import("./pages/Events/EventReport"));
const EventsView = lazy(() => import("./pages/admin/EventsView"));
const SuperAdminTourPrograms = lazy(() => import("./pages/admin/SuperAdminTourPrograms"));
const SuperAdminGrievances = lazy(() => import("./pages/admin/SuperAdminGrievances"));
const SuperAdminNews = lazy(() => import("./pages/admin/SuperAdminNews"));
const SuperAdminMeetings = lazy(() => import("./pages/admin/SuperAdminMeetings"));
const AdminCalendar = lazy(() => import("./pages/admin/AdminCalendar"));
const Profile = lazy(() => import("./pages/Profile"));
const CreateUser = lazy(() => import("./pages/admin/CreateUser"));
const UserList = lazy(() => import("./pages/admin/UserList"));
const StaffAttendance = lazy(() => import("./pages/staff/StaffAttendance"));
const AdminAttendance = lazy(() => import("./pages/admin/AdminAttendance"));
const AdminMeetings = lazy(() => import("./pages/admin/AdminMeetings"));
// Shared task board (all roles) + merged Visitor/Birthday "Add Person" form.
const AllTasks = lazy(() => import("./pages/tasks/AllTasks"));
const AddPerson = lazy(() => import("./pages/people/AddPerson"));

function PageFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center text-gray-600">
      <Spinner />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/" element={<Navigate to="/auth/login" replace />} />

        {/* Auth - Public Routes */}
        <Route path="/about" element={<AboutUs />} />
        <Route path="/auth/login" element={<Login />} />
        <Route path="/auth/signup" element={<Signup />} />

        {/* ==================== SUPER ADMIN ROUTES ==================== */}
        <Route
          path="/home"
          element={
            <ProtectedRoute allowedRoles={['SUPER_ADMIN']}>
              <Home />
            </ProtectedRoute>
          }
        />

        {/* ==================== STAFF ROUTES ==================== */}
        <Route
          path="/staff/home"
          element={
            <ProtectedRoute allowedRoles={['STAFF']}>
              <StaffHome />
            </ProtectedRoute>
          }
        />
        <Route
          path="/staff/tasks"
          element={
            <ProtectedRoute allowedRoles={['STAFF']}>
              <StaffTasks />
            </ProtectedRoute>
          }
        />
        <Route
          path="/staff/history"
          element={
            <ProtectedRoute allowedRoles={['STAFF']}>
              <StaffHistory />
            </ProtectedRoute>
          }
        />
        <Route
          path="/staff/attendance"
          element={
            <ProtectedRoute allowedRoles={['STAFF']}>
              <StaffAttendance />
            </ProtectedRoute>
          }
        />
        {/* ==================== ADMIN ROUTES ==================== */}
        <Route
          path="/admin/home"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <AdminHome />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/action-center"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <ActionCenter />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/task-tracker"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <TaskTracker />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/office-tasks"
          element={
            <ProtectedRoute allowedRoles={['ADMIN', 'SUPER_ADMIN']}>
              <AdminOfficeTasks />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/activity"
          element={
            <ProtectedRoute allowedRoles={['ADMIN', 'SUPER_ADMIN']}>
              <AdminActivityLog />
            </ProtectedRoute>
          }
        />
        <Route
          path="/grievances/verify"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <GrievanceVerification />
            </ProtectedRoute>
          }
        />
        <Route
          path="/train-eq/queue"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <TrainEQQueue />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/print-center"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <PrintCenter />
            </ProtectedRoute>
          }
        />
        {/* Staff Print Center — same component, staff-accessible path */}
        <Route
          path="/staff/print-center"
          element={
            <ProtectedRoute allowedRoles={['STAFF']}>
              <PrintCenter />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/birthdays"
          element={
            <ProtectedRoute allowedRoles={['STAFF', 'ADMIN', 'SUPER_ADMIN']}>
              <Birthdays />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/visitors"
          element={
            <ProtectedRoute allowedRoles={["ADMIN"]}>
              <ViewVisitors />
            </ProtectedRoute>
          }
        />

        {/* Shared task board — visible & editable to every authenticated role. */}
        <Route
          path="/tasks/all"
          element={
            <ProtectedRoute allowedRoles={['STAFF', 'ADMIN', 'SUPER_ADMIN']}>
              <AllTasks />
            </ProtectedRoute>
          }
        />

        {/* Data Entry Routes (Staff) */}
        <Route
          path="/people/new"
          element={
            <ProtectedRoute allowedRoles={['STAFF', 'ADMIN']}>
              <AddPerson />
            </ProtectedRoute>
          }
        />
        <Route
          path="/grievances/new"
          element={
            <ProtectedRoute allowedRoles={['STAFF', 'ADMIN']}>
              <GrievanceCreate />
            </ProtectedRoute>
          }
        />
        <Route
          path="/grievances/office"
          element={
            <ProtectedRoute allowedRoles={['STAFF', 'ADMIN']}>
              <OfficeGrievanceCreate />
            </ProtectedRoute>
          }
        />
        <Route
          path="/grievances/view"
          element={
            <ProtectedRoute allowedRoles={['STAFF', 'ADMIN', 'SUPER_ADMIN']}>
              <GrievanceView />
            </ProtectedRoute>
          }
        />
        <Route
          path="/visitors/new"
          element={
            <ProtectedRoute allowedRoles={['STAFF', 'ADMIN']}>
              <VisitorCreate />
            </ProtectedRoute>
          }
        />
        <Route
          path="/train-eq/new"
          element={
            <ProtectedRoute allowedRoles={['STAFF', 'ADMIN']}>
              <TrainEQCreate />
            </ProtectedRoute>
          }
        />
        <Route
          path="/tour-program/new"
          element={
            <ProtectedRoute allowedRoles={['STAFF', 'ADMIN']}>
              <TourProgramCreate />
            </ProtectedRoute>
          }
        />
        <Route
          path="/events/report"
          element={
            <ProtectedRoute allowedRoles={['STAFF', 'ADMIN']}>
              <EventReport />
            </ProtectedRoute>
          }
        />
        <Route
          path="/news-intelligence/new"
          element={
            <ProtectedRoute allowedRoles={['STAFF', 'ADMIN']}>
              <NewsIntelligenceCreate />
            </ProtectedRoute>
          }
        />
        <Route
          path="/birthday/new"
          element={
            <ProtectedRoute allowedRoles={['STAFF', 'ADMIN']}>
              <BirthdayCreate />
            </ProtectedRoute>
          }
        />
        {/* Tour Program Queue (Admin) */}
        <Route
          path="/tour-program/pending"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <TourProgramQueue />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/events"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <EventsView />
            </ProtectedRoute>
          }
        />
        {/* Super Admin — read-only list of accepted tour programs */}
        <Route
          path="/super-admin/tour-program"
          element={
            <ProtectedRoute allowedRoles={['SUPER_ADMIN']}>
              <SuperAdminTourPrograms />
            </ProtectedRoute>
          }
        />
        {/* Super Admin — read-only grievance overview (no PDF, no resolved) */}
        <Route
          path="/super-admin/grievances"
          element={
            <ProtectedRoute allowedRoles={['SUPER_ADMIN']}>
              <SuperAdminGrievances />
            </ProtectedRoute>
          }
        />
        {/* Super Admin — read-only news feed (no delete) */}
        <Route
          path="/super-admin/news"
          element={
            <ProtectedRoute allowedRoles={['SUPER_ADMIN']}>
              <SuperAdminNews />
            </ProtectedRoute>
          }
        />
        {/* Super Admin — read-only meetings overview with summaries */}
        <Route
          path="/super-admin/meetings"
          element={
            <ProtectedRoute allowedRoles={['SUPER_ADMIN']}>
              <SuperAdminMeetings />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/calendar"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <AdminCalendar />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/attendance"
          element={
            <ProtectedRoute allowedRoles={['ADMIN', 'SUPER_ADMIN']}>
              <AdminAttendance />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/meetings"
          element={
            <ProtectedRoute allowedRoles={['ADMIN', 'SUPER_ADMIN']}>
              <AdminMeetings />
            </ProtectedRoute>
          }
        />

        {/* ==================== ADMIN + SUPER_ADMIN ROUTES ==================== */}
        <Route
          path="/news/view"
          element={
            <ProtectedRoute allowedRoles={['ADMIN', 'SUPER_ADMIN']}>
              <NewsIntelligenceView />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/history"
          element={
            <ProtectedRoute allowedRoles={['ADMIN', 'SUPER_ADMIN']}>
              <AdminHistory />
            </ProtectedRoute>
          }
        />
        <Route
          path="/visitors/view"
          element={
            <ProtectedRoute allowedRoles={['ADMIN', 'SUPER_ADMIN']}>
              <VisitorView />
            </ProtectedRoute>
          }
        />

        {/* ==================== COMMON ROUTES (All Roles) ==================== */}
        <Route
          path="/photo-booth"
          element={
            <ProtectedRoute allowedRoles={['STAFF', 'ADMIN', 'SUPER_ADMIN']}>
              <PhotoBooth />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute allowedRoles={['STAFF', 'ADMIN', 'SUPER_ADMIN']}>
              <Profile />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/users"
          element={
            <ProtectedRoute allowedRoles={['ADMIN', 'SUPER_ADMIN']}>
              <UserList />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/users/create"
          element={
            <ProtectedRoute allowedRoles={['ADMIN', 'SUPER_ADMIN']}>
              <CreateUser />
            </ProtectedRoute>
          }
        />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/auth/login" replace />} />
      </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
