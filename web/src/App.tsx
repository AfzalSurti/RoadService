import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth";
import { AppLayout } from "./components/AppLayout";
import { DashboardPage } from "./pages/DashboardPage";
import { IssuesPage } from "./pages/IssuesPage";
import { LandingPage } from "./pages/LandingPage";
import { LoginPage } from "./pages/LoginPage";
import { MapPage } from "./pages/MapPage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { BillingPage } from "./pages/BillingPage";
import { DocumentsPage } from "./pages/DocumentsPage";
import { RatesPage } from "./pages/RatesPage";
import { ReportsPage } from "./pages/ReportsPage";
import { UsersPage } from "./pages/UsersPage";
import { VendorsPage } from "./pages/VendorsPage";

function Protected({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AdminOnly({ children }: { children: ReactNode }) {
  const { role } = useAuth();
  if (role !== "admin") return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function StaffPortal({ children }: { children: ReactNode }) {
  const { role } = useAuth();
  if (role !== "admin" && role !== "contractor" && role !== "government") {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}

function AdminOrGov({ children }: { children: ReactNode }) {
  const { role } = useAuth();
  if (role !== "admin" && role !== "government") {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <Protected>
            <AppLayout />
          </Protected>
        }
      >
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/issues" element={<IssuesPage />} />
        <Route
          path="/billing"
          element={
            <StaffPortal>
              <BillingPage />
            </StaffPortal>
          }
        />
        <Route
          path="/documents"
          element={
            <StaffPortal>
              <DocumentsPage />
            </StaffPortal>
          }
        />
        <Route
          path="/vendors"
          element={
            <AdminOrGov>
              <VendorsPage />
            </AdminOrGov>
          }
        />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/map" element={<MapPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route
          path="/users"
          element={
            <AdminOnly>
              <UsersPage />
            </AdminOnly>
          }
        />
        <Route
          path="/projects"
          element={
            <AdminOnly>
              <ProjectsPage />
            </AdminOnly>
          }
        />
        <Route
          path="/rates"
          element={
            <AdminOnly>
              <RatesPage />
            </AdminOnly>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
