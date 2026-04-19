from pathlib import Path
import json, subprocess
OWNER='mr-devloper005'
rows=json.loads(Path('/Users/yashnihalani/Documents/master-site-panel/requested-site-sync-source-2026-04-19.json').read_text())
started=[]
errors=[]
for idx,row in enumerate(rows, start=1):
    repo=f'{OWNER}/{row["repo"]}'
    r=subprocess.run(['gh','workflow','run','deploy.yml','--repo',repo,'--ref','main'],capture_output=True,text=True)
    if r.returncode==0:
        started.append(row['repo'])
        print(f'[{idx}/{len(rows)}] started {row["repo"]}')
    else:
        errors.append((row['repo'], r.stderr.strip() or r.stdout.strip()))
        print(f'[{idx}/{len(rows)}] ERROR {row["repo"]}: {errors[-1][1]}')
print('---SUMMARY---')
print('started',len(started))
print('errors',len(errors))
for repo,err in errors[:50]:
    print('ERR',repo,err)
