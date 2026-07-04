/**
 * ============================================================
 * aquatic-diagnosis-web | Cloudflare Workers API Gateway
 * Milestone 1 — 数据库接口中转层
 *
 * 作用：在前端 Pages 与 Supabase PostgreSQL 之间做安全中转，
 *       保护 service_role 密钥不暴露到浏览器端。
 *
 * 路由表：
 *   GET    /api/diseases          — 鱼病列表（分页+筛选）
 *   GET    /api/diseases/:id       — 鱼病详情+关联病症
 *   GET    /api/params             — 养殖参数列表
 *   GET    /api/knowledge          — 知识库文章列表（分页）
 *   GET    /api/knowledge/:slug    — 知识库文章详情
 *   POST   /api/diagnose           — 提交诊断请求
 *   GET    /api/uploads/:user_id   — 用户上传历史
 * ============================================================
 */

// ---- 配置常量 -------------------------------------------------
const API_PREFIX = '/api';

// 速率限制：每 IP 每分钟最大请求数
const RATE_LIMIT_WINDOW_MS = 60_000;   // 1 分钟窗口
const RATE_LIMIT_MAX       = 120;       // 窗口内最大请求数

// 内存存储（Worker 级别，非持久化，适合轻量限流）
// 格式: { "ip": { count: N, resetAt: timestamp } }
const rateLimitStore = new Map();

// ---- 工具函数 -------------------------------------------------

/**
 * 构建 Supabase REST API 请求头
 * @param {string} keyType — 'anon' | 'service_role'
 */
function supabaseHeaders(keyType) {
  const key = keyType === 'service_role'
    ? SUPABASE_SERVICE_ROLE_KEY
    : SUPABASE_ANON_KEY;
  return {
    'apikey':        key,
    'Authorization': `Bearer ${key}`,
    'Content-Type':  'application/json',
    'Prefer':        'return=representation',
  };
}

/**
 * 构建 JSON 响应
 */
function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type':  'application/json; charset=utf-8',
      'Access-Control-Allow-Origin':  ALLOWED_ORIGINS || '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
      'Access-Control-Max-Age':       '86400',
    },
  });
}

/**
 * 错误响应
 */
function error(message, status = 400) {
  return json({ success: false, error: message, timestamp: new Date().toISOString() }, status);
}

/**
 * 获取 URL 路径段
 */
function getPathSegments(pathname) {
  // 移除 API_PREFIX 前缀后按 '/' 分割
  const withoutPrefix = pathname.replace(API_PREFIX, '').replace(/^\/+/, '');
  return withoutPrefix.split('/').filter(Boolean);
}

// ---- 速率限制 -------------------------------------------------

/**
 * 简单滑动窗口限流
 * @returns {{ allowed: boolean, remaining: number, retryAfter?: number }}
 */
function checkRateLimit(ip) {
  const now = Date.now();
  let entry = rateLimitStore.get(ip);

  if (!entry || now > entry.resetAt) {
    // 新窗口
    entry = { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS };
    rateLimitStore.set(ip, entry);
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1 };
  }

  entry.count += 1;
  if (entry.count > RATE_LIMIT_MAX) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return { allowed: false, remaining: 0, retryAfter };
  }

  return { allowed: true, remaining: RATE_LIMIT_MAX - entry.count };
}

// ---- 路由处理器 -----------------------------------------------

/**
 * GET /api/diseases — 鱼病列表
 * Query: ?category=bacterial&severity=severe&search=烂鳃&page=1&limit=20
 */
async function handleListDiseases(request) {
  const url     = new URL(request.url);
  const params  = url.searchParams;

  let query = `${SUPABASE_URL}/rest/v1/fish_diseases?select=*`;

  // 筛选条件
  const category = params.get('category');
  if (category) {
    query += `&category=eq.${encodeURIComponent(category)}`;
  }

  const severity = params.get('severity');
  if (severity) {
    query += `&severity=eq.${encodeURIComponent(severity)}`;
  }

  const search = params.get('search');
  if (search) {
    // Supabase 全文搜索 or 用 ilike
    query += `&name_zh=ilike.*${encodeURIComponent(search)}*`;
  }

  // 分页
  const page  = parseInt(params.get('page'))  || 1;
  const limit = Math.min(parseInt(params.get('limit')) || 20, 100);
  const offset = (page - 1) * limit;
  query += `&limit=${limit}&offset=${offset}&order=created_at.desc`;

  // 获取总数（简化处理：单独请求 count）
  let countQuery = `${SUPABASE_URL}/rest/v1/fish_diseases?select=id&limit=0`;
  if (category) countQuery += `&category=eq.${encodeURIComponent(category)}`;
  if (severity) countQuery += `&severity=eq.${encodeURIComponent(severity)}`;

  try {
    const [dataRes, countRes] = await Promise.all([
      fetch(query, { headers: supabaseHeaders('anon') }),
      fetch(countQuery, { headers: { ...supabaseHeaders('anon'), 'Prefer': 'count=exact' } }),
    ]);

    if (!dataRes.ok) {
      const err = await dataRes.text();
      return error(`Supabase 查询失败: ${err}`, 502);
    }

    const data  = await dataRes.json();
    const total = parseInt(countRes.headers.get('content-range')?.split('/')[1]) || data.length;

    return json({
      success: true,
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (e) {
    return error(`服务异常: ${e.message}`, 500);
  }
}

/**
 * GET /api/diseases/:id — 鱼病详情 + 关联病症
 */
async function handleGetDisease(diseaseId) {
  // 同时查询鱼病主表和病症关联表
  const diseaseQuery  = `${SUPABASE_URL}/rest/v1/fish_diseases?id=eq.${diseaseId}&select=*&limit=1`;
  const symptomQuery  = `${SUPABASE_URL}/rest/v1/disease_symptoms?disease_id=eq.${diseaseId}&select=*&order=sort_order.asc`;

  try {
    const [diseaseRes, symptomRes] = await Promise.all([
      fetch(diseaseQuery, { headers: supabaseHeaders('anon') }),
      fetch(symptomQuery,  { headers: supabaseHeaders('anon') }),
    ]);

    if (!diseaseRes.ok) return error('鱼病记录查询失败', 502);

    const disease   = await diseaseRes.json();
    if (!disease || disease.length === 0) return error('未找到该鱼病记录', 404);

    const symptoms  = symptomRes.ok ? await symptomRes.json() : [];

    return json({
      success:  true,
      data:     { ...disease[0], symptoms },
    });
  } catch (e) {
    return error(`服务异常: ${e.message}`, 500);
  }
}

/**
 * GET /api/params — 养殖参数列表
 * Query: ?category=chemical
 */
async function handleListParams(request) {
  const url    = new URL(request.url);
  const category = url.searchParams.get('category');

  let query = `${SUPABASE_URL}/rest/v1/aquaculture_params?select=*&order=category.asc,param_name.asc`;
  if (category) {
    query += `&category=eq.${encodeURIComponent(category)}`;
  }

  try {
    const res = await fetch(query, { headers: supabaseHeaders('anon') });
    if (!res.ok) return error('参数查询失败', 502);

    const data = await res.json();
    return json({ success: true, data });
  } catch (e) {
    return error(`服务异常: ${e.message}`, 500);
  }
}

/**
 * GET /api/knowledge — 知识库文章列表
 * Query: ?category=disease_prevention&page=1&limit=20
 *
 * GET /api/knowledge/:slug — 文章详情
 */
async function handleKnowledge(segments, request) {
  // 如果第二段是 slug → 查详情
  if (segments.length >= 2) {
    const slug = segments[1];
    const articleQuery = `${SUPABASE_URL}/rest/v1/knowledge_base?slug=eq.${encodeURIComponent(slug)}&select=*&limit=1`;

    try {
      const res = await fetch(articleQuery, { headers: supabaseHeaders('anon') });
      if (!res.ok) return error('知识库查询失败', 502);

      const articles = await res.json();
      if (!articles || articles.length === 0) return error('未找到该文章', 404);
      return json({ success: true, data: articles[0] });
    } catch (e) {
      return error(`服务异常: ${e.message}`, 500);
    }
  }

  // 知识库列表（分页）
  const url    = new URL(request.url);
  const params = url.searchParams;
  const category = params.get('category');
  const page     = parseInt(params.get('page'))  || 1;
  const limit    = Math.min(parseInt(params.get('limit')) || 20, 100);
  const offset   = (page - 1) * limit;

  let query = `${SUPABASE_URL}/rest/v1/knowledge_base?select=id,title,slug,summary,category,tags,author,view_count,published_at&is_published=eq.true`;
  if (category) {
    query += `&category=eq.${encodeURIComponent(category)}`;
  }
  query += `&limit=${limit}&offset=${offset}&order=published_at.desc`;

  try {
    const res = await fetch(query, { headers: supabaseHeaders('anon') });
    if (!res.ok) return error('知识库查询失败', 502);
    const data = await res.json();
    return json({ success: true, data, pagination: { page, limit } });
  } catch (e) {
    return error(`服务异常: ${e.message}`, 500);
  }
}

/**
 * POST /api/diagnose — 创建诊断记录
 * Body: { user_id, image_url, model_version?, device_info? }
 * 使用 service_role 写入（绕过 RLS 用户校验，便于初期开发）
 */
async function handleDiagnose(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return error('请求体需为有效 JSON', 400);
  }

  const { user_id, image_url, thumbnail_url, model_version, device_info } = body;
  if (!user_id)   return error('缺少必填字段: user_id', 400);
  if (!image_url) return error('缺少必填字段: image_url', 400);

  const insertQuery = `${SUPABASE_URL}/rest/v1/user_uploads`;

  const payload = {
    user_id,
    image_url,
    thumbnail_url:  thumbnail_url || null,
    ai_model_version: model_version || null,
    device_info:    device_info  || null,
    status:         'pending',
  };

  try {
    const res = await fetch(insertQuery, {
      method:  'POST',
      headers: supabaseHeaders('service_role'),
      body:    JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.text();
      return error(`写入失败: ${err}`, 502);
    }

    // Supabase 返回 201 无 body 时手动查回刚插入的记录
    const location = res.headers.get('location');
    let insertedData = null;
    if (location) {
      const getRes = await fetch(location, { headers: supabaseHeaders('service_role') });
      if (getRes.ok) {
        const arr = await getRes.json();
        insertedData = arr[0] || null;
      }
    }

    return json({
      success: true,
      message: '诊断记录已创建，等待处理',
      data:    insertedData || payload,
    }, 201);
  } catch (e) {
    return error(`服务异常: ${e.message}`, 500);
  }
}

/**
 * GET /api/uploads/:user_id — 用户上传历史
 */
async function handleGetUploads(userId) {
  const query = `${SUPABASE_URL}/rest/v1/user_uploads?user_id=eq.${encodeURIComponent(userId)}&select=*&order=created_at.desc&limit=50`;

  try {
    // 这里用 anon key 查询 —— RLS 已配置只允许用户查自己的记录
    // 当前 Worker 用 anon key 时 RLS 会阻止跨用户查询
    // 过渡期使用 service_role（后续里程碑迁移到用户 jwt 认证）
    const res = await fetch(query, { headers: supabaseHeaders('service_role') });
    if (!res.ok) return error('查询失败', 502);

    const data = await res.json();
    return json({ success: true, data, count: data.length });
  } catch (e) {
    return error(`服务异常: ${e.message}`, 500);
  }
}

// ---- CORS 预检 -------------------------------------------------

function handleOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin':  ALLOWED_ORIGINS || '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
      'Access-Control-Max-Age':       '86400',
    },
  });
}

// ---- 主入口 ----------------------------------------------------

export default {
  async fetch(request, env, ctx) {
    // 绑定环境变量
    // 在 wrangler.toml 中配置 [vars] 或在 CF Dashboard 设置 secrets
    globalThis.SUPABASE_URL             = env.SUPABASE_URL;
    globalThis.SUPABASE_ANON_KEY        = env.SUPABASE_ANON_KEY;
    globalThis.SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
    globalThis.ALLOWED_ORIGINS          = env.ALLOWED_ORIGINS || '*';

    const url      = new URL(request.url);
    const pathname = url.pathname;
    const method   = request.method.toUpperCase();

    // CORS 预检
    if (method === 'OPTIONS') return handleOptions();

    // 仅处理 /api/* 路径
    if (!pathname.startsWith(API_PREFIX)) {
      return json({ message: 'aquatic-diagnosis API Gateway v0.1.0', docs: '/api/diseases' });
    }

    // ---- 速率限制检查 ----
    const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
    const rateLimitResult = checkRateLimit(clientIp);
    if (!rateLimitResult.allowed) {
      return error('请求过于频繁，请稍后重试', 429);
    }

    // ---- 路由分发 ----
    const segments = getPathSegments(pathname);
    // segments[0] = 'diseases' | 'params' | 'knowledge' | 'diagnose' | 'uploads'
    // segments[1] = ':id' | ':slug' | ':user_id' | undefined

    try {
      switch (segments[0]) {
        case 'diseases': {
          if (segments.length >= 2) {
            // GET /api/diseases/:id
            return await handleGetDisease(segments[1]);
          }
          // GET /api/diseases
          return await handleListDiseases(request);
        }

        case 'params': {
          // GET /api/params
          return await handleListParams(request);
        }

        case 'knowledge': {
          // GET /api/knowledge  or  GET /api/knowledge/:slug
          return await handleKnowledge(segments, request);
        }

        case 'diagnose': {
          // POST /api/diagnose
          if (method !== 'POST') {
            return error('此端点仅支持 POST 方法', 405);
          }
          return await handleDiagnose(request);
        }

        case 'uploads': {
          // GET /api/uploads/:user_id
          if (segments.length < 2) {
            return error('缺少 user_id 参数: /api/uploads/:user_id', 400);
          }
          return await handleGetUploads(segments[1]);
        }

        default: {
          return error(`未知端点: ${segments[0]}`, 404);
        }
      }
    } catch (e) {
      return error(`内部错误: ${e.message}`, 500);
    }
  },
};