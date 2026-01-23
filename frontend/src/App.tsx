import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Auth/Login";
import Signup from "./pages/Auth/Signup";
import ForgotPassword from "./pages/Auth/ForgotPassword";
import OTP from "./pages/Auth/OTP";         
import Home from "./pages/Home";
import GrievanceCreate from "./pages/grievances/GrievanceCreate";
import VisitorCreate from "./pages/visitors/VisitorCreate";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import "./index.css";
import TrainEQCreate from "./pages/Train/TrainEQCreate";
import TourProgramCreate from "./pages/Tour/TourProgramCreate";
import NewsIntelligenceCreate from "./pages/News/NewsIntelligenceCreate";
import BirthdayCreate from "./pages/Birthday/BirthdayCreate";
import StaffHome from "./pages/staff/StaffHome";
import StaffTasks from "./pages/staff/StaffTasks";
import PrintCenter from "./pages/admin/PrintCenter";
import TourProgramQueue from "./pages/admin/TourProgramQueue";
import NewsIntelligenceView from "./pages/admin/NewsIntelligenceView";
import AdminHistory from "./pages/admin/History";
import Birthdays from "./pages/admin/Birthdays";
import VisitorView from "./pages/admin/VisitorView";
import PhotoBooth from "./pages/photo_booth/PhotoBooth";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/auth/login" replace />} />

      {/* Auth - Public Routes */}
      <Route path="/auth/login" element={<Login />} />
      <Route path="/auth/signup" element={<Signup />} />
      <Route path="/auth/forgot-password" element={<ForgotPassword />} />
      <Route path="/auth/otp" element={<OTP />} />

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
        path="/admin/print-center"
        element={
          <ProtectedRoute>
            <PrintCenter />
          </ProtectedRoute>
        }
        
      />
      <Route
  path="/admin/birthdays"
  element={<Birthdays />}
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
      <Route
  path="/photo-booth"
  element={
    <ProtectedRoute>
      <PhotoBooth />
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
  );
}
