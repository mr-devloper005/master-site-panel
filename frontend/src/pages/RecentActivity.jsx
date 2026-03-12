import { motion } from "framer-motion";
import { CalendarDays, CheckCircle2, Filter, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { useAppData } from "../context/AppContext";

const dateLabel = (iso) => new Date(iso).toLocaleString();

export default function RecentActivity() {
  const { posts, sites } = useAppData();
  const [query, setQuery] = useState("");
  const [siteFilter, setSiteFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedId, setSelectedId] = useState("");
  const [reviewedIds, setReviewedIds] = useState(() => new Set());

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return [...posts]
      .filter((post) => {
        const matchSite = siteFilter === "all" || post.siteId === siteFilter;
        const matchStatus = statusFilter === "all" || post.status === statusFilter;
        const matchSearch = !query.trim()
          ? true
          : [post.title, post.excerpt, post.author, post.siteName].some((v) => v.toLowerCase().includes(q));
        return matchSite && matchStatus && matchSearch;
      })
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [posts, query, siteFilter, statusFilter]);

  const grouped = useMemo(() => {
    const map = new Map();
    filtered.forEach((post) => {
      const key = new Date(post.date).toDateString();
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(post);
    });
    return Array.from(map.entries());
  }, [filtered]);

  const selected = filtered.find((post) => post.id === selectedId) || filtered[0] || null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">Recent Activity</h1>
        <div className="rounded-lg border border-[var(--border-color)] px-3 py-1 text-xs text-[var(--text-secondary)]">
          {filtered.length} events
        </div>
      </div>

      <section className="glass rounded-panel p-3">
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="min-h-11 w-full rounded-lg border border-[var(--border-color)] pl-9 pr-3 text-sm"
              placeholder="Search title, excerpt, author, site"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <select className="min-h-11 rounded-lg border border-[var(--border-color)] px-3 text-sm" value={siteFilter} onChange={(e) => setSiteFilter(e.target.value)}>
            <option value="all">All Sites</option>
            {sites.map((site) => (
              <option key={site.id} value={site.id}>{site.name}</option>
            ))}
          </select>

          <select className="min-h-11 rounded-lg border border-[var(--border-color)] px-3 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All Status</option>
            <option value="Published">Published</option>
            <option value="Draft">Draft</option>
          </select>
        </div>
      </section>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="glass min-h-0 rounded-panel p-3">
          <div className="mb-2 flex items-center gap-2 text-xs text-[var(--text-secondary)]">
            <Filter size={13} /> Timeline Feed
          </div>

          <div className="scrollbar-thin h-full overflow-y-auto pr-1">
            {grouped.map(([day, dayPosts]) => (
              <div key={day} className="mb-3">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)]">
                  <CalendarDays size={13} /> {day}
                </p>

                <div className="space-y-2">
                  {dayPosts.map((post) => {
                    const isSelected = selected?.id === post.id;
                    const reviewed = reviewedIds.has(post.id);
                    return (
                      <motion.button
                        key={post.id}
                        whileHover={{ x: 2 }}
                        onClick={() => setSelectedId(post.id)}
                        className={`w-full rounded-xl border p-3 text-left transition ${
                          isSelected
                            ? "border-blue-400 bg-blue-50/80 dark:bg-blue-950/30"
                            : "border-[var(--border-color)]"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold">{post.title}</p>
                            <p className="text-xs text-[var(--text-secondary)]">{post.siteName} · {post.author}</p>
                          </div>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] ${post.status === "Published" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                            {post.status}
                          </span>
                        </div>
                        <p className="mt-1 max-h-10 overflow-hidden text-xs text-[var(--text-secondary)]">{post.excerpt}</p>
                        <div className="mt-2 flex items-center justify-between">
                          <span className="text-[11px] text-[var(--text-secondary)]">{dateLabel(post.date)}</span>
                          {reviewed && <span className="text-[11px] text-emerald-600">Reviewed</span>}
                        </div>
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>

        <aside className="glass min-h-0 rounded-panel p-4">
          {!selected ? (
            <p className="text-sm text-[var(--text-secondary)]">No activity found.</p>
          ) : (
            <div className="scrollbar-thin h-full overflow-y-auto pr-1">
              <h2 className="text-lg font-semibold">{selected.title}</h2>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">{selected.siteName} · {selected.author}</p>

              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full border border-[var(--border-color)] px-2 py-1">{selected.status}</span>
                <span className="rounded-full border border-[var(--border-color)] px-2 py-1">{dateLabel(selected.date)}</span>
                <span className="rounded-full border border-[var(--border-color)] px-2 py-1">{selected.category}</span>
              </div>

              <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{selected.excerpt}</p>

              <pre className="mt-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-primary)] p-3 text-xs text-[var(--text-secondary)]">
                {JSON.stringify(selected.content, null, 2)}
              </pre>

              <div className="mt-3 grid grid-cols-1 gap-2">
                {selected.media?.map((item) =>
                  item.type === "DOC" ? (
                    <a key={item.url} href={item.url} target="_blank" rel="noreferrer" className="rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm text-blue-600">
                      Open document preview
                    </a>
                  ) : (
                    <img key={item.url} src={item.url} alt={selected.title} className="h-36 w-full rounded-lg object-cover" />
                  )
                )}
              </div>

              <button
                className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white"
                onClick={() => {
                  const next = new Set(reviewedIds);
                  next.add(selected.id);
                  setReviewedIds(next);
                }}
              >
                <CheckCircle2 size={16} /> Mark as Reviewed
              </button>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
