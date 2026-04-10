import "dotenv/config";
import fs from "fs";
import path from "path";
import axios from "axios";
import * as cheerio from "cheerio";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, "../data");

const CF_ACCOUNT_ID = process.env.R2_ACCOUNT_ID?.trim();
const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN?.trim();
const GROQ_API_KEY = process.env.GROQ_API_KEY?.trim();
const GEMINI_API_KEY = process.env.GEMINI_API_KEY?.trim();

// Global cache for the auto-discovered Gemini model
let autoGeminiModel = null;

function stripHtml(html) {
  const $ = cheerio.load(html || "");
  return $("body").text().replace(/\s+/g, " ").trim();
}

async function getDeepSummary(text, headline) {
  let cleanText = stripHtml(text);
  const words = cleanText.split(/\s+/).filter(w => w.length > 0);
  
  const slicedText = words.slice(0, 1000).join(" ");
  const targetWords = Math.max(Math.floor(words.length / 3), 200);

  const prompt = `Provide a DETAILED UPSC study note. 
  Sections: 1. CONTEXT, 2. KEY FEATURES, 3. SIGNIFICANCE, 4. UPSC RELEVANCE.
  LENGTH: ~${targetWords} words. 
  ARTICLE: ${slicedText}`;

  const providers = [
    { id: 'Gemini', active: !!GEMINI_API_KEY },
    { id: 'Groq', active: !!GROQ_API_KEY },
    { id: 'Cloudflare', active: !!CF_API_TOKEN && !!CF_ACCOUNT_ID }
  ];

  for (const p of providers) {
    if (!p.active) continue;
    
    try {
      let output = null;

      // 1. GEMINI (Auto-Discovery Mode)
      if (p.id === 'Gemini') {
        // 🚀 SURGICAL FIX: Ask Google what model this API key is allowed to use
        if (!autoGeminiModel) {
          console.log("🔍 Auto-detecting allowed Gemini model for your API key...");
          const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`;
          const listRes = await axios.get(listUrl, { timeout: 15000 });
          
          // Find models that support text generation
          const validModels = listRes.data.models.filter(m => 
            m.supportedGenerationMethods?.includes("generateContent") && 
            m.name.includes("gemini")
          );

          if (validModels.length > 0) {
            // Prefer 1.5 flash if allowed, otherwise pick whatever Google gives us
            const preferred = validModels.find(m => m.name.includes("1.5-flash")) || validModels[0];
            autoGeminiModel = preferred.name; // usually looks like "models/gemini-pro" or "models/gemini-1.5-flash"
            console.log(`✅ Google authorized model found: ${autoGeminiModel}`);
          } else {
            throw new Error("No text-generation models allowed for this API key.");
          }
        }

        // Use the newly discovered model!
        const url = `https://generativelanguage.googleapis.com/v1beta/${autoGeminiModel}:generateContent?key=${GEMINI_API_KEY}`;
        const res = await axios.post(url, {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 1000, temperature: 0.3 }
        }, { headers: { 'Content-Type': 'application/json' }, timeout: 30000 });
        
        output = res.data.candidates?.[0]?.content?.parts?.[0]?.text;
      }
      
      // 2. GROQ
      else if (p.id === 'Groq') {
        const res = await axios.post("https://api.groq.com/openai/v1/chat/completions", {
          model: "llama-3.1-8b-instant",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 1000
        }, { headers: { Authorization: `Bearer ${GROQ_API_KEY}` }, timeout: 30000 });
        output = res.data.choices?.[0]?.message?.content;
      }

      // 3. CLOUDFLARE
      else if (p.id === 'Cloudflare') {
        const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/@cf/meta/llama-3-8b-instruct`;
        const res = await axios.post(url, { prompt, max_tokens: 1000 }, {
          headers: { Authorization: `Bearer ${CF_API_TOKEN}` }, timeout: 40000
        });
        output = res.data.result?.response;
      }

      if (output && output.length > 200) {
        console.log(`⚡ Success via ${p.id}`);
        return output.replace(/^(Here is a summary|Here's a study note|.*summarizing:)/i, "").trim();
      }

    } catch (e) {
      const status = e.response?.status || e.status || 'Error';
      const detail = e.response?.data?.error?.message || e.message;
      console.warn(`⚠️ ${p.id} failed (${status}): ${detail}`);
    }
  }
  
  return null;
}

async function runSummarizer() {
  console.log("🤖 Starting Bulletproof Tri-Model Pipeline (Auto-Discovery Edition)...");
  
  if (!GEMINI_API_KEY) console.log("⚠️ WARNING: GEMINI_API_KEY is missing or empty!");

  const startTime = Date.now();
  const MAX_RUNTIME = 330 * 60 * 1000; 

  const allFiles = fs.readdirSync(dataDir).filter(f => f.endsWith(".json")).sort().reverse();
  
  let consecutiveFails = 0;
  let haltPipeline = false;

  for (const file of allFiles) {
    if (haltPipeline) break;

    const filePath = path.join(dataDir, file);
    let data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    let modified = false;

    for (let item of data) {
      if (Date.now() - startTime > MAX_RUNTIME) {
        console.log("⏳ 5.5 Hour limit reached mid-file. Initiating graceful shutdown...");
        haltPipeline = true;
        break; 
      }
      if (haltPipeline) break;

      if (!item.fullText && item.summaryText) item.fullText = item.summaryText;

      const isPlaceholder = item.summaryText === item.fullText;
      const isBroken = item.summaryText && (item.summaryText.includes("<p>") || item.summaryText.length < 350);

      if ((!item.summaryText || isPlaceholder || isBroken) && item.fullText) {
        
        const noise = ["condoles", "grief", "tribute", "congratulates", "greets", "warm wishes", "passed away"];
        if (noise.some(word => item.headline?.toLowerCase().includes(word))) {
          item.summaryText = stripHtml(item.fullText).substring(0, 400) + "...";
          modified = true;
          continue;
        }

        console.log(`Summarizing: ${item.headline?.substring(0, 40)}...`);
        const summary = await getDeepSummary(item.fullText, item.headline || "");
        
        if (summary) {
          item.summaryText = summary;
          modified = true;
          consecutiveFails = 0; 
        } else {
          consecutiveFails++;
          console.log(`❌ ALL Models Failed. Strike ${consecutiveFails}/4`);
          
          if (consecutiveFails >= 4) {
            console.error("🛑 CRITICAL: Gemini, Groq, and Cloudflare are ALL exhausted.");
            console.error("🛑 Tripping Circuit Breaker. Pipeline will sleep until next cron cycle.");
            haltPipeline = true;
          }
        }

        if (!haltPipeline) {
          await new Promise(r => setTimeout(r, 5000));
        }
      }
    }
    
    if (modified) {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      console.log(`✅ Progress Saved: ${file}`);
    }
  }
  
  if (haltPipeline) {
    console.log("💤 Pipeline paused safely. GitHub Action will now commit and upload data.");
  } else {
    console.log("🎉 All historical files completely summarized!");
  }
}

runSummarizer();
