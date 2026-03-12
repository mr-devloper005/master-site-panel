import { useState } from "react";
import { Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import toast from "react-hot-toast";

import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { login, isAuthenticated } = useAuth();
  const [form, setForm] = useState({ email: "admin@sitemaster.pro", password: "password123" });
  const [loading, setLoading] = useState(false);

  if (isAuthenticated) return <Navigate to="/" replace />;

  return (
    <main className="grid min-h-screen place-items-center bg-[var(--bg-primary)] p-4">
      <motion.form
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md rounded-panel border border-[var(--border-color)] bg-[var(--bg-secondary)] p-6 shadow-panel"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            setLoading(true);
            await login(form.email, form.password);
            toast.success("Login successful");
          } catch (error) {
            toast.error(error.message);
          } finally {
            setLoading(false);
          }
        }}
      >
        <h1 className="text-2xl font-bold">SiteMaster Pro</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">Mock JWT login for enterprise panel access.</p>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1 block text-sm">Email</span>
            <input className="w-full rounded-lg border border-[var(--border-color)] px-3 py-2" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm">Password</span>
            <input type="password" className="w-full rounded-lg border border-[var(--border-color)] px-3 py-2" value={form.password} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))} />
          </label>
          <button className="min-h-11 w-full rounded-lg bg-gradient-to-r from-blue-500 to-indigo-600 text-white" disabled={loading}>
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </div>
      </motion.form>
    </main>
  );
}
