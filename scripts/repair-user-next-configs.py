from pathlib import Path
import re, subprocess
base=Path('/Users/yashnihalani/Documents/Projects')
repos=['strathbrockparish.net','thebalibead.com','bharatamayu.com','celebriches.com','codepixelmedia.com','ladyframe.com','lashisking.com','meivera.com','murraypura.com','mysupergains.com','pquko.com']

def sh(*args,cwd=None):
    return subprocess.run(list(args), cwd=cwd, check=True, text=True, capture_output=True)
for repo in repos:
    p=base/repo
    cfg=p/'next.config.mjs'
    sh('git','fetch','origin','main',cwd=p)
    sh('git','checkout','main',cwd=p)
    sh('git','reset','--hard','origin/main',cwd=p)
    txt=cfg.read_text(errors='ignore')
    orig=txt
    txt = re.sub(r"(turbopack:\s*\{\s*root:\s*__dirname,\s*\},)\s*\{.*?\n\s*async redirects\(\)", r"\1\n\n  async redirects()", txt, flags=re.S)
    if "source: '/users'" not in txt:
        txt = txt.replace("    return [", "    return [\n      {\n        source: '/users',\n        destination: '/user',\n        permanent: true,\n      },\n      {\n        source: '/users/:slug*',\n        destination: '/user/:slug*',\n        permanent: true,\n      },", 1)
    if "source: '/user'" not in txt or "destination: '/profile'" not in txt:
        txt = re.sub(r"async rewrites\(\) \{\s*return \[(.*?)\n\s*\];\s*\}", lambda m: "async rewrites() {\n    return [" + m.group(1).rstrip() + "\n      {\n        source: '/user',\n        destination: '/profile',\n      },\n      {\n        source: '/user/:slug*',\n        destination: '/profile/:slug*',\n      },\n    ];\n  }", txt, flags=re.S)
    # ensure profile->user redirect exists only when site config uses /user
    tasks=(p/'src/config/site.tasks.ts').read_text(errors='ignore')
    if "profile: '/user'" in tasks and "source: '/profile'" not in txt:
        txt = txt.replace("    return [", "    return [\n      {\n        source: '/profile',\n        destination: '/user',\n        permanent: true,\n      },\n      {\n        source: '/profile/:slug*',\n        destination: '/user/:slug*',\n        permanent: true,\n      },", 1)
    if txt != orig:
        cfg.write_text(txt)
        sh('git','add','next.config.mjs',cwd=p)
        sh('git','commit','-m','Repair user route aliases',cwd=p)
        sh('git','push','origin','main',cwd=p)
    branches=sh('git','branch','-a',cwd=p).stdout.lower()
    if 'origin/dev' in branches or re.search(r'\bdev\b', branches):
        try:
            sh('git','checkout','dev',cwd=p)
        except subprocess.CalledProcessError:
            sh('git','checkout','-b','dev',cwd=p)
        sh('git','reset','--hard','main',cwd=p)
        sh('git','push','-f','origin','dev',cwd=p)
    sh('git','checkout','main',cwd=p)
    print('READY', repo)
