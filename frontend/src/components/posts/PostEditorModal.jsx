import { useEffect, useState } from "react";

import Modal from "../common/Modal";

export default function PostEditorModal({ open, onClose, post, onSave }) {
  const [form, setForm] = useState({ title: "", excerpt: "", status: "Draft", author: "", content: "{}" });

  useEffect(() => {
    if (!post) return;
    setForm({
      title: post.title,
      excerpt: post.excerpt,
      status: post.status,
      author: post.author,
      content: JSON.stringify(post.content, null, 2)
    });
  }, [post]);

  if (!post) return null;

  return (
    <Modal title="Edit Post" open={open} onClose={onClose} width="max-w-3xl">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({
            ...form,
            content: JSON.parse(form.content)
          });
        }}
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm">Title</label>
            <input className="w-full rounded-lg border border-[var(--border-color)] px-3 py-2" value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} />
          </div>
          <div>
            <label className="mb-1 block text-sm">Author</label>
            <input className="w-full rounded-lg border border-[var(--border-color)] px-3 py-2" value={form.author} onChange={(e) => setForm((p) => ({ ...p, author: e.target.value }))} />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm">Excerpt</label>
          <textarea rows={3} className="w-full rounded-lg border border-[var(--border-color)] px-3 py-2" value={form.excerpt} onChange={(e) => setForm((p) => ({ ...p, excerpt: e.target.value }))} />
        </div>

        <div>
          <label className="mb-1 block text-sm">Status</label>
          <select className="w-full rounded-lg border border-[var(--border-color)] px-3 py-2" value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}>
            <option value="Published">Published</option>
            <option value="Draft">Draft</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm">Content JSON</label>
          <textarea rows={8} className="w-full rounded-lg border border-[var(--border-color)] px-3 py-2 font-mono text-xs" value={form.content} onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))} />
        </div>

        {Array.isArray(post.media) && post.media.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Media Preview</p>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {post.media.map((item) =>
                item.type === "DOC" ? (
                  <a key={item.url} href={item.url} target="_blank" rel="noreferrer" className="rounded-lg border border-[var(--border-color)] p-2 text-sm text-blue-600">
                    Preview document
                  </a>
                ) : (
                  <img key={item.url} src={item.url} alt={post.title} className="h-32 w-full rounded-lg object-cover" />
                )
              )}
            </div>
          </div>
        )}

        <input type="hidden" name="csrf_token" value="mock_csrf_token_placeholder" />

        <div className="flex justify-end gap-2">
          <button type="button" className="rounded-lg border border-[var(--border-color)] px-4 py-2" onClick={onClose}>Cancel</button>
          <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-white">Save Post</button>
        </div>
      </form>
    </Modal>
  );
}
