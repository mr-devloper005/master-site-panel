import { createContext, useContext, useEffect, useMemo, useState } from "react";

const ThemeContext = createContext(null);

const STORAGE_KEY = "site-master-theme";
const CONTRAST_KEY = "site-master-contrast";
const prefersDark = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;

export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState(localStorage.getItem(STORAGE_KEY) || (prefersDark() ? "dark" : "light"));
  const [highContrast, setHighContrast] = useState(localStorage.getItem(CONTRAST_KEY) === "true");

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("dark", "light");
    root.classList.add(theme);
    root.classList.toggle("high-contrast", highContrast);
    root.setAttribute("data-theme", theme);
    localStorage.setItem(STORAGE_KEY, theme);
    localStorage.setItem(CONTRAST_KEY, String(highContrast));
  }, [theme, highContrast]);

  const value = useMemo(
    () => ({
      theme,
      highContrast,
      setThemeMode: setTheme,
      setHighContrastMode: setHighContrast,
      toggleTheme: () => setTheme((prev) => (prev === "dark" ? "light" : "dark")),
      toggleContrast: () => setHighContrast((prev) => !prev)
    }),
    [theme, highContrast]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
};
