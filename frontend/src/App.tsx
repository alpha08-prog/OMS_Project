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
import AdminHome from "./pages/admin/AdminHome";
import GrievanceVerification from "./pages/admin/GrievienceVerification";
import TrainEQQueue from "./pages/admin/TrainEQQueue";
import PrintCenter from "./pages/admin/PrintCenter";
import TourProgramQueue from "./pages/admin/TourProgramQueue";
import NewsIntelligenceView from "./pages/admin/NewsIntelligenceView";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/auth/login" replace />} />

      {/* Auth - Public Routes */}
      <Route path="/auth/login" element={<Login />} />
      <Route path="/auth/signup" element={<Signup />} />
      <Route path="/auth/forgot-password" element={<ForgotPassword />} />
      <Route path="/auth/otp" element={<OTP />} />

      {/* Super Admin Home */}
      <Route
        path="/home"
        element={
          <ProtectedRoute>
            <Home />
          </ProtectedRoute>
        }
      />

      {/* Staff Routes */}
      <Route
        path="/staff/home"
        element={
          <ProtectedRoute>
            <StaffHome />
          </ProtectedRoute>
        }
      />

      {/* Admin Routes */}
      <Route
        path="/admin/home"
        element={
          <ProtectedRoute>
            <AdminHome />
          </ProtectedRoute>
        }
      />
      <Route
        path="/grievances/verify"
        element={
          <ProtectedRoute>
            <GrievanceVerification />
          </ProtectedRoute>
        }
      />
      <Route
        path="/train-eq/queue"
        element={
          <ProtectedRoute>
            <TrainEQQueue />
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

      {/* Data Entry Routes (Staff) */}
      <Route
        path="/grievances/new"
        element={
          <ProtectedRoute>
            <GrievanceCreate />
          </ProtectedRoute>
        }
      />
      <Route
        path="/visitors/new"
        element={
          <ProtectedRoute>
            <VisitorCreate />
          </ProtectedRoute>
        }
      />
      <Route
        path="/train-eq/new"
        element={
          <ProtectedRoute>
            <TrainEQCreate />
          </ProtectedRoute>
        }
      />
      <Route
        path="/tour-program/new"
        element={
          <ProtectedRoute>
            <TourProgramCreate />
          </ProtectedRoute>
        }
      />
      <Route
        path="/news-intelligence/new"
        element={
          <ProtectedRoute>
            <NewsIntelligenceCreate />
          </ProtectedRoute>
        }
      />
      <Route
        path="/birthday/new"
        element={
          <ProtectedRoute>
            <BirthdayCreate />
          </ProtectedRoute>
        }
      />

      {/* Tour Program Queue (Admin) */}
      <Route
        path="/tour-program/pending"
        element={
          <ProtectedRoute>
            <TourProgramQueue />
          </ProtectedRoute>
        }
      />
      
      {/* News Intelligence View (Admin/Super Admin) */}
      <Route
        path="/news/view"
        element={
          <ProtectedRoute>
            <NewsIntelligenceView />
          </ProtectedRoute>
        }
      />
      
      <Route
        path="/tasks"
        element={
          <ProtectedRoute>
            <AdminHome />
          </ProtectedRoute>
        }
      />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/auth/login" replace />} />
    </Routes>
  );
}
