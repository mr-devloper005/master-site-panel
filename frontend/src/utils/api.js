const DEFAULT_BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL ||
  (typeof window !== "undefined" && /localhost|127\.0\.0\.1/.test(window.location.hostname)
    ? "http://localhost:4000"
    : "https://masterpanel.seoparadox.com");
export const BACKEND_URL_KEY = "site-master-backend-url";
export const API_KEY_STORAGE_KEY = "site-master-api-key";

const getBackendUrl = () => localStorage.getItem(BACKEND_URL_KEY) || DEFAULT_BACKEND_URL;
const getApiKey = () => localStorage.getItem(API_KEY_STORAGE_KEY) || "";

const parseJson = async (response) => {
  const text = await response.text();
  return text ? JSON.parse(text) : {};
};

const request = async (path, options = {}) => {
  const apiKey = options.apiKey ?? getApiKey();
  const backendUrl = options.backendUrl ?? getBackendUrl();
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (apiKey) {
    headers["x-api-key"] = apiKey;
  }

  const response = await fetch(`${backendUrl}${path}`, {
    ...options,
    headers,
  });
  const json = await parseJson(response);

  if (!response.ok) {
    throw new Error(json.message || json.error || "Request failed");
  }

  return json;
};

const requestPaginated = async (path, { limit = 200, mapItem = (item) => item } = {}) => {
  let page = 1;
  let totalPages = 1;
  const items = [];

  do {
    const separator = path.includes("?") ? "&" : "?";
    const response = await request(`${path}${separator}page=${page}&limit=${limit}`);
    const pageItems = Array.isArray(response.data) ? response.data : [];
    items.push(...pageItems.map(mapItem));
    totalPages = Math.max(Number(response.meta?.totalPages) || 1, 1);
    page += 1;
  } while (page <= totalPages);

  return items;
};

const sentenceCase = (value) =>
  value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const resolveSiteUrl = (config) =>
  config.frontendUrl ||
  config.liveUrl ||
  config.siteUrl ||
  config.url ||
  (config.domain ? `https://${String(config.domain).replace(/^https?:\/\//, "")}` : "");

const mapSite = (site) => {
  const config = site.config || {};
  const blueprint = site.blueprint || {};
  const runtime = Array.isArray(site.runtimeStatuses) && site.runtimeStatuses.length > 0
    ? site.runtimeStatuses[0]
    : null;

  return {
    id: site.id,
    code: site.code,
    name: site.name,
    framework: site.framework,
    category: site.category,
    theme: site.theme || "",
    url: resolveSiteUrl(config),
    domain: config.domain || "",
    description: config.description || `${sentenceCase(site.category)} site managed from master panel`,
    status: site.isActive ? "Active" : "Inactive",
    createdAt: site.createdAt,
    updatedAt: site.updatedAt,
    postCount: site._count?.posts || 0,
    supportedTasks: config.supportedTasks || [],
    connectorVersion: blueprint.connectorVersion || config.connectorVersion || "",
    feedPath: config.feedPath || "/",
    siteType: config.siteType || "",
    metrics: config.metrics || [],
    taskViews: config.taskViews || {},
    runtime: runtime
      ? {
          status: runtime.status,
          environment: runtime.environment,
          lastHeartbeatAt: runtime.lastHeartbeatAt,
          responseTimeMs: runtime.responseTimeMs,
          sdkVersion: runtime.sdkVersion,
          connectorVersion: runtime.connectorVersion,
          lastError: runtime.lastError,
          supportedTasks: runtime.supportedTasks || [],
        }
      : null,
    blueprint,
    raw: site,
  };
};

const inferCategory = (post) => {
  const content = post.content && typeof post.content === "object" ? post.content : {};
  const explicit = String(content.type || content.postType || content.taskType || "").toLowerCase();
  const tags = Array.isArray(post.tags) ? post.tags.map((tag) => String(tag).toLowerCase()) : [];

  if (explicit.includes("listing") || tags.includes("listing")) return "Listing";
  if (explicit.includes("mediadistribution") || explicit.includes("media-distribution")) return "Media Distribution";
  if (explicit.includes("article") || tags.includes("article") || tags.includes("blog")) return "Article";
  if (explicit.includes("gallery") || explicit.includes("image") || tags.includes("gallery")) return "Gallery";
  return "General";
};

const inferTaskType = (post) => {
  const content = post.content && typeof post.content === "object" ? post.content : {};
  const explicit = String(content.type || content.postType || content.taskType || "").toLowerCase();
  const tags = Array.isArray(post.tags) ? post.tags.map((tag) => String(tag).toLowerCase()) : [];

  if (explicit.includes("mediadistribution") || explicit.includes("media-distribution")) return "mediaDistribution";
  if (explicit.includes("listing") || tags.includes("listing")) return "listing";
  if (explicit.includes("classified") || tags.includes("classified")) return "classified";
  if (explicit.includes("article") || tags.includes("article") || tags.includes("blog")) return "article";
  if (explicit.includes("image") || explicit.includes("gallery") || tags.includes("image") || tags.includes("gallery")) return "image";
  if (explicit.includes("profile") || tags.includes("profile")) return "profile";
  if (explicit.includes("sbm") || explicit.includes("bookmark") || tags.includes("sbm") || tags.includes("bookmark")) return "sbm";
  if (explicit.includes("social") || tags.includes("social")) return "social";
  if (explicit.includes("pdf") || tags.includes("pdf")) return "pdf";
  if (explicit.includes("comment") || tags.includes("comment")) return "comment";
  return explicit || "general";
};

const deriveViews = (post) => {
  const content = post.content && typeof post.content === "object" ? post.content : {};
  if (Number.isFinite(Number(content.views))) return Number(content.views);
  return Math.max((Array.isArray(post.tags) ? post.tags.length : 0) * 42, 24);
};

const deriveLikes = (post) => {
  const content = post.content && typeof post.content === "object" ? post.content : {};
  if (Number.isFinite(Number(content.likes))) return Number(content.likes);
  return Math.max(Math.round(deriveViews(post) * 0.18), 6);
};

const mapPost = (post) => ({
  id: post.id,
  siteId: post.siteId,
  siteName: post.site?.name || post.siteName || "Unknown Site",
  title: post.title,
  excerpt: post.summary || "",
  content: post.content || {},
  author: post.authorName || "Unknown",
  date: post.publishedAt || post.createdAt,
  status: sentenceCase(post.status || "DRAFT"),
  media: Array.isArray(post.media) ? post.media : [],
  tags: Array.isArray(post.tags) ? post.tags : [],
  slug: post.slug || "",
  category: inferCategory(post),
  taskType: inferTaskType(post),
  views: deriveViews(post),
  likes: deriveLikes(post),
  raw: post,
  createdByApiKey: post.createdByApiKey || null,
  createdByUser: post.createdByApiKey?.user || null,
});

export const loginMock = async (email, password) => {
  if (!email || !password) throw new Error("Email and password are required");
  return {
    token: btoa(`${email}:local-panel-session`),
    user: {
      name: "Yash Admin",
      email,
      role: "Super Admin",
      avatar: "https://i.pravatar.cc/80?img=12",
    },
  };
};

export const fetchDashboardData = async () => {
  // Keep app bootstrap lightweight. Heavy all-post loading made every page slow.
  const [sitesResponse, postsResponse, summaryResponse] = await Promise.all([
    request("/api/v1/sites?page=1&limit=200"),
    request("/api/v1/posts?page=1&limit=50"),
    request("/api/v1/sites/summary"),
  ]);

  return {
    sites: Array.isArray(sitesResponse.data) ? sitesResponse.data.map(mapSite) : [],
    posts: Array.isArray(postsResponse.data) ? postsResponse.data.map(mapPost) : [],
    summary: summaryResponse.data || null,
  };
};

export const fetchPostsPage = async ({
  page = 1,
  limit = 15,
  search = "",
  siteId = "",
  status = "",
  taskType = "",
  dateFrom = "",
  dateTo = "",
  timeFrom = "",
  timeTo = "",
  userId = "",
  apiKeyId = "",
} = {}) => {
  const query = new URLSearchParams();
  query.set("page", String(page));
  query.set("limit", String(limit));
  if (search.trim()) query.set("search", search.trim());
  if (siteId && siteId !== "all") query.set("siteId", siteId);
  if (status && status !== "all") query.set("status", status.toUpperCase());
  if (taskType && taskType !== "all") query.set("taskType", taskType);
  if (dateFrom) query.set("dateFrom", dateFrom);
  if (dateTo) query.set("dateTo", dateTo);
  if (timeFrom) query.set("timeFrom", timeFrom);
  if (timeTo) query.set("timeTo", timeTo);
  if (userId) query.set("userId", userId);
  if (apiKeyId) query.set("apiKeyId", apiKeyId);

  const response = await request(`/api/v1/posts?${query.toString()}`);

  return {
    posts: Array.isArray(response.data) ? response.data.map(mapPost) : [],
    meta: response.meta || { page, limit, total: 0, totalPages: 1 },
  };
};

export const fetchSitesPage = async ({ page = 1, limit = 50, search = "" } = {}) => {
  const query = new URLSearchParams();
  query.set("page", String(page));
  query.set("limit", String(limit));
  if (search.trim()) query.set("search", search.trim());

  const response = await request(`/api/v1/sites?${query.toString()}`);

  return {
    sites: Array.isArray(response.data) ? response.data.map(mapSite) : [],
    meta: response.meta || { page, limit, total: 0, totalPages: 1 },
  };
};

export const searchSites = async ({ search = "", ids = [], limit = 25 } = {}) => {
  const query = new URLSearchParams();
  query.set("limit", String(limit));
  if (search.trim()) query.set("search", search.trim());
  if (ids.length) query.set("ids", ids.join(","));

  const response = await request(`/api/v1/sites/lookup/search?${query.toString()}`);

  return {
    sites: Array.isArray(response.data) ? response.data.map(mapSite) : [],
    meta: response.meta || { total: 0, limit },
  };
};

export const fetchSite = async (siteId) => {
  const response = await request(`/api/v1/sites/${siteId}`);
  return mapSite(response.data);
};

export const addSite = async (payload) => {
  const response = await request("/api/v1/sites", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return {
    site: mapSite(response.data.site),
    provisioning: response.data.provisioning,
  };
};

export const updateSite = async (siteId, payload) => {
  const response = await request(`/api/v1/sites/${siteId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return mapSite(response.data);
};

export const bulkSiteAction = async (siteIds, action) => {
  if (action === "delete") {
    await Promise.all(siteIds.map((siteId) => request(`/api/v1/sites/${siteId}`, { method: "DELETE" })));
    return true;
  }

  if (action === "activate" || action === "deactivate") {
    await Promise.all(
      siteIds.map((siteId) =>
        request(`/api/v1/sites/${siteId}`, {
          method: "PATCH",
          body: JSON.stringify({ isActive: action === "activate" }),
        })
      )
    );
  }

  return true;
};

export const updatePost = async (postId, payload) => {
  const normalized = {
    title: payload.title,
    summary: payload.excerpt,
    authorName: payload.author,
    content: payload.content,
    status: payload.status?.toUpperCase(),
  };

  const response = await request(`/api/v1/posts/${postId}`, {
    method: "PATCH",
    body: JSON.stringify(normalized),
  });
  return mapPost(response.data);
};

export const bulkPostAction = async ({ postIds, action, data }) => {
  if (action === "delete") {
    await request("/api/v1/posts/bulk/delete", {
      method: "POST",
      body: JSON.stringify({ postIds }),
    });
    return true;
  }

  if (action === "deleteAll") {
    await request("/api/v1/posts/bulk/delete", {
      method: "POST",
      body: JSON.stringify({ deleteAll: true }),
    });
    return true;
  }

  if (action === "publish") {
    await request("/api/v1/posts/bulk/update", {
      method: "POST",
      body: JSON.stringify({
        postIds,
        data: { status: "PUBLISHED" },
      }),
    });
    return true;
  }

  if (action === "edit") {
    await request("/api/v1/posts/bulk/update", {
      method: "POST",
      body: JSON.stringify({ postIds, data }),
    });
  }

  return true;
};

export const lookupPostsByLinks = async (links) => {
  const response = await request("/api/v1/posts/links/lookup", {
    method: "POST",
    body: JSON.stringify({ links }),
  });
  return response.data || { found: [], missing: [], foundCount: 0, missingCount: 0, searchedCount: 0 };
};

export const fetchDeletedPostsPage = async ({ page = 1, limit = 100, search = "", restorableOnly = true } = {}) => {
  const query = new URLSearchParams();
  query.set("page", String(page));
  query.set("limit", String(limit));
  query.set("restorableOnly", String(restorableOnly));
  if (search.trim()) query.set("search", search.trim());

  const response = await request(`/api/v1/posts/deleted?${query.toString()}`);
  return {
    posts: Array.isArray(response.data) ? response.data : [],
    meta: response.meta || { page, limit, total: 0, totalPages: 1 },
  };
};

export const lookupDeletedPostsByLinks = async (links) => {
  const response = await request("/api/v1/posts/deleted/links/lookup", {
    method: "POST",
    body: JSON.stringify({ links }),
  });
  return response.data || { found: [], missing: [], foundCount: 0, missingCount: 0, searchedCount: 0 };
};

export const restoreDeletedPostsBulk = async (deletedPostIds) => {
  const response = await request("/api/v1/posts/deleted/bulk/restore", {
    method: "POST",
    body: JSON.stringify({ deletedPostIds }),
  });
  return response.data;
};

export const restoreDeletedPost = async (deletedPostId) => {
  const response = await request(`/api/v1/posts/deleted/${deletedPostId}/restore`, {
    method: "POST",
  });
  return response.data;
};

export const reorderSites = async (orderedIds) => orderedIds;

export const resetMockDb = async () => {
  throw new Error("Reset mock DB is not available in backend mode.");
};

export const fetchApiKeys = async () => {
  const response = await request("/api/v1/auth/keys");
  return response.data;
};

export const fetchPanelUsers = async ({ page = 1, limit = 25, search = "", status = "" } = {}) => {
  const query = new URLSearchParams();
  query.set("page", String(page));
  query.set("limit", String(limit));
  if (search.trim()) query.set("search", search.trim());
  if (status && status !== "all") query.set("status", status);
  const response = await request(`/api/v1/users?${query.toString()}`);
  return {
    users: Array.isArray(response.data) ? response.data : [],
    meta: response.meta || { page, limit, total: 0, totalPages: 1 },
  };
};

export const createPanelUser = async (payload) => {
  const response = await request("/api/v1/users", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return response.data;
};

export const updatePanelUser = async (userId, payload) => {
  const response = await request(`/api/v1/users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return response.data;
};

export const fetchPanelUserKeys = async (userId) => {
  const response = await request(`/api/v1/users/${userId}/keys`);
  return response.data;
};

export const issuePanelUserKey = async (userId, payload) => {
  const response = await request(`/api/v1/users/${userId}/keys`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return response.data;
};

export const updatePanelUserKey = async (userId, keyId, payload) => {
  const response = await request(`/api/v1/users/${userId}/keys/${keyId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return response.data;
};

export const fetchPanelUserAccess = async (userId, { page = 1, limit = 50, search = "" } = {}) => {
  const query = new URLSearchParams();
  query.set("page", String(page));
  query.set("limit", String(limit));
  if (search.trim()) query.set("search", search.trim());
  const response = await request(`/api/v1/users/${userId}/access?${query.toString()}`);
  return {
    access: Array.isArray(response.data) ? response.data : [],
    meta: response.meta || { page, limit, total: 0, totalPages: 1 },
  };
};

export const updatePanelUserAccess = async (userId, rules) => {
  const response = await request(`/api/v1/users/${userId}/access`, {
    method: "PUT",
    body: JSON.stringify({ rules }),
  });
  return response.data;
};

export const fetchPanelUserPosts = async (userId, { page = 1, limit = 30, search = "", siteId = "", taskKey = "" } = {}) => {
  const query = new URLSearchParams();
  query.set("page", String(page));
  query.set("limit", String(limit));
  if (search.trim()) query.set("search", search.trim());
  if (siteId) query.set("siteId", siteId);
  if (taskKey && taskKey !== "all") query.set("taskKey", taskKey);
  const response = await request(`/api/v1/users/${userId}/posts?${query.toString()}`);
  return {
    posts: Array.isArray(response.data) ? response.data.map(mapPost) : [],
    meta: response.meta || { page, limit, total: 0, totalPages: 1 },
  };
};

export const fetchPanelUserActivity = async (userId, { page = 1, limit = 50, status = "" } = {}) => {
  const query = new URLSearchParams();
  query.set("page", String(page));
  query.set("limit", String(limit));
  if (status && status !== "all") query.set("status", status);
  const response = await request(`/api/v1/users/${userId}/activity?${query.toString()}`);
  return {
    logs: Array.isArray(response.data) ? response.data : [],
    meta: response.meta || { page, limit, total: 0, totalPages: 1 },
  };
};

export const exportTaskTokens = async ({ rotateMissing = true, reissueAll = false, task = "", addedAfter = "" } = {}) => {
  const query = new URLSearchParams();
  query.set("rotateMissing", rotateMissing ? "true" : "false");
  query.set("reissueAll", reissueAll ? "true" : "false");
  if (task) query.set("task", task);
  if (addedAfter) query.set("addedAfter", addedAfter);
  const response = await request(`/api/v1/auth/keys/export-task-tokens?${query.toString()}`);
  return response.data;
};

export const validateIntegration = async (options = {}) => {
  const response = await request("/api/v1/auth/integration", options);
  return response.data;
};

export const createTaskApiKey = async (payload) => {
  const response = await request("/api/v1/auth/keys", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return response.data;
};

export const provisionSiteTask = async (siteId, task) => {
  const response = await request(`/api/v1/sites/${siteId}/tasks`, {
    method: "POST",
    body: JSON.stringify({ task }),
  });

  return {
    site: mapSite(response.data.site),
    task: response.data.task,
  };
};

export const issueSiteTaskToken = async (siteId, task) => {
  const response = await request(`/api/v1/sites/${siteId}/tasks/${task}/issue`, {
    method: "POST",
  });
  return {
    site: mapSite(response.data.site),
    task: response.data.task,
  };
};

export const deleteSiteTask = async (siteId, task) => {
  const response = await request(`/api/v1/sites/${siteId}/tasks/${task}`, {
    method: "DELETE",
  });
  return {
    site: mapSite(response.data.site),
    task: response.data.task,
    revokedKeys: response.data.revokedKeys,
  };
};

export const fetchSiteBlueprint = async (siteId) => {
  const response = await request(`/api/v1/sites/${siteId}/blueprint`);
  return response.data;
};

export const fetchSiteSitemapStatus = async (siteId, options = {}) => {
  const query = new URLSearchParams();
  if (options.all) query.set("all", "true");
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const response = await request(`/api/v1/sites/${siteId}/sitemap-status${suffix}`);
  return response.data;
};

export const fetchSiteSeoStatus = async (siteId, options = {}) => {
  const query = new URLSearchParams();
  if (options.all) query.set("all", "true");
  if (options.limit) query.set("limit", String(options.limit));
  if (options.concurrency) query.set("concurrency", String(options.concurrency));
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const response = await request(`/api/v1/sites/${siteId}/seo-status${suffix}`);
  return response.data;
};

export const fetchSiteLinkHealth = async (siteId, options = {}) => {
  const query = new URLSearchParams();
  query.set("limit", String(options.limit || 120));
  query.set("maxLinks", String(options.maxLinks || 200));
  query.set("timeoutMs", String(options.timeoutMs || 8000));
  query.set("concurrency", String(options.concurrency || 6));
  const response = await request(`/api/v1/sites/${siteId}/link-health?${query.toString()}`);
  return response.data;
};

export const fetchSiteSeoConfig = async (siteId) => {
  const response = await request(`/api/v1/sites/${siteId}/seo-config`);
  return response.data;
};

export const updateSiteSeoConfig = async (siteId, payload) => {
  const response = await request(`/api/v1/sites/${siteId}/seo-config`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return response.data;
};

export const fetchSiteSeoBlueprint = async (siteId) => {
  const response = await request(`/api/v1/sites/${siteId}/seo-blueprint`);
  return response.data;
};

export const updateSiteSeoBlueprint = async (siteId, payload) => {
  const response = await request(`/api/v1/sites/${siteId}/seo-blueprint`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return response.data;
};

export const fetchSiteIndexingStatus = async (siteId, options = {}) => {
  const query = new URLSearchParams();
  query.set("limit", String(options.limit || 100));
  if (options.runDue) query.set("runDue", "true");
  const response = await request(`/api/v1/sites/${siteId}/indexing-status?${query.toString()}`);
  return response.data;
};

export const fetchSiteIndexNowConfig = async (siteId) => {
  const response = await request(`/api/v1/sites/${siteId}/indexnow-config`);
  return response.data;
};

export const updateSiteIndexNowConfig = async (siteId, payload) => {
  const response = await request(`/api/v1/sites/${siteId}/indexnow-config`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return response.data;
};

export const submitSiteIndexNow = async (siteId, payload = {}) => {
  const response = await request(`/api/v1/sites/${siteId}/indexnow/submit`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return response.data;
};

export const submitSiteSitemapForIndexing = async (siteId) => {
  const response = await request(`/api/v1/sites/${siteId}/indexing/submit-sitemap`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  return response.data;
};

export const fetchContactSubmissions = async (options = {}) => {
  const query = new URLSearchParams();
  query.set("limit", String(options.limit || 50));
  query.set("page", String(options.page || 1));
  if (options.status) query.set("status", options.status);
  if (options.siteCode) query.set("siteCode", options.siteCode);
  if (options.search) query.set("search", options.search);
  const response = await request(`/api/v1/contact-submissions?${query.toString()}`);
  return response.data;
};

export const updateContactSubmission = async (submissionId, payload) => {
  const response = await request(`/api/v1/contact-submissions/${submissionId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return response.data;
};

export const fetchSmtpSettings = async () => {
  const response = await request("/api/v1/settings/smtp");
  return response.data;
};

export const updateSmtpSettings = async (payload) => {
  const response = await request("/api/v1/settings/smtp", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  return response.data;
};

export const testSmtpSettings = async (toEmail) => {
  const response = await request("/api/v1/settings/smtp/test", {
    method: "POST",
    body: JSON.stringify({ toEmail }),
  });
  return response.data;
};

export const runSiteIndexingInspections = async (siteId, limit = 20) => {
  const response = await request(`/api/v1/sites/${siteId}/indexing/run-inspections`, {
    method: "POST",
    body: JSON.stringify({ limit }),
  });
  return response.data;
};

export const fetchSiteSitemapConfig = async (siteId) => {
  const response = await request(`/api/v1/sites/${siteId}/sitemap-config`);
  return response.data;
};

export const updateSiteSitemapConfig = async (siteId, payload) => {
  const response = await request(`/api/v1/sites/${siteId}/sitemap-config`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return response.data;
};

export const getIntegrationSettings = () => ({
  backendUrl: getBackendUrl(),
  apiKey: getApiKey(),
});

export const saveIntegrationSettings = ({ backendUrl, apiKey }) => {
  if (backendUrl) {
    localStorage.setItem(BACKEND_URL_KEY, backendUrl);
  }
  if (apiKey) {
    localStorage.setItem(API_KEY_STORAGE_KEY, apiKey);
  }
};
