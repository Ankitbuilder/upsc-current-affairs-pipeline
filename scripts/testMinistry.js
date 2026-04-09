import axios from "axios";
import * as cheerio from "cheerio";

const TEST_URL = ""https://www.pib.gov.in/PressReleaseIframePage.aspx?PRID=2232908&reg=3&lang=1";

function cleanText(text) {
  return (text || "").replace(/\s+/g, " ").trim();
}

function normalizeQuotes(text) {
  return (text || "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim();
}

function isBadCandidate(text) {
  const t = normalizeQuotes(cleanText(text)).toLowerCase();

  return (
    !t ||
    t.length < 4 ||
    t.length > 120 ||
    t === "home" ||
    t === "skip to main content" ||
    /^posted on[:\s]/i.test(t) ||
    /^entry date[:\s]*/i.test(t) ||
    /^date[:\s]*/i.test(t) ||
    /^प्रविष्टि तिथि[:\s]*/i.test(text) ||
    /^प्रकाशित तिथि[:\s]*/i.test(text) ||
    /^share[:\s]*/i.test(t) ||
    /^print[:\s]*/i.test(t) ||
    /facebook|twitter|whatsapp|linkedin|instagram|youtube|telegram|email/i.test(t) ||
    /azadi ka amrit mahotsav/i.test(t) ||
    /pib delhi/i.test(t) ||
    /press information bureau/i.test(t)
  );
}

function scoreCandidate(text) {
  const t = cleanText(text);
  let score = 0;

  if (!isBadCandidate(t)) score += 5;
  if (/commission|ministry|department|secretariat|office|bureau|authority|board|council|directorate|mission|niti|railway|railways|eci|upsc/i.test(t)) score += 20;
  if (/prime minister'?s office|president'?s secretariat|election commission|union public service commission/i.test(t)) score += 25;
  if (t.split(" ").length <= 8) score += 8;
  if (t.split(" ").length <= 5) score += 5;
  if (!/[.:]{2,}/.test(t)) score += 2;

  return score;
}

function getHeadline($) {
  const headlineSelectors = [
    "h2",
    "h1",
    ".ReleaseTitleTxt",
    ".ReleaseTitle",
    ".title",
    ".page_title",
  ];

  for (const selector of headlineSelectors) {
    const text = cleanText($(selector).first().text());
    if (text && text.length > 15) {
      return text;
    }
  }

  return "";
}

function uniquePush(list, value) {
  const v = cleanText(value);
  if (!v) return;
  if (!list.includes(v)) list.push(v);
}

function collectCenteredCandidates($, headline) {
  const candidates = [];

  $("body *").each((_, el) => {
    const $el = $(el);
    const text = cleanText($el.text());

    if (!text) return;
    if (text === headline) return;
    if (isBadCandidate(text)) return;

    const childText = cleanText(
      $el.children().map((__, child) => $(child).text()).get().join(" ")
    );

    if (childText && childText === text) {
      return;
    }

    const style = ($el.attr("style") || "").toLowerCase();
    const cls = ($el.attr("class") || "").toLowerCase();
    const align = ($el.attr("align") || "").toLowerCase();

    const looksCentered =
      style.includes("text-align:center") ||
      style.includes("text-align: center") ||
      cls.includes("text-center") ||
      cls.includes("center") ||
      align === "center";

    if (looksCentered) {
      uniquePush(candidates, text);
    }
  });

  return candidates;
}

function collectPreHeadlineCandidates($, headline) {
  const candidates = [];
  const headingEl = $("h2").first().length
    ? $("h2").first()
    : $("h1").first().length
      ? $("h1").first()
      : $(".ReleaseTitleTxt, .ReleaseTitle").first();

  if (!headingEl.length) return candidates;

  headingEl.prevAll().each((_, el) => {
    const text = cleanText($(el).text());
    if (!text) return;
    if (text === headline) return;
    if (isBadCandidate(text)) return;
    if (text.length > 120) return;
    uniquePush(candidates, text);
  });

  return candidates;
}

function extractMinistry($) {
  const headline = getHeadline($);

  const selectorCandidates = [
    ".ReleaseDept",
    ".ReleaseDepartment",
    ".DepartmentName",
    ".dept-name",
    ".department-name",
    ".ministry-name",
    ".release-department",
    ".releaseDept",
  ]
    .map((selector) => cleanText($(selector).first().text()))
    .filter((text) => text && !isBadCandidate(text) && text !== headline);

  const centeredCandidates = collectCenteredCandidates($, headline);
  const preHeadlineCandidates = collectPreHeadlineCandidates($, headline);

  const allCandidates = [
    ...selectorCandidates,
    ...centeredCandidates,
    ...preHeadlineCandidates,
  ];

  const uniqueCandidates = [...new Set(allCandidates)].filter(
    (text) => text && !isBadCandidate(text) && text !== headline
  );

  uniqueCandidates.sort((a, b) => scoreCandidate(b) - scoreCandidate(a));

  return {
    ministry: uniqueCandidates[0] || "",
    headline,
    debugCandidates: uniqueCandidates,
  };
}

async function main() {
  const response = await axios.get(TEST_URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/123 Safari/537.36",
      "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Cache-Control": "no-cache",
      "Pragma": "no-cache",
    },
    timeout: 30000,
  });

  const $ = cheerio.load(response.data);

  const { ministry, headline, debugCandidates } = extractMinistry($);

  console.log("URL:", TEST_URL);
  console.log("HEADLINE:", headline || "[EMPTY]");
  console.log("MINISTRY:", ministry || "[EMPTY]");
  console.log("DEBUG CANDIDATES:", JSON.stringify(debugCandidates, null, 2));

  if (!ministry) {
    console.log("NO MINISTRY FOUND");
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("ERROR:", error.message);
  process.exit(1);
});
