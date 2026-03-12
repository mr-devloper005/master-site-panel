import { BarChart3, Files, Home, Settings, Globe2, Activity } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useState } from "react";

import { useAppData } from "../../context/AppContext";

const navItems = [
  { to: "/", label: "Dashboard", icon: Home },
  { to: "/sites", label: "Sites", icon: Globe2 },
  { to: "/posts", label: "Posts", icon: Files },
  { to: "/activity", label: "Recent Activity", icon: Activity },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/settings", label: "Settings", icon: Settings }
];

export default function Sidebar({ isOpen, onClose }) {
  const { sites, reorderSiteList } = useAppData();
  const [dragId, setDragId] = useState("");

  const ordered = [...sites].sort((a, b) => a.order - b.order).slice(0, 8);

  const swapOrder = (targetId) => {
    if (!dragId || dragId === targetId) return;
    const ids = ordered.map((site) => site.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    const copy = [...ids];
    const [moved] = copy.splice(from, 1);
    copy.splice(to, 0, moved);
    reorderSiteList(copy);
  };

  return (
    <>
      {isOpen && <button aria-label="Close sidebar overlay" className="fixed inset-0 z-20 bg-slate-900/40 lg:hidden" onClick={onClose} />}
      <aside
        className={`fixed left-0 top-16 z-30 h-[calc(100dvh-4rem)] w-72 transform border-r border-[var(--border-color)] bg-[var(--bg-secondary)] p-4 transition-all lg:static lg:top-0 lg:h-[calc(100dvh-4rem)] lg:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="scrollbar-thin h-full overflow-y-auto pr-1">
        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onClose}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${isActive ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" : "hover:bg-slate-100 dark:hover:bg-slate-800"}`
                }
              >
                <Icon size={16} />
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        <div className="mt-6">
          <h3 className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Pinned Sites (Drag)</h3>
          <div className="space-y-1">
            {ordered.map((site) => (
              <button
                key={site.id}
                draggable
                onDragStart={() => setDragId(site.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => swapOrder(site.id)}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <span className="truncate">{site.name}</span>
                <span className="text-xs text-[var(--text-secondary)]">#{site.order + 1}</span>
              </button>
            ))}
          </div>
        </div>
        </div>
      </aside>
    </>
  );
}
