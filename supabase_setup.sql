-- 1. 建立樂譜索引表 (我的樂譜櫃)
CREATE TABLE IF NOT EXISTS user_scores (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users NOT NULL DEFAULT auth.uid(),
  fingerprint text NOT NULL,
  title text,
  composer text,
  last_viewed timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- 2. 建立標註數據表 (即時標註數據)
CREATE TABLE IF NOT EXISTS annotations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users NOT NULL DEFAULT auth.uid(),
  score_id text NOT NULL,
  layer_id text NOT NULL,
  data jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 3. 開啟兩張表的 RLS 安全防護
ALTER TABLE user_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE annotations ENABLE ROW LEVEL SECURITY;

-- 4. 設定安全政策 (只有擁有者可以讀取與修改自己的資料)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can only access their own scores') THEN
        CREATE POLICY "Users can only access their own scores" 
        ON user_scores FOR ALL USING (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can only access their own annotations') THEN
        CREATE POLICY "Users can only access their own annotations" 
        ON annotations FOR ALL USING (auth.uid() = user_id);
    END IF;
END
$$;

-- 5. 開啟 Realtime (即時同步) 功能
-- 注意：如果已經開啟過可能會報報錯，這段指令會先檢查是否已存在
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'annotations'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE annotations;
    END IF;
  END IF;
END $$;
