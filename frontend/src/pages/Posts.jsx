import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";

import PostTable from "../components/posts/PostTable";
import PostEditorModal from "../components/posts/PostEditorModal";
import SearchableSelect from "../components/ui/SearchableSelect";
import { useAppData } from "../context/AppContext";
import { fetchPostsPage } from "../utils/api";

const PAGE_SIZE = 15;
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
  general: "General",
};

const TASK_OPTIONS = Object.entries(TASK_LABELS)
  .filter(([value]) => value !== "general")
  .map(([value, label]) => ({ value, label, meta: value }))
  .sort((a, b) => a.label.localeCompare(b.label));

export default function Posts() {
  const { posts: recentPosts, sites, globalQuery, setGlobalQuery, runPostBulkAction, editPost } = useAppData();
  const [params] = useSearchParams();
  const initialSiteId = params.get("site") || "all";
  const initialSearch = params.get("search") || "";

  const [tab, setTab] = useState(initialSiteId === "all" ? "all" : "site");
  const [siteFilter, setSiteFilter] = useState(initialSiteId);
  const [statusFilter, setStatusFilter] = useState("all");
  const [taskFilter, setTaskFilter] = useState("all");
  const [query, setQuery] = useState(initialSearch || globalQuery || "");
  const [siteSearch, setSiteSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [timeFrom, setTimeFrom] = useState("");
  const [timeTo, setTimeTo] = useState("");
  const [selected, setSelected] = useState([]);
  const [sortBy, setSortBy] = useState("date");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 });
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [openEditor, setOpenEditor] = useState(false);
  const [editingPost, setEditingPost] = useState(null);
  const [savedSearches, setSavedSearches] = useState(() => {
    const raw = localStorage.getItem("site-master-saved-searches");
    return raw ? JSON.parse(raw) : [];
  });

  const siteOptions = useMemo(
    () =>
      sites.map((site) => ({
        value: site.id,
        label: site.name,
        meta: `${site.code} ${site.url || ""}`,
      })),
    [sites]
  );

  const loadPosts = async (nextPage = page) => {
    setLoading(true);
    try {
      const result = await fetchPostsPage({
        page: nextPage,
        limit: PAGE_SIZE,
        search: query || globalQuery,
        siteId: tab === "site" ? siteFilter : "all",
        status: statusFilter,
        taskType: taskFilter,
        dateFrom,
        dateTo,
        timeFrom,
        timeTo,
      });

      let nextRows = result.posts;
      nextRows = [...nextRows].sort((a, b) => {
        if (sortBy === "title") return a.title.localeCompare(b.title);
        return new Date(b.date) - new Date(a.date);
      });

      setRows(nextRows);
      setMeta(result.meta);
      setSelected([]);
    } catch (error) {
      toast.error(error.message || "Failed to load posts");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      loadPosts(1);
    }, 300);

    return () => clearTimeout(timer);
  }, [tab, siteFilter, statusFilter, taskFilter, query, globalQuery, dateFrom, dateTo, timeFrom, timeTo, sortBy]);

  useEffect(() => {
    loadPosts(page);
  }, [page]);

  useEffect(() => {
    const paramSearch = params.get("search") || "";
    if (paramSearch && paramSearch !== query) {
      setQuery(paramSearch);
      setGlobalQuery(paramSearch);
    }
  }, [params, query, setGlobalQuery]);

  const totalPages = Math.max(Number(meta.totalPages) || 1, 1);
  const toggle = (id) => setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">Posts Management</h1>
          <p className="text-xs text-[var(--text-secondary)]">
            {loading ? "Loading posts..." : `Showing page ${meta.page || page} of ${totalPages} · ${meta.total || 0} total posts`}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            className="rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm"
            onClick={() => {
              const next = [...savedSearches, { tab, siteFilter, statusFilter, taskFilter, query, dateFrom, dateTo, timeFrom, timeTo }].slice(-8);
              setSavedSearches(next);
              localStorage.setItem("site-master-saved-searches", JSON.stringify(next));
            }}
          >
            Save Search
          </button>
          <button
            className="rounded-lg border border-rose-400 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/30 dark:text-rose-300"
            onClick={async () => {
              const confirmed = window.confirm("Delete ALL posts from all sites? This cannot be undone.");
              if (!confirmed) return;
              await runPostBulkAction({ action: "deleteAll" });
              await loadPosts(1);
            }}
          >
            Delete All Posts
          </button>
          <button className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white" onClick={async () => { await runPostBulkAction({ postIds: selected, action: "publish" }); await loadPosts(page); }} disabled={!selected.length}>Bulk Publish</button>
          <button className="rounded-lg border border-red-300 px-3 py-2 text-sm text-red-600" onClick={async () => { await runPostBulkAction({ postIds: selected, action: "delete" }); await loadPosts(page); }} disabled={!selected.length}>Bulk Delete</button>
        </div>
      </div>

      <section className="glass rounded-panel p-3">
        <div className="flex flex-wrap gap-2">
          <button className={`rounded-lg px-3 py-2 text-sm ${tab === "all" ? "bg-blue-600 text-white" : "border border-[var(--border-color)]"}`} onClick={() => { setTab("all"); setSiteFilter("all"); }}>All Posts</button>
          <button className={`rounded-lg px-3 py-2 text-sm ${tab === "site" ? "bg-blue-600 text-white" : "border border-[var(--border-color)]"}`} onClick={() => setTab("site")}>By Site</button>
          {tab === "site" && (
            <SearchableSelect
              value={siteFilter === "all" ? "" : siteFilter}
              onChange={(value) => setSiteFilter(value || "all")}
              searchValue={siteSearch}
              onSearchChange={setSiteSearch}
              options={siteOptions}
              placeholder="All sites"
              searchPlaceholder="Search site by name, code, or URL"
              className="min-w-[260px]"
            />
          )}
          <select className="rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm" value={taskFilter} onChange={(e) => setTaskFilter(e.target.value)}>
            <option value="all">All Tasks</option>
            {TASK_OPTIONS.map((task) => (
              <option key={task.value} value={task.value}>{task.label}</option>
            ))}
          </select>
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
          <input type="time" className="rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm" value={timeFrom} onChange={(e) => setTimeFrom(e.target.value)} title="Start time" />
          <input type="time" className="rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm" value={timeTo} onChange={(e) => setTimeTo(e.target.value)} title="End time" />
          <button
            className="rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm"
            onClick={() => {
              setTaskFilter("all");
              setStatusFilter("all");
              setDateFrom("");
              setDateTo("");
              setTimeFrom("");
              setTimeTo("");
              setQuery("");
              setGlobalQuery("");
              setPage(1);
            }}
          >
            Clear
          </button>
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
                  setTaskFilter(s.taskFilter || "all");
                  setQuery(s.query);
                  setDateFrom(s.dateFrom);
                  setDateTo(s.dateTo);
                  setTimeFrom(s.timeFrom || "");
                  setTimeTo(s.timeTo || "");
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
          posts={rows}
          selectedIds={selected}
          onSelect={toggle}
          onSelectAll={(checked) => setSelected(checked ? rows.map((post) => post.id) : [])}
          onView={(post) => {
            setEditingPost(post);
            setOpenEditor(true);
          }}
          onDelete={async (id) => { await runPostBulkAction({ postIds: [id], action: "delete" }); await loadPosts(page); }}
          onInlineStatus={async (postId, status) => { await editPost(postId, { status }); await loadPosts(page); }}
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
          await loadPosts(page);
          setOpenEditor(false);
        }}
      />
    </div>
  );
}
