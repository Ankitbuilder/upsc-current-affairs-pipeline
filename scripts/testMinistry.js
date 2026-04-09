import axios from "axios";
import * as cheerio from "cheerio";

const TEST_URL = "https://www.pib.gov.in/PressReleaseIframePage.aspx?PRID=2232908&reg=3&lang=1";

const CANONICAL_ENTITIES = [
  "President's Secretariat",
  "Vice President's Secretariat",
  "Prime Minister's Office",
  "Lok Sabha Secretariat",
  "Rajya Sabha Secretariat",
  "Cabinet",
  "Cabinet Committee Decisions",
  "Cabinet Committee on Economic Affairs (CCEA)",
  "Cabinet Secretariat",
  "Cabinet Committee on Infrastructure",
  "Cabinet Committee on Price",
  "Cabinet Committee on Investment",
  "AYUSH",
  "Other Cabinet Committees",
  "Department of Space",
  "Department of Ocean Development",
  "Department of Atomic Energy",
  "Election Commission",
  "Finance Commission",
  "Ministry of Agriculture & Farmers Welfare",
  "Ministry of Agro & Rural Industries",
  "Ministry of Chemicals and Fertilizers",
  "Department of Pharmaceuticals",
  "Department of Fertilizers",
  "Department of Chemicals and Petrochemicals",
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
  "Ministry of Home Affairs",
  "Ministry of Housing & Urban Affairs",
  "Ministry of Information & Broadcasting",
  "Ministry of Jal Shakti",
  "Ministry of Labour & Employment",
  "Ministry of Law and Justice",
  "Ministry of Micro,Small & Medium Enterprises",
  "Ministry of Mines",
  "Ministry of Minority Affairs",
  "Ministry of New and Renewable Energy",
  "Ministry of Overseas Indian Affairs",
  "Ministry of Panchayati Raj",
  "Ministry of Parliamentary Affairs",
  "Ministry of Personnel, Public Grievances & Pensions",
  "Ministry of Petroleum & Natural Gas",
  "Ministry of Planning",
  "Ministry of Power",
  "Ministry of Railways",
  "Ministry of Road Transport & Highways",
  "Ministry of Rural Development",
  "Ministry of Science & Technology",
  "Ministry of Ports, Shipping and Waterways",
  "Ministry of Skill Development and Entrepreneurship",
  "Ministry of Social Justice & Empowerment",
  "Ministry of Statistics & Programme Implementation",
  "Ministry of Steel",
  "Ministry of Surface Transport",
  "Ministry of Textiles",
  "Ministry of Tourism",
  "Ministry of Tribal Affairs",
  "Ministry of Urban Development",
  "Ministry of Water Resources, River Development and Ganga Rejuvenation",
  "Ministry of Women and Child Development",
  "Ministry of Youth Affairs and Sports",
  "NITI Aayog",
  "PM Speech",
  "EAC-PM",
  "UPSC",
  "Special Service and Features",
  "PIB Headquarters",
  "Office of Principal Scientific Advisor to GoI",
  "National Financial Reporting Authority",
  "Competition Commission of India",
  "IFSC Authority",
  "National Security Council Secretariat",
  "National Human Rights Commission",
  "Lokpal of India",
];

const MANUAL_ALIASES = {
  "Prime Minister's Office": ["PMO", "Prime Ministers Office"],
  "Cabinet Committee on Economic Affairs (CCEA)": [
    "CCEA",
    "Cabinet Committee on Economic Affairs",
  ],
  AYUSH: ["Ministry of AYUSH", "Ayush Ministry"],
  "Election Commission": ["ECI", "Election Commission of India"],
  "Department of Atomic Energy": ["DAE"],
  "Department of Space": ["DOS"],
  "Department of Ocean Development": ["DOD"],
  "Department of Pharmaceuticals": ["DOP", "Pharmaceuticals Department"],
  "Department of Fertilizers": ["DOF", "Fertilizers Department"],
  "Department of Chemicals and Petrochemicals": [
    "DCPC",
    "Chemicals and Petrochemicals Department",
  ],
  "Ministry of Agriculture & Farmers Welfare": [
    "Agriculture Ministry",
    "MOAFW",
  ],
  "Ministry of Commerce & Industry": ["Commerce Ministry"],
  "Ministry of Consumer Affairs, Food & Public Distribution": [
    "Consumer Affairs Ministry",
    "Food and Public Distribution",
  ],
  "Ministry of Defence": ["MOD", "Defence Ministry", "Defense Ministry"],
  "Ministry of Education": [
    "MOE",
    "Education Ministry",
    "MHRD",
    "Ministry of Human Resource Development",
    "Human Resource Development Ministry",
  ],
  "Ministry of Electronics & IT": [
    "MEITY",
    "Ministry of Electronics and Information Technology",
    "Electronics and IT Ministry",
  ],
  "Ministry of Environment, Forest and Climate Change": [
    "MOEFCC",
    "Environment Ministry",
    "Ministry of Environment Forest and Climate Change",
  ],
  "Ministry of External Affairs": ["MEA", "External Affairs Ministry"],
  "Ministry of Finance": ["MOF", "Finance Ministry"],
  "Ministry of Fisheries, Animal Husbandry & Dairying": ["FAHD"],
  "Ministry of Health and Family Welfare": ["MOHFW", "Health Ministry"],
  "Ministry of Home Affairs": ["MHA", "Home Ministry"],
  "Ministry of Housing & Urban Affairs": [
    "MOHUA",
    "Housing and Urban Affairs Ministry",
  ],
  "Ministry of Information & Broadcasting": [
    "MIB",
    "I&B Ministry",
    "Ministry of Information and Broadcasting",
  ],
  "Ministry of Labour & Employment": [
    "MOLE",
    "Labour Ministry",
    "Labor Ministry",
  ],
  "Ministry of Micro,Small & Medium Enterprises": [
    "MSME",
    "MSME Ministry",
    "Ministry of MSME",
    "Ministry of Micro Small and Medium Enterprises",
  ],
  "Ministry of New and Renewable Energy": ["MNRE"],
  "Ministry of Personnel, Public Grievances & Pensions": [
    "DOPT",
    "Personnel Ministry",
  ],
  "Ministry of Petroleum & Natural Gas": [
    "MOPNG",
    "Petroleum Ministry",
    "Oil Ministry",
  ],
  "Ministry of Road Transport & Highways": [
    "MORTH",
    "Road Transport and Highways Ministry",
  ],
  "Ministry of Science & Technology": ["MOST", "Science and Technology Ministry"],
  "Ministry of Statistics & Programme Implementation": [
    "MOSPI",
    "Statistics Ministry",
  ],
  "Ministry of Women and Child Development": ["MWCD", "WCD Ministry"],
  "NITI Aayog": ["NITI", "NITIAYOG"],
  "EAC-PM": [
    "PMEAC",
    "EACPM",
    "Economic Advisory Council to Prime Minister",
    "Economic Advisory Council to the Prime Minister",
  ],
  UPSC: ["Union Public Service Commission"],
  "Office of Principal Scientific Advisor to GoI": [
    "Principal Scientific Advisor",
    "Principal Scientific Adviser",
    "PSA Office",
  ],
  "National Financial Reporting Authority": ["NFRA"],
  "Competition Commission of India": ["CCI"],
  "IFSC Authority": [
    "IFSCA",
    "International Financial Services Centres Authority",
  ],
  "National Security Council Secretariat": ["NSCS"],
  "National Human Rights Commission": ["NHRC"],
};

function cleanText(text) {
  return (text || "").replace(/\s+/g, " ").trim();
}

function normalizeQuotes(text) {
  return (text || "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim();
}

function normalizeEntityText(text) {
  return normalizeQuotes(cleanText(text))
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[()[\]{}]/g, " ")
    .replace(/[,:;./\\-]+/g, " ")
    .replace(/\bgoi\b/g, "government of india")
    .replace(/\s+/g, " ")
    .trim();
}

function isBadCandidate(text) {
  const t = normalizeQuotes(cleanText(text)).toLowerCase();

  return (
    !t ||
    t.length < 3 ||
    t.length > 180 ||
    t === "home" ||
    t === "all ministry" ||
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
  if (
    /commission|ministry|department|secretariat|office|bureau|authority|board|council|directorate|mission|niti|railway|railways|eci|upsc|pmo|mea|mha|mib|mospi|mnre|morth|mod|mof/i.test(
      t
    )
  )
    score += 25;
  if (
    /prime minister'?s office|president'?s secretariat|election commission|union public service commission/i.test(
      t
    )
  )
    score += 20;
  if (t.split(" ").length <= 10) score += 8;
  if (t.split(" ").length <= 6) score += 5;
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
    if (text.length > 180) return;
    uniquePush(candidates, text);
  });

  return candidates;
}

function buildAutoAliases(canonical) {
  const aliases = new Set([canonical]);
  const noParen = cleanText(canonical.replace(/\([^)]*\)/g, " "));
  aliases.add(noParen);

  const ministryMatch = noParen.match(/^Ministry of\s+(.+)$/i);
  if (ministryMatch) {
    const tail = cleanText(ministryMatch[1]);
    aliases.add(tail);

    const initials = tail
      .split(/\s+/)
      .filter((w) => w && !["and", "of", "the"].includes(w.toLowerCase()))
      .map((w) => w[0])
      .join("")
      .toUpperCase();

    if (initials) aliases.add(`MO${initials}`);
  }

  const deptMatch = noParen.match(/^Department of\s+(.+)$/i);
  if (deptMatch) {
    const tail = cleanText(deptMatch[1]);
    aliases.add(tail);

    const initials = tail
      .split(/\s+/)
      .filter((w) => w && !["and", "of", "the"].includes(w.toLowerCase()))
      .map((w) => w[0])
      .join("")
      .toUpperCase();

    if (initials) aliases.add(`DO${initials}`);
  }

  return [...aliases];
}

function buildAliasMap() {
  const map = new Map();

  for (const canonical of CANONICAL_ENTITIES) {
    const aliases = [
      ...buildAutoAliases(canonical),
      ...(MANUAL_ALIASES[canonical] || []),
    ];

    for (const alias of aliases) {
      const key = normalizeEntityText(alias);
      if (key) map.set(key, canonical);
    }
  }

  return map;
}

const ENTITY_ALIAS_MAP = buildAliasMap();
const SORTED_ALIAS_KEYS = [...ENTITY_ALIAS_MAP.keys()].sort(
  (a, b) => b.length - a.length
);

function explodeCandidate(text) {
  const raw = cleanText(text);
  const pieces = new Set([raw]);

  raw
    .split(/\s*[|/>»]\s*/)
    .map(cleanText)
    .filter(Boolean)
    .forEach((part) => pieces.add(part));

  const stripped = raw
    .replace(/^ministry\s*[:\-]\s*/i, "")
    .replace(/^department\s*[:\-]\s*/i, "")
    .replace(/^office\s*[:\-]\s*/i, "")
    .replace(/^source\s*[:\-]\s*/i, "");

  if (cleanText(stripped) && cleanText(stripped) !== raw) {
    pieces.add(cleanText(stripped));
  }

  return [...pieces];
}

function resolveCanonicalEntity(candidates) {
  for (const candidate of candidates) {
    const forms = explodeCandidate(candidate);

    for (const form of forms) {
      const normalized = normalizeEntityText(form);
      if (!normalized) continue;

      if (ENTITY_ALIAS_MAP.has(normalized)) {
        return ENTITY_ALIAS_MAP.get(normalized);
      }

      for (const alias of SORTED_ALIAS_KEYS) {
        if (alias.length < 6) continue;
        if (normalized.includes(alias)) {
          return ENTITY_ALIAS_MAP.get(alias);
        }
      }
    }
  }

  return "";
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

  const uniqueCandidates = [...new Set(allCandidates)]
    .filter((text) => text && !isBadCandidate(text) && text !== headline)
    .sort((a, b) => scoreCandidate(b) - scoreCandidate(a));

  const canonical = resolveCanonicalEntity(uniqueCandidates);

  return {
    ministry: canonical || uniqueCandidates[0] || "",
    headline,
    debugCandidates: uniqueCandidates,
    matchedCanonical: canonical || "",
  };
}

async function main() {
  const response = await axios.get(TEST_URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/123 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
    timeout: 30000,
  });

  const $ = cheerio.load(response.data);

  const { ministry, headline, debugCandidates, matchedCanonical } = extractMinistry($);

  console.log("URL:", TEST_URL);
  console.log("HEADLINE:", headline || "[EMPTY]");
  console.log("MINISTRY:", ministry || "[EMPTY]");
  console.log("MATCHED CANONICAL:", matchedCanonical || "[EMPTY]");
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
