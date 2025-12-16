import mongoose from "mongoose";

const arDataSchema = new mongoose.Schema({
  imageUrl: String,
  text: String,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

export default mongoose.model("ArData", arDataSchema);
