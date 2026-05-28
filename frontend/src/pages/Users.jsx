import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Copy, KeyRound, PauseCircle, PlayCircle, Plus, RefreshCw, Save, ShieldCheck } from "lucide-react";

import SearchableSelect from "../components/ui/SearchableSelect";
import { useAppData } from "../context/AppContext";
import {
  createPanelUser,
  fetchPanelUserAccess,
  fetchPanelUserActivity,
  fetchPanelUserKeys,
  fetchPanelUserPosts,
  fetchPanelUsers,
  issuePanelUserKey,
  updatePanelUser,
  updatePanelUserAccess,
  updatePanelUserKey,
} from "../utils/api";

const TASK_OPTIONS = [
  "article",
  "sbm",
  "pdf",
  "classified",
  "listing",
  "image",
  "profile",
  "mediaDistribution",
  "comment",
  "social",
  "org",
];

const emptyUserForm = {
  name: "",
  email: "",
  notes: "",
  rateLimitPerMinute: "",
  dailyPostLimit: "",
  totalPostLimit: "",
};

const formatDate = (value) => (value ? new Date(value).toLocaleString() : "Never");

export default function Users() {
  const { sites } = useAppData();
  const [users, setUsers] = useState([]);
  const [usersMeta, setUsersMeta] = useState({ page: 1, limit: 25, total: 0, totalPages: 1 });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [form, setForm] = useState(emptyUserForm);
  const [newToken, setNewToken] = useState("");
  const [keys, setKeys] = useState([]);
  const [access, setAccess] = useState([]);
  const [posts, setPosts] = useState([]);
  const [activity, setActivity] = useState([]);
  const [siteSearch, setSiteSearch] = useState("");
  const [accessDraft, setAccessDraft] = useState({
    siteId: "",
    taskKey: "article",
    perMinuteLimit: "",
    dailyLimit: "",
    totalLimit: "",
  });

  const siteOptions = useMemo(
    () =>
      sites.map((site) => ({
        value: site.id,
        label: site.name,
        meta: `${site.code} ${(site.supportedTasks || []).join(", ")}`,
      })),
    [sites]
  );

  const selectedSite = useMemo(
    () => sites.find((site) => site.id === accessDraft.siteId),
    [sites, accessDraft.siteId]
  );

  const loadUsers = async (page = usersMeta.page) => {
    setLoadingUsers(true);
    try {
      const result = await fetchPanelUsers({ page, limit: usersMeta.limit, search, status });
      setUsers(result.users);
      setUsersMeta(result.meta);
      if (!selectedUser && result.users[0]) setSelectedUser(result.users[0]);
    } catch (error) {
      toast.error(error.message || "Failed to load users");
    } finally {
      setLoadingUsers(false);
    }
  };

  const loadUserDetail = async (user) => {
    if (!user) return;
    try {
      const [keyRows, accessRows, postRows, activityRows] = await Promise.all([
        fetchPanelUserKeys(user.id),
        fetchPanelUserAccess(user.id, { page: 1, limit: 50 }),
        fetchPanelUserPosts(user.id, { page: 1, limit: 20 }),
        fetchPanelUserActivity(user.id, { page: 1, limit: 25 }),
      ]);
      setKeys(keyRows);
      setAccess(accessRows.access);
      setPosts(postRows.posts);
      setActivity(activityRows.logs);
    } catch (error) {
      toast.error(error.message || "Failed to load user details");
    }
  };

  useEffect(() => {
    loadUsers(1);
  }, []);

  useEffect(() => {
    if (selectedUser) loadUserDetail(selectedUser);
  }, [selectedUser?.id]);

  const handleCreateUser = async (event) => {
    event.preventDefault();
    try {
      const user = await createPanelUser(form);
      setForm(emptyUserForm);
      setSelectedUser(user);
      await loadUsers(1);
      toast.success("User created");
    } catch (error) {
      toast.error(error.message || "Failed to create user");
    }
  };

  const handleToggleUser = async () => {
    if (!selectedUser) return;
    const nextStatus = selectedUser.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    try {
      const updated = await updatePanelUser(selectedUser.id, { status: nextStatus });
      setSelectedUser(updated);
      await loadUsers(usersMeta.page);
      toast.success(`User ${nextStatus.toLowerCase()}`);
    } catch (error) {
      toast.error(error.message || "Failed to update user");
    }
  };

  const handleIssueKey = async () => {
    if (!selectedUser) return;
    try {
      const issued = await issuePanelUserKey(selectedUser.id, { name: `${selectedUser.name} API` });
      setNewToken(issued.rawApiKey);
      await loadUserDetail(selectedUser);
      toast.success("User API key created");
    } catch (error) {
      toast.error(error.message || "Failed to issue key");
    }
  };

  const handleRevokeKey = async (key) => {
    if (!selectedUser) return;
    try {
      await updatePanelUserKey(selectedUser.id, key.id, { revoke: true });
      await loadUserDetail(selectedUser);
      toast.success("Key revoked");
    } catch (error) {
      toast.error(error.message || "Failed to revoke key");
    }
  };

  const handleAssignAccess = async () => {
    if (!selectedUser) return;
    if (!accessDraft.siteId || !accessDraft.taskKey) {
      toast.error("Select site and task first");
      return;
    }

    try {
      await updatePanelUserAccess(selectedUser.id, [
        {
          ...accessDraft,
          canRead: true,
          canPost: true,
          canEdit: true,
          canDelete: true,
          isActive: true,
        },
      ]);
      await loadUserDetail(selectedUser);
      toast.success("Access assigned");
    } catch (error) {
      toast.error(error.message || "Failed to assign access");
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Users & Access</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Manage user-owned API keys, site/task access, limits, and activity without touching legacy site tokens.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[var(--border-color)] px-3 text-sm"
          onClick={() => loadUsers(usersMeta.page)}
        >
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      <div className="grid min-h-0 grid-cols-1 gap-4 xl:grid-cols-[360px_1fr]">
        <section className="flex min-h-0 flex-col rounded-panel border border-[var(--border-color)] bg-[var(--bg-secondary)]">
          <div className="border-b border-[var(--border-color)] p-4">
            <form className="space-y-3" onSubmit={handleCreateUser}>
              <div className="grid grid-cols-1 gap-2">
                <input className="min-h-10 rounded-lg border border-[var(--border-color)] bg-transparent px-3 text-sm" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                <input className="min-h-10 rounded-lg border border-[var(--border-color)] bg-transparent px-3 text-sm" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                <div className="grid grid-cols-3 gap-2">
                  <input className="min-h-10 rounded-lg border border-[var(--border-color)] bg-transparent px-3 text-xs" placeholder="/min" value={form.rateLimitPerMinute} onChange={(e) => setForm({ ...form, rateLimitPerMinute: e.target.value })} />
                  <input className="min-h-10 rounded-lg border border-[var(--border-color)] bg-transparent px-3 text-xs" placeholder="/day" value={form.dailyPostLimit} onChange={(e) => setForm({ ...form, dailyPostLimit: e.target.value })} />
                  <input className="min-h-10 rounded-lg border border-[var(--border-color)] bg-transparent px-3 text-xs" placeholder="total" value={form.totalPostLimit} onChange={(e) => setForm({ ...form, totalPostLimit: e.target.value })} />
                </div>
              </div>
              <button type="submit" className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 text-sm text-white">
                <Plus size={16} /> Create User
              </button>
            </form>
          </div>

          <div className="flex gap-2 border-b border-[var(--border-color)] p-3">
            <input className="min-h-10 flex-1 rounded-lg border border-[var(--border-color)] bg-transparent px-3 text-sm" placeholder="Search users" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && loadUsers(1)} />
            <select className="min-h-10 rounded-lg border border-[var(--border-color)] bg-transparent px-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">All</option>
              <option value="ACTIVE">Active</option>
              <option value="SUSPENDED">Suspended</option>
              <option value="DISABLED">Disabled</option>
            </select>
            <button className="min-h-10 rounded-lg bg-slate-900 px-3 text-sm text-white" onClick={() => loadUsers(1)} disabled={loadingUsers}>Go</button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {users.map((user) => (
              <button
                key={user.id}
                type="button"
                className={`mb-2 w-full rounded-lg border p-3 text-left text-sm transition ${selectedUser?.id === user.id ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30" : "border-[var(--border-color)] hover:bg-slate-50 dark:hover:bg-slate-900/50"}`}
                onClick={() => setSelectedUser(user)}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{user.name}</span>
                  <span className="text-xs text-[var(--text-secondary)]">{user.status}</span>
                </div>
                <p className="mt-1 truncate text-xs text-[var(--text-secondary)]">{user.email}</p>
                <p className="mt-2 text-xs text-[var(--text-secondary)]">
                  {user._count?.apiKeys || 0} keys • {user._count?.accessRules || 0} rules
                </p>
              </button>
            ))}
          </div>
        </section>

        <section className="min-h-0 overflow-y-auto rounded-panel border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4">
          {!selectedUser ? (
            <div className="rounded-lg border border-dashed border-[var(--border-color)] p-8 text-center text-sm text-[var(--text-secondary)]">
              Select or create a user.
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">{selectedUser.name}</h2>
                  <p className="text-sm text-[var(--text-secondary)]">{selectedUser.email}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[var(--border-color)] px-3 text-sm" onClick={handleToggleUser}>
                    {selectedUser.status === "ACTIVE" ? <PauseCircle size={16} /> : <PlayCircle size={16} />}
                    {selectedUser.status === "ACTIVE" ? "Suspend" : "Activate"}
                  </button>
                  <button className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-slate-900 px-3 text-sm text-white" onClick={handleIssueKey}>
                    <KeyRound size={16} /> Issue Key
                  </button>
                </div>
              </div>

              {newToken ? (
                <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">
                  <div className="mb-2 font-semibold">New token generated. Store it now.</div>
                  <div className="flex gap-2">
                    <code className="min-w-0 flex-1 overflow-x-auto rounded bg-white px-2 py-2 text-xs">{newToken}</code>
                    <button className="rounded-lg bg-green-700 px-3 text-white" onClick={() => navigator.clipboard.writeText(newToken)}>
                      <Copy size={16} />
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
                <div className="rounded-lg border border-[var(--border-color)] p-4">
                  <h3 className="mb-3 flex items-center gap-2 font-semibold"><ShieldCheck size={16} /> Assign Site Task Access</h3>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <SearchableSelect
                      label="Site"
                      value={accessDraft.siteId}
                      onChange={(value) => setAccessDraft({ ...accessDraft, siteId: value })}
                      searchValue={siteSearch}
                      onSearchChange={setSiteSearch}
                      options={siteOptions}
                      placeholder="Choose site"
                      searchPlaceholder="Search site"
                    />
                    <label className="text-xs text-[var(--text-secondary)]">
                      <span className="mb-1 block font-medium uppercase tracking-wide">Task</span>
                      <select className="min-h-10 w-full rounded-lg border border-[var(--border-color)] bg-transparent px-3 text-sm" value={accessDraft.taskKey} onChange={(e) => setAccessDraft({ ...accessDraft, taskKey: e.target.value })}>
                        {(selectedSite?.supportedTasks?.length ? selectedSite.supportedTasks : TASK_OPTIONS).map((task) => (
                          <option key={task} value={task}>{task}</option>
                        ))}
                      </select>
                    </label>
                    <input className="min-h-10 rounded-lg border border-[var(--border-color)] bg-transparent px-3 text-sm" placeholder="Per minute limit" value={accessDraft.perMinuteLimit} onChange={(e) => setAccessDraft({ ...accessDraft, perMinuteLimit: e.target.value })} />
                    <input className="min-h-10 rounded-lg border border-[var(--border-color)] bg-transparent px-3 text-sm" placeholder="Daily limit" value={accessDraft.dailyLimit} onChange={(e) => setAccessDraft({ ...accessDraft, dailyLimit: e.target.value })} />
                    <input className="min-h-10 rounded-lg border border-[var(--border-color)] bg-transparent px-3 text-sm" placeholder="Total limit" value={accessDraft.totalLimit} onChange={(e) => setAccessDraft({ ...accessDraft, totalLimit: e.target.value })} />
                    <button className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 text-sm text-white" onClick={handleAssignAccess}>
                      <Save size={16} /> Save Access
                    </button>
                  </div>
                </div>

                <div className="rounded-lg border border-[var(--border-color)] p-4">
                  <h3 className="mb-3 font-semibold">Keys</h3>
                  <div className="max-h-64 space-y-2 overflow-y-auto">
                    {keys.map((key) => (
                      <div key={key.id} className="rounded-lg border border-[var(--border-color)] p-3 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{key.name}</span>
                          <button className="rounded-lg border border-[var(--border-color)] px-2 py-1 text-xs" onClick={() => handleRevokeKey(key)} disabled={!key.isActive}>Revoke</button>
                        </div>
                        <p className="mt-1 text-xs text-[var(--text-secondary)]">{key.isActive ? "Active" : "Inactive"} • Last used {formatDate(key.lastUsedAt)}</p>
                      </div>
                    ))}
                    {!keys.length && <p className="text-sm text-[var(--text-secondary)]">No user keys yet.</p>}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 2xl:grid-cols-3">
                <div className="rounded-lg border border-[var(--border-color)] p-4">
                  <h3 className="mb-3 font-semibold">Access Rules</h3>
                  <div className="max-h-80 space-y-2 overflow-y-auto text-sm">
                    {access.map((rule) => (
                      <div key={rule.id} className="rounded-lg border border-[var(--border-color)] p-3">
                        <div className="font-medium">{rule.site?.name}</div>
                        <p className="text-xs text-[var(--text-secondary)]">{rule.site?.code} • {rule.taskKey} • {rule.isActive ? "active" : "inactive"}</p>
                      </div>
                    ))}
                    {!access.length && <p className="text-[var(--text-secondary)]">No access assigned yet.</p>}
                  </div>
                </div>

                <div className="rounded-lg border border-[var(--border-color)] p-4">
                  <h3 className="mb-3 font-semibold">Recent Posts</h3>
                  <div className="max-h-80 space-y-2 overflow-y-auto text-sm">
                    {posts.map((post) => (
                      <div key={post.id} className="rounded-lg border border-[var(--border-color)] p-3">
                        <div className="line-clamp-2 font-medium">{post.title}</div>
                        <p className="mt-1 text-xs text-[var(--text-secondary)]">{post.siteName} • {post.taskType} • {formatDate(post.date)}</p>
                      </div>
                    ))}
                    {!posts.length && <p className="text-[var(--text-secondary)]">No posts by this user yet.</p>}
                  </div>
                </div>

                <div className="rounded-lg border border-[var(--border-color)] p-4">
                  <h3 className="mb-3 font-semibold">Activity</h3>
                  <div className="max-h-80 space-y-2 overflow-y-auto text-sm">
                    {activity.map((log) => (
                      <div key={log.id} className="rounded-lg border border-[var(--border-color)] p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{log.action}</span>
                          <span className="text-xs text-[var(--text-secondary)]">{log.status}</span>
                        </div>
                        <p className="mt-1 text-xs text-[var(--text-secondary)]">{log.site?.code || "no-site"} • {log.taskKey || "any"} • {formatDate(log.createdAt)}</p>
                      </div>
                    ))}
                    {!activity.length && <p className="text-[var(--text-secondary)]">No tracked activity yet.</p>}
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
