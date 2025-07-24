export type ScheduledProduct = {
    id: string;
    scheduled_at: string;
    isPlaceholder?: boolean;
};

export type AiGeneratedAccount = {
    name: string;
    xhs_account?: string;
    xianyu_account?: string;
    phone_model?: string;
    business_description: string;
    english_keywords: string[];
};

export type AccountKeywords = {
    id: number; // <-- Add ID for editing/deleting
    account_name: string;
    keyword: string;
    search_history: { count: number; timestamp: string }[] | null;
};

export type KeywordSearchHistory = {
    id: number;
    created_at: string;
    keyword_id: number;
    operating_browser_account_name: string | null;
    search_started_at: string;
    search_completed_at: string | null;
    status: string;
    ai_approved_count: number;
    log_details: string | null;
    total_items_found: number;
    filter_passed_count: number;
};

export type Product = {
  id: string; // Corrected type
    keyword: string | null;
    result_image_url: string | null;
    result_text_content: string | null;
  is_electronic: boolean | null;
    created_at: string;
    '修改后文案': string | null;
    '价格': string | null;
    'ai提取关键词': string | null;
    type: string | null;
    '账号分类': string | null;
    '建议投放账号': string | null;
    '上架时间': string | null;
  keywords_extracted_at?: string | null;
  product_url?: string | null; // The URL for the product on Xianyu
  isPending?: boolean; // Add isPending to the product type
  isDeployedToThisAccount?: boolean; // Temporary flag for sorting
};

export type StatsHistoryItem = {
    likes: number;
    saves: number;
    views: number;
    shares: number;
    comments: number;
    crawled_at: string;
};

export type PublishedNote = {
    note_id: string;
    account_name: string | null;
    note_url: string | null;
    title: string | null;
    published_at: string | null;
    image_url: string | null;
    views: number | null;
    comments: number | null;
    likes: number | null;
    saves: number | null;
    shares: number | null;
    last_crawled_at: string | null;
    created_at: string;
    stats_history: StatsHistoryItem[] | null;
};

export type ProductSchedule = {
    id: string; // UUID
  product_id: string; // Corrected type
    account_name: string;
  status: string;
};

export type Account = {
    name: string;
    created_at: string;
  updated_at: string;
  display_order?: number | null;
  '待上架': (string | ScheduledProduct)[] | null;
  '已上架': { id: string | number; '上架时间': string }[] | null;
  '已上架json'?: { id: string | number; '上架时间': string }[] | null;
  '关键词prompt': string | null;
  '业务描述': string | null;
  '文案生成prompt': string | null;
  xhs_account: string | null;
  '闲鱼账号': string | null;
  '手机型号': string | null;
  'xhs_头像': string | null;
  keywords?: string | null;
  scheduling_rule?: { items_per_day: number } | null;
  todays_schedule?: ScheduledProduct[] | null;
  today_new_products?: number;
  isPending?: boolean;
};

export type Deployment = {
    id: number;
    product_id: string;
    account_id: string;
    created_at: string;
    account_name: string;
}; 