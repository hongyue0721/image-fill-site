const statusEl = document.getElementById("status");
const textInput = document.getElementById("textInput");
const generateBtn = document.getElementById("generateBtn");
const resultImage = document.getElementById("resultImage");
const siteTitle = document.getElementById("siteTitle");
const siteSubtitle = document.getElementById("siteSubtitle");
const waifuModal = document.getElementById("waifuModal");

function setStatus(message, kind = "") {
  statusEl.className = `status ${kind}`.trim();
  statusEl.textContent = message || "";
}

function openModal() {
  waifuModal.classList.add("active");
}

function closeModal() {
  waifuModal.classList.remove("active");
}

async function loadPublicConfig() {
  try {
    const r = await fetch("/api/public-config");
    const data = await r.json();
    if (data.siteTitle) {
      siteTitle.textContent = data.siteTitle;
      document.title = data.siteTitle;
    }
    if (data.siteSubtitle) {
      siteSubtitle.textContent = data.siteSubtitle;
    }
  } catch {
    setStatus("配置读取失败，已使用默认标题", "warn");
  }
}

async function generate() {
  const text = textInput.value.trim();
  if (!text) {
    setStatus("请先输入一句自然语言描述", "warn");
    return;
  }

  generateBtn.disabled = true;
  setStatus("正在生成图片，请稍候...", "warn");

  try {
    const r = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const data = await r.json();
    if (!r.ok || !data.ok) {
      throw new Error(data.error || "生成失败");
    }
    resultImage.src = data.image_url;
    setStatus(`生成成功（通道: ${data.provider}）`, "ok");
    
    // Show waifu modal after successful generation
    setTimeout(() => {
      openModal();
    }, 500);
  } catch (error) {
    setStatus(error.message || "生成失败", "error");
  } finally {
    generateBtn.disabled = false;
  }
}

generateBtn.addEventListener("click", generate);
textInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    generate();
  }
});

// Close modal when clicking outside
waifuModal.addEventListener("click", (e) => {
  if (e.target === waifuModal) {
    closeModal();
  }
});

// Close modal with Escape key
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && waifuModal.classList.contains("active")) {
    closeModal();
  }
});

loadPublicConfig();
