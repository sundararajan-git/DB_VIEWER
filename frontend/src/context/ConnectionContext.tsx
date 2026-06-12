import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useSocket } from "./SocketContext";
import { apiFetch } from "@/lib/apiFetch";

export interface ActiveConnection {
  id: string;
  type: string;
  server: string;
  database: string;
  user: string;
  port: string;
  label: string;
  connectedAt: string;
}

interface ConnectionContextType {
  connections: ActiveConnection[];
  activeConnectionId: string | null;
  setActiveConnectionId: (id: string | null) => void;
  refreshConnections: () => Promise<void>;
}

const ConnectionContext = createContext<ConnectionContextType>({
  connections: [],
  activeConnectionId: null,
  setActiveConnectionId: () => {},
  refreshConnections: async () => {},
});

export const useConnection = () => useContext(ConnectionContext);

export const ConnectionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { socket } = useSocket();
  const [connections, setConnections] = useState<ActiveConnection[]>([]);
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null);

  const applyConnectionList = useCallback((list: ActiveConnection[]) => {
    setConnections(list);
    setActiveConnectionId(prev => {
      if (list.length === 0) return null;
      if (prev && list.find(c => c.id === prev)) return prev;
      return list[0].id;
    });
  }, []);

  const refreshConnections = useCallback(async () => {
    try {
      const res = await apiFetch("/api/active-connections");
      if (res.ok) {
        const list: ActiveConnection[] = await res.json();
        applyConnectionList(list);
      }
    } catch (e) {}
  }, [applyConnectionList]);

  useEffect(() => {
    refreshConnections();
  }, []);

  useEffect(() => {
    if (!socket) return;
    const handle = (list: ActiveConnection[]) => applyConnectionList(list);
    socket.on("connections_updated", handle);
    return () => { socket.off("connections_updated", handle); };
  }, [socket, applyConnectionList]);

  return (
    <ConnectionContext.Provider value={{ connections, activeConnectionId, setActiveConnectionId, refreshConnections }}>
      {children}
    </ConnectionContext.Provider>
  );
};
