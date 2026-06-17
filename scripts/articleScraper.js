// scripts/articleScraper.js

import axios from "axios";
import * as cheerio from "cheerio";

/* ============================================================
   UTILITY: CLEANERS & FILTERS
============================================================ */
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
   REGION BRUTE-FORCE ENGINE (The Ultimate Bypass)
============================================================ */
// 3=Delhi, 48=PMO, 47=President, 50=Vice President, 4=Mumbai, 8=Chennai, 1=Kolkata, 17=Bengaluru
const COMMON_REGIONS = [3, 48, 47, 50, 4, 1, 8, 17, 11, 5, 6]; 

async function fetchWithRegionBruteForce(prid) {
  console.log(`🔗 Searching database for correct region... [PRID: ${prid}]`);

  for (const reg of COMMON_REGIONS) {
    const testUrl = `https://pib.gov.in/PressReleaseIframePage.aspx?PRID=${prid}&reg=${reg}&lang=1`;
    
    try {
      const response = await axios.get(testUrl, {
        headers: { 
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36", 
          "Referer": "https://pib.gov.in/",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
        },
        timeout: 8000 // Short 8s timeout per region test
      });

      const html = response.data;

      // If the HTML does NOT contain the soft error, we found the right region!
      if (
        html && 
        html.length > 500 && 
        !html.includes("Page you have requested is not available") && 
        !html.includes("Sorry for your Inconvenience")
      ) {
        console.log(`   ✅ Match Found! Article belongs to Region: ${reg}`);
        return { html, url: testUrl };
      }
    } catch (err) {
      // Silently ignore network timeouts and try the next region
    }
  }

  return null; // PRID not found in any common region
}

/* ============================================================
   PIB SCRAPER
============================================================ */
export async function scrapeFullArticle(url) {
  try {
    // 1️⃣ Extract PRID from the incoming RSS URL
    const prIDMatch = url.match(/PRID=(\d+)/);
    if (!prIDMatch) {
      console.log(`⚠️ Skipped: No PRID found in URL [${url}]`);
      return null;
    }
    const prid = prIDMatch[1];

    // 2️⃣ Brute Force the Region to bypass the PIB database error
    const result = await fetchWithRegionBruteForce(prid);
    
    if (!result) {
      console.log(`❌ Skipped: Could not resolve valid region for PRID ${prid}.`);
      return null;
    }

    const html = result.html;
    const finalUrl = result.url;
    const $ = cheerio.load(html);

    // 3️⃣ HEADLINE EXTRACTION
    const headline = cleanText(
      $("h2").first().text() || $("h1").first().text() || $(".ReleaseTitleTxt").text() || 
      $("meta[property='og:title']").attr("content") || $("title").text().split("|")[0]
    );

    if (!headline || headline.toLowerCase() === "untitled page" || headline.toLowerCase() === "pib") {
      console.log(`⚠️ Skipped: Invalid headline`);
      return null;
    }

    // 4️⃣ CONTENT BLOCK SELECTION
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

    // 5️⃣ SHIELDED TEXT HARVESTING
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

    // 6️⃣ IMAGE HARVESTING
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
      console.log(`❌ Skipped: Extracted text too short or contains error messages.`);
      return null;
    }

    // 7️⃣ SUCCESS OUTPUT
    let confidence = 0;
    if (headline.length > 25) confidence += 25;
    if (finalContent.length > 500) confidence += 50;
    if (uniqueImages.length > 0) confidence += 25;

    console.log(`✅ Scraped: ${headline.substring(0, 45)}...`);

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
