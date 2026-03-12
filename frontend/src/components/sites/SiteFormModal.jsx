import { useEffect, useState } from "react";

import Modal from "../common/Modal";

const frameworks = ["NEXT_JS", "REACT", "HTML_CSS_JS", "OTHER"];
const categories = ["ARTICLE", "SBM", "IMAGE_SHARING", "LOCAL_LISTING", "PROFILE", "CUSTOM"];
const taskOptions = ["listing", "article", "image", "profile", "classified", "social"];

const initial = {
  code: "",
  name: "",
  framework: "NEXT_JS",
  category: "LOCAL_LISTING",
  theme: "",
  frontendUrl: "",
  description: "",
  siteType: "listing",
  feedPath: "/listings",
  supportedTasks: ["listing"],
  metrics: "posts,published,impressions",
};

export default function SiteFormModal({ open, onClose, onSubmit, editing }) {
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (editing) {
      setForm({
        code: editing.code || "",
        name: editing.name || "",
        framework: editing.framework || "NEXT_JS",
        category: editing.category || "LOCAL_LISTING",
        theme: editing.theme || "",
        frontendUrl: editing.url || "",
        description: editing.description || "",
        siteType: editing.siteType || "listing",
        feedPath: editing.feedPath || "/listings",
        supportedTasks: editing.supportedTasks?.length ? editing.supportedTasks : ["listing"],
        metrics: editing.metrics?.join(",") || "posts,published,impressions",
      });
    } else {
      setForm(initial);
    }
    setErrors({});
  }, [editing, open]);

  const validate = () => {
    const nextErrors = {};
    if (!form.code.trim()) nextErrors.code = "Site code is required";
    if (!form.name.trim()) nextErrors.name = "Site name is required";
    if (!form.frontendUrl.trim()) nextErrors.frontendUrl = "Frontend URL is required";
    if (!form.description.trim()) nextErrors.description = "Description is required";
    if (!form.supportedTasks.length) nextErrors.supportedTasks = "At least one task is required";
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const submit = (evt) => {
    evt.preventDefault();
    if (!validate()) return;

    onSubmit({
      code: form.code.trim(),
      name: form.name.trim(),
      framework: form.framework,
      category: form.category,
      theme: form.theme.trim(),
      config: {
        frontendUrl: form.frontendUrl.trim(),
        description: form.description.trim(),
        siteType: form.siteType.trim(),
        feedPath: form.feedPath.trim() || "/",
        supportedTasks: form.supportedTasks,
        metrics: form.metrics
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      },
    });
  };

  const toggleTask = (task) => {
    setForm((prev) => ({
      ...prev,
      supportedTasks: prev.supportedTasks.includes(task)
        ? prev.supportedTasks.filter((item) => item !== task)
        : [...prev.supportedTasks, task],
    }));
  };

  return (
    <Modal title={editing ? "Edit Site" : "Add Site"} open={open} onClose={onClose} width="max-w-3xl">
      <form className="space-y-3" onSubmit={submit}>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm">Site Code</label>
            <input className="w-full rounded-lg border border-[var(--border-color)] px-3 py-2" value={form.code} onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))} />
            {errors.code && <p className="text-xs text-red-500">{errors.code}</p>}
          </div>
          <div>
            <label className="mb-1 block text-sm">Site Name</label>
            <input className="w-full rounded-lg border border-[var(--border-color)] px-3 py-2" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
            {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm">Framework</label>
            <select className="w-full rounded-lg border border-[var(--border-color)] px-3 py-2" value={form.framework} onChange={(e) => setForm((p) => ({ ...p, framework: e.target.value }))}>
              {frameworks.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm">Category</label>
            <select className="w-full rounded-lg border border-[var(--border-color)] px-3 py-2" value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}>
              {categories.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm">Frontend URL</label>
          <input className="w-full rounded-lg border border-[var(--border-color)] px-3 py-2" value={form.frontendUrl} onChange={(e) => setForm((p) => ({ ...p, frontendUrl: e.target.value }))} />
          {errors.frontendUrl && <p className="text-xs text-red-500">{errors.frontendUrl}</p>}
        </div>

        <div>
          <label className="mb-1 block text-sm">Description</label>
          <textarea className="w-full rounded-lg border border-[var(--border-color)] px-3 py-2" rows={3} value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
          {errors.description && <p className="text-xs text-red-500">{errors.description}</p>}
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm">Theme</label>
            <input className="w-full rounded-lg border border-[var(--border-color)] px-3 py-2" value={form.theme} onChange={(e) => setForm((p) => ({ ...p, theme: e.target.value }))} />
          </div>
          <div>
            <label className="mb-1 block text-sm">Site Type</label>
            <input className="w-full rounded-lg border border-[var(--border-color)] px-3 py-2" value={form.siteType} onChange={(e) => setForm((p) => ({ ...p, siteType: e.target.value }))} />
          </div>
          <div>
            <label className="mb-1 block text-sm">Feed Path</label>
            <input className="w-full rounded-lg border border-[var(--border-color)] px-3 py-2" value={form.feedPath} onChange={(e) => setForm((p) => ({ ...p, feedPath: e.target.value }))} />
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm">Supported Tasks</label>
          <div className="flex flex-wrap gap-2">
            {taskOptions.map((task) => (
              <label key={task} className="inline-flex items-center gap-2 rounded-full border border-[var(--border-color)] px-3 py-1.5 text-sm">
                <input type="checkbox" checked={form.supportedTasks.includes(task)} onChange={() => toggleTask(task)} />
                {task}
              </label>
            ))}
          </div>
          {errors.supportedTasks && <p className="text-xs text-red-500">{errors.supportedTasks}</p>}
        </div>

        <div>
          <label className="mb-1 block text-sm">Metrics</label>
          <input className="w-full rounded-lg border border-[var(--border-color)] px-3 py-2" value={form.metrics} onChange={(e) => setForm((p) => ({ ...p, metrics: e.target.value }))} placeholder="posts,published,impressions" />
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" className="rounded-lg border border-[var(--border-color)] px-4 py-2 text-sm" onClick={onClose}>Cancel</button>
          <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white">Save</button>
        </div>
      </form>
    </Modal>
  );
}
