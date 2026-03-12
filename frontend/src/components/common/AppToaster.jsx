import { Toaster } from "react-hot-toast";

import { useTheme } from "../../context/ThemeContext";

export default function AppToaster() {
  const { theme, highContrast } = useTheme();
  const isDark = theme === "dark";

  return (
    <Toaster
      position="top-right"
      containerStyle={{ top: 76, right: 14, zIndex: 9999 }}
      toastOptions={{
        duration: 2600,
        style: {
          borderRadius: "10px",
          border: highContrast ? "1px solid #94a3b8" : "1px solid rgba(148,163,184,0.35)",
          background: isDark ? "#0b1220" : "#ffffff",
          color: isDark ? "#e2e8f0" : "#0f172a",
          boxShadow: "0 10px 25px rgba(2,6,23,0.2)"
        },
        success: {
          iconTheme: {
            primary: "#10b981",
            secondary: isDark ? "#0b1220" : "#ffffff"
          }
        },
        error: {
          iconTheme: {
            primary: "#ef4444",
            secondary: isDark ? "#0b1220" : "#ffffff"
          }
        }
      }}
    />
  );
}
