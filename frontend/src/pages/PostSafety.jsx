import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { RotateCcw, Search, ShieldAlert, Trash2 } from "lucide-react";

import { bulkPostAction, fetchDeletedPostsPage, lookupPostsByLinks, restoreDeletedPost } from "../utils/api";

const PAGE_SIZE = 100;

const formatDate = (value) => {
  if (!value) return "-";
  return new Date(value).toLocaleString();
};

export default function PostSafety() {
  const [linksText, setLinksText] = useState("");
  const [lookup, setLookup] = useState(null);
  const [selected, setSelected] = useState([]);
  const [loadingLookup, setLoadingLookup] = useState(false);
  const [editData, setEditData] = useState({ status: "", summary: "", authorName: "", appendTags: "" });
  const [history, setHistory] = useState([]);
  const [historyMeta, setHistoryMeta] = useState({ page: 1, totalPages: 1, total: 0 });
  const [historySearch, setHistorySearch] = useState("");
  const [historyPage, setHistoryPage] = useState(1);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const foundRows = lookup?.found || [];
  const selectedRows = useMemo(() => foundRows.filter((row) => selected.includes(row.id)), [foundRows, selected]);
  const allSelected = foundRows.length > 0 && selected.length === foundRows.length;

  const runLookup = async () => {
    setLoadingLookup(true);
    try {
      const result = await lookupPostsByLinks(linksText);
      setLookup(result);
      setSelected(result.found.map((row) => row.id).slice(0, 200));
      toast.success(`Found ${result.foundCount || 0} of ${result.searchedCount || 0} links`);
    } catch (error) {
      toast.error(error.message || "Failed to lookup links");
    } finally {
      setLoadingLookup(false);
    }
  };

  const loadHistory = async (page = historyPage) => {
    setLoadingHistory(true);
    try {
      const result = await fetchDeletedPostsPage({ page, limit: PAGE_SIZE, search: historySearch });
      setHistory(result.posts);
      setHistoryMeta(result.meta);
    } catch (error) {
      toast.error(error.message || "Failed to load delete history");
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setHistoryPage(1);
      loadHistory(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [historySearch]);

  useEffect(() => {
    loadHistory(historyPage);
  }, [historyPage]);

  const deleteSelected = async () => {
    if (!selected.length) return;
    if (selected.length > 200) {
      toast.error("Maximum 200 posts can be deleted at once from this page");
      return;
    }
    const confirmed = window.confirm(`Delete ${selected.length} selected posts? Restore will be available for 7 days.`);
    if (!confirmed) return;
    await bulkPostAction({ postIds: selected, action: "delete" });
    toast.success(`${selected.length} posts moved to delete history`);
    await runLookup();
    await loadHistory(1);
  };

  const applyBulkEdit = async () => {
    if (!selected.length) return;
    const data = {};
    if (editData.status) data.status = editData.status;
    if (editData.summary.trim()) data.summary = editData.summary.trim();
    if (editData.authorName.trim()) data.authorName = editData.authorName.trim();
    if (editData.appendTags.trim()) {
      data.appendTags = editData.appendTags.split(",").map((tag) => tag.trim()).filter(Boolean);
    }
    if (!Object.keys(data).length) {
      toast.error("Add at least one edit field");
      return;
    }
    await bulkPostAction({ postIds: selected, action: "edit", data });
    toast.success(`${selected.length} selected posts updated`);
    await runLookup();
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">Link Finder & Restore Center</h1>
          <p className="text-xs text-[var(--text-secondary)]">
            Paste bulk URLs, find exact DB posts, bulk edit/delete up to 200, and restore deleted posts for 7 days.
          </p>
        </div>
      </div>

      <section className="grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="flex min-h-0 flex-col gap-3 overflow-hidden">
          <article className="glass rounded-panel p-4">
            <div className="mb-3 flex items-center gap-2 font-semibold"><Search size={18} /> Find Posts By Links</div>
            <textarea
              className="min-h-40 w-full rounded-xl border border-[var(--border-color)] bg-white/80 p-3 text-sm text-slate-900"
              placeholder="Paste links here, one per line..."
              value={linksText}
              onChange={(e) => setLinksText(e.target.value)}
            />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white" onClick={runLookup} disabled={loadingLookup}>
                {loadingLookup ? "Searching..." : "Search Links"}
              </button>
              {lookup && (
                <p className="text-sm text-[var(--text-secondary)]">
                  Searched {lookup.searchedCount} · Found {lookup.foundCount} · Missing {lookup.missingCount}
                </p>
              )}
            </div>
          </article>

          {lookup && (
            <article className="glass flex min-h-0 flex-1 flex-col rounded-panel p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-semibold">Matched Posts</h2>
                  <p className="text-xs text-[var(--text-secondary)]">Selected {selected.length} / {foundRows.length}. Bulk delete limit: 200.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className="rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm" onClick={() => setSelected(allSelected ? [] : foundRows.map((row) => row.id).slice(0, 200))}>
                    {allSelected ? "Unselect All" : "Select First 200"}
                  </button>
                  <button className="rounded-lg border border-red-300 px-3 py-2 text-sm text-red-600" onClick={deleteSelected} disabled={!selected.length}>
                    <Trash2 className="mr-1 inline" size={15} /> Bulk Delete
                  </button>
                </div>
              </div>

              <div className="mb-3 grid grid-cols-1 gap-2 rounded-xl border border-[var(--border-color)] p-3 md:grid-cols-4">
                <select className="rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm" value={editData.status} onChange={(e) => setEditData((prev) => ({ ...prev, status: e.target.value }))}>
                  <option value="">No status change</option>
                  <option value="PUBLISHED">Published</option>
                  <option value="DRAFT">Draft</option>
                  <option value="ARCHIVED">Archived</option>
                </select>
                <input className="rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm" placeholder="New summary" value={editData.summary} onChange={(e) => setEditData((prev) => ({ ...prev, summary: e.target.value }))} />
                <input className="rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm" placeholder="Author name" value={editData.authorName} onChange={(e) => setEditData((prev) => ({ ...prev, authorName: e.target.value }))} />
                <div className="flex gap-2">
                  <input className="min-w-0 flex-1 rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm" placeholder="append,tags" value={editData.appendTags} onChange={(e) => setEditData((prev) => ({ ...prev, appendTags: e.target.value }))} />
                  <button className="rounded-lg bg-emerald-600 px-3 py-2 text-sm text-white" onClick={applyBulkEdit} disabled={!selected.length}>Edit</button>
                </div>
              </div>

              <div className="scrollbar-thin min-h-0 overflow-auto rounded-xl border border-[var(--border-color)]">
                <table className="min-w-full text-left text-sm">
                  <thead className="sticky top-0 bg-white text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Select</th>
                      <th className="px-3 py-2">Title</th>
                      <th className="px-3 py-2">Site</th>
                      <th className="px-3 py-2">Task</th>
                      <th className="px-3 py-2">Slug</th>
                    </tr>
                  </thead>
                  <tbody>
                    {foundRows.map((row) => (
                      <tr key={`${row.inputUrl}-${row.id}`} className="border-t border-[var(--border-color)]">
                        <td className="px-3 py-2"><input type="checkbox" checked={selected.includes(row.id)} onChange={(e) => setSelected((prev) => e.target.checked ? [...new Set([...prev, row.id])].slice(0, 200) : prev.filter((id) => id !== row.id))} /></td>
                        <td className="max-w-sm px-3 py-2"><p className="font-medium">{row.title}</p><p className="truncate text-xs text-[var(--text-secondary)]">{row.inputUrl}</p></td>
                        <td className="px-3 py-2">{row.siteName}<br /><span className="text-xs text-[var(--text-secondary)]">{row.siteCode}</span></td>
                        <td className="px-3 py-2">{row.taskType}</td>
                        <td className="px-3 py-2">{row.slug}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!foundRows.length && <p className="p-4 text-sm text-[var(--text-secondary)]">No matched posts yet.</p>}
              </div>
            </article>
          )}
        </div>

        <article className="glass flex min-h-0 flex-col rounded-panel p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 font-semibold"><ShieldAlert size={18} /> Delete History</div>
              <p className="text-xs text-[var(--text-secondary)]">100 records per page. Restore available within 7 days.</p>
            </div>
            <input className="rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm" placeholder="Search history" value={historySearch} onChange={(e) => setHistorySearch(e.target.value)} />
          </div>

          <div className="scrollbar-thin min-h-0 flex-1 overflow-auto rounded-xl border border-[var(--border-color)]">
            {loadingHistory ? <p className="p-4 text-sm">Loading history...</p> : history.map((post) => (
              <div key={post.id} className="border-b border-[var(--border-color)] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{post.title}</p>
                    <p className="text-xs text-[var(--text-secondary)]">{post.siteName} · {post.slug}</p>
                    <p className="mt-1 text-xs text-[var(--text-secondary)]">Deleted by {post.deletedByName || post.deletedByApiKeyId || "Unknown"} · {formatDate(post.deletedAt)}</p>
                    <p className="text-xs text-emerald-600">Restore until {formatDate(post.restoreUntil)}</p>
                  </div>
                  <button
                    className="shrink-0 rounded-lg border border-emerald-300 px-3 py-2 text-xs text-emerald-700"
                    onClick={async () => {
                      await restoreDeletedPost(post.id);
                      toast.success("Post restored");
                      await loadHistory(historyPage);
                    }}
                  >
                    <RotateCcw className="mr-1 inline" size={14} /> Restore
                  </button>
                </div>
              </div>
            ))}
            {!loadingHistory && history.length === 0 && <p className="p-4 text-sm text-[var(--text-secondary)]">No restorable deleted posts found.</p>}
          </div>

          <div className="mt-3 flex items-center justify-between text-sm text-[var(--text-secondary)]">
            <span>{historyMeta.total || 0} restorable records</span>
            <div className="flex gap-2">
              <button className="rounded-lg border border-[var(--border-color)] px-3 py-1 disabled:opacity-50" disabled={historyPage <= 1} onClick={() => setHistoryPage((prev) => Math.max(prev - 1, 1))}>Prev</button>
              <span className="px-2 py-1">{historyMeta.page || historyPage}/{historyMeta.totalPages || 1}</span>
              <button className="rounded-lg border border-[var(--border-color)] px-3 py-1 disabled:opacity-50" disabled={historyPage >= (historyMeta.totalPages || 1)} onClick={() => setHistoryPage((prev) => prev + 1)}>Next</button>
            </div>
          </div>
        </article>
      </section>
    </div>
  );
}
