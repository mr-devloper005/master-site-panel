from pathlib import Path
import subprocess, re
base=Path('/Users/yashnihalani/Documents/Projects')
repos=['strathbrockparish.net','thebalibead.com','bharatamayu.com','celebriches.com','codepixelmedia.com','ladyframe.com','lashisking.com','meivera.com','murraypura.com','mysupergains.com','pquko.com']
redir = """
      {
        source: '/users',
        destination: '/user',
        permanent: true,
      },
      {
        source: '/users/:slug*',
        destination: '/user/:slug*',
        permanent: true,
      },"""
rewrite = """
      {
        source: '/user',
        destination: '/profile',
      },
      {
        source: '/user/:slug*',
        destination: '/profile/:slug*',
      },"""

def sh(*args,cwd=None):
    return subprocess.run(list(args),cwd=cwd,check=True,text=True,capture_output=True)
for repo in repos:
    p=base/repo
    cfg=p/'next.config.mjs'
    if not cfg.exists():
        print('SKIP',repo)
        continue
    sh('git','fetch','origin','main',cwd=p)
    sh('git','checkout','main',cwd=p)
    sh('git','reset','--hard','origin/main',cwd=p)
    txt=cfg.read_text(errors='ignore')
    orig=txt
    if "source: '/user/:slug*'" not in txt:
        m=re.search(r"async rewrites\(\) \{\s*return \[(.*?)\n\s*\];\s*\}",txt,re.S)
        if m:
            txt=txt[:m.start(1)] + m.group(1).rstrip() + rewrite + txt[m.end(1):]
    if "source: '/users/:slug*'" not in txt:
        m=re.search(r"async redirects\(\) \{\s*return \[(.*?)\n\s*\];\s*\}",txt,re.S)
        if m:
            txt=txt[:m.start(1)] + m.group(1).rstrip() + redir + txt[m.end(1):]
    if txt==orig:
        print('NOOP',repo)
    else:
        cfg.write_text(txt)
        sh('git','add','next.config.mjs',cwd=p)
        sh('git','commit','-m','Add user route alias for profile pages',cwd=p)
        sh('git','push','origin','main',cwd=p)
        print('PATCHED',repo)
    branches=sh('git','branch','-a',cwd=p).stdout.lower()
    if 'origin/dev' in branches or re.search(r'\bdev\b',branches):
        try:
            sh('git','checkout','dev',cwd=p)
        except subprocess.CalledProcessError:
            sh('git','checkout','-b','dev',cwd=p)
        sh('git','reset','--hard','main',cwd=p)
        sh('git','push','-f','origin','dev',cwd=p)
        print('SYNCED_DEV',repo)
    sh('git','checkout','main',cwd=p)
