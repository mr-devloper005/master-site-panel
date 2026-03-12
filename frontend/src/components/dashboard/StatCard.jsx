import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";

export default function StatCard({ title, value, icon, tone = "bg-slate-900", accent, delta, hint }) {
  const Icon = icon;
  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4, scale: 1.01 }}
      transition={{ duration: 0.22 }}
      className={`group relative overflow-hidden rounded-panel border border-white/10 ${tone} p-4 text-white shadow-panel`}
    >
      <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-white/10 blur-2xl transition-transform duration-300 group-hover:scale-125" />
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.1),transparent_55%,rgba(255,255,255,0.02))]" />
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-white/72">{title}</p>
          <h3 className="mt-2 text-2xl font-bold sm:text-3xl">{value}</h3>
          {hint && <p className="mt-2 text-xs text-white/80 sm:text-sm">{hint}</p>}
        </div>
        <div className={`rounded-2xl border border-white/15 p-3 ${accent || "bg-white/10"}`}>
          <Icon size={18} />
        </div>
      </div>
      {(delta || delta === 0) && (
        <div className="relative mt-4 inline-flex items-center gap-1 rounded-full border border-white/15 bg-black/15 px-3 py-1 text-xs font-medium text-white/90">
          <ArrowUpRight size={12} />
          {delta}
        </div>
      )}
    </motion.article>
  );
}
