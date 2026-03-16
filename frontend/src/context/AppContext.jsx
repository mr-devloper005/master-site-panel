import { createContext, useContext, useMemo, useState } from "react";
import toast from "react-hot-toast";

import {
  addSite,
  bulkPostAction,
  bulkSiteAction,
  deleteSiteTask,
  fetchDashboardData,
  provisionSiteTask,
  reorderSites,
  resetMockDb,
  updatePost,
  updateSite
} from "../utils/api";

const AppContext = createContext(null);

export const AppProvider = ({ children }) => {
  const [sites, setSites] = useState([]);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [globalQuery, setGlobalQuery] = useState("");

  const hydrate = async () => {
    setLoading(true);
    try {
      const data = await fetchDashboardData();
      setSites(
        data.sites.sort(
          (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
        )
      );
      setPosts(data.posts);
    } catch (error) {
      setSites([]);
      setPosts([]);
      toast.error(error.message || "Failed to load backend data");
    } finally {
      setLoading(false);
    }
  };

  const createSite = async (payload) => {
    const created = await addSite(payload);
    setSites((prev) => [...prev, created.site]);
    toast.success("Site added successfully");
    return created;
  };

  const editSite = async (siteId, payload) => {
    const updated = await updateSite(siteId, payload);
    setSites((prev) => prev.map((site) => (site.id === siteId ? updated : site)));
    toast.success("Site updated");
    return updated;
  };

  const addTaskToSite = async (siteId, task) => {
    const provisioned = await provisionSiteTask(siteId, task);
    setSites((prev) => prev.map((site) => (site.id === siteId ? provisioned.site : site)));
    toast.success(`${task} task enabled`);
    return provisioned;
  };

  const removeTaskFromSite = async (siteId, task) => {
    const updated = await deleteSiteTask(siteId, task);
    setSites((prev) => prev.map((site) => (site.id === siteId ? updated.site : site)));
    toast.success(`${task} task removed`);
    return updated;
  };

  const runSiteBulkAction = async (siteIds, action) => {
    await bulkSiteAction(siteIds, action);
    await hydrate();
    toast.success(`Bulk ${action} complete`);
  };

  const editPost = async (postId, payload) => {
    const updated = await updatePost(postId, payload);
    setPosts((prev) => prev.map((post) => (post.id === postId ? updated : post)));
    toast.success("Post updated");
  };

  const runPostBulkAction = async (payload) => {
    await bulkPostAction(payload);
    await hydrate();
    toast.success(`Post bulk ${payload.action} complete`);
  };

  const reorderSiteList = async (orderedIds) => {
    const ordered = await reorderSites(orderedIds);
    setSites(ordered);
  };

  const resetData = async () => {
    try {
      await resetMockDb();
      await hydrate();
      toast.success("Mock database reset");
    } catch (error) {
      toast.error(error.message || "Reset is unavailable");
    }
  };

  const filteredSites = useMemo(() => {
    if (!globalQuery.trim()) return sites;
    const q = globalQuery.toLowerCase();
    return sites.filter(
      (site) =>
        site.name.toLowerCase().includes(q) ||
        site.url.toLowerCase().includes(q) ||
        site.description.toLowerCase().includes(q)
    );
  }, [sites, globalQuery]);

  const filteredPosts = useMemo(() => {
    if (!globalQuery.trim()) return posts;
    const q = globalQuery.toLowerCase();
    return posts.filter(
      (post) =>
        post.title.toLowerCase().includes(q) ||
        post.excerpt.toLowerCase().includes(q) ||
        post.author.toLowerCase().includes(q) ||
        post.siteName.toLowerCase().includes(q)
    );
  }, [posts, globalQuery]);

  const value = useMemo(
    () => ({
      sites,
      posts,
      loading,
      globalQuery,
      setGlobalQuery,
      hydrate,
      createSite,
      editSite,
      addTaskToSite,
      removeTaskFromSite,
      runSiteBulkAction,
      editPost,
      runPostBulkAction,
      reorderSiteList,
      resetData,
      filteredSites,
      filteredPosts
    }),
    [sites, posts, loading, globalQuery, filteredSites, filteredPosts]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useAppData = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppData must be used within AppProvider");
  return ctx;
};
