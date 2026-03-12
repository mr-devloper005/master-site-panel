import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip
} from "chart.js";
import { Bar, Doughnut, Line } from "react-chartjs-2";
import { Download, Filter, Layers3, Search, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";

import { useAppData } from "../context/AppContext";

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Tooltip, Legend, Filler);

const colorSet = ["#F59E0B", "#8B5CF6", "#22C55E", "#EC4899", "#06B6D4", "#EF4444", "#14B8A6", "#F97316"];
const dashboardCardColors = {
  sky: "bg-sky-600",
  violet: "bg-violet-600",
  emerald: "bg-emerald-600",
  amber: "bg-amber-500"
};

const isWithinLastDays = (iso, days) => {
  if (!days) return true;
  const now = Date.now();
  const then = new Date(iso).getTime();
  return now - then <= days * 24 * 60 * 60 * 1000;
};

const buildDailySeries = (records, days) => {
  const labels = Array.from({ length: days }).map((_, idx) => {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1 - idx));
    return d;
  });

  const map = new Map(labels.map((d) => [d.toISOString().slice(0, 10), 0]));
  records.forEach((post) => {
    const day = String(post.date || "").slice(0, 10);
    if (map.has(day)) map.set(day, map.get(day) + 1);
  });

  return {
    labels: labels.map((d) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" })),
    values: labels.map((d) => map.get(d.toISOString().slice(0, 10)) || 0)
  };
};

export default function Analytics() {
  const { posts, sites } = useAppData();

  const [scope, setScope] = useState("overall");
  const [siteId, setSiteId] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [range, setRange] = useState("30");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [runtimeFilter, setRuntimeFilter] = useState("all");
  const [authorQuery, setAuthorQuery] = useState("");
  const [minViews, setMinViews] = useState("");

  const filteredPosts = useMemo(() => {
    const days = Number(range);
    const activeSiteIds = runtimeFilter === "all"
      ? null
      : new Set(
          sites
            .filter((site) => (site.runtime?.status || "UNKNOWN") === runtimeFilter)
            .map((site) => site.id)
        );
    const authorNeedle = authorQuery.trim().toLowerCase();
    const minViewsValue = minViews ? Number(minViews) : 0;

    return posts.filter((post) => {
      const scopeOk = scope === "overall" || siteId === "all" ? true : post.siteId === siteId;
      const statusOk = statusFilter === "all" ? true : post.status === statusFilter;
      const dateOk = isWithinLastDays(post.date, days);
      const categoryOk = categoryFilter === "all" ? true : post.category === categoryFilter;
      const runtimeOk = activeSiteIds ? activeSiteIds.has(post.siteId) : true;
      const authorOk = authorNeedle ? String(post.author || "").toLowerCase().includes(authorNeedle) : true;
      const viewsOk = minViews ? Number(post.views || 0) >= minViewsValue : true;
      return scopeOk && statusOk && dateOk && categoryOk && runtimeOk && authorOk && viewsOk;
    });
  }, [posts, sites, scope, siteId, statusFilter, range, categoryFilter, runtimeFilter, authorQuery, minViews]);

  const topSites = useMemo(() => {
    return sites
      .map((site) => ({
        name: site.name,
        count: filteredPosts.filter((post) => post.siteId === site.id).length
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [sites, filteredPosts]);

  const growth = useMemo(() => buildDailySeries(filteredPosts, Number(range)), [filteredPosts, range]);

  const byCategory = useMemo(() => {
    const map = {};
    filteredPosts.forEach((post) => {
      map[post.category || "General"] = (map[post.category || "General"] || 0) + 1;
    });
    return map;
  }, [filteredPosts]);

  const engagementSeries = useMemo(() => {
    const map = {};
    filteredPosts.forEach((post) => {
      if (!map[post.siteName]) map[post.siteName] = 0;
      map[post.siteName] += (post.views || 0) + (post.likes || 0);
    });
    const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 8);
    return {
      labels: sorted.map(([name]) => name),
      values: sorted.map(([, total]) => total)
    };
  }, [filteredPosts]);

  const statusSplit = useMemo(() => {
    const published = filteredPosts.filter((p) => p.status === "Published").length;
    const draft = filteredPosts.filter((p) => p.status === "Draft").length;
    return [published, draft, Math.max(filteredPosts.length - published - draft, 0)];
  }, [filteredPosts]);

  const authorBreakdown = useMemo(() => {
    const map = {};
    filteredPosts.forEach((post) => {
      map[post.author] = (map[post.author] || 0) + 1;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [filteredPosts]);

  const summary = useMemo(() => {
    const totalViews = filteredPosts.reduce((sum, post) => sum + (post.views || 0), 0);
    const totalLikes = filteredPosts.reduce((sum, post) => sum + (post.likes || 0), 0);
    const avgViews = filteredPosts.length ? Math.round(totalViews / filteredPosts.length) : 0;
    const avgLikes = filteredPosts.length ? Math.round(totalLikes / filteredPosts.length) : 0;
    return { totalViews, totalLikes, avgViews, avgLikes };
  }, [filteredPosts]);

  const runtimeStatuses = useMemo(
    () => ["ONLINE", "DEGRADED", "OFFLINE", "UNKNOWN"].filter((status) =>
      sites.some((site) => (site.runtime?.status || "UNKNOWN") === status)
    ),
    [sites]
  );

  const categories = useMemo(
    () => Array.from(new Set(posts.map((post) => post.category || "General"))).sort(),
    [posts]
  );

  const exportPNG = () => {
    const canvas = document.querySelector("#analytics-main-chart canvas");
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = "analytics-main-chart.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const exportCSV = () => {
    const rows = ["id,title,site,author,date,status,views,likes,category"];
    filteredPosts.forEach((post) => {
      rows.push(
        [post.id, post.title, post.siteName, post.author, post.date, post.status, post.views, post.likes, post.category]
          .map((x) => `"${String(x).replaceAll('"', '""')}"`)
          .join(",")
      );
    });
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "analytics-filtered.csv";
    link.click();
  };

  const animatedOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    animation: { duration: 900, easing: "easeOutQuart" },
    plugins: {
      legend: { labels: { color: "#94a3b8" } },
      tooltip: {
        backgroundColor: "#0f172a",
        titleColor: "#e2e8f0",
        bodyColor: "#cbd5e1",
        borderColor: "#334155",
        borderWidth: 1
      }
    },
    scales: {
      x: { ticks: { color: "#94a3b8" }, grid: { color: "rgba(148,163,184,0.15)" } },
      y: { ticks: { color: "#94a3b8" }, grid: { color: "rgba(148,163,184,0.15)" } }
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">Analytics</h1>
        <div className="flex flex-wrap gap-2">
          <button className="rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm" onClick={exportPNG}><Download size={14} className="mr-1 inline" />PNG</button>
          <button className="rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm" onClick={exportCSV}><Download size={14} className="mr-1 inline" />CSV</button>
        </div>
      </div>

      <section className="glass rounded-panel p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-color)] px-2 py-1 text-xs"><Filter size={12} /> Filters</span>
          <button className={`rounded-lg px-3 py-2 text-sm ${scope === "overall" ? "bg-blue-600 text-white" : "border border-[var(--border-color)]"}`} onClick={() => { setScope("overall"); setSiteId("all"); }}>Overall</button>
          <button className={`rounded-lg px-3 py-2 text-sm ${scope === "site" ? "bg-blue-600 text-white" : "border border-[var(--border-color)]"}`} onClick={() => setScope("site")}>By Site</button>

          {scope === "site" && (
            <select className="min-h-10 rounded-lg border border-[var(--border-color)] px-3 text-sm" value={siteId} onChange={(e) => setSiteId(e.target.value)}>
              <option value="all">All Sites</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>{site.name}</option>
              ))}
            </select>
          )}

          <select className="min-h-10 rounded-lg border border-[var(--border-color)] px-3 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All Status</option>
            <option value="Published">Published</option>
            <option value="Draft">Draft</option>
          </select>

          <select className="min-h-10 rounded-lg border border-[var(--border-color)] px-3 text-sm" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="all">All Categories</option>
            {categories.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>

          <select className="min-h-10 rounded-lg border border-[var(--border-color)] px-3 text-sm" value={runtimeFilter} onChange={(e) => setRuntimeFilter(e.target.value)}>
            <option value="all">All Runtime</option>
            {runtimeStatuses.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>

          <select className="min-h-10 rounded-lg border border-[var(--border-color)] px-3 text-sm" value={range} onChange={(e) => setRange(e.target.value)}>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </select>

          <div className="relative min-w-[210px] flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
            <input className="min-h-10 w-full rounded-lg border border-[var(--border-color)] bg-transparent pl-9 pr-3 text-sm" placeholder="Filter by author" value={authorQuery} onChange={(e) => setAuthorQuery(e.target.value)} />
          </div>

          <input type="number" min="0" className="min-h-10 w-[140px] rounded-lg border border-[var(--border-color)] bg-transparent px-3 text-sm" placeholder="Min views" value={minViews} onChange={(e) => setMinViews(e.target.value)} />

          <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-[var(--border-color)] px-3 py-1 text-xs text-[var(--text-secondary)]">
            <Sparkles size={12} /> {filteredPosts.length} records
          </span>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <motion.article whileHover={{ y: -3 }} className={`rounded-panel border border-white/10 ${dashboardCardColors.sky} p-4 text-white shadow-panel`}>
          <p className="text-xs text-white/75">Filtered Posts</p>
          <p className="mt-2 text-3xl font-bold">{filteredPosts.length}</p>
        </motion.article>
        <motion.article whileHover={{ y: -3 }} className={`rounded-panel border border-white/10 ${dashboardCardColors.violet} p-4 text-white shadow-panel`}>
          <p className="text-xs text-white/75">Total Views</p>
          <p className="mt-2 text-3xl font-bold">{summary.totalViews}</p>
        </motion.article>
        <motion.article whileHover={{ y: -3 }} className={`rounded-panel border border-white/10 ${dashboardCardColors.emerald} p-4 text-white shadow-panel`}>
          <p className="text-xs text-white/75">Total Likes</p>
          <p className="mt-2 text-3xl font-bold">{summary.totalLikes}</p>
        </motion.article>
        <motion.article whileHover={{ y: -3 }} className={`rounded-panel border border-white/10 ${dashboardCardColors.amber} p-4 text-white shadow-panel`}>
          <p className="text-xs text-white/75">Avg Views / Post</p>
          <p className="mt-2 text-3xl font-bold">{summary.avgViews}</p>
        </motion.article>
      </section>

      <div className="scrollbar-thin min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        <motion.section id="analytics-main-chart" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-panel p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Publishing Trend</h2>
            <span className="text-xs text-[var(--text-secondary)]">Filtered time-series</span>
          </div>
          <div className="h-[280px]">
            <Line
              data={{
                labels: growth.labels,
                datasets: [
                  {
                    label: "Posts",
                    data: growth.values,
                    borderColor: "#F59E0B",
                    backgroundColor: "rgba(245,158,11,0.2)",
                    fill: true,
                    tension: 0.36,
                    pointRadius: 3,
                    pointHoverRadius: 6,
                    pointBackgroundColor: growth.values.map((_, idx) => colorSet[idx % colorSet.length]),
                    pointBorderColor: growth.values.map((_, idx) => colorSet[idx % colorSet.length])
                  }
                ]
              }}
              options={animatedOptions}
            />
          </div>
        </motion.section>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-panel p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Top Sites by Volume</h2>
              <span className="inline-flex items-center gap-1 text-xs text-[var(--text-secondary)]"><Layers3 size={12} /> Hover bars</span>
            </div>
            <div className="h-[280px]">
              <Bar
                data={{
                  labels: topSites.map((s) => s.name),
                  datasets: [{
                    label: "Posts",
                    data: topSites.map((s) => s.count),
                    backgroundColor: topSites.map((_, idx) => colorSet[idx % colorSet.length]),
                    borderRadius: 10,
                    hoverBackgroundColor: topSites.map((_, idx) => colorSet[(idx + 2) % colorSet.length])
                  }]
                }}
                options={{ ...animatedOptions, indexAxis: "y", plugins: { ...animatedOptions.plugins, legend: { display: false } } }}
              />
            </div>
          </motion.section>

          <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-panel p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Category Mix</h2>
              <span className="text-xs text-[var(--text-secondary)]">Interactive doughnut</span>
            </div>
            <div className="h-[280px]">
              <Doughnut
                data={{
                  labels: Object.keys(byCategory),
                  datasets: [{
                    label: "Category",
                    data: Object.values(byCategory),
                    backgroundColor: Object.keys(byCategory).map((_, idx) => colorSet[idx % colorSet.length]),
                    hoverOffset: 12,
                    borderWidth: 0
                  }]
                }}
                options={{
                  ...animatedOptions,
                  cutout: "62%",
                  scales: undefined,
                  plugins: {
                    ...animatedOptions.plugins,
                    legend: { position: "bottom", labels: { color: "#94a3b8" } }
                  }
                }}
              />
            </div>
          </motion.section>
        </div>

        <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-panel p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Engagement by Site (Views + Likes)</h2>
            <span className="text-xs text-[var(--text-secondary)]">Colorful interactive comparison</span>
          </div>
          <div className="h-[300px]">
            <Bar
              data={{
                labels: engagementSeries.labels,
                datasets: [{
                  label: "Engagement",
                  data: engagementSeries.values,
                  backgroundColor: engagementSeries.labels.map((_, idx) => `${colorSet[idx % colorSet.length]}CC`),
                  borderColor: engagementSeries.labels.map((_, idx) => colorSet[idx % colorSet.length]),
                  borderWidth: 1.2,
                  borderRadius: 8
                }]
              }}
              options={{ ...animatedOptions, plugins: { ...animatedOptions.plugins, legend: { display: false } } }}
            />
          </div>
        </motion.section>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-panel p-4">
            <h2 className="mb-3 text-sm font-semibold">Status Distribution</h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div className="rounded-xl border border-[var(--border-color)] bg-emerald-500/10 p-4">
                <p className="text-xs text-[var(--text-secondary)]">Published</p>
                <p className="mt-1 text-2xl font-bold text-emerald-500">{statusSplit[0]}</p>
              </div>
              <div className="rounded-xl border border-[var(--border-color)] bg-amber-500/10 p-4">
                <p className="text-xs text-[var(--text-secondary)]">Draft</p>
                <p className="mt-1 text-2xl font-bold text-amber-500">{statusSplit[1]}</p>
              </div>
              <div className="rounded-xl border border-[var(--border-color)] bg-slate-500/10 p-4">
                <p className="text-xs text-[var(--text-secondary)]">Other</p>
                <p className="mt-1 text-2xl font-bold text-slate-300">{statusSplit[2]}</p>
              </div>
            </div>
          </motion.section>

          <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-panel p-4">
            <h2 className="mb-3 text-sm font-semibold">Top Authors</h2>
            <div className="space-y-2">
              {authorBreakdown.length === 0 ? (
                <p className="text-sm text-[var(--text-secondary)]">No author data for current filters.</p>
              ) : (
                authorBreakdown.map(([author, count], idx) => (
                  <div key={author} className="flex items-center justify-between rounded-xl border border-[var(--border-color)] px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold text-slate-950" style={{ backgroundColor: colorSet[idx % colorSet.length] }}>
                        {author.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="text-sm">{author}</span>
                    </div>
                    <span className="text-xs text-[var(--text-secondary)]">{count} posts</span>
                  </div>
                ))
              )}
            </div>
          </motion.section>
        </div>
      </div>
    </div>
  );
}
