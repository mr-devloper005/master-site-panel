import { Eye, Trash2 } from "lucide-react";

export default function PostTable({
  posts,
  selectedIds,
  onSelect,
  onSelectAll,
  onView,
  onDelete,
  onInlineStatus,
  page,
  totalPages,
  setPage,
  sortBy,
  setSortBy
}) {
  const allSelected = posts.length > 0 && selectedIds.length === posts.length;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-panel border border-[var(--border-color)]">
      <div className="scrollbar-thin min-h-0 flex-1 overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/60">
            <tr>
              <th className="px-3 py-2"><input type="checkbox" checked={allSelected} onChange={(e) => onSelectAll(e.target.checked)} /></th>
              <th className="px-3 py-2">ID</th>
              <th className="px-3 py-2"><button onClick={() => setSortBy("title")}>Title {sortBy === "title" ? "↑" : ""}</button></th>
              <th className="px-3 py-2">Site</th>
              <th className="px-3 py-2">Author</th>
              <th className="px-3 py-2"><button onClick={() => setSortBy("date")}>Date {sortBy === "date" ? "↑" : ""}</button></th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Excerpt</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {posts.map((post) => (
              <tr key={post.id} className="border-t border-[var(--border-color)] align-top">
                <td className="px-3 py-2"><input type="checkbox" checked={selectedIds.includes(post.id)} onChange={() => onSelect(post.id)} /></td>
                <td className="px-3 py-2 text-xs text-[var(--text-secondary)]">{post.id}</td>
                <td className="px-3 py-2 font-medium">{post.title}</td>
                <td className="px-3 py-2">{post.siteName}</td>
                <td className="px-3 py-2">{post.author}</td>
                <td className="px-3 py-2">{new Date(post.date).toLocaleDateString()}</td>
                <td className="px-3 py-2">
                  <select className="rounded border border-[var(--border-color)] px-2 py-1" value={post.status} onChange={(e) => onInlineStatus(post.id, e.target.value)}>
                    <option>Published</option>
                    <option>Draft</option>
                  </select>
                </td>
                <td className="max-w-xs px-3 py-2 text-xs text-[var(--text-secondary)]">{post.excerpt}</td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-2">
                    <button className="rounded-md border border-[var(--border-color)] p-1.5" onClick={() => onView(post)}><Eye size={16} /></button>
                    <button className="rounded-md border border-red-300 p-1.5 text-red-500" onClick={() => onDelete(post.id)}><Trash2 size={16} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t border-[var(--border-color)] px-3 py-2 text-sm">
        <p>Page {page} / {totalPages}</p>
        <div className="flex gap-2">
          <button className="rounded border border-[var(--border-color)] px-3 py-1" onClick={() => setPage((p) => Math.max(p - 1, 1))}>Prev</button>
          <button className="rounded border border-[var(--border-color)] px-3 py-1" onClick={() => setPage((p) => Math.min(p + 1, totalPages))}>Next</button>
        </div>
      </div>
    </div>
  );
}
