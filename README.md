# 西瓜填充网站

这是一个基于 Express 的图像编辑网站：用户输入文本后，系统会按模板拼接 prompt，携带原图和 mask 调用 OpenAI 兼容 `/v1/images/edits` 接口，并将结果作为当前展示图。

## 架构与功能说明

### 1) 系统结构

- `server.js`：唯一后端入口，负责静态资源、API、配置加载、上游调用、素材管理。
- `public/index.html` + `public/app.js`：前台页面，提交文本并展示最新图片。
- `public/admin.html` + `public/admin.js`：后台页面，修改站点配置与上传素材。
- `public/style.css`：前后台公共样式。

### 2) 运行时数据流

1. 用户在前台输入文本并提交到 `POST /api/generate`。
2. 后端读取配置，生成最终 prompt（默认模板：`将这个西瓜里填满{}`）。
3. 后端按主通道 -> 备通道顺序尝试上游图片编辑接口。
4. 成功后写入 `data/latest-image.bin` 与 `data/latest-meta.json`。
5. 前台通过 `GET /api/images/current` 获取最新图并刷新显示。

### 3) 配置层级

后端在启动时按以下优先级加载配置：

1. `config.con`（推荐，方便部署时统一修改）
2. `.env`
3. 代码默认值（`server.js` 内置）

说明：`data/config.json` 是后台页面保存的业务配置（标题、模板、上游参数等），和环境变量共同构成最终行为。

### 4) 目录说明

- `nocut.jpg`：默认原图。
- `cut.png`：默认 mask 图。
- `uploads/original.jpg`：当前生效原图（可后台覆盖）。
- `uploads/mask.png`：当前生效 mask（可后台覆盖）。
- `data/config.json`：后台保存配置。
- `data/latest-image.bin`：最近一次生成结果。
- `config.con`：部署时主要配置文件（新增）。
- `config.con.example`：配置模板。

## Ubuntu 部署流程

以下流程适用于 Ubuntu 22.04/24.04。

### 1) 安装 Node.js 18+

```bash
sudo apt update
sudo apt install -y curl ca-certificates gnupg
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

### 2) 获取项目并安装依赖

```bash
git clone <your-repo-url>
cd image-fill-site
npm install --production
```

### 3) 配置 `config.con`

复制模板并编辑：

```bash
cp config.con.example config.con
nano config.con
```

至少修改这些项：

- `ADMIN_PASSWORD`
- `UPSTREAM_PRIMARY_BASE_URL`
- `UPSTREAM_PRIMARY_API_KEY`
- `UPSTREAM_PRIMARY_MODEL`

可选：

- `UPSTREAM_SECONDARY_*`（备用通道）
- `PORT`
- `REQUEST_TIMEOUT_MS`

### 4) 启动服务

```bash
npm start
```

默认访问地址：

- 前台：`http://127.0.0.1:3001/`
- 后台：`http://127.0.0.1:3001/admin`

### 5) 推荐用 systemd 常驻

创建服务文件：

```bash
sudo nano /etc/systemd/system/image-fill.service
```

写入：

```ini
[Unit]
Description=Image Fill Web
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/image-fill-site
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=3
User=www-data
Group=www-data
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

启用并启动：

```bash
sudo systemctl daemon-reload
sudo systemctl enable image-fill.service
sudo systemctl start image-fill.service
sudo systemctl status image-fill.service
```

查看日志：

```bash
journalctl -u image-fill.service -f
```

## 主要 API

- `POST /api/generate`：提交文本并生成图片。
- `GET /api/images/current`：读取当前展示图。
- `GET /api/public-config`：读取前台展示配置。
- `POST /api/admin/login`：后台密码登录。
- `GET /api/admin/config`：读取后台配置（需 `x-admin-password`）。
- `PUT /api/admin/config`：更新后台配置（需 `x-admin-password`）。
- `POST /api/admin/upload-original`：上传原图（需 `x-admin-password`）。
- `POST /api/admin/upload-mask`：上传 mask（需 `x-admin-password`）。
- `POST /api/admin/reset-latest`：清空最新生成结果（需 `x-admin-password`）。

## 常见问题

- 生成失败：检查 `config.con` 中上游地址、Key、Model 是否正确，上游服务是否可用。
- 图片不更新：接口已禁用缓存，可尝试强制刷新浏览器。
- 后台登录失败：确认 `ADMIN_PASSWORD` 与请求一致。
