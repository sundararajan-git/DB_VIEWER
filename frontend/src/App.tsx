import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "./context/ThemeContext";
import { SocketProvider } from "./context/SocketContext";
import { MainLayout } from "./layouts/MainLayout";
import Explorer from "./pages/Explorer";
import SqlLab from "./pages/SqlLab";
import DatabaseConfig from "./pages/DatabaseConfig";
import "./App.css";

export default function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <SocketProvider>
        <Router>
          <MainLayout>
            <Routes>
              <Route path="/" element={<Navigate to="/explorer" replace />} />
              <Route path="/explorer" element={<Explorer />} />
              <Route path="/explorer/:tableName" element={<Explorer />} />
              <Route path="/sql-lab" element={<SqlLab />} />
              <Route path="/config" element={<DatabaseConfig />} />
            </Routes>
          </MainLayout>
        </Router>
      </SocketProvider>
    </ThemeProvider>
  );
}
