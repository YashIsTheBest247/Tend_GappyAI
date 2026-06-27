import React, { useEffect, useState } from "react";

type Toast = { id: number; msg: string; kind: "ok" | "err" | "info" };
let pushFn: (t: Omit<Toast, "id">) => void = () => {};
let counter = 0;

export function toast(msg: string, kind: "ok" | "err" | "info" = "ok") {
  pushFn({ msg, kind });
}

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    pushFn = (t) => {
      const id = ++counter;
      setItems((s) => [...s, { ...t, id }]);
      setTimeout(() => setItems((s) => s.filter((x) => x.id !== id)), 3400);
    };
    return () => { pushFn = () => {}; };
  }, []);
  return (
    <div className="toaster">
      {items.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`}>
          <span className="toast-dot" />
          {t.msg}
        </div>
      ))}
    </div>
  );
}
