import mongoose from "mongoose";

const artifactSchema = new mongoose.Schema({
  source: {
    type: String, // "whatsapp" | "web" | "postman"
    default: "web"
  },

  userPrompt: {
    type: String,
    required: true
  },

  userImageUrl: {
    type: String, // optional
    default: null
  },

  generatedImageUrl: {
    type: String,
    required: true
  },

  aiPrompt:{
    type:String,
    default:null
  },

  aiProvider: {
    type: String, // "openai" | "stability" | "midjourney"
    required: true
  },

  createdAt: {
    type: Date,
    default: Date.now
  }
});

export default mongoose.model("Artifact", artifactSchema);
