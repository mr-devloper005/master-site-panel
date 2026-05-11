import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Mail, RefreshCw, Search, Send, UserRound } from "lucide-react";

import { useAppData } from "../context/AppContext";
import { fetchContactSubmissions, updateContactSubmission, updateSite } from "../utils/api";

const statuses = ["NEW", "READ", "REPLIED", "ARCHIVED", "SPAM"];

const formatDate = (value) => {
  if (!value) return "-";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
};

export default function ContactRequests() {
  const { sites, hydrate } = useAppData();
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 1 });
  const [filters, setFilters] = useState({ siteCode: "", status: "", search: "" });
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [settingsSiteId, setSettingsSiteId] = useState("");
  const [notifyEmail, setNotifyEmail] = useState("");

  const selectedSettingsSite = useMemo(
    () => sites.find((site) => site.id === settingsSiteId),
    [settingsSiteId, sites]
  );

  const load = async (page = pagination.page) => {
    setLoading(true);
    try {
      const response = await fetchContactSubmissions({ ...filters, page, limit: pagination.limit });
      setItems(response.items || []);
      setPagination(response.pagination || { page, limit: pagination.limit, total: 0, totalPages: 1 });
      setSelected((current) => {
        if (!current) return null;
        return response.items?.find((item) => item.id === current.id) || current;
      });
    } catch (error) {
      toast.error(error.message || "Failed to load contact requests");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.siteCode, filters.status]);

  useEffect(() => {
    if (!settingsSiteId && sites.length) {
      const first = sites[0];
      setSettingsSiteId(first.id);
      setNotifyEmail(first.raw?.config?.contact?.notifyEmail || "");
    }
  }, [settingsSiteId, sites]);

  useEffect(() => {
    if (selectedSettingsSite) {
      setNotifyEmail(selectedSettingsSite.raw?.config?.contact?.notifyEmail || "");
    }
  }, [selectedSettingsSite]);

  const saveNotificationSettings = async () => {
    if (!selectedSettingsSite) return;
    const config = selectedSettingsSite.raw?.config || {};
    const email = notifyEmail.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Valid notification email required");
      return;
    }

    await updateSite(selectedSettingsSite.id, {
      config: {
        ...config,
        contact: {
          ...(config.contact || {}),
          enabled: true,
          notifyEmail: email || undefined,
        },
      },
    });
    await hydrate();
    toast.success("Contact notification email saved");
  };

  const setStatus = async (submission, status) => {
    try {
      const updated = await updateContactSubmission(submission.id, { status });
      setItems((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setSelected((current) => (current?.id === updated.id ? updated : current));
      toast.success(`Marked as ${status.toLowerCase()}`);
    } catch (error) {
      toast.error(error.message || "Failed to update status");
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold">Contact Requests</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Central inbox for all site contact forms and notification email settings.
          </p>
        </div>
        <button
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm"
          onClick={() => load()}
          disabled={loading}
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      <section className="glass rounded-panel p-4">
        <h2 className="text-sm font-semibold">Notification Settings</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <select
            className="rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm"
            value={settingsSiteId}
            onChange={(e) => setSettingsSiteId(e.target.value)}
          >
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name} ({site.code})
              </option>
            ))}
          </select>
          <input
            className="rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm"
            value={notifyEmail}
            onChange={(e) => setNotifyEmail(e.target.value)}
            placeholder="owner@example.com"
          />
          <button className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white" onClick={saveNotificationSettings}>
            <Send size={15} />
            Save Email
          </button>
        </div>
      </section>

      <section className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
        <div className="glass rounded-panel flex min-h-0 flex-col overflow-hidden">
          <div className="grid gap-3 border-b border-[var(--border-color)] p-4 md:grid-cols-[1fr_180px_180px_auto]">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[var(--text-secondary)]" />
              <input
                className="w-full rounded-lg border border-[var(--border-color)] py-2 pl-9 pr-3 text-sm"
                value={filters.search}
                onChange={(e) => setFilters((current) => ({ ...current, search: e.target.value }))}
                placeholder="Search name, email, message"
              />
            </label>
            <select
              className="rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm"
              value={filters.siteCode}
              onChange={(e) => setFilters((current) => ({ ...current, siteCode: e.target.value }))}
            >
              <option value="">All sites</option>
              {sites.map((site) => (
                <option key={site.id} value={site.code}>
                  {site.name}
                </option>
              ))}
            </select>
            <select
              className="rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm"
              value={filters.status}
              onChange={(e) => setFilters((current) => ({ ...current, status: e.target.value }))}
            >
              <option value="">All statuses</option>
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white dark:bg-slate-100 dark:text-slate-900" onClick={() => load(1)}>
              Search
            </button>
          </div>

          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
            {items.length ? (
              items.map((item) => (
                <button
                  key={item.id}
                  className={`block w-full border-b border-[var(--border-color)] p-4 text-left transition hover:bg-slate-50 dark:hover:bg-slate-900/40 ${
                    selected?.id === item.id ? "bg-blue-50/70 dark:bg-blue-950/20" : ""
                  }`}
                  onClick={() => setSelected(item)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{item.subject || "No subject"}</p>
                      <p className="mt-1 truncate text-xs text-[var(--text-secondary)]">
                        {item.name} · {item.email} · {item.site?.name}
                      </p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[0.65rem] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                      {item.status}
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm text-[var(--text-secondary)]">{item.message}</p>
                  <p className="mt-2 text-xs text-[var(--text-secondary)]">{formatDate(item.createdAt)}</p>
                </button>
              ))
            ) : (
              <div className="p-8 text-center text-sm text-[var(--text-secondary)]">
                {loading ? "Loading contact requests..." : "No contact requests found."}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-[var(--border-color)] p-3 text-xs text-[var(--text-secondary)]">
            <span>
              Page {pagination.page} of {pagination.totalPages} · {pagination.total} total
            </span>
            <div className="flex gap-2">
              <button className="rounded border border-[var(--border-color)] px-2 py-1 disabled:opacity-50" disabled={pagination.page <= 1} onClick={() => load(pagination.page - 1)}>
                Prev
              </button>
              <button className="rounded border border-[var(--border-color)] px-2 py-1 disabled:opacity-50" disabled={pagination.page >= pagination.totalPages} onClick={() => load(pagination.page + 1)}>
                Next
              </button>
            </div>
          </div>
        </div>

        <aside className="glass rounded-panel min-h-0 overflow-hidden">
          {selected ? (
            <div className="scrollbar-thin h-full overflow-y-auto p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">{selected.site?.name}</p>
                  <h2 className="mt-1 text-lg font-bold">{selected.subject || "Contact request"}</h2>
                </div>
                <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-950/40 dark:text-blue-200">
                  {selected.status}
                </span>
              </div>

              <div className="mt-5 space-y-3 rounded-lg border border-[var(--border-color)] p-4 text-sm">
                <p className="flex items-center gap-2">
                  <UserRound size={16} />
                  {selected.name}
                </p>
                <p className="flex items-center gap-2 break-all">
                  <Mail size={16} />
                  <a className="text-blue-600 underline-offset-4 hover:underline" href={`mailto:${selected.email}`}>
                    {selected.email}
                  </a>
                </p>
                {selected.phone ? <p>Phone: {selected.phone}</p> : null}
                {selected.sourceUrl ? (
                  <p className="break-all">
                    Source: <span className="text-[var(--text-secondary)]">{selected.sourceUrl}</span>
                  </p>
                ) : null}
                <p className="text-xs text-[var(--text-secondary)]">Received {formatDate(selected.createdAt)}</p>
                {selected.emailSentAt ? (
                  <p className="text-xs text-emerald-600">Email sent {formatDate(selected.emailSentAt)}</p>
                ) : selected.emailError ? (
                  <p className="text-xs text-amber-700">Email issue: {selected.emailError}</p>
                ) : null}
              </div>

              <div className="mt-5 rounded-lg border border-[var(--border-color)] bg-white/50 p-4 text-sm leading-7 dark:bg-slate-950/20">
                <p className="whitespace-pre-wrap">{selected.message}</p>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                {statuses.map((status) => (
                  <button
                    key={status}
                    className="rounded-lg border border-[var(--border-color)] px-3 py-2 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
                    onClick={() => setStatus(selected, status)}
                  >
                    Mark {status}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center p-8 text-center text-sm text-[var(--text-secondary)]">
              Select a request to see full details.
            </div>
          )}
        </aside>
      </section>
    </div>
  );
}
