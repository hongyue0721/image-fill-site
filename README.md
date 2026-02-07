# 西瓜填充网站（萌新友好版）

这是一个可以把自然语言填进提示词模板并做图生图编辑的小网站。

你输入一句话，例如：`草莓果肉`，系统会自动拼成：

`将这个西瓜里填满草莓果肉`

然后把原图 + 底图（mask）一起发给 OpenAI 兼容图片编辑接口，返回的新图会直接替换页面里的图片。

## 你会得到什么

- 一个前台页面：`/`
  - 只展示图片结果
  - 输入文字后点击生成
- 一个管理后台：`/admin`
  - 修改网站标题、副标题、提示词模板
  - 修改主/备 API 通道配置（Base URL / API Key / Model）
  - 上传原图和底图（mask）
  - 一键重置到原图

## 目录说明

- `server.js`：后端服务（Express）
- `public/index.html`：前台页面
- `public/admin.html`：后台页面
- `public/style.css`：样式
- `uploads/original.jpg`：当前原图（后台可替换）
- `uploads/mask.png`：当前底图 mask（后台可替换）
- `data/latest-image.bin`：最新生成图
- `data/config.json`：后台保存的配置

## 第一步：准备环境

你需要先安装：

- Node.js 18+

进入项目目录：

```bash
cd "C:\Users\MSI-\Desktop\image-fill-site"
```

## 第二步：安装依赖

```bash
npm install
```

## 第三步：配置环境变量

复制模板：

```bash
copy .env.example .env
```

修改 `.env` 里的关键项：

- `ADMIN_PASSWORD`：后台登录密码
- `UPSTREAM_PRIMARY_BASE_URL`：主通道地址（建议 new-api）
- `UPSTREAM_PRIMARY_API_KEY`：主通道 key
- `UPSTREAM_PRIMARY_MODEL`：主通道模型名（例如 `gpt-image-1`）
- 可选配置备用通道：`UPSTREAM_SECONDARY_*`

## 第四步：启动项目

```bash
npm start
```

启动后访问：

- 前台：`http://127.0.0.1:3001/`
- 后台：`http://127.0.0.1:3001/admin`

## 素材图片怎么处理

项目启动时会自动尝试把根目录这两个文件复制为默认素材：

- `nocut.jpg` -> `uploads/original.jpg`
- `cut.png` -> `uploads/mask.png`

如果你想换图，直接去后台上传即可。

## API 设计（给你自己前端调用）

- `POST /api/generate`
  - body: `{ "text": "草莓果肉" }`
  - 作用：图生图生成并保存最新结果
- `GET /api/images/current`
  - 作用：返回当前展示图（二进制）
- `GET /api/public-config`
  - 作用：前台读取标题和模板信息

后台接口（需要 header：`x-admin-password`）：

- `GET /api/admin/config`
- `PUT /api/admin/config`
- `POST /api/admin/upload-original`
- `POST /api/admin/upload-mask`
- `POST /api/admin/reset-latest`

## GitHub 上传必备清单

建议你上传这些文件：

- `server.js`
- `package.json`
- `.env.example`（不要上传 `.env`）
- `public/` 整个目录
- `nocut.jpg`（默认原图）
- `cut.png`（默认底图 mask）
- `.gitignore`
- `README.md`

不要上传：

- `.env`
- `node_modules/`
- `data/`（可能含运行时结果）
- `uploads/`（按需，可不上传）

## 常见问题

1. 生成失败，提示上游错误
   - 检查 Base URL、API Key、Model 是否正确
   - 检查上游是否已启动（new-api / grok2api）

2. 图不更新
   - 已做时间戳防缓存；如果仍不更新，按 Ctrl+F5 强刷

3. 后台进不去
   - 检查 `.env` 里的 `ADMIN_PASSWORD`

## 后续建议

- 增加管理员登录会话（token/cookie）
- 增加操作日志和失败重试次数配置
- 增加多个模板和模板选择器
