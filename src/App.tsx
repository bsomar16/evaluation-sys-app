import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import AppLayout from "@/components/AppLayout";
import Dashboard from "@/pages/Dashboard";
import Evaluation from "@/pages/Evaluation";
import Employees from "@/pages/Employees";
import Training from "@/pages/Training";
import Reports from "@/pages/Reports";
import Login from "@/pages/Login";
import AdminPanel from "@/pages/AdminPanel";
import TeamPage from "@/pages/TeamPage";
import InitDatabase from "@/pages/InitDatabase";
import AdminInitializeDB from "@/pages/AdminInitializeDB";
import NotFound from "./pages/NotFound";
import UsersPage from "@/pages/admin/UsersPage";
import RolesPage from "@/pages/admin/RolesPage";
import BranchesPage from "@/pages/admin/BranchesPage";
import DepartmentsPage from "@/pages/admin/ServicesPage";
import EvaluationCriteriaPage from "@/pages/admin/EvaluationCriteriaPage";
import CalculationSystemPage from "@/pages/admin/CalculationSystemPage";
import EvaluationsPage from "@/pages/admin/EvaluationsPage";
import ScheduledPeriodsPage from "@/pages/admin/ScheduledPeriodsPage";
import TrainingPlanningPage from "@/pages/admin/TrainingPlanningPage";
import TrainingPlanningAnalytics from "@/pages/admin/TrainingPlanningAnalytics";
import { EvaluationPeriodGuard } from "@/components/EvaluationPeriodGuard";
import { EvaluationManagementGuard } from "@/components/EvaluationManagementGuard";
import { ModuleAccessGuard } from "@/components/ModuleAccessGuard";
import { TrainingPlanningGuard } from "@/components/TrainingPlanningGuard";
import { TrainingAnalyticsGuard } from "@/components/TrainingAnalyticsGuard";
import SchemaPage from "@/pages/admin/SchemaPage";
import UIStudio from "@/pages/admin/UIStudio";
import Settings from "@/pages/Settings";
import { useEffect } from "react";
import { initializeDatabase } from "@/lib/db-init";
import { isAdminRole } from "@/lib/auth-roles";

const queryClient = new QueryClient();

interface ProtectedRouteProps {
  children: React.ReactNode;
}

interface AdminRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const user = localStorage.getItem("user");
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return <AppLayout>{children}</AppLayout>;
};

const AdminRoute = ({ children }: AdminRouteProps) => {
  const userStr = localStorage.getItem("user");
  const userStr2 = localStorage.getItem("userRole");

  if (!userStr) {
    return <Navigate to="/login" replace />;
  }

  if (!isAdminRole(userStr2)) {
    return <Navigate to="/" replace />;
  }

  return <AppLayout>{children}</AppLayout>;
};

const App = () => {
  useEffect(() => {
    // Démarrage non-bloquant: l'app reste utilisable pendant l'init DB.
    initializeDatabase().catch((error) => {
      console.error(error);
    });
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <AdminPanel />
                </ProtectedRoute>
              }
            />
            <Route
              path="/equipe"
              element={
                <ProtectedRoute>
                  <TeamPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/equipe/:roleId"
              element={
                <ProtectedRoute>
                  <TeamPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/evaluation"
              element={
                <ProtectedRoute>
                  <EvaluationPeriodGuard>
                    <Evaluation />
                  </EvaluationPeriodGuard>
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <ProtectedRoute>
                  <Settings />
                </ProtectedRoute>
              }
            />
            <Route
              path="/employees"
              element={
                <ProtectedRoute>
                  <Employees />
                </ProtectedRoute>
              }
            />
            <Route
              path="/training"
              element={
                <ProtectedRoute>
                  <Training />
                </ProtectedRoute>
              }
            />
            <Route
              path="/reports"
              element={
                <ProtectedRoute>
                  <Reports />
                </ProtectedRoute>
              }
            />
            <Route path="/admin" element={<Navigate to="/" replace />} />
            <Route
              path="/admin/users"
              element={
                <AdminRoute>
                  <UsersPage />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/roles"
              element={
                <ProtectedRoute>
                  <ModuleAccessGuard moduleKey="roles">
                    <RolesPage />
                  </ModuleAccessGuard>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/branches"
              element={
                <ProtectedRoute>
                  <ModuleAccessGuard moduleKey="branches">
                    <BranchesPage />
                  </ModuleAccessGuard>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/departments"
              element={
                <ProtectedRoute>
                  <ModuleAccessGuard moduleKey="departments">
                    <DepartmentsPage />
                  </ModuleAccessGuard>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/evaluation-criteria"
              element={
                <ProtectedRoute>
                  <ModuleAccessGuard moduleKey="evaluation_criteria">
                    <EvaluationCriteriaPage />
                  </ModuleAccessGuard>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/calculation-system"
              element={
                <ProtectedRoute>
                  <ModuleAccessGuard moduleKey="calculation_system">
                    <CalculationSystemPage />
                  </ModuleAccessGuard>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/evaluations"
              element={
                <ProtectedRoute>
                  <EvaluationManagementGuard>
                    <EvaluationsPage />
                  </EvaluationManagementGuard>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/scheduled-periods"
              element={
                <ProtectedRoute>
                  <EvaluationManagementGuard>
                    <ScheduledPeriodsPage />
                  </EvaluationManagementGuard>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/training-planning"
              element={
                <ProtectedRoute>
                  <TrainingPlanningGuard>
                    <TrainingPlanningPage />
                  </TrainingPlanningGuard>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/training-analytics"
              element={
                <ProtectedRoute>
                  <TrainingAnalyticsGuard>
                    <TrainingPlanningAnalytics />
                  </TrainingAnalyticsGuard>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/schema"
              element={
                <AdminRoute>
                  <SchemaPage />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/config"
              element={
                <AdminRoute>
                  <UIStudio />
                </AdminRoute>
              }
            />
            <Route path="/hr" element={<Navigate to="/" replace />} />
            <Route path="/manager" element={<Navigate to="/" replace />} />
            <Route path="/employee" element={<Navigate to="/" replace />} />
            <Route path="/admin-init-db" element={<AdminInitializeDB />} />
            <Route path="/init-db" element={<InitDatabase />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
