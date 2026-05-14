const fs = require("fs");
const crypto = require("crypto");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const inventoryPath = "/app/media-subdomain-sync-source-2026-05-13.json";
const inventory = JSON.parse(fs.readFileSync(inventoryPath, "utf8"));

const baseScopes = ["posts:write", "posts:read", "sites:read"];
const createRawApiKey = () => crypto.randomBytes(24).toString("hex");
const hashApiKey = (value) => crypto.createHash("sha256").update(value).digest("hex");

(async () => {
  const freshTokens = [];
  const summary = {
    inventorySites: inventory.length,
    upsertedSites: 0,
    rotatedSiteKeys: 0,
    tokenCount: 0,
  };

  const existingSites = await prisma.site.findMany({
    where: { code: { in: inventory.map((row) => row.code) } },
    select: { id: true },
  });
  const existingSiteIds = existingSites.map((site) => site.id);
  if (existingSiteIds.length) {
    const keys = await prisma.apiKey.findMany({
      where: {
        permissions: { some: { siteId: { in: existingSiteIds } } },
        scopes: { has: "task:mediaDistribution" },
      },
      select: { id: true },
    });
    if (keys.length) {
      const ids = keys.map((key) => key.id);
      await prisma.apiKeySitePermission.deleteMany({ where: { apiKeyId: { in: ids } } });
      await prisma.post.updateMany({ where: { createdByApiKeyId: { in: ids } }, data: { createdByApiKeyId: null } });
      await prisma.apiKey.deleteMany({ where: { id: { in: ids } } });
      summary.rotatedSiteKeys = ids.length;
    }
  }

  for (const row of inventory) {
    const config = {
      supportedTasks: ["mediaDistribution"],
      taskViews: row.taskViews || { mediaDistribution: row.route || "/updates" },
      domain: row.domain,
      url: row.url,
      tagline: row.tagline,
      description: row.description,
      repo: row.repo,
    };
    const site = await prisma.site.upsert({
      where: { code: row.code },
      update: {
        name: row.name,
        framework: "NEXT_JS",
        category: "MEDIA_DISTRIBUTION",
        theme: row.tagline || null,
        isActive: true,
        config,
      },
      create: {
        code: row.code,
        name: row.name,
        framework: "NEXT_JS",
        category: "MEDIA_DISTRIBUTION",
        theme: row.tagline || null,
        isActive: true,
        config,
      },
      select: { id: true, code: true, name: true },
    });
    summary.upsertedSites += 1;

    const raw = createRawApiKey();
    const apiKey = await prisma.apiKey.create({
      data: {
        name: `${site.name} Media Distribution`,
        scopes: [...baseScopes, "task:mediaDistribution"],
        keyHash: hashApiKey(raw),
      },
      select: { id: true, name: true },
    });
    await prisma.apiKeySitePermission.create({
      data: { apiKeyId: apiKey.id, siteId: site.id, canPost: true, canRead: true },
    });
    freshTokens.push({
      siteCode: site.code,
      domain: row.domain,
      route: config.taskViews.mediaDistribution,
      taskType: "mediaDistribution",
      name: apiKey.name,
      token: raw,
    });
  }

  summary.tokenCount = freshTokens.length;
  console.log(JSON.stringify({ summary, freshTokens }, null, 2));
  await prisma.$disconnect();
})().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
