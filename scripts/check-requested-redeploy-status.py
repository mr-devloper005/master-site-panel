from pathlib import Path
import json, subprocess
OWNER='mr-devloper005'
rows=json.loads(Path('/Users/yashnihalani/Documents/master-site-panel/requested-site-sync-source-2026-04-19.json').read_text())
results=[]
for idx,row in enumerate(rows, start=1):
    repo=row['repo']
    endpoint=f'repos/{OWNER}/{repo}/actions/workflows/deploy.yml/runs?per_page=5'
    r=subprocess.run(['gh','api',endpoint],capture_output=True,text=True)
    if r.returncode!=0:
        results.append({'repo':repo,'status':'error','conclusion':'api_error','detail':r.stderr.strip() or r.stdout.strip()})
        continue
    data=json.loads(r.stdout)
    runs=data.get('workflow_runs',[])
    run=runs[0] if runs else None
    if not run:
        results.append({'repo':repo,'status':'missing','conclusion':'no_runs'})
        continue
    results.append({
        'repo':repo,
        'status':run.get('status'),
        'conclusion':run.get('conclusion'),
        'run_id':run.get('id'),
        'created_at':run.get('created_at'),
        'updated_at':run.get('updated_at'),
        'url':run.get('html_url'),
    })

out=Path('/Users/yashnihalani/Documents/master-site-panel/requested-redeploy-status-2026-04-19.json')
out.write_text(json.dumps(results, indent=2)+'\n')
from collections import Counter
c=Counter((x['status'], x.get('conclusion')) for x in results)
print('total', len(results))
for k,v in sorted(c.items()):
    print(k, v)
print('out', out)
print('---FAILED---')
for x in results:
    if x['status']=='completed' and x.get('conclusion')!='success':
        print(x['repo'], x.get('conclusion'), x.get('url'))
print('---IN_PROGRESS---')
for x in results:
    if x['status']!='completed':
        print(x['repo'], x['status'], x.get('url'))
