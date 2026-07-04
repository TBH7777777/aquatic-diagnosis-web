# 🐟 水产智能诊断系统 &middot; aquatic-diagnosis-web

> AI 驱动的淡水鱼病识别与养殖知识库网页应用

**技术栈**:  GitHub 源码托管 + Supabase 新加坡节点 PostgreSQL + Cloudflare Pages / Workers / R2

---

## 📋 Milestone 状态

| 里程碑 | 状态 | 内容 |
|---|---|---|
| **M1** | ✅ 已完成 | 数据库建表、RLS权限、种子数据、Workers API网关 |
| M2 | 🔜 待开发 | 前端诊断界面、图片上传、AI模型推理 |
| M3 | 🔜 待开发 | ONNX模型部署R2、诊断回调、结果展示 |
| M4 | 🔜 待开发 | 用户系统、诊断历史、反馈优化 |

---

## 🏗️ 项目结构

```
aquatic-diagnosis-web/
├── db/                          # 数据库 SQL
│   ├── schema.sql               #   建表语句（5表）
│   ├── rls_policies.sql         #   RLS 行级安全策略
│   └── seed_data.sql            #   淡水鱼病种子数据（15种鱼病）
├── workers/api-gateway/         # Cloudflare Workers API 网关
│   ├── src/index.js             #   Worker 主代码
│   ├── wrangler.toml            #   Worker 部署配置
│   └── package.json             #   Worker 依赖
├── src/                         # 前端源码
│   ├── index.html               #   入口页面
│   └── app.js                   #   前端主逻辑
├── docs/                        # 文档
│   └── API.md                   #   API 接口文档
├── public/                      # 静态资源
├── .gitignore
├── package.json
└── README.md
```

---

## 🗄️ 数据库设计

| 表名 | 用途 | 记录数(种子) |
|---|---|---|
| `fish_diseases` | 鱼病主表 — 中英文名称、病类、严重度、防治方法 | 15 |
| `disease_symptoms` | 病症关联 — 典型症状与发病部位 | ~76 |
| `aquaculture_params` | 养殖参数 — 水质/化学/操作阈值 | 13 |
| `knowledge_base` | 知识库 — 技术文章（Markdown） | 3 |
| `user_uploads` | 用户上传 — 图片URL + AI诊断结果JSON | 0 |

### RLS 安全策略

- **公开数据**: 鱼病、病症、养殖参数、已发布知识库文章 → `anon` 可 SELECT
- **用户数据**: `user_uploads` → `authenticated` 仅操作自己的记录
- **全权限**: `service_role` → Worker 后端使用，绕过 RLS

---

## 🚀 快速部署

### 1. Supabase 数据库初始化

在 Supabase SQL Editor 中**按顺序**执行：

```
1. db/schema.sql        — 建表 + 扩展 + 触发器
2. db/rls_policies.sql  — RLS 权限策略
3. db/seed_data.sql     — 种子数据导入
```

### 2. Cloudflare Workers 部署

```bash
cd workers/api-gateway
npm install

# 设置环境变量（非敏感）
# 编辑 wrangler.toml，填入 SUPABASE_URL 和 SUPABASE_ANON_KEY

# 设置敏感密钥（service_role key）
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY

# 部署
npx wrangler deploy
```

记录 Worker URL（例如 `https://aquatic-diagnosis-api.xxx.workers.dev`）。

### 3. 前端部署（Cloudflare Pages）

```bash
# 更新 src/app.js 中 API_BASE 为真实 Worker URL

# 在 Cloudflare Dashboard → Workers & Pages → Pages
# 绑定 GitHub 仓库 aquatic-diagnosis-web
# 构建设置:
#   构建命令: (空，静态页面)
#   输出目录: src/
```

### 4. R2 存储桶（后续里程碑）

在 Cloudflare Dashboard 创建 R2 存储桶用于存储：
- 鱼病标本图片
- 用户上传图片
- AI 识别 ONNX 模型文件

---

## 🔗 API 端点

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/diseases` | 鱼病列表（分页+筛选） |
| `GET` | `/api/diseases/:id` | 鱼病详情+关联病症 |
| `GET` | `/api/params` | 养殖参数列表 |
| `GET` | `/api/knowledge` | 知识库文章列表 |
| `GET` | `/api/knowledge/:slug` | 知识库文章详情 |
| `POST` | `/api/diagnose` | 提交诊断请求 |
| `GET` | `/api/uploads/:user_id` | 用户上传历史 |

完整文档见 [docs/API.md](docs/API.md)

---

## 🔐 密钥安全

> ⚠️ 以下密钥**绝不**提交到 Git 仓库：

| 密钥 | 存储位置 | 设置方式 |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Cloudflare Workers Secrets | `wrangler secret put` |
| `SUPABASE_ANON_KEY` | `wrangler.toml` `[vars]`（可公开） | 直接配置 |
| `SUPABASE_URL` | `wrangler.toml` `[vars]`（可公开） | 直接配置 |

已检查 `.gitignore` 排除 `.env`、`*.secret`、`wrangler.toml.local`。

---

## 📦 版本

- **v0.1.0** — Milestone 1: 数据库 Schema + RLS + 种子数据 + Workers API 网关

---

## 📄 许可

MIT License