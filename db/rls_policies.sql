-- ============================================================
-- aquatic-diagnosis-web | RLS 行级安全权限配置
-- 依赖: schema.sql 已先行执行
-- 角色说明:
--   anon         — 匿名用户（前端公开访问）
--   authenticated — 已登录用户
--   service_role — 服务端全权限（Worker 使用）
-- ============================================================

-- ============================================================
-- 0. 所有表启用 RLS
-- ============================================================
ALTER TABLE fish_diseases     ENABLE ROW LEVEL SECURITY;
ALTER TABLE disease_symptoms  ENABLE ROW LEVEL SECURITY;
ALTER TABLE aquaculture_params ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_base   ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_uploads     ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 1. fish_diseases — 公开可读
-- ============================================================
DROP POLICY IF EXISTS "anon_can_read_diseases" ON fish_diseases;
CREATE POLICY "anon_can_read_diseases" ON fish_diseases
    FOR SELECT
    TO anon, authenticated
    USING (true);

-- service_role 不需要额外策略（USING(true) 全覆盖）

-- ============================================================
-- 2. disease_symptoms — 公开可读
-- ============================================================
DROP POLICY IF EXISTS "anon_can_read_symptoms" ON disease_symptoms;
CREATE POLICY "anon_can_read_symptoms" ON disease_symptoms
    FOR SELECT
    TO anon, authenticated
    USING (true);

-- ============================================================
-- 3. aquaculture_params — 公开可读
-- ============================================================
DROP POLICY IF EXISTS "anon_can_read_params" ON aquaculture_params;
CREATE POLICY "anon_can_read_params" ON aquaculture_params
    FOR SELECT
    TO anon, authenticated
    USING (true);

-- ============================================================
-- 4. knowledge_base — 仅公开已发布文章
-- ============================================================
DROP POLICY IF EXISTS "anon_can_read_published_kb" ON knowledge_base;
CREATE POLICY "anon_can_read_published_kb" ON knowledge_base
    FOR SELECT
    TO anon, authenticated
    USING (is_published = true);

-- ============================================================
-- 5. user_uploads — 用户仅操作自己的记录
-- ============================================================

-- 5a. 用户插入自己的上传记录
DROP POLICY IF EXISTS "user_can_insert_own_uploads" ON user_uploads;
CREATE POLICY "user_can_insert_own_uploads" ON user_uploads
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- 5b. 用户读取自己的上传记录
DROP POLICY IF EXISTS "user_can_read_own_uploads" ON user_uploads;
CREATE POLICY "user_can_read_own_uploads" ON user_uploads
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- 5c. 用户更新自己的上传记录（如提交反馈）
DROP POLICY IF EXISTS "user_can_update_own_uploads" ON user_uploads;
CREATE POLICY "user_can_update_own_uploads" ON user_uploads
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- 5d. 用户不可删除记录（保留数据完整性）
-- 如需删除权限，由 service_role 处理

-- ============================================================
-- 6. service_role 全权限（USING true 绕过所有 RLS）
--    这是 Supabase 内建行为，无需显式声明策略。
--    但为了文档清晰，以下注释说明：
--
--    service_role 在 Supabase 中自动绕过 RLS，对以上所有表
--    拥有 SELECT / INSERT / UPDATE / DELETE 全权限。
--    Cloudflare Worker 使用 service_role key 调用时即拥有此权限。
-- ============================================================

-- ============================================================
-- 7. 验证查询（可选执行确认）
-- ============================================================
-- SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
-- FROM pg_policies
-- WHERE schemaname = 'public'
-- ORDER BY tablename, cmd;