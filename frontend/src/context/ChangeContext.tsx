import React, { createContext, useContext, useState, useRef } from "react";

export interface RowChange {
  primaryKey: string;
  pkValue: any;
  operation: "INSERT" | "UPDATE" | "DELETE";
  before: Record<string, any> | null;
  after: Record<string, any> | null;
  changedColumns: string[];
}

export interface TableChange {
  tableName: string;
  rowCount: number;
  rows: RowChange[];
}

export interface ChangeEvent {
  id: string;
  capturedAt: string;
  source: "realtime" | "manual";
  tables: TableChange[];
}

export interface RowVersion {
  version: number;
  timestamp: string;
  data: Record<string, any> | null;
  operation: "INSERT" | "UPDATE" | "DELETE";
}

interface ChangeContextType {
  changeEvents: ChangeEvent[];
  autoCapture: boolean;
  setAutoCapture: (val: boolean) => void;
  rowHistory: Record<string, RowVersion[]>;
  isTimelineOpen: boolean;
  setIsTimelineOpen: (val: boolean) => void;
  selectedRowNode: (RowChange & { tableName: string }) | null;
  setSelectedRowNode: (val: (RowChange & { tableName: string }) | null) => void;
  recordTableSnapshot: (tableName: string, rows: any[], primaryKey: string | null) => void;
  clearEvents: () => void;
  addMockTransaction: () => void;
}

const ChangeContext = createContext<ChangeContextType | undefined>(undefined);

export const ChangeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [changeEvents, setChangeEvents] = useState<ChangeEvent[]>([]);
  const [autoCapture, setAutoCapture] = useState(true);
  const [rowHistory, setRowHistory] = useState<Record<string, RowVersion[]>>({});
  const [isTimelineOpen, setIsTimelineOpen] = useState(false);
  const [selectedRowNode, setSelectedRowNode] = useState<(RowChange & { tableName: string }) | null>(null);

  // Cached row snapshots for comparing updates
  const prevSnapshots = useRef<Record<string, any[]>>({});

  const clearEvents = () => {
    setChangeEvents([]);
    setRowHistory({});
    prevSnapshots.current = {};
  };

  const recordTableSnapshot = (tableName: string, newRows: any[], primaryKey: string | null) => {
    if (!primaryKey) return;
    const oldRows = prevSnapshots.current[tableName] || [];

    if (oldRows.length === 0) {
      // First load: cache the rows and set initial version 1 histories
      prevSnapshots.current[tableName] = newRows;
      newRows.forEach((row) => {
        const pkValue = row[primaryKey];
        if (pkValue !== undefined && pkValue !== null) {
          const key = `${tableName}::${pkValue}`;
          setRowHistory((prev) => {
            if (prev[key]) return prev;
            return {
              ...prev,
              [key]: [
                {
                  version: 1,
                  timestamp: new Date().toISOString(),
                  data: { ...row },
                  operation: "INSERT",
                },
              ],
            };
          });
        }
      });
      return;
    }

    const inserts: RowChange[] = [];
    const updates: RowChange[] = [];
    const deletes: RowChange[] = [];

    const newRowMap = new Map(newRows.map((r) => [r[primaryKey], r]));
    const oldRowMap = new Map(oldRows.map((r) => [r[primaryKey], r]));

    // Check for updates and deletes
    oldRows.forEach((oldRow) => {
      const pkValue = oldRow[primaryKey];
      const newRow = newRowMap.get(pkValue);

      if (!newRow) {
        // Row deleted
        deletes.push({
          primaryKey,
          pkValue,
          operation: "DELETE",
          before: { ...oldRow },
          after: null,
          changedColumns: [],
        });
      } else {
        // Check if columns changed
        const changedColumns: string[] = [];
        Object.keys(newRow).forEach((key) => {
          if (key === "__flash") return;
          if (JSON.stringify(newRow[key]) !== JSON.stringify(oldRow[key])) {
            changedColumns.push(key);
          }
        });

        if (changedColumns.length > 0) {
          updates.push({
            primaryKey,
            pkValue,
            operation: "UPDATE",
            before: { ...oldRow },
            after: { ...newRow },
            changedColumns,
          });
        }
      }
    });

    // Check for inserts
    newRows.forEach((newRow) => {
      const pkValue = newRow[primaryKey];
      if (!oldRowMap.has(pkValue)) {
        inserts.push({
          primaryKey,
          pkValue,
          operation: "INSERT",
          before: null,
          after: { ...newRow },
          changedColumns: [],
        });
      }
    });

    const totalChanges = inserts.length + updates.length + deletes.length;

    if (totalChanges > 0) {
      const isoString = new Date().toISOString();

      // Record row history versions
      setRowHistory((prev) => {
        const updatedHistory = { ...prev };
        
        const appendHist = (pk: any, data: any, op: "INSERT" | "UPDATE" | "DELETE") => {
          const key = `${tableName}::${pk}`;
          const currentList = updatedHistory[key] || [];
          const nextVersion = currentList.length + 1;
          updatedHistory[key] = [
            ...currentList,
            {
              version: nextVersion,
              timestamp: isoString,
              data: data ? { ...data } : null,
              operation: op,
            },
          ];
        };

        inserts.forEach((c) => appendHist(c.pkValue, c.after, "INSERT"));
        updates.forEach((c) => appendHist(c.pkValue, c.after, "UPDATE"));
        deletes.forEach((c) => appendHist(c.pkValue, null, "DELETE"));

        return updatedHistory;
      });

      // If autoCapture is enabled, append to global change timeline
      if (autoCapture) {
        const event: ChangeEvent = {
          id: Math.random().toString(36).substring(2, 10),
          capturedAt: isoString,
          source: "realtime",
          tables: [
            {
              tableName,
              rowCount: totalChanges,
              rows: [...inserts, ...updates, ...deletes],
            },
          ],
        };
        setChangeEvents((prev) => [event, ...prev].slice(0, 100));
      }
    }

    // Cache the snapshot
    prevSnapshots.current[tableName] = newRows;
  };

  const addMockTransaction = () => {
    const transactionId = Math.random().toString(36).substring(2, 10);
    const time = new Date();
    const isoString = time.toISOString();

    const ordersBefore = { id: 1042, customer_id: 88, status: "pending", total_amount: 149.99, updated_at: "2026-06-11T23:32:37Z" };
    const ordersAfter = { id: 1042, customer_id: 88, status: "confirmed", total_amount: 149.99, updated_at: "2026-06-11T23:33:56Z" };

    const inventoryBefore1 = { id: 88, item: "Keyboard", quantity: 12, last_order_id: 1000 };
    const inventoryAfter1 = { id: 88, item: "Keyboard", quantity: 11, last_order_id: 1042 };

    const inventoryBefore2 = { id: 91, item: "Mouse", quantity: 24, last_order_id: 998 };
    const inventoryAfter2 = { id: 91, item: "Mouse", quantity: 23, last_order_id: 1042 };

    const mockEvent: ChangeEvent = {
      id: transactionId,
      capturedAt: isoString,
      source: "manual",
      tables: [
        {
          tableName: "orders",
          rowCount: 2,
          rows: [
            {
              primaryKey: "id",
              pkValue: 1042,
              operation: "UPDATE",
              before: ordersBefore,
              after: ordersAfter,
              changedColumns: ["status", "updated_at"],
            },
            {
              primaryKey: "id",
              pkValue: 1043,
              operation: "INSERT",
              before: null,
              after: { id: 1043, customer_id: 92, status: "pending", total_amount: 89.5, updated_at: isoString },
              changedColumns: [],
            },
          ],
        },
        {
          tableName: "inventory",
          rowCount: 2,
          rows: [
            {
              primaryKey: "id",
              pkValue: 88,
              operation: "UPDATE",
              before: inventoryBefore1,
              after: inventoryAfter1,
              changedColumns: ["quantity", "last_order_id"],
            },
            {
              primaryKey: "id",
              pkValue: 91,
              operation: "UPDATE",
              before: inventoryBefore2,
              after: inventoryAfter2,
              changedColumns: ["quantity", "last_order_id"],
            },
          ],
        },
        {
          tableName: "audit_log",
          rowCount: 1,
          rows: [
            {
              primaryKey: "id",
              pkValue: 5521,
              operation: "INSERT",
              before: null,
              after: { id: 5521, action: "order_insert", details: "Order 1042 confirmed, order 1043 pending", created_at: isoString },
              changedColumns: [],
            },
          ],
        },
      ],
    };

    const updateHistory = (table: string, pk: any, data: any, op: "INSERT" | "UPDATE") => {
      const key = `${table}::${pk}`;
      setRowHistory((prev) => {
        const currentList = prev[key] || [];
        const nextVersion = currentList.length + 1;
        const newVersion: RowVersion = {
          version: nextVersion,
          timestamp: isoString,
          data,
          operation: op,
        };
        if (currentList.length === 0) {
          const v1: RowVersion = {
            version: 1,
            timestamp: new Date(time.getTime() - 60000).toISOString(),
            data: op === "UPDATE" ? (table === "orders" ? { ...ordersBefore, status: "pending" } : { ...inventoryBefore1, quantity: 12 }) : null,
            operation: "INSERT",
          };
          const v2 = { ...newVersion, version: 2 };
          return { ...prev, [key]: [v1, v2] };
        }
        return { ...prev, [key]: [...currentList, newVersion] };
      });
    };

    updateHistory("orders", 1042, ordersAfter, "UPDATE");
    updateHistory("orders", 1043, { id: 1043, customer_id: 92, status: "pending", total_amount: 89.5, updated_at: isoString }, "INSERT");
    updateHistory("inventory", 88, inventoryAfter1, "UPDATE");
    updateHistory("inventory", 91, inventoryAfter2, "UPDATE");
    updateHistory("audit_log", 5521, { id: 5521, action: "order_insert", details: "Order 1042 confirmed, order 1043 pending", created_at: isoString }, "INSERT");

    setChangeEvents((prev) => [mockEvent, ...prev].slice(0, 100));
  };

  return (
    <ChangeContext.Provider
      value={{
        changeEvents,
        autoCapture,
        setAutoCapture,
        rowHistory,
        isTimelineOpen,
        setIsTimelineOpen,
        selectedRowNode,
        setSelectedRowNode,
        recordTableSnapshot,
        clearEvents,
        addMockTransaction,
      }}
    >
      {children}
    </ChangeContext.Provider>
  );
};

export const useChange = () => {
  const context = useContext(ChangeContext);
  if (!context) throw new Error("useChange must be used within a ChangeProvider");
  return context;
};
