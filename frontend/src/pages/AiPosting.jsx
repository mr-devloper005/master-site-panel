import { useEffect, useMemo, useState } from "react";
import { Bot, CheckCircle2, Clock3, Loader2, Plus, RefreshCw, Search, ShieldCheck, Sparkles, Trash2, XCircle } from "lucide-react";
import toast from "react-hot-toast";

import RemoteSiteSelect from "../components/ui/RemoteSiteSelect";
import {
  createAiPostingJob,
  fetchAiPostingJobs,
  fetchAiPostingSettings,
  fetchAiPostingJobStatus,
  testAiPostingSettings,
  updateAiPostingSettings,
} from "../utils/api";

const emptySettings = {
  model: "gpt-5-nano",
  openAiApiUrl: "https://api.openai.com/v1/responses",
  apiKey: "",
  defaultWordCount: 600,
  retryOn404: true,
  requestTimeoutMs: 12000,
  isEnabled: true,
  hasApiKey: false,
  configured: false,
  source: "environment",
  environmentFallbackConfigured: false,
  lastTestAt: null,
  lastTestStatus: null,
  lastTestError: null,
};

export default function AiPosting() {
  const [settings, setSettings] = useState(emptySettings);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsTesting, setSettingsTesting] = useState(false);

  const [targetUrl, setTargetUrl] = useState("");
  const [brandName, setBrandName] = useState("");
  const [sitePickerValue, setSitePickerValue] = useState("");
  const [targets, setTargets] = useState([]);
  const [jobCreateLoading, setJobCreateLoading] = useState(false);
  const [latestJob, setLatestJob] = useState(null);

  const [jobs, setJobs] = useState([]);
  const [jobsMeta, setJobsMeta] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobsSearch, setJobsSearch] = useState("");
  const [jobsStatus, setJobsStatus] = useState("");

  const stats = useMemo(() => {
    return jobs.reduce(
      (acc, job) => {
        acc.total += 1;
        if (job.status === "COMPLETED") acc.completed += 1;
        else if (job.status === "FAILED") acc.failed += 1;
        else if (job.status === "PARTIAL") acc.partial += 1;
        else acc.processing += 1;
        return acc;
      },
      { total: 0, completed: 0, failed: 0, partial: 0, processing: 0 }
    );
  }, [jobs]);

  const loadSettings = async () => {
    setSettingsLoading(true);
    try {
      const result = await fetchAiPostingSettings();
      setSettings((current) => ({ ...current, ...result, apiKey: "" }));
    } catch (error) {
      toast.error(error.message || "Failed to load AI posting settings");
    } finally {
      setSettingsLoading(false);
    }
  };

  const loadJobs = async (page = 1, overrides = {}) => {
    setJobsLoading(true);
    try {
      const result = await fetchAiPostingJobs({
        page,
        limit: jobsMeta.limit || 20,
        search: overrides.search ?? jobsSearch,
        status: overrides.status ?? jobsStatus,
      });
      setJobs(result.data || []);
      setJobsMeta(result.meta || { page: 1, limit: 20, total: 0, totalPages: 1 });
    } catch (error) {
      toast.error(error.message || "Failed to load AI posting jobs");
    } finally {
      setJobsLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
    loadJobs(1);
  }, []);

  const saveSettings = async () => {
    setSettingsSaving(true);
    try {
      const saved = await updateAiPostingSettings({
        model: settings.model,
        apiKey: settings.apiKey,
        openAiApiUrl: settings.openAiApiUrl,
        defaultWordCount: Number(settings.defaultWordCount || 600),
        retryOn404: Boolean(settings.retryOn404),
        requestTimeoutMs: Number(settings.requestTimeoutMs || 12000),
        isEnabled: Boolean(settings.isEnabled),
      });
      setSettings((current) => ({ ...current, ...saved, apiKey: "" }));
      toast.success("AI posting settings saved");
    } catch (error) {
      toast.error(error.message || "Failed to save AI posting settings");
    } finally {
      setSettingsSaving(false);
    }
  };

  const runSettingsTest = async () => {
    setSettingsTesting(true);
    try {
      const tested = await testAiPostingSettings();
      setSettings((current) => ({ ...current, ...tested, apiKey: "" }));
      toast.success("OpenAI test passed");
    } catch (error) {
      toast.error(error.message || "OpenAI test failed");
    } finally {
      setSettingsTesting(false);
    }
  };

  const addTarget = (site) => {
    if (!site?.id) return;
    if (targets.some((target) => target.id === site.id)) {
      toast("Site already added");
      return;
    }
    setTargets((current) => [...current, site]);
    setSitePickerValue("");
  };

  const removeTarget = (siteId) => {
    setTargets((current) => current.filter((site) => site.id !== siteId));
  };

  const submitJob = async () => {
    if (!targetUrl.trim()) {
      toast.error("Target URL is required");
      return;
    }
    if (!targets.length) {
      toast.error("Add at least one site");
      return;
    }

    setJobCreateLoading(true);
    try {
      const result = await createAiPostingJob({
        targetUrl: targetUrl.trim(),
        brandName: brandName.trim(),
        targets: targets.map((site) => ({ siteId: site.id })),
      });
      setLatestJob(result);
      toast.success(`Job created: ${result.jobId}`);
      loadJobs(1);
    } catch (error) {
      toast.error(error.message || "Failed to create AI posting job");
    } finally {
      setJobCreateLoading(false);
    }
  };

  const refreshJob = async (jobId) => {
    try {
      const result = await fetchAiPostingJobStatus(jobId);
      if (latestJob?.jobId === jobId) setLatestJob(result);
      await loadJobs(jobsMeta.page || 1);
      toast.success("Job status refreshed");
    } catch (error) {
      toast.error(error.message || "Failed to refresh job");
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      <div className="flex items-start justify-between gap-4 rounded-[28px] border border-[var(--border-color)] bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.14),transparent_32%),linear-gradient(180deg,var(--bg-secondary),rgba(15,23,42,0.92))] p-5 text-[var(--text-primary)] shadow-sm">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--text-secondary)]">
            <Bot size={14} /> AI Posting Engine
          </div>
          <h1 className="mt-3 text-2xl font-bold">Crawl, generate, publish, and track from one panel.</h1>
          <p className="mt-2 max-w-3xl text-sm text-[var(--text-secondary)]">
            Admin controls the model and key here. Third-party users only send target URL, brand, and site IDs. The backend handles task detection, crawl, AI generation, fallback, and publishing.
          </p>
        </div>
        <div className="grid min-w-[260px] grid-cols-2 gap-3 rounded-3xl border border-[var(--border-color)] bg-[var(--bg-primary)] p-3 text-sm shadow-inner">
          <Stat label="Jobs" value={stats.total} tone="default" />
          <Stat label="Running" value={stats.processing} tone="blue" />
          <Stat label="Done" value={stats.completed} tone="green" />
          <Stat label="Failed" value={stats.failed} tone="rose" />
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-[1.1fr_1fr]">
        <div className="scrollbar-thin min-h-0 space-y-4 overflow-y-auto pr-1">
          <section className="rounded-[28px] border border-[var(--border-color)] bg-[var(--bg-secondary)] p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">AI Posting Settings</h2>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">This is the admin-controlled source of truth for the OpenAI model, key, retry policy, and crawl timeout.</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${settings.configured ? "bg-emerald-500/15 text-emerald-600" : "bg-amber-500/15 text-amber-700"}`}>
                {settings.configured ? `Configured via ${settings.source}` : "Not configured"}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <label>
                <span className="mb-1 block text-sm font-medium">Model</span>
                <input className="w-full rounded-2xl border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2" value={settings.model} onChange={(e) => setSettings((s) => ({ ...s, model: e.target.value }))} placeholder="gpt-5.1-nano" />
              </label>
              <label>
                <span className="mb-1 block text-sm font-medium">OpenAI API URL</span>
                <input className="w-full rounded-2xl border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2" value={settings.openAiApiUrl} onChange={(e) => setSettings((s) => ({ ...s, openAiApiUrl: e.target.value }))} placeholder="https://api.openai.com/v1/responses" />
              </label>
              <label className="md:col-span-2">
                <span className="mb-1 block text-sm font-medium">OpenAI API Key</span>
                <input className="w-full rounded-2xl border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2" type="password" value={settings.apiKey} onChange={(e) => setSettings((s) => ({ ...s, apiKey: e.target.value }))} placeholder={settings.hasApiKey ? "Saved - leave blank to keep" : "Paste OpenAI API key"} />
              </label>
              <label>
                <span className="mb-1 block text-sm font-medium">Default Word Count</span>
                <input className="w-full rounded-2xl border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2" type="number" value={settings.defaultWordCount} onChange={(e) => setSettings((s) => ({ ...s, defaultWordCount: e.target.value }))} />
              </label>
              <label>
                <span className="mb-1 block text-sm font-medium">Request Timeout (ms)</span>
                <input className="w-full rounded-2xl border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2" type="number" value={settings.requestTimeoutMs} onChange={(e) => setSettings((s) => ({ ...s, requestTimeoutMs: e.target.value }))} />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" checked={Boolean(settings.retryOn404)} onChange={(e) => setSettings((s) => ({ ...s, retryOn404: e.target.checked }))} /> Retry once on 404 / unreachable
              </label>
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" checked={Boolean(settings.isEnabled)} onChange={(e) => setSettings((s) => ({ ...s, isEnabled: e.target.checked }))} /> AI posting enabled
              </label>
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <button className="rounded-2xl bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60" onClick={saveSettings} disabled={settingsSaving || settingsLoading}>
                {settingsSaving ? "Saving..." : "Save AI Settings"}
              </button>
              <button className="rounded-2xl border border-[var(--border-color)] px-4 py-2 text-sm font-medium" onClick={runSettingsTest} disabled={settingsTesting || settingsLoading}>
                {settingsTesting ? "Testing..." : "Test OpenAI Connection"}
              </button>
            </div>

            {settings.lastTestAt ? (
              <p className={`mt-3 text-xs ${settings.lastTestStatus === "SUCCESS" ? "text-emerald-600" : "text-rose-600"}`}>
                Last test: {settings.lastTestStatus} at {new Date(settings.lastTestAt).toLocaleString()}
                {settings.lastTestError ? ` - ${settings.lastTestError}` : ""}
              </p>
            ) : null}
          </section>

          <section className="rounded-[28px] border border-[var(--border-color)] bg-[var(--bg-secondary)] p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Create Test Job</h2>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">Use the same API flow the third party will use: target URL, optional brand, and selected sites only.</p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">Backend infers task type</span>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="md:col-span-2">
                <span className="mb-1 block text-sm font-medium">Target URL</span>
                <input className="w-full rounded-2xl border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2" value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)} placeholder="https://clientsite.com/service-page" />
              </label>
              <label className="md:col-span-2">
                <span className="mb-1 block text-sm font-medium">Brand Name (optional)</span>
                <input className="w-full rounded-2xl border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2" value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="ABC Services" />
              </label>
            </div>

            <div className="mt-4 rounded-3xl border border-[var(--border-color)] bg-[var(--bg-primary)] p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-end">
                <RemoteSiteSelect
                  className="flex-1"
                  label="Add Site"
                  value={sitePickerValue}
                  onChange={setSitePickerValue}
                  onSiteChange={addTarget}
                  placeholder="Search site by name, code, or domain"
                />
                <div className="text-xs text-[var(--text-secondary)] md:max-w-[240px]">
                  Each selected site becomes one run inside the parent job. The system will infer the allowed task from site configuration.
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {targets.length ? targets.map((site) => (
                  <div key={site.id} className="inline-flex items-center gap-2 rounded-full border border-[var(--border-color)] bg-[var(--bg-secondary)] px-3 py-2 text-sm">
                    <span className="font-medium">{site.name}</span>
                    <span className="text-xs text-[var(--text-secondary)]">{site.code}</span>
                    <button type="button" onClick={() => removeTarget(site.id)} className="text-rose-500">
                      <Trash2 size={14} />
                    </button>
                  </div>
                )) : <p className="text-sm text-[var(--text-secondary)]">No sites added yet.</p>}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <button className="rounded-2xl bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60" onClick={submitJob} disabled={jobCreateLoading}>
                {jobCreateLoading ? "Creating..." : "Create AI Posting Job"}
              </button>
              {latestJob?.jobId ? (
                <button className="rounded-2xl border border-[var(--border-color)] px-4 py-2 text-sm font-medium" onClick={() => refreshJob(latestJob.jobId)}>
                  Refresh Latest Job
                </button>
              ) : null}
            </div>

            {latestJob ? (
              <div className="mt-4 rounded-3xl border border-[var(--border-color)] bg-[var(--bg-primary)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs uppercase tracking-[0.24em] text-[var(--text-secondary)]">Latest job</p>
                    <p className="mt-1 font-mono text-sm">{latestJob.jobId}</p>
                  </div>
                  <StatusBadge status={latestJob.status} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                  <MiniStat label="Targets" value={latestJob.summary?.total ?? latestJob.totalTargets ?? 0} />
                  <MiniStat label="Done" value={latestJob.summary?.completed ?? 0} tone="green" />
                  <MiniStat label="Pending" value={latestJob.summary?.pending ?? 0} tone="amber" />
                  <MiniStat label="Failed" value={latestJob.summary?.failed ?? 0} tone="rose" />
                </div>
                <div className="mt-4 space-y-2">
                  {(latestJob.runs || []).map((run) => (
                    <div key={run.taskId} className="rounded-2xl border border-[var(--border-color)] px-3 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-medium">{run.siteName || run.siteId}</p>
                          <p className="text-xs text-[var(--text-secondary)]">{run.siteCode || run.taskKey || "run"}</p>
                        </div>
                        <StatusBadge status={run.status} compact />
                      </div>
                      {run.message ? <p className="mt-2 text-sm text-[var(--text-secondary)]">{run.message}</p> : null}
                      {run.liveUrl ? <a className="mt-2 inline-flex text-sm font-medium text-blue-600" href={run.liveUrl} target="_blank" rel="noreferrer">Open live link</a> : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        </div>

        <div className="scrollbar-thin min-h-0 space-y-4 overflow-y-auto pr-1">
          <section className="rounded-[28px] border border-[var(--border-color)] bg-[var(--bg-secondary)] p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Job Monitor</h2>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">Search by target URL, brand, or site and watch live links as they complete.</p>
              </div>
              <button className="inline-flex items-center gap-2 rounded-2xl border border-[var(--border-color)] px-3 py-2 text-sm" onClick={() => loadJobs(jobsMeta.page || 1)}>
                <RefreshCw size={14} /> Refresh
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[1fr_180px_auto]">
              <label className="relative block">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
                <input className="w-full rounded-2xl border border-[var(--border-color)] bg-[var(--bg-primary)] pl-10 pr-3 py-2" value={jobsSearch} onChange={(e) => setJobsSearch(e.target.value)} placeholder="Search target URL, brand, or site" />
              </label>
              <select className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2" value={jobsStatus} onChange={(e) => setJobsStatus(e.target.value)}>
                <option value="">All statuses</option>
                <option value="QUEUED">Queued</option>
                <option value="PROCESSING">Processing</option>
                <option value="COMPLETED">Completed</option>
                <option value="PARTIAL">Partial</option>
                <option value="FAILED">Failed</option>
              </select>
              <button className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-medium text-white dark:bg-slate-100 dark:text-slate-900" onClick={() => loadJobs(1)}>
                Apply
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {jobsLoading ? (
                <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--border-color)] p-8 text-sm text-[var(--text-secondary)]">
                  <Loader2 size={16} className="animate-spin" /> Loading jobs...
                </div>
              ) : jobs.length ? jobs.map((job) => (
                <div key={job.jobId} className="rounded-[24px] border border-[var(--border-color)] bg-[var(--bg-primary)] p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={job.status} compact />
                        <span className="font-mono text-xs text-[var(--text-secondary)]">{job.jobId}</span>
                      </div>
                      <p className="mt-2 truncate font-semibold">{job.brandName || "No brand provided"}</p>
                      <p className="mt-1 truncate text-sm text-[var(--text-secondary)]">{job.targetUrl}</p>
                    </div>
                    <button className="rounded-xl border border-[var(--border-color)] px-3 py-2 text-sm" onClick={() => refreshJob(job.jobId)}>Refresh</button>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                    <MiniStat label="Runs" value={job.summary.total} />
                    <MiniStat label="Done" value={job.summary.completed} tone="green" />
                    <MiniStat label="Processing" value={job.summary.processing} tone="blue" />
                    <MiniStat label="Failed" value={job.summary.failed} tone="rose" />
                  </div>

                  <div className="mt-4 space-y-2">
                    {job.runs.slice(0, 6).map((run) => (
                      <div key={run.taskId} className="rounded-2xl border border-[var(--border-color)] px-3 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="font-medium">{run.siteName}</p>
                            <p className="text-xs text-[var(--text-secondary)]">{run.siteCode} • {run.taskKey}</p>
                          </div>
                          <StatusBadge status={run.status} compact />
                        </div>
                        {run.message ? <p className="mt-2 text-sm text-[var(--text-secondary)]">{run.message}</p> : null}
                        {run.liveUrl ? <a className="mt-2 inline-flex text-sm font-medium text-blue-600" href={run.liveUrl} target="_blank" rel="noreferrer">Open live link</a> : null}
                      </div>
                    ))}
                  </div>
                </div>
              )) : (
                <div className="rounded-2xl border border-dashed border-[var(--border-color)] p-8 text-center text-sm text-[var(--text-secondary)]">
                  No AI posting jobs yet.
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone = "default" }) {
  const toneClass = {
    default: "border-[var(--border-color)] bg-[var(--bg-secondary)]",
    blue: "border-blue-200 bg-blue-500/10 text-blue-700 dark:border-blue-900 dark:text-blue-300",
    green: "border-emerald-200 bg-emerald-500/10 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300",
    rose: "border-rose-200 bg-rose-500/10 text-rose-700 dark:border-rose-900 dark:text-rose-300",
  }[tone];

  return (
    <div className={`rounded-2xl border p-3 ${toneClass}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--text-secondary)]">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}

function MiniStat({ label, value, tone = "default" }) {
  const toneClass = {
    default: "text-[var(--text-primary)]",
    green: "text-emerald-600 dark:text-emerald-300",
    blue: "text-blue-600 dark:text-blue-300",
    amber: "text-amber-600 dark:text-amber-300",
    rose: "text-rose-600 dark:text-rose-300",
  }[tone];

  return (
    <div className="rounded-2xl border border-[var(--border-color)] px-3 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-secondary)]">{label}</p>
      <p className={`mt-2 text-xl font-bold ${toneClass}`}>{value}</p>
    </div>
  );
}

function StatusBadge({ status, compact = false }) {
  const map = {
    QUEUED: { className: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200", icon: Clock3 },
    PROCESSING: { className: "bg-blue-500/10 text-blue-700 dark:text-blue-300", icon: Loader2 },
    COMPLETED: { className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300", icon: CheckCircle2 },
    PARTIAL: { className: "bg-amber-500/10 text-amber-700 dark:text-amber-300", icon: Sparkles },
    FAILED: { className: "bg-rose-500/10 text-rose-700 dark:text-rose-300", icon: XCircle },
    PENDING: { className: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200", icon: Clock3 },
  }[status] || { className: "bg-slate-100 text-slate-700", icon: ShieldCheck };
  const Icon = map.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${map.className}`}>
      <Icon size={compact ? 12 : 13} className={status === "PROCESSING" ? "animate-spin" : ""} />
      {status}
    </span>
  );
}
