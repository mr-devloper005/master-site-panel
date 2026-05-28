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
  UserRound,
  X,
} from "lucide-react";

import RemoteSiteSelect from "../components/ui/RemoteSiteSelect";
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
  const [form, setForm] = useState(emptyUserForm);
  const [newToken, setNewToken] = useState("");
  const [keyName, setKeyName] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const [keys, setKeys] = useState([]);
  const [access, setAccess] = useState([]);
  const [posts, setPosts] = useState([]);
  const [activity, setActivity] = useState([]);
  const [selectedAccessSite, setSelectedAccessSite] = useState(null);
  const [accessDraft, setAccessDraft] = useState({
    siteId: "",
    taskKey: "article",
    perMinuteLimit: "",
    dailyLimit: "",
    totalLimit: "",
  });

  const activeUsers = users.filter((user) => user.status === "ACTIVE").length;
  const suspendedUsers = users.filter((user) => user.status === "SUSPENDED").length;
  const totalKeys = users.reduce((sum, user) => sum + (user._count?.apiKeys || 0), 0);

  const selectedSite = selectedAccessSite;

  const selectedUserStats = useMemo(
    () => ({
      activeKeys: keys.filter((key) => key.isActive).length,
      revokedKeys: keys.filter((key) => !key.isActive).length,
      accessRules: access.filter((rule) => rule.isActive).length,
      recentPosts: posts.length,
    }),
    [access, keys, posts]
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
    if (!selectedUser) return;
    setNewToken("");
    setKeyName(`${selectedUser.name} API`);
    loadUserDetail(selectedUser);
  }, [selectedUser?.id]);

  const handleCreateUser = async (event) => {
    event.preventDefault();
    try {
      const user = await createPanelUser(form);
      setForm(emptyUserForm);
      setSelectedUser(user);
      setActiveTab("overview");
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
      setActiveTab("access");
      toast.success("Access assigned");
    } catch (error) {
      toast.error(error.message || "Failed to assign access");
    }
  };

  const selectedStatusTone =
    selectedUser?.status === "ACTIVE"
      ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200"
      : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200";

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
              Create user-owned API keys, assign allowed sites/tasks, monitor activity, and revoke access without touching legacy site tokens.
            </p>
          </div>
          <button
            type="button"
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 text-sm font-semibold text-white hover:bg-white/15"
            onClick={() => loadUsers(usersMeta.page)}
          >
            <RefreshCw size={16} className={loadingUsers ? "animate-spin" : ""} /> Refresh
          </button>
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
                      <p className="mt-2 text-xs text-[var(--text-secondary)]">
                        Created {formatDate(selectedUser.createdAt)}
                      </p>
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
                      className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white"
                      onClick={() => setActiveTab("keys")}
                    >
                      <KeyRound size={16} /> Manage keys
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

              <div className="grid gap-5 2xl:grid-cols-[360px_1fr]">
                <aside className="space-y-5">
                  <div className="rounded-3xl border border-[var(--border-color)] bg-[var(--bg-primary)] p-4">
                    <h3 className="flex items-center gap-2 font-bold">
                      <UserRound size={18} /> Create New User
                    </h3>
                    <p className="mt-1 text-xs text-[var(--text-secondary)]">
                      Create once, then assign only selected sites/tasks.
                    </p>
                    <form className="mt-4 space-y-3" onSubmit={handleCreateUser}>
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
                        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-semibold text-white"
                      >
                        <Plus size={16} /> Create User
                      </button>
                    </form>
                  </div>

                  <div className="rounded-3xl border border-[var(--border-color)] bg-[var(--bg-primary)] p-4">
                    <h3 className="flex items-center gap-2 font-bold">
                      <ShieldCheck size={18} /> Assign Access
                    </h3>
                    <p className="mt-1 text-xs text-[var(--text-secondary)]">
                      Access is site + task scoped. Legacy site keys are not changed.
                    </p>
                    <div className="mt-4 space-y-3">
                      <RemoteSiteSelect
                        label="Site"
                        value={accessDraft.siteId}
                        onChange={(value) => setAccessDraft({ ...accessDraft, siteId: value })}
                        onSiteChange={setSelectedAccessSite}
                        placeholder="Choose site"
                        searchPlaceholder="Search by domain, name, or code"
                      />
                      <label className="block text-xs text-[var(--text-secondary)]">
                        <span className="mb-1 block font-semibold uppercase tracking-wide">Task</span>
                        <select
                          className="min-h-11 w-full rounded-2xl border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 text-sm"
                          value={accessDraft.taskKey}
                          onChange={(event) => setAccessDraft({ ...accessDraft, taskKey: event.target.value })}
                        >
                          {(selectedSite?.supportedTasks?.length ? selectedSite.supportedTasks : TASK_OPTIONS).map((task) => (
                            <option key={task} value={task}>
                              {task}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        <input
                          className="min-h-10 rounded-xl border border-[var(--border-color)] bg-transparent px-2 text-xs"
                          placeholder="/min"
                          value={accessDraft.perMinuteLimit}
                          onChange={(event) => setAccessDraft({ ...accessDraft, perMinuteLimit: event.target.value })}
                        />
                        <input
                          className="min-h-10 rounded-xl border border-[var(--border-color)] bg-transparent px-2 text-xs"
                          placeholder="/day"
                          value={accessDraft.dailyLimit}
                          onChange={(event) => setAccessDraft({ ...accessDraft, dailyLimit: event.target.value })}
                        />
                        <input
                          className="min-h-10 rounded-xl border border-[var(--border-color)] bg-transparent px-2 text-xs"
                          placeholder="total"
                          value={accessDraft.totalLimit}
                          onChange={(event) => setAccessDraft({ ...accessDraft, totalLimit: event.target.value })}
                        />
                      </div>
                      <button
                        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 text-sm font-semibold text-white"
                        onClick={handleAssignAccess}
                      >
                        <Save size={16} /> Save Access Rule
                      </button>
                    </div>
                  </div>
                </aside>

                <main className="min-w-0 space-y-5">
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

                  {activeTab === "overview" && (
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
                            <p>New user token works only on assigned site + task combinations.</p>
                          </div>
                          <div className="flex gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-blue-950 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100">
                            <ShieldCheck size={18} className="mt-0.5 shrink-0" />
                            <p>Legacy site tokens continue working separately, so current posting integrations are safe.</p>
                          </div>
                          <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
                            <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                            <p>Raw API token is shown one time only after issuing. It is hidden forever after refresh/revoke.</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTab === "keys" && (
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
                  )}

                  {activeTab === "access" && (
                    <div className="rounded-3xl border border-[var(--border-color)] bg-[var(--bg-primary)] p-5">
                      <h3 className="font-bold">Assigned Access Rules</h3>
                      <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--border-color)]">
                        {access.length ? (
                          access.map((rule) => (
                            <div key={rule.id} className="grid gap-3 border-b border-[var(--border-color)] p-4 last:border-b-0 lg:grid-cols-[1.2fr_1fr_1fr_auto]">
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
                            </div>
                          ))
                        ) : (
                          <EmptyState title="No access assigned" description="Assign at least one site and task before giving a user token." />
                        )}
                      </div>
                    </div>
                  )}

                  {activeTab === "posts" && (
                    <div className="rounded-3xl border border-[var(--border-color)] bg-[var(--bg-primary)] p-5">
                      <h3 className="font-bold">Recent Posts Created By This User</h3>
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
                  )}

                  {activeTab === "activity" && (
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
                  )}
                </main>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
