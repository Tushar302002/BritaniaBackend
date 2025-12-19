import "dotenv/config";
import express from "express";
import mongoose from "mongoose";
import morgan from "morgan";
import cors from "cors";
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

  // 🔁 AUTO CLEANUP (memory safe)
  setTimeout(() => {
    processedMessageIds.delete(messageId);
  }, 5 * 60 * 1000); // 5 min

  // ✅ ACK IMMEDIATELY
  res.sendStatus(200);

  // 🚀 BACKGROUND PROCESSING
  (async () => {
    try {
      const from = message.from;
      const text = message.text?.body?.toLowerCase();

      console.log("📩 MESSAGE:", JSON.stringify(message, null, 2));

      // STEP 1 — START
      if (["hi", "hello", "start"].includes(text)) {
        await sendWelcomeAndCategories(from);
      }

      // STEP 2 & 3 — LIST SELECTION
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
  await fetch(
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
}

// ================= STEP 1 =================
async function sendWelcomeAndCategories(to) {
  await sendWhatsApp({
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      body: {
        text:
          "👋 Welcome to *The Good Choice Archive*\n\n" +
          "What kind of good choice are you making today?"
      },
      action: {
        button: "Choose Category",
        sections: [{
          title: "Categories",
          rows: [
            { id: "CAT_SELFCARE", title: "🧘 Self-Care" },
            { id: "CAT_FITNESS", title: "🏃 Fitness" },
            { id: "CAT_MINDFUL", title: "🧠 Mindfulness" },
            { id: "CAT_PRODUCT", title: "🚀 Productivity" },
            { id: "CAT_NUTRITION", title: "🥗 Nutrition" }
          ]
        }]
      }
    }
  });
}

// ================= CATEGORY OPTIONS =================
const categoryOptions = {
  CAT_SELFCARE: {
    text: "Choose one habit 👇",
    options: [
      { id: "OPT_WATER", title: "💧 Drink Water", description: "Drink a full glass of water" },
      { id: "OPT_NO_SCREEN", title: "📵 No Screens", description: "Avoid screens before sleep" }
    ]
  },
  CAT_FITNESS: {
    text: "Choose one habit 👇",
    options: [
      { id: "OPT_WALK", title: "🚶 Walk", description: "10-minute walk" },
      { id: "OPT_PUSHUPS", title: "💪 Push-ups", description: "10 push-ups" }
    ]
  }
};

async function sendCategoryOptions(to, categoryId) {
  const data = categoryOptions[categoryId];
  if (!data) return;

  await sendWhatsApp({
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: data.text },
      action: {
        button: "Choose Habit",
        sections: [{ title: "Habits", rows: data.options }]
      }
    }
  });
}

// ================= OPTION HANDLER =================
const optionPromptMap = {
  OPT_WATER: "Drinking a full glass of water",
  OPT_NO_SCREEN: "Avoiding screens before sleep",
  OPT_WALK: "Walking for fitness",
  OPT_PUSHUPS: "Doing push-ups"
};

async function handleOptionSelection(user, optionId) {
  const prompt = optionPromptMap[optionId];
  if (!prompt) return;

  console.log("🎯 Generating image for:", prompt);

  const aiData = await generateImage({ prompt });

  // 🔥 Upload image to WhatsApp
  const mediaId = await uploadImageToWhatsApp(aiData.base64);

  const artifact = await Artifact.create({
    source: "whatsapp",
    userPrompt: prompt,
    aiPrompt: aiData.aiPrompt,
    aiProvider: "openai"
  });

  // Send image
  await sendWhatsApp({
    messaging_product: "whatsapp",
    to: user,
    type: "image",
    image: { id: mediaId }
  });

  // Send link
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
        // ❌ Content-Type mat set karo (FormData khud karega)
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

