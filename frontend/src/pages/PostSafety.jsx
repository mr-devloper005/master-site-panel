import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { CheckCircle2, FileText, Image, Search, Tags, Trash2, Wand2 } from "lucide-react";

import { bulkPostAction, lookupPostsByLinks } from "../utils/api";

const emptyDraft = {
  title: "",
  slug: "",
  summary: "",
  metaTitle: "",
  metaDescription: "",
  authorName: "",
  status: "",
  publishedAt: "",
  externalPostId: "",
  tagsText: "",
  contentRows: [],
  mediaRows: [],
};

const valueToText = (value) => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
};

const textToValue = (value) => {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "";
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return value;
    }
  }
  return value;
};

const rowsFromObject = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value).map(([key, rowValue]) => ({ key, value: valueToText(rowValue), enabled: false, locked: true }));
};

const rowsToObject = (rows, { enabledOnly = false } = {}) => {
  const output = {};
  rows.forEach((row) => {
    const key = String(row.key || "").trim();
    if (!key) return;
    if (enabledOnly && !row.enabled) return;
    output[key] = textToValue(row.value);
  });
  return output;
};

const draftFromPost = (post) => {
  const payload = post?.payload || {};
  return {
    title: payload.title || post?.title || "",
    slug: payload.slug || post?.slug || "",
    summary: payload.summary || post?.summary || "",
    metaTitle: payload.metaTitle || "",
    metaDescription: payload.metaDescription || "",
    authorName: payload.authorName || "",
    status: payload.status || post?.status || "",
    publishedAt: payload.publishedAt ? String(payload.publishedAt).slice(0, 16) : "",
    externalPostId: payload.externalPostId || "",
    tagsText: Array.isArray(payload.tags) ? payload.tags.join(", ") : "",
    contentRows: rowsFromObject(payload.content),
    mediaRows: rowsFromObject(payload.media),
  };
};

const fieldCards = [
  { key: "title", label: "Title", required: true, bulk: false, placeholder: "Post title" },
  { key: "slug", label: "Slug", required: true, bulk: false, placeholder: "post-url-slug" },
  { key: "summary", label: "Summary", bulk: true, placeholder: "Short summary / excerpt" },
  { key: "metaTitle", label: "Meta Title", bulk: true, placeholder: "SEO title" },
  { key: "metaDescription", label: "Meta Description", bulk: true, placeholder: "SEO description" },
  { key: "authorName", label: "Author Name", bulk: true, placeholder: "Author" },
];

const editableStatuses = ["", "PUBLISHED", "DRAFT", "ARCHIVED"];

export default function PostSafety() {
  const [linksText, setLinksText] = useState("");
  const [lookup, setLookup] = useState(null);
  const [selected, setSelected] = useState([]);
  const [activeId, setActiveId] = useState("");
  const [loadingLookup, setLoadingLookup] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [bulkFields, setBulkFields] = useState({ summary: false, metaTitle: false, metaDescription: false, authorName: false, status: false, appendTags: false });
  const [appendTagsText, setAppendTagsText] = useState("");

  const foundRows = lookup?.found || [];
  const activePost = foundRows.find((row) => row.id === activeId) || foundRows[0] || null;
  const allSelected = foundRows.length > 0 && selected.length === Math.min(foundRows.length, 200);
  const isSingleEdit = selected.length === 1;

  useEffect(() => {
    setDraft(draftFromPost(activePost));
    setBulkFields({ summary: false, metaTitle: false, metaDescription: false, authorName: false, status: false, appendTags: false });
    setAppendTagsText("");
  }, [activePost?.id]);

  const activePostLabel = useMemo(() => activePost ? `${activePost.siteName} · ${activePost.taskType}` : "No post selected", [activePost]);

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

  const setDraftField = (key, value) => setDraft((prev) => ({ ...prev, [key]: value }));

  const updateRow = (section, index, patch) => {
    setDraft((prev) => ({
      ...prev,
      [section]: prev[section].map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row),
    }));
  };

  const addRow = (section) => {
    setDraft((prev) => ({
      ...prev,
      [section]: [...prev[section], { key: "", value: "", enabled: true, locked: false }],
    }));
  };

  const validateSingleDraft = () => {
    if (!draft.title.trim()) return "Title is required.";
    if (!draft.slug.trim()) return "Slug is required.";
    return null;
  };

  const buildSingleUpdate = () => {
    const content = rowsToObject(draft.contentRows);
    const media = rowsToObject(draft.mediaRows);
    return {
      title: draft.title.trim(),
      slug: draft.slug.trim(),
      summary: draft.summary,
      metaTitle: draft.metaTitle,
      metaDescription: draft.metaDescription,
      authorName: draft.authorName,
      status: draft.status,
      publishedAt: draft.publishedAt || null,
      externalPostId: draft.externalPostId,
      tags: draft.tagsText.split(",").map((tag) => tag.trim()).filter(Boolean),
      content,
      media,
    };
  };

  const buildBulkUpdate = () => {
    const data = {};
    ["summary", "metaTitle", "metaDescription", "authorName"].forEach((key) => {
      if (bulkFields[key]) data[key] = draft[key];
    });
    if (bulkFields.status && draft.status) data.status = draft.status;
    if (bulkFields.appendTags && appendTagsText.trim()) {
      data.appendTags = appendTagsText.split(",").map((tag) => tag.trim()).filter(Boolean);
    }
    const contentMerge = rowsToObject(draft.contentRows, { enabledOnly: true });
    const mediaMerge = rowsToObject(draft.mediaRows, { enabledOnly: true });
    if (Object.keys(contentMerge).length) data.contentMerge = contentMerge;
    if (Object.keys(mediaMerge).length) data.mediaMerge = mediaMerge;
    return data;
  };

  const savePayloadForm = async () => {
    if (!selected.length) return;

    const data = isSingleEdit ? buildSingleUpdate() : buildBulkUpdate();
    if (isSingleEdit) {
      const validation = validateSingleDraft();
      if (validation) {
        toast.error(validation);
        return;
      }
    }
    if (!Object.keys(data).length) {
      toast.error("Select at least one field to update.");
      return;
    }

    await bulkPostAction({ postIds: selected, action: "edit", data });
    toast.success(`${selected.length} post${selected.length > 1 ? "s" : ""} updated safely`);
    await runLookup();
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">Link Finder & Smart Bulk Editor</h1>
          <p className="text-xs text-[var(--text-secondary)]">
            Paste URLs, find DB posts, edit payload fields through safe input cards, or delete with 7-day restore history.
          </p>
        </div>
      </div>

      <section className="grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-[0.9fr_1.1fr]">
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
                <p className="text-xs text-[var(--text-secondary)]">Selected {selected.length} / {foundRows.length}. Bulk delete/edit limit: 200.</p>
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

        <article className="glass flex min-h-0 flex-col overflow-hidden rounded-panel p-4">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 font-semibold"><Wand2 size={18} /> Safe Payload Form Editor</div>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                {isSingleEdit ? "Single mode: full payload fields can be edited safely." : "Bulk mode: tick fields you want to apply to selected posts. Title/slug are protected in bulk."}
              </p>
              <p className="mt-1 text-xs font-medium text-slate-500">Active: {activePostLabel}</p>
            </div>
            <button className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" onClick={savePayloadForm} disabled={!selected.length}>
              <CheckCircle2 className="mr-1 inline" size={16} /> Save Updates
            </button>
          </div>

          {!activePost ? (
            <div className="rounded-xl border border-dashed border-[var(--border-color)] p-8 text-center text-sm text-[var(--text-secondary)]">Search links and select a post to edit.</div>
          ) : (
            <div className="scrollbar-thin min-h-0 flex-1 space-y-4 overflow-auto pr-1">
              <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {fieldCards.map((field) => {
                  const lockedInBulk = !isSingleEdit && !field.bulk;
                  return (
                    <label key={field.key} className={`rounded-2xl border border-[var(--border-color)] bg-white/80 p-3 ${lockedInBulk ? "opacity-60" : ""}`}>
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{field.label}{field.required ? " *" : ""}</span>
                        {!isSingleEdit && field.bulk && (
                          <span className="flex items-center gap-1 text-xs text-slate-500">
                            <input type="checkbox" checked={Boolean(bulkFields[field.key])} onChange={(e) => setBulkFields((prev) => ({ ...prev, [field.key]: e.target.checked }))} /> Apply
                          </span>
                        )}
                        {lockedInBulk && <span className="text-[10px] font-semibold uppercase text-amber-600">Single only</span>}
                      </div>
                      {field.key === "summary" || field.key === "metaDescription" ? (
                        <textarea className="min-h-24 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" disabled={lockedInBulk} placeholder={field.placeholder} value={draft[field.key]} onChange={(e) => setDraftField(field.key, e.target.value)} />
                      ) : (
                        <input className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" disabled={lockedInBulk} placeholder={field.placeholder} value={draft[field.key]} onChange={(e) => setDraftField(field.key, e.target.value)} />
                      )}
                    </label>
                  );
                })}

                <label className="rounded-2xl border border-[var(--border-color)] bg-white/80 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Status</span>
                    {!isSingleEdit && <span className="flex items-center gap-1 text-xs text-slate-500"><input type="checkbox" checked={bulkFields.status} onChange={(e) => setBulkFields((prev) => ({ ...prev, status: e.target.checked }))} /> Apply</span>}
                  </div>
                  <select className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={draft.status} onChange={(e) => setDraftField("status", e.target.value)}>
                    {editableStatuses.map((status) => <option key={status || "none"} value={status}>{status || "No status change"}</option>)}
                  </select>
                </label>

                <label className="rounded-2xl border border-[var(--border-color)] bg-white/80 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Tags</span>
                    {!isSingleEdit && <span className="flex items-center gap-1 text-xs text-slate-500"><input type="checkbox" checked={bulkFields.appendTags} onChange={(e) => setBulkFields((prev) => ({ ...prev, appendTags: e.target.checked }))} /> Append</span>}
                  </div>
                  <input className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="tag one, tag two" value={isSingleEdit ? draft.tagsText : appendTagsText} onChange={(e) => isSingleEdit ? setDraftField("tagsText", e.target.value) : setAppendTagsText(e.target.value)} />
                  <p className="mt-1 text-[11px] text-slate-500">{isSingleEdit ? "Single mode replaces tags." : "Bulk mode appends tags only; existing tags stay safe."}</p>
                </label>
              </section>

              <PayloadRowsCard
                icon={<FileText size={17} />}
                title="Content Payload"
                help={isSingleEdit ? "Edit text inside existing content keys. Keys stay visible so structure is not accidentally removed." : "Tick content rows to apply them as contentMerge to all selected posts."}
                rows={draft.contentRows}
                section="contentRows"
                isSingleEdit={isSingleEdit}
                onUpdate={updateRow}
                onAdd={addRow}
              />

              <PayloadRowsCard
                icon={<Image size={17} />}
                title="Media / Image Payload"
                help={isSingleEdit ? "Update image URLs, logos, gallery fields, and media text safely." : "Tick media rows to apply them as mediaMerge to all selected posts."}
                rows={draft.mediaRows}
                section="mediaRows"
                isSingleEdit={isSingleEdit}
                onUpdate={updateRow}
                onAdd={addRow}
              />

              <section className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <div className="mb-1 flex items-center gap-2 font-bold"><Tags size={15} /> Safety Rules</div>
                <p>Bulk edit never changes title/slug and never deletes payload keys. Single edit requires title and slug. Image/content structure stays card-based, not raw JSON.</p>
              </section>
            </div>
          )}
        </article>
      </section>
    </div>
  );
}

function PayloadRowsCard({ icon, title, help, rows, section, isSingleEdit, onUpdate, onAdd }) {
  return (
    <section className="rounded-2xl border border-[var(--border-color)] bg-white/80 p-3">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 font-semibold">{icon} {title}</div>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">{help}</p>
        </div>
        <button className="rounded-lg border border-[var(--border-color)] px-3 py-2 text-xs font-semibold" onClick={() => onAdd(section)} type="button">Add Field</button>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {rows.map((row, index) => (
          <div key={`${row.key}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              {row.locked ? (
                <span className="truncate text-xs font-bold uppercase tracking-wide text-slate-500">{row.key}</span>
              ) : (
                <input className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold" placeholder="payloadKey" value={row.key} onChange={(e) => onUpdate(section, index, { key: e.target.value })} />
              )}
              {!isSingleEdit && (
                <label className="flex items-center gap-1 text-xs text-slate-500">
                  <input type="checkbox" checked={Boolean(row.enabled)} onChange={(e) => onUpdate(section, index, { enabled: e.target.checked })} /> Apply
                </label>
              )}
            </div>
            <textarea
              className="min-h-28 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              value={row.value}
              onChange={(e) => onUpdate(section, index, { value: e.target.value })}
              placeholder="Edit value here..."
            />
          </div>
        ))}
      </div>

      {!rows.length && <p className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">No fields found in this payload section.</p>}
    </section>
  );
}
