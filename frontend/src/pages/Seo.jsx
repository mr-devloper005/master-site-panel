import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { CheckCircle2, Loader2, RefreshCw, Save, SearchCheck } from "lucide-react";

import { useAppData } from "../context/AppContext";
import {
  fetchSiteIndexingStatus,
  fetchSiteSeoConfig,
  fetchSiteSeoStatus,
  updateSiteSeoConfig,
} from "../utils/api";

const PAGE_PRESETS = [
  "/",
  "/listings",
  "/articles",
  "/classifieds",
  "/image-sharing",
  "/profile",
  "/sbm",
  "/pdf",
  "/blog",
];

const EMPTY_DEFAULTS = {
  defaultTitle: "",
  titleTemplate: "",
  defaultDescription: "",
  defaultOgImage: "",
  keywords: [],
};

const normalizeKeywords = (input) =>
  Array.from(
    new Set(
      String(input || "")
        .split(",")
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
    )
  );

const parseChecksSummary = (seoStatus) => {
  const pages = Array.isArray(seoStatus?.pages) ? seoStatus.pages : [];
  let totalChecks = 0;
  let passedChecks = 0;

  for (const page of pages) {
    const checks = page?.checks && typeof page.checks === "object" ? page.checks : {};
    totalChecks += Object.keys(checks).length;
    passedChecks += Object.values(checks).filter(Boolean).length;
  }

  return { totalChecks, passedChecks, pages };
};

export default function Seo() {
  const { sites } = useAppData();
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [seoStatus, setSeoStatus] = useState(null);
  const [indexingStatus, setIndexingStatus] = useState(null);
  const [seoDefaults, setSeoDefaults] = useState(EMPTY_DEFAULTS);
  const [defaultKeywordsInput, setDefaultKeywordsInput] = useState("");
  const [seoPages, setSeoPages] = useState({});
  const [loading, setLoading] = useState({
    fetch: false,
    save: false,
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

  const loadSeoData = async (siteId) => {
    if (!siteId) return;
    setLoading((prev) => ({ ...prev, fetch: true }));
    try {
      const [status, config, indexing] = await Promise.all([
        fetchSiteSeoStatus(siteId),
        fetchSiteSeoConfig(siteId),
        fetchSiteIndexingStatus(siteId, { runDue: false, limit: 20 }),
      ]);

      setSeoStatus(status);
      setIndexingStatus(indexing);

      const defaults = config?.seoDefaults || EMPTY_DEFAULTS;
      setSeoDefaults({
        defaultTitle: defaults.defaultTitle || "",
        titleTemplate: defaults.titleTemplate || "",
        defaultDescription: defaults.defaultDescription || "",
        defaultOgImage: defaults.defaultOgImage || "",
        keywords: Array.isArray(defaults.keywords) ? defaults.keywords : [],
      });
      setDefaultKeywordsInput(Array.isArray(defaults.keywords) ? defaults.keywords.join(", ") : "");

      const pagesFromApi = config?.seoPages && typeof config.seoPages === "object" ? config.seoPages : {};
      const nextPages = {};
      PAGE_PRESETS.forEach((path) => {
        const value = pagesFromApi[path] || {};
        nextPages[path] = {
          title: value.title || "",
          description: value.description || "",
          canonical: value.canonical || "",
          ogImage: value.ogImage || "",
          keywords: Array.isArray(value.keywords) ? value.keywords.join(", ") : "",
          robotsIndex: typeof value.robotsIndex === "boolean" ? value.robotsIndex : true,
          robotsFollow: typeof value.robotsFollow === "boolean" ? value.robotsFollow : true,
        };
      });
      setSeoPages(nextPages);
    } catch (error) {
      toast.error(error.message || "Failed to load SEO data");
    } finally {
      setLoading((prev) => ({ ...prev, fetch: false }));
    }
  };

  useEffect(() => {
    if (!selectedSiteId) return;
    loadSeoData(selectedSiteId);
  }, [selectedSiteId]);

  const handleSave = async () => {
    if (!selectedSiteId) return;
    setLoading((prev) => ({ ...prev, save: true }));

    try {
      const payloadPages = Object.fromEntries(
        Object.entries(seoPages).map(([path, value]) => [
          path,
          {
            title: String(value.title || "").trim(),
            description: String(value.description || "").trim(),
            canonical: String(value.canonical || "").trim(),
            ogImage: String(value.ogImage || "").trim(),
            keywords: normalizeKeywords(value.keywords),
            robotsIndex: Boolean(value.robotsIndex),
            robotsFollow: Boolean(value.robotsFollow),
          },
        ])
      );

      await updateSiteSeoConfig(selectedSiteId, {
        seoDefaults: {
          defaultTitle: String(seoDefaults.defaultTitle || "").trim(),
          titleTemplate: String(seoDefaults.titleTemplate || "").trim(),
          defaultDescription: String(seoDefaults.defaultDescription || "").trim(),
          defaultOgImage: String(seoDefaults.defaultOgImage || "").trim(),
          keywords: normalizeKeywords(defaultKeywordsInput),
        },
        seoPages: payloadPages,
      });

      toast.success("SEO settings updated");
      await loadSeoData(selectedSiteId);
    } catch (error) {
      toast.error(error.message || "Failed to save SEO settings");
    } finally {
      setLoading((prev) => ({ ...prev, save: false }));
    }
  };

  const checksSummary = parseChecksSummary(seoStatus);
  const diagnostics = indexingStatus?.diagnostics || {};

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">SEO Manager</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Manage on-page SEO defaults and page-level overrides for every site from one panel.
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
            onClick={() => selectedSiteId && loadSeoData(selectedSiteId)}
            disabled={!selectedSiteId || loading.fetch}
          >
            {loading.fetch ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Refresh
          </button>

          <button
            className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-indigo-600 px-3 text-sm text-white"
            onClick={handleSave}
            disabled={!selectedSiteId || loading.save}
          >
            {loading.save ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Save SEO
          </button>
        </div>
      </div>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-panel bg-gradient-to-br from-emerald-600 to-teal-500 p-4 text-white shadow-panel">
          <p className="text-xs text-white/80">SEO Score</p>
          <p className="mt-2 text-3xl font-bold">{Number(seoStatus?.score || 0)}%</p>
        </article>
        <article className="rounded-panel bg-gradient-to-br from-blue-600 to-cyan-500 p-4 text-white shadow-panel">
          <p className="text-xs text-white/80">Checks Passed</p>
          <p className="mt-2 text-3xl font-bold">{checksSummary.passedChecks}</p>
          <p className="text-xs text-white/80">of {checksSummary.totalChecks}</p>
        </article>
        <article className="rounded-panel bg-gradient-to-br from-violet-600 to-fuchsia-500 p-4 text-white shadow-panel">
          <p className="text-xs text-white/80">Search Console</p>
          <p className="mt-2 text-xl font-bold">{diagnostics.googleConfigured ? "Connected" : "Not configured"}</p>
        </article>
        <article className="rounded-panel bg-gradient-to-br from-slate-700 to-slate-500 p-4 text-white shadow-panel">
          <p className="text-xs text-white/80">Site Property</p>
          <p className="mt-2 line-clamp-2 text-sm font-semibold">{diagnostics.siteProperty || selectedSite?.url || "Not set"}</p>
        </article>
      </section>

      <div className="scrollbar-thin min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        <section className="glass rounded-panel p-4">
          <h2 className="text-sm font-semibold">Default SEO (Site-wide)</h2>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <label>
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">Default Title</span>
              <input
                className="w-full rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm"
                value={seoDefaults.defaultTitle}
                onChange={(event) => setSeoDefaults((prev) => ({ ...prev, defaultTitle: event.target.value }))}
                placeholder="Link Rise Up | Local SEO Platform India"
              />
            </label>

            <label>
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">Title Template</span>
              <input
                className="w-full rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm"
                value={seoDefaults.titleTemplate}
                onChange={(event) => setSeoDefaults((prev) => ({ ...prev, titleTemplate: event.target.value }))}
                placeholder="%s | Link Rise Up"
              />
            </label>

            <label className="md:col-span-2">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">Default Meta Description</span>
              <textarea
                rows={3}
                className="w-full rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm"
                value={seoDefaults.defaultDescription}
                onChange={(event) => setSeoDefaults((prev) => ({ ...prev, defaultDescription: event.target.value }))}
                placeholder="All-in-one publishing hub for listings, articles, classifieds, and curated local SEO content."
              />
            </label>

            <label>
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">Default OG Image</span>
              <input
                className="w-full rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm"
                value={seoDefaults.defaultOgImage}
                onChange={(event) => setSeoDefaults((prev) => ({ ...prev, defaultOgImage: event.target.value }))}
                placeholder="https://cdn.example.com/og-default.jpg"
              />
            </label>

            <label>
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">Default Keywords (comma-separated)</span>
              <input
                className="w-full rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm"
                value={defaultKeywordsInput}
                onChange={(event) => setDefaultKeywordsInput(event.target.value)}
                placeholder="business directory delhi, local seo platform india"
              />
            </label>
          </div>
        </section>

        <section className="glass rounded-panel p-4">
          <h2 className="text-sm font-semibold">Page-level SEO Overrides</h2>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Override title, description, canonical, OG image, robots, and keywords per page route.
          </p>

          <div className="mt-3 space-y-3">
            {PAGE_PRESETS.map((path) => {
              const value = seoPages[path] || {
                title: "",
                description: "",
                canonical: "",
                ogImage: "",
                keywords: "",
                robotsIndex: true,
                robotsFollow: true,
              };

              return (
                <article key={path} className="rounded-lg border border-[var(--border-color)] p-3">
                  <p className="text-sm font-semibold">{path}</p>
                  <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                    <input
                      className="w-full rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm"
                      placeholder="Page title"
                      value={value.title}
                      onChange={(event) =>
                        setSeoPages((prev) => ({
                          ...prev,
                          [path]: { ...value, title: event.target.value },
                        }))
                      }
                    />
                    <input
                      className="w-full rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm"
                      placeholder="Canonical URL"
                      value={value.canonical}
                      onChange={(event) =>
                        setSeoPages((prev) => ({
                          ...prev,
                          [path]: { ...value, canonical: event.target.value },
                        }))
                      }
                    />
                    <textarea
                      rows={2}
                      className="w-full rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm md:col-span-2"
                      placeholder="Meta description"
                      value={value.description}
                      onChange={(event) =>
                        setSeoPages((prev) => ({
                          ...prev,
                          [path]: { ...value, description: event.target.value },
                        }))
                      }
                    />
                    <input
                      className="w-full rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm"
                      placeholder="OG image URL"
                      value={value.ogImage}
                      onChange={(event) =>
                        setSeoPages((prev) => ({
                          ...prev,
                          [path]: { ...value, ogImage: event.target.value },
                        }))
                      }
                    />
                    <input
                      className="w-full rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm"
                      placeholder="Keywords (comma-separated)"
                      value={value.keywords}
                      onChange={(event) =>
                        setSeoPages((prev) => ({
                          ...prev,
                          [path]: { ...value, keywords: event.target.value },
                        }))
                      }
                    />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                    <label className="inline-flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={Boolean(value.robotsIndex)}
                        onChange={(event) =>
                          setSeoPages((prev) => ({
                            ...prev,
                            [path]: { ...value, robotsIndex: event.target.checked },
                          }))
                        }
                      />
                      Index
                    </label>
                    <label className="inline-flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={Boolean(value.robotsFollow)}
                        onChange={(event) =>
                          setSeoPages((prev) => ({
                            ...prev,
                            [path]: { ...value, robotsFollow: event.target.checked },
                          }))
                        }
                      />
                      Follow
                    </label>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="glass rounded-panel p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Live SEO Audit Checks</h2>
            <span className="inline-flex items-center gap-1 text-xs text-[var(--text-secondary)]">
              <SearchCheck size={13} />
              {checksSummary.pages.length} pages checked
            </span>
          </div>

          <div className="mt-3 overflow-x-auto rounded-lg border border-[var(--border-color)]">
            <table className="min-w-full text-xs">
              <thead className="bg-[var(--bg-surface)]">
                <tr>
                  <th className="px-3 py-2 text-left">Page</th>
                  <th className="px-3 py-2 text-left">Reachable</th>
                  <th className="px-3 py-2 text-left">Missing Tags</th>
                  <th className="px-3 py-2 text-left">HTTP</th>
                </tr>
              </thead>
              <tbody>
                {checksSummary.pages.length ? (
                  checksSummary.pages.map((page) => (
                    <tr key={page.page} className="border-t border-[var(--border-color)]">
                      <td className="px-3 py-2">
                        <a href={page.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                          {page.page}
                        </a>
                      </td>
                      <td className="px-3 py-2">
                        {page.reachable ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600">
                            <CheckCircle2 size={13} /> Yes
                          </span>
                        ) : (
                          <span className="text-rose-600">No</span>
                        )}
                      </td>
                      <td className="px-3 py-2">{Array.isArray(page.missing) && page.missing.length ? page.missing.join(", ") : "-"}</td>
                      <td className="px-3 py-2">{page.httpStatus ?? "N/A"}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-3 py-3 text-[var(--text-secondary)]" colSpan={4}>
                      No SEO audit data yet.
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
