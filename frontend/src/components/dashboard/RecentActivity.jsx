import { useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";

export default function RecentActivity({ posts }) {
  const [visible, setVisible] = useState(12);
  const listRef = useRef(null);

  const sorted = useMemo(() => [...posts].sort((a, b) => new Date(b.date) - new Date(a.date)), [posts]);
  const items = sorted.slice(0, visible);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 70;
    if (nearBottom && visible < sorted.length) {
      setVisible((prev) => prev + 10);
    }
  };

  return (
    <section className="glass rounded-panel p-4">
      <h3 className="mb-3 text-sm font-semibold">Recent Activity</h3>
      <div ref={listRef} onScroll={onScroll} className="scrollbar-thin max-h-80 space-y-2 overflow-auto pr-1">
        {items.map((post) => (
          <motion.article key={post.id} whileHover={{ x: 2 }} className="rounded-lg border border-[var(--border-color)] p-3">
            <p className="text-sm font-semibold">{post.title}</p>
            <p className="text-xs text-[var(--text-secondary)]">{post.siteName} · {new Date(post.date).toLocaleString()}</p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">{post.excerpt}</p>
          </motion.article>
        ))}
      </div>
    </section>
  );
}
