import OpenAI from "openai";
import fs from "fs";
import path from "path";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// 🔵 SAME service used by Web + WhatsApp
export async function generateImage({ prompt, inputImagePath = null }) {
  // Step 1: Refine prompt using GPT
  const chatResponse = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "You are a museum curator. Respond ONLY with valid JSON." },
      { role: "user", content: `Create metadata for: "${prompt}"` }
    ],
    response_format: { type: "json_object" }
  });

  const meta = JSON.parse(chatResponse.choices[0].message.content);

  // Step 2: Generate image
  const result = await openai.images.generate({
    model: "dall-e-3",
    prompt: meta.description || prompt,
    size: "1024x1024",
    response_format: "b64_json"
  });

  const imageUrl = saveBase64Image(result.data[0].b64_json);

  return {
    aiPrompt: result.data[0].revised_prompt,
    generatedImageUrl: imageUrl
  };
}

function saveBase64Image(base64, folder = "uploads/ai") {
  if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });

  const file = `${Date.now()}.png`;
  fs.writeFileSync(path.join(folder, file), Buffer.from(base64, "base64"));

  return `/uploads/ai/${file}`;
}
