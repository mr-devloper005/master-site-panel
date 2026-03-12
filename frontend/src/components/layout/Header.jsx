import { Menu, Moon, Search, Sun, UserCircle2 } from "lucide-react";
import { useMemo, useState } from "react";

import { useTheme } from "../../context/ThemeContext";
import { useAuth } from "../../context/AuthContext";
import { useAppData } from "../../context/AppContext";

export default function Header({ onMenuToggle }) {
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const { globalQuery, setGlobalQuery, sites, posts } = useAppData();
  const [openProfile, setOpenProfile] = useState(false);

  const suggestions = useMemo(() => {
    if (!globalQuery.trim()) return [];
    const q = globalQuery.toLowerCase();
    const siteMatches = sites
      .filter((site) => site.name.toLowerCase().includes(q))
      .slice(0, 3)
      .map((site) => ({ id: site.id, type: "site", label: site.name }));

    const postMatches = posts
      .filter((post) => post.title.toLowerCase().includes(q) || post.author.toLowerCase().includes(q))
      .slice(0, 4)
      .map((post) => ({ id: post.id, type: "post", label: post.title }));

    return [...siteMatches, ...postMatches];
  }, [globalQuery, sites, posts]);

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border-color)] bg-[var(--bg-secondary)]/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1800px] items-center gap-3 px-3 sm:px-6">
        <button aria-label="Toggle sidebar" className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800 lg:hidden" onClick={onMenuToggle}>
          <Menu size={20} />
        </button>

        <div className="hidden items-center gap-2 sm:flex">
          <div className="rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 px-2 py-1 text-sm font-bold text-white">SM</div>
          <span className="text-sm font-semibold">SiteMaster Pro</span>
        </div>

        <div className="relative ml-auto w-full max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            aria-label="Global search"
            value={globalQuery}
            onChange={(e) => setGlobalQuery(e.target.value)}
            placeholder="Search posts, sites, authors"
            className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-primary)] py-2 pl-9 pr-3 text-sm"
          />
          {suggestions.length > 0 && (
            <ul className="absolute mt-2 w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-1 shadow-panel">
              {suggestions.map((item) => (
                <li key={`${item.type}-${item.id}`} className="rounded-lg px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800">
                  <span className="mr-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs uppercase dark:bg-slate-700">{item.type}</span>
                  {item.label}
                </li>
              ))}
            </ul>
          )}
        </div>

        <button aria-label="Toggle theme" className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={toggleTheme}>
          {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <div className="relative">
          <button aria-label="User menu" className="flex items-center gap-2 rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => setOpenProfile((p) => !p)}>
            <img src={user?.avatar} alt="user avatar" className="h-8 w-8 rounded-full" />
            <span className="hidden text-sm sm:block">{user?.name}</span>
          </button>
          {openProfile && (
            <div className="absolute right-0 mt-2 w-48 rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-1 shadow-panel">
              <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"><UserCircle2 size={16} />Profile</button>
              <button className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800">Settings</button>
              <button className="w-full rounded-lg px-3 py-2 text-left text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30" onClick={logout}>Logout</button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
