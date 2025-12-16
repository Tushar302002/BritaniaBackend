import express from "express";
import mongoose from "mongoose";
import multer from "multer";
import cors from "cors";
import ArData from "./models/ArData.js";

const app = express();

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static("uploads"));

/* -------------------- MongoDB -------------------- */

async function connectDB() {
  try {
    await mongoose.connect("mongodb://127.0.0.1:27017/ar-demo");
    console.log("✅ MongoDB connected");

    app.listen(5000, () => {
      console.log("🚀 Server running on http://localhost:5000");
    });
  } catch (err) {
    console.error("❌ MongoDB connection failed", err);
    process.exit(1);
  }
}

connectDB();

/* -------------------- Multer -------------------- */

const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (_, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files allowed"));
    }
    cb(null, true);
  },
  limits: { fileSize: 2 * 1024 * 1024 } // 2MB
});

/* -------------------- Routes -------------------- */

app.post("/api/upload", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Image is required" });
    }

    const { text } = req.body;

    const data = await ArData.create({
      imageUrl: `/uploads/${req.file.filename}`,
      text
    });

    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Upload failed" });
  }
});

app.get("/api/data", async (req, res) => {
  try {
    const data = await ArData.findOne().sort({ createdAt: -1 });
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch data" });
  }
});

/* -------------------- Health Check -------------------- */

app.get("/health", (req, res) => {
  res.json({
    server: "ok",
    db: mongoose.connection.readyState === 1 ? "connected" : "not connected"
  });
});
