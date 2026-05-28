import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, Search, X } from "lucide-react";

import { searchSites } from "../../utils/api";

const optionLabel = (site) => site?.name || site?.code || "Unknown site";
const optionMeta = (site) =>
  [site?.code, site?.domain || site?.url, Array.isArray(site?.supportedTasks) ? site.supportedTasks.join(", ") : ""]
    .filter(Boolean)
    .join(" • ");

export default function RemoteSiteSelect({
  label,
  value,
  onChange,
  onSiteChange,
  placeholder = "Search and select site",
  searchPlaceholder = "Type domain, name, or code...",
  className = "",
  disabled = false,
  includeAllOption = false,
  allLabel = "All Sites",
  limit = 25,
}) {
  const wrapperRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState([]);
  const [selectedSite, setSelectedSite] = useState(null);
  const [loading, setLoading] = useState(false);

  const selectedLabel = useMemo(() => {
    if (includeAllOption && (!value || value === "all")) return allLabel;
    if (selectedSite) return optionLabel(selectedSite);
    const found = options.find((site) => site.id === value);
    return found ? optionLabel(found) : "";
  }, [allLabel, includeAllOption, options, selectedSite, value]);

  useEffect(() => {
    const onClickOutside = (event) => {
      if (!wrapperRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    if (!value || value === "all") {
      setSelectedSite(null);
      return;
    }

    const existing = options.find((site) => site.id === value);
    if (existing) {
      setSelectedSite(existing);
      onSiteChange?.(existing);
      return;
    }

    let cancelled = false;
    searchSites({ ids: [value] })
      .then((result) => {
        if (cancelled) return;
        const site = result.sites[0] || null;
        setSelectedSite(site);
        if (site) onSiteChange?.(site);
      })
      .catch(() => {
        if (!cancelled) setSelectedSite(null);
      });

    return () => {
      cancelled = true;
    };
  }, [value]);

  useEffect(() => {
    if (!open) return;

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const result = await searchSites({ search: query, limit });
        setOptions(result.sites);
      } finally {
        setLoading(false);
      }
    }, 220);

    return () => clearTimeout(timer);
  }, [limit, open, query]);

  const chooseSite = (site) => {
    setSelectedSite(site);
    onSiteChange?.(site);
    onChange(site?.id || "");
    setOpen(false);
  };

  const chooseAll = () => {
    setSelectedSite(null);
    onSiteChange?.(null);
    onChange("all");
    setOpen(false);
  };

  return (
    <div className={`relative min-w-[260px] ${className}`} ref={wrapperRef}>
      {label ? <label className="mb-2 block text-sm font-semibold">{label}</label> : null}
      <button
        type="button"
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 text-left text-sm shadow-sm transition hover:border-blue-300 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <span className={`min-w-0 truncate ${selectedLabel ? "" : "text-[var(--text-secondary)]"}`}>
          {selectedLabel || placeholder}
        </span>
        <ChevronDown size={16} className="shrink-0 text-[var(--text-secondary)]" />
      </button>

      {open ? (
        <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-secondary)] shadow-2xl">
          <div className="border-b border-[var(--border-color)] p-3">
            <div className="flex min-h-11 items-center gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-primary)] px-3">
              <Search size={16} className="text-[var(--text-secondary)]" />
              <input
                autoFocus
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                placeholder={searchPlaceholder}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              {query ? (
                <button type="button" className="text-[var(--text-secondary)]" onClick={() => setQuery("")}>
                  <X size={15} />
                </button>
              ) : null}
            </div>
            <p className="mt-2 text-[11px] text-[var(--text-secondary)]">
              DB search active. Showing top {limit} matches only, so panel stays fast.
            </p>
          </div>

          <div className="max-h-80 overflow-y-auto p-2">
            {includeAllOption ? (
              <button
                type="button"
                className="mb-1 flex w-full items-center justify-between rounded-xl px-3 py-3 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-900"
                onClick={chooseAll}
              >
                <span className="font-semibold">{allLabel}</span>
                {(!value || value === "all") ? <Check size={16} className="text-blue-600" /> : null}
              </button>
            ) : null}

            {loading ? (
              <div className="flex items-center justify-center gap-2 p-6 text-sm text-[var(--text-secondary)]">
                <Loader2 size={16} className="animate-spin" /> Searching sites...
              </div>
            ) : options.length ? (
              options.map((site) => (
                <button
                  key={site.id}
                  type="button"
                  className="mb-1 flex w-full items-start justify-between gap-3 rounded-xl px-3 py-3 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-900"
                  onClick={() => chooseSite(site)}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{optionLabel(site)}</span>
                    <span className="mt-0.5 block truncate text-xs text-[var(--text-secondary)]">{optionMeta(site)}</span>
                  </span>
                  {value === site.id ? <Check size={16} className="mt-0.5 shrink-0 text-blue-600" /> : null}
                </button>
              ))
            ) : (
              <div className="p-6 text-center text-sm text-[var(--text-secondary)]">
                No sites found. Try exact domain/code.
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
