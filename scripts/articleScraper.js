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

function isValidHtml(html) {
  return html && 
         html.length > 500 && 
         !html.includes("Page you have requested is not available") && 
         !html.includes("Sorry for your Inconvenience");
}

/* ============================================================
   REGION BRUTE-FORCE + PROXY ENGINE
============================================================ */
// 48 = PMO, 3 = Delhi, 47 = President, 4 = Mumbai, 1 = Kolkata
const COMMON_REGIONS = [48, 3, 47, 4, 1, 50, 8]; 

async function fetchWithProxiesAndRegions(prid) {
  console.log(`🔗 Initiating Region Brute-Force for PRID: ${prid}`);

  for (const reg of COMMON_REGIONS) {
    const targetUrl = `https://pib.gov.in/PressReleaseIframePage.aspx?PRID=${prid}&reg=${reg}&lang=1`;
    
    // Create random Indian IP to spoof Akamai
    const randomIP = `117.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;

    // METHOD 1: Direct Fetch with Spoofed IP
    try {
      const res = await axios.get(targetUrl, {
        headers: { 
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", 
          "X-Forwarded-For": randomIP,
          "X-Real-IP": randomIP
        },
        timeout: 6000 
      });
      if (isValidHtml(res.data)) {
        console.log(`   ✅ Direct Match Found! Region: ${reg}`);
        return res.data;
      }
    } catch (e) {} // Silently fail and move to proxy

    // METHOD 2: CorsProxy.io (Fixed: URL must NOT be encoded)
    try {
      const proxyUrl = `https://corsproxy.io/?${targetUrl}`;
      const res = await axios.get(proxyUrl, { timeout: 10000 });
      if (isValidHtml(res.data)) {
        console.log(`   ✅ CorsProxy Match Found! Region: ${reg}`);
        return res.data;
      }
    } catch (e) {}

    // METHOD 3: AllOrigins RAW (Fixed: Endpoint usage)
    try {
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;
      const res = await axios.get(proxyUrl, { timeout: 10000 });
      if (isValidHtml(res.data)) {
        console.log(`   ✅ AllOrigins Match Found! Region: ${reg}`);
        return res.data;
      }
    } catch (e) {}
    
    // METHOD 4: CodeTabs (Fixed: Unencoded URL parsing)
    try {
      const proxyUrl = `https://api.codetabs.com/v1/proxy?quest=${targetUrl}`;
      const res = await axios.get(proxyUrl, { timeout: 10000 });
      if (isValidHtml(res.data)) {
        console.log(`   ✅ CodeTabs Match Found! Region: ${reg}`);
        return res.data;
      }
    } catch (e) {}
  }

  return null; // All regions and proxies failed
}

/* ============================================================
   PIB SCRAPER
============================================================ */
export async function scrapeFullArticle(url) {
  try {
    const prIDMatch = url.match(/PRID=(\d+)/);
    if (!prIDMatch) return null;
    const prid = prIDMatch[1];

    // Run the massive brute-force proxy engine
    const html = await fetchWithProxiesAndRegions(prid);

    if (!html) {
      console.log(`❌ Skipped: Could not resolve valid region or bypass WAF for PRID ${prid}`);
      return null;
    }

    const $ = cheerio.load(html);

    // 1️⃣ HEADLINE
    const headline = cleanText(
      $("h2").first().text() || $("h1").first().text() || $(".ReleaseTitleTxt").text() || 
      $("meta[property='og:title']").attr("content") || $("title").text().split("|")[0]
    );

    if (!headline || headline.toLowerCase() === "untitled page" || headline.toLowerCase() === "pib") {
      return null;
    }

    // 2️⃣ CONTENT TARGETING
    let target = null;
    const primarySelectors = [".ReleaseText", ".ReleaseTextTxt", "#ReleaseText", ".release-details-full"];
    
    for (const s of primarySelectors) {
      if ($(s).length > 0) { 
        target = $(s); 
        break; 
      }
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

    // 3️⃣ EXTRACT TEXT
    finalTarget.find("p, li, div, td, span").each((_, el) => {
      const $el = $(el);
      if ($el.children("p, li, div, td, span").length === 0) {
        const text = cleanText($el.text());
        if (text.length > 15 && !text.startsWith("Posted On:") && !text.toLowerCase().includes("follow us")) {
          contentBlocks.push(text);
        }
      }
    });

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
      images: [...new Set(images)]
    };

  } catch (error) {
    console.error(`❌ Critical PIB Fail [${url}]:`, error.message);
    return null;
  }
}
