import axios from "axios";
import * as cheerio from "cheerio";

export function cleanText(text) {
  return (text || "").replace(/\s+/g, " ").trim();
}

export function normalizeQuotes(text) {
  return (text || "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim();
}

export function normalizeMinistry(text) {
  let t = normalizeQuotes(cleanText(text));

  t = t.replace(/\s*\/\s*/g, " / ");
  t = t.replace(/\s{2,}/g, " ").trim();
  t = t.replace(/[|•·]+$/g, "").trim();
  t = t.replace(/^[:\-–—\s]+/, "").trim();

  return t;
}

export function stripHtml(html) {
  if (!html) return "";
  const $ = cheerio.load(`<div id="__root__">${html}</div>`);
  return cleanText($("#__root__").text());
}

export function isBadCandidate(text) {
  const raw = normalizeQuotes(cleanText(text));
  const t = raw.toLowerCase();

  return (
    !t ||
    t.length < 4 ||
    t.length > 120 ||
    t === "home" ||
    t === "skip to main content" ||
    /^posted on[:\s]/i.test(raw) ||
    /^entry date[:\s]*/i.test(raw) ||
    /^date[:\s]*/i.test(raw) ||
    /^प्रविष्टि तिथि[:\s]*/i.test(raw) ||
    /^प्रकाशित तिथि[:\s]*/i.test(raw) ||
    /^share[:\s]*/i.test(raw) ||
    /^print[:\s]*/i.test(raw) ||
    /^read this release in[:\s]*/i.test(raw) ||
    /facebook|twitter|whatsapp|linkedin|instagram|youtube|telegram|email/i.test(t) ||
    /azadi ka amrit mahotsav/i.test(t) ||
    /press information bureau/i.test(t) ||
    /pib delhi/i.test(t)
  );
}

export function scoreCandidate(text) {
  const t = cleanText(text);
  const lower = t.toLowerCase();
  let score = 0;

  if (!isBadCandidate(t)) score += 5;

  if (
    /commission|ministry|department|secretariat|office|bureau|authority|board|council|directorate|mission|niti|railway|railways|eci|upsc/i.test(t)
  ) {
    score += 20;
  }

  if (
    /prime minister'?s office|president'?s secretariat|election commission|Upsc|ECI|Supreme Court|Department|union public service commission/i.test(
      lower
    )
  ) {
    score += 25;
  }

  if (/^ministry of /i.test(t)) score += 30;
  if (/^department of /i.test(t)) score += 24;
  if (/^prime minister'?s office$/i.test(t)) score += 35;
  if (/^president'?s secretariat$/i.test(t)) score += 35;
  if (/^niti aayog$/i.test(t)) score += 30;
  if (/^ministry$/i.test(t)) score -= 40;
  if (/^department$/i.test(t)) score -= 40;

  const wordCount = t.split(/\s+/).length;
  if (wordCount <= 8) score += 8;
  if (wordCount <= 5) score += 5;
  if (!/[.:]{2,}/.test(t)) score += 2;

  if (/[.!?]/.test(t)) score -= 10;
  if (/,/.test(t) && wordCount > 8) score -= 8;

  return score;
}

export function getHeadline($) {
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
      $el
        .children()
        .map((__, child) => $(child).text())
        .get()
        .join(" ")
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

function collectTopBlockCandidates($, headline, rootSelector = "body") {
  const candidates = [];
  const seen = new Set();

  $(rootSelector)
    .find("p, div, li, span, strong, b, td")
    .each((_, el) => {
      if (candidates.length >= 20) return false;

      const text = cleanText($(el).text());
      if (!text) return;
      if (text === headline) return;
      if (isBadCandidate(text)) return;
      if (text.length > 120) return;
      if (seen.has(text)) return;

      seen.add(text);
      candidates.push(text);
      return undefined;
    });

  return candidates;
}

function rankCandidates(candidates, headline = "") {
  const uniqueCandidates = [...new Set(candidates)]
    .map((text) => normalizeMinistry(text))
    .filter((text) => text && !isBadCandidate(text) && text !== headline);

  uniqueCandidates.sort((a, b) => scoreCandidate(b) - scoreCandidate(a));

  return uniqueCandidates;
}

export function extractMinistry($) {
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
  const topBlockCandidates = collectTopBlockCandidates($, headline, "body");

  const allCandidates = [
    ...selectorCandidates,
    ...centeredCandidates,
    ...preHeadlineCandidates,
    ...topBlockCandidates,
  ];

  const debugCandidates = rankCandidates(allCandidates, headline);
  const ministry = debugCandidates[0] || "";

  return {
    ministry,
    headline,
    debugCandidates,
  };
}

export function extractMinistryFromHtml(html) {
  const $ = cheerio.load(html || "");
  return extractMinistry($);
}

export function extractMinistryFromSummary(summaryHtml) {
  const $ = cheerio.load(`<div id="summary-root">${summaryHtml || ""}</div>`);
  const candidates = collectTopBlockCandidates($, "", "#summary-root");
  const debugCandidates = rankCandidates(candidates, "");
  const ministry = debugCandidates[0] || "";

  return {
    ministry,
    headline: "",
    debugCandidates,
  };
}

async function fetchWithRetry(url, retries = 3) {
  let attempt = 0;

  while (attempt < retries) {
    try {
      return await axios.get(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/123 Safari/537.36",
          "Accept":
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Cache-Control": "no-cache",
          "Pragma": "no-cache",
          "Referer": "https://pib.gov.in/",
        },
        timeout: 30000,
      });
    } catch (error) {
      attempt += 1;
      if (attempt >= retries) throw error;
      await new Promise((resolve) =>
        setTimeout(resolve, 1000 * Math.pow(2, attempt))
      );
    }
  }

  throw new Error("Unreachable fetch retry state");
}

export async function detectMinistryFromUrl(url) {
  if (!url) {
    return {
      ministry: "",
      headline: "",
      debugCandidates: [],
      error: "Missing article URL",
    };
  }

  try {
    const response = await fetchWithRetry(url);
    const result = extractMinistryFromHtml(response.data);
    return { ...result, error: null };
  } catch (error) {
    return {
      ministry: "",
      headline: "",
      debugCandidates: [],
      error: error.message || "Unknown fetch error",
    };
  }
}
