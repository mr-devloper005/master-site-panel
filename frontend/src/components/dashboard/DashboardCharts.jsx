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
  Title,
  Tooltip
} from "chart.js";
import { Bar, Doughnut, Line } from "react-chartjs-2";
import { motion } from "framer-motion";
import { useMemo } from "react";
import { ActivitySquare, Layers3, Radar } from "lucide-react";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, PointElement, LineElement, ArcElement, Filler);

const palette = ["#F59E0B", "#8B5CF6", "#22C55E", "#EC4899", "#06B6D4", "#EF4444", "#14B8A6", "#F97316"];

const buildDailySeries = (posts, days = 30) => {
  const labels = Array.from({ length: days }).map((_, idx) => {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1 - idx));
    return d;
  });

  const map = new Map(labels.map((d) => [d.toISOString().slice(0, 10), 0]));
  posts.forEach((post) => {
    const day = String(post.date || "").slice(0, 10);
    if (map.has(day)) map.set(day, map.get(day) + 1);
  });

  return {
    labels: labels.map((d) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" })),
    values: labels.map((d) => map.get(d.toISOString().slice(0, 10)) || 0)
  };
};

const buildRollingAverage = (values, windowSize = 5) =>
  values.map((_, index) => {
    const start = Math.max(0, index - windowSize + 1);
    const slice = values.slice(start, index + 1);
    const total = slice.reduce((sum, value) => sum + value, 0);
    return Number((total / slice.length).toFixed(2));
  });

export default function DashboardCharts({ sites, posts }) {
  const postsBySite = useMemo(() => {
    return sites
      .map((site) => ({
        site: site.name,
        count: posts.filter((post) => post.siteId === site.id).length
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [sites, posts]);

  const postsOverTime = useMemo(() => buildDailySeries(posts, 30), [posts]);
  const rollingAverage = useMemo(() => buildRollingAverage(postsOverTime.values, 5), [postsOverTime]);

  const categoryMix = useMemo(() => {
    const map = {};
    posts.forEach((post) => {
      const key = post.category || "General";
      map[key] = (map[key] || 0) + 1;
    });
    return map;
  }, [posts]);

  const engagementBySite = useMemo(() => {
    const map = {};
    posts.forEach((post) => {
      if (!map[post.siteName]) map[post.siteName] = 0;
      map[post.siteName] += (post.views || 0) + (post.likes || 0);
    });
    const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 6);
    return {
      labels: sorted.map(([name]) => name),
      values: sorted.map(([, total]) => total)
    };
  }, [posts]);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 900, easing: "easeOutQuart" },
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { labels: { color: "#cbd5e1" } },
      tooltip: {
        backgroundColor: "#020617",
        titleColor: "#e2e8f0",
        bodyColor: "#cbd5e1",
        borderColor: "rgba(148,163,184,0.28)",
        borderWidth: 1
      }
    },
    scales: {
      x: { ticks: { color: "#94a3b8" }, grid: { color: "rgba(148,163,184,0.12)" } },
      y: { ticks: { color: "#94a3b8" }, grid: { color: "rgba(148,163,184,0.12)" } }
    }
  };

  return (
    <section className="grid grid-cols-1 gap-4 xl:grid-cols-12">
      <motion.article initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-panel p-4 xl:col-span-7">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Publishing Pulse</h3>
            <p className="text-xs text-[var(--text-secondary)]">30-day activity trend across all sites</p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border-color)] px-3 py-1 text-xs text-[var(--text-secondary)]">
            <ActivitySquare size={12} /> live trend
          </span>
        </div>
        <div className="h-[300px]">
          <Line
            data={{
              labels: postsOverTime.labels,
              datasets: [{
                label: "Posts",
                data: postsOverTime.values,
                borderColor: "#F59E0B",
                backgroundColor: "rgba(245,158,11,0.16)",
                pointBackgroundColor: postsOverTime.values.map((_, idx) => palette[idx % palette.length]),
                pointBorderColor: postsOverTime.values.map((_, idx) => palette[idx % palette.length]),
                fill: true,
                tension: 0.35,
                pointRadius: 3,
                pointHoverRadius: 6
              }, {
                label: "5-day avg",
                data: rollingAverage,
                borderColor: "#8B5CF6",
                backgroundColor: "transparent",
                pointBackgroundColor: "#8B5CF6",
                pointBorderColor: "#8B5CF6",
                fill: false,
                tension: 0.4,
                pointRadius: 2,
                pointHoverRadius: 5,
                borderDash: [6, 6]
              }]
            }}
            options={options}
          />
        </div>
      </motion.article>

      <motion.article initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-panel p-4 xl:col-span-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Content Mix</h3>
            <p className="text-xs text-[var(--text-secondary)]">Listings, articles, galleries, and general posts</p>
          </div>
          <Radar size={14} className="text-[var(--text-secondary)]" />
        </div>
        <div className="h-[300px]">
          <Doughnut
            data={{
              labels: Object.keys(categoryMix),
              datasets: [{
                data: Object.values(categoryMix),
                backgroundColor: Object.keys(categoryMix).map((_, idx) => palette[idx % palette.length]),
                borderWidth: 0,
                hoverOffset: 10
              }]
            }}
            options={{
              ...options,
              cutout: "64%",
              scales: undefined,
              plugins: {
                ...options.plugins,
                legend: { position: "bottom", labels: { color: "#cbd5e1" } }
              }
            }}
          />
        </div>
      </motion.article>

      <motion.article initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-panel p-4 xl:col-span-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Top Sites by Volume</h3>
            <p className="text-xs text-[var(--text-secondary)]">Highest content-producing sites</p>
          </div>
          <span className="inline-flex items-center gap-1 text-xs text-[var(--text-secondary)]"><Layers3 size={12} /> hover bars</span>
        </div>
        <div className="h-[280px]">
          <Bar
            data={{
              labels: postsBySite.map((item) => item.site),
              datasets: [{
                label: "Posts",
                data: postsBySite.map((item) => item.count),
                backgroundColor: postsBySite.map((_, idx) => palette[idx % palette.length]),
                borderRadius: 12,
                hoverBackgroundColor: postsBySite.map((_, idx) => palette[(idx + 2) % palette.length])
              }]
            }}
            options={{ ...options, plugins: { ...options.plugins, legend: { display: false } } }}
          />
        </div>
      </motion.article>

      <motion.article initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-panel p-4 xl:col-span-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Engagement Capacity</h3>
            <p className="text-xs text-[var(--text-secondary)]">Derived views + likes grouped by site</p>
          </div>
          <span className="text-xs text-[var(--text-secondary)]">interactive comparison</span>
        </div>
        <div className="h-[280px]">
          <Bar
            data={{
              labels: engagementBySite.labels,
              datasets: [{
                label: "Engagement",
                data: engagementBySite.values,
                backgroundColor: engagementBySite.labels.map((_, idx) => `${palette[idx % palette.length]}CC`),
                borderColor: engagementBySite.labels.map((_, idx) => palette[idx % palette.length]),
                borderWidth: 1.5,
                borderRadius: 10
              }]
            }}
            options={{ ...options, indexAxis: "y", plugins: { ...options.plugins, legend: { display: false } } }}
          />
        </div>
      </motion.article>
    </section>
  );
}
