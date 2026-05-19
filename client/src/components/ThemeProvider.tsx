import { createContext, useContext, useEffect, useState } from "react";
import { shouldForceDarkTheme } from "@/lib/domain";

type Theme = "light" | "dark";

type ThemeContextType = {
  theme: Theme;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextType>({
  theme: "light",
  toggleTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const forceDark = shouldForceDarkTheme();

  const [theme, setTheme] = useState<Theme>(() => {
    if (forceDark) return "dark";
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("fuse-phone-theme");
      if (stored === "dark" || stored === "light") return stored;
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return "light";
  });

  useEffect(() => {
    const root = document.documentElement;
    const activeTheme = forceDark ? "dark" : theme;
    if (activeTheme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    if (!forceDark) {
      localStorage.setItem("fuse-phone-theme", theme);
    }
  }, [theme, forceDark]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  };

  return (
    <ThemeContext.Provider value={{ theme: forceDark ? "dark" : theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
