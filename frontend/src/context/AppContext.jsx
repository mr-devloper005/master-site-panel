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
const TOKEN_CACHE_KEY = "site-master-task-tokens";
const safeLower = (value) => String(value || "").toLowerCase();

const loadTokenCache = () => {
  try {
    const raw = localStorage.getItem(TOKEN_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const saveTokenCache = (cache) => {
  localStorage.setItem(TOKEN_CACHE_KEY, JSON.stringify(cache));
};

export const AppProvider = ({ children }) => {
  const [sites, setSites] = useState([]);
  const [posts, setPosts] = useState([]);
  const [dashboardSummary, setDashboardSummary] = useState(null);
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
      setDashboardSummary(data.summary || null);
    } catch (error) {
      setSites([]);
      setPosts([]);
      setDashboardSummary(null);
      toast.error(error.message || "Failed to load backend data");
    } finally {
      setLoading(false);
    }
  };

  const createSite = async (payload) => {
    const created = await addSite(payload);
    setSites((prev) => [...prev, created.site]);

    if (created?.provisioning?.tasks?.length) {
      const cache = loadTokenCache();
      created.provisioning.tasks.forEach((taskPackage) => {
        if (!taskPackage?.task || !taskPackage?.token) return;
        const tokenKey = `${created.site.id}:${taskPackage.task}`;
        cache[tokenKey] = taskPackage.token;
      });
      saveTokenCache(cache);
    }

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
    try {
      await bulkPostAction(payload);
      await hydrate();
      toast.success(`Post bulk ${payload.action} complete`);
    } catch (error) {
      toast.error(error.message || `Failed to ${payload.action} selected posts`);
      throw error;
    }
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
    const q = safeLower(globalQuery);
    return sites.filter(
      (site) => {
        const searchValues = [
          site.name,
          site.code,
          site.url,
          site.domain,
          site.description,
          site.raw?.config?.frontendUrl,
          site.raw?.config?.liveUrl,
          site.raw?.config?.siteUrl,
          site.raw?.config?.url,
          site.raw?.config?.domain,
        ];

        return searchValues.some((value) => safeLower(value).includes(q));
      }
    );
  }, [sites, globalQuery]);

  const filteredPosts = useMemo(() => {
    if (!globalQuery.trim()) return posts;
    const q = safeLower(globalQuery);
    return posts.filter(
      (post) =>
        safeLower(post.title).includes(q) ||
        safeLower(post.excerpt).includes(q) ||
        safeLower(post.author).includes(q) ||
        safeLower(post.siteName).includes(q) ||
        safeLower(post.slug).includes(q) ||
        safeLower(post.category).includes(q) ||
        (Array.isArray(post.tags) && post.tags.some((tag) => safeLower(tag).includes(q)))
    );
  }, [posts, globalQuery]);

  const value = useMemo(
    () => ({
      sites,
      posts,
      dashboardSummary,
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
    [sites, posts, dashboardSummary, loading, globalQuery, filteredSites, filteredPosts]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useAppData = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppData must be used within AppProvider");
  return ctx;
};
