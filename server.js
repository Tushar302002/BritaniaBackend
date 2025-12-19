import "dotenv/config";
import express from "express";
import mongoose from "mongoose";
import morgan from "morgan";
import cors from "cors";

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
app.use("/uploads", express.static("uploads"));

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
app.post("/webhook", async (req, res) => {
  try {
    const message =
      req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    if (!message) return res.sendStatus(200);

    const from = message.from;
    const text = message.text?.body?.toLowerCase();

    console.log("📩 MESSAGE:", JSON.stringify(message, null, 2));

    // STEP 1 — HI / START
    if (["hi", "hello", "start"].includes(text)) {
      await sendWelcomeAndCategories(from);
    }

    // STEP 2 & 3 — LIST SELECTION
    if (message.interactive?.list_reply) {
      const id = message.interactive.list_reply.id;
      console.log("🟡 LIST REPLY RECEIVED:", id);

      if (id.startsWith("CAT_")) {
        console.log("🟢 CATEGORY SELECTED:", id);
        await sendCategoryOptions(from, id);
      }

      if (id.startsWith("OPT_")) {
        console.log("🟣 OPTION SELECTED:", id);
        await handleOptionSelection(from, id);
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ WEBHOOK ERROR:", err);
    res.sendStatus(200);
  }
});

// ================= CATEGORY LIST =================
async function sendWelcomeAndCategories(to) {
  await fetch(`https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "list",
        body: {
          text:
            "👋 Welcome to *The Good Choice Archive*\n" +
            "India’s first museum of better habits ✨\n\n" +
            "What kind of good choice are you making today?"
        },
        action: {
          button: "Choose Category",
          sections: [
            {
              title: "Categories",
              rows: [
                { id: "CAT_SELFCARE", title: "🧘 Self-Care" },
                { id: "CAT_FITNESS", title: "🏃 Fitness" },
                { id: "CAT_MINDFUL", title: "🧠 Mindfulness" },
                { id: "CAT_PRODUCT", title: "🚀 Productivity" },
                { id: "CAT_NUTRITION", title: "🥗 Nutrition" }
              ]
            }
          ]
        }
      }
    })
  });
}

// ================= CATEGORY OPTIONS =================
const categoryOptions = {
  CAT_SELFCARE: {
    text: "💛 *Self-Care* — choose one habit 👇",
    options: [
      { id: "OPT_WATER", title: "💧 Drink Water", description: "Drink a full glass of water" },
      { id: "OPT_NO_SCREEN", title: "📵 No Screens", description: "Avoid screens before sleeping" },
      { id: "OPT_JOURNAL", title: "✍️ Journal", description: "Write one journal line" },
      { id: "OPT_HOBBY", title: "🎨 Hobby Time", description: "Spend 5 minutes on a hobby" }
    ]
  },

  CAT_FITNESS: {
    text: "🏃 *Fitness* — pick one habit 👇",
    options: [
      { id: "OPT_WALK", title: "🚶 Walk", description: "10-minute walk" },
      { id: "OPT_STRETCH", title: "🤸 Stretch", description: "Stretching exercise" },
      { id: "OPT_PUSHUPS", title: "💪 Push-ups", description: "10 push-ups" }
    ]
  },

  CAT_MINDFUL: {
    text: "🧠 *Mindfulness* — choose one 👇",
    options: [
      { id: "OPT_BREATH", title: "🌬️ Breathing", description: "2 minutes deep breathing" },
      { id: "OPT_GRAT", title: "🙏 Gratitude", description: "Think of one grateful moment" }
    ]
  },

  CAT_PRODUCT: {
    text: "🚀 *Productivity* — choose one 👇",
    options: [
      { id: "OPT_TODO", title: "📝 To-Do", description: "Write today’s top task" },
      { id: "OPT_FOCUS", title: "⏱️ Focus", description: "10 minutes focused work" }
    ]
  },

  CAT_NUTRITION: {
    text: "🥗 *Nutrition* — choose one 👇",
    options: [
      { id: "OPT_FRUIT", title: "🍎 Fruit", description: "Eat one fruit" },
      { id: "OPT_WATER2", title: "💧 Hydration", description: "Drink extra water" }
    ]
  }
};

// ================= SEND CATEGORY OPTIONS =================
async function sendCategoryOptions(to, categoryId) {
  const data = categoryOptions[categoryId];
  if (!data) return console.error("❌ Category not found:", categoryId);

  const res = await fetch(
    `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
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
      })
    }
  );

  console.log("📤 CATEGORY OPTIONS RESPONSE:", await res.json());
}

// ================= OPTION → PROMPT =================
const optionPromptMap = {
  OPT_WATER: "Drinking a full glass of water",
  OPT_NO_SCREEN: "Avoiding screens before sleep",
  OPT_JOURNAL: "Writing in a journal",
  OPT_HOBBY: "Doing a creative hobby",
  OPT_WALK: "Walking for fitness",
  OPT_STRETCH: "Stretching exercise",
  OPT_PUSHUPS: "Doing push-ups",
  OPT_BREATH: "Practicing deep breathing",
  OPT_GRAT: "Feeling gratitude",
  OPT_TODO: "Planning tasks",
  OPT_FOCUS: "Focused work session",
  OPT_FRUIT: "Eating a fruit",
  OPT_WATER2: "Staying hydrated"
};

// ================= HANDLE OPTION =================
async function handleOptionSelection(user, optionId) {
  const prompt = optionPromptMap[optionId];
  if (!prompt) return console.error("❌ Prompt not found:", optionId);

  console.log("🎯 GENERATING IMAGE FOR:", prompt);

  const aiData = await generateImage({ prompt });

  const artifact = await Artifact.create({
    source: "whatsapp",
    userPrompt: prompt,
    generatedImageUrl: aiData.generatedImageUrl,
    aiPrompt: aiData.aiPrompt,
    aiProvider: "openai"
  });

  // 1️⃣ Send image
  await sendImageMessage(user, artifact.generatedImageUrl);

  // 2️⃣ Send link
  const link = `${process.env.AR_FRONTEND_URL}/?arId=${artifact._id}`;
  await sendFinalLink(user, link);
}

// ================= SEND IMAGE =================
async function sendImageMessage(to, imageUrl) {
  await fetch(`https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "image",
      image: {
        link: imageUrl,
        caption: "🖼️ Your Good Choice Exhibit"
      }
    })
  });
}

// ================= SEND FINAL LINK =================
async function sendFinalLink(to, link) {
  await fetch(`https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      text: {
        body:
          "✨ Your exhibit is ready!\n\n" +
          "A small habit.\nA meaningful moment.\n\n" +
          `👉 View here:\n${link}`
      }
    })
  });
}
