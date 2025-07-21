export type Product = {
    id: string;
    keyword: string | null;
    result_image_url: string | null;
    result_text_content: string | null;
    created_at: string;
    '修改后文案': string | null;
    '价格': string | null;
    'ai提取关键词': string | null;
    type: string | null;
    keywords_extracted_at?: string | null;
    is_electronic: boolean;
    '账号分类': string | null;
    '建议投放账号': string | null;
    '上架时间': string | null;
    isPending?: boolean; // Added from page.tsx logic
    user_id?: string; // from page.tsx logic
};

export type Account = {
    id: string;
    name: string;
    description: string;
    created_at: string;
    user_id: string;
    custom_copywriting_prompt: string;
    business_description: string;
    keywords: string[];
};

export type Deployment = {
    id: number;
    product_id: string;
    account_id: string;
    created_at: string;
    account_name: string;
}; 