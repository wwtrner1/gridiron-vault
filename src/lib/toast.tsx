import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { Icon } from "../components/Icon";
import { uid } from "./types";

/** One button on a toast, e.g. Undo after a delete. The toast stays longer so there's time to press it. */
export type ToastAction = { label: string; run: () => void };
type Toast = { id: string; text: string; bad?: boolean; action?: ToastAction };

const ToastContext = createContext<(text: string, bad?: boolean, action?: ToastAction) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);

  const push = useCallback((text: string, bad?: boolean, action?: ToastAction) => {
    const id = uid("t");
    setItems((list) => [...list, { id, text, bad, action }]);
    window.setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), action ? 8000 : 3600);
  }, []);

  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {items.length > 0 && (
        <div className="toast-wrap" role="status" aria-live="polite">
          {items.map((t) => (
            <div key={t.id} className={`toast${t.bad ? " is-bad" : ""}`}>
              <Icon name={t.bad ? "close" : "check"} size={16} />
              <span>{t.text}</span>
              {t.action && (
                <button
                  type="button"
                  className="toast-act"
                  onClick={() => {
                    t.action?.run();
                    setItems((list) => list.filter((x) => x.id !== t.id));
                  }}
                >
                  {t.action.label}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
