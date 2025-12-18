import "dotenv/config";
import express from "express";
import mongoose from "mongoose";
import morgan from "morgan";
import cors from "cors";

import Artifact from "./models/Artifact.model.js";
import { generateImage } from "./services/imageGenerator.service.js";

const app = express();
const PORT = process.env.PORT || 5000;

// WhatsApp ENV
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

app.use(cors());
app.use(morgan("dev"));
app.use(express.json());

/* =========================
   DATABASE
========================= */

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("✅ MongoDB connected");
    app.listen(PORT, () =>
      console.log(`🚀 Server running on http://localhost:${PORT}`)
    );
  })
  .catch(console.error);

/* =========================
   WHATSAPP WEBHOOK
========================= */

// 🔹 Webhook verification
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// 🔹 Receive WhatsApp messages
app.post("/webhook", async (req, res) => {
  const message =
    req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

  if (!message) return res.sendStatus(200);

  const from = message.from;

  // 🔍 DEBUG – dekhne ke liye kya aa raha hai
  console.log("📩 FULL MESSAGE:", JSON.stringify(message, null, 2));

  // 1️⃣ TEXT MESSAGE (Hi)
  if (message.text?.body?.toLowerCase() === "hi") {
    console.log("✅ TEXT HI RECEIVED");
    await sendPromptButtons(from);
  }

  // 2️⃣ LIST SELECTION (AR_CAR etc.)
  if (message.interactive?.list_reply) {
    const promptId = message.interactive.list_reply.id;
    console.log("✅ LIST SELECTED:", promptId);

    await handlePrompt(from, promptId);
  }

  res.sendStatus(200);
});




/* =========================
   WHATSAPP HELPERS
========================= */

// 🟢 5 predefined prompts
async function sendPromptButtons(to) {
  try {
    console.log("🚀 Sending list to:", to);

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
            body: {
              text: "Choose your AR experience:"
            },
            action: {
              button: "View Options",
              sections: [
                {
                  title: "AR / VR Options",
                  rows: [
                    { id: "AR_SHOE", title: "AR Shoe", description: "Try shoe in AR" },
                    { id: "AR_WATCH", title: "AR Watch", description: "Luxury watch AR view" },
                    { id: "AR_CAR", title: "AR Car", description: "Car showroom AR" },
                    { id: "AR_CHAIR", title: "AR Chair", description: "Chair in your room" },
                    { id: "AR_PRODUCT", title: "AR Product", description: "Custom AR product" }
                  ]
                }
              ]
            }
          }
        })
      }
    );

    console.log("✅ WhatsApp API response:", await res.json());
  } catch (err) {
    console.error("❌ Failed to send list:", err);
  }
}



// 🟢 Button → AI → DB → AR link
async function handlePrompt(user, promptId) {
  const promptMap = {
    AR_SHOE: "Create realistic AR shoe product image",
    AR_WATCH: "Create luxury AR watch product image",
    AR_CAR: "Create realistic AR car showroom image",
    AR_CHAIR: "Create AR chair placed in modern room",
    AR_PRODUCT: "Create creative AR product image"
  };

  const prompt = promptMap[promptId];

  const aiData = await generateImage({ prompt });

  const artifact = await Artifact.create({
    source: "whatsapp",
    userPrompt: prompt,
    generatedImageUrl: aiData.generatedImageUrl,
    aiPrompt: aiData.aiPrompt,
    aiProvider: "openai"
  });

  const arLink = `${process.env.AR_FRONTEND_URL}/?arId=${artifact._id}`;

  await sendLink(user, arLink);
}

// 🟢 Send link back to WhatsApp
async function sendLink(to, link) {
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
        body: `🎉 Your AR experience is ready!\n\n👉 ${link}`
      }
    })
  });
}
