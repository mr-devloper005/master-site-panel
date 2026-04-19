from pathlib import Path
import json, subprocess

OWNER='mr-devloper005'
MASTER_PANEL_URL='https://masterpanel.seoparadox.com'
MASTER_API_URL='https://masterpanel.seoparadox.com'
rows = json.loads(Path('/Users/yashnihalani/Documents/master-site-panel/requested-site-sync-source-2026-04-19.json').read_text())
updated=[]
errors=[]
for idx,row in enumerate(rows, start=1):
    body='\n'.join([
        f'NEXT_PUBLIC_MASTER_PANEL_URL={MASTER_PANEL_URL}',
        f'NEXT_PUBLIC_MASTER_API_URL={MASTER_API_URL}',
        f'NEXT_PUBLIC_SITE_CODE={row["code"]}',
        'NEXT_PUBLIC_FEED_REVALIDATE_SECONDS=300',
        f'NEXT_PUBLIC_SITE_NAME={row["name"]}',
        f'NEXT_PUBLIC_SITE_TAGLINE={row["tagline"]}',
        f'NEXT_PUBLIC_SITE_DESCRIPTION={row["description"]}',
        f'NEXT_PUBLIC_SITE_DOMAIN={row["domain"]}',
        f'NEXT_PUBLIC_SITE_URL={row["url"]}',
        'NEXT_PUBLIC_SITE_OG_IMAGE=/og-default.png',
        'NEXT_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY=',
    ])
    repo=f'{OWNER}/{row["repo"]}'
    r=subprocess.run(['gh','secret','set','APP_ENV_PRODUCTION','--repo',repo,'--body',body],capture_output=True,text=True)
    if r.returncode==0:
        updated.append(row['repo'])
        print(f'[{idx}/{len(rows)}] updated {row["repo"]}')
    else:
        errors.append((row['repo'],r.stderr.strip() or r.stdout.strip()))
        print(f'[{idx}/{len(rows)}] ERROR {row["repo"]}: {errors[-1][1]}')
print('---SUMMARY---')
print('updated',len(updated))
print('errors',len(errors))
for repo,err in errors[:50]:
    print('ERR',repo,err)
