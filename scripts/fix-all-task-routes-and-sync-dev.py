from pathlib import Path
import re, subprocess

base = Path('/Users/yashnihalani/Documents/Projects')
repos = [
'apcreatiu.com','welldanet.com','rentalhiso.com','lasheminence.com','enginecrib.com','dlkautoparts.com','miplaninvu.com','moonrocketcoin.net','interawesome.com','upgreeno.com','deswebcol.com','shindantool.com','safehavenannuity.com','netpromine.com','starcoworkers.com','rayantav.com','mudatealaweb.com','spinevivo.com','datazynxllc.com','yehwooyeh.com','beingadviser.com','ideovera.com','maytapbung.net','isanexpert.com','webweaversonline.com','choose-your-car.com','cabanalaemilia.com','happysignups.com','marketingsspot.com','digitalvirtuose.com','mujugranfondo.com','jagothemes.com','uplandcommerce.com','callgadgets.com','tobeetoetech.com','agenisfree.com','lodenews.com','rajsattimart.com','finscoastal.com','bokunotrends.com','djlservicios.com','mikegabsolution.com','vaultofjoseph.com','jiyinaicha.com','callredcape.com','teebute.com','sendingsos.com','habibyasmaharun.com','fullprokey.com','winonaj.com','wiliin.com','alefcoach.com','josoore.com','techonlineinfo.com','techdemais.com','fluxyogaretreats.com','blogmiki.com','choicemakerscrew.com','passionunchained.com','dotsdeveloper.com','fermenterspirit.com','josephlaoutaris.com','aidteck.com','mindful-lotus.com','webmansax.com','viscountwhite.com','fflowlink.com','empoweryouroad.com','floatyourbrand.com','blacktiefuture.com','noroadsideas.com','gutsbranding.com','sandlore.com','arcanumwebs.com','infoplatforms.com','devcybernexus.com','motivkit.com','mysterycoder.com','ruihanchemical.com','techmixbr.com','switchhigh.com','sinclair-theme.com','septemberzodiac.com','obsidianimpacts.com','newsportalweekly.com','steadfastresults.com','futurethey.com','comtelesis.net','kayosportconnect.com','khaosaddon.com','worldworthwandering.com','mikebrewereconomics.com','codepixelmedia.com','tynewebdesign.com','radianpark.com','lashisking.com','softkilldesign.com','tabsocal.com','housesdecors.com','aporiakennels.com','thebalibead.com','scoreminers.com','linedesing.com','thetinytierant.com','helloartcity.com','frocadeco.com','hiddengemsreno.com','ethicsites.com','lakesforocean.com','digi-optic.com','emeraldtoucanet.com','totebagus.com','creativeguyink.com','kong-vr.com','teddyandkitty.com','oscarcrea.com','pixelwebio.com','redesocialpro.com','earthskydesign.com','topoftheloop.com','teeny-weenytoes.com','railsfreaks.com','mootankala.com','nubsant.com','webinfinityhub.com','herotherblog.com','creationtable.com','macphersonweb.com','wedropouts.com','studiodiamond.net','youngerlifestyle.net','ultimorecursoh.com','alwadidates.com','pcosremedy.com','quickoye.com','murraypura.com','pquko.com','pkkwb.com','meivera.com','mysupergains.com','sourosa.com','strathbrockparish.net','ladyframe.com','bharatamayu.com','celebriches.com','bugscast.com','digginfordirt.com','trippinbros.com','cooltapas.com','threebykeep.com','altmeetyou.com','mattralston.net','treasurenftcode.com','singpre.com','guadalupepro.com'
]

route_map = {
    'article': ('Article', '/article', 'article'),
    'listing': ('Business Listing', '/listing', 'listing'),
    'classified': ('Classified', '/classified', 'classified'),
    'image': ('Image', '/image', 'image'),
    'profile': ('Profile', '/profile', 'profile'),
    'pdf': ('PDF', '/pdf', 'pdf'),
    'sbm': ('Social Bookmarking', '/sbm', 'sbm'),
    'social': ('Social Bookmarking', '/community', 'social'),
    'comment': ('Comment', '/blog', 'comment'),
    'org': ('Organization', '/team', 'org'),
}

user_sites = {'macphersonweb.com','wedropouts.com','ultimorecursoh.com','murraypura.com','pquko.com','meivera.com','strathbrockparish.net','ladyframe.com','bharatamayu.com','celebriches.com','altmeetyou.com','treasurenftcode.com'}


def sh(*args, cwd=None):
    return subprocess.run(list(args), cwd=cwd, check=True, text=True, capture_output=True)


def repl_block(block, key, label, route, ctype):
    block = re.sub(r"label:\s*'[^']*'", f"label: '{label}'", block)
    block = re.sub(r"route:\s*'[^']*'", f"route: '{route}'", block)
    block = re.sub(r"contentType:\s*'[^']*'", f"contentType: '{ctype}'", block)
    return block

for repo in repos:
    rpath = base/repo
    tasks = rpath/'src/config/site.tasks.ts'
    if not tasks.exists():
        print('SKIP missing', repo, flush=True)
        continue
    print('CHECK', repo, flush=True)
    sh('git','fetch','origin','main', cwd=rpath)
    sh('git','checkout','main', cwd=rpath)
    sh('git','reset','--hard','origin/main', cwd=rpath)
    sh('git','clean','-fd', cwd=rpath)
    txt = tasks.read_text(errors='ignore')
    orig = txt
    for key, (label, route, ctype) in route_map.items():
        route_final = '/user' if key == 'profile' and repo in user_sites else route
        label_final = 'User' if key == 'profile' and repo in user_sites else label
        pattern = re.compile(r"\{\s*key:\s*'" + re.escape(key) + r"'\s*,.*?\}", re.S)
        def _repl(m):
            return repl_block(m.group(0), key, label_final, route_final, ctype)
        txt = pattern.sub(_repl, txt)
        txt = re.sub(rf"({key}\s*:\s*\{{\s*route:\s*')([^']+)('\s*,\s*label:\s*')([^']+)('\s*\}})", rf"\1{route_final}\3{label_final}\5", txt)
    if txt == orig:
        print('NOOP', repo, flush=True)
        continue
    tasks.write_text(txt)
    sh('git','add','src/config/site.tasks.ts', cwd=rpath)
    sh('git','commit','-m','Normalize all task routes to singular paths', cwd=rpath)
    sh('git','push','origin','main', cwd=rpath)
    # sync dev from main if remote/local dev exists
    branches = sh('git','branch','-a', cwd=rpath).stdout.lower()
    if 'origin/dev' in branches or re.search(r'\bdev\b', branches):
        try:
            sh('git','checkout','dev', cwd=rpath)
        except subprocess.CalledProcessError:
            sh('git','checkout','-b','dev', cwd=rpath)
        sh('git','reset','--hard','main', cwd=rpath)
        try:
            sh('git','push','-f','origin','dev', cwd=rpath)
            print('SYNCED_DEV', repo, flush=True)
        except subprocess.CalledProcessError:
            print('DEV_PUSH_FAILED', repo, flush=True)
    sh('git','checkout','main', cwd=rpath)
