import { useUploadProgress } from "@/contexts/UploadProgressContext";
import { X, CloudUpload, Check, AlertCircle } from "lucide-react";
import { useEffect, useRef } from "react";

export function UploadProgressNotification() {
  const { entries, dismissBatch } = useUploadProgress();
  const autoDismissTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const currentIds = new Set(entries.map(e => e.id));
    autoDismissTimers.current.forEach((timer, id) => {
      if (!currentIds.has(id)) {
        clearTimeout(timer);
        autoDismissTimers.current.delete(id);
      }
    });
    for (const entry of entries) {
      const isDone = entry.completed + entry.failed >= entry.total;
      if (isDone && !autoDismissTimers.current.has(entry.id)) {
        const timer = setTimeout(() => {
          dismissBatch(entry.id);
          autoDismissTimers.current.delete(entry.id);
        }, 5000);
        autoDismissTimers.current.set(entry.id, timer);
      }
    }
  }, [entries, dismissBatch]);

  useEffect(() => {
    return () => {
      autoDismissTimers.current.forEach(t => clearTimeout(t));
      autoDismissTimers.current.clear();
    };
  }, []);

  if (entries.length === 0) return null;

  return (
    <div className="fixed top-2 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-1.5 w-[calc(100%-1rem)] max-w-sm" data-testid="upload-progress-notifications">
      {entries.map(entry => {
        const isDone = entry.completed + entry.failed >= entry.total;
        const hasFailed = entry.failed > 0;
        const pct = entry.total > 0 ? Math.round(((entry.completed + entry.failed) / entry.total) * 100) : 0;

        return (
          <div
            key={entry.id}
            className="relative rounded-xl shadow-lg border bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 overflow-hidden animate-in slide-in-from-top-2 duration-300"
            data-testid={`upload-batch-${entry.id}`}
          >
            <div className="flex items-center gap-2.5 px-3 py-2.5">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                isDone
                  ? hasFailed
                    ? "bg-amber-100 dark:bg-amber-900/30"
                    : "bg-green-100 dark:bg-green-900/30"
                  : "bg-blue-100 dark:bg-blue-900/30"
              }`}>
                {isDone ? (
                  hasFailed ? (
                    <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  ) : (
                    <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
                  )
                ) : (
                  <CloudUpload className="w-4 h-4 text-blue-600 dark:text-blue-400 animate-pulse" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">
                  {entry.projectName}
                </p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400">
                  {isDone ? (
                    hasFailed
                      ? `${entry.completed} uploaded, ${entry.failed} failed`
                      : `${entry.completed} photo${entry.completed !== 1 ? 's' : ''} uploaded`
                  ) : (
                    `${entry.completed} of ${entry.total} · ${pct}%`
                  )}
                </p>
              </div>

              <button
                className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors shrink-0"
                onClick={() => dismissBatch(entry.id)}
                data-testid={`dismiss-upload-${entry.id}`}
              >
                <X className="w-3 h-3 text-gray-400" />
              </button>
            </div>

            {!isDone && (
              <div className="h-0.5 bg-gray-100 dark:bg-gray-800">
                <div
                  className="h-full bg-blue-500 transition-all duration-500 ease-out"
                  style={{ width: `${pct}%` }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
