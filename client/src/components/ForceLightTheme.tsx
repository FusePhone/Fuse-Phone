import { useEffect } from "react";

export function ForceLightTheme({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const root = document.documentElement;
    const wasDark = root.classList.contains("dark");
    root.classList.remove("dark");
    return () => {
      if (wasDark) {
        root.classList.add("dark");
      }
    };
  }, []);

  return <>{children}</>;
}
