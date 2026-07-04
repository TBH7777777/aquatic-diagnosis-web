# Aquatic Diagnosis — API 接口文档 v0.1.0

## 概述

API Gateway 基于 Cloudflare Workers，作为前端 Pages 与 Supabase PostgreSQL 之间的安全中转层。

- **Base URL**: `https://api-gateway.your-worker.workers.dev`
- **Content-Type**: `application/json; charset=utf-8`
- **CORS**: 已启用（允许 Pages 域名跨域）
- **Rate Limit**: 每 IP 每分钟 120 请求

---

## 端点总览

| 方法 | 路径 | 说明 | 认证 |
|---|---|---|---|
| `GET` | `/api/diseases` | 鱼病列表（分页+筛选） | anon |
| `GET` | `/api/diseases/:id` | 鱼病详情+关联病症 | anon |
| `GET` | `/api/params` | 养殖参数列表 | anon |
| `GET` | `/api/knowledge` | 知识库文章列表 | anon |
| `GET` | `/api/knowledge/:slug` | 知识库文章详情 | anon |
| `POST` | `/api/diagnose` | 提交诊断请求 | service_role |
| `GET` | `/api/uploads/:user_id` | 用户上传历史 | service_role |

---

## 1. 鱼病列表

```
GET /api/diseases?category=bacterial&severity=severe&search=烂鳃&page=1&limit=20
```

### Query Parameters

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `category` | string | 否 | 病类筛选: bacterial / viral / parasitic / fungal / environmental / nutritional |
| `severity` | string | 否 | 严重度: mild / medium / severe / critical |
| `search` | string | 否 | 中文名称模糊搜索 |
| `page` | integer | 否 | 页码，默认 1 |
| `limit` | integer | 否 | 每页条数，默认 20，最大 100 |

### 响应示例

```json
{
  "success": true,
  "data": [
    {
      "id": "a1b2c3d4-...",
      "name_zh": "细菌性烂鳃病",
      "name_en": "Bacterial Gill Rot",
      "category": "bacterial",
      "severity": "severe",
      "description": "细菌性烂鳃病是由...",
      "prevention": "1. 定期换水...",
      "treatment": "1. 外用：全池泼洒...",
      "tags": ["烂鳃", "细菌", "柱状黄杆菌"],
      "created_at": "2025-01-01T00:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 15,
    "totalPages": 1
  }
}
```

---

## 2. 鱼病详情

```
GET /api/diseases/a1b2c3d4-...
```

返回单个鱼病的完整信息 + 关联的病症列表（`symptoms` 数组）。

### 响应示例

```json
{
  "success": true,
  "data": {
    "id": "a1b2c3d4-...",
    "name_zh": "细菌性烂鳃病",
    "name_en": "Bacterial Gill Rot",
    "name_latin": "Flavobacterium columnare",
    "category": "bacterial",
    "severity": "severe",
    "description": "详细描述...",
    "etiology": "病原体为柱状黄杆菌...",
    "prevention": "预防措施...",
    "treatment": "治疗方法...",
    "applicable_species": "草鱼、青鱼、鲤鱼",
    "tags": ["烂鳃", "细菌"],
    "symptoms": [
      {
        "symptom_name": "鳃丝腐烂发白",
        "symptom_desc": "鳃丝末端腐烂，颜色发白",
        "body_part": "gills",
        "severity_level": "severe"
      }
    ]
  }
}
```

---

## 3. 养殖参数列表

```
GET /api/params?category=chemical
```

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `category` | string | 否 | physical / chemical / biological / operational |

---

## 4. 知识库

### 文章列表

```
GET /api/knowledge?category=disease_prevention&page=1&limit=20
```

### 文章详情

```
GET /api/knowledge/freshwater-quality-basics
```

通过 slug 获取完整文章内容（含 Markdown 正文）。

---

## 5. 提交诊断

```
POST /api/diagnose
Content-Type: application/json

{
  "user_id": "uuid-from-supabase-auth",
  "image_url": "https://r2.your-account.r2.cloudflarestorage.com/specimens/xxx.jpg",
  "thumbnail_url": "https://r2.xxx/thumbnails/xxx_thumb.jpg",
  "model_version": "onnx-v1.0",
  "device_info": { "platform": "web", "userAgent": "..." }
}
```

### 响应 (201 Created)

```json
{
  "success": true,
  "message": "诊断记录已创建，等待处理",
  "data": {
    "id": "...",
    "user_id": "...",
    "image_url": "...",
    "status": "pending",
    "created_at": "..."
  }
}
```

---

## 6. 用户上传历史

```
GET /api/uploads/{user_id}
```

返回该用户最近 50 条上传记录。

---

## 错误响应格式

所有错误响应遵循统一格式：

```json
{
  "success": false,
  "error": "错误描述",
  "timestamp": "2025-01-01T00:00:00.000Z"
}
```

| HTTP 状态码 | 含义 |
|---|---|
| `400` | 请求参数错误 |
| `404` | 资源不存在 |
| `405` | 方法不允许 |
| `429` | 请求限流 |
| `500` | 服务器内部错误 |
| `502` | 上游 Supabase 错误 |

---

## 部署清单

1. 在 `wrangler.toml` 中配置 `SUPABASE_URL` 和 `SUPABASE_ANON_KEY`
2. 运行 `npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY` 设置敏感密钥
3. 运行 `npx wrangler deploy` 部署
4. 记录 Worker URL（如 `https://aquatic-diagnosis-api.your-subdomain.workers.dev`）
5. 更新前端 `src/app.js` 中 `API_BASE` 常量

---

> 📅 v0.1.0 · Milestone 1 基础设施就绪 · 后续里程碑将增加 AI 诊断回调、图片上传预签名 URL 等功能