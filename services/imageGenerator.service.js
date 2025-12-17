import OpenAI from "openai";
import fs from "fs";
import path from "path";

const API_KEY = process.env.OPENAI_API_KEY

const openai = new OpenAI({
  apiKey: API_KEY,
});

export async function generateImage({
  prompt,
  inputImagePath = null
}) {

  /* Step-1  */

  //   Generate JSON:
  // {
  // "title": "Creative museum title (max 60 chars)",
  // "description": "Artistic description (max 100 chars)",
  // "imagePrompt": "Detailed DALL-E prompt with artistic style, lighting, composition"
  // }`
  const chatResponse = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "You are a museum curator. Respond ONLY with valid JSON."
      },
      {
        role: "user",
        content: `Create metadata for: "${prompt}"`
      }
    ],
    response_format: { type: "json_object" },
    temperature: 0.8
  });

  let customuserRoleChatResponse = JSON.parse(chatResponse.choices[0].message.content);
  let customuserRolePrompt = customuserRoleChatResponse?.description;
  // console.log(customuserRolePrompt)


  /* Step-2  */

  let result;
  if (inputImagePath) {
    // Image + prompt → image
    result = await openai.images.generate({
      model: "dall-e-3",
      // prompt,
      prompt: customuserRolePrompt ? customuserRolePrompt : prompt,
      size: "1024x1024",
      response_format: "b64_json"
    });

  } else {
    // Prompt → image
    result = await openai.images.generate({
      model: "dall-e-3",
      // prompt,
      prompt: customuserRolePrompt ? customuserRolePrompt : prompt,
      size: "1024x1024",
      response_format: "b64_json"
    });
  }

  // console.log(result.data[0].revised_prompt)
  let generatedImageUrl = await saveBase64Image(result.data[0].b64_json);
  return {
    aiPrompt: result.data[0].revised_prompt,
    generatedImageUrl
  }

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

