import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/features/auth/AuthContext";
import { ProtectedRoute } from "./ProtectedRoute";
import { LoginPage } from "@/pages/LoginPage";
import { AdminDashboard } from "@/pages/AdminDashboard";
import { AdminManageAccounts } from "@/pages/AdminManageAccounts";
import { AgentDashboard } from "@/pages/AgentDashboard";
import { AgentCreateClient } from "@/pages/AgentCreateClient";
import { AgentViewTransactions } from "@/pages/AgentViewTransactions";

// Testing CI pipeline

function RootRedirect() {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (user?.role === "admin") {
    return <Navigate to="/admin" replace />;
  }

  return <Navigate to="/agent" replace />;
}

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route element={<ProtectedRoute allowedRoles={["admin"]} />}>
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/accounts" element={<AdminManageAccounts />} />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={["agent"]} />}>
            <Route path="/agent" element={<AgentDashboard />} />
            <Route path="/agent/clients/new" element={<AgentCreateClient />} />
            <Route
              path="/agent/transactions"
              element={<AgentViewTransactions />}
            />
          </Route>

          <Route path="/" element={<RootRedirect />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
