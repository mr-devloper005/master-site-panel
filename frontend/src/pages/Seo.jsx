import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Save, SearchCheck } from "lucide-react";

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

const EMPTY_BLUEPRINT = {
  urlStructure: {
    enforceLowercase: true,
    enforceHyphenatedSlugs: true,
    maxSlugLength: 120,
  },
  headingPolicy: {
    requireSingleH1: true,
    minH2Count: 1,
    allowH3Plus: true,
  },
  imagePolicy: {
    requireAltText: true,
    minAltLength: 8,
    enforceLazyLoading: true,
    enforceWidthHeight: false,
  },
  internalLinkPolicy: {
    minInternalLinksPerPage: 5,
    descriptiveAnchorMinWords: 2,
    enforceRelatedBlock: true,
  },
  schemaPolicy: {
    enabledTypes: ["Organization", "WebSite", "Article", "BreadcrumbList", "LocalBusiness", "ImageObject"],
    requireBreadcrumbOnDetail: true,
    requireArticleSchemaOnArticles: true,
    requireImageObjectForImagePosts: true,
  },
  defaults: {
    robotsIndex: true,
    robotsFollow: true,
    hreflangDefault: "en-IN",
    authorFallback: "",
  },
  pageTemplates: {},
};

const SCHEMA_TYPE_OPTIONS = [
  "Organization",
  "WebSite",
  "Article",
  "BreadcrumbList",
  "LocalBusiness",
  "ImageObject",
  "CollectionPage",
  "ItemList",
];

const normalizeKeywords = (input) =>
  Array.from(
    new Set(
      String(input || "")
        .split(",")
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
    )
  );

const normalizeBlueprint = (input) => {
  const source = input && typeof input === "object" ? input : {};
  const from = (path, fallback) => {
    const value = source?.[path];
    if (!value || typeof value !== "object") return fallback;
    return { ...fallback, ...value };
  };

  const normalized = {
    urlStructure: from("urlStructure", EMPTY_BLUEPRINT.urlStructure),
    headingPolicy: from("headingPolicy", EMPTY_BLUEPRINT.headingPolicy),
    imagePolicy: from("imagePolicy", EMPTY_BLUEPRINT.imagePolicy),
    internalLinkPolicy: from("internalLinkPolicy", EMPTY_BLUEPRINT.internalLinkPolicy),
    schemaPolicy: from("schemaPolicy", EMPTY_BLUEPRINT.schemaPolicy),
    defaults: from("defaults", EMPTY_BLUEPRINT.defaults),
    pageTemplates:
      source?.pageTemplates && typeof source.pageTemplates === "object" && !Array.isArray(source.pageTemplates)
        ? source.pageTemplates
        : {},
  };

  normalized.schemaPolicy.enabledTypes = Array.isArray(normalized.schemaPolicy.enabledTypes)
    ? normalized.schemaPolicy.enabledTypes.filter((item) => typeof item === "string" && item.trim())
    : [];

  return normalized;
};

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

const missingLabel = (key) => {
  if (!key) return "-";
  return String(key)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

export default function Seo() {
  const { sites } = useAppData();
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [seoStatus, setSeoStatus] = useState(null);
  const [indexingStatus, setIndexingStatus] = useState(null);
  const [seoDefaults, setSeoDefaults] = useState(EMPTY_DEFAULTS);
  const [defaultKeywordsInput, setDefaultKeywordsInput] = useState("");
  const [seoPages, setSeoPages] = useState({});
  const [seoBlueprint, setSeoBlueprint] = useState(EMPTY_BLUEPRINT);
  const [templatePathInput, setTemplatePathInput] = useState("");
  const [templateJsonInput, setTemplateJsonInput] = useState("");
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
        fetchSiteSeoStatus(siteId, { all: true, limit: 500, concurrency: 8 }),
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
      setSeoBlueprint(normalizeBlueprint(config?.seoBlueprint || EMPTY_BLUEPRINT));
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

      const parseIntOr = (value, fallback) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? Math.floor(parsed) : fallback;
      };

      const blueprintPayload = {
        urlStructure: {
          enforceLowercase: Boolean(seoBlueprint.urlStructure?.enforceLowercase),
          enforceHyphenatedSlugs: Boolean(seoBlueprint.urlStructure?.enforceHyphenatedSlugs),
          maxSlugLength: parseIntOr(seoBlueprint.urlStructure?.maxSlugLength, 120),
        },
        headingPolicy: {
          requireSingleH1: Boolean(seoBlueprint.headingPolicy?.requireSingleH1),
          minH2Count: parseIntOr(seoBlueprint.headingPolicy?.minH2Count, 1),
          allowH3Plus: Boolean(seoBlueprint.headingPolicy?.allowH3Plus),
        },
        imagePolicy: {
          requireAltText: Boolean(seoBlueprint.imagePolicy?.requireAltText),
          minAltLength: parseIntOr(seoBlueprint.imagePolicy?.minAltLength, 8),
          enforceLazyLoading: Boolean(seoBlueprint.imagePolicy?.enforceLazyLoading),
          enforceWidthHeight: Boolean(seoBlueprint.imagePolicy?.enforceWidthHeight),
        },
        internalLinkPolicy: {
          minInternalLinksPerPage: parseIntOr(seoBlueprint.internalLinkPolicy?.minInternalLinksPerPage, 5),
          descriptiveAnchorMinWords: parseIntOr(seoBlueprint.internalLinkPolicy?.descriptiveAnchorMinWords, 2),
          enforceRelatedBlock: Boolean(seoBlueprint.internalLinkPolicy?.enforceRelatedBlock),
        },
        schemaPolicy: {
          enabledTypes: Array.isArray(seoBlueprint.schemaPolicy?.enabledTypes)
            ? seoBlueprint.schemaPolicy.enabledTypes.filter(Boolean)
            : [],
          requireBreadcrumbOnDetail: Boolean(seoBlueprint.schemaPolicy?.requireBreadcrumbOnDetail),
          requireArticleSchemaOnArticles: Boolean(seoBlueprint.schemaPolicy?.requireArticleSchemaOnArticles),
          requireImageObjectForImagePosts: Boolean(seoBlueprint.schemaPolicy?.requireImageObjectForImagePosts),
        },
        defaults: {
          robotsIndex: Boolean(seoBlueprint.defaults?.robotsIndex),
          robotsFollow: Boolean(seoBlueprint.defaults?.robotsFollow),
          hreflangDefault: String(seoBlueprint.defaults?.hreflangDefault || "en-IN").trim(),
          authorFallback: String(seoBlueprint.defaults?.authorFallback || "").trim(),
        },
        pageTemplates:
          seoBlueprint.pageTemplates && typeof seoBlueprint.pageTemplates === "object"
            ? seoBlueprint.pageTemplates
            : {},
      };

      await updateSiteSeoConfig(selectedSiteId, {
        seoDefaults: {
          defaultTitle: String(seoDefaults.defaultTitle || "").trim(),
          titleTemplate: String(seoDefaults.titleTemplate || "").trim(),
          defaultDescription: String(seoDefaults.defaultDescription || "").trim(),
          defaultOgImage: String(seoDefaults.defaultOgImage || "").trim(),
          keywords: normalizeKeywords(defaultKeywordsInput),
        },
        seoPages: payloadPages,
        seoBlueprint: blueprintPayload,
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
  const pageWarnings = checksSummary.pages
    .filter((page) => Array.isArray(page.missing) && page.missing.length)
    .sort((a, b) => (b.missing?.length || 0) - (a.missing?.length || 0));

  const upsertTemplateRule = () => {
    const path = String(templatePathInput || "").trim();
    if (!path) {
      toast.error("Template path required (e.g. /articles)");
      return;
    }
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    let parsed = {};
    if (String(templateJsonInput || "").trim()) {
      try {
        parsed = JSON.parse(templateJsonInput);
      } catch {
        toast.error("Invalid JSON for page template rule");
        return;
      }
    }
    setSeoBlueprint((prev) => ({
      ...prev,
      pageTemplates: {
        ...(prev.pageTemplates || {}),
        [normalizedPath]: parsed,
      },
    }));
    setTemplatePathInput("");
    setTemplateJsonInput("");
    toast.success("Template rule staged. Click Save SEO.");
  };

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
          <h2 className="text-sm font-semibold">SEO Blueprint Rules (Panel Controlled)</h2>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            These are UI-independent on-page SEO rules for all connected sites: URL policy, headings, image policy,
            internal links, schema, and robots defaults.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <article className="rounded-lg border border-[var(--border-color)] p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">URL Structure</p>
              <div className="mt-2 space-y-2 text-sm">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={Boolean(seoBlueprint.urlStructure?.enforceLowercase)}
                    onChange={(event) =>
                      setSeoBlueprint((prev) => ({
                        ...prev,
                        urlStructure: { ...prev.urlStructure, enforceLowercase: event.target.checked },
                      }))
                    }
                  />
                  Enforce lowercase URLs
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={Boolean(seoBlueprint.urlStructure?.enforceHyphenatedSlugs)}
                    onChange={(event) =>
                      setSeoBlueprint((prev) => ({
                        ...prev,
                        urlStructure: { ...prev.urlStructure, enforceHyphenatedSlugs: event.target.checked },
                      }))
                    }
                  />
                  Enforce hyphenated slugs
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-[var(--text-secondary)]">Max slug length</span>
                  <input
                    type="number"
                    min={20}
                    max={220}
                    className="w-full rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm"
                    value={seoBlueprint.urlStructure?.maxSlugLength ?? 120}
                    onChange={(event) =>
                      setSeoBlueprint((prev) => ({
                        ...prev,
                        urlStructure: { ...prev.urlStructure, maxSlugLength: Number(event.target.value) || 120 },
                      }))
                    }
                  />
                </label>
              </div>
            </article>

            <article className="rounded-lg border border-[var(--border-color)] p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Heading Policy</p>
              <div className="mt-2 space-y-2 text-sm">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={Boolean(seoBlueprint.headingPolicy?.requireSingleH1)}
                    onChange={(event) =>
                      setSeoBlueprint((prev) => ({
                        ...prev,
                        headingPolicy: { ...prev.headingPolicy, requireSingleH1: event.target.checked },
                      }))
                    }
                  />
                  Require exactly one H1
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-[var(--text-secondary)]">Minimum H2 count</span>
                  <input
                    type="number"
                    min={0}
                    max={40}
                    className="w-full rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm"
                    value={seoBlueprint.headingPolicy?.minH2Count ?? 1}
                    onChange={(event) =>
                      setSeoBlueprint((prev) => ({
                        ...prev,
                        headingPolicy: { ...prev.headingPolicy, minH2Count: Number(event.target.value) || 0 },
                      }))
                    }
                  />
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={Boolean(seoBlueprint.headingPolicy?.allowH3Plus)}
                    onChange={(event) =>
                      setSeoBlueprint((prev) => ({
                        ...prev,
                        headingPolicy: { ...prev.headingPolicy, allowH3Plus: event.target.checked },
                      }))
                    }
                  />
                  Allow H3-H6 in content
                </label>
              </div>
            </article>

            <article className="rounded-lg border border-[var(--border-color)] p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Image Optimization</p>
              <div className="mt-2 space-y-2 text-sm">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={Boolean(seoBlueprint.imagePolicy?.requireAltText)}
                    onChange={(event) =>
                      setSeoBlueprint((prev) => ({
                        ...prev,
                        imagePolicy: { ...prev.imagePolicy, requireAltText: event.target.checked },
                      }))
                    }
                  />
                  Require ALT text
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={Boolean(seoBlueprint.imagePolicy?.enforceLazyLoading)}
                    onChange={(event) =>
                      setSeoBlueprint((prev) => ({
                        ...prev,
                        imagePolicy: { ...prev.imagePolicy, enforceLazyLoading: event.target.checked },
                      }))
                    }
                  />
                  Enforce lazy loading
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={Boolean(seoBlueprint.imagePolicy?.enforceWidthHeight)}
                    onChange={(event) =>
                      setSeoBlueprint((prev) => ({
                        ...prev,
                        imagePolicy: { ...prev.imagePolicy, enforceWidthHeight: event.target.checked },
                      }))
                    }
                  />
                  Require width & height attributes
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-[var(--text-secondary)]">Minimum ALT length</span>
                  <input
                    type="number"
                    min={0}
                    max={160}
                    className="w-full rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm"
                    value={seoBlueprint.imagePolicy?.minAltLength ?? 8}
                    onChange={(event) =>
                      setSeoBlueprint((prev) => ({
                        ...prev,
                        imagePolicy: { ...prev.imagePolicy, minAltLength: Number(event.target.value) || 0 },
                      }))
                    }
                  />
                </label>
              </div>
            </article>

            <article className="rounded-lg border border-[var(--border-color)] p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Internal Linking</p>
              <div className="mt-2 space-y-2 text-sm">
                <label className="block">
                  <span className="mb-1 block text-xs text-[var(--text-secondary)]">Min internal links per page</span>
                  <input
                    type="number"
                    min={0}
                    max={50}
                    className="w-full rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm"
                    value={seoBlueprint.internalLinkPolicy?.minInternalLinksPerPage ?? 5}
                    onChange={(event) =>
                      setSeoBlueprint((prev) => ({
                        ...prev,
                        internalLinkPolicy: {
                          ...prev.internalLinkPolicy,
                          minInternalLinksPerPage: Number(event.target.value) || 0,
                        },
                      }))
                    }
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-[var(--text-secondary)]">Min words in anchor text</span>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    className="w-full rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm"
                    value={seoBlueprint.internalLinkPolicy?.descriptiveAnchorMinWords ?? 2}
                    onChange={(event) =>
                      setSeoBlueprint((prev) => ({
                        ...prev,
                        internalLinkPolicy: {
                          ...prev.internalLinkPolicy,
                          descriptiveAnchorMinWords: Number(event.target.value) || 2,
                        },
                      }))
                    }
                  />
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={Boolean(seoBlueprint.internalLinkPolicy?.enforceRelatedBlock)}
                    onChange={(event) =>
                      setSeoBlueprint((prev) => ({
                        ...prev,
                        internalLinkPolicy: {
                          ...prev.internalLinkPolicy,
                          enforceRelatedBlock: event.target.checked,
                        },
                      }))
                    }
                  />
                  Require related links block
                </label>
              </div>
            </article>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <article className="rounded-lg border border-[var(--border-color)] p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Schema Policy</p>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                {SCHEMA_TYPE_OPTIONS.map((type) => {
                  const isChecked = (seoBlueprint.schemaPolicy?.enabledTypes || []).includes(type);
                  return (
                    <label key={type} className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(event) => {
                          const current = new Set(seoBlueprint.schemaPolicy?.enabledTypes || []);
                          if (event.target.checked) current.add(type);
                          else current.delete(type);
                          setSeoBlueprint((prev) => ({
                            ...prev,
                            schemaPolicy: { ...prev.schemaPolicy, enabledTypes: Array.from(current) },
                          }));
                        }}
                      />
                      {type}
                    </label>
                  );
                })}
              </div>
            </article>

            <article className="rounded-lg border border-[var(--border-color)] p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Robots & Defaults</p>
              <div className="mt-2 space-y-2 text-sm">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={Boolean(seoBlueprint.defaults?.robotsIndex)}
                    onChange={(event) =>
                      setSeoBlueprint((prev) => ({
                        ...prev,
                        defaults: { ...prev.defaults, robotsIndex: event.target.checked },
                      }))
                    }
                  />
                  Default robots: index
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={Boolean(seoBlueprint.defaults?.robotsFollow)}
                    onChange={(event) =>
                      setSeoBlueprint((prev) => ({
                        ...prev,
                        defaults: { ...prev.defaults, robotsFollow: event.target.checked },
                      }))
                    }
                  />
                  Default robots: follow
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-[var(--text-secondary)]">Default hreflang</span>
                  <input
                    className="w-full rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm"
                    value={seoBlueprint.defaults?.hreflangDefault || ""}
                    onChange={(event) =>
                      setSeoBlueprint((prev) => ({
                        ...prev,
                        defaults: { ...prev.defaults, hreflangDefault: event.target.value },
                      }))
                    }
                    placeholder="en-IN"
                  />
                </label>
              </div>
            </article>
          </div>

          <article className="mt-3 rounded-lg border border-[var(--border-color)] p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Page Template Rules (JSON)</p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              Add route-level templates for title/description/H1/schema/internal links. Useful for bulk on-page SEO governance.
            </p>
            <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-[220px_1fr_auto]">
              <input
                className="rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm"
                placeholder="/articles"
                value={templatePathInput}
                onChange={(event) => setTemplatePathInput(event.target.value)}
              />
              <input
                className="rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm"
                placeholder='{"titleTemplate":"{keyword} | Brand","minInternalLinks":6,"schemaTypes":["Article","BreadcrumbList"]}'
                value={templateJsonInput}
                onChange={(event) => setTemplateJsonInput(event.target.value)}
              />
              <button
                type="button"
                className="rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm"
                onClick={upsertTemplateRule}
              >
                Add / Update
              </button>
            </div>
            <div className="mt-3 space-y-2">
              {Object.entries(seoBlueprint.pageTemplates || {}).length ? (
                Object.entries(seoBlueprint.pageTemplates || {}).map(([path, rule]) => (
                  <div key={path} className="flex items-start justify-between gap-2 rounded-lg border border-[var(--border-color)] p-2 text-xs">
                    <div className="min-w-0">
                      <p className="font-semibold">{path}</p>
                      <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-all text-[11px] text-[var(--text-secondary)]">
                        {JSON.stringify(rule, null, 2)}
                      </pre>
                    </div>
                    <button
                      type="button"
                      className="rounded-md border border-rose-300 px-2 py-1 text-rose-600"
                      onClick={() =>
                        setSeoBlueprint((prev) => {
                          const next = { ...(prev.pageTemplates || {}) };
                          delete next[path];
                          return { ...prev, pageTemplates: next };
                        })
                      }
                    >
                      Remove
                    </button>
                  </div>
                ))
              ) : (
                <p className="text-xs text-[var(--text-secondary)]">No custom template rules yet.</p>
              )}
            </div>
          </article>
        </section>

        <section className="glass rounded-panel p-4">
          <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-3">
            <article className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] p-3">
              <p className="text-[11px] uppercase tracking-wide text-[var(--text-secondary)]">URLs Discovered</p>
              <p className="mt-1 text-lg font-semibold">{Number(seoStatus?.crawl?.discoveredUrls || 0)}</p>
            </article>
            <article className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] p-3">
              <p className="text-[11px] uppercase tracking-wide text-[var(--text-secondary)]">URLs Inspected</p>
              <p className="mt-1 text-lg font-semibold">{Number(seoStatus?.crawl?.inspectedUrls || 0)}</p>
            </article>
            <article className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] p-3">
              <p className="text-[11px] uppercase tracking-wide text-[var(--text-secondary)]">Checked At</p>
              <p className="mt-1 text-sm font-medium">
                {seoStatus?.checkedAt ? new Date(seoStatus.checkedAt).toLocaleString() : "-"}
              </p>
            </article>
          </div>

          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Actionable SEO Warnings</h2>
            <span className="inline-flex items-center gap-1 text-xs text-[var(--text-secondary)]">
              <AlertTriangle size={13} />
              {pageWarnings.length} page(s) with warnings
            </span>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
            {pageWarnings.length ? (
              pageWarnings.map((page) => (
                <article key={`warn-${page.page}-${page.url}`} className="rounded-lg border border-rose-300/70 bg-rose-50/50 p-3 text-xs">
                  <p className="font-semibold text-rose-700">{page.page}</p>
                  <p className="mt-1 text-[var(--text-secondary)]">{page.url}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {page.missing.map((item) => (
                      <span
                        key={`${page.page}-${item}`}
                        className="rounded-md border border-rose-200 bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-700"
                      >
                        {missingLabel(item)}
                      </span>
                    ))}
                  </div>
                </article>
              ))
            ) : (
              <p className="text-xs text-[var(--text-secondary)]">No warnings. Current scanned pages look healthy.</p>
            )}
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
                  <th className="px-3 py-2 text-left">Internal Links</th>
                  <th className="px-3 py-2 text-left">Image Alt</th>
                  <th className="px-3 py-2 text-left">HTTP</th>
                </tr>
              </thead>
              <tbody>
                {checksSummary.pages.length ? (
                  checksSummary.pages.map((page) => (
                    <tr
                      key={`${page.page}-${page.url}`}
                      className={`border-t border-[var(--border-color)] ${Array.isArray(page.missing) && page.missing.length ? "bg-rose-50/40" : ""}`}
                    >
                      <td className="px-3 py-2">
                        <a href={page.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                          {page.page}
                        </a>
                        {page.path ? <p className="mt-0.5 text-[11px] text-[var(--text-secondary)]">{page.path}</p> : null}
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
                      <td className="px-3 py-2">
                        {Array.isArray(page.missing) && page.missing.length ? (
                          <div className="flex flex-wrap gap-1">
                            {page.missing.map((item) => (
                              <span
                                key={`${page.page}-missing-${item}`}
                                className="rounded-md border border-rose-200 bg-rose-100 px-1.5 py-0.5 text-[11px] font-medium text-rose-700"
                              >
                                {missingLabel(item)}
                              </span>
                            ))}
                          </div>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {typeof page.metrics?.links?.internal === "number" ? page.metrics.links.internal : "-"}
                      </td>
                      <td className="px-3 py-2">
                        {typeof page.metrics?.images?.withMeaningfulAlt === "number" && typeof page.metrics?.images?.total === "number"
                          ? `${page.metrics.images.withMeaningfulAlt}/${page.metrics.images.total}`
                          : "-"}
                      </td>
                      <td className="px-3 py-2">{page.httpStatus ?? "N/A"}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-3 py-3 text-[var(--text-secondary)]" colSpan={6}>
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
