import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { Suspense, lazy, useEffect } from "react";
import { motion } from "framer-motion";

import { useAuth } from "./context/AuthContext";
import { useAppData } from "./context/AppContext";
import AppLayout from "./components/layout/AppLayout";
import TableSkeleton from "./components/common/TableSkeleton";

const Login = lazy(() => import("./pages/Login"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Sites = lazy(() => import("./pages/Sites"));
const Tasks = lazy(() => import("./pages/Tasks"));
const Posts = lazy(() => import("./pages/Posts"));
const RecentActivity = lazy(() => import("./pages/RecentActivity"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Seo = lazy(() => import("./pages/Seo"));
const Indexing = lazy(() => import("./pages/Indexing"));
const Settings = lazy(() => import("./pages/Settings"));
const NotFound = lazy(() => import("./pages/NotFound"));

const ProtectedRoutes = () => {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  );
};

export default function App() {
  const { isAuthenticated } = useAuth();
  const { hydrate } = useAppData();

  useEffect(() => {
    if (isAuthenticated) {
      hydrate();
    }
  }, [isAuthenticated]);

  return (
    <Suspense fallback={<TableSkeleton rows={8} />}>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedRoutes />}>
            <Route index element={<Dashboard />} />
            <Route path="/sites" element={<Sites />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/posts" element={<Posts />} />
            <Route path="/activity" element={<RecentActivity />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/seo" element={<Seo />} />
            <Route path="/indexing" element={<Indexing />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </motion.div>
    </Suspense>
  );
}
