import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "./components/auth/ProtectedRoute";
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
const GrievanceVerification = lazy(() => import("./pages/admin/GrievienceVerification"));
const TrainEQQueue = lazy(() => import("./pages/admin/TrainEQQueue"));
const ViewVisitors = lazy(() => import("./pages/admin/ViewVisitors"));
const AdminHome = lazy(() => import("./pages/admin/AdminHome"));
const PhotoBooth = lazy(() => import("./pages/PhotoBooth/PhotoBooth.tsx"));
const AboutUs = lazy(() => import("./pages/AboutUs"));
const EventReport = lazy(() => import("./pages/Events/EventReport"));
const EventsView = lazy(() => import("./pages/admin/EventsView"));
const AdminCalendar = lazy(() => import("./pages/admin/AdminCalendar"));

function PageFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center text-gray-600">
      <Spinner />
    </div>
  );
}

export default function App() {
  return (
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
            <ProtectedRoute allowedRoles={['ADMIN', 'SUPER_ADMIN']}>
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

        {/* Data Entry Routes (Staff) */}
        <Route
          path="/grievances/new"
          element={
            <ProtectedRoute allowedRoles={['STAFF']}>
              <GrievanceCreate />
            </ProtectedRoute>
          }
        />
        <Route
          path="/grievances/office"
          element={
            <ProtectedRoute allowedRoles={['STAFF']}>
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
            <ProtectedRoute allowedRoles={['STAFF']}>
              <VisitorCreate />
            </ProtectedRoute>
          }
        />
        <Route
          path="/train-eq/new"
          element={
            <ProtectedRoute allowedRoles={['STAFF']}>
              <TrainEQCreate />
            </ProtectedRoute>
          }
        />
        <Route
          path="/tour-program/new"
          element={
            <ProtectedRoute allowedRoles={['STAFF']}>
              <TourProgramCreate />
            </ProtectedRoute>
          }
        />
        <Route
          path="/events/report"
          element={
            <ProtectedRoute allowedRoles={['STAFF']}>
              <EventReport />
            </ProtectedRoute>
          }
        />
        <Route
          path="/news-intelligence/new"
          element={
            <ProtectedRoute allowedRoles={['STAFF']}>
              <NewsIntelligenceCreate />
            </ProtectedRoute>
          }
        />
        <Route
          path="/birthday/new"
          element={
            <ProtectedRoute allowedRoles={['STAFF']}>
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
        <Route
          path="/admin/calendar"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <AdminCalendar />
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

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/auth/login" replace />} />
      </Routes>
    </Suspense>
  );
}
