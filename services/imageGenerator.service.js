import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// 🔵 SAME service for Web + WhatsApp (PRODUCTION SAFE)
export async function generateImage({ prompt }) {
  // Step 1: Improve prompt (optional but good)
  const chatResponse = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "You are a museum curator. Respond ONLY with valid JSON."
      },
      {
        role: "user",
        content: `Create a vivid visual description for: "${prompt}"`
      }
    ],
    response_format: { type: "json_object" }
  });

  const meta = JSON.parse(chatResponse.choices[0].message.content);

  // Step 2: Generate image (BASE64)
  const result = await openai.images.generate({
    model: "gpt-image-1",
    prompt: meta.description || prompt,
    size: "1024x1024"
  });

  const base64 = result.data[0].b64_json;

  if (!base64) {
    throw new Error("Image generation failed: no base64 returned");
  }

  return {
    aiPrompt: meta.description || prompt,
    base64 // ✅ THIS FIXES EVERYTHING
  };
}
