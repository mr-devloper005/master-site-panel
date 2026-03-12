const categories = ["Tech", "Lifestyle", "Business", "Travel", "Health"];
const authors = ["Aarav", "Siya", "Kabir", "Ananya", "Vihaan", "Mira"];

const siteTemplates = [
  { name: "PulseWire", url: "https://pulsewire.example", description: "Tech and startup publication" },
  { name: "StoryNook", url: "https://storynook.example", description: "Culture and lifestyle platform" },
  { name: "ImageBazaar", url: "https://imagebazaar.example", description: "Image-driven social hub" },
  { name: "LocalLens", url: "https://locallens.example", description: "Local listing and review feed" },
  { name: "BookmarkOrbit", url: "https://bookmarkorbit.example", description: "SBM and resource sharing" }
];

const random = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const dateDaysAgo = (daysAgo) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString();
};

const sampleContent = (title) => ({
  blocks: [
    { type: "heading", text: title },
    { type: "paragraph", text: "This is a premium mock content block used for preview and editing workflows." },
    { type: "paragraph", text: "Backend integration can directly hydrate these blocks from your CMS pipeline." }
  ]
});

export const generateMockState = () => {
  const sites = siteTemplates.map((site, idx) => ({
    id: `site_${idx + 1}`,
    name: site.name,
    url: site.url,
    description: site.description,
    status: Math.random() > 0.15 ? "Active" : "Inactive",
    order: idx,
    createdAt: dateDaysAgo(random(15, 120))
  }));

  const posts = [];
  let postId = 1;

  sites.forEach((site) => {
    const count = random(10, 50);
    for (let i = 0; i < count; i += 1) {
      const daysAgo = random(0, 60);
      const category = categories[random(0, categories.length - 1)];
      const title = `${category} Insight ${i + 1} for ${site.name}`;

      posts.push({
        id: `post_${postId++}`,
        siteId: site.id,
        siteName: site.name,
        title,
        excerpt: "Strategic overview with practical recommendations for multi-site content management.",
        content: sampleContent(title),
        author: authors[random(0, authors.length - 1)],
        date: dateDaysAgo(daysAgo),
        status: Math.random() > 0.2 ? "Published" : "Draft",
        views: random(120, 14000),
        likes: random(10, 1200),
        category,
        media: [
          { type: "IMAGE", url: `https://picsum.photos/seed/${site.id}-${i}/640/360` },
          { type: "DOC", url: `https://example.com/docs/${site.id}-${i}.pdf` }
        ]
      });
    }
  });

  return { sites, posts };
};

export const categoryPalette = {
  Tech: "#3B82F6",
  Lifestyle: "#14B8A6",
  Business: "#8B5CF6",
  Travel: "#F59E0B",
  Health: "#10B981"
};
