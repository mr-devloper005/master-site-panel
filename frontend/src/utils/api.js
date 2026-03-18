const DEFAULT_BACKEND_URL = "http://localhost:4000";
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
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (apiKey) {
    headers["x-api-key"] = apiKey;
  }

  const response = await fetch(`${getBackendUrl()}${path}`, {
    ...options,
    headers,
  });
  const json = await parseJson(response);

  if (!response.ok) {
    throw new Error(json.message || json.error || "Request failed");
  }

  return json;
};

const sentenceCase = (value) =>
  value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

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
    url: config.frontendUrl || config.liveUrl || config.siteUrl || "",
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
  if (explicit.includes("article") || tags.includes("article") || tags.includes("blog")) return "Article";
  if (explicit.includes("gallery") || explicit.includes("image") || tags.includes("gallery")) return "Gallery";
  return "General";
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
  views: deriveViews(post),
  likes: deriveLikes(post),
  raw: post,
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
  const [sitesResponse, postsResponse] = await Promise.all([
    request("/api/v1/sites"),
    request("/api/v1/posts?limit=200"),
  ]);

  return {
    sites: sitesResponse.data.map(mapSite),
    posts: postsResponse.data.map(mapPost),
  };
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

export const reorderSites = async (orderedIds) => orderedIds;

export const resetMockDb = async () => {
  throw new Error("Reset mock DB is not available in backend mode.");
};

export const fetchApiKeys = async () => {
  const response = await request("/api/v1/auth/keys");
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
