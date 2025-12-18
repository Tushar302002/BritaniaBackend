import mongoose from "mongoose";

const artifactSchema = new mongoose.Schema({
  source: {
    type: String, // "web" | "whatsapp"
    default: "web"
  },

  userPrompt: {
    type: String,
    required: true
  },

  userImageUrl: {
    type: String,
    default: null
  },

  generatedImageUrl: {
    type: String,
    required: true
  },

  aiPrompt: {
    type: String,
    default: null
  },

  aiProvider: {
    type: String,
    required: true
  },

  // 🟡 OPTIONAL (future analytics)
  // promptId: String,
  // userId: String, // whatsapp number

  createdAt: {
    type: Date,
    default: Date.now
  }
});

export default mongoose.model("Artifact", artifactSchema);
