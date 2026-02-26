// scripts/articleScraper.js

import axios from "axios";
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

/* ============================================================
   UTILITY: NETWORK RESILIENCE
============================================================ */
async function fetchWithRetry(url, retries = 3) {
  let attempt = 0;
  while (attempt < retries) {
    try {
      return await axios.get(url, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", "Referer": "https://www.pib.gov.in/" },
        timeout: 25000 
      });
    } catch (err) {
      attempt++;
      if (attempt >= retries) throw err;
      await new Promise(res => setTimeout(res, 1000 * Math.pow(2, attempt)));
    }
  }
}

/* ============================================================
   PIB SCRAPER: ENTERPRISE FINAL (V11)
============================================================ */
export async function scrapeFullArticle(url) {
  try {
    const response = await fetchWithRetry(url);
    const html = response.data;
    if (!html || html.length < 500) return null;

    const $ = cheerio.load(html);

    // 1️⃣ HEADLINE
    const headline = cleanText(
      $("h2").first().text() || $("h1").first().text() || $(".ReleaseTitleTxt").text() || 
      $("meta[property='og:title']").attr("content") || $("title").text().split("|")[0]
    );

    // 2️⃣ ADVANCED TARGET DETECTION (Side-bar proof)
    let target = null;
    const primarySelectors = ["#ReleaseText", ".innner-page-main-about-us-content-right-part", ".release-details-full"];
    
    for (const s of primarySelectors) {
      if ($(s).length > 0) { target = $(s); break; }
    }

    if (!target) {
      console.log("ℹ Calculating Text Density (Ignoring Sidebars)...");
      let maxScore = 0;
      
      // We look inside potential content blocks but ignore known navigation/footer tags
      $("article, main, div").not("nav, footer, header, aside, .sidebar, .menu").each((_, el) => {
        const $el = $(el);
        
        // --- The Link Ratio Protection ---
        const linksCount = $el.find("a").length;
        const pAndLiCount = $el.find("p, li").length;
        const totalTextLen = $el.text().length;

        // SIDEBAR DETECTION LOGIC: 
        // If the number of links is higher than paragraphs/bullets, it's likely a menu.
        if (linksCount > pAndLiCount) return; 

        // Score based on text volume and paragraph frequency
        const currentScore = (pAndLiCount * 10) + (totalTextLen / 100);
        
        if (currentScore > maxScore) {
          maxScore = currentScore;
          target = $el;
        }
      });
    }

    const finalTarget = target || $("body");
    let contentBlocks = [];
    let images = [];

    // 3️⃣ SHIELDED CONTENT EXTRACTION
    finalTarget.find("p, li, div").each((_, el) => {
      const $el = $(el);
      // Logic: Only capture terminal elements (no child block tags)
      if ($el.children("p, li, div").length === 0) {
        const text = cleanText($el.text());
        if (
          text.length > 25 && 
          !text.startsWith("Posted On:") && 
          !text.includes("PIB Delhi") && 
          !text.toLowerCase().includes("follow us")
        ) {
          contentBlocks.push(text);
        }
      }
    });

    // 4️⃣ IMAGE HARVESTING
    finalTarget.find("img").each((_, el) => {
      const src = $(el).attr("src") || $(el).attr("data-src");
      const validUrl = normalizeImageUrl(src);
      if (validUrl) images.push(validUrl);
    });

    const uniqueContent = [...new Set(contentBlocks)].join("\n\n");
    const uniqueImages = [...new Set(images)];

    if (uniqueContent.length < 150) {
      console.log(`❌ Skipped: Threshold not met [${url}]`);
      return null;
    }

    // 5️⃣ OUTPUT & LOGGING
    let confidence = 0;
    if (headline.length > 25) confidence += 25;
    if (uniqueContent.length > 500) confidence += 50;
    if (uniqueImages.length > 0) confidence += 25;

    console.log(`✅ Success: ${headline.substring(0, 45)}... [Score: ${confidence}/100]`);

    return {
      headline,
      content: uniqueContent,
      images: uniqueImages,
      meta: {
        confidenceScore: confidence,
        timestamp: new Date().toISOString()
      }
    };

  } catch (error) {
    console.error(`❌ Critical PIB Fail [${url}]:`, error.message);
    return null;
  }
}
