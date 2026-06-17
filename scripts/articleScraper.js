// scripts/articleScraper.js

import axios from "axios";
import * as cheerio from "cheerio";

/* ============================================================
   UTILITY: CLEANERS, FILTERS & SANITIZERS
============================================================ */
function sanitizePibUrl(url) {
  if (!url) return url;
  try {
    const u = new URL(url);
    // Strip the "reg" and "regid" query parameters completely.
    // This forces PIB's database to query globally by PRID, avoiding region-mismatch errors.
    u.searchParams.delete("reg");
    u.searchParams.delete("regid");
    
    // Force bare domain for better routing compatibility
    u.hostname = "pib.gov.in"; 
    
    return u.toString();
  } catch (e) {
    return url;
  }
}

function normalizeImageUrl(src) {
  if (!src) return null;
  const fullUrl = src.startsWith("http") ? src : "https://pib.gov.in" + src;
  const blacklist = ["logo", "azadika", "facebook", "twitter", "instagram", "youtube", "print", "share", "icon"];
  return blacklist.some(word => fullUrl.toLowerCase().includes(word)) ? null : fullUrl;
}

function cleanText(text) {
  if (!text) return "";
  return text.replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim();
}

/* ============================================================
   MULTIPLE-PROXY FETCH ENGINE (ZERO-KEY, ANTI-HANG EDITION)
============================================================ */
async function fetchWithRetry(url, retries = 2) {
  const prIDMatch = url.match(/PRID=(\d+)/);
  const prid = prIDMatch ? prIDMatch[1] : "";
  const referer = prid ? `https://pib.gov.in/PressReleasePage.aspx?PRID=${prid}` : "https://pib.gov.in/";

  let attempt = 0;
  let html = null;

  // 1️⃣ Attempt Direct Fetch First (With short 10s timeout)
  while (attempt < retries) {
    try {
      const response = await axios.get(url, {
        headers: { 
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36", 
          "Referer": referer,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
          "Cache-Control": "no-cache"
        },
        timeout: 10000 
      });

      const tempHtml = response.data;
      if (
        tempHtml && 
        tempHtml.length > 500 && 
        !tempHtml.includes("Page you have requested is not available") && 
        !tempHtml.includes("Sorry for your Inconvenience")
      ) {
        html = tempHtml;
        break; // Direct fetch succeeded!
      }
    } catch (err) {
      // Fail silently and move on to retry or proxy fallback
    }
    attempt++;
  }

  // 2️⃣ Multi-Proxy Fallback Engine if direct fetch is blocked
  if (!html) {
    console.log(`ℹ️ Direct fetch blocked. Attempting proxy fallback...`);

    // Proxy 1: CodeTabs (Fast, returns raw HTML directly. Strict 12s timeout)
    try {
      console.log(`   Trying CodeTabs proxy...`);
      const proxyUrl = `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`;
      const response = await axios.get(proxyUrl, { timeout: 12000 });
      const tempHtml = response.data;
      
      if (
        tempHtml && 
        tempHtml.length > 500 && 
        !tempHtml.includes("Page you have requested is not available") && 
        !tempHtml.includes("Sorry for your Inconvenience")
      ) {
        html = tempHtml;
        console.log(`✅ Proxy bypass successful (via CodeTabs)!`);
      }
    } catch (err) {
      console.warn(`   ⚠️ CodeTabs proxy failed or timed out: ${err.message}`);
    }

    // Proxy 2: AllOrigins (Backup, returns JSON wrapper. 15s timeout)
    if (!html) {
      try {
        console.log(`   Trying AllOrigins proxy...`);
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
        const response = await axios.get(proxyUrl, { timeout: 15000 });
        
        let proxyData = response.data;
        if (typeof proxyData === "string") {
          proxyData = JSON.parse(proxyData);
        }

        const tempHtml = proxyData?.contents;
        if (
          tempHtml && 
          tempHtml.length > 500 && 
          !tempHtml.includes("Page you have requested is not available") && 
          !tempHtml.includes("Sorry for your Inconvenience")
        ) {
          html = tempHtml;
          console.log(`✅ Proxy bypass successful (via AllOrigins)!`);
        }
      } catch (err) {
        console.warn(`   ⚠️ AllOrigins proxy failed or timed out: ${err.message}`);
      }
    }
  }

  if (html) {
    return { data: html };
  }

  throw new Error("All direct and proxy bypass attempts were blocked by PIB.");
}

/* ============================================================
   PIB SCRAPER
============================================================ */
export async function scrapeFullArticle(url) {
  try {
    const sanitizedUrl = sanitizePibUrl(url);

    const response = await fetchWithRetry(sanitizedUrl);
    const html = response.data;
    if (!html || html.length < 500) return null;

    const $ = cheerio.load(html);

    // 1️⃣ HEADLINE
    const headline = cleanText(
      $("h2").first().text() || $("h1").first().text() || $(".ReleaseTitleTxt").text() || 
      $("meta[property='og:title']").attr("content") || $("title").text().split("|")[0]
    );

    if (!headline || headline.toLowerCase() === "untitled page" || headline.toLowerCase() === "pib") {
      console.log(`⚠️ Skipped: Invalid or empty headline [${sanitizedUrl}]`);
      return null;
    }

    // 2️⃣ ADVANCED TARGET DETECTION
    let target = null;
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
      
      $("article, main, div, td").not("nav, footer, header, aside, .sidebar, .menu").each((_, el) => {
        const $el = $(el);
        const linksCount = $el.find("a").length;
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
    finalTarget.find("p, li, div, td, span").each((_, el) => {
      const $el = $(el);
      if ($el.children("p, li, div, td, span").length === 0) {
        const text = cleanText($el.text());
        if (
          text.length > 15 && 
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

    let finalContent = uniqueContent;
    if (finalContent.length < 150) {
      const rawText = cleanText(finalTarget.text());
      if (rawText.length > 150) {
         finalContent = rawText;
      }
    }

    if (
      finalContent.length < 150 || 
      finalContent.includes("Page you have requested is not available") || 
      finalContent.includes("Sorry for your Inconvenience")
    ) {
      console.log(`❌ Skipped: Threshold not met or error text found [${sanitizedUrl}]`);
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
