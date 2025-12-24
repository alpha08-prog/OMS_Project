import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Auth/Login";
import Signup from "./pages/Auth/Signup";
import ForgotPassword from "./pages/Auth/ForgotPassword";
import OTP from "./pages/Auth/OTP";
import Home from "./pages/Home";
import GrievanceCreate from "./pages/grievances/GrievanceCreate";
import VisitorCreate from "./pages/visitors/VisitorCreate"
import ProtectedRoute from "./components/auth/ProtectedRoute";
import "./index.css";
import TrainEQCreate from "./pages/Train/TrainEQCreate";
import TourProgramCreate from "./pages/Tour/TourProgramCreate";
import NewsIntelligenceCreate from "./pages/News/NewsIntelligenceCreate";
import StaffHome from "./pages/staff/StaffHome";
import AdminHome from "./pages/admin/AdminHome";  

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/auth/login" replace />} />

      {/* Auth */}
      <Route path="/auth/login" element={<Login />} />
      <Route path="/auth/signup" element={<Signup />} />
      <Route path="/auth/forgot-password" element={<ForgotPassword />} />
      <Route path="/auth/otp" element={<OTP />} />

      {/* Protected */}
      <Route
        path="/home"
        element={
          <ProtectedRoute>
            <Home />
          </ProtectedRoute>
        }
      />
       <Route path="/staff/home" element={<StaffHome />} />
      <Route path="/admin/home" element={<AdminHome />} />


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


      {/* Fallback */}
      <Route path="*" element={<Navigate to="/auth/login" replace />} />
    </Routes>
  );
}
