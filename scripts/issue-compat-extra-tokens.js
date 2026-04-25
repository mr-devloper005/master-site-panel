const crypto = require('crypto');
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const raw = () => crypto.randomBytes(24).toString('hex');
const hash = (v) => crypto.createHash('sha256').update(v).digest('hex');
const baseScopes = ['posts:write','posts:read','sites:read'];
const scopesFor = (task) => [...baseScopes, `task:${task}`];
const wanted = [
  { siteCode:'wd2m8q7v4x', siteName:'WellDanet', task:'article', label:'WellDanet Article' },
  { siteCode:'wd2m8q7v4x', siteName:'WellDanet', task:'classified', label:'WellDanet Classified' },
  { siteCode:'wd2m8q7v4x', siteName:'WellDanet', task:'profile', label:'WellDanet Profile' },
  { siteCode:'thebalibead', siteName:'The Bali Bead', task:'article', label:'The Bali Bead Article' }
];
(async()=>{
  const out=[];
  for(const item of wanted){
    const site = await prisma.site.findUnique({ where:{ code:item.siteCode } });
    if(!site) continue;
    const token = raw();
    const key = await prisma.apiKey.create({ data:{ name:item.label, keyHash:hash(token), scopes:scopesFor(item.task) } });
    await prisma.apiKeySitePermission.create({ data:{ apiKeyId:key.id, siteId:site.id, canPost:true, canRead:true } });
    out.push({ siteCode:item.siteCode, name:item.label, taskType:item.task, token });
  }
  fs.writeFileSync('/tmp/compat-extra-tokens.json', JSON.stringify(out,null,2));
  console.log(JSON.stringify(out,null,2));
  await prisma.$disconnect();
})().catch(async (err)=>{ console.error(err); await prisma.$disconnect(); process.exit(1); });
