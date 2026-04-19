from pathlib import Path
import json

inv_path = Path('/Users/yashnihalani/Documents/master-site-panel/site-inventory-2026-04-19.json')
vps_path = Path('/Users/yashnihalani/Documents/master-site-panel/main-vps-env-export-2026-04-19.tsv')
out_path = Path('/Users/yashnihalani/Documents/master-site-panel/site-sync-source-2026-04-19.json')

inventory = json.loads(inv_path.read_text())
by_repo = {row['repo']: row for row in inventory}

for line in vps_path.read_text().splitlines():
    parts = line.split('\t')
    if len(parts) < 4:
        continue
    repo, code, _domain, _url = parts[:4]
    if repo in by_repo and code:
        by_repo[repo]['code'] = code

for row in by_repo.values():
    tasks = row.get('tasks', [])
    tset = set(tasks)
    if tset == {'article'}:
        category = 'ARTICLE'
    elif tset == {'mediaDistribution'}:
        category = 'MEDIA_DISTRIBUTION'
    elif tset == {'profile'}:
        category = 'PROFILE'
    elif tset == {'image'}:
        category = 'IMAGE_SHARING'
    elif tset == {'sbm'}:
        category = 'SBM'
    elif tset and tset.issubset({'listing', 'classified'}):
        category = 'LOCAL_LISTING'
    else:
        category = 'MULTI_TASK'
    row['category'] = category
    row['framework'] = 'NEXT_JS'

rows = sorted(by_repo.values(), key=lambda r: r['repo'])
out_path.write_text(json.dumps(rows, indent=2) + '\n')
print('count', len(rows))
print('out', out_path)
print(json.dumps(rows[:10], indent=2))
