import { Activity, BarChart3, Files, Globe2, Home, Settings } from "lucide-react";
import { NavLink } from "react-router-dom";

const tabs = [
  { to: "/", label: "Home", icon: Home },
  { to: "/sites", label: "Sites", icon: Globe2 },
  { to: "/posts", label: "Posts", icon: Files },
  { to: "/activity", label: "Activity", icon: Activity },
  { to: "/analytics", label: "Charts", icon: BarChart3 },
  { to: "/settings", label: "Settings", icon: Settings }
];

export default function MobileBottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--border-color)] bg-[var(--bg-secondary)] lg:hidden">
      <ul className="grid grid-cols-6">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <li key={tab.to}>
              <NavLink to={tab.to} className={({ isActive }) => `flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] ${isActive ? "text-blue-600" : "text-[var(--text-secondary)]"}`}>
                <Icon size={16} />
                {tab.label}
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
