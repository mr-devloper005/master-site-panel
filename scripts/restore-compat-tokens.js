const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const hash = (v) => crypto.createHash('sha256').update(v).digest('hex');
const baseScopes = ['posts:write','posts:read','sites:read'];
const scopesFor = (task) => [...baseScopes, `task:${task}`];
const compat = [
  { siteCode:'ab7m4v8q2x', siteName:'Agas Bistro', task:'article', token:'4e42de55c5b67799a60fcd5d0729d7c1857ba90c13f93de4' },
  { siteCode:'wd2m8q7v4x', siteName:'WellDanet', task:'listing', token:'71f053e9ab967b1a3e92690fcd3c6ee530e3c3e8827a97c9' },
  { siteCode:'enginecrib', siteName:'EngineCrib', task:'listing', token:'4a7cbe5bc4e3fa2568da54de2ba68b29dc77bea802e14148' },
  { siteCode:'q4xeunt97f', siteName:'Obsidian Impacts', task:'article', token:'7a3be798261a69e02ca754c119718ec30312f27c10ef53d2' },
  { siteCode:'linkriseup-production', siteName:'linkriseup', task:'listing', token:'023edeb97309e9b59a2ac39529d83474cf6e68629e267854' },
  { siteCode:'linkriseup-production', siteName:'linkriseup', task:'classified', token:'25487e2474b8f1ebd6fa14b9c1a13adddbebec0bf4c9e63f' },
  { siteCode:'linkriseup-production', siteName:'linkriseup', task:'article', token:'55f733862aa2e0fb920bfce4d1408d9d28b9f087a071af2b' },
  { siteCode:'linkriseup-production', siteName:'linkriseup', task:'image', token:'8e803740d410b24c978a3e1508a35b647c47dcbc58c7429e' },
  { siteCode:'linkriseup-production', siteName:'linkriseup', task:'profile', token:'00ea2013b12dba358a6c306d03866b5870121c342dd8e395' },
  { siteCode:'linkriseup-production', siteName:'linkriseup', task:'sbm', token:'4865e3344c87b85c7e3b0f1bbfaf676313b9cb6dc46a807e' },
  { siteCode:'linkriseup-production', siteName:'linkriseup', task:'pdf', token:'a563f98bc5c9dfe98930fb435d0f63f03d8101b0d3539d84' },
  { siteCode:'linkriseup-production', siteName:'linkriseup', task:'comment', token:'8be6eed8afec857fdfa915c601f951066d855d8f35f9cfd9' }
];
const taskAdds = {
  'linkriseup-production': ['listing','classified','article','image','profile','sbm','pdf','comment'],
  'wd2m8q7v4x': ['listing','article','classified','profile'],
  'thebalibead': ['image','profile','article']
};
(async()=>{
  for (const [code,tasks] of Object.entries(taskAdds)) {
    const site = await prisma.site.findUnique({ where:{ code } });
    if (!site) continue;
    const config = site.config && typeof site.config === 'object' ? site.config : {};
    const current = Array.isArray(config.supportedTasks) ? config.supportedTasks : [];
    const merged = [...new Set([...current, ...tasks])];
    if (merged.length !== current.length) {
      await prisma.site.update({ where:{ id: site.id }, data:{ config: { ...config, supportedTasks: merged } } });
    }
  }
  let restored=0;
  for (const item of compat) {
    const site = await prisma.site.findUnique({ where:{ code: item.siteCode } });
    if (!site) continue;
    const keyHash = hash(item.token);
    let key = await prisma.apiKey.findUnique({ where:{ keyHash } });
    if (!key) {
      key = await prisma.apiKey.create({ data:{ name:`${item.siteName} ${item.task}`, keyHash, scopes: scopesFor(item.task) } });
      restored++;
    }
    await prisma.apiKeySitePermission.upsert({
      where:{ apiKeyId_siteId:{ apiKeyId:key.id, siteId:site.id } },
      update:{ canPost:true, canRead:true },
      create:{ apiKeyId:key.id, siteId:site.id, canPost:true, canRead:true }
    });
  }
  console.log(JSON.stringify({restored, ensuredTasks:Object.keys(taskAdds).length, compatEntries:compat.length}, null, 2));
  await prisma.$disconnect();
})().catch(async (err)=>{ console.error(err); await prisma.$disconnect(); process.exit(1); });
