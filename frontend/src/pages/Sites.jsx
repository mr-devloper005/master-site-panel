import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

import SiteTable from "../components/sites/SiteTable";
import SiteFormModal from "../components/sites/SiteFormModal";
import SiteProvisioningModal from "../components/sites/SiteProvisioningModal";
import SiteTaskModal from "../components/sites/SiteTaskModal";
import { useAppData } from "../context/AppContext";
import { fetchSitesPage } from "../utils/api";

const DEFAULT_PAGE_SIZE = 100;

export default function Sites() {
  const { createSite, editSite, addTaskToSite, runSiteBulkAction } = useAppData();
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState("name");
  const [selected, setSelected] = useState([]);
  const [openModal, setOpenModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [taskSite, setTaskSite] = useState(null);
  const [packageData, setPackageData] = useState(null);
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [meta, setMeta] = useState({ page: 1, limit: DEFAULT_PAGE_SIZE, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const loadSites = async (nextPage = page, nextQuery = query) => {
    setLoading(true);
    try {
      const result = await fetchSitesPage({
        page: nextPage,
        limit: pageSize,
        search: nextQuery,
      });

      setRows(
        [...result.sites].sort((a, b) => {
          if (sortBy === "id") return a.id.localeCompare(b.id);
          return a.name.localeCompare(b.name);
        })
      );
      setMeta(result.meta);
      setSelected([]);
    } catch (error) {
      toast.error(error.message || "Failed to load sites");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      loadSites(1, query);
    }, 250);

    return () => clearTimeout(timer);
  }, [query, sortBy, pageSize]);

  useEffect(() => {
    loadSites(page, query);
  }, [page, pageSize]);

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      if (sortBy === "id") return a.id.localeCompare(b.id);
      return a.name.localeCompare(b.name);
    });
  }, [rows, sortBy]);

  const toggle = (id) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">Sites Management</h1>
        <button className="rounded-lg bg-blue-600 px-4 py-2 text-white" onClick={() => { setEditing(null); setOpenModal(true); }}>Add Site</button>
      </div>

      <div className="glass rounded-panel p-3">
        <div className="flex flex-wrap gap-2">
          <input className="min-h-11 flex-1 rounded-lg border border-[var(--border-color)] px-3" placeholder="Search sites" value={query} onChange={(e) => setQuery(e.target.value)} />
          <select
            className="min-h-11 rounded-lg border border-[var(--border-color)] bg-white px-3 text-sm text-slate-900"
            value={pageSize}
            onChange={(e) => {
              setPage(1);
              setPageSize(Number(e.target.value));
            }}
          >
            <option value={50}>50 / page</option>
            <option value={100}>100 / page</option>
            <option value={200}>200 / page</option>
          </select>
          <button className="min-h-11 rounded-lg border border-[var(--border-color)] px-4" onClick={() => runSiteBulkAction(selected, "activate")} disabled={!selected.length}>Activate</button>
          <button className="min-h-11 rounded-lg border border-[var(--border-color)] px-4" onClick={() => runSiteBulkAction(selected, "deactivate")} disabled={!selected.length}>Deactivate</button>
          <button
            className="min-h-11 rounded-lg border border-red-300 px-4 text-red-600"
            onClick={() => {
              if (!selected.length) return;
              if (!confirm(`Delete ${selected.length} selected sites?`)) return;
              runSiteBulkAction(selected, "delete");
              setSelected([]);
            }}
            disabled={!selected.length}
          >
            Delete Selected
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 text-sm text-[var(--text-secondary)]">
        <p>
          {loading ? "Loading sites..." : `Showing ${sortedRows.length} sites · page ${meta.page} of ${meta.totalPages} · ${meta.total} total sites`}
        </p>
        <div className="flex gap-2">
          <button
            className="min-h-10 rounded-lg border border-[var(--border-color)] px-3 disabled:opacity-50"
            onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
            disabled={loading || page <= 1}
          >
            Prev
          </button>
          <button
            className="min-h-10 rounded-lg border border-[var(--border-color)] px-3 disabled:opacity-50"
            onClick={() => setPage((prev) => Math.min(prev + 1, meta.totalPages))}
            disabled={loading || page >= meta.totalPages}
          >
            Next
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <SiteTable
          sites={sortedRows}
          selectedIds={selected}
          onToggle={toggle}
          onToggleAll={(checked) => setSelected(checked ? sortedRows.map((row) => row.id) : [])}
          onEdit={(site) => {
            setEditing(site);
            setOpenModal(true);
          }}
          onDelete={async (id) => {
            if (!confirm("Delete this site and its posts?")) return;
            await runSiteBulkAction([id], "delete");
            toast.success("Site deleted");
            await loadSites(page, query);
          }}
          onViewPosts={(site) => navigate(`/posts?site=${site.id}`)}
          onManageTasks={(site) => setTaskSite(site)}
          sortBy={sortBy}
          setSortBy={setSortBy}
        />
      </div>

      <SiteFormModal
        open={openModal}
        editing={editing}
        onClose={() => setOpenModal(false)}
        onSubmit={async (form) => {
          if (editing) {
            await editSite(editing.id, form);
          } else {
            const created = await createSite(form);
            setPackageData({ type: "site", ...created });
          }
          setOpenModal(false);
          await loadSites(page, query);
        }}
      />

      <SiteTaskModal
        open={Boolean(taskSite)}
        site={taskSite}
        onClose={() => setTaskSite(null)}
        onSubmit={async (task) => {
          if (!taskSite) return;
          const provisioned = await addTaskToSite(taskSite.id, task);
          setPackageData({ type: "task", ...provisioned });
          setTaskSite(null);
          await loadSites(page, query);
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
