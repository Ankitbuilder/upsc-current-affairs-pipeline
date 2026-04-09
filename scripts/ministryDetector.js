import axios from "axios";
import * as cheerio from "cheerio";

const VALID_PIB_SOURCES = [
  "AYUSH",
  "NITI Aayog",
  "PM Speech",
  "EAC-PM",
  "UPSC",
  "Special Service and Features",
  "PIB Headquarters",

  "President's Secretariat",
  "Vice President's Secretariat",
  "Prime Minister's Office",
  "Lok Sabha Secretariat",
  "Rajya Sabha Secretariat",
  "Cabinet Secretariat",
  "National Security Council Secretariat",
  "Office of Principal Scientific Advisor to GoI",

  "Election Commission",
  "Finance Commission",
  "Competition Commission of India",
  "IFSC Authority",
  "National Financial Reporting Authority",
  "National Human Rights Commission",
  "Lokpal of India",

  "Cabinet",
  "Cabinet Committee Decisions",
  "Cabinet Committee on Economic Affairs (CCEA)",
  "Cabinet Committee on Infrastructure",
  "Cabinet Committee on Price",
  "Cabinet Committee on Investment",
  "Other Cabinet Committees",

  "Department of Space",
  "Department of Ocean Development",
  "Department of Atomic Energy",
  "Department of Pharmaceuticals",
  "Department of Fertilizers",
  "Department of Chemicals and Petrochemicals",

  "Ministry of Agriculture & Farmers Welfare",
  "Ministry of Agro & Rural Industries",
  "Ministry of Chemicals and Fertilizers",
  "Ministry of Civil Aviation",
  "Ministry of Coal",
  "Ministry of Commerce & Industry",
  "Ministry of Communications",
  "Ministry of Company Affairs",
  "Ministry of Consumer Affairs, Food & Public Distribution",
  "Ministry of Cooperation",
  "Ministry of Corporate Affairs",
  "Ministry of Culture",
  "Ministry of Defence",
  "Ministry of Development of North-East Region",
  "Ministry of Disinvestment",
  "Ministry of Drinking Water & Sanitation",
  "Ministry of Earth Sciences",
  "Ministry of Education",
  "Ministry of Electronics & IT",
  "Ministry of Environment, Forest and Climate Change",
  "Ministry of External Affairs",
  "Ministry of Finance",
  "Ministry of Fisheries, Animal Husbandry & Dairying",
  "Ministry of Food Processing Industries",
  "Ministry of Health and Family Welfare",
  "Ministry of Heavy Industries",
  "Ministry of Urban Development",
  "Ministry of Water Resources, River Development and Ganga Rejuvenation",
  "Ministry of Women and Child Development",
  "Ministry of Youth Affairs and Sports",
];

const VALID_PIB_SOURCE_LOOKUP = new Map(
  VALID_PIB_SOURCES.map((value) => [value.toLowerCase(), value])
);

const PIB_SOURCE_ALIASES = new Map([
  ["pmo", "Prime Minister's Office"],
  ["prime minister office", "Prime Minister's Office"],
  ["prime ministers office", "Prime Minister's Office"],

  ["presidents secretariat", "President's Secretariat"],
  ["vice presidents secretariat", "Vice President's Secretariat"],

  ["niti", "NITI Aayog"],
  ["niti ayog", "NITI Aayog"],

  ["cci", "Competition Commission of India"],
  ["competition commission", "Competition Commission of India"],

  ["nfra", "National Financial Reporting Authority"],
  ["nfr authority", "National Financial Reporting Authority"],

  ["nhrc", "National Human Rights Commission"],

  ["ifsca", "IFSC Authority"],
  ["international financial services centres authority", "IFSC Authority"],

  ["nscs", "National Security Council Secretariat"],

  ["office of principal scientific advisor to government of india", "Office of Principal Scientific Advisor to GoI"],
  ["office of principal scientific advisor", "Office of Principal Scientific Advisor to GoI"],
  ["principal scientific advisor office", "Office of Principal Scientific Advisor to GoI"],

  ["cabinet committee on economic affairs", "Cabinet Committee on Economic Affairs (CCEA)"],
  ["ccea", "Cabinet Committee on Economic Affairs (CCEA)"],

  ["ministry of electronics and it", "Ministry of Electronics & IT"],
  ["ministry of electronics & information technology", "Ministry of Electronics & IT"],

  ["ministry of commerce and industry", "Ministry of Commerce & Industry"],
  ["ministry of agriculture and farmers welfare", "Ministry of Agriculture & Farmers Welfare"],
  ["ministry of consumer affairs food and public distribution", "Ministry of Consumer Affairs, Food & Public Distribution"],
  ["ministry of fisheries animal husbandry and dairying", "Ministry of Fisheries, Animal Husbandry & Dairying"],

  ["all ministry", ""],
  ["home", ""],
]);

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

export function canonicalizePibSource(text) {
  const normalized = normalizeMinistry(text || "");
  if (!normalized) return "";

  const lower = normalized.toLowerCase();

  if (PIB_SOURCE_ALIASES.has(lower)) {
    return PIB_SOURCE_ALIASES.get(lower);
  }

  if (VALID_PIB_SOURCE_LOOKUP.has(lower)) {
    return VALID_PIB_SOURCE_LOOKUP.get(lower);
  }

  return normalized;
}

export function isValidPibSource(text) {
  const canonical = canonicalizePibSource(text || "");
  return !!canonical && VALID_PIB_SOURCE_LOOKUP.has(canonical.toLowerCase());
}

export function stripHtml(html) {
  if (!html) return "";
  const $ = cheerio.load(`<div id="__root__">${html}</div>`);
  return cleanText($("#__root__").text());
}

export function isBadCandidate(text) {
  const raw = normalizeQuotes(cleanText(text));
  const t = raw.toLowerCase();

  if (isValidPibSource(raw)) return false;

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

  const canonical = canonicalizePibSource(t);
  if (isValidPibSource(canonical)) {
    score += 60;
  }

  if (!isBadCandidate(t)) score += 5;

  if (
    /commission|ministry|department|secretariat|office|bureau|authority|board|council|directorate|mission|niti|railway|railways|eci|upsc/i.test(t)
  ) {
    score += 20;
  }

  if (
    /prime minister'?s office|president'?s secretariat|election commission|union public service commission/i.test(
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
    .map((text) => canonicalizePibSource(text))
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
