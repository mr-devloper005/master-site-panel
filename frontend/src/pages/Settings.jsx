import { useEffect, useState } from "react";
import toast from "react-hot-toast";

import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useAppData } from "../context/AppContext";
import {
  fetchSiteBlueprint,
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
    const result = await fetchSiteBlueprint(siteId);
    setBlueprint(result);
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
      </div>
    </div>
  );
}
