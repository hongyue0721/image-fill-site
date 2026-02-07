const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const axios = require("axios");
const FormData = require("form-data");
const multer = require("multer");
const dotenv = require("dotenv");

const CON_FILE = path.join(__dirname, "config.con");
if (fs.existsSync(CON_FILE)) {
  dotenv.config({ path: CON_FILE });
}
dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3001);

const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, "data");
const UPLOAD_DIR = path.join(ROOT_DIR, "uploads");

const DEFAULT_ORIGINAL_SOURCE = path.join(ROOT_DIR, "nocut.jpg");
const DEFAULT_MASK_SOURCE = path.join(ROOT_DIR, "cut.png");

const ORIGINAL_TARGET = path.join(UPLOAD_DIR, "original.jpg");
const MASK_TARGET = path.join(UPLOAD_DIR, "mask.png");
const LATEST_TARGET = path.join(DATA_DIR, "latest-image.bin");
const LATEST_META = path.join(DATA_DIR, "latest-meta.json");
const CONFIG_FILE = path.join(DATA_DIR, "config.json");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024,
  },
});

function ensureDir(p) {
  if (!fs.existsSync(p)) {
    fs.mkdirSync(p, { recursive: true });
  }
}

function ensureFileCopy(src, dst) {
  if (!fs.existsSync(dst) && fs.existsSync(src)) {
    fs.copyFileSync(src, dst);
  }
}

function deepMerge(base, override) {
  if (!override || typeof override !== "object") {
    return base;
  }
  const out = { ...base };
  for (const key of Object.keys(override)) {
    const srcVal = base[key];
    const overVal = override[key];
    if (
      srcVal &&
      typeof srcVal === "object" &&
      !Array.isArray(srcVal) &&
      overVal &&
      typeof overVal === "object" &&
      !Array.isArray(overVal)
    ) {
      out[key] = deepMerge(srcVal, overVal);
    } else {
      out[key] = overVal;
    }
  }
  return out;
}

function defaultConfig() {
  return {
    siteTitle: "猜猜西瓜里是什么",
    siteSubtitle: "猜错了当我老婆",
    promptTemplate: "将这个西瓜里填满{}",
    requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS || 120000),
    upstreams: {
      primary: {
        name: "new-api",
        enabled: true,
        baseUrl: process.env.UPSTREAM_PRIMARY_BASE_URL || "http://127.0.0.1:3000",
        apiKey: process.env.UPSTREAM_PRIMARY_API_KEY || "",
        model: process.env.UPSTREAM_PRIMARY_MODEL || "gpt-image-1",
      },
      secondary: {
        name: "grok2api",
        enabled: false,
        baseUrl: process.env.UPSTREAM_SECONDARY_BASE_URL || "http://127.0.0.1:8000",
        apiKey: process.env.UPSTREAM_SECONDARY_API_KEY || "",
        model: process.env.UPSTREAM_SECONDARY_MODEL || "grok-imagine-1.0-edit",
      },
    },
  };
}

function loadConfig() {
  const defaults = defaultConfig();
  if (!fs.existsSync(CONFIG_FILE)) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(defaults, null, 2));
    return defaults;
  }
  try {
    const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return deepMerge(defaults, parsed);
  } catch {
    return defaults;
  }
}

function saveConfig(nextConfig) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(nextConfig, null, 2));
}

function withNoCache(res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
}

function guessMimeByExt(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  return "application/octet-stream";
}

function detectMimeByBuffer(buffer) {
  if (!buffer || buffer.length < 12) return "application/octet-stream";
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return "image/png";
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return "image/webp";
  }
  return "application/octet-stream";
}

function sanitizeConfigInput(input, prev) {
  const out = deepMerge(prev, input || {});
  out.siteTitle = String(out.siteTitle || "").trim().slice(0, 80) || prev.siteTitle;
  out.siteSubtitle = String(out.siteSubtitle || "").trim().slice(0, 200);
  out.promptTemplate = String(out.promptTemplate || "").trim().slice(0, 500) || prev.promptTemplate;
  out.requestTimeoutMs = Math.min(Math.max(Number(out.requestTimeoutMs || 120000), 10000), 300000);

  for (const key of ["primary", "secondary"]) {
    const up = out.upstreams[key] || {};
    up.name = String(up.name || "").trim() || key;
    up.enabled = Boolean(up.enabled);
    up.baseUrl = String(up.baseUrl || "").trim();
    up.apiKey = String(up.apiKey || "").trim();
    up.model = String(up.model || "").trim();
    out.upstreams[key] = up;
  }

  return out;
}

function buildPrompt(template, text) {
  const cleanText = String(text || "").trim();
  if (template.includes("{}")) {
    return template.replace("{}", cleanText);
  }
  return `${template} ${cleanText}`.trim();
}

function getAdminPassword() {
  return process.env.ADMIN_PASSWORD || "admin123";
}

function requireAdmin(req, res, next) {
  const incoming = req.header("x-admin-password") || "";
  if (incoming !== getAdminPassword()) {
    return res.status(401).json({ error: "admin auth failed" });
  }
  next();
}

function currentImagePath() {
  if (fs.existsSync(LATEST_TARGET)) {
    return LATEST_TARGET;
  }
  return ORIGINAL_TARGET;
}

function currentImageMeta() {
  if (fs.existsSync(LATEST_TARGET) && fs.existsSync(LATEST_META)) {
    try {
      const meta = JSON.parse(fs.readFileSync(LATEST_META, "utf-8"));
      return {
        mime: meta.mime || "application/octet-stream",
      };
    } catch {
      return { mime: "application/octet-stream" };
    }
  }
  return { mime: guessMimeByExt(ORIGINAL_TARGET) };
}

async function tryEditWithUpstream(upstream, prompt, timeoutMs) {
  const form = new FormData();
  form.append("model", upstream.model);
  form.append("prompt", prompt);
  form.append("n", "1");
  form.append("response_format", "b64_json");
  form.append("image", fs.createReadStream(ORIGINAL_TARGET), path.basename(ORIGINAL_TARGET));
  form.append("mask", fs.createReadStream(MASK_TARGET), path.basename(MASK_TARGET));

  const url = `${upstream.baseUrl.replace(/\/+$/, "")}/v1/images/edits`;
  const response = await axios.post(url, form, {
    headers: {
      ...form.getHeaders(),
      Authorization: `Bearer ${upstream.apiKey}`,
    },
    timeout: timeoutMs,
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });

  const item = response?.data?.data?.[0];
  if (!item) {
    throw new Error("upstream returned empty data");
  }

  if (item.b64_json) {
    const buffer = Buffer.from(item.b64_json, "base64");
    return { buffer, mime: detectMimeByBuffer(buffer), provider: upstream.name };
  }

  if (item.base64) {
    const buffer = Buffer.from(item.base64, "base64");
    return { buffer, mime: detectMimeByBuffer(buffer), provider: upstream.name };
  }

  if (item.url) {
    const raw = await axios.get(item.url, { responseType: "arraybuffer", timeout: timeoutMs });
    const buffer = Buffer.from(raw.data);
    const mime = raw.headers["content-type"] || detectMimeByBuffer(buffer);
    return { buffer, mime, provider: upstream.name };
  }

  throw new Error("no image payload in upstream response");
}

async function generateImage(prompt, config) {
  const queue = [config.upstreams.primary, config.upstreams.secondary].filter(
    (u) => u && u.enabled && u.baseUrl && u.apiKey && u.model
  );

  if (!queue.length) {
    throw new Error("no available upstream configured");
  }

  let lastError = null;
  for (const upstream of queue) {
    try {
      return await tryEditWithUpstream(upstream, prompt, config.requestTimeoutMs);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("all upstreams failed");
}

ensureDir(DATA_DIR);
ensureDir(UPLOAD_DIR);
ensureFileCopy(DEFAULT_ORIGINAL_SOURCE, ORIGINAL_TARGET);
ensureFileCopy(DEFAULT_MASK_SOURCE, MASK_TARGET);
loadConfig();

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(ROOT_DIR, "public"), { index: false }));

app.get("/", (req, res) => {
  res.sendFile(path.join(ROOT_DIR, "public", "index.html"));
});

app.get("/admin", (req, res) => {
  res.sendFile(path.join(ROOT_DIR, "public", "admin.html"));
});

app.get("/api/public-config", (req, res) => {
  const cfg = loadConfig();
  res.json({
    siteTitle: cfg.siteTitle,
    siteSubtitle: cfg.siteSubtitle,
    promptTemplate: cfg.promptTemplate,
    hasLatest: fs.existsSync(LATEST_TARGET),
  });
});

app.get("/api/images/current", (req, res) => {
  const imagePath = currentImagePath();
  const meta = currentImageMeta();
  withNoCache(res);
  res.setHeader("Content-Type", meta.mime || guessMimeByExt(imagePath));
  res.send(fs.readFileSync(imagePath));
});

app.post("/api/generate", async (req, res) => {
  const rawText = (req.body && req.body.text) || "";
  const text = String(rawText).trim();
  if (!text) {
    return res.status(400).json({ error: "text is required" });
  }
  if (text.length > 120) {
    return res.status(400).json({ error: "text too long (max 120)" });
  }
  if (!fs.existsSync(ORIGINAL_TARGET) || !fs.existsSync(MASK_TARGET)) {
    return res.status(422).json({ error: "original or mask image missing" });
  }

  const cfg = loadConfig();
  const prompt = buildPrompt(cfg.promptTemplate, text);
  const requestId = crypto.randomUUID();

  try {
    const generated = await generateImage(prompt, cfg);
    fs.writeFileSync(LATEST_TARGET, generated.buffer);
    fs.writeFileSync(LATEST_META, JSON.stringify({ mime: generated.mime }, null, 2));
    return res.json({
      ok: true,
      request_id: requestId,
      provider: generated.provider,
      image_url: `/api/images/current?t=${Date.now()}`,
    });
  } catch (error) {
    return res.status(502).json({
      ok: false,
      request_id: requestId,
      error: error.message || "image generation failed",
    });
  }
});

app.post("/api/admin/login", (req, res) => {
  const password = String((req.body && req.body.password) || "");
  if (password !== getAdminPassword()) {
    return res.status(401).json({ ok: false, error: "invalid password" });
  }
  res.json({ ok: true });
});

app.get("/api/admin/config", requireAdmin, (req, res) => {
  res.json(loadConfig());
});

app.put("/api/admin/config", requireAdmin, (req, res) => {
  const prev = loadConfig();
  const next = sanitizeConfigInput(req.body, prev);
  saveConfig(next);
  res.json({ ok: true, config: next });
});

app.get("/api/admin/assets/original", requireAdmin, (req, res) => {
  if (!fs.existsSync(ORIGINAL_TARGET)) {
    return res.status(404).json({ error: "original image missing" });
  }
  withNoCache(res);
  res.setHeader("Content-Type", guessMimeByExt(ORIGINAL_TARGET));
  res.send(fs.readFileSync(ORIGINAL_TARGET));
});

app.get("/api/admin/assets/mask", requireAdmin, (req, res) => {
  if (!fs.existsSync(MASK_TARGET)) {
    return res.status(404).json({ error: "mask image missing" });
  }
  withNoCache(res);
  res.setHeader("Content-Type", guessMimeByExt(MASK_TARGET));
  res.send(fs.readFileSync(MASK_TARGET));
});

app.post("/api/admin/upload-original", requireAdmin, upload.single("file"), (req, res) => {
  const file = req.file;
  if (!file || !file.buffer) {
    return res.status(400).json({ error: "file is required" });
  }
  if (!String(file.mimetype).startsWith("image/")) {
    return res.status(400).json({ error: "image file required" });
  }
  fs.writeFileSync(ORIGINAL_TARGET, file.buffer);
  res.json({ ok: true });
});

app.post("/api/admin/upload-mask", requireAdmin, upload.single("file"), (req, res) => {
  const file = req.file;
  if (!file || !file.buffer) {
    return res.status(400).json({ error: "file is required" });
  }
  if (!String(file.mimetype).startsWith("image/")) {
    return res.status(400).json({ error: "image file required" });
  }
  fs.writeFileSync(MASK_TARGET, file.buffer);
  res.json({ ok: true });
});

app.post("/api/admin/reset-latest", requireAdmin, (req, res) => {
  if (fs.existsSync(LATEST_TARGET)) {
    fs.unlinkSync(LATEST_TARGET);
  }
  if (fs.existsSync(LATEST_META)) {
    fs.unlinkSync(LATEST_META);
  }
  res.json({ ok: true });
});

app.use((err, req, res, next) => {
  if (err && err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ error: "file too large (max 25MB)" });
  }
  return res.status(500).json({ error: "internal server error" });
});

app.listen(PORT, () => {
  console.log(`Image Fill Web running at http://127.0.0.1:${PORT}`);
});
