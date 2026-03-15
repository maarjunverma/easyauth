import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cors from "cors";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import Database from "better-sqlite3";
import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || "easyauth-secret-key-123";
const PORT = 3000;

// Initialize Database
const db = new Database("easyauth.db");
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    mobile TEXT UNIQUE,
    password TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Simple in-memory store for captchas
const captchaStore = new Map<string, { code: number; expires: number }>();

async function startServer() {
  const app = express();
  app.use(express.json());
  app.use(cors());

  // API Routes
  
  // Generate Captcha
  app.get("/api/auth/captcha", (req, res) => {
    const captchaId = Math.random().toString(36).substring(7);
    const code = Math.floor(1000 + Math.random() * 9000); // 4 digit code
    captchaStore.set(captchaId, { code, expires: Date.now() + 5 * 60 * 1000 }); // 5 mins
    res.json({ captchaId, question: `What is the number ${code}?` });
  });

  // Register
  app.post("/api/auth/register", async (req, res) => {
    try {
      const { email, mobile, password, captchaId, captchaAnswer } = req.body;

      // Verify Captcha
      const stored = captchaStore.get(captchaId);
      if (!stored || stored.code !== captchaAnswer || Date.now() > stored.expires) {
        return res.status(400).json({ error: "Invalid or expired captcha" });
      }
      captchaStore.delete(captchaId);

      // Check if user exists
      const existing = db.prepare("SELECT * FROM users WHERE email = ? OR mobile = ?").get(email, mobile);
      if (existing) {
        return res.status(400).json({ error: "Email or mobile already registered" });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Insert user
      const result = db.prepare("INSERT INTO users (email, mobile, password) VALUES (?, ?, ?)")
        .run(email, mobile, hashedPassword);

      const token = jwt.sign({ id: result.lastInsertRowid, email }, JWT_SECRET, { expiresIn: "24h" });

      res.json({ token, user: { id: result.lastInsertRowid, email, mobile } });
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Login
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { identifier, password } = req.body;

      const user: any = db.prepare("SELECT * FROM users WHERE email = ? OR mobile = ?").get(identifier, identifier);
      if (!user) {
        return res.status(400).json({ error: "Invalid credentials" });
      }

      const valid = await bcrypt.compare(password, user.password);
      if (!valid) {
        return res.status(400).json({ error: "Invalid credentials" });
      }

      const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: "24h" });

      res.json({ token, user: { id: user.id, email: user.email, mobile: user.mobile } });
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Me (Verify Token)
  app.get("/api/auth/me", (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Unauthorized" });

    const token = authHeader.split(" ")[1];
    try {
      const decoded: any = jwt.verify(token, JWT_SECRET);
      const user: any = db.prepare("SELECT id, email, mobile FROM users WHERE id = ?").get(decoded.id);
      res.json({ user });
    } catch (err) {
      res.status(401).json({ error: "Invalid token" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
