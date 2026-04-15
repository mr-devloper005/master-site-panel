import { Pencil, Trash2, Eye, KeyRound } from "lucide-react";

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

const formatTasks = (tasks) =>
  Array.isArray(tasks) && tasks.length ? tasks.map((task) => TASK_LABELS[task] || task).join(", ") : "-";

export default function SiteTable({
  sites,
  selectedIds,
  onToggle,
  onToggleAll,
  onEdit,
  onDelete,
  onViewPosts,
  onManageTasks,
  sortBy,
  setSortBy
}) {
  const allSelected = sites.length > 0 && selectedIds.length === sites.length;

  const headerBtn = (label, key) => (
    <button className="text-left" onClick={() => setSortBy(key)}>
      {label} {sortBy === key ? "↑" : ""}
    </button>
  );

  return (
    <>
      <div className="hidden h-full overflow-hidden rounded-panel border border-[var(--border-color)] md:block">
        <div className="scrollbar-thin h-full overflow-y-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/60">
            <tr>
              <th className="px-3 py-2"><input type="checkbox" checked={allSelected} onChange={(e) => onToggleAll(e.target.checked)} aria-label="Select all sites" /></th>
              <th className="px-3 py-2">{headerBtn("ID", "id")}</th>
              <th className="px-3 py-2">{headerBtn("Name", "name")}</th>
              <th className="px-3 py-2">Code</th>
              <th className="px-3 py-2">URL</th>
              <th className="px-3 py-2">Task / Framework</th>
              <th className="px-3 py-2">Health</th>
              <th className="px-3 py-2">Description</th>
              <th className="px-3 py-2">Post Count</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sites.map((site) => (
              <tr key={site.id} className="border-t border-[var(--border-color)]">
                <td className="px-3 py-2"><input type="checkbox" checked={selectedIds.includes(site.id)} onChange={() => onToggle(site.id)} /></td>
                <td className="px-3 py-2 text-xs text-[var(--text-secondary)]">{site.id}</td>
                <td className="px-3 py-2 font-medium">{site.name}</td>
                <td className="px-3 py-2 text-xs text-[var(--text-secondary)]">{site.code}</td>
                <td className="px-3 py-2"><a className="text-blue-600" href={site.url} target="_blank" rel="noreferrer">{site.url}</a></td>
                <td className="px-3 py-2 text-xs">
                  <div>{formatTasks(site.supportedTasks)}</div>
                  <div className="text-[var(--text-secondary)]">{site.framework}</div>
                </td>
                <td className="px-3 py-2 text-xs">
                  <div className={`inline-flex rounded-full px-2 py-1 ${
                    site.runtime?.status === "ONLINE"
                      ? "bg-green-100 text-green-700"
                      : site.runtime?.status === "DEGRADED"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-slate-200 text-slate-700"
                  }`}>
                    {site.runtime?.status || "NO_SIGNAL"}
                  </div>
                  <div className="mt-1 text-[var(--text-secondary)]">
                    {site.runtime?.lastHeartbeatAt ? new Date(site.runtime.lastHeartbeatAt).toLocaleString() : "No heartbeat"}
                  </div>
                </td>
                <td className="px-3 py-2 max-w-xs truncate">{site.description}</td>
                <td className="px-3 py-2">{site.postCount}</td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-1 text-xs ${site.status === "Active" ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-600"}`}>
                    {site.status}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-2">
                    <button className="rounded-md border border-[var(--border-color)] p-1.5" onClick={() => onViewPosts(site)} aria-label="View posts"><Eye size={16} /></button>
                    <button className="rounded-md border border-[var(--border-color)] p-1.5" onClick={() => onManageTasks(site)} aria-label="Manage tasks"><KeyRound size={16} /></button>
                    <button className="rounded-md border border-[var(--border-color)] p-1.5" onClick={() => onEdit(site)} aria-label="Edit site"><Pencil size={16} /></button>
                    <button className="rounded-md border border-red-300 p-1.5 text-red-500" onClick={() => onDelete(site.id)} aria-label="Delete site"><Trash2 size={16} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      <div className="scrollbar-thin h-full space-y-3 overflow-y-auto md:hidden">
        {sites.map((site) => (
          <article key={site.id} className="rounded-panel border border-[var(--border-color)] p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="font-semibold">{site.name}</h3>
                <p className="text-xs text-[var(--text-secondary)]">{site.code}</p>
              </div>
              <input type="checkbox" checked={selectedIds.includes(site.id)} onChange={() => onToggle(site.id)} />
            </div>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">{site.description}</p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">{formatTasks(site.supportedTasks)} · {site.framework}</p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">Health: {site.runtime?.status || "NO_SIGNAL"}</p>
            <div className="mt-2 flex items-center justify-between text-xs">
              <span>{site.postCount} posts</span>
              <span>{site.status}</span>
            </div>
            <div className="mt-3 flex gap-2">
              <button className="min-h-11 flex-1 rounded-lg border border-[var(--border-color)]" onClick={() => onViewPosts(site)}>View</button>
              <button className="min-h-11 flex-1 rounded-lg border border-[var(--border-color)]" onClick={() => onManageTasks(site)}>Tasks</button>
              <button className="min-h-11 flex-1 rounded-lg border border-[var(--border-color)]" onClick={() => onEdit(site)}>Edit</button>
              <button className="min-h-11 flex-1 rounded-lg border border-red-300 text-red-500" onClick={() => onDelete(site.id)}>Delete</button>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
