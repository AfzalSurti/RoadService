import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth";
import { AppLayout } from "./components/AppLayout";
import { BillingPage } from "./pages/BillingPage";
import { ContractorBillingPage } from "./pages/ContractorBillingPage";
import { DashboardPage } from "./pages/DashboardPage";
import { DocumentsPage } from "./pages/DocumentsPage";
import { ExecutivePage } from "./pages/ExecutivePage";
import { IssuesPage } from "./pages/IssuesPage";
import { LandingPage } from "./pages/LandingPage";
import { LoginPage } from "./pages/LoginPage";
import { MapPage } from "./pages/MapPage";
import { MprPage } from "./pages/MprPage";
import {
  AttendancePage,
  BackupDrPage,
  CivilAssetsPage,
  HighwayIncidentsPage,
  IntegrationsPage,
  ItsPage,
  SecurityPage,
  TollPage,
} from "./pages/NhitPages";
import { NotificationsPage } from "./pages/NotificationsPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { QueriesPage } from "./pages/QueriesPage";
import { RatesPage } from "./pages/RatesPage";
import { ReportsPage } from "./pages/ReportsPage";
import { RfiPage } from "./pages/RfiPage";
import { StaffDetailsPage } from "./pages/StaffDetailsPage";
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

function GovOnly({ children }: { children: ReactNode }) {
  const { role } = useAuth();
  if (role !== "government") return <Navigate to="/dashboard" replace />;
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
        <Route path="/staff-details" element={<StaffDetailsPage />} />
        <Route
          path="/queries"
          element={
            <StaffPortal>
              <QueriesPage />
            </StaffPortal>
          }
        />
        <Route
          path="/rfi"
          element={
            <StaffPortal>
              <RfiPage />
            </StaffPortal>
          }
        />
        <Route
          path="/executive"
          element={
            <StaffPortal>
              <ExecutivePage />
            </StaffPortal>
          }
        />
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
          path="/contractor-billing"
          element={
            <StaffPortal>
              <ContractorBillingPage />
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
          path="/mpr"
          element={
            <StaffPortal>
              <MprPage />
            </StaffPortal>
          }
        />
        <Route
          path="/attendance"
          element={
            <AdminOrGov>
              <AttendancePage />
            </AdminOrGov>
          }
        />
        <Route
          path="/security"
          element={
            <StaffPortal>
              <SecurityPage />
            </StaffPortal>
          }
        />
        <Route
          path="/toll"
          element={
            <StaffPortal>
              <TollPage />
            </StaffPortal>
          }
        />
        <Route
          path="/highway-incidents"
          element={
            <StaffPortal>
              <HighwayIncidentsPage />
            </StaffPortal>
          }
        />
        <Route
          path="/its"
          element={
            <StaffPortal>
              <ItsPage />
            </StaffPortal>
          }
        />
        <Route
          path="/civil-assets"
          element={
            <StaffPortal>
              <CivilAssetsPage />
            </StaffPortal>
          }
        />
        <Route
          path="/integrations"
          element={
            <AdminOrGov>
              <IntegrationsPage />
            </AdminOrGov>
          }
        />
        <Route
          path="/backup-dr"
          element={
            <AdminOrGov>
              <BackupDrPage />
            </AdminOrGov>
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
