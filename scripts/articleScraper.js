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
   PIB SCRAPER
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
    
    // Corrected target selectors: added ".ReleaseText", ".ReleaseTextTxt", and table bodies
    const primarySelectors = [
      ".ReleaseText", 
      ".ReleaseTextTxt", 
      "#ReleaseText", 
      ".innner-page-main-about-us-content-right-part", 
      ".release-details-full"
    ];
    
    for (const s of primarySelectors) {
      if ($(s).length > 0) { 
        target = $(s); 
        break; 
      }
    }

    if (!target) {
      console.log("ℹ Calculating Text Density (Ignoring Sidebars)...");
      let maxScore = 0;
      
      // Added "td" to target blocks to account for PIB table structures
      $("article, main, div, td").not("nav, footer, header, aside, .sidebar, .menu").each((_, el) => {
        const $el = $(el);
        
        const linksCount = $el.find("a").length;
        // Added "td" alongside p/li count
        const pAndLiCount = $el.find("p, li, td").length;
        const totalTextLen = $el.text().length;

        if (linksCount > pAndLiCount) return; 

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
    // Added "td" and "span" support so text trapped in table structures isn't skipped
    finalTarget.find("p, li, div, td, span").each((_, el) => {
      const $el = $(el);
      
      // Ensure we don't look at parent containers if they have text-holding children
      if ($el.children("p, li, div, td, span").length === 0) {
        const text = cleanText($el.text());
        if (
          text.length > 15 && // Lowered threshold from 25 to 15 to capture shorter sentences
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

    // Fallback block: if structural processing yielded too little text, try raw target text
    let finalContent = uniqueContent;
    if (finalContent.length < 150) {
      const rawText = cleanText(finalTarget.text());
      if (rawText.length > 150) {
         finalContent = rawText;
      }
    }

    if (finalContent.length < 150) {
      console.log(`❌ Skipped: Threshold not met [${url}]`);
      return null;
    }

    // 5️⃣ OUTPUT & LOGGING
    let confidence = 0;
    if (headline.length > 25) confidence += 25;
    if (finalContent.length > 500) confidence += 50;
    if (uniqueImages.length > 0) confidence += 25;

    console.log(`✅ Success: ${headline.substring(0, 45)}... [Score: ${confidence}/100]`);

    return {
      headline,
      content: finalContent,
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
