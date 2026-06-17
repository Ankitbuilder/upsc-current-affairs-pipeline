// scripts/fixUrls.js

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, "../data");

function fixAllUrls() {
  console.log("🔍 Scanning historical data files to update URLs to reg=48...");

  const files = fs.readdirSync(dataDir).filter(f => f.endsWith(".json") && !["dates.json", "processedLinks.json"].includes(f));
  
  let totalUpdated = 0;

  for (const file of files) {
    const filePath = path.join(dataDir, file);
    let fileChanged = false;
    
    try {
      let data = JSON.parse(fs.readFileSync(filePath, "utf8"));
      
      data.forEach(item => {
        if (item.articleUrl) {
          // Extract the PRID from whatever URL is currently saved
          const prIDMatch = item.articleUrl.match(/PRID=(\d+)/);
          
          if (prIDMatch) {
            const prid = prIDMatch[1];
            // Force the universal master URL format
            const perfectUrl = `https://pib.gov.in/PressReleasePage.aspx?PRID=${prid}&reg=48&lang=1`;
            
            if (item.articleUrl !== perfectUrl) {
              item.articleUrl = perfectUrl;
              fileChanged = true;
              totalUpdated++;
            }
          }
        }
      });

      // If we modified any URLs in this file, save it back
      if (fileChanged) {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        console.log(`   ✅ Fixed URLs in ${file}`);
      }

    } catch (error) {
      console.error(`⚠️ Error reading/writing ${file}:`, error.message);
    }
  }

  console.log(`\n🎉 Complete! Successfully updated ${totalUpdated} URLs across your historical database to reg=48.`);
}

fixAllUrls();
