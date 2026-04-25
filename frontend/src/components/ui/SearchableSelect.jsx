import { useMemo } from "react";

export default function SearchableSelect({
  label,
  value,
  onChange,
  searchValue,
  onSearchChange,
  options,
  placeholder = "Select an option",
  searchPlaceholder = "Search...",
  className = "",
  disabled = false,
  emptyLabel = "No matching options",
}) {
  const filteredOptions = useMemo(() => {
    const query = searchValue.trim().toLowerCase();
    if (!query) return options;
    return options.filter((option) =>
      [option.label, option.meta]
        .filter(Boolean)
        .some((entry) => String(entry).toLowerCase().includes(query))
    );
  }, [options, searchValue]);

  return (
    <div className={`flex min-w-[220px] flex-col gap-2 ${className}`}>
      {label ? <label className="text-sm font-medium">{label}</label> : null}
      <input
        type="text"
        className="min-h-11 rounded-lg border border-[var(--border-color)] px-3 text-sm"
        placeholder={searchPlaceholder}
        value={searchValue}
        onChange={(event) => onSearchChange(event.target.value)}
        disabled={disabled}
      />
      <select
        className="min-h-11 rounded-lg border border-[var(--border-color)] px-3 text-sm"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
      >
        <option value="">{placeholder}</option>
        {filteredOptions.length ? (
          filteredOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))
        ) : (
          <option value="" disabled>
            {emptyLabel}
          </option>
        )}
      </select>
    </div>
  );
}
