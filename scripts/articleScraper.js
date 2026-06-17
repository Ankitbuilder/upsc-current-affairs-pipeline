// scripts/articleScraper.js

import axios from "axios";
import * as cheerio from "cheerio";

/* ============================================================
   UTILITY: CLEANERS, FILTERS & SANITIZERS
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

function getRandomUserAgent() {
  const uas = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0"
  ];
  return uas[Math.floor(Math.random() * uas.length)];
}

/* ============================================================
   ULTIMATE PROXY FETCH ENGINE (GitHub Actions Cloud Bypass)
============================================================ */
async function fetchWithProxies(targetUrl) {
  const userAgent = getRandomUserAgent();

  // List of the strongest free proxies that bypass WAFs
  const proxyList = [
    { name: "CorsProxy.io", url: `https://corsproxy.io/?${encodeURIComponent(targetUrl)}` },
    { name: "AllOrigins (Raw)", url: `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}` },
    { name: "CodeTabs", url: `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}` }
  ];

  for (const proxy of proxyList) {
    try {
      console.log(`   🌐 Fetching via ${proxy.name}...`);
      const response = await axios.get(proxy.url, {
        headers: { 
          "User-Agent": userAgent,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
        },
        timeout: 15000 // 15 seconds strict timeout
      });

      const html = response.data;

      // Ensure we got valid HTML and NOT a PIB soft-error
      if (
        html && 
        html.length > 500 && 
        !html.includes("Page you have requested is not available") && 
        !html.includes("Sorry for your Inconvenience")
      ) {
        console.log(`   ✅ Success via ${proxy.name}!`);
        return html;
      } else {
        console.log(`   ⚠️ ${proxy.name} returned soft-error. Trying next...`);
      }
    } catch (err) {
      console.log(`   ⚠️ ${proxy.name} failed: ${err.message}`);
    }
  }

  return null; // All proxies failed
}

/* ============================================================
   PIB SCRAPER (TWO-STEP SELF-HEALING)
============================================================ */
export async function scrapeFullArticle(url) {
  try {
    const prIDMatch = url.match(/PRID=(\d+)/);
    if (!prIDMatch) {
      console.log(`⚠️ Skipped: No PRID found in URL [${url}]`);
      return null;
    }
    const prid = prIDMatch[1];

    // 1️⃣ Fetch the Main Page to extract the correct dynamic region/lang iframe
    const mainPageUrl = `https://pib.gov.in/PressReleasePage.aspx?PRID=${prid}`;
    console.log(`🔗 Resolving parameters for PRID: ${prid}`);
    
    let mainPageHtml = await fetchWithProxies(mainPageUrl);
    
    if (!mainPageHtml) {
      console.log(`❌ Skipped: Could not load main page for PRID ${prid}`);
      return null;
    }

    const $main = cheerio.load(mainPageHtml);

    // 2️⃣ Extract the correct embedded iframe URL
    let iframeSrc = null;
    $main("iframe").each((_, el) => {
      const src = $main(el).attr("src");
      if (src && src.includes("PressReleaseIframePage.aspx")) {
        iframeSrc = src;
      }
    });

    if (!iframeSrc) {
      console.log(`⚠️ Skipped: Could not find iframe inside main page for PRID ${prid}`);
      return null;
    }

    const correctIframeUrl = new URL(iframeSrc, "https://pib.gov.in").toString();
    console.log(`🎯 Found true article URL: ${correctIframeUrl}`);

    // 3️⃣ Fetch the actual iframe article content
    const html = await fetchWithProxies(correctIframeUrl);
    if (!html || html.length < 500) return null;

    const $ = cheerio.load(html);

    // 4️⃣ HEADLINE EXTRACTION
    const headline = cleanText(
      $("h2").first().text() || $("h1").first().text() || $(".ReleaseTitleTxt").text() || 
      $("meta[property='og:title']").attr("content") || $("title").text().split("|")[0]
    );

    if (!headline || headline.toLowerCase() === "untitled page" || headline.toLowerCase() === "pib") {
      console.log(`⚠️ Skipped: Invalid headline`);
      return null;
    }

    // 5️⃣ CONTENT BLOCK SELECTION
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

    // 6️⃣ SHIELDED TEXT HARVESTING
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

    // 7️⃣ IMAGE HARVESTING
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

    // 8️⃣ SUCCESS OUTPUT
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
