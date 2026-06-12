import { Suspense, lazy } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "./context/ThemeContext";
import { SocketProvider } from "./context/SocketContext";
import { ToastProvider } from "./context/ToastContext";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ConnectionProvider } from "./context/ConnectionContext";
import { ChangeProvider } from "./context/ChangeContext";
import { MainLayout } from "./layouts/MainLayout";
import Login from "./pages/Login";
import "./App.css";

const Explorer = lazy(() => import("./pages/Explorer"));
const SqlLab = lazy(() => import("./pages/SqlLab"));
const Schema = lazy(() => import("./pages/Schema"));
const Settings = lazy(() => import("./pages/Settings"));
const ChangesDevTools = lazy(() => import("./pages/ChangesDevTools"));

function AppRoutes() {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) return <Login />;

  return (
    <SocketProvider>
      <ConnectionProvider>
        <ChangeProvider>
          <Router>
            <MainLayout>
              <Suspense fallback={null}>
                <Routes>
                  <Route path="/" element={<Navigate to="/explorer" replace />} />
                  <Route path="/explorer" element={<Explorer />} />
                  <Route path="/explorer/:tableName" element={<Explorer />} />
                  <Route path="/sql-lab" element={<SqlLab />} />
                  <Route path="/config" element={<Navigate to="/settings?tab=connections" replace />} />
                  <Route path="/schema" element={<Schema />} />
                  <Route path="/schema/:tableName" element={<Schema />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/changes" element={<ChangesDevTools />} />
                </Routes>
              </Suspense>
            </MainLayout>
          </Router>
        </ChangeProvider>
      </ConnectionProvider>
    </SocketProvider>
  );
}

export default function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <ToastProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
