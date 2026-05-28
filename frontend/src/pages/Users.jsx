import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Copy,
  KeyRound,
  ListChecks,
  PauseCircle,
  PlayCircle,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  UserPlus,
  UserRound,
  X,
} from "lucide-react";

import {
  createPanelUser,
  deletePanelUser,
  fetchPanelUserAccess,
  fetchPanelUserActivity,
  fetchPanelUserKeys,
  fetchPanelUserPosts,
  fetchPanelUsers,
  issuePanelUserKey,
  searchSites,
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

const TABS = [
  { id: "overview", label: "Overview", icon: Activity },
  { id: "keys", label: "API Keys", icon: KeyRound },
  { id: "access", label: "Site Access", icon: ShieldCheck },
  { id: "posts", label: "Posts", icon: ListChecks },
  { id: "activity", label: "Activity", icon: Activity },
];

const emptyUserForm = {
  name: "",
  email: "",
  notes: "",
  rateLimitPerMinute: "",
  dailyPostLimit: "",
  totalPostLimit: "",
};

const emptyAccessLimits = {
  perMinuteLimit: "",
  dailyLimit: "",
  totalLimit: "",
};

const formatDate = (value) => (value ? new Date(value).toLocaleString() : "Never");

const metricValue = (value, fallback = "Unlimited") => {
  if (value === null || value === undefined || value === "") return fallback;
  return value;
};

function StatCard({ label, value, tone = "default" }) {
  const tones = {
    default: "border-[var(--border-color)] bg-[var(--bg-secondary)]",
    blue: "border-blue-200 bg-blue-50 text-blue-950 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100",
    green: "border-green-200 bg-green-50 text-green-950 dark:border-green-900 dark:bg-green-950/30 dark:text-green-100",
    amber: "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100",
  };

  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${tones[tone]}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-70">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}

function EmptyState({ title, description }) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--border-color)] p-8 text-center">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">{description}</p>
    </div>
  );
}

export default function Users() {
  const [users, setUsers] = useState([]);
  const [usersMeta, setUsersMeta] = useState({ page: 1, limit: 25, total: 0, totalPages: 1 });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [form, setForm] = useState(emptyUserForm);
  const [newToken, setNewToken] = useState("");
  const [keyName, setKeyName] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const [keys, setKeys] = useState([]);
  const [access, setAccess] = useState([]);
  const [posts, setPosts] = useState([]);
  const [activity, setActivity] = useState([]);
  const [selectedTaskKey, setSelectedTaskKey] = useState("article");
  const [accessLimits, setAccessLimits] = useState(emptyAccessLimits);
  const [accessSearch, setAccessSearch] = useState("");
  const [accessSearchValue, setAccessSearchValue] = useState("");
  const [accessPage, setAccessPage] = useState(1);
  const [accessFilter, setAccessFilter] = useState("all");
  const [catalogSites, setCatalogSites] = useState([]);
  const [catalogMeta, setCatalogMeta] = useState({ page: 1, limit: 24, total: 0, totalPages: 1 });
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [selectedSiteIds, setSelectedSiteIds] = useState([]);

  const activeUsers = users.filter((user) => user.status === "ACTIVE").length;
  const suspendedUsers = users.filter((user) => user.status === "SUSPENDED").length;
  const totalKeys = users.reduce((sum, user) => sum + (user._count?.apiKeys || 0), 0);

  const accessKeyMap = useMemo(
    () => new Map(access.map((rule) => [`${rule.site?.id}:${rule.taskKey}`, rule])),
    [access]
  );

  const selectedUserStats = useMemo(
    () => ({
      activeKeys: keys.filter((key) => key.isActive).length,
      revokedKeys: keys.filter((key) => !key.isActive).length,
      accessRules: access.filter((rule) => rule.isActive).length,
      recentPosts: posts.length,
    }),
    [access, keys, posts]
  );

  const catalogRows = useMemo(() => {
    const rows = catalogSites.map((site) => {
      const rule = accessKeyMap.get(`${site.id}:${selectedTaskKey}`) || null;
      const isAdded = Boolean(rule?.isActive);
      return {
        site,
        rule,
        isAdded,
      };
    });

    if (accessFilter === "added") return rows.filter((row) => row.isAdded);
    if (accessFilter === "not-added") return rows.filter((row) => !row.isAdded);
    return rows;
  }, [accessFilter, accessKeyMap, catalogSites, selectedTaskKey]);

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
        fetchPanelUserAccess(user.id, { page: 1, limit: 250 }),
        fetchPanelUserPosts(user.id, { page: 1, limit: 50 }),
        fetchPanelUserActivity(user.id, { page: 1, limit: 50 }),
      ]);
      setKeys(keyRows);
      setAccess(accessRows.access);
      setPosts(postRows.posts);
      setActivity(activityRows.logs);
    } catch (error) {
      toast.error(error.message || "Failed to load user details");
    }
  };

  const loadCatalogSites = async () => {
    if (!selectedUser || activeTab !== "access") return;
    setCatalogLoading(true);
    try {
      const result = await searchSites({
        search: accessSearch,
        page: accessPage,
        limit: 24,
      });
      setCatalogSites(result.sites);
      setCatalogMeta(result.meta);
    } catch (error) {
      toast.error(error.message || "Failed to load sites");
    } finally {
      setCatalogLoading(false);
    }
  };

  useEffect(() => {
    loadUsers(1);
  }, []);

  useEffect(() => {
    if (!selectedUser) return;
    setNewToken("");
    setKeyName(`${selectedUser.name} API`);
    setSelectedSiteIds([]);
    loadUserDetail(selectedUser);
  }, [selectedUser?.id]);

  useEffect(() => {
    if (activeTab !== "access") return;
    loadCatalogSites();
  }, [activeTab, selectedUser?.id, accessSearch, accessPage, selectedTaskKey]);

  const handleCreateUser = async (event) => {
    event.preventDefault();
    try {
      const user = await createPanelUser(form);
      setForm(emptyUserForm);
      setSelectedUser(user);
      setShowCreateUser(false);
      setActiveTab("overview");
      await loadUsers(1);
      toast.success("User created");
    } catch (error) {
      toast.error(error.message || "Failed to create user");
    }
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;
    const confirmed = window.confirm(`Disable ${selectedUser.name} and revoke all active keys/access?`);
    if (!confirmed) return;

    try {
      const updated = await deletePanelUser(selectedUser.id);
      setSelectedUser(updated);
      await loadUsers(usersMeta.page);
      await loadUserDetail(updated);
      toast.success("User disabled and access revoked");
    } catch (error) {
      toast.error(error.message || "Failed to delete user");
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
      const issued = await issuePanelUserKey(selectedUser.id, {
        name: keyName.trim() || `${selectedUser.name} API`,
      });
      setNewToken(issued.rawApiKey);
      setActiveTab("keys");
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
      setNewToken("");
      await loadUserDetail(selectedUser);
      toast.success("Key revoked");
    } catch (error) {
      toast.error(error.message || "Failed to revoke key");
    }
  };

  const handleCopyToken = async () => {
    if (!newToken) return;
    await navigator.clipboard.writeText(newToken);
    toast.success("Token copied");
  };

  const applyAccessRules = async (siteIds, isActive) => {
    if (!selectedUser) return;
    if (!siteIds.length) {
      toast.error("Select at least one site first");
      return;
    }

    const rules = siteIds.map((siteId) => ({
      siteId,
      taskKey: selectedTaskKey,
      canRead: true,
      canPost: true,
      canEdit: true,
      canDelete: true,
      isActive,
      perMinuteLimit: accessLimits.perMinuteLimit || undefined,
      dailyLimit: accessLimits.dailyLimit || undefined,
      totalLimit: accessLimits.totalLimit || undefined,
    }));

    try {
      await updatePanelUserAccess(selectedUser.id, rules);
      await loadUserDetail(selectedUser);
      setSelectedSiteIds([]);
      toast.success(isActive ? "Site access assigned" : "Site access removed");
    } catch (error) {
      toast.error(error.message || "Failed to update user access");
    }
  };

  const toggleSelectedSite = (siteId, checked) => {
    setSelectedSiteIds((current) => {
      if (checked) return Array.from(new Set([...current, siteId]));
      return current.filter((id) => id !== siteId);
    });
  };

  const toggleSelectAllVisible = () => {
    const visibleIds = catalogRows.map((row) => row.site.id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedSiteIds.includes(id));
    setSelectedSiteIds((current) => {
      if (allVisibleSelected) return current.filter((id) => !visibleIds.includes(id));
      return Array.from(new Set([...current, ...visibleIds]));
    });
  };

  const selectedStatusTone =
    selectedUser?.status === "ACTIVE"
      ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200"
      : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200";

  const allVisibleSelected =
    catalogRows.length > 0 && catalogRows.every((row) => selectedSiteIds.includes(row.site.id));

  return (
    <div className="flex h-full min-h-0 flex-col gap-5 overflow-hidden">
      <div className="rounded-3xl border border-[var(--border-color)] bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-5 text-white shadow-xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-blue-100">
              <ShieldCheck size={14} /> User API Control
            </div>
            <h1 className="mt-3 text-2xl font-bold">Users & Access</h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-300">
              Manage users, give site access in bulk, track who created posts, and revoke safely without breaking legacy site tokens.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-slate-950"
              onClick={() => setShowCreateUser((current) => !current)}
            >
              <UserPlus size={16} /> {showCreateUser ? "Close Add User" : "Add User"}
            </button>
            <button
              type="button"
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 text-sm font-semibold text-white hover:bg-white/15"
              onClick={() => loadUsers(usersMeta.page)}
            >
              <RefreshCw size={16} className={loadingUsers ? "animate-spin" : ""} /> Refresh
            </button>
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">Total Users</p>
            <p className="mt-2 text-2xl font-bold">{usersMeta.total}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">Active</p>
            <p className="mt-2 text-2xl font-bold">{activeUsers}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">Suspended</p>
            <p className="mt-2 text-2xl font-bold">{suspendedUsers}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">API Keys</p>
            <p className="mt-2 text-2xl font-bold">{totalKeys}</p>
          </div>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 xl:grid-cols-[420px_1fr]">
        <section className="flex min-h-0 flex-col overflow-hidden rounded-3xl border border-[var(--border-color)] bg-[var(--bg-secondary)] shadow-sm">
          <div className="border-b border-[var(--border-color)] p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-bold">User Directory</h2>
                <p className="text-xs text-[var(--text-secondary)]">Search, select, and manage API users.</p>
              </div>
              <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800 dark:bg-blue-950 dark:text-blue-200">
                {users.length} shown
              </span>
            </div>

            <div className="grid gap-2">
              <div className="flex min-h-11 items-center gap-2 rounded-2xl border border-[var(--border-color)] px-3">
                <Search size={16} className="text-[var(--text-secondary)]" />
                <input
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                  placeholder="Search by name or email"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && loadUsers(1)}
                />
              </div>
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <select
                  className="min-h-11 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 text-sm"
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                >
                  <option value="all">All statuses</option>
                  <option value="ACTIVE">Active</option>
                  <option value="SUSPENDED">Suspended</option>
                  <option value="DISABLED">Disabled</option>
                </select>
                <button
                  className="min-h-11 rounded-2xl bg-slate-950 px-5 text-sm font-semibold text-white disabled:opacity-60"
                  onClick={() => loadUsers(1)}
                  disabled={loadingUsers}
                >
                  Apply
                </button>
              </div>
            </div>
          </div>

          {showCreateUser ? (
            <div className="border-b border-[var(--border-color)] bg-[var(--bg-primary)] p-4">
              <form className="space-y-3" onSubmit={handleCreateUser}>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold">Add New User</h3>
                  <button
                    type="button"
                    className="rounded-full p-1 text-[var(--text-secondary)] hover:bg-slate-100 dark:hover:bg-slate-900"
                    onClick={() => setShowCreateUser(false)}
                  >
                    <X size={16} />
                  </button>
                </div>
                <input
                  className="min-h-11 w-full rounded-2xl border border-[var(--border-color)] bg-transparent px-3 text-sm"
                  placeholder="Full name"
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                />
                <input
                  className="min-h-11 w-full rounded-2xl border border-[var(--border-color)] bg-transparent px-3 text-sm"
                  placeholder="Email"
                  value={form.email}
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                />
                <textarea
                  className="min-h-20 w-full rounded-2xl border border-[var(--border-color)] bg-transparent px-3 py-2 text-sm"
                  placeholder="Admin notes optional"
                  value={form.notes}
                  onChange={(event) => setForm({ ...form, notes: event.target.value })}
                />
                <div className="grid grid-cols-3 gap-2">
                  <input
                    className="min-h-10 rounded-xl border border-[var(--border-color)] bg-transparent px-2 text-xs"
                    placeholder="/min"
                    value={form.rateLimitPerMinute}
                    onChange={(event) => setForm({ ...form, rateLimitPerMinute: event.target.value })}
                  />
                  <input
                    className="min-h-10 rounded-xl border border-[var(--border-color)] bg-transparent px-2 text-xs"
                    placeholder="/day"
                    value={form.dailyPostLimit}
                    onChange={(event) => setForm({ ...form, dailyPostLimit: event.target.value })}
                  />
                  <input
                    className="min-h-10 rounded-xl border border-[var(--border-color)] bg-transparent px-2 text-xs"
                    placeholder="total"
                    value={form.totalPostLimit}
                    onChange={(event) => setForm({ ...form, totalPostLimit: event.target.value })}
                  />
                </div>
                <button
                  type="submit"
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 text-sm font-semibold text-white"
                >
                  <Plus size={16} /> Create User
                </button>
              </form>
            </div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {users.map((user) => {
              const isSelected = selectedUser?.id === user.id;
              return (
                <button
                  key={user.id}
                  type="button"
                  className={`mb-3 w-full rounded-2xl border p-4 text-left transition ${
                    isSelected
                      ? "border-blue-500 bg-blue-50 shadow-sm dark:bg-blue-950/30"
                      : "border-[var(--border-color)] hover:border-blue-300 hover:bg-slate-50 dark:hover:bg-slate-900/50"
                  }`}
                  onClick={() => {
                    setSelectedUser(user);
                    setActiveTab("overview");
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-sm font-bold text-white">
                      {user.name?.slice(0, 1)?.toUpperCase() || "U"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-semibold">{user.name}</span>
                        <span
                          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                            user.status === "ACTIVE"
                              ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200"
                              : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200"
                          }`}
                        >
                          {user.status}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-xs text-[var(--text-secondary)]">{user.email}</p>
                      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-[var(--text-secondary)]">
                        <span className="rounded-full border border-[var(--border-color)] px-2 py-1">
                          {user._count?.apiKeys || 0} keys
                        </span>
                        <span className="rounded-full border border-[var(--border-color)] px-2 py-1">
                          {user._count?.accessRules || 0} rules
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
            {!users.length && <EmptyState title="No users found" description="Create a user or adjust your filters." />}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-[var(--border-color)] p-3 text-xs text-[var(--text-secondary)]">
            <button
              className="rounded-xl border border-[var(--border-color)] px-3 py-2 disabled:opacity-50"
              disabled={usersMeta.page <= 1}
              onClick={() => loadUsers(usersMeta.page - 1)}
            >
              Previous
            </button>
            <span>
              Page {usersMeta.page} of {usersMeta.totalPages}
            </span>
            <button
              className="rounded-xl border border-[var(--border-color)] px-3 py-2 disabled:opacity-50"
              disabled={usersMeta.page >= usersMeta.totalPages}
              onClick={() => loadUsers(usersMeta.page + 1)}
            >
              Next
            </button>
          </div>
        </section>

        <section className="min-h-0 overflow-y-auto rounded-3xl border border-[var(--border-color)] bg-[var(--bg-secondary)] shadow-sm">
          {!selectedUser ? (
            <div className="p-5">
              <EmptyState title="Select or create a user" description="User details, access, keys, posts, and activity will appear here." />
            </div>
          ) : (
            <div className="space-y-5 p-5">
              <div className="rounded-3xl border border-[var(--border-color)] bg-[var(--bg-primary)] p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-slate-950 text-xl font-bold text-white">
                      {selectedUser.name?.slice(0, 1)?.toUpperCase() || "U"}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-xl font-bold">{selectedUser.name}</h2>
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${selectedStatusTone}`}>
                          {selectedUser.status}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-[var(--text-secondary)]">{selectedUser.email}</p>
                      <p className="mt-2 text-xs text-[var(--text-secondary)]">Created {formatDate(selectedUser.createdAt)}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[var(--border-color)] px-4 text-sm font-semibold"
                      onClick={handleToggleUser}
                    >
                      {selectedUser.status === "ACTIVE" ? <PauseCircle size={16} /> : <PlayCircle size={16} />}
                      {selectedUser.status === "ACTIVE" ? "Suspend user" : "Activate user"}
                    </button>
                    <button
                      className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-red-200 px-4 text-sm font-semibold text-red-700 dark:border-red-900 dark:text-red-300"
                      onClick={handleDeleteUser}
                    >
                      <Trash2 size={16} /> Disable user
                    </button>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <StatCard label="Active Keys" value={selectedUserStats.activeKeys} tone="green" />
                  <StatCard label="Revoked Keys" value={selectedUserStats.revokedKeys} tone="amber" />
                  <StatCard label="Access Rules" value={selectedUserStats.accessRules} tone="blue" />
                  <StatCard label="Recent Posts" value={selectedUserStats.recentPosts} />
                </div>
              </div>

              <div className="overflow-x-auto rounded-3xl border border-[var(--border-color)] bg-[var(--bg-primary)] p-2">
                <div className="flex min-w-max gap-2">
                  {TABS.map((tab) => {
                    const Icon = tab.icon;
                    const active = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        className={`inline-flex min-h-11 items-center gap-2 rounded-2xl px-4 text-sm font-semibold transition ${
                          active
                            ? "bg-slate-950 text-white"
                            : "text-[var(--text-secondary)] hover:bg-slate-100 dark:hover:bg-slate-900"
                        }`}
                        onClick={() => setActiveTab(tab.id)}
                      >
                        <Icon size={16} /> {tab.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {activeTab === "overview" ? (
                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="rounded-3xl border border-[var(--border-color)] bg-[var(--bg-primary)] p-5">
                    <h3 className="font-bold">User Policy</h3>
                    <div className="mt-4 grid gap-3">
                      <div className="rounded-2xl border border-[var(--border-color)] p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)]">Per Minute</p>
                        <p className="mt-1 text-xl font-bold">{metricValue(selectedUser.rateLimitPerMinute)}</p>
                      </div>
                      <div className="rounded-2xl border border-[var(--border-color)] p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)]">Daily Posts</p>
                        <p className="mt-1 text-xl font-bold">{metricValue(selectedUser.dailyPostLimit)}</p>
                      </div>
                      <div className="rounded-2xl border border-[var(--border-color)] p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)]">Total Posts</p>
                        <p className="mt-1 text-xl font-bold">{metricValue(selectedUser.totalPostLimit)}</p>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-3xl border border-[var(--border-color)] bg-[var(--bg-primary)] p-5">
                    <h3 className="font-bold">Operational Rules</h3>
                    <div className="mt-4 space-y-3 text-sm">
                      <div className="flex gap-3 rounded-2xl border border-green-200 bg-green-50 p-4 text-green-950 dark:border-green-900 dark:bg-green-950/30 dark:text-green-100">
                        <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
                        <p>New user token works only on the exact site and task combinations you assign here.</p>
                      </div>
                      <div className="flex gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-blue-950 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100">
                        <ShieldCheck size={18} className="mt-0.5 shrink-0" />
                        <p>Legacy site tokens continue to work separately, so your current posting flows stay intact.</p>
                      </div>
                      <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
                        <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                        <p>Raw API token is shown one time only after issuing. Existing and revoked keys never expose the token again.</p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {activeTab === "keys" ? (
                <div className="space-y-4">
                  <div className="rounded-3xl border border-[var(--border-color)] bg-[var(--bg-primary)] p-5">
                    <div className="flex flex-wrap items-end gap-3">
                      <label className="min-w-[240px] flex-1 text-xs text-[var(--text-secondary)]">
                        <span className="mb-1 block font-semibold uppercase tracking-wide">New Key Name</span>
                        <input
                          className="min-h-11 w-full rounded-2xl border border-[var(--border-color)] bg-transparent px-3 text-sm"
                          value={keyName}
                          onChange={(event) => setKeyName(event.target.value)}
                          placeholder="Production API"
                        />
                      </label>
                      <button
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 text-sm font-semibold text-white"
                        onClick={handleIssueKey}
                      >
                        <KeyRound size={16} /> Issue New Key
                      </button>
                    </div>
                    {newToken ? (
                      <div className="mt-4 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-950 dark:border-green-900 dark:bg-green-950/30 dark:text-green-100">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-bold">One-time API token generated</div>
                            <p className="mt-1 text-xs opacity-80">
                              Save this now. For security, existing and revoked keys never reveal the raw token again.
                            </p>
                          </div>
                          <button className="rounded-full p-1 hover:bg-green-100 dark:hover:bg-green-900" onClick={() => setNewToken("")}>
                            <X size={16} />
                          </button>
                        </div>
                        <div className="mt-3 flex gap-2">
                          <code className="min-w-0 flex-1 overflow-x-auto rounded-xl bg-white px-3 py-2 text-xs text-slate-950">
                            {newToken}
                          </code>
                          <button className="inline-flex items-center gap-2 rounded-xl bg-green-700 px-4 text-white" onClick={handleCopyToken}>
                            <Copy size={16} /> Copy
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="rounded-3xl border border-[var(--border-color)] bg-[var(--bg-primary)] p-5">
                    <h3 className="font-bold">Issued Keys</h3>
                    <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--border-color)]">
                      {keys.length ? (
                        keys.map((key) => (
                          <div key={key.id} className="grid gap-3 border-b border-[var(--border-color)] p-4 last:border-b-0 md:grid-cols-[1fr_auto]">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-semibold">{key.name}</span>
                                <span
                                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                                    key.isActive
                                      ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200"
                                      : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                                  }`}
                                >
                                  {key.isActive ? "Active" : "Revoked / Inactive"}
                                </span>
                              </div>
                              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                                Created {formatDate(key.createdAt)} • Last used {formatDate(key.lastUsedAt)}
                              </p>
                            </div>
                            <button
                              className="inline-flex min-h-10 items-center justify-center rounded-xl border border-red-200 px-4 text-sm font-semibold text-red-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900 dark:text-red-300"
                              onClick={() => handleRevokeKey(key)}
                              disabled={!key.isActive}
                            >
                              Revoke
                            </button>
                          </div>
                        ))
                      ) : (
                        <EmptyState title="No user keys yet" description="Issue a key only when the user is ready to post." />
                      )}
                    </div>
                  </div>
                </div>
              ) : null}

              {activeTab === "access" ? (
                <div className="space-y-4">
                  <div className="rounded-3xl border border-[var(--border-color)] bg-[var(--bg-primary)] p-5">
                    <div className="flex flex-wrap items-end justify-between gap-3">
                      <div>
                        <h3 className="font-bold">Site Assignment Workspace</h3>
                        <p className="mt-1 text-sm text-[var(--text-secondary)]">
                          Browse all sites, filter `added` / `not added`, search by domain, and bulk assign or remove access for the selected task.
                        </p>
                      </div>
                      <div className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800 dark:bg-blue-950 dark:text-blue-200">
                        {selectedSiteIds.length} selected
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 xl:grid-cols-[1.1fr_220px_180px_auto]">
                      <label className="text-xs text-[var(--text-secondary)]">
                        <span className="mb-1 block font-semibold uppercase tracking-wide">Search Sites</span>
                        <div className="flex gap-2">
                          <div className="flex min-h-11 flex-1 items-center gap-2 rounded-2xl border border-[var(--border-color)] px-3">
                            <Search size={16} className="text-[var(--text-secondary)]" />
                            <input
                              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                              value={accessSearchValue}
                              onChange={(event) => setAccessSearchValue(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  setAccessSearch(accessSearchValue.trim());
                                  setAccessPage(1);
                                }
                              }}
                              placeholder="Search by domain, name, or code"
                            />
                          </div>
                          <button
                            className="min-h-11 rounded-2xl border border-[var(--border-color)] px-4 text-sm font-semibold"
                            onClick={() => {
                              setAccessSearch(accessSearchValue.trim());
                              setAccessPage(1);
                            }}
                          >
                            Apply
                          </button>
                        </div>
                      </label>
                      <label className="text-xs text-[var(--text-secondary)]">
                        <span className="mb-1 block font-semibold uppercase tracking-wide">Task</span>
                        <select
                          className="min-h-11 w-full rounded-2xl border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 text-sm"
                          value={selectedTaskKey}
                          onChange={(event) => {
                            setSelectedTaskKey(event.target.value);
                            setSelectedSiteIds([]);
                          }}
                        >
                          {TASK_OPTIONS.map((task) => (
                            <option key={task} value={task}>
                              {task}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs text-[var(--text-secondary)]">
                        <span className="mb-1 block font-semibold uppercase tracking-wide">Filter</span>
                        <select
                          className="min-h-11 w-full rounded-2xl border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 text-sm"
                          value={accessFilter}
                          onChange={(event) => setAccessFilter(event.target.value)}
                        >
                          <option value="all">All Sites</option>
                          <option value="added">Added</option>
                          <option value="not-added">Not Added</option>
                        </select>
                      </label>
                      <button
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-[var(--border-color)] px-4 text-sm font-semibold"
                        onClick={toggleSelectAllVisible}
                      >
                        {allVisibleSelected ? "Unselect Visible" : "Select Visible"}
                      </button>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <input
                        className="min-h-10 rounded-xl border border-[var(--border-color)] bg-transparent px-3 text-sm"
                        placeholder="/min limit"
                        value={accessLimits.perMinuteLimit}
                        onChange={(event) => setAccessLimits((current) => ({ ...current, perMinuteLimit: event.target.value }))}
                      />
                      <input
                        className="min-h-10 rounded-xl border border-[var(--border-color)] bg-transparent px-3 text-sm"
                        placeholder="/day limit"
                        value={accessLimits.dailyLimit}
                        onChange={(event) => setAccessLimits((current) => ({ ...current, dailyLimit: event.target.value }))}
                      />
                      <input
                        className="min-h-10 rounded-xl border border-[var(--border-color)] bg-transparent px-3 text-sm"
                        placeholder="total limit"
                        value={accessLimits.totalLimit}
                        onChange={(event) => setAccessLimits((current) => ({ ...current, totalLimit: event.target.value }))}
                      />
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-blue-600 px-4 text-sm font-semibold text-white"
                        onClick={() => applyAccessRules(selectedSiteIds, true)}
                      >
                        <Save size={16} /> Assign Selected
                      </button>
                      <button
                        className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-red-200 px-4 text-sm font-semibold text-red-700 dark:border-red-900 dark:text-red-300"
                        onClick={() => applyAccessRules(selectedSiteIds, false)}
                      >
                        <Trash2 size={16} /> Remove Selected
                      </button>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-[var(--border-color)] bg-[var(--bg-primary)] p-5">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <h3 className="font-bold">Site Catalog</h3>
                      <div className="text-xs text-[var(--text-secondary)]">
                        Page {catalogMeta.page || 1} of {catalogMeta.totalPages || 1} • {catalogMeta.total || 0} total sites
                      </div>
                    </div>

                    {catalogLoading ? (
                      <EmptyState title="Loading sites..." description="Pulling searchable site catalog from the database." />
                    ) : (
                      <div className="grid gap-3 lg:grid-cols-2">
                        {catalogRows.map((row) => {
                          const checked = selectedSiteIds.includes(row.site.id);
                          const taskList = Array.isArray(row.site.supportedTasks) ? row.site.supportedTasks : [];
                          return (
                            <div
                              key={row.site.id}
                              className={`rounded-2xl border p-4 transition ${
                                checked ? "border-blue-500 bg-blue-50 dark:bg-blue-950/20" : "border-[var(--border-color)]"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={(event) => toggleSelectedSite(row.site.id, event.target.checked)}
                                    />
                                    <p className="truncate font-semibold">{row.site.name}</p>
                                  </div>
                                  <p className="mt-1 truncate text-xs text-[var(--text-secondary)]">
                                    {row.site.code} • {row.site.domain || row.site.url || "No domain saved"}
                                  </p>
                                </div>
                                <span
                                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                    row.isAdded
                                      ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200"
                                      : "bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300"
                                  }`}
                                >
                                  {row.isAdded ? "Added" : "Not Added"}
                                </span>
                              </div>

                              <div className="mt-3 flex flex-wrap gap-2">
                                {taskList.slice(0, 6).map((task) => (
                                  <span key={task} className="rounded-full border border-[var(--border-color)] px-2 py-1 text-[11px] text-[var(--text-secondary)]">
                                    {task}
                                  </span>
                                ))}
                                {!taskList.length ? (
                                  <span className="rounded-full border border-[var(--border-color)] px-2 py-1 text-[11px] text-[var(--text-secondary)]">
                                    No supported tasks saved
                                  </span>
                                ) : null}
                              </div>

                              <div className="mt-4 flex flex-wrap gap-2">
                                <button
                                  className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white"
                                  onClick={() => applyAccessRules([row.site.id], true)}
                                >
                                  Add {selectedTaskKey}
                                </button>
                                <button
                                  className="rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 dark:border-red-900 dark:text-red-300"
                                  onClick={() => applyAccessRules([row.site.id], false)}
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                          );
                        })}

                        {!catalogRows.length ? (
                          <div className="lg:col-span-2">
                            <EmptyState title="No sites match this filter" description="Try a different search, task, or added/not-added filter." />
                          </div>
                        ) : null}
                      </div>
                    )}

                    <div className="mt-4 flex items-center justify-between gap-3 text-xs text-[var(--text-secondary)]">
                      <button
                        className="rounded-xl border border-[var(--border-color)] px-3 py-2 disabled:opacity-50"
                        disabled={(catalogMeta.page || 1) <= 1}
                        onClick={() => setAccessPage((current) => Math.max(current - 1, 1))}
                      >
                        Previous
                      </button>
                      <span>
                        Page {catalogMeta.page || 1} of {catalogMeta.totalPages || 1}
                      </span>
                      <button
                        className="rounded-xl border border-[var(--border-color)] px-3 py-2 disabled:opacity-50"
                        disabled={(catalogMeta.page || 1) >= (catalogMeta.totalPages || 1)}
                        onClick={() => setAccessPage((current) => current + 1)}
                      >
                        Next
                      </button>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-[var(--border-color)] bg-[var(--bg-primary)] p-5">
                    <h3 className="font-bold">Assigned Access Rules</h3>
                    <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--border-color)]">
                      {access.length ? (
                        access.map((rule) => (
                          <div key={rule.id} className="grid gap-3 border-b border-[var(--border-color)] p-4 last:border-b-0 xl:grid-cols-[1.1fr_0.7fr_0.8fr_auto_auto]">
                            <div>
                              <p className="font-semibold">{rule.site?.name}</p>
                              <p className="text-xs text-[var(--text-secondary)]">{rule.site?.code}</p>
                            </div>
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)]">Task</p>
                              <p className="mt-1 font-semibold">{rule.taskKey}</p>
                            </div>
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)]">Limits</p>
                              <p className="mt-1 text-sm">
                                {metricValue(rule.perMinuteLimit, "∞")}/min • {metricValue(rule.dailyLimit, "∞")}/day
                              </p>
                            </div>
                            <span
                              className={`h-fit rounded-full px-3 py-1 text-xs font-semibold ${
                                rule.isActive
                                  ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200"
                                  : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                              }`}
                            >
                              {rule.isActive ? "Active" : "Inactive"}
                            </span>
                            <button
                              className="rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 dark:border-red-900 dark:text-red-300"
                              onClick={() => applyAccessRules([rule.site.id], false)}
                            >
                              Remove
                            </button>
                          </div>
                        ))
                      ) : (
                        <EmptyState title="No access assigned" description="Assign sites from the catalog above." />
                      )}
                    </div>
                  </div>
                </div>
              ) : null}

              {activeTab === "posts" ? (
                <div className="rounded-3xl border border-[var(--border-color)] bg-[var(--bg-primary)] p-5">
                  <h3 className="font-bold">Posts Created By This User</h3>
                  <div className="mt-4 space-y-3">
                    {posts.length ? (
                      posts.map((post) => (
                        <div key={post.id} className="rounded-2xl border border-[var(--border-color)] p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="line-clamp-2 font-semibold">{post.title}</p>
                              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                                {post.siteName} • {post.taskType} • {formatDate(post.date)}
                              </p>
                              <p className="mt-2 text-xs text-[var(--text-secondary)]">
                                Created by {post.createdByUser?.name || "Unknown user"} via {post.createdByApiKey?.name || "Unknown key"}
                              </p>
                            </div>
                            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-900 dark:text-slate-200">
                              {post.status || "published"}
                            </span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <EmptyState title="No posts yet" description="Once this user's key posts content, it will appear here." />
                    )}
                  </div>
                </div>
              ) : null}

              {activeTab === "activity" ? (
                <div className="rounded-3xl border border-[var(--border-color)] bg-[var(--bg-primary)] p-5">
                  <h3 className="font-bold">Activity Log</h3>
                  <div className="mt-4 space-y-3">
                    {activity.length ? (
                      activity.map((log) => (
                        <div key={log.id} className="rounded-2xl border border-[var(--border-color)] p-4">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className="font-semibold">{log.action}</p>
                              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                                {log.site?.code || "no-site"} • {log.taskKey || "any"} • {formatDate(log.createdAt)}
                              </p>
                            </div>
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                log.status === "SUCCESS"
                                  ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200"
                                  : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200"
                              }`}
                            >
                              {log.status}
                            </span>
                          </div>
                          {log.errorMessage ? <p className="mt-2 text-xs text-red-600">{log.errorMessage}</p> : null}
                        </div>
                      ))
                    ) : (
                      <EmptyState title="No activity yet" description="API calls, edits, and deletes by this user will be tracked here." />
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
