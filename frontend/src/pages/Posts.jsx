import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import PostTable from "../components/posts/PostTable";
import PostEditorModal from "../components/posts/PostEditorModal";
import { useAppData } from "../context/AppContext";

const PAGE_SIZE = 15;

export default function Posts() {
  const { posts, sites, globalQuery, setGlobalQuery, runPostBulkAction, editPost } = useAppData();
  const [params] = useSearchParams();
  const initialSiteId = params.get("site") || "all";
  const initialSearch = params.get("search") || "";

  const [tab, setTab] = useState(initialSiteId === "all" ? "all" : "site");
  const [siteFilter, setSiteFilter] = useState(initialSiteId);
  const [statusFilter, setStatusFilter] = useState("all");
  const [query, setQuery] = useState(initialSearch || globalQuery || "");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selected, setSelected] = useState([]);
  const [sortBy, setSortBy] = useState("date");
  const [page, setPage] = useState(1);
  const [openEditor, setOpenEditor] = useState(false);
  const [editingPost, setEditingPost] = useState(null);
  const [savedSearches, setSavedSearches] = useState(() => {
    const raw = localStorage.getItem("site-master-saved-searches");
    return raw ? JSON.parse(raw) : [];
  });

  const selectedSite = sites.find((site) => site.id === siteFilter);

  const filtered = useMemo(() => {
    const effectiveQuery = query.trim() || globalQuery.trim();
    const q = effectiveQuery.toLowerCase();

    let result = posts.filter((post) => {
      const matchTab =
        tab === "all" ||
        siteFilter === "all" ||
        post.siteId === siteFilter ||
        (selectedSite ? post.siteName === selectedSite.name : false);
      const matchStatus = statusFilter === "all" ? true : post.status === statusFilter;
      const matchSearch = !effectiveQuery
        ? true
        : [post.title, post.excerpt, post.author, post.siteName, post.date].some((field) =>
            field.toLowerCase().includes(q)
          );
      const date = new Date(post.date).getTime();
      const matchFrom = dateFrom ? date >= new Date(dateFrom).getTime() : true;
      const matchTo = dateTo ? date <= new Date(dateTo).getTime() + 24 * 60 * 60 * 1000 : true;
      return matchTab && matchStatus && matchSearch && matchFrom && matchTo;
    });

    result = result.sort((a, b) => {
      if (sortBy === "title") return a.title.localeCompare(b.title);
      return new Date(b.date) - new Date(a.date);
    });

    return result;
  }, [posts, tab, siteFilter, selectedSite, statusFilter, query, globalQuery, dateFrom, dateTo, sortBy]);

  useEffect(() => {
    setPage(1);
    setSelected([]);
  }, [tab, siteFilter, statusFilter, query, dateFrom, dateTo, sortBy]);

  const totalPages = Math.max(Math.ceil(filtered.length / PAGE_SIZE), 1);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const toggle = (id) => setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">Posts Management</h1>
        <div className="flex gap-2">
          <button
            className="rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm"
            onClick={() => {
              const next = [...savedSearches, { tab, siteFilter, statusFilter, query, dateFrom, dateTo }].slice(-8);
              setSavedSearches(next);
              localStorage.setItem("site-master-saved-searches", JSON.stringify(next));
            }}
          >
            Save Search
          </button>
          <button className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white" onClick={() => runPostBulkAction({ postIds: selected, action: "publish" })} disabled={!selected.length}>Bulk Publish</button>
          <button className="rounded-lg border border-red-300 px-3 py-2 text-sm text-red-600" onClick={() => runPostBulkAction({ postIds: selected, action: "delete" })} disabled={!selected.length}>Bulk Delete</button>
        </div>
      </div>

      <section className="glass rounded-panel p-3">
        <div className="flex flex-wrap gap-2">
          <button className={`rounded-lg px-3 py-2 text-sm ${tab === "all" ? "bg-blue-600 text-white" : "border border-[var(--border-color)]"}`} onClick={() => { setTab("all"); setSiteFilter("all"); }}>All Posts</button>
          <button className={`rounded-lg px-3 py-2 text-sm ${tab === "site" ? "bg-blue-600 text-white" : "border border-[var(--border-color)]"}`} onClick={() => setTab("site")}>By Site</button>
          {tab === "site" && (
            <select className="rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm" value={siteFilter} onChange={(e) => setSiteFilter(e.target.value)}>
              <option value="all">All sites</option>
              {sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
            </select>
          )}
          <select className="rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All Status</option>
            <option value="Published">Published</option>
            <option value="Draft">Draft</option>
          </select>
          <input
            className="min-h-11 min-w-[220px] flex-1 rounded-lg border border-[var(--border-color)] px-3 text-sm"
            placeholder="Search title, content, author, date"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setGlobalQuery(e.target.value);
            }}
          />
          <input type="date" className="rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <input type="date" className="rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>

        {savedSearches.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {savedSearches.map((s, idx) => (
              <button
                key={idx}
                className="rounded-full border border-[var(--border-color)] px-3 py-1 text-xs"
                onClick={() => {
                  setTab(s.tab);
                  setSiteFilter(s.siteFilter);
                  setStatusFilter(s.statusFilter);
                  setQuery(s.query);
                  setDateFrom(s.dateFrom);
                  setDateTo(s.dateTo);
                }}
              >
                {s.query || "Saved filter"}
              </button>
            ))}
          </div>
        )}
      </section>

      <div className="min-h-0 flex-1 overflow-hidden">
        <PostTable
          posts={paged}
          selectedIds={selected}
          onSelect={toggle}
          onSelectAll={(checked) => setSelected(checked ? paged.map((post) => post.id) : [])}
          onView={(post) => {
            setEditingPost(post);
            setOpenEditor(true);
          }}
          onDelete={(id) => runPostBulkAction({ postIds: [id], action: "delete" })}
          onInlineStatus={(postId, status) => editPost(postId, { status })}
          page={page}
          totalPages={totalPages}
          setPage={setPage}
          sortBy={sortBy}
          setSortBy={setSortBy}
        />
      </div>

      <PostEditorModal
        open={openEditor}
        post={editingPost}
        onClose={() => setOpenEditor(false)}
        onSave={async (payload) => {
          await editPost(editingPost.id, payload);
          setOpenEditor(false);
        }}
      />
    </div>
  );
}
