import "dotenv/config";
import morgan from "morgan";
import express from "express";
import mongoose from "mongoose";
import multer from "multer";
import cors from "cors";
import fs from "fs";
import Artifact from "./models/Artifact.model.js";
import { generateImage } from "./services/imageGenerator.service.js";

const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI;
const BASE_URL = process.env.BASE_URL;
const AR_FRONTEND_URL = process.env.AR_FRONTEND_URL;

const app = express();

app.use((req, res, next) => {
  req.startTime = Date.now();
  console.log(`➡️ Icnoming request:-  ${req.method} ${req.originalUrl}`);
  next();
});

app.use(morgan("dev"));
app.use(cors());
app.use(express.json());
app.use("/uploads", express.static("uploads"));

/* -------------------- MongoDB -------------------- */

if (!MONGODB_URI) {
  console.error("❌ MONGODB_URI not set");
  process.exit(1);
}

async function connectDB() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("✅ MongoDB connected");

    app.listen(5000, () => {
      console.log(`🚀 Server running on ${BASE_URL || `http://localhost:${PORT}` }`);
    });
  } catch (err) {
    console.error("❌ MongoDB connection failed", err);
    process.exit(1);
  }
}

connectDB();

/* -------------------- Multer -------------------- */

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = "uploads/user";

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    cb(null, uploadDir);
  },

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
  limits: { fileSize: 200 * 1024 * 1024 } // 200MB
});

/* -------------------- Routes -------------------- */

app.post(
  "/api/artifacts/create",
  upload.single("image"),
  async (req, res) => {
    try {
      const { prompt } = req.body;
      if (!prompt) {
        return res.status(400).json({ message: "Prompt required" });
      }

      const userImagePath = req.file ? (`/${req.file.destination}/${req.file.filename}`) : null;

      // 1️⃣ Generate AI image
      const generatedAIData = await generateImage({
        prompt,
        inputImagePath: userImagePath
      });

      const { aiPrompt, generatedImageUrl } = generatedAIData

      // 2️⃣ Store artifact
      const artifact = await Artifact.create({
        source: "web",
        userPrompt: prompt,
        userImageUrl: userImagePath ? userImagePath : null,
        generatedImageUrl,
        aiPrompt,
        aiProvider: "openai"
      });

      // 3️⃣ Generate AR link
      const arLink = `${AR_FRONTEND_URL}/?arId=${artifact._id}`;

      res.json({
        artifactId: artifact._id,
        link: arLink
      });

    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Artifact creation failed" });
    }
  }
);



app.get("/api/artifacts/:id", async (req, res) => {
  try {
    const data = await Artifact.findById(req.params.id);

    if (!data) {
      return res.status(404).json({ message: "Data not found" });
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ message: "Invalid ID" });
  }
});


/* -------------------- Health Check -------------------- */

app.get("/health", (req, res) => {
  res.json({
    server: "ok",
    db: mongoose.connection.readyState === 1 ? "connected" : "not connected"
  });
});