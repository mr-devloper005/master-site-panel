import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

import SiteTable from "../components/sites/SiteTable";
import SiteFormModal from "../components/sites/SiteFormModal";
import SiteProvisioningModal from "../components/sites/SiteProvisioningModal";
import SiteTaskModal from "../components/sites/SiteTaskModal";
import { useAppData } from "../context/AppContext";

export default function Sites() {
  const { sites, posts, createSite, editSite, addTaskToSite, runSiteBulkAction } = useAppData();
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState("name");
  const [selected, setSelected] = useState([]);
  const [openModal, setOpenModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [taskSite, setTaskSite] = useState(null);
  const [packageData, setPackageData] = useState(null);
  const navigate = useNavigate();

  const rows = useMemo(() => {
    const withCounts = sites.map((site) => ({
      ...site,
      postCount: posts.filter((post) => post.siteId === site.id).length
    }));

    const filtered = withCounts.filter((site) => {
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      const searchValues = [
        site.name,
        site.code,
        site.url,
        site.domain,
        site.description,
        site.raw?.config?.frontendUrl,
        site.raw?.config?.liveUrl,
        site.raw?.config?.siteUrl,
        site.raw?.config?.url,
        site.raw?.config?.domain,
      ];

      return searchValues.some((value) => String(value || "").toLowerCase().includes(q));
    });

    return filtered.sort((a, b) => {
      if (sortBy === "id") return a.id.localeCompare(b.id);
      return a.name.localeCompare(b.name);
    });
  }, [sites, posts, query, sortBy]);

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

      <div className="min-h-0 flex-1 overflow-hidden">
        <SiteTable
          sites={rows}
          selectedIds={selected}
          onToggle={toggle}
          onToggleAll={(checked) => setSelected(checked ? rows.map((row) => row.id) : [])}
          onEdit={(site) => {
            setEditing(site);
            setOpenModal(true);
          }}
          onDelete={async (id) => {
            if (!confirm("Delete this site and its posts?")) return;
            await runSiteBulkAction([id], "delete");
            toast.success("Site deleted");
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
