import { motion } from "framer-motion";

export default function Modal({ title, open, onClose, children, width = "max-w-2xl" }) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        className={`glass w-full ${width} max-h-[90vh] overflow-hidden rounded-panel bg-[var(--bg-secondary)] p-4 shadow-panel`}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--border-color)] px-3 py-1.5 text-sm"
          >
            Close
          </button>
        </div>
        <div className="scrollbar-thin max-h-[calc(90vh-5.5rem)] overflow-y-auto pr-1">
          {children}
        </div>
      </motion.div>
    </div>
  );
}
