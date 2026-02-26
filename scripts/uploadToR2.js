// scripts/uploadToR2.js

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const requiredEnv = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
];

for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

// Generate SHA256 hash of file
function generateHash(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

// Upload single file
async function uploadFile(localPath, remoteKey) {
  const fileContent = fs.readFileSync(localPath);

  const command = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: remoteKey,
    Body: fileContent,
    ContentType: "application/json",
  });

  await r2.send(command);
  console.log(`✅ Uploaded: ${remoteKey}`);
}

// Download hash file from R2 if exists
async function downloadHashFile(remoteKey, localPath) {
  try {
    const command = new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: remoteKey,
    });

    const response = await r2.send(command);
    const stream = response.Body;

    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    const buffer = Buffer.concat(chunks);
    fs.writeFileSync(localPath, buffer);
    console.log("⬇️ Downloaded existing .uploadHashes.json from R2");
  } catch (error) {
    console.log("ℹ️ No existing .uploadHashes.json found in R2");
  }
}

// Upload only changed JSON files
export async function uploadAllData() {
  const dataDir = path.join(__dirname, "../data");
  const hashFilePath = path.join(dataDir, ".uploadHashes.json");

  if (!fs.existsSync(dataDir)) {
    throw new Error("Data directory does not exist.");
  }

  await downloadHashFile(".uploadHashes.json", hashFilePath);

  let previousHashes = {};
  if (fs.existsSync(hashFilePath)) {
    previousHashes = JSON.parse(fs.readFileSync(hashFilePath));
  }

  const newHashes = {};
  const files = fs.readdirSync(dataDir);

  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    if (file === ".uploadHashes.json") continue;

    const fullPath = path.join(dataDir, file);
    const fileBuffer = fs.readFileSync(fullPath);
    const currentHash = generateHash(fileBuffer);

    newHashes[file] = currentHash;

    if (previousHashes[file] !== currentHash) {
      await uploadFile(fullPath, file);
    } else {
      console.log(`⏭ Skipped (unchanged): ${file}`);
    }
  }

  fs.writeFileSync(hashFilePath, JSON.stringify(newHashes, null, 2));

  await uploadFile(hashFilePath, ".uploadHashes.json");

  console.log("🎉 Only changed files uploaded to R2.");
}
