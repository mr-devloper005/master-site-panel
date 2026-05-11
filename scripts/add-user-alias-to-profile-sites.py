from pathlib import Path
import subprocess, re

base = Path('/Users/yashnihalani/Documents/Projects')
repos = []
for repo in sorted(base.iterdir()):
    if not repo.is_dir():
        continue
    if (repo/'src/app/profile').exists() and (repo/'next.config.mjs').exists():
        repos.append(repo)

user_rewrites = """
      {
        source: '/user',
        destination: '/profile',
      },
      {
        source: '/user/:slug*',
        destination: '/profile/:slug*',
      },"""

user_redirects = """
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


def sh(*args, cwd=None):
    return subprocess.run(list(args), cwd=cwd, check=True, text=True, capture_output=True)

for repo in repos:
    cfg = repo/'next.config.mjs'
    txt = cfg.read_text(errors='ignore')
    orig = txt
    if "source: '/user/:slug*'" not in txt:
        m = re.search(r"async rewrites\(\) \{\s*return \[(.*?)\n\s*\];\s*\}", txt, re.S)
        if m:
            inner = m.group(1)
            new_inner = inner.rstrip() + user_rewrites
            txt = txt[:m.start(1)] + new_inner + txt[m.end(1):]
    if "source: '/users/:slug*'" not in txt:
        m = re.search(r"async redirects\(\) \{\s*return \[(.*?)\n\s*\];\s*\}", txt, re.S)
        if m:
            inner = m.group(1)
            new_inner = inner.rstrip() + user_redirects
            txt = txt[:m.start(1)] + new_inner + txt[m.end(1):]
    if txt == orig:
        continue
    cfg.write_text(txt)
    sh('git','fetch','origin','main', cwd=repo)
    sh('git','checkout','main', cwd=repo)
    sh('git','reset','--hard','origin/main', cwd=repo)
    cfg.write_text(txt)
    sh('git','add','next.config.mjs', cwd=repo)
    sh('git','commit','-m','Add user route alias for profile pages', cwd=repo)
    sh('git','push','origin','main', cwd=repo)
    branches = sh('git','branch','-a', cwd=repo).stdout.lower()
    if 'origin/dev' in branches or re.search(r'\bdev\b', branches):
        try:
            sh('git','checkout','dev', cwd=repo)
        except subprocess.CalledProcessError:
            sh('git','checkout','-b','dev', cwd=repo)
        sh('git','reset','--hard','main', cwd=repo)
        sh('git','push','-f','origin','dev', cwd=repo)
    sh('git','checkout','main', cwd=repo)
    print('FIXED', repo.name, flush=True)
