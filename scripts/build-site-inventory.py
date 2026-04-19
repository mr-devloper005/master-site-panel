from pathlib import Path
import json, re

ROOT = Path('/Users/yashnihalani/Documents/Projects')
OUT = Path('/Users/yashnihalani/Documents/master-site-panel/site-inventory-2026-04-19.json')
SKIP = {'site-base-template', 'mediaDistribution-site-base-template', 'Seo-paradox'}

identity_re = {
    'code': re.compile(r"code:\s*process\.env\.NEXT_PUBLIC_SITE_CODE\s*\|\|\s*'([^']+)'"),
    'name': re.compile(r"name:\s*process\.env\.NEXT_PUBLIC_SITE_NAME\s*\|\|\s*'([^']+)'"),
    'tagline': re.compile(r"tagline:\s*process\.env\.NEXT_PUBLIC_SITE_TAGLINE\s*\|\|\s*'([^']+)'"),
    'domain': re.compile(r"domain:\s*process\.env\.NEXT_PUBLIC_SITE_DOMAIN\s*\|\|\s*'([^']+)'"),
    'url': re.compile(r"url:\s*process\.env\.NEXT_PUBLIC_SITE_URL\s*\|\|\s*'([^']+)'"),
}

def parse_identity(text: str):
    data = {}
    for k, pat in identity_re.items():
        m = pat.search(text)
        data[k] = m.group(1) if m else ''
    desc_m = re.search(r"description:\s*\n\s*process\.env\.NEXT_PUBLIC_SITE_DESCRIPTION\s*\|\|\s*\n\s*'([^']*)'", text)
    if not desc_m:
        desc_m = re.search(r"description:\s*process\.env\.NEXT_PUBLIC_SITE_DESCRIPTION\s*\|\|\s*'([^']*)'", text)
    data['description'] = desc_m.group(1) if desc_m else ''
    return data

def parse_tasks(text: str):
    tasks = []
    blocks = re.findall(r"\{(.*?)\}", text, re.S)
    for block in blocks:
        km = re.search(r"key:\s*'([^']+)'", block)
        em = re.search(r"enabled:\s*(true|false)", block)
        if km and em and em.group(1) == 'true':
            tasks.append(km.group(1))
    return tasks

rows = []
for repo in sorted(ROOT.iterdir()):
    if repo.name in SKIP or not (repo/'.git').exists():
        continue
    identity_path = repo/'src/config/site.identity.ts'
    tasks_path = repo/'src/config/site.tasks.ts'
    if not identity_path.exists() or not tasks_path.exists():
        continue
    identity = parse_identity(identity_path.read_text())
    tasks = parse_tasks(tasks_path.read_text())
    if not identity.get('code') or not identity.get('name'):
        continue
    rows.append({
        'repo': repo.name,
        **identity,
        'tasks': tasks,
    })

OUT.write_text(json.dumps(rows, indent=2) + '\n')
print('count', len(rows))
print('out', OUT)
print(json.dumps(rows[:5], indent=2))
