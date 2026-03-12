import { useState } from "react";
import { useEffect } from "react";
import toast from "react-hot-toast";

import Header from "./Header";
import Sidebar from "./Sidebar";
import MobileBottomNav from "./MobileBottomNav";
import { useAppData } from "../../context/AppContext";

export default function AppLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { posts } = useAppData();

  useEffect(() => {
    if (!posts.length) return undefined;
    const timer = setInterval(() => {
      const randomPost = posts[Math.floor(Math.random() * posts.length)];
      toast(`New activity: ${randomPost.title}`);
    }, 45000);
    return () => clearInterval(timer);
  }, [posts]);

  return (
    <div className="h-screen overflow-hidden bg-[var(--bg-primary)]">
      <Header onMenuToggle={() => setSidebarOpen((s) => !s)} />
      <div className="mx-auto flex h-[calc(100dvh-4rem)] max-w-[1800px] overflow-hidden">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main className="min-w-0 flex-1 overflow-hidden p-3 pb-20 sm:p-6 lg:pb-6">{children}</main>
      </div>
      <MobileBottomNav />
    </div>
  );
}
