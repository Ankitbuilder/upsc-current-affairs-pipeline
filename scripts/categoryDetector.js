// scripts/categoryDetector.js

const CATEGORY_KEYWORDS = {
  "Economy": [
    "rbi","inflation","repo","monetary","bank",
    "gdp","budget","tax","trade","world bank",
    "imf","b-ready","business ready"
  ],

  "International Relations": [
    "israel","nepal","china","usa","united nations",
    "bilateral","treaty","knesset","visa",
    "corridor","strategic","summit"
  ],

  "Defence": [
    "army","navy","air force","military",
    "exercise","surya kiran","border",
    "counter-terror","defence"
  ],

  "Environment": [
    "biodiversity","ipbes","climate","forest",
    "wetland","ramsar","ecosystem","lake"
  ],

  "Health": [
    "vaccine","who","polio","immunisation",
    "disease","health ministry"
  ],

  "Agriculture": [
    "krishi","agriculture","crop","fertilizer",
    "farmer","pusa"
  ],

  "Infrastructure": [
    "infrastructure","railway","metro",
    "expressway","bharatmala","gati shakti",
    "ports","logistics"
  ],

  "History": [
    "muslim league","jinnah","partition",
    "lahore resolution","colonial"
  ],

  "Sports": [
    "championship","fide","olympiad",
    "tournament","world rapid"
  ]
};

export function detectCategory(article) {

  const text = (
    (article.headline || "") + " " +
    (article.fullText || "")
  ).toLowerCase();

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const word of keywords) {
      if (text.includes(word)) {
        return category;
      }
    }
  }

  return "General";
}
