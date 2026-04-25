import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

import SiteProvisioningModal from "../components/sites/SiteProvisioningModal";
import SiteTaskModal from "../components/sites/SiteTaskModal";
import SearchableSelect from "../components/ui/SearchableSelect";
import { useAppData } from "../context/AppContext";
import { fetchApiKeys, issueSiteTaskToken } from "../utils/api";

const badgeClass =
  "inline-flex items-center rounded-full border border-[var(--border-color)] bg-slate-50 px-2.5 py-1 text-xs dark:bg-slate-900/40";
const TOKEN_CACHE_KEY = "site-master-task-tokens";
const TASK_LABELS = {
  listing: "Listing",
  article: "Article",
  image: "Images",
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
        </div>
      </div>

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
