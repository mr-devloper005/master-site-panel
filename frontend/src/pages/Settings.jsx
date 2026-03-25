import { useEffect, useState } from "react";
import toast from "react-hot-toast";

import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useAppData } from "../context/AppContext";
import {
  fetchSiteBlueprint,
  fetchSiteSeoStatus,
  fetchSiteSitemapStatus,
  getIntegrationSettings,
  saveIntegrationSettings,
} from "../utils/api";

export default function Settings() {
  const { user } = useAuth();
  const { theme, toggleTheme, highContrast, toggleContrast } = useTheme();
  const { sites, hydrate } = useAppData();
  const integration = getIntegrationSettings();

  const [profile, setProfile] = useState({ name: user?.name || "", email: user?.email || "" });
  const [backendUrl, setBackendUrl] = useState(integration.backendUrl);
  const [apiKey, setApiKey] = useState(integration.apiKey);
  const [blueprint, setBlueprint] = useState(null);
  const [selectedBlueprintSiteId, setSelectedBlueprintSiteId] = useState("");
  const [sitemapStatus, setSitemapStatus] = useState(null);
  const [loadingSitemap, setLoadingSitemap] = useState(false);
  const [seoStatus, setSeoStatus] = useState(null);
  const [loadingSeo, setLoadingSeo] = useState(false);

  useEffect(() => {
    return undefined;
  }, []);

  const saveIntegration = async () => {
    saveIntegrationSettings({ backendUrl, apiKey });
    await hydrate();
    toast.success("Backend integration saved");
  };

  const loadBlueprint = async (siteId) => {
    if (!siteId) return;
    setSelectedBlueprintSiteId(siteId);
    const [blueprintResult, sitemapResult, seoResult] = await Promise.all([
      fetchSiteBlueprint(siteId),
      (async () => {
        setLoadingSitemap(true);
        try {
          return await fetchSiteSitemapStatus(siteId);
        } finally {
          setLoadingSitemap(false);
        }
      })(),
      (async () => {
        setLoadingSeo(true);
        try {
          return await fetchSiteSeoStatus(siteId);
        } finally {
          setLoadingSeo(false);
        }
      })(),
    ]);
    setBlueprint(blueprintResult);
    setSitemapStatus(sitemapResult);
    setSeoStatus(seoResult);
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      <h1 className="text-xl font-bold">Settings</h1>

      <div className="scrollbar-thin min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        <section className="glass rounded-panel p-4">
          <h2 className="text-sm font-semibold">User Profile</h2>
          <form
            className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              toast.success("Profile settings saved");
            }}
          >
            <label>
              <span className="mb-1 block text-sm">Name</span>
              <input className="w-full rounded-lg border border-[var(--border-color)] px-3 py-2" value={profile.name} onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))} />
            </label>
            <label>
              <span className="mb-1 block text-sm">Email</span>
              <input className="w-full rounded-lg border border-[var(--border-color)] px-3 py-2" value={profile.email} onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))} />
            </label>
            <div className="md:col-span-2">
              <button className="rounded-lg bg-blue-600 px-4 py-2 text-white">Save Profile</button>
            </div>
          </form>
        </section>

        <section className="glass rounded-panel p-4">
          <h2 className="text-sm font-semibold">Theme & Accessibility</h2>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              className="min-h-11 rounded-lg border border-[var(--border-color)] px-4 py-2 text-left"
              onClick={() => {
                toggleTheme();
                toast.success(`Theme switched to ${theme === "dark" ? "light" : "dark"} mode`);
              }}
            >
              Theme Mode
              <span className="ml-2 text-xs text-[var(--text-secondary)]">{theme.toUpperCase()}</span>
            </button>
            <button
              className="min-h-11 rounded-lg border border-[var(--border-color)] px-4 py-2 text-left"
              onClick={() => {
                toggleContrast();
                toast.success(`High contrast ${highContrast ? "disabled" : "enabled"}`);
              }}
            >
              High Contrast
              <span className="ml-2 text-xs text-[var(--text-secondary)]">{highContrast ? "ON" : "OFF"}</span>
            </button>
          </div>
        </section>

        <section className="glass rounded-panel p-4">
          <h2 className="text-sm font-semibold">Backend Integration</h2>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <label>
              <span className="mb-1 block text-sm">Backend URL</span>
              <input className="w-full rounded-lg border border-[var(--border-color)] px-3 py-2" value={backendUrl} onChange={(e) => setBackendUrl(e.target.value)} placeholder="http://localhost:4000" />
            </label>
            <label>
              <span className="mb-1 block text-sm">Master API Key</span>
              <input className="w-full rounded-lg border border-[var(--border-color)] px-3 py-2" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Paste backend API key" />
            </label>
          </div>
          <button className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-white" onClick={saveIntegration}>
            Save Integration
          </button>
        </section>

        <section className="glass rounded-panel p-4">
          <h2 className="text-sm font-semibold">Connector Blueprint</h2>
          <div className="mt-3">
            <label className="mb-1 block text-sm">Select site</label>
            <select
              className="w-full rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm"
              value={selectedBlueprintSiteId}
              onChange={(e) => loadBlueprint(e.target.value)}
            >
              <option value="">Choose a site</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </select>
          </div>
          {blueprint ? (
            <div className="mt-3 space-y-3 text-sm">
              <div>
                <p className="font-medium">{blueprint.site.name}</p>
                <p className="text-xs text-[var(--text-secondary)]">{blueprint.site.code}</p>
              </div>
              <pre className="overflow-x-auto rounded-lg border border-[var(--border-color)] bg-slate-950 p-3 text-xs text-slate-100">
                {JSON.stringify(blueprint.blueprint, null, 2)}
              </pre>
            </div>
          ) : (
            <p className="mt-3 text-sm text-[var(--text-secondary)]">Select a site above to inspect the reusable connector contract.</p>
          )}
        </section>

        <section className="glass rounded-panel p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Sitemap Live Status</h2>
            <button
              className="rounded-lg border border-[var(--border-color)] px-3 py-1.5 text-xs"
              onClick={() => selectedBlueprintSiteId && loadBlueprint(selectedBlueprintSiteId)}
              disabled={!selectedBlueprintSiteId || loadingSitemap || loadingSeo}
            >
              {loadingSitemap || loadingSeo ? "Checking..." : "Refresh"}
            </button>
          </div>

          {!selectedBlueprintSiteId ? (
            <p className="mt-3 text-sm text-[var(--text-secondary)]">
              Select a site in Connector Blueprint first to inspect its live sitemap.
            </p>
          ) : sitemapStatus ? (
            <div className="mt-3 space-y-3 text-sm">
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <p>
                  <span className="text-[var(--text-secondary)]">Sitemap URL: </span>
                  <a
                    href={sitemapStatus.sitemapUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    {sitemapStatus.sitemapUrl}
                  </a>
                </p>
                <p>
                  <span className="text-[var(--text-secondary)]">HTTP: </span>
                  {sitemapStatus.httpStatus ?? "N/A"}
                </p>
                <p>
                  <span className="text-[var(--text-secondary)]">Reachable: </span>
                  {sitemapStatus.reachable ? "Yes" : "No"}
                </p>
                <p>
                  <span className="text-[var(--text-secondary)]">URLs found: </span>
                  {sitemapStatus.urlCount}
                </p>
                <p>
                  <span className="text-[var(--text-secondary)]">Host mismatch: </span>
                  {sitemapStatus.hostMismatchCount}
                </p>
                <p>
                  <span className="text-[var(--text-secondary)]">Checked at: </span>
                  {new Date(sitemapStatus.checkedAt).toLocaleString()}
                </p>
              </div>
              {sitemapStatus.error ? (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700">
                  {sitemapStatus.error}
                </p>
              ) : null}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                  Sample URLs
                </p>
                {Array.isArray(sitemapStatus.sampleUrls) && sitemapStatus.sampleUrls.length ? (
                  <div className="space-y-1 rounded-lg border border-[var(--border-color)] p-3 text-xs">
                    {sitemapStatus.sampleUrls.map((url) => (
                      <div key={url} className="truncate">
                        {url}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-[var(--text-secondary)]">No URLs found.</p>
                )}
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-[var(--text-secondary)]">No sitemap status data yet.</p>
          )}
        </section>

        <section className="glass rounded-panel p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">SEO Live Status</h2>
            <button
              className="rounded-lg border border-[var(--border-color)] px-3 py-1.5 text-xs"
              onClick={() => selectedBlueprintSiteId && loadBlueprint(selectedBlueprintSiteId)}
              disabled={!selectedBlueprintSiteId || loadingSeo}
            >
              {loadingSeo ? "Checking..." : "Refresh"}
            </button>
          </div>
          {!selectedBlueprintSiteId ? (
            <p className="mt-3 text-sm text-[var(--text-secondary)]">
              Select a site first to run live SEO checks.
            </p>
          ) : seoStatus ? (
            <div className="mt-3 space-y-3 text-sm">
              <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                <p>
                  <span className="text-[var(--text-secondary)]">SEO score: </span>
                  <span className={seoStatus.score >= 80 ? "text-emerald-600 font-semibold" : "text-amber-600 font-semibold"}>
                    {seoStatus.score}%
                  </span>
                </p>
                <p>
                  <span className="text-[var(--text-secondary)]">Checks passed: </span>
                  {seoStatus.summary?.passedChecks ?? 0}/{seoStatus.summary?.totalChecks ?? 0}
                </p>
                <p>
                  <span className="text-[var(--text-secondary)]">Checked at: </span>
                  {seoStatus.checkedAt ? new Date(seoStatus.checkedAt).toLocaleString() : "N/A"}
                </p>
              </div>

              <div className="rounded-lg border border-[var(--border-color)] p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                  Robots & Sitemap
                </p>
                <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                  <p>robots.txt: {seoStatus.robots?.reachable ? "OK" : "Not reachable"}</p>
                  <p>sitemap.xml: {seoStatus.sitemap?.reachable ? "OK" : "Not reachable"}</p>
                  <p>Sitemap URLs: {seoStatus.sitemap?.urlCount ?? 0}</p>
                  <p>robots has sitemap ref: {seoStatus.robots?.hasSitemapReference ? "Yes" : "No"}</p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                  Page-level checks
                </p>
                {Array.isArray(seoStatus.pages) && seoStatus.pages.length ? (
                  seoStatus.pages.map((page) => (
                    <div key={page.url} className="rounded-lg border border-[var(--border-color)] p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium">{page.page}</p>
                        <a href={page.url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">
                          Open
                        </a>
                      </div>
                      <p className="mt-1 text-xs text-[var(--text-secondary)]">
                        HTTP: {page.httpStatus ?? "N/A"} • Reachable: {page.reachable ? "Yes" : "No"}
                      </p>
                      {Array.isArray(page.missing) && page.missing.length ? (
                        <p className="mt-2 text-xs text-amber-700">
                          Missing: {page.missing.join(", ")}
                        </p>
                      ) : (
                        <p className="mt-2 text-xs text-emerald-700">All required checks passed.</p>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-[var(--text-secondary)]">No page checks available.</p>
                )}
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-[var(--text-secondary)]">No SEO status data yet.</p>
          )}
        </section>
      </div>
    </div>
  );
}
