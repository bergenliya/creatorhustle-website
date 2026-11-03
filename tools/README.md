# Blog publishing

Posts live in `blog-src/posts/` as markdown. Copy `_template.md`, rename it to the post's web address (`my-post.md` becomes creatorhustle.ai/blog/my-post), fill in the top section and write the post.

Then build and push:

```
cd tools
npm install        # first time only
npm run build
```

The build checks the post before publishing: SEO title under 65 characters, description under 160, the focus keyword in the title, description and opening, and every internal link pointing at a real page or post. If anything fails, nothing is written.

It writes `blog/` (pages and RSS feed), a branded thumbnail in `assets/blog/` when the post doesn't name its own, and refreshes the blog sections of `sitemap.xml` and `llms.txt`. Header and footer are copied from `contact.html`, so menu changes carry over on the next build.

Internal links: `[text](post:other-slug)` for another post, `[text](/skills-shop)` for a site page.

`tools/` and `blog-src/` are listed in `.assetsignore`, so they're never served on the site.
