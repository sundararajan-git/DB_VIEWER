import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "./context/ThemeContext";
import { SocketProvider } from "./context/SocketContext";
import { ToastProvider } from "./context/ToastContext";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { MainLayout } from "./layouts/MainLayout";
import Explorer from "./pages/Explorer";
import SqlLab from "./pages/SqlLab";
import DatabaseConfig from "./pages/DatabaseConfig";
import Schema from "./pages/Schema";
import Login from "./pages/Login";
import "./App.css";

function AppRoutes() {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) return <Login />;

  return (
    <SocketProvider>
      <Router>
        <MainLayout>
          <Routes>
            <Route path="/" element={<Navigate to="/explorer" replace />} />
            <Route path="/explorer" element={<Explorer />} />
            <Route path="/explorer/:tableName" element={<Explorer />} />
            <Route path="/sql-lab" element={<SqlLab />} />
            <Route path="/config" element={<DatabaseConfig />} />
            <Route path="/schema" element={<Schema />} />
            <Route path="/schema/:tableName" element={<Schema />} />
          </Routes>
        </MainLayout>
      </Router>
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
