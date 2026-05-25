import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { FileJson, Search, Trash2, Wand2 } from "lucide-react";

import { bulkPostAction, lookupPostsByLinks } from "../utils/api";

const safeJson = (value, fallback) => {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const pretty = (value) => JSON.stringify(value ?? {}, null, 2);

export default function PostSafety() {
  const [linksText, setLinksText] = useState("");
  const [lookup, setLookup] = useState(null);
  const [selected, setSelected] = useState([]);
  const [activeId, setActiveId] = useState("");
  const [loadingLookup, setLoadingLookup] = useState(false);
  const [simpleEdit, setSimpleEdit] = useState({ status: "", summary: "", authorName: "", appendTags: "" });
  const [jsonPatch, setJsonPatch] = useState(`{
  "summary": "",
  "metaTitle": "",
  "metaDescription": "",
  "contentMerge": {},
  "mediaMerge": {},
  "appendTags": []
}`);

  const foundRows = lookup?.found || [];
  const activePost = foundRows.find((row) => row.id === activeId) || foundRows[0] || null;
  const allSelected = foundRows.length > 0 && selected.length === Math.min(foundRows.length, 200);

  const selectedPayloadPreview = useMemo(() => {
    if (!activePost) return "{}";
    return pretty(activePost.payload || activePost);
  }, [activePost]);

  const runLookup = async () => {
    setLoadingLookup(true);
    try {
      const result = await lookupPostsByLinks(linksText);
      setLookup(result);
      const ids = result.found.map((row) => row.id).slice(0, 200);
      setSelected(ids);
      setActiveId(ids[0] || "");
      toast.success(`Found ${result.foundCount || 0} of ${result.searchedCount || 0} links`);
    } catch (error) {
      toast.error(error.message || "Failed to lookup links");
    } finally {
      setLoadingLookup(false);
    }
  };

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
  };

  const applySimpleEdit = async () => {
    if (!selected.length) return;
    const data = {};
    if (simpleEdit.status) data.status = simpleEdit.status;
    if (simpleEdit.summary.trim()) data.summary = simpleEdit.summary.trim();
    if (simpleEdit.authorName.trim()) data.authorName = simpleEdit.authorName.trim();
    if (simpleEdit.appendTags.trim()) {
      data.appendTags = simpleEdit.appendTags.split(",").map((tag) => tag.trim()).filter(Boolean);
    }
    if (!Object.keys(data).length) {
      toast.error("Add at least one edit field");
      return;
    }
    await bulkPostAction({ postIds: selected, action: "edit", data });
    toast.success(`${selected.length} selected posts updated`);
    await runLookup();
  };

  const applyJsonPatch = async () => {
    if (!selected.length) return;
    const data = safeJson(jsonPatch, null);
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      toast.error("Invalid JSON patch");
      return;
    }
    if ((data.title !== undefined || data.slug !== undefined || data.content !== undefined || data.media !== undefined || data.tags !== undefined) && selected.length > 1) {
      toast.error("title, slug, full content/media/tags replace is allowed only when one post is selected. Use contentMerge/mediaMerge for bulk.");
      return;
    }
    await bulkPostAction({ postIds: selected, action: "edit", data });
    toast.success(`JSON patch applied to ${selected.length} selected post(s)`);
    await runLookup();
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">Link Finder & Bulk Editor</h1>
          <p className="text-xs text-[var(--text-secondary)]">
            Paste URLs, find exact DB posts, inspect full payload, bulk edit, or safely delete up to 200 posts.
          </p>
        </div>
      </div>

      <section className="grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-[0.95fr_1.05fr]">
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
              {lookup && <p className="text-sm text-[var(--text-secondary)]">Searched {lookup.searchedCount} · Found {lookup.foundCount} · Missing {lookup.missingCount}</p>}
            </div>
          </article>

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
                  <Trash2 className="mr-1 inline" size={15} /> Safe Delete
                </button>
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
                  </tr>
                </thead>
                <tbody>
                  {foundRows.map((row) => (
                    <tr key={`${row.inputUrl}-${row.id}`} className={`border-t border-[var(--border-color)] ${activePost?.id === row.id ? "bg-blue-50" : ""}`}>
                      <td className="px-3 py-2"><input type="checkbox" checked={selected.includes(row.id)} onChange={(e) => setSelected((prev) => e.target.checked ? [...new Set([...prev, row.id])].slice(0, 200) : prev.filter((id) => id !== row.id))} /></td>
                      <td className="max-w-sm px-3 py-2">
                        <button className="text-left font-medium hover:underline" onClick={() => setActiveId(row.id)}>{row.title}</button>
                        <p className="truncate text-xs text-[var(--text-secondary)]">{row.slug}</p>
                      </td>
                      <td className="px-3 py-2">{row.siteName}<br /><span className="text-xs text-[var(--text-secondary)]">{row.siteCode}</span></td>
                      <td className="px-3 py-2">{row.taskType}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!foundRows.length && <p className="p-4 text-sm text-[var(--text-secondary)]">No matched posts yet.</p>}
            </div>
          </article>
        </div>

        <div className="flex min-h-0 flex-col gap-3 overflow-hidden">
          <article className="glass rounded-panel p-4">
            <div className="mb-3 flex items-center gap-2 font-semibold"><Wand2 size={18} /> Easy Bulk Edit</div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
              <select className="rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm" value={simpleEdit.status} onChange={(e) => setSimpleEdit((prev) => ({ ...prev, status: e.target.value }))}>
                <option value="">No status change</option>
                <option value="PUBLISHED">Published</option>
                <option value="DRAFT">Draft</option>
                <option value="ARCHIVED">Archived</option>
              </select>
              <input className="rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm" placeholder="New summary" value={simpleEdit.summary} onChange={(e) => setSimpleEdit((prev) => ({ ...prev, summary: e.target.value }))} />
              <input className="rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm" placeholder="Author name" value={simpleEdit.authorName} onChange={(e) => setSimpleEdit((prev) => ({ ...prev, authorName: e.target.value }))} />
              <div className="flex gap-2">
                <input className="min-w-0 flex-1 rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm" placeholder="append,tags" value={simpleEdit.appendTags} onChange={(e) => setSimpleEdit((prev) => ({ ...prev, appendTags: e.target.value }))} />
                <button className="rounded-lg bg-emerald-600 px-3 py-2 text-sm text-white" onClick={applySimpleEdit} disabled={!selected.length}>Apply</button>
              </div>
            </div>
          </article>

          <article className="glass grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden rounded-panel p-4 xl:grid-cols-2">
            <div className="flex min-h-0 flex-col">
              <div className="mb-2 flex items-center gap-2 font-semibold"><FileJson size={18} /> Active Post Full Payload</div>
              <p className="mb-2 text-xs text-[var(--text-secondary)]">Click any matched post to inspect title, content, media, tags and SEO fields.</p>
              <pre className="scrollbar-thin min-h-0 flex-1 overflow-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-100">{selectedPayloadPreview}</pre>
            </div>
            <div className="flex min-h-0 flex-col">
              <div className="mb-2 font-semibold">JSON Patch Editor</div>
              <p className="mb-2 text-xs text-[var(--text-secondary)]">For bulk use `contentMerge`, `mediaMerge`, `appendTags`. Full title/slug/content replace only works when one post is selected.</p>
              <textarea className="scrollbar-thin min-h-0 flex-1 rounded-xl border border-[var(--border-color)] bg-white/90 p-3 font-mono text-xs text-slate-900" value={jsonPatch} onChange={(e) => setJsonPatch(e.target.value)} />
              <button className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white" onClick={applyJsonPatch} disabled={!selected.length}>Apply JSON Patch</button>
            </div>
          </article>
        </div>
      </section>
    </div>
  );
}
