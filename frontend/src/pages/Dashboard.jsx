import {
  Activity,
  BadgeCheck,
  Globe2,
  PenSquare,
  Sparkles,
  TrendingUp,
  Wifi,
  Zap
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";

import StatCard from "../components/dashboard/StatCard";
import DashboardCharts from "../components/dashboard/DashboardCharts";
import SiteFormModal from "../components/sites/SiteFormModal";
import { useAppData } from "../context/AppContext";

const isWithinLastDays = (iso, days) => {
  const then = new Date(iso).getTime();
  return Date.now() - then <= days * 24 * 60 * 60 * 1000;
};

export default function Dashboard() {
  const { sites, posts, dashboardSummary, createSite } = useAppData();
  const [openAddSite, setOpenAddSite] = useState(false);

  const metrics = useMemo(() => {
    if (dashboardSummary) {
      const totalSites = Number(dashboardSummary.totalSites || 0);
      const publishedPosts = Number(dashboardSummary.publishedPosts || 0);
      const totalPosts = publishedPosts + Number(dashboardSummary.draftPosts || 0);

      return {
        totalSites,
        totalPosts,
        activeSites: Number(dashboardSummary.activeSites || 0),
        onlineSites: Number(dashboardSummary.onlineSites || 0),
        degradedSites: Number(dashboardSummary.degradedSites || 0),
        avgPosts: String(dashboardSummary.avgPosts ?? (totalSites ? (publishedPosts / totalSites).toFixed(1) : "0.0")),
        publishedPosts,
        draftPosts: Number(dashboardSummary.draftPosts || 0),
        recentPosts: Number(dashboardSummary.recentPosts || 0),
        totalViews: posts.reduce((sum, post) => sum + (post.views || 0), 0),
        totalLikes: posts.reduce((sum, post) => sum + (post.likes || 0), 0),
        topSite: dashboardSummary.topSite || null,
      };
    }

    const totalSites = sites.length;
    const totalPosts = posts.length;
    const activeSites = sites.filter((site) => posts.some((post) => post.siteId === site.id)).length;
    const onlineSites = sites.filter((site) => site.runtime?.status === "ONLINE").length;
    const degradedSites = sites.filter((site) => site.runtime?.status === "DEGRADED").length;
    const avgPosts = totalSites ? (totalPosts / totalSites).toFixed(1) : "0.0";
    const publishedPosts = posts.filter((post) => post.status === "Published").length;
    const draftPosts = posts.filter((post) => post.status === "Draft").length;
    const recentPosts = posts.filter((post) => isWithinLastDays(post.date, 7)).length;
    const totalViews = posts.reduce((sum, post) => sum + (post.views || 0), 0);
    const totalLikes = posts.reduce((sum, post) => sum + (post.likes || 0), 0);
    const topSite =
      sites
        .map((site) => ({ name: site.name, count: posts.filter((post) => post.siteId === site.id).length }))
        .sort((a, b) => b.count - a.count)[0] || null;

    return {
      totalSites,
      totalPosts,
      activeSites,
      onlineSites,
      degradedSites,
      avgPosts,
      publishedPosts,
      draftPosts,
      recentPosts,
      totalViews,
      totalLikes,
      topSite
    };
  }, [sites, posts, dashboardSummary]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold lg:text-3xl">Multi-site publishing command center</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Track site health, publishing velocity, engagement capacity, and content coverage.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-900" onClick={() => setOpenAddSite(true)}>
            Quick Add Site
          </button>
          <Link to="/analytics" className="rounded-lg border border-[var(--border-color)] px-4 py-2 text-sm font-semibold">
            Open Analytics
          </Link>
        </div>
      </div>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Total Sites" value={metrics.totalSites} icon={Globe2} tone="bg-sky-600" accent="bg-white/10" hint={`${metrics.activeSites} sites have content`} delta={`${metrics.onlineSites} online`} />
        <StatCard title="Published Posts" value={metrics.publishedPosts} icon={PenSquare} tone="bg-violet-600" accent="bg-white/10" hint={`${metrics.draftPosts} drafts waiting`} delta={`${metrics.recentPosts} in last 7d`} />
        <StatCard title="Engagement Pool" value={metrics.totalViews + metrics.totalLikes} icon={TrendingUp} tone="bg-emerald-600" accent="bg-white/10" hint={`${metrics.totalViews} views · ${metrics.totalLikes} likes`} delta={`${metrics.avgPosts} avg/site`} />
        <StatCard title="Runtime Health" value={metrics.onlineSites} icon={Wifi} tone="bg-amber-500" accent="bg-black/10" hint={`${metrics.degradedSites} degraded runtime`} delta={metrics.topSite ? `Top: ${metrics.topSite.name}` : "No top site"} />
      </section>

      <section className="grid grid-cols-1 gap-3 lg:grid-cols-4">
        <motion.article whileHover={{ y: -3 }} className="glass rounded-panel p-4 lg:col-span-1">
          <div className="flex items-center gap-2 text-sm font-semibold"><BadgeCheck size={16} className="text-emerald-400" /> Coverage</div>
          <p className="mt-3 text-3xl font-bold">{metrics.activeSites}</p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">Sites currently carrying published content</p>
        </motion.article>
        <motion.article whileHover={{ y: -3 }} className="glass rounded-panel p-4 lg:col-span-1">
          <div className="flex items-center gap-2 text-sm font-semibold"><Activity size={16} className="text-cyan-400" /> Velocity</div>
          <p className="mt-3 text-3xl font-bold">{metrics.recentPosts}</p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">Posts published in the last 7 days</p>
        </motion.article>
        <motion.article whileHover={{ y: -3 }} className="glass rounded-panel p-4 lg:col-span-1">
          <div className="flex items-center gap-2 text-sm font-semibold"><Sparkles size={16} className="text-fuchsia-400" /> Draft Queue</div>
          <p className="mt-3 text-3xl font-bold">{metrics.draftPosts}</p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">Posts still pending publication</p>
        </motion.article>
        <motion.article whileHover={{ y: -3 }} className="glass rounded-panel p-4 lg:col-span-1">
          <div className="flex items-center gap-2 text-sm font-semibold"><Zap size={16} className="text-amber-400" /> Avg Output</div>
          <p className="mt-3 text-3xl font-bold">{metrics.avgPosts}</p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">Average posts per managed site</p>
        </motion.article>
      </section>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto pr-1">
        <DashboardCharts sites={sites} posts={posts} />
      </div>

      <SiteFormModal
        open={openAddSite}
        onClose={() => setOpenAddSite(false)}
        onSubmit={async (form) => {
          await createSite(form);
          setOpenAddSite(false);
        }}
      />
    </div>
  );
}
