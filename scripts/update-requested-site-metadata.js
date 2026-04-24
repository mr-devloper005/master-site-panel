const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const inventory = JSON.parse(fs.readFileSync('/app/requested-site-sync-source-2026-04-20-metadata.json', 'utf8'));

(async () => {
  const summary = { inventorySites: inventory.length, updatedSites: 0, missingSites: [] };

  for (const row of inventory) {
    const existing = await prisma.site.findUnique({ where: { code: row.code }, select: { id: true, config: true } });
    if (!existing) {
      summary.missingSites.push(row.code);
      continue;
    }

    const previousConfig = existing.config && typeof existing.config === 'object' && !Array.isArray(existing.config)
      ? existing.config
      : {};

    const config = {
      ...previousConfig,
      supportedTasks: row.tasks,
      domain: row.domain,
      url: row.url,
      frontendUrl: row.frontendUrl,
      liveUrl: row.liveUrl,
      siteUrl: row.siteUrl,
      tagline: row.tagline,
      description: row.description,
      repo: row.repo,
      siteType: row.siteType,
      feedPath: row.feedPath,
      taskViews: row.taskViews,
    };

    await prisma.site.update({
      where: { code: row.code },
      data: {
        name: row.name,
        framework: row.framework,
        category: row.category,
        theme: row.tagline || null,
        isActive: true,
        config,
      },
    });

    summary.updatedSites += 1;
  }

  console.log(JSON.stringify(summary, null, 2));
  await prisma.$disconnect();
})().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
