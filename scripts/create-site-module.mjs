import fs from "fs";
import path from "path";

const getArg = (key) => {
  const index = process.argv.indexOf(`--${key}`);
  if (index === -1) return "";
  return process.argv[index + 1] || "";
};

const code = getArg("code");
const name = getArg("name");
const framework = getArg("framework");
const category = getArg("category");

if (!code || !name || !framework || !category) {
  console.error(
    "Usage: npm run site:add -- --code site_1 --name \"Site 1\" --framework NEXT_JS --category ARTICLE"
  );
  process.exit(1);
}

const siteDir = path.join(process.cwd(), "sites", code);

if (fs.existsSync(siteDir)) {
  console.error(`Site module already exists: ${siteDir}`);
  process.exit(1);
}

fs.mkdirSync(siteDir, { recursive: true });

const manifest = {
  code,
  name,
  framework,
  category,
  theme: "default",
  frontend: {
    feedEndpoint: `/api/v1/public/${code}/feed`,
  },
};

const template = `// Optional site-specific mapping logic
// Keep one file per site so 100+ sites remain isolated and easy to maintain.
module.exports = {
  mapPost(post) {
    return {
      id: post.id,
      title: post.title,
      summary: post.summary,
      content: post.content,
      media: post.media,
      tags: post.tags,
      publishedAt: post.publishedAt,
    };
  },
};
`;

fs.writeFileSync(
  path.join(siteDir, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`
);
fs.writeFileSync(path.join(siteDir, "transformer.js"), template);

console.log(`Site module created at ${siteDir}`);
