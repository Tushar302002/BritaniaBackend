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
    throw new Error(
      `WhatsApp send failed: ${JSON.stringify(data)}`
    );
  }
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
    text: "💛 Self-Care — choose one habit 👇",
    options: [
      {
        id: "OPT_WATER",
        title: "💧 Drink Water",
        description: "Drink a full glass"
      },
      {
        id: "OPT_NO_SCREEN",
        title: "📵 No Screens",
        description: "Avoid screens before sleep"
      },
      {
        id: "OPT_JOURNAL",
        title: "✍️ Journal",
        description: "Write one journal line"
      },
      {
        id: "OPT_HOBBY",
        title: "🎨 Hobby Time",
        description: "5 minutes hobby time"
      }
    ]
  },
 
  CAT_FITNESS: {
    text: "🏃 Fitness — choose one habit 👇",
    options: [
      {
        id: "OPT_WALK",
        title: "🚶 Walk",
        description: "10-minute walk"
      },
      {
        id: "OPT_PUSHUPS",
        title: "💪 Push-ups",
        description: "10 push-ups"
      },
      {
        id: "OPT_STRETCH",
        title: "🤸 Stretch",
        description: "Light stretching"
      }
    ]
  },
 
  CAT_MINDFUL: {
    text: "🧠 Mindfulness — choose one 👇",
    options: [
      {
        id: "OPT_BREATH",
        title: "🌬️ Breathing",
        description: "2-min deep breathing"
      },
      {
        id: "OPT_GRAT",
        title: "🙏 Gratitude",
        description: "Think one good thing"
      }
    ]
  },
 
  CAT_PRODUCT: {
    text: "🚀 Productivity — choose one 👇",
    options: [
      {
        id: "OPT_TODO",
        title: "📝 To-Do",
        description: "Write top task"
      },
      {
        id: "OPT_FOCUS",
        title: "⏱️ Focus",
        description: "10-min focus session"
      }
    ]
  },
 
  CAT_NUTRITION: {
    text: "🥗 Nutrition — choose one 👇",
    options: [
      {
        id: "OPT_FRUIT",
        title: "🍎 Eat Fruit",
        description: "Eat one fruit"
      },
      {
        id: "OPT_WATER2",
        title: "💧 Hydration",
        description: "Drink extra water"
      }
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
  OPT_JOURNAL: "Writing in a journal",
  OPT_HOBBY: "Doing a creative hobby",
 
  OPT_WALK: "Walking for fitness",
  OPT_PUSHUPS: "Doing push-ups",
  OPT_STRETCH: "Stretching exercise",
 
  OPT_BREATH: "Practicing deep breathing",
  OPT_GRAT: "Feeling gratitude",
 
  OPT_TODO: "Planning tasks",
  OPT_FOCUS: "Focused work session",
 
  OPT_FRUIT: "Eating a fruit",
  OPT_WATER2: "Staying hydrated"
};
 
 
async function handleOptionSelection(user, optionId) {
  const prompt = optionPromptMap[optionId];
  if (!prompt) return;
 
  console.log("🎯 Generating image for:", prompt);
 
  const aiData = await generateImage({ prompt });
 
  // 🔥 Upload image to WhatsApp
  const mediaId = await uploadImageToWhatsApp(aiData.base64);
 
//   Store image to server and store image path
  let generatedImageUrl = await saveBase64Image(aiData.base64);
 
  const artifact = await Artifact.create({
    source: "whatsapp",
    userPrompt: prompt,
    aiPrompt: aiData.aiPrompt,
    aiProvider: "openai",
    generatedImageUrl
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
 
 
function saveBase64Image(base64Data, folder = "uploads/ai") {
    if (!fs.existsSync(folder)) {
      fs.mkdirSync(folder, { recursive: true });
    }
 
    const fileName = `${Date.now()}.png`;
    const filePath = path.join(folder, fileName);
 
    const buffer = Buffer.from(base64Data, "base64");
    fs.writeFileSync(filePath, buffer);
 
    return `/uploads/ai/${fileName}`;
  }