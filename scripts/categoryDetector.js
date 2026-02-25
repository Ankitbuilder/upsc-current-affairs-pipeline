// scripts/categoryDetector.js

const CATEGORY_KEYWORDS = {
  "Economy": [
    "rbi","inflation","repo","monetary","bank",
    "gdp","budget","tax","trade","world bank",
    "imf","business ready","investment","finance"
  ],

  "International Relations": [
    "israel","nepal","china","usa","united nations",
    "bilateral","treaty","knesset","visa",
    "corridor","strategic","summit","agreement","g20","brics"
  ],

  "Defence": [
    "army","navy","air force","military",
    "exercise","surya kiran","border",
    "counter-terror","defence","security"
  ],

  "Environment": [
    "biodiversity","ipbes","climate","forest",
    "wetland","ramsar","ecosystem","lake",
    "pollution","wildlife","sustainability"
  ],

  "Health": [
    "vaccine","who","polio","immunisation",
    "disease","health ministry","hospital","medical"
  ],

  "Agriculture": [
    "krishi","agriculture","crop","fertilizer",
    "farmer","pusa","farming","agri"
  ],

  "Infrastructure": [
    "infrastructure","railway","metro",
    "expressway","bharatmala","gati shakti",
    "ports","logistics","highway"
  ],

  "History": [
    "muslim league","jinnah","partition",
    "lahore resolution","colonial","freedom struggle"
  ],

  "Sports": [
    "championship","fide","olympiad",
    "tournament","world rapid","cricket","hockey"
  ]
};

export function detectCategory(article) {

  const text = (
    (article.headline || "") + " " +
    (article.fullText || "")
  ).toLowerCase();

  let bestCategory = "General";
  let maxScore = 0;

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {

    let score = 0;

    for (const word of keywords) {
      const regex = new RegExp(`\\b${word}\\b`, "g");
      const matches = text.match(regex);
      if (matches) {
        score += matches.length;
      }
    }

    if (score > maxScore) {
      maxScore = score;
      bestCategory = category;
    }
  }

  return bestCategory;
}
