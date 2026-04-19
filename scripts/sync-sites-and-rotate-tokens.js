const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const inventory = JSON.parse(fs.readFileSync('/app/site-sync-source-2026-04-19.json', 'utf8'));
const codes = inventory.map((row) => row.code);
const TASK_LABELS = {
  listing: 'Listing',
  article: 'Article',
  image: 'Image',
  mediaDistribution: 'Media Distribution',
  profile: 'Profile',
  classified: 'Classified',
  social: 'Social',
  sbm: 'SBM',
  comment: 'Blog Commenting',
  pdf: 'PDF',
  org: 'Org',
};
const TASK_ORDER = ['listing','classified','article','image','mediaDistribution','profile','social','sbm','comment','pdf','org'];
const baseSiteScopes = ['posts:write', 'posts:read', 'sites:read'];

function createRawApiKey() { return crypto.randomBytes(24).toString('hex'); }
function hashApiKey(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function scopesForTask(task) { return [...baseSiteScopes, `task:${task}`]; }

(async () => {
  const summary = {
    inventorySites: inventory.length,
    staleSitesDeleted: 0,
    staleTaskKeysDeleted: 0,
    upsertedSites: 0,
    tokenCount: 0,
  };

  const staleSites = await prisma.site.findMany({
    where: { code: { notIn: codes } },
    select: { id: true, code: true },
  });
  if (staleSites.length) {
    const staleIds = staleSites.map((s) => s.id);
    await prisma.site.deleteMany({ where: { id: { in: staleIds } } });
    summary.staleSitesDeleted = staleSites.length;
  }

  const taskApiKeys = await prisma.apiKey.findMany({
    where: {
      scopes: { hasSome: TASK_ORDER.map((t) => `task:${t}`) }
    },
    select: { id: true },
  });
  if (taskApiKeys.length) {
    const ids = taskApiKeys.map((k) => k.id);
    await prisma.apiKeySitePermission.deleteMany({ where: { apiKeyId: { in: ids } } });
    await prisma.post.updateMany({ where: { createdByApiKeyId: { in: ids } }, data: { createdByApiKeyId: null } });
    await prisma.apiKey.deleteMany({ where: { id: { in: ids } } });
    summary.staleTaskKeysDeleted = ids.length;
  }

  const freshTokens = [];

  for (const row of inventory) {
    const config = {
      supportedTasks: row.tasks,
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
        framework: row.framework,
        category: row.category,
        theme: row.tagline || null,
        isActive: true,
        config,
      },
      create: {
        code: row.code,
        name: row.name,
        framework: row.framework,
        category: row.category,
        theme: row.tagline || null,
        isActive: true,
        config,
      },
      select: { id: true, code: true, name: true },
    });
    summary.upsertedSites += 1;

    for (const task of row.tasks) {
      const raw = createRawApiKey();
      const key = await prisma.apiKey.create({
        data: {
          name: `${site.name} ${TASK_LABELS[task] || task}`,
          scopes: scopesForTask(task),
          keyHash: hashApiKey(raw),
        },
        select: { id: true, name: true },
      });
      await prisma.apiKeySitePermission.create({
        data: { apiKeyId: key.id, siteId: site.id, canPost: true, canRead: true },
      });
      freshTokens.push({
        siteCode: site.code,
        name: key.name,
        taskType: task,
        token: raw,
      });
    }
  }

  summary.tokenCount = freshTokens.length;
  console.log(JSON.stringify({ summary, freshTokens }, null, 2));
  await prisma.$disconnect();
})().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
