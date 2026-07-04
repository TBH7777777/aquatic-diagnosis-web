-- ============================================================
-- aquatic-diagnosis-web | Milestone 1 — 完整建表 SQL
-- 目标数据库: Supabase PostgreSQL (新加坡节点)
-- 执行顺序: schema.sql → rls_policies.sql → seed_data.sql
-- ============================================================

-- 0. 扩展启用 -------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";      -- UUID 生成
CREATE EXTENSION IF NOT EXISTS "pgcrypto";       -- 加密函数（可选备用）

-- ============================================================
-- 1. 鱼病主表 (fish_diseases)
-- ============================================================
CREATE TABLE IF NOT EXISTS fish_diseases (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name_zh         VARCHAR(128)    NOT NULL,                          -- 中文名称
    name_en         VARCHAR(128),                                      -- 英文名称
    name_latin      VARCHAR(256),                                      -- 学名 / 病原体拉丁名
    category        VARCHAR(32)     NOT NULL CHECK (category IN (
                        'bacterial','viral','parasitic','fungal','environmental','nutritional'
                    )),                                                -- 病类：细菌/病毒/寄生虫/真菌/水质/营养
    severity        VARCHAR(16)     NOT NULL DEFAULT 'medium' CHECK (severity IN (
                        'mild','medium','severe','critical'
                    )),                                                -- 严重程度
    description     TEXT            NOT NULL,                          -- 病症描述（Markdown）
    etiology        TEXT,                                              -- 病原与病因
    prevention      TEXT,                                              -- 预防措施
    treatment       TEXT,                                              -- 治疗方法
    applicable_species TEXT,                                           -- 适用鱼种（逗号分隔）
    image_refs      TEXT[] DEFAULT '{}',                               -- 标本图片 R2 URL 列表
    tags            TEXT[] DEFAULT '{}',                               -- 检索标签
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT now()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_diseases_category   ON fish_diseases (category);
CREATE INDEX IF NOT EXISTS idx_diseases_severity   ON fish_diseases (severity);
CREATE INDEX IF NOT EXISTS idx_diseases_name_zh    ON fish_diseases USING gin (to_tsvector('simple', name_zh));
CREATE INDEX IF NOT EXISTS idx_diseases_tags       ON fish_diseases USING gin (tags);

-- 自动更新 updated_at
CREATE OR REPLACE TRIGGER trg_diseases_updated_at
    BEFORE UPDATE ON fish_diseases
    FOR EACH ROW EXECUTE FUNCTION moddatetime('updated_at');

-- 注释
COMMENT ON TABLE  fish_diseases IS '鱼病主表 — 存储各类水产养殖鱼病诊断信息';
COMMENT ON COLUMN fish_diseases.category IS '病类: bacterial|viral|parasitic|fungal|environmental|nutritional';
COMMENT ON COLUMN fish_diseases.severity IS '严重程度: mild|medium|severe|critical';

-- ============================================================
-- 2. 病症关联表 (disease_symptoms)
-- ============================================================
CREATE TABLE IF NOT EXISTS disease_symptoms (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    disease_id      UUID            NOT NULL REFERENCES fish_diseases(id) ON DELETE CASCADE,
    symptom_name    VARCHAR(128)    NOT NULL,                          -- 病症名称
    symptom_desc    TEXT,                                              -- 病症详细描述
    body_part       VARCHAR(32)     CHECK (body_part IN (
                        'body_surface','gills','internal','behavior','eyes','fins','whole_body'
                    )),                                                -- 发病部位
    severity_level  VARCHAR(16)     DEFAULT 'typical' CHECK (severity_level IN (
                        'mild','typical','severe'
                    )),                                                -- 病症严重度
    image_ref       VARCHAR(512),                                      -- 病症示例图片 URL（R2）
    sort_order      SMALLINT        NOT NULL DEFAULT 0,               -- 排序
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_symptoms_disease_id ON disease_symptoms (disease_id);
CREATE INDEX IF NOT EXISTS idx_symptoms_body_part  ON disease_symptoms (body_part);

COMMENT ON TABLE  disease_symptoms IS '病症关联表 — 与鱼病多对一关联';
COMMENT ON COLUMN disease_symptoms.body_part IS '部位: body_surface|gills|internal|behavior|eyes|fins|whole_body';

-- ============================================================
-- 3. 养殖参数表 (aquaculture_params)
-- ============================================================
CREATE TABLE IF NOT EXISTS aquaculture_params (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    param_name      VARCHAR(64)     NOT NULL,                          -- 参数名（溶解氧/pH/氨氮/…）
    param_name_en   VARCHAR(64),                                       -- 英文名
    category        VARCHAR(32)     NOT NULL CHECK (category IN (
                        'physical','chemical','biological','operational'
                    )),
    unit            VARCHAR(16)     NOT NULL,                          -- 单位（mg/L, -, ‰, °C 等）
    optimal_min     NUMERIC(8,3),                                      -- 最适范围下限
    optimal_max     NUMERIC(8,3),                                      -- 最适范围上限
    danger_min      NUMERIC(8,3),                                      -- 危险下限
    danger_max      NUMERIC(8,3),                                      -- 危险上限
    lethal_min      NUMERIC(8,3),                                      -- 致死下限
    lethal_max      NUMERIC(8,3),                                      -- 致死上限
    species_stage   VARCHAR(128),                                      -- 适用鱼种/生长阶段
    measurement_freq VARCHAR(64),                                      -- 建议检测频率
    notes           TEXT,                                              -- 备注说明
    tags            TEXT[] DEFAULT '{}',
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_params_category  ON aquaculture_params (category);
CREATE INDEX IF NOT EXISTS idx_params_name      ON aquaculture_params (param_name);

CREATE OR REPLACE TRIGGER trg_params_updated_at
    BEFORE UPDATE ON aquaculture_params
    FOR EACH ROW EXECUTE FUNCTION moddatetime('updated_at');

COMMENT ON TABLE aquaculture_params IS '养殖参数表 — 水质、环境、操作等关键参数阈值';

-- ============================================================
-- 4. 知识库 (knowledge_base)
-- ============================================================
CREATE TABLE IF NOT EXISTS knowledge_base (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title           VARCHAR(256)    NOT NULL,
    slug            VARCHAR(256)    UNIQUE,                             -- URL 友好标识
    content         TEXT            NOT NULL,                           -- Markdown 正文
    summary         VARCHAR(512),                                      -- 摘要
    category        VARCHAR(32)     NOT NULL CHECK (category IN (
                        'disease_prevention','water_management',
                        'feed_nutrition','breeding_tech',
                        'drug_usage','emergency','general'
                    )),
    tags            TEXT[] DEFAULT '{}',
    source          VARCHAR(256),                                      -- 来源/引用
    author          VARCHAR(128),
    version         SMALLINT        NOT NULL DEFAULT 1,
    is_published    BOOLEAN         NOT NULL DEFAULT true,
    view_count      INTEGER         NOT NULL DEFAULT 0,
    published_at    TIMESTAMPTZ     NOT NULL DEFAULT now(),
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kb_category     ON knowledge_base (category);
CREATE INDEX IF NOT EXISTS idx_kb_published    ON knowledge_base (is_published);
CREATE INDEX IF NOT EXISTS idx_kb_tags         ON knowledge_base USING gin (tags);
CREATE INDEX IF NOT EXISTS idx_kb_title_search ON knowledge_base USING gin (to_tsvector('simple', title));

CREATE OR REPLACE TRIGGER trg_kb_updated_at
    BEFORE UPDATE ON knowledge_base
    FOR EACH ROW EXECUTE FUNCTION moddatetime('updated_at');

COMMENT ON TABLE knowledge_base IS '知识库 — 水产养殖技术文章与参考资料';

-- ============================================================
-- 5. 用户上传记录表 (user_uploads)
-- ============================================================
CREATE TABLE IF NOT EXISTS user_uploads (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID            NOT NULL,                           -- Supabase auth.users 外键
    image_url       VARCHAR(1024)   NOT NULL,                           -- R2 存储的图片 URL
    thumbnail_url   VARCHAR(1024),                                      -- 缩略图 URL
    diagnosis_result JSONB,                                             -- AI 诊断结果 JSON
    -- diagnosis_result 结构示例:
    -- {
    --   "disease_id": "uuid",
    --   "disease_name": "细菌性烂鳃病",
    --   "confidence": 0.87,
    --   "top3_candidates": [...],
    --   "symptoms_detected": [...],
    --   "recommendation": "建议使用..."
    -- }
    ai_model_version VARCHAR(32),                                       -- 使用的 AI 模型版本
    confidence      NUMERIC(4,3) CHECK (confidence >= 0 AND confidence <= 1),
    user_feedback   JSONB,                                              -- 用户反馈纠错
    -- { "is_correct": true/false, "actual_disease": "...", "notes": "..." }
    status          VARCHAR(16)     NOT NULL DEFAULT 'pending' CHECK (status IN (
                        'pending','processing','completed','reviewed','rejected'
                    )),
    device_info     JSONB,                                              -- 设备信息（可选）
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT now()
);

-- RLS 核心依赖: user_id 索引 (按用户查询自己的记录)
CREATE INDEX IF NOT EXISTS idx_uploads_user_id   ON user_uploads (user_id);
CREATE INDEX IF NOT EXISTS idx_uploads_status    ON user_uploads (status);
CREATE INDEX IF NOT EXISTS idx_uploads_created   ON user_uploads (created_at DESC);

CREATE OR REPLACE TRIGGER trg_uploads_updated_at
    BEFORE UPDATE ON user_uploads
    FOR EACH ROW EXECUTE FUNCTION moddatetime('updated_at');

COMMENT ON TABLE user_uploads IS '用户上传记录 — 图片与 AI 诊断结果';
COMMENT ON COLUMN user_uploads.diagnosis_result IS 'AI诊断JSON: disease_id, disease_name, confidence, top3_candidates, symptoms_detected, recommendation';
COMMENT ON COLUMN user_uploads.user_feedback IS '用户反馈: { is_correct, actual_disease, notes }';

-- ============================================================
-- 6. moddatetime 触发器函数 (如未内建)
-- ============================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc WHERE proname = 'moddatetime'
    ) THEN
        CREATE OR REPLACE FUNCTION moddatetime()
        RETURNS TRIGGER AS $func$
        BEGIN
            NEW.updated_at = now();
            RETURN NEW;
        END;
        $func$ LANGUAGE plpgsql;
    END IF;
END
$$;