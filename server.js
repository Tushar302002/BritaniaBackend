import "dotenv/config";
import express from "express";
import mongoose from "mongoose";
import morgan from "morgan";
import cors from "cors";
import fs from "fs";
import path from "path";

const processedMessageIds = new Set();

import Artifact from "./models/Artifact.model.js";
import { generateImage } from "./services/imageGenerator.service.js";

const app = express();
const PORT = process.env.PORT || 5000;

// ================= ENV =================
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

// ================= MIDDLEWARE =================
app.use(cors());
app.use(morgan("dev"));
app.use(express.json());
app.use("/uploads", express.static("uploads")); // ✅ IMPORTANT

// ================= DATABASE =================
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("✅ MongoDB connected");
    app.listen(PORT, () =>
      console.log(`🚀 Server running on port ${PORT}`)
    );
  })
  .catch(console.error);

// ================= WEBHOOK VERIFY =================
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// ================= WEBHOOK RECEIVE =================
app.post("/webhook", (req, res) => {
  const message =
    req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

  if (!message) return res.sendStatus(200);

  const messageId = message.id;

  // 🔒 DEDUPLICATION
  if (processedMessageIds.has(messageId)) {
    console.log("⏭️ Duplicate message ignored:", messageId);
    return res.sendStatus(200);
  }

  processedMessageIds.add(messageId);

  setTimeout(() => {
    processedMessageIds.delete(messageId);
  }, 5 * 60 * 1000);

  res.sendStatus(200); // ✅ ACK IMMEDIATELY

  (async () => {
    try {
      const from = message.from;
      const text = message.text?.body?.toLowerCase();

      console.log("📩 MESSAGE:", JSON.stringify(message, null, 2));

      if (["hi", "hello", "start"].includes(text)) {
        await sendWelcomeAndCategories(from);
      }

      if (message.interactive?.list_reply) {
        const id = message.interactive.list_reply.id;
        console.log("🟡 LIST REPLY:", id);

        if (id.startsWith("CAT_")) {
          await sendCategoryOptions(from, id);
        }

        if (id.startsWith("OPT_")) {
          await handleOptionSelection(from, id);
        }
      }
    } catch (err) {
      console.error("❌ ASYNC WEBHOOK ERROR:", err);
    }
  })();
});

// ================= WHATSAPP SEND =================
async function sendWhatsApp(payload) {
  const res = await fetch(
    `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    }
  );

  const data = await res.json();
  console.log("📤 WHATSAPP SEND RESPONSE:", data);

  if (!res.ok) {
    throw new Error(JSON.stringify(data));
  }
}

// ================= SAVE IMAGE (OLD FORMAT) =================
function saveBase64Image(base64Data, folder = "uploads/ai") {
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
  }

  const fileName = `${Date.now()}.png`;
  const filePath = path.join(folder, fileName);

  fs.writeFileSync(filePath, Buffer.from(base64Data, "base64"));

  return `/uploads/ai/${fileName}`;
}

// ================= MEDIA UPLOAD =================
async function uploadImageToWhatsApp(base64) {
  const buffer = Buffer.from(base64, "base64");

  const form = new FormData();
  form.append(
    "file",
    new Blob([buffer], { type: "image/png" }),
    "image.png"
  );
  form.append("messaging_product", "whatsapp");

  const res = await fetch(
    `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/media`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`
      },
      body: form
    }
  );

  const data = await res.json();

  if (!data.id) {
    console.error("❌ Media upload failed:", data);
    throw new Error("WhatsApp media upload failed");
  }

  return data.id;
}

// ================= OPTION HANDLER =================
async function handleOptionSelection(user, optionId) {
  const prompt = optionPromptMap[optionId];
  if (!prompt) return;

  console.log("🎯 Generating image for:", prompt);

  const aiData = await generateImage({ prompt });

  // ✅ SAVE IMAGE (OLD WAY)
  const generatedImageUrl = saveBase64Image(aiData.base64);

  // ✅ SEND IMAGE (CURRENT WAY)
  const mediaId = await uploadImageToWhatsApp(aiData.base64);

  const artifact = await Artifact.create({
    source: "whatsapp",
    userPrompt: prompt,
    aiPrompt: aiData.aiPrompt,
    aiProvider: "openai",
    generatedImageUrl
  });

  await sendWhatsApp({
    messaging_product: "whatsapp",
    to: user,
    type: "image",
    image: { id: mediaId }
  });

  await sendWhatsApp({
    messaging_product: "whatsapp",
    to: user,
    text: {
      body:
        "✨ Your exhibit is ready!\n\n" +
        `${process.env.AR_FRONTEND_URL}/?arId=${artifact._id}`
    }
  });
}
