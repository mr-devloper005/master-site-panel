import { useEffect, useState } from "react";
import toast from "react-hot-toast";

import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useAppData } from "../context/AppContext";
import {
  fetchSiteBlueprint,
  fetchSmtpSettings,
  getIntegrationSettings,
  saveIntegrationSettings,
  testSmtpSettings,
  updateSmtpSettings,
  validateIntegration,
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
  const [integrationStatus, setIntegrationStatus] = useState(null);
  const [smtpSettings, setSmtpSettings] = useState({
    host: "smtp.gmail.com",
    port: 587,
    username: "",
    password: "",
    fromEmail: "",
    defaultNotifyEmail: "",
    secure: false,
    isEnabled: true,
    hasPassword: false,
    configured: false,
    source: "database",
  });
  const [smtpTestEmail, setSmtpTestEmail] = useState("");
  const [smtpLoading, setSmtpLoading] = useState(false);

  useEffect(() => {
    const loadSmtpSettings = async () => {
      try {
        const settings = await fetchSmtpSettings();
        setSmtpSettings((current) => ({
          ...current,
          ...settings,
          password: "",
        }));
        setSmtpTestEmail(settings.defaultNotifyEmail || settings.username || "");
      } catch (error) {
        // Settings are optional for local installs; keep the page usable.
        console.warn(error);
      }
    };
    loadSmtpSettings();
  }, []);

  const saveIntegration = async () => {
    const normalizedBackendUrl = backendUrl.trim();
    const normalizedApiKey = apiKey.trim();
    if (!normalizedBackendUrl || !normalizedApiKey) {
      toast.error("Backend URL and Master API Key are required.");
      return;
    }
    const status = await validateIntegration({
      backendUrl: normalizedBackendUrl,
      apiKey: normalizedApiKey,
      headers: {},
    });

    saveIntegrationSettings({ backendUrl: normalizedBackendUrl, apiKey: normalizedApiKey });
    setIntegrationStatus(status);
    await hydrate();
    if (status.capabilities.canReadSites && status.capabilities.canReadPosts) {
      const missing = [];
      if (!status.capabilities.canWriteSites) missing.push("sites:write");
      if (!status.capabilities.canManageKeys) missing.push("keys:write");

      toast.success(
        missing.length
          ? `Backend connected. Limited scopes: missing ${missing.join(", ")}`
          : "Backend integration saved"
      );
      return;
    }

    toast.error("API key connected, but it does not have enough read access for the panel.");
  };

  const loadBlueprint = async (siteId) => {
    if (!siteId) return;
    setSelectedBlueprintSiteId(siteId);
    const blueprintResult = await fetchSiteBlueprint(siteId);
    setBlueprint(blueprintResult);
  };

  const saveSmtpSettings = async () => {
    setSmtpLoading(true);
    try {
      const saved = await updateSmtpSettings({
        host: smtpSettings.host,
        port: Number(smtpSettings.port || 587),
        username: smtpSettings.username,
        password: smtpSettings.password,
        fromEmail: smtpSettings.fromEmail,
        defaultNotifyEmail: smtpSettings.defaultNotifyEmail,
        secure: Boolean(smtpSettings.secure),
        isEnabled: Boolean(smtpSettings.isEnabled),
      });
      setSmtpSettings((current) => ({ ...current, ...saved, password: "" }));
      toast.success("SMTP settings saved");
    } catch (error) {
      toast.error(error.message || "Failed to save SMTP settings");
    } finally {
      setSmtpLoading(false);
    }
  };

  const sendSmtpTest = async () => {
    setSmtpLoading(true);
    try {
      const tested = await testSmtpSettings(smtpTestEmail);
      setSmtpSettings((current) => ({ ...current, ...tested, password: "" }));
      toast.success("SMTP test email sent");
    } catch (error) {
      toast.error(error.message || "SMTP test failed");
    } finally {
      setSmtpLoading(false);
    }
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
          {integrationStatus ? (
            <div className="mt-3 rounded-lg border border-[var(--border-color)] p-3 text-sm">
              <p className="font-medium">{integrationStatus.name}</p>
              <p className="mt-1 text-xs text-[var(--text-secondary)] break-all">
                Scopes: {integrationStatus.scopes.join(", ")}
              </p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <span className={`rounded-full px-2 py-1 ${integrationStatus.capabilities.canReadSites ? "bg-emerald-500/15 text-emerald-600" : "bg-rose-500/15 text-rose-600"}`}>sites:read</span>
                <span className={`rounded-full px-2 py-1 ${integrationStatus.capabilities.canReadPosts ? "bg-emerald-500/15 text-emerald-600" : "bg-rose-500/15 text-rose-600"}`}>posts:read</span>
                <span className={`rounded-full px-2 py-1 ${integrationStatus.capabilities.canWriteSites ? "bg-emerald-500/15 text-emerald-600" : "bg-amber-500/15 text-amber-700"}`}>sites:write</span>
                <span className={`rounded-full px-2 py-1 ${integrationStatus.capabilities.canWritePosts ? "bg-emerald-500/15 text-emerald-600" : "bg-amber-500/15 text-amber-700"}`}>posts:write</span>
                <span className={`rounded-full px-2 py-1 ${integrationStatus.capabilities.canManageKeys ? "bg-emerald-500/15 text-emerald-600" : "bg-amber-500/15 text-amber-700"}`}>keys:write</span>
              </div>
            </div>
          ) : null}
        </section>

        <section className="glass rounded-panel p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold">SMTP & Contact Email</h2>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                Save sender SMTP once here. Contact forms will use this for visitor acknowledgments and team notifications.
              </p>
            </div>
            <span className={`rounded-full px-2 py-1 text-xs font-semibold ${smtpSettings.configured ? "bg-emerald-500/15 text-emerald-700" : "bg-amber-500/15 text-amber-700"}`}>
              {smtpSettings.configured ? `Configured via ${smtpSettings.source}` : "Not configured"}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <label>
              <span className="mb-1 block text-sm">SMTP Host</span>
              <input className="w-full rounded-lg border border-[var(--border-color)] px-3 py-2" value={smtpSettings.host} onChange={(e) => setSmtpSettings((s) => ({ ...s, host: e.target.value }))} placeholder="smtp.gmail.com" />
            </label>
            <label>
              <span className="mb-1 block text-sm">SMTP Port</span>
              <input className="w-full rounded-lg border border-[var(--border-color)] px-3 py-2" type="number" value={smtpSettings.port} onChange={(e) => setSmtpSettings((s) => ({ ...s, port: e.target.value }))} placeholder="587" />
            </label>
            <label>
              <span className="mb-1 block text-sm">SMTP User</span>
              <input className="w-full rounded-lg border border-[var(--border-color)] px-3 py-2" value={smtpSettings.username} onChange={(e) => setSmtpSettings((s) => ({ ...s, username: e.target.value }))} placeholder="sender@gmail.com" />
            </label>
            <label>
              <span className="mb-1 block text-sm">SMTP App Password</span>
              <input className="w-full rounded-lg border border-[var(--border-color)] px-3 py-2" type="password" value={smtpSettings.password} onChange={(e) => setSmtpSettings((s) => ({ ...s, password: e.target.value }))} placeholder={smtpSettings.hasPassword ? "Saved - leave blank to keep" : "16 character app password"} />
            </label>
            <label>
              <span className="mb-1 block text-sm">From Email</span>
              <input className="w-full rounded-lg border border-[var(--border-color)] px-3 py-2" value={smtpSettings.fromEmail} onChange={(e) => setSmtpSettings((s) => ({ ...s, fromEmail: e.target.value }))} placeholder="Contact Leads <sender@gmail.com>" />
            </label>
            <label>
              <span className="mb-1 block text-sm">Default Sales/Receiver Email</span>
              <input className="w-full rounded-lg border border-[var(--border-color)] px-3 py-2" value={smtpSettings.defaultNotifyEmail} onChange={(e) => setSmtpSettings((s) => ({ ...s, defaultNotifyEmail: e.target.value }))} placeholder="sales@example.com" />
            </label>
          </div>

          <div className="mt-3 flex flex-wrap gap-3 text-sm">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={smtpSettings.isEnabled} onChange={(e) => setSmtpSettings((s) => ({ ...s, isEnabled: e.target.checked }))} />
              Enabled
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={smtpSettings.secure} onChange={(e) => setSmtpSettings((s) => ({ ...s, secure: e.target.checked }))} />
              Secure SSL (usually port 465)
            </label>
          </div>

          <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-end">
            <button className="rounded-lg bg-blue-600 px-4 py-2 text-white disabled:opacity-60" onClick={saveSmtpSettings} disabled={smtpLoading}>
              {smtpLoading ? "Saving..." : "Save SMTP Settings"}
            </button>
            <label className="flex-1">
              <span className="mb-1 block text-sm">Send Test To</span>
              <input className="w-full rounded-lg border border-[var(--border-color)] px-3 py-2" value={smtpTestEmail} onChange={(e) => setSmtpTestEmail(e.target.value)} placeholder="your-email@example.com" />
            </label>
            <button className="rounded-lg border border-[var(--border-color)] px-4 py-2 disabled:opacity-60" onClick={sendSmtpTest} disabled={smtpLoading}>
              Send Test
            </button>
          </div>

          {smtpSettings.lastTestAt ? (
            <p className={`mt-3 text-xs ${smtpSettings.lastTestStatus === "SUCCESS" ? "text-emerald-600" : "text-rose-600"}`}>
              Last test: {smtpSettings.lastTestStatus} at {new Date(smtpSettings.lastTestAt).toLocaleString()}
              {smtpSettings.lastTestError ? ` - ${smtpSettings.lastTestError}` : ""}
            </p>
          ) : null}
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
