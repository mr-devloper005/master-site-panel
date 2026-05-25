import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Link2, RotateCcw, Search, ShieldAlert } from "lucide-react";

import { fetchDeletedPostsPage, lookupDeletedPostsByLinks, restoreDeletedPost, restoreDeletedPostsBulk } from "../utils/api";

const PAGE_SIZE = 100;
const formatDate = (value) => value ? new Date(value).toLocaleString() : "-";

export default function DeleteHistory() {
  const [history, setHistory] = useState([]);
  const [meta, setMeta] = useState({ page: 1, totalPages: 1, total: 0 });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState([]);
  const [linksText, setLinksText] = useState("");
  const [linkLookup, setLinkLookup] = useState(null);
  const [loadingLinks, setLoadingLinks] = useState(false);

  const loadHistory = async (nextPage = page) => {
    setLoading(true);
    try {
      const result = await fetchDeletedPostsPage({ page: nextPage, limit: PAGE_SIZE, search });
      setHistory(result.posts);
      setMeta(result.meta);
      setSelected([]);
    } catch (error) {
      toast.error(error.message || "Failed to load delete history");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      loadHistory(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    loadHistory(page);
  }, [page]);

  const runLinkLookup = async () => {
    setLoadingLinks(true);
    try {
      const result = await lookupDeletedPostsByLinks(linksText);
      setLinkLookup(result);
      const ids = result.found.map((row) => row.id).slice(0, 200);
      setSelected(ids);
      toast.success(`Found ${result.foundCount || 0} restorable deleted posts`);
    } catch (error) {
      toast.error(error.message || "Failed to lookup deleted links");
    } finally {
      setLoadingLinks(false);
    }
  };

  const restoreSelected = async () => {
    if (!selected.length) return;
    if (selected.length > 200) {
      toast.error("Maximum 200 posts can be restored at once");
      return;
    }
    const confirmed = window.confirm(`Restore ${selected.length} selected posts?`);
    if (!confirmed) return;
    const result = await restoreDeletedPostsBulk(selected);
    toast.success(`Restored ${result.restoredCount || 0} posts${result.failedCount ? `, ${result.failedCount} failed` : ""}`);
    await loadHistory(page);
    if (linkLookup) await runLinkLookup();
  };

  const rows = linkLookup ? linkLookup.found : history;
  const allSelected = rows.length > 0 && selected.length === Math.min(rows.length, 200);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">Delete History & Restore</h1>
          <p className="text-xs text-[var(--text-secondary)]">Restore deleted posts within 7 days. Use search, selection, or paste links to find deleted records.</p>
        </div>
        <button className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={!selected.length} onClick={restoreSelected}>
          <RotateCcw className="mr-1 inline" size={15} /> Bulk Restore
        </button>
      </div>

      <section className="grid grid-cols-1 gap-3 xl:grid-cols-[0.9fr_1.1fr]">
        <article className="glass rounded-panel p-4">
          <div className="mb-3 flex items-center gap-2 font-semibold"><Search size={18} /> Search History</div>
          <input className="w-full rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm" placeholder="Search title, slug, site" value={search} onChange={(e) => { setLinkLookup(null); setSearch(e.target.value); }} />
          <p className="mt-2 text-xs text-[var(--text-secondary)]">Normal history shows 100 records per page.</p>
        </article>

        <article className="glass rounded-panel p-4">
          <div className="mb-3 flex items-center gap-2 font-semibold"><Link2 size={18} /> Restore By Links</div>
          <textarea className="min-h-28 w-full rounded-xl border border-[var(--border-color)] bg-white/80 p-3 text-sm text-slate-900" placeholder="Paste deleted links here..." value={linksText} onChange={(e) => setLinksText(e.target.value)} />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white" onClick={runLinkLookup} disabled={loadingLinks}>{loadingLinks ? "Searching..." : "Find Deleted Links"}</button>
            {linkLookup && <button className="rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm" onClick={() => setLinkLookup(null)}>Back to history</button>}
            {linkLookup && <p className="text-sm text-[var(--text-secondary)]">Searched {linkLookup.searchedCount} · Found {linkLookup.foundCount} · Missing {linkLookup.missingCount}</p>}
          </div>
        </article>
      </section>

      <article className="glass flex min-h-0 flex-1 flex-col rounded-panel p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-semibold"><ShieldAlert size={18} /> {linkLookup ? "Deleted Link Matches" : "Restorable Delete History"}</div>
          <div className="flex gap-2 text-sm">
            <button className="rounded-lg border border-[var(--border-color)] px-3 py-2" onClick={() => setSelected(allSelected ? [] : rows.map((row) => row.id).slice(0, 200))}>{allSelected ? "Unselect All" : "Select First 200"}</button>
          </div>
        </div>

        <div className="scrollbar-thin min-h-0 flex-1 overflow-auto rounded-xl border border-[var(--border-color)]">
          <table className="min-w-full text-left text-sm">
            <thead className="sticky top-0 bg-white text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Select</th>
                <th className="px-3 py-2">Title</th>
                <th className="px-3 py-2">Site</th>
                <th className="px-3 py-2">Deleted</th>
                <th className="px-3 py-2">Restore Until</th>
                <th className="px-3 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((post) => (
                <tr key={post.id} className="border-t border-[var(--border-color)]">
                  <td className="px-3 py-2"><input type="checkbox" checked={selected.includes(post.id)} onChange={(e) => setSelected((prev) => e.target.checked ? [...new Set([...prev, post.id])].slice(0, 200) : prev.filter((id) => id !== post.id))} /></td>
                  <td className="max-w-md px-3 py-2"><p className="font-medium">{post.title}</p><p className="truncate text-xs text-[var(--text-secondary)]">{post.slug}</p></td>
                  <td className="px-3 py-2">{post.siteName}<br /><span className="text-xs text-[var(--text-secondary)]">{post.siteCode}</span></td>
                  <td className="px-3 py-2">{formatDate(post.deletedAt)}<br /><span className="text-xs text-[var(--text-secondary)]">{post.deletedByName || post.deletedByApiKeyId || "Unknown"}</span></td>
                  <td className="px-3 py-2 text-emerald-700">{formatDate(post.restoreUntil)}</td>
                  <td className="px-3 py-2"><button className="rounded-lg border border-emerald-300 px-3 py-1 text-xs text-emerald-700" onClick={async () => { await restoreDeletedPost(post.id); toast.success("Post restored"); await loadHistory(page); }}>Restore</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <p className="p-4 text-sm text-[var(--text-secondary)]">No restorable deleted posts found.</p>}
        </div>

        {!linkLookup && (
          <div className="mt-3 flex items-center justify-between text-sm text-[var(--text-secondary)]">
            <span>{meta.total || 0} restorable records</span>
            <div className="flex gap-2">
              <button className="rounded-lg border border-[var(--border-color)] px-3 py-1 disabled:opacity-50" disabled={page <= 1 || loading} onClick={() => setPage((prev) => Math.max(prev - 1, 1))}>Prev</button>
              <span className="px-2 py-1">{meta.page || page}/{meta.totalPages || 1}</span>
              <button className="rounded-lg border border-[var(--border-color)] px-3 py-1 disabled:opacity-50" disabled={page >= (meta.totalPages || 1) || loading} onClick={() => setPage((prev) => prev + 1)}>Next</button>
            </div>
          </div>
        )}
      </article>
    </div>
  );
}
