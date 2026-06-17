// scripts/articleScraper.js

import * as cheerio from "cheerio";

/* ============================================================
   UTILITY: CLEANERS & FILTERS
============================================================ */
function normalizeImageUrl(src) {
  if (!src) return null;
  const fullUrl = src.startsWith("http") ? src : "https://www.pib.gov.in" + src;
  const blacklist = ["logo", "azadika", "facebook", "twitter", "instagram", "youtube", "print", "share", "icon"];
  return blacklist.some(word => fullUrl.toLowerCase().includes(word)) ? null : fullUrl;
}

function cleanText(text) {
  if (!text) return "";
  return text.replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim();
}

function isValidHtml(html) {
  return html && 
         html.length > 500 && 
         !html.includes("Page you have requested is not available") && 
         !html.includes("Sorry for your Inconvenience") &&
         !html.includes("Invalid PRID");
}

/* ============================================================
   LIGHTNING FETCH ENGINE (Static reg=48 + Fallbacks)
============================================================ */
async function fetchHtml(targetUrl) {
  const headers = { 
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36", 
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
    "Referer": "https://www.pib.gov.in/"
  };

  // 1️⃣ Fast Direct Fetch (Mimics human browser)
  try {
    const res = await fetch(targetUrl, { headers, signal: AbortSignal.timeout(6000) });
    const text = await res.text();
    if (isValidHtml(text)) return text;
  } catch (e) {} 

  // 2️⃣ Fast Direct Fetch via Archive Subdomain (Bypasses WAF)
  try {
    const archiveUrl = targetUrl.replace("www.pib.gov.in", "archive.pib.gov.in");
    const res = await fetch(archiveUrl, { headers, signal: AbortSignal.timeout(6000) });
    const text = await res.text();
    if (isValidHtml(text)) return text;
  } catch (e) {}

  // 3️⃣ Reliable AllOrigins JSON Proxy (GitHub Actions fallback)
  try {
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`;
    const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(8000) });
    const json = await res.json();
    if (json.contents && isValidHtml(json.contents)) return json.contents;
  } catch (e) {}

  return null;
}

/* ============================================================
   STATIC REGION FETCH (Locked to reg=48)
============================================================ */
async function getArticleHtml(prid) {
  // 🚀 CRITICAL FIX: Statically locked to reg=48 exactly as requested
  const url = `https://www.pib.gov.in/PressReleasePage.aspx?PRID=${prid}&reg=48&lang=1`;
  const html = await fetchHtml(url);
  
  if (html) {
    console.log(`   ✅ Valid URL matched: ${url}`);
    return html;
  }
  return null;
}

/* ============================================================
   PIB SCRAPER
============================================================ */
export async function scrapeFullArticle(url) {
  try {
    const prIDMatch = url.match(/PRID=(\d+)/);
    if (!prIDMatch) return null;
    const prid = prIDMatch[1];

    console.log(`🔗 Fetching PRID: ${prid} with static reg=48...`);
    
    const html = await getArticleHtml(prid);

    if (!html) {
      console.log(`❌ Skipped: Could not load main page for PRID ${prid} (Region 48 mismatch or WAF block)`);
      return null;
    }

    const $ = cheerio.load(html);

    // 1️⃣ HEADLINE EXTRACTION
    const headline = cleanText($("h2").first().text() || $("h1").first().text() || $(".ReleaseTitleTxt").text());
    if (!headline || headline.toLowerCase() === "untitled page" || headline.toLowerCase() === "pib") return null;

    // 2️⃣ CONTENT TARGETING
    // Extracting strictly from the main content block, ignoring sidebars and footers
    let target = null;
    const primarySelectors = [".ReleaseText", ".ReleaseTextTxt", "#ReleaseText", ".release-details-full"];
    
    for (const s of primarySelectors) {
      if ($(s).length > 0) { target = $(s); break; }
    }

    if (!target) {
      let maxScore = 0;
      $("article, main, div, td").not("nav, footer, header, aside, .sidebar").each((_, el) => {
        const $el = $(el);
        if ($el.find("a").length > $el.find("p, li, td").length) return; 
        const currentScore = ($el.find("p, li, td").length * 10) + ($el.text().length / 100);
        if (currentScore > maxScore) {
          maxScore = currentScore;
          target = $el;
        }
      });
    }

    const finalTarget = target || $("body");
    let contentBlocks = [];
    let images = [];

    // 3️⃣ TEXT HARVESTING
    finalTarget.find("p, li, div, td, span").each((_, el) => {
      const $el = $(el);
      // Ensure we only grab terminal text elements (no nested blocks)
      if ($el.children("p, li, div, td, span").length === 0) {
        const text = cleanText($el.text());
        if (text.length > 15 && !text.startsWith("Posted On:") && !text.toLowerCase().includes("follow us")) {
          contentBlocks.push(text);
        }
      }
    });

    // 4️⃣ IMAGE HARVESTING
    finalTarget.find("img").each((_, el) => {
      const validUrl = normalizeImageUrl($(el).attr("src") || $(el).attr("data-src"));
      if (validUrl) images.push(validUrl);
    });

    const uniqueContent = [...new Set(contentBlocks)].join("\n\n");
    if (uniqueContent.length < 150) return null;

    console.log(`✅ Scraped successfully: ${headline.substring(0, 45)}...`);

    return {
      headline,
      content: uniqueContent,
      images: [...new Set(images)],
      meta: { timestamp: new Date().toISOString() }
    };

  } catch (error) {
    console.error(`❌ Critical PIB Fail [${url}]:`, error.message);
    return null;
  }
}
