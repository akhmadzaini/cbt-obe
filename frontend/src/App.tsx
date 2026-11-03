import { useEffect, useState, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import type { Role } from "./lib/types";
import AdminPage from "./pages/Admin";
import ExamListPage from "./pages/ExamList";
import ExamRunnerPage from "./pages/ExamRunner";
import LoginPage from "./pages/Login";

function MaintenanceBanner() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const response = await fetch("/api/health", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as {
          maintenance?: boolean;
          maintenanceMessage?: string | null;
        };
        if (cancelled) return;
        setMessage(
          data.maintenance
            ? data.maintenanceMessage ?? "Sistem sedang dalam pemeliharaan."
            : null,
        );
      } catch {
        // Backend mungkin sedang restart; coba lagi pada interval berikutnya.
      }
    };

    void check();
    const timer = setInterval(check, 15_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  if (!message) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-[100] bg-amber-500 px-4 py-2 text-center text-sm font-semibold text-white shadow-lg">
      {message}
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
      Memuat...
    </div>
  );
}

function RequireAuth({
  children,
  roles,
}: {
  children: ReactNode;
  roles?: Role[];
}) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function HomePage() {
  const { user } = useAuth();
  if (user?.role === "student") return <ExamListPage />;
  return <Navigate to="/admin" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <MaintenanceBanner />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <HomePage />
            </RequireAuth>
          }
        />
        <Route
          path="/exam/:examId"
          element={
            <RequireAuth roles={["student"]}>
              <ExamRunnerPage />
            </RequireAuth>
          }
        />
        <Route
          path="/admin"
          element={
            <RequireAuth roles={["admin", "teacher"]}>
              <AdminPage />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
