#!/usr/bin/env python3
from __future__ import annotations

import json
import random
import re
import secrets
import shutil
import string
import subprocess
from pathlib import Path

PROJECTS = Path("/Users/yashnihalani/Documents/Projects")
OWNER = "mr-devloper005"
VPS_HOST = "187.127.153.39"
VPS_PORT = "22"
VPS_USER = "root"
MASTER_URL = "https://masterpanel.seoparadox.com"
START_PORT = 3140
SEED = 20260513

TARGETS = [
    ("PRNowe.com", "press.prnowe.com", "/press"),
    ("Feedopr.com", "release.feedopr.com", "/release"),
    ("iodailynews.com", "news.iodailynews.com", "/news"),
    ("releaseprCore.com", "release.releaseprcore.com", "/release"),
    ("NewsTapy.com", "lifestyle.newstapy.com", "/news"),
    ("HutdailyNews.com", "lifestyle.hutdailynews.com", "/news"),
    ("Mediyao.com", "lifestyle.mediyao.com", "/media"),
    ("MediyaHub.com", "media.mediyahub.com", "/media-distribution"),
    ("Medianewsqo.com", "news.medianewsqo.com", "/news"),
    ("socialMedixy.com", "lifestyle.socialmedixy.com", "/online-media"),
    ("SocioPR.com", "business.sociopr.com", "/public-relation"),
    ("mediaSocTrend.com", "business.mediasoctrend.com", "/media-network"),
    ("TrendoPR.com", "markets.trendopr.com", "/press-release"),
    ("Presslyy.com", "press.presslyy.com", "/press"),
    ("ViroBuzz.com", "lifestyle.virobuzz.com", "/news"),
    ("TrendioPR.com", "markets.trendiopr.com", "/press-release"),
    ("Zorvixy.com", "press.zorvixy.com", "/directory-press"),
    ("Mediavoxer.com", "media.mediavoxer.com", "/media"),
    ("Narrixa.com", "press.narrixa.com", "/press"),
    ("ElitePressa.com", "business.elitepressa.com", "/press"),
    ("GlobalPressy.com", "markets.globalpressy.com", "/press-release"),
    ("Authixo.com", "business.authixo.com", "/public-relation"),
    ("Xyntraa.com", "business.xyntraa.com", "/press"),
    ("Growthixa.com", "business.growthixa.com", "/business"),
    ("Authorityxa.com", "business.authorityxa.com", "/press"),
    ("nydailynet.com", "stocks.nydailynet.com", "/news"),
    ("newsprline.com", "business.newsprline.com", "/news-agency"),
]

SOURCES = [
    "Feedopr.com", "iodailynews.com", "releaseprCore.com", "NewsTapy.com",
    "HutdailyNews.com", "Mediyao.com", "MediyaHub.com", "Medianewsqo.com",
    "socialMedixy.com", "SocioPR.com", "mediaSocTrend.com", "TrendoPR.com",
    "Presslyy.com", "ViroBuzz.com", "TrendioPR.com", "pressnbcnews.com",
    "updateprnews.com", "PRnews18.com", "bestpressnews.com", "24x7newspress.com",
    "currentprpress.com", "bestprnews24.com", "dailytrendpress.com",
    "expressainewsdaily.com", "globalbriefingai.com", "globalnewsdock.com",
    "top24headline.com", "media24press.com", "newsprline.com", "newsheadlinepro.com",
    "newsinsightzone.com", "newsnavipress.com", "prnewsprimezone.com",
    "newsmidcentral.com", "reporterahead.com", "worldreporter24x7.com",
    "Zorvixy.com", "Mediavoxer.com", "Narrixa.com", "ElitePressa.com",
    "GlobalPressy.com", "Authixo.com", "Xyntraa.com", "Growthixa.com",
    "Authorityxa.com", "dailyhubglobal.com", "worldtopreport.com",
    "nybusinessinsights.com", "PRNowe.com", "hubusatoday.com", "nydailynet.com",
]

SKIP_COPY = {".git", "node_modules", ".next", ".turbo"}


def run(args: list[str], *, cwd: Path | None = None, input_text: str | None = None) -> str:
    proc = subprocess.run(
        args,
        cwd=str(cwd) if cwd else None,
        input=input_text,
        text=True,
        capture_output=True,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"{' '.join(args)} failed:\n{proc.stdout}\n{proc.stderr}")
    return proc.stdout.strip()


def repo_path(name: str) -> Path:
    wanted = name.lower()
    for path in PROJECTS.iterdir():
        if path.is_dir() and path.name.lower() == wanted:
            return path
    return PROJECTS / name.lower()


def pretty_name(host: str) -> str:
    left = host.split(".", 1)[0].replace("-", " ")
    parent = host.split(".")[1].replace("-", " ")
    return " ".join(word.capitalize() for word in f"{left} {parent}".split())


def new_code() -> str:
    alphabet = string.ascii_lowercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(10))


def copy_repo(source: Path, target: Path) -> None:
    if target.exists():
        if (target / ".git").exists():
            return
        shutil.rmtree(target)
    shutil.copytree(source, target, ignore=shutil.ignore_patterns(*SKIP_COPY))


def replace_identity(target: Path, code: str, host: str, name: str) -> None:
    identity = target / "src/config/site.identity.ts"
    text = identity.read_text()
    desc = f"A media-distribution newsroom for announcements, coverage, and press updates on {name}."
    text = re.sub(r"code: process\.env\.NEXT_PUBLIC_SITE_CODE \|\| '.*?'", f"code: process.env.NEXT_PUBLIC_SITE_CODE || '{code}'", text)
    text = re.sub(r"name: process\.env\.NEXT_PUBLIC_SITE_NAME \|\| '.*?'", f"name: process.env.NEXT_PUBLIC_SITE_NAME || '{name}'", text)
    text = re.sub(r"tagline: process\.env\.NEXT_PUBLIC_SITE_TAGLINE \|\| '.*?'", "tagline: process.env.NEXT_PUBLIC_SITE_TAGLINE || 'Independent media updates'", text)
    text = re.sub(
        r"process\.env\.NEXT_PUBLIC_SITE_DESCRIPTION \|\|\n\s+'.*?'",
        f"process.env.NEXT_PUBLIC_SITE_DESCRIPTION ||\n    '{desc}'",
        text,
        flags=re.S,
    )
    text = re.sub(r"domain: process\.env\.NEXT_PUBLIC_SITE_DOMAIN \|\| '.*?'", f"domain: process.env.NEXT_PUBLIC_SITE_DOMAIN || '{host}'", text)
    text = re.sub(r"url: process\.env\.NEXT_PUBLIC_SITE_URL \|\| '.*?'", f"url: process.env.NEXT_PUBLIC_SITE_URL || 'https://{host}'", text)
    identity.write_text(text)


def replace_route(target: Path, route: str) -> None:
    tasks = target / "src/config/site.tasks.ts"
    text = tasks.read_text()
    text = re.sub(r"route:\s*'[^']+'", f"route: '{route}'", text, count=1)
    text = re.sub(r"mediaDistribution:\s*'[^']+'", f"mediaDistribution: '{route}'", text, count=1)
    tasks.write_text(text)

    old = target / "src/app/updates"
    new = target / "src/app" / route.strip("/")
    if old.exists() and new != old:
        if new.exists():
            shutil.rmtree(new)
        shutil.copytree(old, new)

    for path in [
        target / "src/config/site.content.ts",
        target / "src/app/page.tsx",
        target / "src/components/tasks/task-list-page.tsx",
    ]:
        if path.exists():
            path.write_text(path.read_text().replace("/updates", route))


def write_env(target: Path, code: str, host: str, name: str) -> str:
    desc = f"A media-distribution newsroom for announcements, coverage, and press updates on {name}."
    env = "\n".join([
        f"NEXT_PUBLIC_MASTER_PANEL_URL={MASTER_URL}",
        f"NEXT_PUBLIC_MASTER_API_URL={MASTER_URL}",
        f"NEXT_PUBLIC_SITE_CODE={code}",
        "NEXT_PUBLIC_FEED_REVALIDATE_SECONDS=300",
        "",
        f"NEXT_PUBLIC_SITE_NAME={name}",
        "NEXT_PUBLIC_SITE_TAGLINE=Independent media updates",
        f"NEXT_PUBLIC_SITE_DESCRIPTION={desc}",
        f"NEXT_PUBLIC_SITE_DOMAIN={host}",
        f"NEXT_PUBLIC_SITE_URL=https://{host}",
        "NEXT_PUBLIC_SITE_OG_IMAGE=/og-default.png",
        "NEXT_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY=",
        "",
    ])
    (target / ".env.example").write_text(env)
    return env


def update_compose(target: Path, code: str, port: int) -> None:
    compose = target / "docker-compose.vps.yml"
    text = compose.read_text()
    text = re.sub(r"services:\n\s+[A-Za-z0-9_-]+:", f"services:\n  {code}:", text, count=1)
    text = re.sub(r"container_name:\s*[A-Za-z0-9_-]+", f"container_name: {code}_app", text, count=1)
    text = re.sub(r'127\.0\.0\.1:\d+:3000', f"127.0.0.1:{port}:3000", text, count=1)
    compose.write_text(text)


def update_workflow(target: Path, name: str) -> None:
    workflow = target / ".github/workflows/deploy.yml"
    text = workflow.read_text()
    text = re.sub(r"name:\s*Deploy .*? VPS", f"name: Deploy {name} VPS", text, count=1)
    workflow.write_text(text)


def write_codeowners(target: Path) -> None:
    codeowners = target / ".github/CODEOWNERS"
    codeowners.parent.mkdir(parents=True, exist_ok=True)
    codeowners.write_text(
        "\n".join([
            "# Logic and deployment surfaces require owner review.",
            "/Dockerfile @mr-devloper005",
            "/docker-compose.vps.yml @mr-devloper005",
            "/.github/workflows/ @mr-devloper005",
            "/src/lib/ @mr-devloper005",
            "/src/config/site.tasks.ts @mr-devloper005",
            "/src/config/site.identity.ts @mr-devloper005",
            "",
        ])
    )


def ensure_repo(target: Path, host: str) -> None:
    if not (target / ".git").exists():
        run(["git", "init"], cwd=target)
        run(["git", "branch", "-M", "main"], cwd=target)
    run(["git", "add", "."], cwd=target)
    status = run(["git", "status", "--porcelain"], cwd=target)
    if status:
        try:
            run(["git", "commit", "-m", "Initial media subdomain site setup"], cwd=target)
        except RuntimeError as error:
            if "nothing to commit" not in str(error):
                raise
    repo = f"{OWNER}/{host}"
    view = subprocess.run(["gh", "repo", "view", repo], text=True, capture_output=True)
    if view.returncode != 0:
        run(["gh", "repo", "create", host, "--public"])
    remote = subprocess.run(["git", "remote", "get-url", "origin"], cwd=target, text=True, capture_output=True)
    remote_url = f"git@github.com:{repo}.git"
    if remote.returncode == 0:
        run(["git", "remote", "set-url", "origin", remote_url], cwd=target)
    else:
        run(["git", "remote", "add", "origin", remote_url], cwd=target)
    run(["git", "push", "-u", "origin", "main"], cwd=target)
    branches = run(["git", "branch", "--list", "dev"], cwd=target)
    if not branches:
        run(["git", "checkout", "-b", "dev"], cwd=target)
        run(["git", "push", "-u", "origin", "dev"], cwd=target)
        run(["git", "checkout", "main"], cwd=target)
    else:
        run(["git", "push", "-u", "origin", "dev"], cwd=target)


def set_secrets(host: str, env: str) -> None:
    repo = f"{OWNER}/{host}"
    ssh_key = Path.home() / ".ssh/github_actions_vps"
    if not ssh_key.exists():
        raise RuntimeError(f"Missing GitHub Actions VPS SSH key: {ssh_key}")
    run(["gh", "secret", "set", "VPS_HOST", "--repo", repo, "--body", VPS_HOST])
    run(["gh", "secret", "set", "VPS_USER", "--repo", repo, "--body", VPS_USER])
    run(["gh", "secret", "set", "VPS_PORT", "--repo", repo, "--body", VPS_PORT])
    run(["gh", "secret", "set", "VPS_SSH_KEY", "--repo", repo], input_text=ssh_key.read_text())
    run(["gh", "secret", "set", "APP_ENV_PRODUCTION", "--repo", repo], input_text=env)


def main() -> None:
    rng = random.Random(SEED)
    source_choices = SOURCES[:]
    rng.shuffle(source_choices)
    records = []
    sync_rows = []
    for index, (parent, host, route) in enumerate(TARGETS):
        source_name = source_choices[index % len(source_choices)]
        source = repo_path(source_name)
        target = repo_path(host)
        run(["git", "fetch", "origin", "main"], cwd=source)
        run(["git", "checkout", "main"], cwd=source)
        run(["git", "reset", "--hard", "origin/main"], cwd=source)
        copy_repo(source, target)

        code = new_code()
        name = pretty_name(host)
        port = START_PORT + index
        replace_identity(target, code, host, name)
        replace_route(target, route)
        env = write_env(target, code, host, name)
        update_compose(target, code, port)
        update_workflow(target, name)
        write_codeowners(target)
        ensure_repo(target, host)
        set_secrets(host, env)

        repo = f"git@github.com:{OWNER}/{host}.git"
        row = {
            "parentDomain": parent.lower(),
            "domain": host,
            "url": f"https://{host}",
            "route": route,
            "code": code,
            "name": name,
            "port": port,
            "sourceRepo": source_name,
            "repo": repo,
            "tasks": ["mediaDistribution"],
            "framework": "NEXTJS",
            "category": "MEDIA_DISTRIBUTION",
            "tagline": "Independent media updates",
            "description": f"A media-distribution newsroom for announcements, coverage, and press updates on {name}.",
            "taskViews": {"mediaDistribution": route},
        }
        records.append(row)
        sync_rows.append({
            "code": code,
            "name": name,
            "domain": host,
            "url": f"https://{host}",
            "tagline": row["tagline"],
            "description": row["description"],
            "repo": repo,
            "tasks": ["mediaDistribution"],
            "framework": "NEXTJS",
            "category": "MEDIA_DISTRIBUTION",
            "taskViews": {"mediaDistribution": route},
        })

    out = Path("/private/tmp/media-subdomain-provision-2026-05-13.json")
    sync = Path("/private/tmp/media-subdomain-sync-source-2026-05-13.json")
    out.write_text(json.dumps(records, indent=2))
    sync.write_text(json.dumps(sync_rows, indent=2))
    print(json.dumps({"records": str(out), "sync": str(sync), "count": len(records)}, indent=2))


if __name__ == "__main__":
    main()
