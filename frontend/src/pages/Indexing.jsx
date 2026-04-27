import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip,
} from "chart.js";
import { Bar, Doughnut } from "react-chartjs-2";
import {
  CheckCircle2,
  Globe2,
  Loader2,
  RefreshCw,
  Save,
  SearchCheck,
  Send,
  AlertTriangle,
  Link2,
} from "lucide-react";

import { useAppData } from "../context/AppContext";
import {
  fetchSiteIndexingStatus,
  fetchSiteLinkHealth,
  fetchSiteSeoStatus,
  fetchSiteSitemapConfig,
  fetchSiteSitemapStatus,
  runSiteIndexingInspections,
  submitSiteSitemapForIndexing,
  updateSiteSitemapConfig,
} from "../utils/api";

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend);

const formatDateTime = (value) => (value ? new Date(value).toLocaleString() : "-");

const parseUrlLines = (value) =>
  Array.from(
    new Set(
      String(value || "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
    )
  );

const statusPill = (status) => {
  const normalized = String(status || "").toUpperCase();
  if (normalized.includes("INDEXED")) return "bg-emerald-500/15 text-emerald-600";
  if (normalized.includes("DISCOVERED")) return "bg-sky-500/15 text-sky-600";
  if (normalized.includes("SUBMITTED")) return "bg-violet-500/15 text-violet-600";
  if (normalized.includes("ERROR")) return "bg-rose-500/15 text-rose-600";
  return "bg-slate-500/15 text-slate-600";
};

export default function Indexing() {
  const { sites } = useAppData();

  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [sitemapStatus, setSitemapStatus] = useState(null);
  const [seoStatus, setSeoStatus] = useState(null);
  const [indexingStatus, setIndexingStatus] = useState(null);
  const [linkHealth, setLinkHealth] = useState(null);
  const [manualUrlsInput, setManualUrlsInput] = useState("");
  const [excludedUrlsInput, setExcludedUrlsInput] = useState("");
  const [loading, setLoading] = useState({
    fetch: false,
    submitSitemap: false,
    runInspection: false,
    saveConfig: false,
    linkHealth: false,
  });

  const selectedSite = useMemo(
    () => sites.find((site) => site.id === selectedSiteId) || null,
    [sites, selectedSiteId]
  );

  useEffect(() => {
    if (!selectedSiteId && sites.length) {
      setSelectedSiteId(sites[0].id);
    }
  }, [selectedSiteId, sites]);

  const loadIndexingData = async (siteId, options = {}) => {
    if (!siteId) return;
    setLoading((prev) => ({ ...prev, fetch: true }));
    try {
      const [sitemap, seo, indexing, sitemapConfig] = await Promise.all([
        fetchSiteSitemapStatus(siteId, { all: true }),
        fetchSiteSeoStatus(siteId),
        fetchSiteIndexingStatus(siteId, { runDue: Boolean(options.runDue), limit: 200 }),
        fetchSiteSitemapConfig(siteId),
      ]);
      setSitemapStatus(sitemap);
      setSeoStatus(seo);
      setIndexingStatus(indexing);
      setManualUrlsInput((sitemapConfig.sitemapManualUrls || []).join("\n"));
      setExcludedUrlsInput((sitemapConfig.sitemapExcludedUrls || []).join("\n"));
      if (!options.skipLinkHealth) {
        const health = await fetchSiteLinkHealth(siteId, { limit: 120, maxLinks: 200 });
        setLinkHealth(health);
      }
    } catch (error) {
      toast.error(error.message || "Failed to load indexing data");
    } finally {
      setLoading((prev) => ({ ...prev, fetch: false }));
    }
  };

  useEffect(() => {
    if (!selectedSiteId) return;
    loadIndexingData(selectedSiteId, { runDue: true });
  }, [selectedSiteId]);

  const handleSubmitSitemap = async () => {
    if (!selectedSiteId) return;
    setLoading((prev) => ({ ...prev, submitSitemap: true }));
    try {
      const result = await submitSiteSitemapForIndexing(selectedSiteId);
      toast.success(result?.submitted ? "Sitemap submitted to Google" : "Sitemap submission queued");
      await loadIndexingData(selectedSiteId, { runDue: false });
    } catch (error) {
      toast.error(error.message || "Failed to submit sitemap");
    } finally {
      setLoading((prev) => ({ ...prev, submitSitemap: false }));
    }
  };

  const handleRunInspections = async () => {
    if (!selectedSiteId) return;
    setLoading((prev) => ({ ...prev, runInspection: true }));
    try {
      await runSiteIndexingInspections(selectedSiteId, 40);
      toast.success("Google inspection run completed");
      await loadIndexingData(selectedSiteId, { runDue: false });
    } catch (error) {
      toast.error(error.message || "Failed to run inspections");
    } finally {
      setLoading((prev) => ({ ...prev, runInspection: false }));
    }
  };

  const handleSaveSitemapConfig = async () => {
    if (!selectedSiteId) return;
    setLoading((prev) => ({ ...prev, saveConfig: true }));
    try {
      await updateSiteSitemapConfig(selectedSiteId, {
        sitemapManualUrls: parseUrlLines(manualUrlsInput),
        sitemapExcludedUrls: parseUrlLines(excludedUrlsInput),
      });
      toast.success("Sitemap settings updated");
      await loadIndexingData(selectedSiteId, { runDue: false });
    } catch (error) {
      toast.error(error.message || "Failed to save sitemap settings");
    } finally {
      setLoading((prev) => ({ ...prev, saveConfig: false }));
    }
  };

  const handleRunLinkHealth = async () => {
    if (!selectedSiteId) return;
    setLoading((prev) => ({ ...prev, linkHealth: true }));
    try {
      const health = await fetchSiteLinkHealth(selectedSiteId, {
        limit: 200,
        maxLinks: 300,
        timeoutMs: 9000,
        concurrency: 8,
      });
      setLinkHealth(health);
      if (health?.success) {
        toast.success("Link health check completed");
      } else {
        toast.error(health?.error || "Link health endpoint returned an error");
      }
    } catch (error) {
      toast.error(error.message || "Failed to run link health check");
    } finally {
      setLoading((prev) => ({ ...prev, linkHealth: false }));
    }
  };

  const summary = indexingStatus?.summary || {
    total: 0,
    sitemapSubmitted: 0,
    sitemapSeen: 0,
    discovered: 0,
    indexed: 0,
    byStatus: {},
  };
  const diagnostics = indexingStatus?.diagnostics || {
    publishedPosts: 0,
    trackedPosts: 0,
    untrackedPublishedPosts: 0,
    trackingCoveragePercent: 0,
    googleConfigured: false,
    siteProperty: null,
    lastSitemapSubmitAt: null,
    lastSitemapSubmitStatus: null,
    lastSitemapSubmitError: null,
  };
  const byStatus = summary.byStatus || {};
  const indexedRate = summary.total ? Math.round((summary.indexed / summary.total) * 100) : 0;
  const sitemapSeenRate = summary.total ? Math.round((Number(summary.sitemapSeen || 0) / summary.total) * 100) : 0;
  const trackedUrls = Number(diagnostics.trackedPosts || summary.total || 0);
  const indexedUrls = Number(summary.indexed || 0);
  const notIndexedUrls = Number(byStatus.NOT_INDEXED || 0);
  const submittedUrls = Number(summary.sitemapSubmitted || 0);
  const sitemapSeenUrls = Number(summary.sitemapSeen || 0);
  const awaitingUrls = Math.max(trackedUrls - indexedUrls - notIndexedUrls, 0);
  const linkHealthResult = linkHealth?.result || null;
  const brokenLinks = Array.isArray(linkHealthResult?.broken) ? linkHealthResult.broken : [];
  const healthyLinks = Array.isArray(linkHealthResult?.healthy) ? linkHealthResult.healthy : [];

  const googleState = useMemo(() => {
    if (!selectedSiteId) return "Select site";
    if (!diagnostics.googleConfigured) return "Config Missing";
    if (summary.indexed > 0 || summary.discovered > 0 || summary.sitemapSeen > 0 || summary.sitemapSubmitted > 0) return "Connected";
    return "Waiting for first sync";
  }, [
    selectedSiteId,
    diagnostics.googleConfigured,
    summary.indexed,
    summary.discovered,
    summary.sitemapSeen,
    summary.sitemapSubmitted,
  ]);

  const doughnutData = useMemo(() => {
    const labels = Object.keys(byStatus);
    const values = Object.values(byStatus);
    return {
      labels: labels.length ? labels : ["No data"],
      datasets: [
        {
          label: "Indexing status",
          data: values.length ? values : [1],
          backgroundColor: labels.length
            ? ["#22c55e", "#0ea5e9", "#8b5cf6", "#f59e0b", "#ef4444", "#14b8a6"]
            : ["#94a3b8"],
          borderWidth: 0,
        },
      ],
    };
  }, [byStatus]);

  const pipelineBarData = useMemo(
    () => ({
      labels: ["Sitemap URLs", "Submitted", "Seen in Sitemap", "Indexed"],
      datasets: [
        {
          label: "Count",
          data: [
            Number(sitemapStatus?.urlCount || 0),
            submittedUrls,
            discoveredUrls,
            indexedUrls,
          ],
          backgroundColor: ["#0ea5e9", "#8b5cf6", "#14b8a6", "#22c55e"],
          borderRadius: 10,
        },
      ],
    }),
    [sitemapStatus?.urlCount, submittedUrls, discoveredUrls, indexedUrls]
  );

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
    },
    scales: {
      x: { grid: { display: false } },
      y: { beginAtZero: true, grid: { color: "rgba(148,163,184,0.15)" } },
    },
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Indexing Command Center</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Live sitemap, Google status, indexing analytics, and editable sitemap controls.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="min-h-10 rounded-lg border border-[var(--border-color)] px-3 text-sm"
            value={selectedSiteId}
            onChange={(event) => setSelectedSiteId(event.target.value)}
          >
            <option value="">Select site</option>
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </select>
          <button
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[var(--border-color)] px-3 text-sm"
            onClick={() => selectedSiteId && loadIndexingData(selectedSiteId, { runDue: true })}
            disabled={!selectedSiteId || loading.fetch}
          >
            {loading.fetch ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Refresh
          </button>
          <button
            className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-blue-600 px-3 text-sm text-white"
            onClick={handleSubmitSitemap}
            disabled={!selectedSiteId || loading.submitSitemap}
          >
            {loading.submitSitemap ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Submit Sitemap
          </button>
          <button
            className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-emerald-600 px-3 text-sm text-white"
            onClick={handleRunInspections}
            disabled={!selectedSiteId || loading.runInspection}
          >
            {loading.runInspection ? <Loader2 size={14} className="animate-spin" /> : <SearchCheck size={14} />}
            Run Inspection
          </button>
          <button
            className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-indigo-600 px-3 text-sm text-white"
            onClick={handleRunLinkHealth}
            disabled={!selectedSiteId || loading.linkHealth}
          >
            {loading.linkHealth ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
            Link Health
          </button>
        </div>
      </div>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-7">
        <article className="rounded-panel bg-gradient-to-br from-blue-600 to-cyan-500 p-4 text-white shadow-panel">
          <p className="text-xs text-white/80">Sitemap URLs</p>
          <p className="mt-2 text-3xl font-bold">{Number(sitemapStatus?.urlCount || 0)}</p>
        </article>
        <article className="rounded-panel bg-gradient-to-br from-violet-600 to-fuchsia-500 p-4 text-white shadow-panel">
          <p className="text-xs text-white/80">Submitted</p>
          <p className="mt-2 text-3xl font-bold">{Number(summary.sitemapSubmitted || 0)}</p>
        </article>
        <article className="rounded-panel bg-gradient-to-br from-sky-600 to-indigo-500 p-4 text-white shadow-panel">
          <p className="text-xs text-white/80">Discovered</p>
          <p className="mt-2 text-3xl font-bold">{Number(summary.discovered || 0)}</p>
          <p className="text-xs text-white/80">Google says discovered, not indexed</p>
        </article>
        <article className="rounded-panel bg-gradient-to-br from-cyan-600 to-blue-500 p-4 text-white shadow-panel">
          <p className="text-xs text-white/80">Seen in Sitemap</p>
          <p className="mt-2 text-3xl font-bold">{Number(summary.sitemapSeen || 0)}</p>
          <p className="text-xs text-white/80">{sitemapSeenRate}% of tracked</p>
        </article>
        <article className="rounded-panel bg-gradient-to-br from-emerald-600 to-teal-500 p-4 text-white shadow-panel">
          <p className="text-xs text-white/80">Indexed</p>
          <p className="mt-2 text-3xl font-bold">{Number(summary.indexed || 0)}</p>
          <p className="text-xs text-white/80">{indexedRate}% of tracked</p>
        </article>
        <article className="rounded-panel bg-gradient-to-br from-amber-500 to-orange-500 p-4 text-white shadow-panel">
          <p className="text-xs text-white/80">SEO Score</p>
          <p className="mt-2 text-3xl font-bold">{Number(seoStatus?.score || 0)}%</p>
        </article>
        <article className="rounded-panel bg-gradient-to-br from-slate-700 to-slate-500 p-4 text-white shadow-panel">
          <p className="text-xs text-white/80">Host Mismatch</p>
          <p className="mt-2 text-3xl font-bold">{Number(sitemapStatus?.hostMismatchCount || 0)}</p>
        </article>
      </section>

      <div className="scrollbar-thin min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <article className="glass rounded-panel p-4 xl:col-span-1">
            <h2 className="text-sm font-semibold">Google Status</h2>
            <div className="mt-3 space-y-2 text-sm">
              <p className="flex items-center gap-2">
                <Globe2 size={15} />
                Search Console:{" "}
                <span className={googleState === "Connected" ? "font-semibold text-emerald-600" : "font-semibold text-amber-600"}>
                  {googleState}
                </span>
              </p>
              <p className="flex items-center gap-2">
                {sitemapStatus?.reachable ? <CheckCircle2 size={15} className="text-emerald-600" /> : <AlertTriangle size={15} className="text-rose-600" />}
                Sitemap live: {sitemapStatus?.reachable ? "Reachable" : "Not reachable"}
              </p>
              <p>Last indexing check: {formatDateTime(indexingStatus?.checkedAt)}</p>
              <p>Last sitemap submit: {formatDateTime(diagnostics.lastSitemapSubmitAt)}</p>
              <p>
                Last submit status:{" "}
                <span
                  className={
                    diagnostics.lastSitemapSubmitStatus === "SUCCESS"
                      ? "font-semibold text-emerald-600"
                      : diagnostics.lastSitemapSubmitStatus === "ERROR"
                        ? "font-semibold text-rose-600"
                        : "font-semibold text-slate-500"
                  }
                >
                  {diagnostics.lastSitemapSubmitStatus || "Not attempted"}
                </span>
              </p>
              {diagnostics.lastSitemapSubmitError ? (
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700">
                  {diagnostics.lastSitemapSubmitError}
                </p>
              ) : null}
              <p>Site runtime: {selectedSite?.runtime?.status || "UNKNOWN"}</p>
              <p>Site updated: {formatDateTime(selectedSite?.updatedAt)}</p>
            </div>
          </article>

          <article className="glass rounded-panel p-4 xl:col-span-1">
            <h2 className="text-sm font-semibold">Clear Indexing Snapshot</h2>
            <div className="mt-3 space-y-2 text-sm">
              <p>Sitemap URLs: <span className="font-semibold">{Number(sitemapStatus?.urlCount || 0)}</span></p>
              <p>Published Posts: <span className="font-semibold">{Number(diagnostics.publishedPosts || 0)}</span></p>
              <p>Tracked URLs (posts): <span className="font-semibold">{trackedUrls}</span></p>
              <p>Tracking Coverage: <span className="font-semibold">{Number(diagnostics.trackingCoveragePercent || 0)}%</span></p>
              <p>Untracked Published: <span className="font-semibold text-rose-600">{Number(diagnostics.untrackedPublishedPosts || 0)}</span></p>
              <p>Indexed URLs (Google confirmed): <span className="font-semibold text-emerald-600">{indexedUrls}</span></p>
              <p>Not Indexed (Google confirmed): <span className="font-semibold text-rose-600">{notIndexedUrls}</span></p>
              <p>Awaiting confirmation: <span className="font-semibold text-amber-600">{awaitingUrls}</span></p>
              <p>Discovered (Google confirmed): <span className="font-semibold text-indigo-600">{Number(summary.discovered || 0)}</span></p>
              <p>Seen in Sitemap: <span className="font-semibold text-sky-600">{sitemapSeenUrls}</span></p>
            </div>
          </article>

          <article className="glass rounded-panel p-4 xl:col-span-1">
            <h2 className="text-sm font-semibold">Index Coverage Split</h2>
            <div className="mt-3 h-[230px]">
              <Doughnut data={doughnutData} options={{ responsive: true, maintainAspectRatio: false }} />
            </div>
          </article>

          <article className="glass rounded-panel p-4 xl:col-span-1">
            <h2 className="text-sm font-semibold">Indexing Pipeline</h2>
            <div className="mt-3 h-[230px]">
              <Bar data={pipelineBarData} options={barOptions} />
            </div>
          </article>
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <article className="glass rounded-panel p-4">
            <h2 className="text-sm font-semibold">Sitemap Controls (Editable)</h2>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              Add extra URLs or exclude URLs from effective sitemap tracking.
            </p>

            <div className="mt-3 grid grid-cols-1 gap-3">
              <label>
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
                  Manual URLs (one per line)
                </span>
                <textarea
                  rows={6}
                  className="w-full rounded-lg border border-[var(--border-color)] bg-transparent px-3 py-2 text-xs"
                  placeholder="https://example.com/extra-page"
                  value={manualUrlsInput}
                  onChange={(event) => setManualUrlsInput(event.target.value)}
                />
              </label>
              <label>
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
                  Excluded URLs (one per line)
                </span>
                <textarea
                  rows={6}
                  className="w-full rounded-lg border border-[var(--border-color)] bg-transparent px-3 py-2 text-xs"
                  placeholder="https://example.com/old-url"
                  value={excludedUrlsInput}
                  onChange={(event) => setExcludedUrlsInput(event.target.value)}
                />
              </label>
            </div>
            <button
              className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm text-white"
              onClick={handleSaveSitemapConfig}
              disabled={!selectedSiteId || loading.saveConfig}
            >
              {loading.saveConfig ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save Sitemap Settings
            </button>
          </article>

          <article className="glass rounded-panel p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">Live Sitemap Status</h2>
              {sitemapStatus?.sitemapUrl ? (
                <a
                  href={sitemapStatus.sitemapUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-blue-600 hover:underline"
                >
                  Open sitemap.xml
                </a>
              ) : null}
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
              <p>Reachable: {sitemapStatus?.reachable ? "Yes" : "No"}</p>
              <p>HTTP Status: {sitemapStatus?.httpStatus ?? "N/A"}</p>
              <p>Total URLs: {sitemapStatus?.urlCount ?? 0}</p>
              <p>Checked At: {formatDateTime(sitemapStatus?.checkedAt)}</p>
              <p>Manual URLs: {sitemapStatus?.manualUrlsCount ?? 0}</p>
              <p>Excluded URLs: {sitemapStatus?.excludedUrlsCount ?? 0}</p>
            </div>
            {sitemapStatus?.error ? (
              <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {sitemapStatus.error}
              </p>
            ) : null}
          </article>
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <article className="glass rounded-panel p-4">
            <h2 className="text-sm font-semibold">Outbound Link Health</h2>
            <div className="mt-3 space-y-2 text-sm">
              <p>Endpoint Reachable: {linkHealth?.reachable ? "Yes" : "No"}</p>
              <p>HTTP Status: {linkHealth?.httpStatus ?? "N/A"}</p>
              <p>Checked At: {formatDateTime(linkHealth?.checkedAt)}</p>
              <p>Scanned Posts: <span className="font-semibold">{Number(linkHealthResult?.scannedPosts || 0)}</span></p>
              <p>Unique Checked Links: <span className="font-semibold">{Number(linkHealthResult?.uniqueCheckedLinks || 0)}</span></p>
              {linkHealth?.error ? (
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700">
                  {linkHealth.error}
                </p>
              ) : null}
              {linkHealth?.endpointUrl ? (
                <a
                  href={linkHealth.endpointUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                >
                  Open health endpoint
                </a>
              ) : null}
            </div>
          </article>

          <article className="rounded-panel bg-gradient-to-br from-emerald-600 to-teal-500 p-4 text-white shadow-panel">
            <p className="text-xs text-white/80">Healthy Outbound Links</p>
            <p className="mt-2 text-3xl font-bold">{Number(linkHealthResult?.healthyCount || healthyLinks.length || 0)}</p>
            <p className="text-xs text-white/80">Checked from site content</p>
          </article>

          <article className="rounded-panel bg-gradient-to-br from-rose-600 to-orange-500 p-4 text-white shadow-panel">
            <p className="text-xs text-white/80">Broken Outbound Links</p>
            <p className="mt-2 text-3xl font-bold">{Number(linkHealthResult?.brokenCount || brokenLinks.length || 0)}</p>
            <p className="text-xs text-white/80">Fix these first for crawl quality</p>
          </article>
        </section>

        <section className="glass rounded-panel p-4">
          <h2 className="text-sm font-semibold">Sitemap URL Inventory</h2>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            All effective URLs after applying manual additions and exclusions.
          </p>
          <div className="mt-3 max-h-64 space-y-1 overflow-y-auto rounded-lg border border-[var(--border-color)] p-3 text-xs">
            {Array.isArray(sitemapStatus?.urls) && sitemapStatus.urls.length ? (
              sitemapStatus.urls.map((url) => (
                <a key={url} href={url} target="_blank" rel="noreferrer" className="block truncate text-blue-600 hover:underline">
                  {url}
                </a>
              ))
            ) : (
              <p className="text-[var(--text-secondary)]">No sitemap URLs found.</p>
            )}
          </div>
        </section>

        <section className="glass rounded-panel p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Indexing Status Table</h2>
            <span className="inline-flex items-center gap-1 text-xs text-[var(--text-secondary)]">
              <SearchCheck size={13} />
              {Number(summary.total || 0)} tracked posts
            </span>
          </div>
          <div className="mt-3 overflow-x-auto rounded-lg border border-[var(--border-color)]">
            <table className="min-w-full text-xs">
              <thead className="bg-[var(--bg-surface)]">
                <tr>
                  <th className="px-3 py-2 text-left">Post</th>
                  <th className="px-3 py-2 text-left">Google Status</th>
                  <th className="px-3 py-2 text-left">Submitted</th>
                  <th className="px-3 py-2 text-left">Discovered</th>
                  <th className="px-3 py-2 text-left">Last Inspection</th>
                </tr>
              </thead>
              <tbody>
                {(indexingStatus?.items || []).map((row) => (
                  <tr key={row.id} className="border-t border-[var(--border-color)]">
                    <td className="px-3 py-2">
                      <a href={row.url} target="_blank" rel="noreferrer" className="line-clamp-1 text-blue-600 hover:underline">
                        {row.postTitle}
                      </a>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex rounded-full px-2 py-0.5 font-semibold ${statusPill(row.inspectionStatus)}`}>
                        {row.inspectionStatus}
                      </span>
                    </td>
                    <td className="px-3 py-2">{formatDateTime(row.sitemapSubmittedAt)}</td>
                    <td className="px-3 py-2">{formatDateTime(row.sitemapSeenAt)}</td>
                    <td className="px-3 py-2">{formatDateTime(row.inspectionLastCheckedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="glass rounded-panel p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Broken Link Table</h2>
            <span className="inline-flex items-center gap-1 text-xs text-[var(--text-secondary)]">
              <Link2 size={13} />
              {brokenLinks.length} broken links
            </span>
          </div>
          <div className="mt-3 overflow-x-auto rounded-lg border border-[var(--border-color)]">
            <table className="min-w-full text-xs">
              <thead className="bg-[var(--bg-surface)]">
                <tr>
                  <th className="px-3 py-2 text-left">URL</th>
                  <th className="px-3 py-2 text-left">HTTP</th>
                  <th className="px-3 py-2 text-left">Error</th>
                  <th className="px-3 py-2 text-left">Source Post</th>
                  <th className="px-3 py-2 text-left">Task</th>
                </tr>
              </thead>
              <tbody>
                {brokenLinks.length ? (
                  brokenLinks.map((row) => {
                    const source = Array.isArray(row.sources) && row.sources.length ? row.sources[0] : null;
                    return (
                      <tr key={row.url} className="border-t border-[var(--border-color)]">
                        <td className="px-3 py-2">
                          <a href={row.url} target="_blank" rel="noreferrer" className="line-clamp-1 text-blue-600 hover:underline">
                            {row.url}
                          </a>
                        </td>
                        <td className="px-3 py-2">{row.status ?? "N/A"}</td>
                        <td className="px-3 py-2">{row.error || "-"}</td>
                        <td className="px-3 py-2">{source?.postSlug || "-"}</td>
                        <td className="px-3 py-2">{source?.task || "-"}</td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td className="px-3 py-3 text-[var(--text-secondary)]" colSpan={5}>
                      No broken outbound links found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
