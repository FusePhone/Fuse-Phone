import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export interface UploadEntry {
  id: string;
  projectId: number;
  projectName: string;
  total: number;
  completed: number;
  failed: number;
  startedAt: number;
}

interface UploadProgressContextType {
  entries: UploadEntry[];
  startBatch: (projectId: number, projectName: string, count: number) => string;
  incrementTotal: (batchId: string) => void;
  markCompleted: (batchId: string) => void;
  markFailed: (batchId: string) => void;
  dismissBatch: (batchId: string) => void;
}

const UploadProgressContext = createContext<UploadProgressContextType | null>(null);

export function UploadProgressProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<UploadEntry[]>([]);

  const startBatch = useCallback((projectId: number, projectName: string, count: number) => {
    const id = `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setEntries(prev => [{
      id,
      projectId,
      projectName,
      total: count,
      completed: 0,
      failed: 0,
      startedAt: Date.now(),
    }, ...prev]);
    return id;
  }, []);

  const incrementTotal = useCallback((batchId: string) => {
    setEntries(prev => prev.map(e =>
      e.id === batchId ? { ...e, total: e.total + 1 } : e
    ));
  }, []);

  const markCompleted = useCallback((batchId: string) => {
    setEntries(prev => prev.map(e =>
      e.id === batchId ? { ...e, completed: e.completed + 1 } : e
    ));
  }, []);

  const markFailed = useCallback((batchId: string) => {
    setEntries(prev => prev.map(e =>
      e.id === batchId ? { ...e, failed: e.failed + 1 } : e
    ));
  }, []);

  const dismissBatch = useCallback((batchId: string) => {
    setEntries(prev => prev.filter(e => e.id !== batchId));
  }, []);

  return (
    <UploadProgressContext.Provider value={{ entries, startBatch, incrementTotal, markCompleted, markFailed, dismissBatch }}>
      {children}
    </UploadProgressContext.Provider>
  );
}

export function useUploadProgress() {
  const ctx = useContext(UploadProgressContext);
  if (!ctx) throw new Error("useUploadProgress must be used within UploadProgressProvider");
  return ctx;
}
