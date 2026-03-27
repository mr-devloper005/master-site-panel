import { useMemo, useState } from "react";

import Modal from "../common/Modal";

const ALL_TASKS = [
  "listing",
  "article",
  "image",
  "profile",
  "classified",
  "social",
  "sbm",
  "comment",
  "pdf",
  "org",
];

export default function SiteTaskModal({ open, onClose, site, onSubmit }) {
  const [task, setTask] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const options = useMemo(() => {
    const enabled = new Set(site?.supportedTasks || []);
    return ALL_TASKS.filter((item) => !enabled.has(item));
  }, [site]);

  const submit = async (event) => {
    event.preventDefault();
    if (!task) return;
    setSubmitting(true);
    try {
      await onSubmit(task);
      setTask("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={site ? `Add task to ${site.name}` : "Add task"}
      open={open}
      onClose={() => {
        setTask("");
        onClose();
      }}
      width="max-w-xl"
    >
      <form className="space-y-4" onSubmit={submit}>
        <div className="rounded-xl border border-[var(--border-color)] bg-slate-50 p-3 text-sm text-[var(--text-secondary)] dark:bg-slate-900/40">
          Choose a task, and we’ll enable posting for this site and return the API endpoint, token,
          payload template, and usage guide in one place.
        </div>

        <div>
          <label className="mb-2 block text-sm">Available tasks</label>
          <select
            className="w-full rounded-lg border border-[var(--border-color)] px-3 py-2"
            value={task}
            onChange={(event) => setTask(event.target.value)}
          >
            <option value="">Select task</option>
            {options.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          {!options.length ? (
            <p className="mt-2 text-xs text-[var(--text-secondary)]">
              All standard tasks are already enabled for this site.
            </p>
          ) : null}
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="rounded-lg border border-[var(--border-color)] px-4 py-2 text-sm"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50"
            disabled={!task || submitting}
          >
            {submitting ? "Provisioning..." : "Add task"}
          </button>
        </div>
      </form>
    </Modal>
  );
}




