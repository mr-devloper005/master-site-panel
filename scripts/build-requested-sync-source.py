from pathlib import Path
import json

full = json.loads(Path('/Users/yashnihalani/Documents/master-site-panel/site-sync-source-2026-04-19.json').read_text())
by_domain = {row['domain'].lower(): row for row in full}
by_repo = {row['repo'].lower(): row for row in full}
by_name = {row['name'].lower().replace(' ',''): row for row in full}

TASK_MAP = {
    'listing': 'listing',
    'business listing': 'listing',
    'article': 'article',
    'image': 'image',
    'image sharing': 'image',
    'profile': 'profile',
    'social profile': 'profile',
    'classified': 'classified',
    'sbm': 'sbm',
    'pdf': 'pdf',
}

def normalize_domain(value: str) -> str:
    return value.strip().lower()

def parse_tasks(label: str):
    raw = label.strip().lower()
    parts = [p.strip() for p in raw.replace('+', ',').split(',') if p.strip()]
    tasks=[]
    for part in parts:
        mapped = TASK_MAP.get(part)
        if mapped and mapped not in tasks:
            tasks.append(mapped)
    return tasks

def category_for(tasks):
    tset = set(tasks)
    if tset == {'article'}:
        return 'ARTICLE'
    if tset == {'profile'}:
        return 'PROFILE'
    if tset == {'image'}:
        return 'IMAGE_SHARING'
    if tset == {'sbm'}:
        return 'SBM'
    if tset == {'mediaDistribution'}:
        return 'MEDIA_DISTRIBUTION'
    if tset and tset.issubset({'listing', 'classified'}):
        return 'LOCAL_LISTING'
    return 'MULTI_TASK'

rows=[]
missing=[]
for line in Path('/Users/yashnihalani/Documents/master-site-panel/requested-site-task-map-2026-04-19.tsv').read_text().splitlines():
    if not line.strip():
        continue
    domain, label = line.split('\t', 1)
    key = normalize_domain(domain)
    row = by_domain.get(key) or by_repo.get(key) or by_name.get(key.replace('.com','').replace('.net',''))
    if not row and key == 'linkriseup.com':
        row = {
            'repo': 'linkriseup.com',
            'code': 'linkriseup-production',
            'name': 'linkriseup',
            'tagline': 'Insight-driven editorial publishing',
            'domain': 'linkriseup.com',
            'url': 'https://linkriseup.com',
            'description': 'An article-focused platform for publishing insights, commentary, and long-form content.',
            'framework': 'NEXT_JS',
        }
    if not row:
        missing.append((domain,label))
        continue
    obj = dict(row)
    obj['requestedTaskLabel'] = label.strip()
    obj['tasks'] = parse_tasks(label)
    obj['category'] = category_for(obj['tasks'])
    rows.append(obj)

out = Path('/Users/yashnihalani/Documents/master-site-panel/requested-site-sync-source-2026-04-19.json')
out.write_text(json.dumps(rows, indent=2) + '\n')
print('count', len(rows))
print('missing', len(missing))
for item in missing[:20]:
    print('MISSING', item)
print('out', out)
print(json.dumps(rows[:10], indent=2))
