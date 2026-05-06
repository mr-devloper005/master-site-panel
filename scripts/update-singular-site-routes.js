const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const raw = `apcreatiu.com\tBusiness Listing
WellDanet.com\tBusiness Listing
rentalhiso.com\tBusiness Listing
lasheminence.com\tBusiness Listing
EngineCrib.com\tBusiness Listing
dlkautoparts.com\tBusiness Listing
miplaninvu.com\tBusiness Listing
MoonRocketCoin.net\tBusiness Listing
interawesome.com\tBusiness Listing
upgreeno.com\tBusiness Listing
deswebcol.com\tBusiness Listing
shindantool.com\tBusiness Listing
safehavenannuity.com\tBusiness Listing
netpromine.com\tBusiness Listing
starcoworkers.com\tBusiness Listing
rayantav.com\tBusiness Listing
mudatealaweb.com\tBusiness Listing
spinevivo.com\tBusiness Listing
datazynxllc.com\tBusiness Listing
yehwooyeh.com\tBusiness Listing
beingadviser.com\tBusiness Listing
ideovera.com\tBusiness Listing
maytapbung.net\tBusiness Listing
isanexpert.com\tBusiness Listing
webweaversonline.com\tBusiness Listing
choose-your-car.com\tBusiness Listing
CabanAlaeMilia.com\tBusiness Listing + Image
happysignups.com\tBusiness Listing
marketingsspot.com\tBusiness Listing
digitalvirtuose.com\tBusiness Listing
mujugranfondo.com\tClassified
jagothemes.com\tClassified
uplandcommerce.com\tClassified + Image Sharing
callgadgets.com\tClassified + Image Sharing
tobeetoetech.com\tClassified
agenisfree.com\tClassified
lodenews.com\tClassified
rajsattimart.com\tClassified
FinsCoastal.com\tClassified
bokunotrends.com\tClassified
djlservicios.com\tClassified
mikegabsolution.com\tClassified
vaultofjoseph.com\tClassified
jiyinaicha.com\tClassified
callredcape.com\tClassified
teebute.com\tClassified
sendingsos.com\tClassified
habibyasmaharun.com\tClassified
fullprokey.com\tClassified
winonaj.com\tArticle
wiliin.com\tArticle
Linkriseup.com\tArticle
alefcoach.com\tArticle
josoore.com\tArticle
techonlineinfo.com\tArticle
techdemais.com\tArticle
fluxyogaretreats.com\tArticle
blogmiki.com\tArticle
choicemakerscrew.com\tArticle
passionunchained.com\tArticle
dotsdeveloper.com\tArticle
fermenterspirit.com\tArticle
josephlaoutaris.com\tArticle , Social profile
aidteck.com\tArticle
mindful-lotus.com\tArticle
webmansax.com\tArticle
viscountwhite.com\tArticle
fflowlink.com\tArticle
empoweryouroad.com\tArticle
floatyourbrand.com\tArticle
blacktiefuture.com\tArticle
noroadsideas.com\tArticle
gutsbranding.com\tArticle
sandlore.com\tArticle
arcanumwebs.com\tArticle
infoplatforms.com\tArticle + PDF
devcybernexus.com\tArticle
motivkit.com\tArticle
mysterycoder.com\tArticle , Social profile
ruihanchemical.com\tArticle , Social profile
techmixbr.com\tArticle
switchhigh.com\tArticle + Social Profile
sinclair-theme.com\tArticle
septemberzodiac.com\tArticle
obsidianimpacts.com\tArticle
webwavecom.com\tArticle
newsportalweekly.com\tArticle + PDF
steadfastresults.com\tArticle
futurethey.com\tArticle
ComTelesis.net\tArticle
kayosportconnect.com\t Article + Image
KhaosAddon.com\tArticle
WorldWorthWandering.com\tArticle
MikeBrewerEconomics.com\tArticle
codepixelmedia.com\tImage + Profile
tynewebdesign.com\tImage + Profile
radianpark.com\tImage + Profile
lashisking.com\tImage + Profile
SoftKillDesign.com\tImage + Profile
TabSocal.com\tImage + Profile
housesdecors.com\tImage Sharing
aporiakennels.com\tImage Sharing
TheBaliBead.com\tImage + Profile
scoreminers.com\tImage + profile
linedesing.com\tImage + profile
thetinytierant.com\tImage Sharing
helloartcity.com\tImage + profile
frocadeco.com\tImage Sharing
hiddengemsreno.com\tImage + Profile
ethicsites.com\tImage + Profile
lakesforocean.com\tImage + profile
digi-optic.com\tImage Sharing
emeraldtoucanet.com\tImage Sharing
totebagus.com\tImage + Classified
creativeguyink.com\tImage + Profile
kong-vr.com\tImage
teddyandkitty.com\tImage + Profile
oscarcrea.com\tImage + Profile
pixelwebio.com\tImage + Profile
redesocialpro.com\tImage + Profile
earthskydesign.com\tImage + Profile
topoftheloop.com\tPDF + Profile
teeny-weenytoes.com\tPDF + Profile
railsfreaks.com\tPDF + Profile
mootankala.com\tPDF + Profile
nubsant.com\tPDF + Profile
webinfinityhub.com\tPDF + Profile
herotherblog.com\tPDF + Profile
creationtable.com\tPDF + Profile
macphersonweb.com\tPDF + Profile
wedropouts.com\tPDF + Profile
studiodiamond.net\tPDF + Profile
youngerlifestyle.net\tPDF + Profile
ultimorecursoh.com\tPDF + Profile
alwadidates.com\tSBM , Profile 
pcosremedy.com\tSBM , Profile 
quickoye.com\tSBM , Profile 
murraypura.com\tSBM , Profile 
pquko.com\tSBM , Profile 
pkkwb.com\tSBM , Profile 
meivera.com\tSBM , profile 
mysupergains.com\tSBM , Profile 
sourosa.com\tSBM , Profile 
StrathBrockParish.net\tSBM , Profile 
ladyframe.com\tSBM , Profile 
bharatamayu.com\tSBM , Profile 
celebriches.com\tSBM , Profile 
bugscast.com\tSocial Bookmarking
digginfordirt.com\tSocial Bookmarking
trippinbros.com\tSocial Bookmarking
cooltapas.com\tSocial Bookmarking
threebykeep.com\tSocial Bookmarking
altmeetyou.com\tProfile
MattRAlston.net\tProfile
treasurenftcode.com\tProfile
singpre.com\tProfile
guadalupepro.com\tProfile`;

const rows = raw.split(/\n/).map((line) => {
  const [domain, tasks] = line.split(/\t/, 2);
  return { domain: domain.trim().toLowerCase(), tasks: tasks.trim() };
});

const profileDomains = rows.filter((row) => /profile/i.test(row.tasks)).map((row) => row.domain).sort();
const userSet = new Set(profileDomains.filter((_, index) => index % 2 === 0));

const singularViews = {
  listing: '/listing',
  classified: '/classified',
  article: '/article',
  image: '/image',
  pdf: '/pdf',
  sbm: '/sbm',
  social: '/community',
  comment: '/blog',
  org: '/team',
};

const normalizeTasks = (value) => {
  const lower = value.toLowerCase();
  const tasks = [];
  if (lower.includes('business listing')) tasks.push('listing');
  if (lower.includes('classified')) tasks.push('classified');
  if (lower.includes('article')) tasks.push('article');
  if (lower.includes('image')) tasks.push('image');
  if (lower.includes('profile')) tasks.push('profile');
  if (lower.includes('pdf')) tasks.push('pdf');
  if (lower.includes('sbm') || lower.includes('social bookmarking')) tasks.push('sbm');
  return [...new Set(tasks)];
};

const primaryTask = (tasks) => tasks[0] || null;

(async () => {
  let updated = 0;
  for (const row of rows) {
    const site = await prisma.site.findFirst({ where: { config: { path: ['domain'], equals: row.domain } } });
    if (!site) {
      console.log('MISSING', row.domain);
      continue;
    }
    const config = site.config && typeof site.config === 'object' ? { ...site.config } : {};
    const tasks = normalizeTasks(row.tasks);
    const taskViews = { ...(config.taskViews || {}) };
    for (const task of tasks) {
      if (task === 'profile') {
        taskViews.profile = userSet.has(row.domain) ? '/user' : '/profile';
      } else if (singularViews[task]) {
        taskViews[task] = singularViews[task];
      }
    }
    const primary = primaryTask(tasks);
    const feedPath = primary === 'profile'
      ? (userSet.has(row.domain) ? '/user' : '/profile')
      : (primary && singularViews[primary]) || config.feedPath;

    await prisma.site.update({
      where: { id: site.id },
      data: {
        config: {
          ...config,
          feedPath,
          taskViews,
        },
      },
    });
    updated += 1;
    console.log('UPDATED', row.domain, feedPath);
  }
  console.log('TOTAL_UPDATED', updated);
})().catch((error) => {
  console.error(error);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
