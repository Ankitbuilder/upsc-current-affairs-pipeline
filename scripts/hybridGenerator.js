// scripts/hybridGenerator.js

import axios from "axios";
import { generateStructuredHTML } from "./ruleBasedGenerator.js";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama3-70b-8192";

function isValidHTML(output) {
  if (!output) return false;
  if (output.includes("```")) return false;
  if (!output.includes("<h3>Why in News</h3>")) return false;
  if (!output.includes("<h3>Background</h3>")) return false;
  if (!output.includes("<h3>Key Highlights</h3>")) return false;
  if (!output.includes("<h3>Prelims Facts</h3>")) return false;
  return true;
}

function buildPrompt(article) {
  return `
Generate structured UPSC Current Affairs content in clean HTML format only.

Do NOT include markdown.
Do NOT include explanation outside HTML.
Return only valid HTML.

Structure:

<h3>Why in News</h3>
<h3>Background</h3>
<h3>Key Highlights</h3>
<h3>Constitutional / Legal Provisions</h3>
<h3>Significance</h3>
<h3>Challenges</h3>
<h3>Way Forward</h3>
<h3>Prelims Facts</h3>
<h3>GS Paper Categorization</h3>

Article Title:
${article.title}

Article Content:
${article.content}
`;
}

export async function generateHybridHTML(article) {
  try {
    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
      return generateStructuredHTML(article);
    }

    const response = await axios.post(
      GROQ_API_URL,
      {
        model: MODEL,
        messages: [
          {
            role: "user",
            content: buildPrompt(article)
          }
        ],
        temperature: 0.3
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        timeout: 15000
      }
    );

    const output =
      response.data?.choices?.[0]?.message?.content || "";

    if (isValidHTML(output)) {
      return output.trim();
    }

    return generateStructuredHTML(article);

  } catch (error) {
    console.log("⚠ Groq API failed. Using rule engine fallback.");
    return generateStructuredHTML(article);
  }
}
