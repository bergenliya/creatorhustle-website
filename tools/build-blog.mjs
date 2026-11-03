// ============================================================
// BUILD-BLOG — turns markdown posts in blog-src/posts into the
// live blog on creatorhustle.ai.
//
//   cd tools && npm install && node build-blog.mjs
//
// What it writes (all committed, Cloudflare serves them as-is):
//   blog/index.html          the blog home with every post card
//   blog/<slug>.html         one page per post (served at /blog/<slug>)
//   blog/feed.xml            RSS feed (Kit can turn it into emails)
//   assets/blog/<slug>.jpg   a branded thumbnail, only when the post
//                            has no custom thumbnail of its own
//   sitemap.xml, llms.txt    blog section between the blog markers
//
// Header and footer are copied from contact.html on every build,
// so menu changes on the main site carry over to the blog.
// ============================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import matter from "gray-matter";
import { marked } from "marked";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://creatorhustle.ai";
const POSTS_DIR = path.join(ROOT, "blog-src/posts");
const OUT_DIR = path.join(ROOT, "blog");
const THUMB_DIR = path.join(ROOT, "assets/blog");
const AUTHOR = {
  name: "Liya Bergen",
  url: `${SITE}/#about`,
  image: `${SITE}/assets/liya-bio-pink.jpg`,
  sameAs: ["https://www.instagram.com/creatorhustle.ai/"],
};

const problems = [];
const fail = (msg) => problems.push(msg);

// ---------- helpers ----------
const esc = (s = "") =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const isoDate = (d) => new Date(d).toISOString().slice(0, 10);
const niceDate = (d) =>
  new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const slugify = (s) =>
  s.toLowerCase().replace(/<[^>]+>/g, "").replace(/&[a-z]+;/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const arrow =
  '<svg class="btn-arrow" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

// Site pages that exist, so internal links can be checked at build time
const sitePages = new Set(
  fs.readdirSync(ROOT).filter((f) => f.endsWith(".html")).map((f) => f.replace(/\.html$/, ""))
);

// ---------- shared header / footer from the main site ----------
const contactHtml = fs.readFileSync(path.join(ROOT, "contact.html"), "utf8");
function absolutize(html) {
  // Relative hrefs/srcs → root-relative, so they work from /blog/
  return html.replace(/\b(href|src)="(?!https?:|mailto:|tel:|#|\/)([^"]*)"/g, '$1="/$2"');
}
function grab(tag) {
  const m = contactHtml.match(new RegExp(`<${tag}[\\s\\S]*?</${tag}>`));
  if (!m) throw new Error(`Could not find <${tag}> in contact.html`);
  return absolutize(m[0]);
}
const HEADER = grab("header").replace(
  /(<a href="\/blog\/" class="nav-link)(")/,
  '$1 active" aria-current="page$2'
);
const FOOTER = grab("footer");

// ---------- read posts ----------
const required = ["title", "description", "focus_keyword", "date", "answer"];
const posts = fs
  .readdirSync(POSTS_DIR)
  .filter((f) => f.endsWith(".md") && !f.startsWith("_"))
  .map((file) => {
    const raw = fs.readFileSync(path.join(POSTS_DIR, file), "utf8");
    const { data, content } = matter(raw);
    const slug = data.slug || file.replace(/\.md$/, "");
    for (const k of required) if (!data[k]) fail(`${file}: missing "${k}" in the top section`);
    if (data.description && data.description.length > 160)
      fail(`${file}: description is ${data.description.length} characters (keep it under 160)`);
    const seoTitle = data.seo_title || data.title;
    if (seoTitle.length > 65) fail(`${file}: SEO title is ${seoTitle.length} characters (keep it under 65)`);
    const words = content.split(/\s+/).filter(Boolean).length;
    return {
      ...data,
      file,
      slug,
      seoTitle,
      body: content,
      words,
      minutes: Math.max(1, Math.round(words / 220)),
      date: isoDate(data.date),
      updated: isoDate(data.updated || data.date),
      tags: data.tags || [],
      faq: data.faq || [],
      thumbnail: data.thumbnail || `/assets/blog/${slug}.jpg`,
      customThumb: Boolean(data.thumbnail),
      thumbnail_alt: data.thumbnail_alt || data.title,
      url: `${SITE}/blog/${slug}`,
    };
  })
  .filter((p) => !p.draft)
  .sort((a, b) => (a.date < b.date ? 1 : -1));

const bySlug = new Map(posts.map((p) => [p.slug, p]));

// Focus keyword check: it should appear in the title, description and opening
for (const p of posts) {
  const kw = String(p.focus_keyword || "").toLowerCase();
  if (!kw) continue;
  const opening = p.body.slice(0, 900).toLowerCase();
  if (!p.title.toLowerCase().includes(kw) && !p.seoTitle.toLowerCase().includes(kw))
    fail(`${p.file}: focus keyword "${kw}" isn't in the title`);
  if (!String(p.description).toLowerCase().includes(kw))
    fail(`${p.file}: focus keyword "${kw}" isn't in the description`);
  if (!opening.includes(kw) && !String(p.answer).toLowerCase().includes(kw))
    fail(`${p.file}: focus keyword "${kw}" isn't in the quick answer or opening`);
}

// ---------- markdown rendering with link checks ----------
function renderBody(p) {
  const toc = [];
  const renderer = new marked.Renderer();
  renderer.heading = function ({ tokens, depth }) {
    const text = this.parser.parseInline(tokens);
    const id = slugify(text);
    if (depth === 2) toc.push({ id, text });
    return `<h${depth} id="${id}">${text}</h${depth}>\n`;
  };
  renderer.link = function ({ href, title, tokens }) {
    const text = this.parser.parseInline(tokens);
    let target = href;
    let external = /^https?:/.test(href) && !href.startsWith(SITE);
    if (href.startsWith("post:")) {
      // [text](post:other-slug) → link to another blog post
      const s = href.slice(5);
      if (!bySlug.has(s)) fail(`${p.file}: links to post "${s}" which doesn't exist (yet)`);
      target = `/blog/${s}`;
    } else if (href.startsWith("/") && !href.startsWith("/blog")) {
      const page = href.slice(1).split(/[#?]/)[0].replace(/\.html$/, "") || "index";
      if (!sitePages.has(page)) fail(`${p.file}: links to /${page} which isn't a page on the site`);
    }
    const t = title ? ` title="${esc(title)}"` : "";
    const ext = external ? ' target="_blank" rel="noopener"' : "";
    return `<a href="${esc(target)}"${t}${ext}>${text}</a>`;
  };
  renderer.image = function ({ href, title, text }) {
    return `<figure><img src="${esc(href)}" alt="${esc(text)}" loading="lazy">${
      title ? `<figcaption>${esc(title)}</figcaption>` : ""
    }</figure>`;
  };
  const html = marked.parse(p.body, { renderer, gfm: true });
  return { html, toc };
}

// ---------- page pieces ----------
function head({ title, description, canonical, image, type = "website", extraMeta = "", jsonld }) {
  return `<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="${esc(description)}">
  <meta name="theme-color" content="#17191f">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <link rel="icon" href="/favicon.ico" sizes="any">
  <link rel="icon" type="image/png" href="/assets/favicon.png">
  <link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
  <script>
    (function () {
      try {
        var t = localStorage.getItem("site-theme");
        if (t) document.documentElement.setAttribute("data-theme", t);
        else if (window.matchMedia("(prefers-color-scheme: dark)").matches)
          document.documentElement.setAttribute("data-theme", "dark");
      } catch (e) {}
    })();
  </script>
  <title>${esc(title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/style.css">
  <link rel="alternate" type="application/rss+xml" title="Creator Hustle AI blog" href="/blog/feed.xml">
  <!-- SEO: canonical, social and structured data -->
  <link rel="canonical" href="${canonical}">
  <meta property="og:site_name" content="Creator Hustle AI">
  <meta property="og:type" content="${type}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${image}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
${extraMeta}  <script type="application/ld+json">
${JSON.stringify(jsonld, null, 1)}
</script>
  <script src="/site-analytics.js" defer></script>
</head>
<body>

  <a class="skip-link" href="#main">Skip to content</a>

  ${HEADER}
`;
}
const tail = `
  ${FOOTER}

  <script src="/js/main.js"></script>
</body>
</html>
`;

function card(p, headingLevel = 3) {
  return `<article class="blog-card animate-on-scroll">
            <a class="blog-card-link" href="/blog/${p.slug}">
              <img class="blog-card-img" src="${p.thumbnail}" alt="${esc(p.thumbnail_alt)}" width="1200" height="630" loading="lazy">
              <div class="blog-card-body">
                <p class="blog-meta"><time datetime="${p.date}">${niceDate(p.date)}</time> · ${p.minutes} min read</p>
                <h${headingLevel} class="blog-card-title">${esc(p.title)}</h${headingLevel}>
                <p class="blog-card-desc">${esc(p.description)}</p>
                <span class="blog-card-more">Read the post ${arrow}</span>
              </div>
            </a>
          </article>`;
}

function relatedFor(p) {
  const picked = [];
  for (const s of p.related || []) {
    if (!bySlug.has(s)) fail(`${p.file}: related post "${s}" doesn't exist`);
    else if (s !== p.slug) picked.push(bySlug.get(s));
  }
  // Top up with posts that share the most tags, then the newest
  const rest = posts
    .filter((o) => o.slug !== p.slug && !picked.includes(o))
    .map((o) => ({ o, score: o.tags.filter((t) => p.tags.includes(t)).length }))
    .sort((a, b) => b.score - a.score || (a.o.date < b.o.date ? 1 : -1))
    .map((x) => x.o);
  return [...picked, ...rest].slice(0, 3);
}

// ---------- post page ----------
function postPage(p) {
  const { html, toc } = renderBody(p);
  const img = `${SITE}${p.thumbnail}`;
  const graph = [
    {
      "@type": "BlogPosting",
      "@id": `${p.url}#post`,
      headline: p.title,
      description: p.description,
      url: p.url,
      mainEntityOfPage: p.url,
      image: { "@type": "ImageObject", url: img, width: 1200, height: 630 },
      datePublished: p.date,
      dateModified: p.updated,
      wordCount: p.words,
      keywords: [p.focus_keyword, ...(p.keywords || [])].join(", "),
      articleSection: p.tags[0] || "AI for creators",
      inLanguage: "en",
      author: { "@type": "Person", "@id": `${SITE}/#liya`, ...AUTHOR },
      publisher: { "@id": `${SITE}/#org` },
      isPartOf: { "@id": `${SITE}/blog/#blog` },
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
        { "@type": "ListItem", position: 2, name: "Blog", item: `${SITE}/blog/` },
        { "@type": "ListItem", position: 3, name: p.title, item: p.url },
      ],
    },
  ];
  if (p.faq.length)
    graph.push({
      "@type": "FAQPage",
      "@id": `${p.url}#faq`,
      mainEntity: p.faq.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    });

  const extraMeta =
    `  <meta property="article:published_time" content="${p.date}">\n` +
    `  <meta property="article:modified_time" content="${p.updated}">\n` +
    `  <meta property="article:author" content="Liya Bergen">\n` +
    p.tags.map((t) => `  <meta property="article:tag" content="${esc(t)}">\n`).join("");

  const tocHtml =
    toc.length >= 3
      ? `<nav class="blog-toc" aria-label="In this post">
            <p class="blog-toc-title">In this post</p>
            <ol>${toc.map((t) => `<li><a href="#${t.id}">${t.text}</a></li>`).join("")}</ol>
          </nav>`
      : "";

  const faqHtml = p.faq.length
    ? `<section class="blog-faq" id="faq" aria-labelledby="faq-title">
            <h2 id="faq-title">Questions people ask</h2>
            ${p.faq
              .map(
                (f) => `<details class="blog-faq-item">
              <summary>${esc(f.q)}</summary>
              <p>${esc(f.a)}</p>
            </details>`
              )
              .join("\n            ")}
          </section>`
    : "";

  const c = p.cta;
  const ctaHtml = c
    ? `<aside class="blog-cta" aria-label="${esc(c.title)}">
            ${c.eyebrow ? `<p class="blog-cta-eyebrow">${esc(c.eyebrow)}</p>` : ""}
            <h2 class="blog-cta-title">${esc(c.title)}</h2>
            <p>${esc(c.text)}</p>
            <a class="btn btn-primary" href="${esc(c.url)}">${esc(c.button)} ${arrow}</a>
          </aside>`
    : "";
  if (c && c.url.startsWith("/")) {
    const page = c.url.slice(1).split(/[#?]/)[0].replace(/\.html$/, "");
    if (!sitePages.has(page)) fail(`${p.file}: call-to-action links to /${page} which isn't a page on the site`);
  }

  const related = relatedFor(p);
  const relatedHtml = related.length
    ? `<section class="section blog-related" aria-labelledby="related-title">
      <div class="container">
        <div class="offers-header animate-on-scroll">
          <span class="section-eyebrow">Keep reading</span>
          <h2 class="section-title" id="related-title">More from the blog</h2>
        </div>
        <div class="blog-grid">
          ${related.map((r) => card(r)).join("\n          ")}
        </div>
      </div>
    </section>`
    : "";

  return (
    head({
      title: `${p.seoTitle} | Creator Hustle AI`,
      description: p.description,
      canonical: p.url,
      image: img,
      type: "article",
      extraMeta,
      jsonld: { "@context": "https://schema.org", "@graph": graph },
    }) +
    `
  <main id="main" tabindex="-1">
    <article class="blog-post">
      <header class="blog-post-header">
        <div class="container blog-narrow">
          <nav class="blog-crumbs" aria-label="Breadcrumb">
            <a href="/">Home</a> <span aria-hidden="true">/</span> <a href="/blog/">Blog</a>
          </nav>
          ${p.tags[0] ? `<p class="section-eyebrow">${esc(p.tags[0])}</p>` : ""}
          <h1 class="blog-post-title">${esc(p.title)}</h1>
          <p class="blog-meta">By <a href="/#about">Liya Bergen</a> · <time datetime="${p.date}">${niceDate(p.date)}</time>${
      p.updated !== p.date ? ` · Updated <time datetime="${p.updated}">${niceDate(p.updated)}</time>` : ""
    } · ${p.minutes} min read</p>
        </div>
        <div class="container blog-wide">
          <img class="blog-post-thumb" src="${p.thumbnail}" alt="${esc(p.thumbnail_alt)}" width="1200" height="630" fetchpriority="high">
        </div>
      </header>

      <div class="container blog-narrow">
        <div class="blog-answer">
          <p class="blog-answer-label">The short answer</p>
          <p>${esc(p.answer)}</p>
        </div>
        ${tocHtml}
        <div class="blog-prose">
${html}
        </div>
        ${faqHtml}
        ${ctaHtml}
        <aside class="blog-author" aria-label="About the author">
          <img src="/assets/liya-bio-pink.jpg" alt="Liya Bergen" width="96" height="96" loading="lazy">
          <div>
            <p class="blog-author-name">Written by Liya Bergen</p>
            <p>Founder of Creator Hustle AI (formerly Course Hustle). I've been building online courses and digital products since 2014, and these days I help coaches and creators make, sell and automate simple products with AI.</p>
            <p><a href="/#about">More about me</a> · <a href="https://www.instagram.com/creatorhustle.ai/" target="_blank" rel="noopener">Say hi on Instagram</a></p>
          </div>
        </aside>
      </div>
    </article>

    ${relatedHtml}
  </main>
` +
    tail
  );
}

// ---------- blog index ----------
function indexPage() {
  const graph = [
    {
      "@type": "Blog",
      "@id": `${SITE}/blog/#blog`,
      url: `${SITE}/blog/`,
      name: "Creator Hustle AI blog",
      description:
        "Simple, practical guides to making, selling and automating digital products with AI, from Liya Bergen.",
      inLanguage: "en",
      publisher: { "@id": `${SITE}/#org` },
      author: { "@type": "Person", "@id": `${SITE}/#liya`, ...AUTHOR },
      blogPost: posts.map((p) => ({
        "@type": "BlogPosting",
        "@id": `${p.url}#post`,
        headline: p.title,
        url: p.url,
        datePublished: p.date,
        image: `${SITE}${p.thumbnail}`,
      })),
    },
  ];
  const list = posts.length
    ? `<div class="blog-grid">
          ${posts.map((p) => card(p, 2)).join("\n          ")}
        </div>`
    : `<p class="blog-empty">The first posts are on their way. Check back soon!</p>`;
  return (
    head({
      title: "Blog: AI for Coaches and Creators | Creator Hustle AI",
      description:
        "Simple, practical guides to making, selling and automating digital products with AI. Claude Skills, mini apps, mini courses and AI clones, explained plainly.",
      canonical: `${SITE}/blog/`,
      image: posts[0] ? `${SITE}${posts[0].thumbnail}` : `${SITE}/assets/liya-bio.jpg`,
      jsonld: { "@context": "https://schema.org", "@graph": graph },
    }) +
    `
  <main id="main" tabindex="-1">
    <section class="hero hero--page" id="hero">
      <div class="hero-overlay" aria-hidden="true"></div>
      <div class="container hero-content">
        <p class="hero-eyebrow animate-on-load" style="--delay: 0">Blog</p>
        <h1 class="hero-title animate-on-load" style="--delay: 1">AI made simple for coaches and creators</h1>
        <p class="hero-subtitle animate-on-load" style="--delay: 2">Practical guides to making, selling and automating digital products with AI. No tech degree needed, just a few spare hours.</p>
      </div>
    </section>

    <section class="section">
      <div class="container">
        ${list}
      </div>
    </section>
  </main>
` +
    tail
  );
}

// ---------- RSS ----------
function feed() {
  const items = posts
    .map(
      (p) => `    <item>
      <title>${esc(p.title)}</title>
      <link>${p.url}</link>
      <guid isPermaLink="true">${p.url}</guid>
      <pubDate>${new Date(p.date + "T08:00:00Z").toUTCString()}</pubDate>
      <description>${esc(p.description)}</description>
      <enclosure url="${SITE}${p.thumbnail}" type="image/jpeg" length="0"/>
    </item>`
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Creator Hustle AI blog</title>
    <link>${SITE}/blog/</link>
    <description>Simple, practical guides to making, selling and automating digital products with AI.</description>
    <language>en</language>
${items}
  </channel>
</rss>
`;
}

// ---------- sitemap + llms.txt ----------
function replaceBlock(text, start, end, block, insertBefore) {
  const re = new RegExp(`${start}[\\s\\S]*?${end}\\n?`);
  const full = `${start}\n${block}${end}\n`;
  if (re.test(text)) return text.replace(re, full);
  if (insertBefore) return text.replace(insertBefore, `${full}${insertBefore}`);
  return text.trimEnd() + "\n\n" + full;
}
function updateSitemap() {
  const file = path.join(ROOT, "sitemap.xml");
  const newest = posts[0] ? posts[0].updated : isoDate(Date.now());
  const urls =
    `  <url><loc>${SITE}/blog/</loc><lastmod>${newest}</lastmod><priority>0.8</priority></url>\n` +
    posts.map((p) => `  <url><loc>${p.url}</loc><lastmod>${p.updated}</lastmod><priority>0.7</priority></url>\n`).join("");
  const out = replaceBlock(fs.readFileSync(file, "utf8"), "  <!-- blog:start -->", "  <!-- blog:end -->", urls, "</urlset>");
  fs.writeFileSync(file, out);
}
function updateLlms() {
  const file = path.join(ROOT, "llms.txt");
  const lines =
    `## Blog\n\n- [Creator Hustle AI blog](${SITE}/blog/): practical guides to making, selling and automating digital products with AI.\n` +
    posts.map((p) => `- [${p.title}](${p.url}): ${p.description}\n`).join("") +
    "\n";
  const out = replaceBlock(fs.readFileSync(file, "utf8"), "<!-- blog:start -->", "<!-- blog:end -->", lines, "## Help");
  fs.writeFileSync(file, out);
}

// ---------- thumbnails ----------
async function makeThumbnails() {
  const need = posts.filter((p) => !p.customThumb && !fs.existsSync(path.join(ROOT, p.thumbnail)));
  for (const p of posts.filter((p) => p.customThumb))
    if (!fs.existsSync(path.join(ROOT, p.thumbnail))) fail(`${p.file}: thumbnail ${p.thumbnail} isn't in the site files`);
  if (!need.length) return;
  const { renderThumbnail, closeBrowser } = await import("./make-thumbnails.mjs");
  fs.mkdirSync(THUMB_DIR, { recursive: true });
  for (const p of need) {
    await renderThumbnail({ title: p.thumb_title || p.title, eyebrow: p.tags[0] || "Blog", out: path.join(ROOT, p.thumbnail) });
    console.log(`  thumbnail made: ${p.thumbnail}`);
  }
  await closeBrowser();
}

// ---------- run ----------
await makeThumbnails();
const pages = posts.map((p) => [p, postPage(p)]);
if (problems.length) {
  console.error("\nNot published. Fix these first:\n" + problems.map((m) => "  • " + m).join("\n"));
  process.exit(1);
}
fs.mkdirSync(OUT_DIR, { recursive: true });
// Remove pages for posts that were deleted or set back to draft
for (const f of fs.readdirSync(OUT_DIR))
  if (f.endsWith(".html") && f !== "index.html" && !bySlug.has(f.replace(/\.html$/, "")))
    fs.rmSync(path.join(OUT_DIR, f));
for (const [p, html] of pages) fs.writeFileSync(path.join(OUT_DIR, `${p.slug}.html`), html);
fs.writeFileSync(path.join(OUT_DIR, "index.html"), indexPage());
fs.writeFileSync(path.join(OUT_DIR, "feed.xml"), feed());
updateSitemap();
updateLlms();
console.log(`Blog built: ${posts.length} post(s).`);
