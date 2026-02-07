const loginPanel = document.getElementById("loginPanel");
const adminPanel = document.getElementById("adminPanel");
const adminPasswordInput = document.getElementById("adminPassword");
const loginBtn = document.getElementById("loginBtn");
const loginStatus = document.getElementById("loginStatus");
const adminStatus = document.getElementById("adminStatus");

const saveBtn = document.getElementById("saveBtn");
const uploadOriginalBtn = document.getElementById("uploadOriginalBtn");
const uploadMaskBtn = document.getElementById("uploadMaskBtn");
const resetLatestBtn = document.getElementById("resetLatestBtn");

let adminPassword = "";

function setStatus(el, msg, kind = "") {
  el.className = `status ${kind}`.trim();
  el.textContent = msg || "";
}

function h(name) {
  return document.getElementById(name);
}

function authHeaders() {
  return {
    "Content-Type": "application/json",
    "x-admin-password": adminPassword,
  };
}

function fillForm(cfg) {
  h("siteTitle").value = cfg.siteTitle || "";
  h("siteSubtitle").value = cfg.siteSubtitle || "";
  h("promptTemplate").value = cfg.promptTemplate || "";
  h("requestTimeoutMs").value = String(cfg.requestTimeoutMs || 120000);

  const p = cfg.upstreams.primary || {};
  h("pName").value = p.name || "";
  h("pModel").value = p.model || "";
  h("pBaseUrl").value = p.baseUrl || "";
  h("pApiKey").value = p.apiKey || "";
  h("pEnabled").checked = !!p.enabled;

  const s = cfg.upstreams.secondary || {};
  h("sName").value = s.name || "";
  h("sModel").value = s.model || "";
  h("sBaseUrl").value = s.baseUrl || "";
  h("sApiKey").value = s.apiKey || "";
  h("sEnabled").checked = !!s.enabled;
}

function collectForm() {
  return {
    siteTitle: h("siteTitle").value,
    siteSubtitle: h("siteSubtitle").value,
    promptTemplate: h("promptTemplate").value,
    requestTimeoutMs: Number(h("requestTimeoutMs").value || 120000),
    upstreams: {
      primary: {
        name: h("pName").value,
        model: h("pModel").value,
        baseUrl: h("pBaseUrl").value,
        apiKey: h("pApiKey").value,
        enabled: h("pEnabled").checked,
      },
      secondary: {
        name: h("sName").value,
        model: h("sModel").value,
        baseUrl: h("sBaseUrl").value,
        apiKey: h("sApiKey").value,
        enabled: h("sEnabled").checked,
      },
    },
  };
}

async function loadConfig() {
  const r = await fetch("/api/admin/config", {
    headers: {
      "x-admin-password": adminPassword,
    },
  });
  const data = await r.json();
  if (!r.ok) {
    throw new Error(data.error || "读取配置失败");
  }
  fillForm(data);
}

async function doLogin() {
  adminPassword = adminPasswordInput.value;
  if (!adminPassword) {
    setStatus(loginStatus, "请输入管理员密码", "warn");
    return;
  }
  const r = await fetch("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: adminPassword }),
  });
  const data = await r.json();
  if (!r.ok || !data.ok) {
    setStatus(loginStatus, data.error || "登录失败", "error");
    return;
  }

  setStatus(loginStatus, "登录成功", "ok");
  loginPanel.classList.add("hidden");
  adminPanel.classList.remove("hidden");
  await loadConfig();
}

async function saveConfig() {
  try {
    const payload = collectForm();
    const r = await fetch("/api/admin/config", {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await r.json();
    if (!r.ok) {
      throw new Error(data.error || "保存失败");
    }
    setStatus(adminStatus, "配置保存成功", "ok");
  } catch (e) {
    setStatus(adminStatus, e.message || "保存失败", "error");
  }
}

async function uploadImage(fileInputId, endpoint) {
  const input = h(fileInputId);
  if (!input.files || !input.files[0]) {
    setStatus(adminStatus, "请选择图片文件", "warn");
    return;
  }
  const form = new FormData();
  form.append("file", input.files[0]);

  const r = await fetch(endpoint, {
    method: "POST",
    headers: {
      "x-admin-password": adminPassword,
    },
    body: form,
  });
  const data = await r.json();
  if (!r.ok) {
    throw new Error(data.error || "上传失败");
  }
}

loginBtn.addEventListener("click", () => {
  doLogin().catch((e) => setStatus(loginStatus, e.message || "登录失败", "error"));
});

saveBtn.addEventListener("click", saveConfig);

uploadOriginalBtn.addEventListener("click", async () => {
  try {
    await uploadImage("uploadOriginal", "/api/admin/upload-original");
    setStatus(adminStatus, "原图上传成功", "ok");
  } catch (e) {
    setStatus(adminStatus, e.message || "原图上传失败", "error");
  }
});

uploadMaskBtn.addEventListener("click", async () => {
  try {
    await uploadImage("uploadMask", "/api/admin/upload-mask");
    setStatus(adminStatus, "底图上传成功", "ok");
  } catch (e) {
    setStatus(adminStatus, e.message || "底图上传失败", "error");
  }
});

resetLatestBtn.addEventListener("click", async () => {
  try {
    const r = await fetch("/api/admin/reset-latest", {
      method: "POST",
      headers: {
        "x-admin-password": adminPassword,
      },
    });
    const data = await r.json();
    if (!r.ok) {
      throw new Error(data.error || "重置失败");
    }
    setStatus(adminStatus, "已重置到原图", "ok");
  } catch (e) {
    setStatus(adminStatus, e.message || "重置失败", "error");
  }
});
