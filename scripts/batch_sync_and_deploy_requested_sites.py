#!/usr/bin/env python3
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

WORKSPACE = Path('/Users/yashnihalani/Documents/master-site-panel')
PROJECTS = Path('/Users/yashnihalani/Documents/Projects')
DEPLOY_SCRIPT = WORKSPACE / 'scripts' / 'deploy-site-vps.sh'
RESULTS_PATH = WORKSPACE / 'batch-sync-deploy-results.json'

DOMAINS = [
'apcreatiu.com','WellDanet.com','rentalhiso.com','lasheminence.com','EngineCrib.com','dlkautoparts.com','miplaninvu.com','MoonRocketCoin.net','interawesome.com','upgreeno.com','deswebcol.com','shindantool.com','safehavenannuity.com','netpromine.com','starcoworkers.com','rayantav.com','mudatealaweb.com','spinevivo.com','datazynxllc.com','yehwooyeh.com','beingadviser.com','ideovera.com','maytapbung.net','isanexpert.com','webweaversonline.com','choose-your-car.com','CabanAlaeMilia.com','happysignups.com','marketingsspot.com','digitalvirtuose.com','mujugranfondo.com','jagothemes.com','uplandcommerce.com','callgadgets.com','tobeetoetech.com','agenisfree.com','lodenews.com','rajsattimart.com','FinsCoastal.com','bokunotrends.com','djlservicios.com','mikegabsolution.com','vaultofjoseph.com','jiyinaicha.com','callredcape.com','teebute.com','sendingsos.com','habibyasmaharun.com','fullprokey.com','winonaj.com','wiliin.com','Linkriseup.com','alefcoach.com','josoore.com','techonlineinfo.com','techdemais.com','fluxyogaretreats.com','blogmiki.com','choicemakerscrew.com','passionunchained.com','dotsdeveloper.com','fermenterspirit.com','josephlaoutaris.com','aidteck.com','mindful-lotus.com','webmansax.com','viscountwhite.com','fflowlink.com','empoweryouroad.com','floatyourbrand.com','blacktiefuture.com','noroadsideas.com','gutsbranding.com','sandlore.com','arcanumwebs.com','infoplatforms.com','devcybernexus.com','motivkit.com','mysterycoder.com','ruihanchemical.com','techmixbr.com','switchhigh.com','sinclair-theme.com','septemberzodiac.com','obsidianimpacts.com','webwavecom.com','newsportalweekly.com','steadfastresults.com','futurethey.com','ComTelesis.net','kayosportconnect.com','KhaosAddon.com','WorldWorthWandering.com','MikeBrewerEconomics.com','codepixelmedia.com','tynewebdesign.com','radianpark.com','lashisking.com','SoftKillDesign.com','TabSocal.com','housesdecors.com','aporiakennels.com','TheBaliBead.com','scoreminers.com','linedesing.com','thetinytierant.com','helloartcity.com','frocadeco.com','hiddengemsreno.com','ethicsites.com','lakesforocean.com','digi-optic.com','emeraldtoucanet.com','totebagus.com','creativeguyink.com','kong-vr.com','teddyandkitty.com','oscarcrea.com','pixelwebio.com','redesocialpro.com','earthskydesign.com','topoftheloop.com','teeny-weenytoes.com','railsfreaks.com','mootankala.com','nubsant.com','webinfinityhub.com','herotherblog.com','creationtable.com','macphersonweb.com','wedropouts.com','studiodiamond.net','youngerlifestyle.net','ultimorecursoh.com','alwadidates.com','pcosremedy.com','quickoye.com','murraypura.com','pquko.com','pkkwb.com','meivera.com','mysupergains.com','sourosa.com','StrathBrockParish.net','ladyframe.com','bharatamayu.com','celebriches.com','bugscast.com','digginfordirt.com','trippinbros.com','cooltapas.com','threebykeep.com','altmeetyou.com','MattRAlston.net','treasurenftcode.com','singpre.com','guadalupepro.com'
]

INVENTORY_FILES = [
    'site-sync-source-2026-04-19.json',
    'new-sites-2026-04-23.json',
    'site-inventory-2026-04-19.json',
    'site-sync-source-2026-04-24.json',
    'site-sync-source-2026-04-26.json',
    'requested-site-sync-source-2026-04-24-additions.json',
    'requested-site-sync-source-2026-04-20-metadata.json',
    'requested-site-sync-source-2026-04-19.json',
]


def load_inventory():
    lookup = {}
    for fn in INVENTORY_FILES:
        path = WORKSPACE / fn
        if not path.exists():
            continue
        with path.open() as fh:
            data = json.load(fh)
        if isinstance(data, dict):
            data = data.get('sites') or data.get('items') or []
        if not isinstance(data, list):
            continue
        for row in data:
            dom = (row.get('domain') or row.get('siteUrl') or row.get('baseUrl') or row.get('url') or '').replace('https://','').replace('http://','').strip('/').lower()
            if not dom:
                continue
            lookup.setdefault(dom, []).append(row)
    return lookup


def find_repo(domain: str) -> Path | None:
    exact = PROJECTS / domain
    if exact.exists():
        return exact
    lower = domain.lower()
    for child in PROJECTS.iterdir():
        if child.name.lower() == lower:
            return child
    return None


def parse_port(repo: Path) -> int | None:
    compose = repo / 'docker-compose.vps.yml'
    if compose.exists():
        text = compose.read_text(errors='ignore')
        m = re.search(r'127\.0\.0\.1:(\d+):3000', text)
        if not m:
            m = re.search(r'"(\d+):3000"', text)
        if m:
            return int(m.group(1))
    env_example = repo / '.env.example'
    if env_example.exists():
        text = env_example.read_text(errors='ignore')
        m = re.search(r'NEXT_PUBLIC_SITE_CODE=([^\n\r]+)', text)
    return None


def resolve_meta(domain: str, inventory: dict, repo: Path):
    rows = inventory.get(domain.lower(), [])
    preferred = None
    for row in rows:
        if row.get('port') and row.get('siteCode'):
            preferred = row
            break
    if not preferred and rows:
        preferred = rows[0]
    site_code = preferred.get('siteCode') if preferred else None
    site_name = preferred.get('name') if preferred else None
    port = preferred.get('port') if preferred else None

    env_example = repo / '.env.example'
    if env_example.exists():
        text = env_example.read_text(errors='ignore')
        if not site_code:
            m = re.search(r'NEXT_PUBLIC_SITE_CODE=([^\n\r]+)', text)
            if m:
                site_code = m.group(1).strip()
        if not site_name:
            m = re.search(r'NEXT_PUBLIC_SITE_NAME=([^\n\r]+)', text)
            if m:
                site_name = m.group(1).strip()
    if not port:
        port = parse_port(repo)
    if not site_name:
        site_name = repo.stem.replace('-', ' ').replace('_', ' ').title()
    return site_code, site_name, port, preferred


def run(cmd, cwd=None):
    return subprocess.run(cmd, cwd=cwd, text=True, capture_output=True)


def run_checked(cmd, cwd=None):
    proc = run(cmd, cwd=cwd)
    if proc.returncode != 0:
        raise RuntimeError(f"cmd failed: {' '.join(cmd)}\nstdout:\n{proc.stdout}\nstderr:\n{proc.stderr}")
    return proc


def sync_repo(repo: Path):
    actions = []
    # User approved overwriting local state; clear any partial merge/rebase before syncing.
    run(['git','merge','--abort'], cwd=repo)
    run(['git','rebase','--abort'], cwd=repo)
    run(['git','reset','--hard'], cwd=repo)
    run(['git','clean','-fd'], cwd=repo)
    run_checked(['git','fetch','origin','main'], cwd=repo)
    main_exists = run(['git','show-ref','--verify','--quiet','refs/heads/main'], cwd=repo).returncode == 0
    if main_exists:
        run_checked(['git','checkout','-f','main'], cwd=repo)
    else:
        run_checked(['git','checkout','-B','main','origin/main'], cwd=repo)
    run_checked(['git','reset','--hard','origin/main'], cwd=repo)
    actions.append('main_reset_to_origin/main')

    remote_dev = run(['git','ls-remote','--exit-code','--heads','origin','dev'], cwd=repo).returncode == 0
    if remote_dev:
        run_checked(['git','checkout','-B','dev','main'], cwd=repo)
        run_checked(['git','push','--force','origin','dev'], cwd=repo)
        actions.append('dev_force_synced_to_main')
    else:
        run_checked(['git','checkout','-B','dev','main'], cwd=repo)
        run_checked(['git','push','-u','origin','dev'], cwd=repo)
        actions.append('dev_created_from_main')
    run_checked(['git','checkout','main'], cwd=repo)
    return actions


def deploy(domain: str, site_code: str, site_name: str, port: int):
    proc = subprocess.run([str(DEPLOY_SCRIPT), domain, site_code, site_name, str(port)], cwd=WORKSPACE, text=True, capture_output=True)
    return proc


def main():
    inventory = load_inventory()
    results = []
    for idx, raw_domain in enumerate(DOMAINS, start=1):
        domain = raw_domain.strip()
        domain_l = domain.lower()
        result = {'domain': domain, 'ok': False}
        print(f'[{idx}/{len(DOMAINS)}] {domain}', flush=True)
        repo = find_repo(domain)
        if not repo:
            result['error'] = 'repo_not_found'
            results.append(result)
            continue
        result['repo'] = str(repo)
        try:
            site_code, site_name, port, source = resolve_meta(domain, inventory, repo)
            result['site_code'] = site_code
            result['site_name'] = site_name
            result['port'] = port
            result['source'] = source
            if not site_code or not port:
                raise RuntimeError(f'missing deploy metadata: site_code={site_code!r} port={port!r}')
            result['sync_actions'] = sync_repo(repo)
            dep = deploy(domain_l, site_code, site_name, port)
            result['deploy_returncode'] = dep.returncode
            result['deploy_stdout_tail'] = dep.stdout[-4000:]
            result['deploy_stderr_tail'] = dep.stderr[-4000:]
            result['ok'] = dep.returncode == 0
            if not result['ok']:
                result['error'] = 'deploy_failed'
        except Exception as exc:
            result['error'] = str(exc)
        results.append(result)
        RESULTS_PATH.write_text(json.dumps(results, indent=2))
        print(f"  -> {'OK' if result['ok'] else 'FAIL'}", flush=True)
    RESULTS_PATH.write_text(json.dumps(results, indent=2))
    total = len(results)
    ok = sum(1 for r in results if r.get('ok'))
    print(f'completed {ok}/{total} ok')
    return 0 if ok == total else 1

if __name__ == '__main__':
    sys.exit(main())
