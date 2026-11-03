// Makes a branded 1200x630 blog thumbnail (also used as the social
// preview image). Called by build-blog.mjs for posts without a custom
// thumbnail. To use your own Canva thumbnail instead, export it at
// 1200x630, put it in assets/blog/ and set `thumbnail:` in the post.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");

const b64 = (file) => fs.readFileSync(file).toString("base64");
const font = (w) =>
  `@font-face{font-family:Inter;font-weight:${w};src:url(data:font/woff2;base64,${b64(
    path.join(HERE, `node_modules/@fontsource/inter/files/inter-latin-${w}-normal.woff2`)
  )}) format("woff2")}`;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

let browser;
async function getBrowser() {
  if (!browser) {
    let playwright;
    try { playwright = require("playwright"); } catch { playwright = await import("playwright"); }
    browser = await playwright.chromium.launch();
  }
  return browser;
}

export async function closeBrowser() {
  if (browser) await browser.close();
  browser = null;
}

export async function renderThumbnail({ title, eyebrow = "Blog", out }) {
  const size = title.length > 70 ? 54 : title.length > 48 ? 62 : 72;
  const photo = b64(path.join(ROOT, "assets/liya-bio-pink.jpg"));
  const html = `<!doctype html><html><head><style>
    ${font(500)}${font(700)}${font(800)}
    *{margin:0;box-sizing:border-box}
    body{width:1200px;height:630px;font-family:Inter,sans-serif;overflow:hidden;
      background:radial-gradient(ellipse 70% 90% at 100% 0%,#3a1631 0%,transparent 60%),
                 radial-gradient(ellipse 60% 80% at 0% 100%,#06393c 0%,transparent 60%),
                 linear-gradient(160deg,#2b2f38 0%,#17191f 55%,#0b0c10 100%);
      color:#fff;display:grid;grid-template-columns:1fr 330px;align-items:center;padding:64px 70px;gap:50px}
    .brand{position:absolute;top:56px;left:70px;font-weight:700;font-size:22px;letter-spacing:.02em}
    .brand b{color:#ff66c4}
    .eyebrow{display:inline-block;background:#ff66c4;color:#17191f;font-weight:700;font-size:20px;
      letter-spacing:.14em;text-transform:uppercase;padding:9px 18px;border-radius:999px;margin-bottom:28px}
    h1{font-weight:800;font-size:${size}px;line-height:1.08;letter-spacing:-.02em}
    .bar{width:120px;height:8px;border-radius:8px;background:#00c2cb;margin-top:34px}
    .url{position:absolute;bottom:52px;left:70px;font-weight:500;font-size:22px;color:rgba(255,255,255,.72)}
    .photo{width:330px;height:330px;border-radius:50%;background:url(data:image/jpeg;base64,${photo}) center/cover;
      box-shadow:0 0 0 10px #ff66c4,0 0 0 20px rgba(0,194,203,.35),0 30px 60px rgba(0,0,0,.5)}
  </style></head><body>
    <div class="brand">Creator Hustle <b>AI</b></div>
    <div><span class="eyebrow">${esc(eyebrow)}</span><h1>${esc(title)}</h1><div class="bar"></div></div>
    <div class="photo" role="img" aria-label="Liya Bergen"></div>
    <div class="url">creatorhustle.ai/blog</div>
  </body></html>`;
  const b = await getBrowser();
  const page = await b.newPage({ viewport: { width: 1200, height: 630 } });
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: out, type: "jpeg", quality: 88 });
  await page.close();
}

// Run directly to (re)make one: node make-thumbnails.mjs "Title" "Eyebrow" ../assets/blog/x.jpg
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) && process.argv[2]) {
  await renderThumbnail({ title: process.argv[2], eyebrow: process.argv[3], out: process.argv[4] });
  await browser.close();
}
