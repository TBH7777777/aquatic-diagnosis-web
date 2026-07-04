/**
 * aquatic-diagnosis-web | 前端主入口
 * Milestone1 — 骨架版本，后续里程碑扩展完整功能
 */

// API Gateway 地址 — 部署后替换为实际 Worker URL
const API_BASE = 'https://api-gateway.your-worker.workers.dev';

/**
 * 测试 API 连通性
 */
async function testApi() {
  const resultEl = document.getElementById('api-result');
  resultEl.style.display = 'block';
  resultEl.textContent = '正在请求 /api/diseases ...';

  try {
    const res = await fetch(`${API_BASE}/api/diseases?limit=5`);
    const data = await res.json();
    resultEl.textContent = JSON.stringify(data, null, 2);
  } catch (e) {
    resultEl.textContent = `❌ 请求失败:\n${e.message}\n\n请确认:\n1. Worker 已部署\n2. API_BASE 地址正确\n3. wrangler.toml 中 SUPABASE_URL 已配置`;
  }
}

// 页面加载完成
document.addEventListener('DOMContentLoaded', () => {
  console.log('🐟 水产智能诊断系统 v0.1.0 已就绪');
  console.log('API Gateway:', API_BASE);
});