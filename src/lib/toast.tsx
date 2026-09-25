import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { Icon } from "../components/Icon";
import { uid } from "./types";

type Toast = { id: string; text: string; bad?: boolean };

const ToastContext = createContext<(text: string, bad?: boolean) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);

  const push = useCallback((text: string, bad?: boolean) => {
    const id = uid("t");
    setItems((list) => [...list, { id, text, bad }]);
    window.setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), 3600);
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
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
