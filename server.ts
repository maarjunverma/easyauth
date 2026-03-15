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
    confirmed INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Simple in-memory store for captchas and reset codes
const captchaStore = new Map<string, { code: number; expires: number }>();
const resetStore = new Map<string, { email: string; expires: number }>();

async function startServer() {
  try {
    const app = express();
    app.use(express.json());
    app.use(cors());

    console.log(`Starting server in ${process.env.NODE_ENV || 'development'} mode`);

    // Request logger
    app.use((req, res, next) => {
      console.log(`${req.method} ${req.url}`);
      next();
    });

    // API Routes
    app.get("/api/ping", (req, res) => res.json({ message: "pong" }));

    // Generate Captcha
    app.get("/api/auth/captcha", (req, res) => {
      const captchaId = Math.random().toString(36).substring(7);
      const code = Math.floor(1000 + Math.random() * 9000); // 4 digit code
      captchaStore.set(captchaId, { code, expires: Date.now() + 5 * 60 * 1000 }); // 5 mins
      res.json({ captchaId, question: `What is the number ${code}?` });
    });

    // Resend Verification
    app.post("/api/auth/send-email-confirmation", (req, res) => {
      const { email } = req.body;
      const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
      if (!user) return res.status(404).json({ error: "User not found" });
      
      // In a real app, send verification email.
      console.log(`Verification email sent to ${email}`);
      res.json({ message: "Verification email sent" });
    });

    // Forgot Password
    app.post("/api/auth/forgot-password", (req, res) => {
      const { email } = req.body;
      const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
      
      // For security, don't reveal if user exists, but here we'll be helpful for the demo
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const resetCode = Math.random().toString(36).substring(2, 15);
      resetStore.set(resetCode, { email, expires: Date.now() + 15 * 60 * 1000 }); // 15 mins

      const baseUrl = process.env.APP_URL || "http://localhost:3000";
      console.log(`Password reset link: ${baseUrl}/?code=${resetCode}`);
      res.json({ message: "Reset link sent to email", debug_link: `/?code=${resetCode}` });
    });

    // Reset Password
    app.post("/api/auth/reset-password", async (req, res) => {
      const { code, password } = req.body;
      const stored = resetStore.get(code);

      if (!stored || Date.now() > stored.expires) {
        return res.status(400).json({ error: "Invalid or expired reset code" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      db.prepare("UPDATE users SET password = ? WHERE email = ?").run(hashedPassword, stored.email);
      resetStore.delete(code);

      res.json({ message: "Password updated successfully" });
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

        res.json({ token, user: { id: result.lastInsertRowid, email, mobile, confirmed: false } });
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

        res.json({ token, user: { id: user.id, email: user.email, mobile: user.mobile, confirmed: !!user.confirmed } });
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
        const user: any = db.prepare("SELECT id, email, mobile, confirmed FROM users WHERE id = ?").get(decoded.id);
        if (user) {
          user.confirmed = !!user.confirmed;
        }
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
      
      // Fallback for SPA in dev mode
      app.use("*", async (req, res, next) => {
        if (req.originalUrl.startsWith("/api")) {
          return next();
        }
        try {
          const fs = await import("fs");
          let template = fs.readFileSync(path.resolve(process.cwd(), "index.html"), "utf-8");
          template = await vite.transformIndexHtml(req.originalUrl, template);
          res.status(200).set({ "Content-Type": "text/html" }).end(template);
        } catch (e) {
          next(e);
        }
      });
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
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
}

startServer();
