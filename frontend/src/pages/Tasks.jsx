import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

import SiteProvisioningModal from "../components/sites/SiteProvisioningModal";
import SiteTaskModal from "../components/sites/SiteTaskModal";
import SearchableSelect from "../components/ui/SearchableSelect";
import { useAppData } from "../context/AppContext";
import { exportTaskTokens, fetchApiKeys, issueSiteTaskToken } from "../utils/api";

const badgeClass =
  "inline-flex items-center rounded-full border border-[var(--border-color)] bg-slate-50 px-2.5 py-1 text-xs dark:bg-slate-900/40";
const TOKEN_CACHE_KEY = "site-master-task-tokens";
const TASK_LABELS = {
  listing: "Business Listing",
  article: "Article",
  image: "Image",
  mediaDistribution: "Media Distribution",
  profile: "Profile",
  classified: "Classified",
  social: "Social",
  sbm: "SBM",
  comment: "Comment",
  pdf: "PDF",
  org: "Organization",
};

const loadTokenCache = () => {
  try {
    const raw = localStorage.getItem(TOKEN_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const saveTokenCache = (cache) => {
  localStorage.setItem(TOKEN_CACHE_KEY, JSON.stringify(cache));
};

export default function Tasks() {
  const { sites, addTaskToSite, removeTaskFromSite } = useAppData();
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [taskSite, setTaskSite] = useState(null);
  const [packageData, setPackageData] = useState(null);
  const [keys, setKeys] = useState([]);
  const [tokenCache, setTokenCache] = useState(() => loadTokenCache());
  const [siteSearch, setSiteSearch] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportPayload, setExportPayload] = useState(null);
  const [exportTaskFilter, setExportTaskFilter] = useState("");
  const [exportAddedAfter, setExportAddedAfter] = useState("");
  const [exportReissueAll, setExportReissueAll] = useState(false);

  useEffect(() => {
    const loadKeys = async () => {
      try {
        const result = await fetchApiKeys();
        setKeys(result);
      } catch (_error) {
        setKeys([]);
      }
    };

    loadKeys();
  }, []);

  const selectedSite = useMemo(
    () => sites.find((site) => site.id === selectedSiteId) || null,
    [sites, selectedSiteId]
  );

  const siteKeys = useMemo(() => {
    if (!selectedSite) return [];
    return keys.filter((key) =>
      key.sitePermissions?.some((permission) => permission.siteId === selectedSite.id)
    );
  }, [keys, selectedSite]);

  const enabledTasks = selectedSite?.supportedTasks || [];
  const selectedSiteCode = selectedSite?.code || "";
  const taskCatalog = selectedSite?.blueprint?.taskCatalog?.availableTasks || [];

  const taskRows = useMemo(() => {
    if (!selectedSite) return [];
    return enabledTasks.map((task) => {
      const taskKey = siteKeys.find((key) => key.task === task) || null;
      const tokenKey = `${selectedSite.id}:${task}`;
      const cachedToken = tokenCache[tokenKey] || "";
      const catalog = taskCatalog.find((item) => item.task === task) || null;

      return {
        task,
        endpoint: `/${selectedSiteCode}/post/v1/${task}`,
        keyName: taskKey?.name || "Not generated",
        token: cachedToken || "Token hidden (generate again)",
        hasToken: Boolean(cachedToken),
        isGenerated: Boolean(taskKey),
        catalog,
      };
    });
  }, [enabledTasks, siteKeys, selectedSite, selectedSiteCode, tokenCache, taskCatalog]);

  const siteOptions = useMemo(
    () =>
      sites.map((site) => ({
        value: site.id,
        label: site.name,
        meta: `${site.code} ${site.url || ""}`,
      })),
    [sites]
  );

  const exportJson = useMemo(
    () => (exportPayload?.rows?.length ? JSON.stringify(exportPayload.rows, null, 2) : ""),
    [exportPayload]
  );

  const exportTaskOptions = useMemo(
    () => [
      { value: "", label: "All Tasks" },
      ...Object.entries(TASK_LABELS).map(([value, label]) => ({ value, label })),
    ],
    []
  );

  const handleExport = async () => {
    setExporting(true);
    try {
      const result = await exportTaskTokens({
        rotateMissing: true,
        task: exportTaskFilter,
        addedAfter: exportAddedAfter,
        reissueAll: exportReissueAll,
      });
      setExportPayload(result);
      await navigator.clipboard.writeText(JSON.stringify(result.rows || [], null, 2));
      toast.success(
        `Export ready. ${result.totalRows || 0} rows copied.${result.rotatedRows?.length ? ` ${result.rotatedRows.length} token(s) refreshed.` : ""}${result.reissueAll ? " Reissue mode was applied." : ""}`
      );
    } catch (error) {
      toast.error(error.message || "Failed to export task tokens");
    } finally {
      setExporting(false);
    }
  };

  const handleDownload = () => {
    if (!exportJson) return;
    const blob = new Blob([exportJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `task-token-export-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Tasks & APIs</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Select a site to manage tasks, tokens, and posting APIs.
          </p>
        </div>
      </div>

      <div className="rounded-panel border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4">
        <div className="flex flex-wrap items-center gap-3">
          <SearchableSelect
            label="Select Site"
            value={selectedSiteId}
            onChange={setSelectedSiteId}
            searchValue={siteSearch}
            onSearchChange={setSiteSearch}
            options={siteOptions}
            placeholder="Choose a site"
            searchPlaceholder="Search site by name, code, or URL"
            className="w-full md:w-[360px]"
          />
          <button
            type="button"
            className="min-h-11 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50"
            disabled={!selectedSite}
            onClick={() => selectedSite && setTaskSite(selectedSite)}
          >
            Add Task API
          </button>
          <button
            type="button"
            className="min-h-11 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
            disabled={exporting}
            onClick={handleExport}
          >
            {exporting ? "Exporting…" : "Export Task Tokens JSON"}
          </button>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[220px_220px_minmax(220px,260px)_1fr]">
          <label className="text-xs text-[var(--text-secondary)]">
            <span className="mb-1 block font-medium uppercase tracking-wide">Filter By Task</span>
            <select
              className="min-h-10 w-full rounded-lg border border-[var(--border-color)] bg-transparent px-3 text-sm text-[var(--text-primary)]"
              value={exportTaskFilter}
              onChange={(event) => setExportTaskFilter(event.target.value)}
            >
              {exportTaskOptions.map((option) => (
                <option key={option.value || "all"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-[var(--text-secondary)]">
            <span className="mb-1 block font-medium uppercase tracking-wide">Added After</span>
            <input
              type="date"
              className="min-h-10 w-full rounded-lg border border-[var(--border-color)] bg-transparent px-3 text-sm text-[var(--text-primary)]"
              value={exportAddedAfter}
              onChange={(event) => setExportAddedAfter(event.target.value)}
            />
          </label>
          <label className="flex min-h-10 items-end gap-2 rounded-lg border border-[var(--border-color)] px-3 py-2 text-xs text-[var(--text-secondary)]">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-[var(--border-color)]"
              checked={exportReissueAll}
              onChange={(event) => setExportReissueAll(event.target.checked)}
            />
            <span>
              <span className="block font-medium uppercase tracking-wide text-[var(--text-primary)]">Reissue Matching Tokens</span>
              <span>Deactivate older matching keys and mint fresh live tokens for this export.</span>
            </span>
          </label>
          <div className="flex items-end">
            <p className="text-xs text-[var(--text-secondary)]">
              Export by one task type, by recently added sites, or leave both blank for full export. Missing live
              tokens in the filtered set are refreshed automatically, and reissue mode can replace all matching tokens
              when a task family needs a clean reset.
            </p>
          </div>
        </div>
        <p className="mt-3 text-xs text-[var(--text-secondary)]">
          Export gives you one JSON sheet for all current site tasks. If an older task token cannot be recovered,
          we automatically mint a fresh live token for that row so the export stays usable.
        </p>
      </div>

      {exportPayload ? (
        <section className="rounded-panel border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">JSON Export Sheet</h2>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                {exportPayload.totalRows || 0} rows • {exportPayload.totalSites || 0} sites
                {exportPayload.rotatedRows?.length
                  ? ` • ${exportPayload.rotatedRows.length} refreshed token(s)`
                  : ""}
                {exportPayload.reissueAll ? " • reissue mode" : ""}
                {exportPayload.filters?.task ? ` • task: ${TASK_LABELS[exportPayload.filters.task] || exportPayload.filters.task}` : ""}
                {exportPayload.filters?.addedAfter ? ` • added after: ${new Date(exportPayload.filters.addedAfter).toLocaleDateString()}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg border border-[var(--border-color)] px-3 py-1.5 text-xs"
                onClick={async () => {
                  await navigator.clipboard.writeText(exportJson);
                  toast.success("Export JSON copied");
                }}
              >
                Copy JSON
              </button>
              <button
                type="button"
                className="rounded-lg border border-[var(--border-color)] px-3 py-1.5 text-xs"
                onClick={handleDownload}
              >
                Download
              </button>
            </div>
          </div>
          <pre className="mt-3 max-h-72 overflow-auto rounded-2xl border border-[var(--border-color)] bg-slate-950 p-3 text-xs text-slate-100">
            {exportJson}
          </pre>
        </section>
      ) : null}

      {!selectedSite ? (
        <div className="rounded-panel border border-dashed border-[var(--border-color)] bg-[var(--bg-secondary)] p-6 text-sm text-[var(--text-secondary)]">
          Select a site to see enabled tasks and generate task-specific APIs.
        </div>
      ) : (
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto pr-1">
          <section className="rounded-panel border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{selectedSite.name}</h2>
                <p className="text-xs text-[var(--text-secondary)]">{selectedSite.code}</p>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-[var(--border-color)] p-3">
              <h3 className="font-medium">Enabled tasks + API + token</h3>
              {taskRows.length ? (
                <div className="mt-3 overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="text-left text-xs text-[var(--text-secondary)]">
                      <tr>
                        <th className="py-2 pr-4">Task</th>
                        <th className="py-2 pr-4">API</th>
                        <th className="py-2 pr-4">Key Name</th>
                        <th className="py-2">Token</th>
                        <th className="py-2 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {taskRows.map((row) => (
                        <tr key={row.task} className="border-t border-[var(--border-color)]">
                          <td className="py-2 pr-4">
                            <span className={badgeClass}>{TASK_LABELS[row.task] || row.task}</span>
                          </td>
                          <td className="py-2 pr-4 font-mono text-xs">{row.endpoint}</td>
                          <td className="py-2 pr-4 text-xs">{row.keyName}</td>
                          <td className="py-2 font-mono text-xs">{row.token}</td>
                          <td className="py-2 text-right">
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                className="rounded-lg border border-[var(--border-color)] px-3 py-1.5 text-xs"
                                onClick={() => {
                                  const payload = row.catalog?.payload || null;
                                  const curlExample = row.catalog?.curlExample || null;
                                  setPackageData({
                                    type: "task",
                                    task: {
                                      ...(row.catalog || {}),
                                      token: row.token.includes("Token hidden")
                                        ? ""
                                        : row.token,
                                      payload,
                                      curlExample,
                                      endpoint: row.catalog?.endpoint || row.endpoint,
                                    },
                                  });
                                }}
                              >
                                View
                              </button>
                              {!row.hasToken && (
                                <button
                                  type="button"
                                  className="rounded-lg border border-blue-200 px-3 py-1.5 text-xs text-blue-600"
                                  onClick={async () => {
                                    if (!selectedSite) return;
                                    try {
                                      const issued = await issueSiteTaskToken(selectedSite.id, row.task);
                                      const tokenKey = `${selectedSite.id}:${row.task}`;
                                      const nextCache = {
                                        ...tokenCache,
                                        [tokenKey]: issued.task?.token || "",
                                      };
                                      setTokenCache(nextCache);
                                      saveTokenCache(nextCache);
                                      const result = await fetchApiKeys();
                                      setKeys(result);
                                      setPackageData({ type: "task", ...issued });
                                      toast.success("New task token generated");
                                    } catch (error) {
                                      toast.error(error.message || "Failed to generate token");
                                    }
                                  }}
                                >
                                  Generate token
                                </button>
                              )}
                              <button
                                type="button"
                                className="rounded-lg border border-red-300 px-3 py-1.5 text-xs text-red-600"
                                onClick={async () => {
                                  if (!selectedSite) return;
                                  if (!confirm(`Remove ${row.task} task from ${selectedSite.name}?`)) return;
                                  const result = await removeTaskFromSite(selectedSite.id, row.task);
                                  const nextCache = { ...tokenCache };
                                  delete nextCache[`${selectedSite.id}:${row.task}`];
                                  setTokenCache(nextCache);
                                  saveTokenCache(nextCache);
                                  setPackageData({
                                    type: "task",
                                    task: {
                                      task: row.task,
                                      label: row.task,
                                      endpoint: row.endpoint,
                                      payload: row.catalog?.payload,
                                      usage: [
                                        `Task removed. ${result.revokedKeys} key(s) revoked.`,
                                        "Posting with old tokens will no longer work.",
                                      ],
                                    },
                                  });
                                }}
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="mt-3 text-sm text-[var(--text-secondary)]">No tasks enabled yet.</p>
              )}
            </div>
          </section>
        </div>
      )}

      <SiteTaskModal
        open={Boolean(taskSite)}
        site={taskSite}
        onClose={() => setTaskSite(null)}
        onSubmit={async (task) => {
          if (!taskSite) return;
          try {
            const provisioned = await addTaskToSite(taskSite.id, task);
            setPackageData({ type: "task", ...provisioned });
            const tokenKey = `${taskSite.id}:${task}`;
            const nextCache = {
              ...tokenCache,
              [tokenKey]: provisioned.task?.token || "",
            };
            setTokenCache(nextCache);
            saveTokenCache(nextCache);
            const result = await fetchApiKeys();
            setKeys(result);
            setTaskSite(null);
          } catch (error) {
            toast.error(error.message || "Failed to add task");
          }
        }}
      />

      <SiteProvisioningModal
        open={Boolean(packageData)}
        packageData={packageData}
        onClose={() => setPackageData(null)}
      />
    </div>
  );
}
