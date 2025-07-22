'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';

import Image from 'next/image';
import ProductCard from '@/components/ProductCard'; // Import the new component

// --- Environment Variables --- 
const supabaseUrl = 'https://urfibhtfqgffpanpsjds.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVyZmliaHRmcWdmZnBhbnBzamRzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzU3ODU2NDUsImV4cCI6MjA1MTM2MTY0NX0.Q1WPGBj23uSL3RKhYxGhs7Si1_HfrvC9P-JxkXl6eVE';
const geminiApiKey = "AIzaSyApuy_ax9jhGXpUdlgI6w_0H5aZ7XiY9vU";

const deepseekApiKey = 'sk-78a9fd015e054281a3eb0a0712d5e6d0';
const deepseekApiUrl = 'https://api.deepseek.com/chat/completions';

if (!supabaseUrl || !supabaseAnonKey || !geminiApiKey) {
    console.error("Supabase or Gemini environment variables are not set!");
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);
const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite-preview-06-17:generateContent?key=${geminiApiKey}`;

// --- Helper Functions ---
const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error) return error.message;
    return String(error);
};

// --- Keyword Management Helper ---
const handleSaveKeywordsToAccount = async (accountName: string, keywords: string[]) => {
    const keywordsToAdd = keywords.map(k => k.trim()).filter(Boolean);
    if (keywordsToAdd.length === 0) {
        alert("没有要保存的关键词。");
        return;
    }

    try {
        // Fetch existing keywords to avoid duplicates
        const { data: existingKeywords, error: fetchKwError } = await supabase
            .from('important_keywords_本人')
            .select('keyword')
            .eq('account_name', accountName);

        if (fetchKwError) throw fetchKwError;

        const existingKeywordSet = new Set(existingKeywords.map(k => k.keyword));
        const newUniqueKeywords = keywordsToAdd.filter(k => !existingKeywordSet.has(k));

        if (newUniqueKeywords.length > 0) {
            const newKeywordRows = newUniqueKeywords.map(kw => ({
                account_name: accountName,
                keyword: kw
            }));
            const { error: insertKwError } = await supabase
                .from('important_keywords_本人')
                .insert(newKeywordRows);

            if (insertKwError) throw insertKwError;
            
            alert(`成功向 ${accountName} 添加了 ${newUniqueKeywords.length} 个新关键词！`);
            // The fetchAccounts() call will be triggered by the caller to refresh UI
        } else {
            alert("所有关键词都已存在于此账号的列表中。");
        }
    } catch (error) {
        console.error(`Failed to save keywords for account ${accountName}:`, getErrorMessage(error));
        alert(`保存关键词到账号列表失败: ${getErrorMessage(error)}`);
    }
};

const callAIApiWithFallback = async (prompt: string): Promise<string> => {
    // 1. Try Gemini First
    try {
        console.log("Attempting to call Gemini API...");
        const res = await fetch(geminiApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        if (!res.ok) {
            const errorData = await res.json();
            throw new Error(`Gemini API Error: ${getErrorMessage(errorData.error)}`);
        }
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) {
            throw new Error("Gemini API returned an empty response.");
        }
        console.log("Successfully received response from Gemini.");
        return text;
    } catch (geminiError) {
        console.warn(`Gemini API call failed: ${getErrorMessage(geminiError)}`);
        console.log("Falling back to DeepSeek API...");

        // 2. Fallback to DeepSeek
        try {
            const res = await fetch(deepseekApiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${deepseekApiKey}`
                },
                body: JSON.stringify({
                    model: "deepseek-chat",
                    messages: [{ role: "user", content: prompt }]
                })
            });
            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(`DeepSeek API Error: ${getErrorMessage(errorData.error)}`);
            }
            const data = await res.json();
            const text = data.choices?.[0]?.message?.content;
            if (!text) {
                throw new Error("DeepSeek API returned an empty response.");
            }
            console.log("Successfully received response from DeepSeek.");
            return text;
        } catch (deepseekError) {
            console.error(`DeepSeek API call also failed: ${getErrorMessage(deepseekError)}`);
            throw new Error(`Both Gemini and DeepSeek APIs failed. Last error: ${getErrorMessage(deepseekError)}`);
        }
    }
};

// --- Type Definitions ---
type ScheduledProduct = {
    id: string;
    scheduled_at: string;
    isPlaceholder?: boolean;
};

type Account = {
  name: string;
    created_at: string;
  updated_at: string;
  display_order?: number | null;
  '待上架': (string | ScheduledProduct)[] | null;
  '已上架': { id: string | number; '上架时间': string }[] | null;
  '已上架json'?: { id: string | number; scheduled_at: string }[] | null;
  '关键词prompt': string | null;
  '业务描述': string | null;
  '文案生成prompt': string | null; // New field for custom prompt per account
  xhs_account: string | null;
  '闲鱼账号': string | null;
  '手机型号': string | null;
  'xhs_头像': string | null;
  keywords?: string | null; // <-- Add keywords property
  scheduling_rule?: { items_per_day: number } | null; // For the new scheduling rule
  todays_schedule?: ScheduledProduct[] | null; // For displaying today's generated schedule
  today_new_products?: number; // For the new count on the main page
  isPending?: boolean; // Add isPending to the product type
};

type AccountKeywords = {
    id: number; // <-- Add ID for editing/deleting
    account_name: string;
    keyword: string;
};

type KeywordSearchHistory = {
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

type Product = {
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
  isPending?: boolean; // Add isPending to the product type
};

type ProductSchedule = {
    id: string; // UUID
  product_id: string; // Corrected type
    account_name: string;
  status: string;
};

type AiGeneratedAccount = {
    name: string;
    xhs_account?: string;
    xianyu_account?: string;
    phone_model?: string;
    business_description: string;
    english_keywords: string[];
};


// --- Helper Components ---
const TagList: React.FC<{ 
    title: string; 
    items: (string | number | ScheduledProduct | { id: string | number; '上架时间': string })[] | null; 
    color: string;
    accountName: string;
    arrayKey: keyof Account;
    onDeleteItem: (accountName: string, arrayKey: keyof Account, item: string) => void;
    schedulePreview?: ScheduledProduct[] | null;
    layout?: 'horizontal' | 'vertical';
    deployedIds?: (string | number)[] | null;
    // Props for editing schedule time
    editingSchedule?: { accountName: string; id: string; newTime: string } | null;
    setEditingSchedule?: (editState: { accountName: string; id: string; newTime: string } | null) => void;
    onUpdateTime?: (accountName: string, itemId: string, newTime: string) => void;
}> = ({ title, items, color, accountName, arrayKey, onDeleteItem, schedulePreview, layout = 'horizontal', deployedIds = [], editingSchedule, setEditingSchedule, onUpdateTime }) => {
    const renderItems = () => {
        let displayItems = items;
        if (schedulePreview && schedulePreview.length > 0) {
            displayItems = schedulePreview;
        }

        if (!displayItems || displayItems.length === 0) {
            return <span className="text-xs text-gray-500 dark:text-gray-400">无</span>;
        }

        // Helper to format date for datetime-local input
        const formatForInput = (isoDate: string) => {
            const d = new Date(isoDate);
            const pad = (num: number) => String(num).padStart(2, '0');
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
        };

        return displayItems.map((item, index) => {
            // Handle placeholders in '待上架'
            if (typeof item === 'object' && item !== null && (item as ScheduledProduct).isPlaceholder) {
                const placeholder = item as ScheduledProduct;
                return (
                    <div key={`placeholder-${index}`} className="w-full text-xs font-mono bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border border-dashed border-gray-400 dark:border-gray-600 px-2 py-1.5 rounded-md">
                        <span>{placeholder.id}</span>
                        <span className="float-right font-sans"> (预计 @ {new Date(placeholder.scheduled_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })})</span>
                    </div>
                );
            }
            
            // Handle new '已上架' JSON format
            if (typeof item === 'object' && item !== null && '上架时间' in item) {
                const deployedItem = item as { id: string | number; '上架时间': string };
                const displayTime = new Date(deployedItem['上架时间']).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

                 return (
                    <span key={index} className={`inline-flex items-center px-2 py-1 rounded text-sm font-mono bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300 group/tag`}>
                        ID: {deployedItem.id} @ {displayTime}
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onDeleteItem(accountName, arrayKey, String(deployedItem.id));
                            }}
                            className="ml-1.5 p-1 text-2xl leading-none opacity-0 group-hover/tag:opacity-100 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-200 focus:opacity-100 transition-opacity"
                            aria-label={`Remove ${deployedItem.id}`}
                        >
                            &times;
                        </button>
                    </span>
                );
            }

            // Handle simple string/number items (for '待上架' list before scheduling, etc.)
            if (typeof item !== 'object') {
                 return (
                    <span key={index} className={`inline-flex items-center px-2 py-1 rounded text-sm font-mono bg-${color}-100 dark:bg-${color}-900/50 text-${color}-800 dark:text-${color}-300 group/tag`}>
                        {item}
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onDeleteItem(accountName, arrayKey, String(item));
                            }}
                            className="ml-1.5 p-1 text-2xl leading-none opacity-0 group-hover/tag:opacity-100 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-200 focus:opacity-100 transition-opacity"
                            aria-label={`Remove ${item}`}
                        >
                            &times;
                        </button>
                    </span>
                );
            }

            // Handle '待上架' scheduled items
            const scheduledItem = item as ScheduledProduct;
            const isDeployed = deployedIds?.some(id => String(id) === String(scheduledItem.id));
            const displayTime = new Date(scheduledItem.scheduled_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
            
            const itemColor = isDeployed ? 'green' : color;
            const isEditing = editingSchedule?.id === scheduledItem.id && editingSchedule?.accountName === accountName;

            if (isEditing) {
                 return (
                    <div key={index} className="w-full flex items-center gap-2 p-1.5 bg-blue-200 dark:bg-blue-900/70 rounded-md">
                        <strong className="font-mono text-xs">ID: {scheduledItem.id}</strong>
                        <input
                            type="datetime-local"
                            value={formatForInput(editingSchedule!.newTime)}
                            onChange={(e) => {
                                e.stopPropagation();
                                setEditingSchedule!({ ...editingSchedule!, newTime: e.target.value })
                            }}
                            className="flex-grow p-1 border rounded-md text-xs font-mono bg-white dark:bg-gray-700 dark:border-gray-600"
                            autoFocus
                            onClick={e => e.stopPropagation()}
                        />
                        <button onClick={(e) => { e.stopPropagation(); onUpdateTime!(accountName, scheduledItem.id, editingSchedule!.newTime); }} className="text-sm font-bold text-green-600 hover:text-green-700">保存</button>
                        <button onClick={(e) => { e.stopPropagation(); setEditingSchedule!(null); }} className="text-sm text-gray-600 hover:text-gray-800">取消</button>
                    </div>
                );
            }

            return (
                <div key={index} className={`w-full flex justify-between items-center px-2 py-1.5 rounded-md text-xs font-mono bg-${itemColor}-100 dark:bg-${itemColor}-900/50 text-${itemColor}-800 dark:text-${itemColor}-300 group/tag`}>
                    <span><strong>ID: {scheduledItem.id}</strong> @ {displayTime}</span>
                    <div className="flex items-center gap-1.5 opacity-0 group-hover/tag:opacity-100 transition-opacity">
                        {isDeployed && (
                            <span className="font-sans font-bold text-xs pr-2">✅ 已上架</span>
                        )}

                        {onUpdateTime && setEditingSchedule && (
                             <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingSchedule({ accountName, id: scheduledItem.id, newTime: scheduledItem.scheduled_at });
                                }}
                                className="p-1 text-lg leading-none rounded-full text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200"
                                aria-label={`Edit time for ${scheduledItem.id}`}
                            >
                                ✏️
                            </button>
                        )}
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onDeleteItem(accountName, arrayKey, String(scheduledItem.id));
                            }}
                            className="p-1.5 text-2xl leading-none rounded-full text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-200"
                            aria-label={`Remove ${scheduledItem.id}`}
                        >
                            &times;
                        </button>
                    </div>
                </div>
            );
        });
    };
    
    const containerClasses = layout === 'vertical' 
        ? "flex flex-col gap-1.5" 
        : "flex flex-wrap gap-1";


    return (
        <div>
            <h4 className={`font-semibold text-sm mb-1 text-${color}-600 dark:text-${color}-400`}>{title} ({items?.length || 0})</h4>
            <div className={containerClasses}>
                {renderItems()}
            </div>
        </div>
    );
};

// --- Main Page Component ---
export default function AccountsPage() {
    // --- Authentication State ---
    const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
    const [passwordInput, setPasswordInput] = useState<string>('');
    const [authError, setAuthError] = useState<string | null>(null);

    const [now, setNow] = useState(() => new Date());

    // State for accounts
    const [allAccounts, setAllAccounts] = useState<Account[]>([]); 
    const [loadingAccounts, setLoadingAccounts] = useState<boolean>(true);
    const [errorAccounts, setErrorAccounts] = useState<string | null>(null);
    const [newAccountName, setNewAccountName] = useState<string>('');
    const [newXhsAccount, setNewXhsAccount] = useState<string>('');
    const [newXianyuAccount, setNewXianyuAccount] = useState<string>('');
    const [newPhoneModel, setNewPhoneModel] = useState<string>('');
    const [isAddingAccount, setIsAddingAccount] = useState<boolean>(false); 
    const [deletingAccount, setDeletingAccount] = useState<string | null>(null); 
    const [isAddAccountModalOpen, setIsAddAccountModalOpen] = useState<boolean>(false);
    const [isAiAddAccountModalOpen, setIsAiAddAccountModalOpen] = useState<boolean>(false);
    const [aiBatchInput, setAiBatchInput] = useState<string>('');
    const [isAiAddingAccounts, setIsAiAddingAccounts] = useState<boolean>(false);
    const [editingAccount, setEditingAccount] = useState<Account | null>(null); // State for the account settings modal
    const [editingSchedule, setEditingSchedule] = useState<{ accountName: string; id: string; newTime: string } | null>(null);
    const [timeFilter, setTimeFilter] = useState<string>('all');
    const [isAnalysisModalOpen, setIsAnalysisModalOpen] = useState(false);
    const [analysisResult, setAnalysisResult] = useState('');
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisCount, setAnalysisCount] = useState<number>(10);
    
    // State for Keywords and Prompts
    const [editingKeywords, setEditingKeywords] = useState<{ [key: string]: string }>({});
    const [editingKeywordPrompts, setEditingKeywordPrompts] = useState<{ [key: string]: string }>({});
    const [editingBusinessPrompts, setEditingBusinessPrompts] = useState<{ [key: string]: string }>({});
    const [editingCopywritingPrompts, setEditingCopywritingPrompts] = useState<{ [key: string]: string }>({}); // New state for copywriting prompt
    const [editingXhs, setEditingXhs] = useState<{ [key: string]: string }>({});
    const [editingXianyu, setEditingXianyu] = useState<{ [key: string]: string }>({});
    const [editingPhone, setEditingPhone] = useState<{ [key:string]: string }>({});
    const [loadingStates, setLoadingStates] = useState<{ [key: string]: { ai: boolean; saveKeywords: boolean; saveKwPrompt: boolean; saveBizPrompt: boolean; saveCopyPrompt: boolean; saveRule: boolean; } }>({}); // Add saveRule
    const [editingRules, setEditingRules] = useState<{ [key: string]: { items_per_day: number | '' } }>({});
    // const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set()); // This is now replaced by the modal
    // const [schedules, setSchedules] = useState<{ [accountName: string]: {
    //     itemsPerDay: number;
    //     generatedSchedule: ScheduledProduct[] | null;
    // } }>({}); // Removed as it's no longer used


    // State for products of a selected account
    const [selectedAccountForProducts, setSelectedAccountForProducts] = useState<Account | null>(null);
    const [products, setProducts] =useState<Product[]>([]);
    const [loadingProducts, setLoadingProducts] = useState<boolean>(false);
    const [errorProducts, setErrorProducts] = useState<string | null>(null);

    // State for keywords of a selected account
    const [selectedAccountForKeywords, setSelectedAccountForKeywords] = useState<Account | null>(null);
    const [keywordsForEditing, setKeywordsForEditing] = useState<AccountKeywords[]>([]);
    const [loadingKeywords, setLoadingKeywords] = useState<boolean>(false);
    const [errorKeywords, setErrorKeywords] = useState<string | null>(null);
    const [keywordHistories, setKeywordHistories] = useState<KeywordSearchHistory[]>([]);
    const [isBatchGeneratingKeywords, setIsBatchGeneratingKeywords] = useState<boolean>(false);


    // State for AI Prompt (No longer global, will be per-account)
    // const [globalPrompt, setGlobalPrompt] = useState<string>('');
    // const [loadingPrompt, setLoadingPrompt] = useState<boolean>(true);
    // const [savingPrompt, setSavingPrompt] = useState<boolean>(false);
    // const [promptError, setPromptError] = useState<string | null>(null);
    const [productSchedules, setProductSchedules] = useState<ProductSchedule[]>([]);


    // --- Authentication Logic ---
    useEffect(() => {
        // Check session storage to see if user is already authenticated
        if (sessionStorage.getItem('isAuthenticated') === 'true') {
            setIsAuthenticated(true);
        }
    }, []);

    useEffect(() => {
        const interval = setInterval(() => {
            setNow(new Date());
        }, 30 * 1000); // Update every 30 seconds
        return () => clearInterval(interval);
    }, []);

    const handlePasswordSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        // Simple password check, replace with a more secure method for production
        if (passwordInput === '11111111') {
            sessionStorage.setItem('isAuthenticated', 'true'); // Persist auth state
            setIsAuthenticated(true);
            setAuthError(null);
            setPasswordInput('');
        } else {
            setAuthError('密码错误，请重试。');
        }
    };


    // --- Data Fetching ---
    const fetchAccounts = useCallback(async () => {
        setLoadingAccounts(true);
        setErrorAccounts(null);
        try {
            // Fetch accounts, keywords, and all products in parallel
            const [accountsPromise, keywordsPromise, productsPromise] = await Promise.all([
                 supabase
                    .from('accounts_duplicate')
                    .select('name, created_at, updated_at, "待上架", "已上架json", "关键词prompt", "业务描述", "文案生成prompt", "xhs_account", "闲鱼账号", "手机型号", "scheduling_rule", "xhs_头像", "display_order"')
                    .order('display_order', { ascending: true })
                    .order('name', { ascending: true }),
                 supabase.from('important_keywords_本人').select('id, account_name, keyword'),
                 supabase.from('search_results_duplicate_本人').select('type, created_at') // Fetch only necessary fields for counting
            ]);
            
            const { data: accounts, error: accountsError } = accountsPromise;
            if (accountsError) throw accountsError;

            const { data: keywordsData, error: keywordsError } = keywordsPromise;
            if (keywordsError) throw keywordsError;

            const { data: productsData, error: productsError } = productsPromise;
            if (productsError) throw productsError;

            // --- Pre-calculate today's new products for each account ---
            const today = new Date();
            const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
            const newProductsCountMap = new Map<string, number>();

            for (const product of productsData) {
                if (new Date(product.created_at) >= startOfToday) {
                    const currentCount = newProductsCountMap.get(product.type!) || 0;
                    newProductsCountMap.set(product.type!, currentCount + 1);
                }
            }

            // Group keywords by account_name
            const keywordsMap = new Map<string, string[]>();
            for (const kw of keywordsData) {
                if (!keywordsMap.has(kw.account_name)) {
                    keywordsMap.set(kw.account_name, []);
                }
                keywordsMap.get(kw.account_name)!.push(kw.keyword);
            }

            const defaultKeywordPrompt = '你是一个关键词生成工具。请为我生成5到10个相关的中文推广关键词。严格遵守以下规则：1. 只返回关键词本身。2. 每个关键词占一行。3. 禁止添加任何编号、符号、解释或无关的对话。';

            // Merge keywords into accounts and initialize editing state
            const mergedAccounts = accounts.map(acc => {
                const defaultBusinessPrompt = `我的业务是推广名为"${acc.name}"的社交媒体账号，用于发布相关内容以吸引客户。`;
                const defaultCopywritingPrompt = `修改文案，请保留关键词！不要谄媚，不要口水话，直入关键点，使其，更简洁、突出关键词，去掉敏感词汇。 不能出现脏话。敏感词。1.不能出现下面词汇：指dao答yi、答疑、中介勿扰、账号、基本没怎么用过、标价出！可以直接拍下！、电子资料售出不退不换！、不退换、拍下秒发、使用痕迹等相似词汇。                                                            2.重复检查一轮，以空格或标点为边界，删掉同时带有"退""换"两字的句子 3.删掉中文或者英文国家地名比如澳洲AU，英国UK,香港HK等等。4. 如果既有词汇 题目，又有词汇 答案 （形式如 "题目 & 答案""题目和答案"等），用"Q&A"代替 5.敏感词汇如 答案用answer替换。6.删掉最新，最好等等字体。7.删掉价格。8.排列一下文案更美观。9. 不要markdown格式符号。10.不能出现"商品信息"、"关键词"等字体。11.递归检查，不要出现"*"这个符号。12.拼写检查，删除汉字专有名词内的空格，删除英文单字内的空格。13.为文案生成 #+关键词，要求围绕业务和文案弄8个左右。14.要围绕原始文案关键词改写 不能把他的关键业务删除。15.结尾添加欢迎私信咨询，`;
                const joinedKeywords = (keywordsMap.get(acc.name) || []).join('\n');
                
                // --- Data Reconciliation ---
                // Allow products to be re-scheduled even if already in '已上架'
                const rawPendingProducts = (acc as Account)['待上架'] || [];
                const cleanPendingProducts = rawPendingProducts;
                
                // --- Generate Today's Schedule Preview ---
                let todays_schedule: ScheduledProduct[] | null = null;
                const rule = (acc as Account).scheduling_rule;

                if (rule && rule.items_per_day > 0) {
                    const now = new Date();

                    // 1. Get existing future-scheduled items and unscheduled IDs
                    const futureScheduledItems = (cleanPendingProducts.filter(item =>
                        typeof item === 'object' && item !== null && item.scheduled_at && new Date(item.scheduled_at) > now
                    ) as ScheduledProduct[]).sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());

                    const unscheduledIds = cleanPendingProducts
                        .filter(item => typeof item === 'string')
                        .sort() as string[]; // Sort for deterministic order

                    const finalSchedule: ScheduledProduct[] = [...futureScheduledItems];
                    const unscheduledIdsQueue = [...unscheduledIds]; // Create a mutable queue

                    // 2. Determine the starting time for filling empty slots
                    const intervalMillis = (24 * 60 / rule.items_per_day) * 60 * 1000;
                    let nextScheduleTime: number;

                    const lastScheduledItem = finalSchedule.length > 0 ? finalSchedule[finalSchedule.length - 1] : null;

                    if (lastScheduledItem) {
                        // Schedule relative to the last existing item
                        nextScheduleTime = new Date(lastScheduledItem.scheduled_at).getTime() + intervalMillis;
                    } else {
                        // First item, schedule it predictably
                        nextScheduleTime = now.getTime() + 10 * 60 * 1000; // 10 mins from now
                    }
                    
                    // Ensure the first new item is not in the past
                    if (nextScheduleTime < now.getTime()) {
                        nextScheduleTime = now.getTime() + 10 * 60 * 1000;
                    }
                    
                    // 3. Fill the schedule up to the desired number of items
                    const placeholderBaseIndex = finalSchedule.filter(item => item.isPlaceholder).length;
                    let placeholderCounter = 1;
                    
                    while (finalSchedule.length < rule.items_per_day) {
                        const nextProductId = unscheduledIdsQueue.shift();

                        if (nextProductId) {
                            // Add a real product
                        finalSchedule.push({
                                id: nextProductId,
                                scheduled_at: new Date(nextScheduleTime).toISOString(),
                            isPlaceholder: false,
                        });
                        } else {
                            // Add a placeholder
                            finalSchedule.push({
                                id: `待定商品 ${placeholderBaseIndex + placeholderCounter}`,
                                scheduled_at: new Date(nextScheduleTime).toISOString(),
                                isPlaceholder: true,
                            });
                            placeholderCounter++;
                        }
                        nextScheduleTime += intervalMillis;
                    }
                    
                    // 4. Sort and assign
                    finalSchedule.sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
                    todays_schedule = finalSchedule;
                }
                // --- End of Schedule Generation ---

                return {
                    ...acc,
                    '待上架': cleanPendingProducts, // Use the reconciled list
                    '已上架': acc['已上架json'], // Use the new JSON field for the "已上架" display
                    keywords: joinedKeywords,
                    '关键词prompt': acc['关键词prompt'] || defaultKeywordPrompt,
                    '业务描述': acc['业务描述'] || defaultBusinessPrompt,
                    '文案生成prompt': acc['文案生成prompt'] || defaultCopywritingPrompt, // Set default
                    todays_schedule: todays_schedule, // Attach today's schedule
                    today_new_products: newProductsCountMap.get(acc.name) || 0, // Add the new count
                };
            });

            const initialEditingKeywords: { [key: string]: string } = {};
            const initialKeywordPrompts: { [key: string]: string } = {};
            const initialBusinessPrompts: { [key: string]: string } = {};
            const initialCopywritingPrompts: { [key: string]: string } = {}; // New state init
            const initialXhs: { [key: string]: string } = {};
            const initialXianyu: { [key: string]: string } = {};
            const initialPhone: { [key: string]: string } = {};
            const initialRules: { [key: string]: { items_per_day: number | '' } } = {};

            mergedAccounts.forEach(acc => {
                initialEditingKeywords[acc.name] = acc.keywords || '';
                initialKeywordPrompts[acc.name] = acc['关键词prompt']!;
                initialBusinessPrompts[acc.name] = acc['业务描述']!;
                initialCopywritingPrompts[acc.name] = acc['文案生成prompt']!; // Initialize state
                initialXhs[acc.name] = acc.xhs_account || '';
                initialXianyu[acc.name] = acc['闲鱼账号'] || '';
                initialPhone[acc.name] = acc['手机型号'] || '';
                initialRules[acc.name] = { items_per_day: (acc as Account).scheduling_rule?.items_per_day || '' };
            });
            
            setAllAccounts(mergedAccounts as Account[]);
            setEditingKeywords(initialEditingKeywords);
            setEditingKeywordPrompts(initialKeywordPrompts);
            setEditingBusinessPrompts(initialBusinessPrompts);
            setEditingCopywritingPrompts(initialCopywritingPrompts); // Set new state
            setEditingXhs(initialXhs);
            setEditingXianyu(initialXianyu);
            setEditingPhone(initialPhone);
            setEditingRules(initialRules);

        } catch (err: unknown) {
            setErrorAccounts(`加载账号列表失败: ${getErrorMessage(err)}`);
        } finally {
            setLoadingAccounts(false);
        }
    }, []);

    const fetchProductsForAccount = useCallback(async (accountName: string) => {
        setLoadingProducts(true);
        setErrorProducts(null);
        setProducts([]);
        try {
            const { data, error } = await supabase
                .from('search_results_duplicate_本人')
                .select('*')
                .eq('type', accountName)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setProducts(data as Product[]);
        } catch (err: unknown) {
            setErrorProducts(`加载商品列表失败: ${getErrorMessage(err)}`);
            } finally {
            setLoadingProducts(false);
        }
    }, []);

    const fetchKeywordsForAccount = useCallback(async (accountName: string) => {
        setLoadingKeywords(true);
        setErrorKeywords(null);
        setKeywordsForEditing([]);
        setKeywordHistories([]);
        try {
            const { data, error } = await supabase
                .from('important_keywords_本人')
                .select('id, account_name, keyword')
                .eq('account_name', accountName)
                .order('id', { ascending: true });
            
            if (error) throw error;
            setKeywordsForEditing(data);

            if (data && data.length > 0) {
                const keywordIds = data.map(kw => kw.id);
                const { data: histories, error: historiesError } = await supabase
                    .from('keyword_search_history')
                    .select('*')
                    .in('keyword_id', keywordIds)
                    .order('created_at', { ascending: false });
                
                if (historiesError) throw historiesError;
                setKeywordHistories(histories as KeywordSearchHistory[]);
            }

        } catch(err: unknown) {
            setErrorKeywords(`加载关键词列表失败: ${getErrorMessage(err)}`);
        } finally {
            setLoadingKeywords(false);
        }
    }, []);

    // No longer needed
    // const fetchGlobalPrompt = useCallback(async () => { ... });

    const fetchProductSchedules = useCallback(async () => {
        try {
            const { data, error } = await supabase
                .from('product_schedules')
                .select('*');
            if (error) throw error;
            setProductSchedules(data);
        } catch (error: unknown) {
            console.error("Failed to fetch schedules:", error);
        }
    }, []);

    // --- Initial Data Load (run only after authentication) ---
    useEffect(() => {
        if (isAuthenticated) {
            fetchAccounts();
            // fetchGlobalPrompt(); // Removed
            fetchProductSchedules();
        }
    }, [isAuthenticated, fetchAccounts, fetchProductSchedules]);


    // --- Account Management ---
    const handleAddAccount = async () => {
        // ... (implementation is the same as before)
        const trimmedName = newAccountName.trim();
        if (!trimmedName) {
            alert("请输入要添加的账号名称。");
            return;
        }
        if (allAccounts.some(acc => acc.name === trimmedName)) {
             alert(`账号 "${trimmedName}" 已经存在。`);
            return;
        }

        setIsAddingAccount(true);
        try {
            const defaultKeywordPrompt = '你是一个关键词生成工具。请为我生成5到10个相关的推广关键词。最好是英文,严格遵守以下规则：1. 只返回关键词本身。2. 每个关键词占一行。3. 禁止添加任何编号、符号、解释或无关的对话。';
            const defaultBusinessPrompt = `我的业务是推广名为"${trimmedName}"的社交媒体账号，用于发布相关内容以吸引客户。`;
            const defaultCopywritingPrompt = `修改文案，请保留关键词！不要谄媚，不要口水话，直入关键点，使其，更简洁、突出关键词，去掉敏感词汇。 不能出现脏话。敏感词。1.不能出现下面词汇：指dao答yi、答疑、中介勿扰、账号、基本没怎么用过、标价出！可以直接拍下！、电子资料售出不退不换！、不退换、拍下秒发、使用痕迹等相似词汇。                                                            2.重复检查一轮，以空格或标点为边界，删掉同时带有"退""换"两字的句子 3.删掉中文或者英文国家地名比如澳洲AU，英国UK,香港HK等等。4. 如果既有词汇 题目，又有词汇 答案 （形式如 "题目 & 答案""题目和答案"等），用"Q&A"代替 5.敏感词汇如 答案用answer替换。6.删掉最新，最好等等字体。7.删掉价格。8.排列一下文案更美观。9. 不要markdown格式符号。10.不能出现"商品信息"、"关键词"等字体。11.递归检查，不要出现"*"这个符号。12.拼写检查，删除汉字专有名词内的空格，删除英文单字内的空格。13.为文案生成 #+关键词，要求围绕业务和文案弄8个左右。14.要围绕原始文案关键词改写 不能把他的关键业务删除。15.结尾添加欢迎私信咨询，`;
            const { error } = await supabase
                .from('accounts_duplicate')
                .insert({ 
                    name: trimmedName,
                    '关键词prompt': defaultKeywordPrompt,
                    '业务描述': defaultBusinessPrompt,
                    '文案生成prompt': defaultCopywritingPrompt, // Add new prompt on creation
                    'xhs_account': newXhsAccount.trim() || null,
                    '闲鱼账号': newXianyuAccount.trim() || null,
                    '手机型号': newPhoneModel.trim() || null,
                 });
            if (error) throw error;
            alert(`账号 "${trimmedName}" 添加成功！`);
            fetchAccounts(); 
            setIsAddAccountModalOpen(false); // Close modal on success
            setNewAccountName(''); // Reset input
            setNewXhsAccount('');
            setNewXianyuAccount('');
            setNewPhoneModel('');
        } catch (error: unknown) {
            alert(`添加账号失败: ${getErrorMessage(error)}`);
        } finally {
            setIsAddingAccount(false);
        }
    };

    const handleDeleteAccount = async (accountNameToDelete: string) => {
        // ... (implementation is the same as before)
        if (!confirm(`确定要删除账号 "${accountNameToDelete}"？`)) return;

        setDeletingAccount(accountNameToDelete);
        try {
            const { error } = await supabase
                .from('accounts_duplicate')
                .delete()
                .eq('name', accountNameToDelete);

            if (error) throw error;
            alert(`账号 "${accountNameToDelete}" 删除成功。`);
            fetchAccounts();
        } catch (error: unknown) {
            alert(`删除账号失败: ${getErrorMessage(error)}`);
        } finally {
            setDeletingAccount(null);
        }
    };

    const handleGenerateKeywords = async (accountName: string) => {
        setLoadingStates(prev => ({ ...prev, [accountName]: { ...prev[accountName], ai: true } }));
        
        const keywordGenPrompt = editingKeywordPrompts[accountName] || '';
        const businessInfoPrompt = editingBusinessPrompts[accountName] || '';

        if (!keywordGenPrompt) {
            alert('关键词生成提示词不能为空！');
            setLoadingStates(prev => ({ ...prev, [accountName]: { ...prev[accountName], ai: false } }));
            return;
        }

        const finalPrompt = `
请根据以下信息执行任务:
---
账户名称: "${accountName}"
业务描述: "${businessInfoPrompt}"
---
任务要求: "${keywordGenPrompt}"
        `;

        try {
            const aiText = await callAIApiWithFallback(finalPrompt);

                 // Post-process the AI output to ensure clean, one-keyword-per-line format
                const cleanedText = aiText
                    .split('\n') // Split into lines
                    .map((line: string) => 
                        line
                            .replace(/\*/g, '') // Forcefully remove all asterisks
                            .replace(/^\s*\d+\.\s*/, '') // Remove leading numbers like "1. "
                            .replace(/^\s*[\-]\s*/, '') // Remove leading dashes
                            .replace(/\s*\(.*\)\s*$/, '') // Remove trailing explanations in parentheses
                            .trim() // Trim whitespace
                    )
                    // Filter out empty lines and conversational filler
                    .filter((line: string) => line.length > 0 && !/^\s*(好的|根据您|这里是|以下是)/.test(line)) 
                    .join('\n'); // Join them back with newlines

                setEditingKeywords(prev => ({ ...prev, [accountName]: cleanedText }));
        } catch (e: unknown) {
            alert(`关键词生成失败: ${getErrorMessage(e)}`);
        } finally {
            setLoadingStates(prev => ({ ...prev, [accountName]: { ...prev[accountName], ai: false } }));
        }
    };

    const handleSaveKeywords = async (accountName: string) => {
        setLoadingStates(prev => ({ ...prev, [accountName]: { ...prev[accountName], saveKeywords: true } }));
        
        const keywordsToSave = editingKeywords[accountName]
            .split('\n')
            .map(k => k.trim())
            .filter(k => k.length > 0);

        try {
            // Delete all existing keywords for this account first
            const { error: deleteError } = await supabase
                .from('important_keywords_本人')
                .delete()
                .eq('account_name', accountName);

            if (deleteError) throw deleteError;
            
            // Then, insert the new keywords if there are any
            if (keywordsToSave.length > 0) {
                const newKeywordRows = keywordsToSave.map(kw => ({
                    account_name: accountName,
                    keyword: kw
                }));
                const { error: insertError } = await supabase
                    .from('important_keywords_本人')
                    .insert(newKeywordRows);

                if (insertError) throw insertError;
            }
            
            // Update the "master" list to reflect the saved state
            setAllAccounts(prev => prev.map(acc => 
                acc.name === accountName ? { ...acc, keywords: keywordsToSave.join('\n') } : acc
            ));

            alert('关键词保存成功！');

        } catch (e: unknown) {
            alert(`关键词保存失败: ${getErrorMessage(e)}`);
        } finally {
            setLoadingStates(prev => ({ ...prev, [accountName]: { ...prev[accountName], saveKeywords: false } }));
        }
    };

    const handleSaveAccountField = async (accountName: string, field: '关键词prompt' | '业务描述' | '文案生成prompt' | 'xhs_account' | '闲鱼账号' | '手机型号', value: string) => {
        let stateKey: 'saveKwPrompt' | 'saveBizPrompt' | 'saveCopyPrompt' | 'saveXhs' | 'saveXianyu' | 'savePhone' = 'saveBizPrompt'; // Default, needs to be mapped
        switch(field) {
            case '关键词prompt': stateKey = 'saveKwPrompt'; break;
            case '业务描述': stateKey = 'saveBizPrompt'; break;
            case '文案生成prompt': stateKey = 'saveCopyPrompt'; break;
            // Simplified for assets, can be expanded if needed
            case 'xhs_account': 
            case '闲鱼账号':
            case '手机型号':
                // For now, no specific loading state for these, but can be added
                break;
        }

        setLoadingStates(prev => ({ ...prev, [accountName]: { ...prev[accountName], [stateKey]: true } }));
        
        try {
            const { error } = await supabase
                .from('accounts_duplicate')
                .update({ [field]: value, updated_at: new Date().toISOString() })
                .eq('name', accountName);

            if (error) throw error;

            setAllAccounts(prev => prev.map(acc => 
                acc.name === accountName ? { ...acc, [field]: value } : acc
            ));

            alert('提示词保存成功！');

        } catch (e: unknown) {
            alert(`提示词保存失败: ${getErrorMessage(e)}`);
        } finally {
            setLoadingStates(prev => ({ ...prev, [accountName]: { ...prev[accountName], [stateKey]: false } }));
        }
    };
    
 

    const handleDeleteItemFromArray = async (accountName: string, arrayKey: keyof Account, itemToDelete: string) => {
        // Ensure we only process valid array keys
        const validArrayKeys: (keyof Account)[] = ['待上架', '已上架'];
        if (!validArrayKeys.includes(arrayKey)) {
            console.error("Invalid key passed to handleDeleteItemFromArray:", arrayKey);
            return;
        }

        const confirmed = window.confirm(`确定要从 "${arrayKey}" 列表中删除 "${itemToDelete}" 吗？`);
        if (!confirmed) return;

        const originalAccount = allAccounts.find(acc => acc.name === accountName);
        if (!originalAccount) return;

        // Determine which database field to update based on the arrayKey
        const dbFieldToUpdate = arrayKey === '已上架' ? '已上架json' : '待上架';

        const originalArray = (originalAccount[arrayKey] as (string | { id: string | number })[] | null) || [];
        const newArray = originalArray.filter(item => {
            const id = typeof item === 'string' ? item : (item as { id: string | number })?.id;
            return String(id) !== itemToDelete;
        });

        // Wait for supabase operation before updating UI to ensure consistency
        try {
            const { error } = await supabase
                .from('accounts_duplicate')
                .update({ [dbFieldToUpdate]: newArray, updated_at: new Date().toISOString() })
                .eq('name', accountName);

            if (error) {
                throw error; // Let the catch block handle the error message
            }
            
            // On success, refresh the entire account list to ensure data consistency
            await fetchAccounts();

        } catch (err: unknown) {
            alert(`删除失败: ${getErrorMessage(err)}`);
        }
    };

    const handleKeywordTextChange = (id: number, newText: string) => {
        setKeywordsForEditing(currentKeywords => 
            currentKeywords.map(kw => kw.id === id ? { ...kw, keyword: newText } : kw)
        );
    };

    const handleUpdateKeyword = async (id: number) => {
        const keywordToUpdate = keywordsForEditing.find(kw => kw.id === id);
        if (!keywordToUpdate) return;

        try {
            const { error } = await supabase
                .from('important_keywords_本人')
                .update({ keyword: keywordToUpdate.keyword })
                .eq('id', id);
            
            if (error) throw error;
            alert(`关键词 #${id} 已更新！`);
        } catch (e: unknown) {
            alert(`更新关键词失败: ${getErrorMessage(e)}`);
        }
    };

    const handleDeleteKeywordFromList = async (id: number) => {
        if (!confirm(`确定要删除关键词 #${id} 吗？`)) return;

        try {
             const { error } = await supabase
                .from('important_keywords_本人')
                .delete()
                .eq('id', id);

            if (error) throw error;

            // Optimistically remove from UI
            setKeywordsForEditing(currentKeywords => currentKeywords.filter(kw => kw.id !== id));
        } catch (e: unknown) {
             alert(`删除关键词失败: ${getErrorMessage(e)}`);
        }
    };

    const handleAddNewKeyword = async () => {
        if (!selectedAccountForKeywords) return;
        const newKeywordText = prompt("请输入要添加的新关键词：");

        if (newKeywordText && newKeywordText.trim()) {
            try {
                const { data, error } = await supabase
                    .from('important_keywords_本人')
                    .insert({ account_name: selectedAccountForKeywords.name, keyword: newKeywordText.trim() })
                    .select()
                    .single();
                
                if (error) throw error;

                // Add to UI
                setKeywordsForEditing(current => [...current, data]);

            } catch(e: unknown) {
                alert(`添加关键词失败: ${getErrorMessage(e)}`);
            }
        }
    };

    const handleGenerateRelatedKeywords = async () => {
        if (!selectedAccountForKeywords) return;
        if (keywordsForEditing.length === 0) {
            alert("当前没有关键词可供参考，请先添加一些。");
            return;
        }

        setIsBatchGeneratingKeywords(true);

        const existingKeywordsList = keywordsForEditing.map(kw => kw.keyword).join('\n');
        const prompt = `
    你是一个关键词扩展专家。请根据以下现有关键词列表，生成10到20个新的、高度相关的中文推广关键词。

    ---
    现有关键词列表:
    ${existingKeywordsList}
    ---

    严格遵守以下规则：
    1.  只返回新生成的关键词本身。
    2.  不要重复列表中已有的关键词。
    3.  每个新关键词占一行。
    4.  禁止添加任何编号、符号、解释或无关的对话。
        `;

        try {
            const geminiFlashApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite-preview-06-17:generateContent?key=${geminiApiKey}`;

            const res = await fetch(geminiFlashApiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            });

            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(`Gemini API Error: ${getErrorMessage(errorData.error)}`);
            }

            const data = await res.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

            if (!text) {
                throw new Error("Gemini API returned an empty response.");
            }

            const generatedKeywords = text.split('\n').map((k:string) => k.trim()).filter(Boolean);
            const existingKeywordSet = new Set(keywordsForEditing.map(k => k.keyword));
            const newUniqueKeywords = generatedKeywords.filter((k:string) => !existingKeywordSet.has(k));

            if (newUniqueKeywords.length === 0) {
                alert("AI没有生成新的不重复的关键词。");
                return;
            }

            const newKeywordRows = newUniqueKeywords.map((kw:string) => ({
                account_name: selectedAccountForKeywords.name,
                keyword: kw
            }));

            const { error: insertError } = await supabase
                .from('important_keywords_本人')
                .insert(newKeywordRows);

            if (insertError) throw insertError;

            alert(`成功添加了 ${newUniqueKeywords.length} 个新的AI生成关键词！`);
            await fetchKeywordsForAccount(selectedAccountForKeywords.name); // Refresh the list

        } catch (e) {
            alert(`AI生成关键词失败: ${getErrorMessage(e)}`);
        } finally {
            setIsBatchGeneratingKeywords(false);
        }
    };

    // --- Product Management ---
    const handleDeleteProduct = async (productId: string) => {
        try {
             // Step 1: Find all accounts that have this product in their '待上架' list
            const accountsToUpdate = allAccounts.filter(acc => 
                acc['待上架']?.some(item => {
                    const id = typeof item === 'object' && item !== null ? (item as ScheduledProduct).id : item;
                    return String(id) === String(productId);
                })
            );

            // Step 2: Update all these accounts by removing the product ID
            if (accountsToUpdate.length > 0) {
                const updatePromises = accountsToUpdate.map(account => {
                    const newPendingList = (account['待上架'] || []).filter(item => {
                         const id = typeof item === 'object' && item !== null ? (item as ScheduledProduct).id : item;
                        return String(id) !== String(productId);
                    });
                    
                    return supabase
                        .from('accounts_duplicate')
                        .update({ '待上架': newPendingList })
                        .eq('name', account.name);
                });
                
                const results = await Promise.all(updatePromises);
                const firstErrorResult = results.find(res => res.error);
                if (firstErrorResult && firstErrorResult.error) {
                    throw new Error(`更新账号的待上架列表时出错: ${firstErrorResult.error.message}`);
                }
            }


            // Step 3: Delete the product itself from the main table
            const { error: deleteError } = await supabase
                .from('search_results_duplicate_本人')
                .delete()
                .eq('id', productId);

            if (deleteError) throw deleteError;

            // Step 4: On complete success, update UI state
            setProducts(prev => prev.filter(p => p.id !== productId));
            // Also refresh the accounts list to reflect the change in '待上架'
            fetchAccounts();

        } catch (error: unknown) {
            console.error("Delete product failed:", error);
            // Re-throw to be caught by the card and display an error
            throw new Error(`删除商品失败: ${getErrorMessage(error)}`);
        }
    };

    const handleDuplicateProduct = async (productId: string) => {
        const productToDuplicate = products.find(p => p.id === productId);
        if (!productToDuplicate) {
            alert('错误：找不到要复制的商品。');
            return;
        }

        try {
            // Create a new object, removing database-generated fields
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { id, created_at, ...newProductData } = productToDuplicate;

            const { error } = await supabase
                .from('search_results_duplicate_本人')
                .insert([newProductData])
                .select();
            
            if (error) throw error;
            
            alert(`商品 #${productId} 复制成功！`);
            // Refresh the product list to show the new item
            if (selectedAccountForProducts) {
                fetchProductsForAccount(selectedAccountForProducts.name);
            }

        } catch (err: unknown) {
            alert(`复制商品失败: ${getErrorMessage(err)}`);
        }
    };

    const handleDeployProduct = async (productId: string) => {
        if (!selectedAccountForProducts) {
            alert('错误：没有选中的账号。');
            return;
        }
        
        const account = allAccounts.find(acc => acc.name === selectedAccountForProducts.name);
        if (!account) {
            alert('错误：找不到当前账号的数据。');
            return;
        }

        const productToDeploy = products.find(p => p.id === productId);
        if (!productToDeploy) {
            alert('错误：找不到要投放的商品。');
            return;
        }

        // --- Automatic Keyword Extraction ---
        if (!productToDeploy.keywords_extracted_at) {
            console.log(`Product ${productId} needs keywords. Extracting...`);
            const original_text = productToDeploy.result_text_content || '';
            const businessDescription = account['业务描述'] || '';
            const prompt = `
                请基于以下业务描述和产品文案，提取5-8个最相关的英文关键词。
                要求：
                1.  每个关键词占一行。
                2.  不要添加任何编号、解释或无关文字。
                3.  那些英文关键词是最重要的 不要删除
                ---
                业务描述:
                ${businessDescription}
                ---
                产品文案:
                ${original_text}
                ---
            `;

            try {
                const keywordsText = await callAIApiWithFallback(prompt);
                const keywordsArray = keywordsText.split('\n').map(k => k.trim()).filter(Boolean);

                if (keywordsArray.length > 0) {
                    // 1. Save keywords to the product itself
                    const { error: updateError } = await supabase
                        .from('search_results_duplicate_本人')
                        .update({ 
                            'ai提取关键词': keywordsArray.join('\n'),
                            'keywords_extracted_at': new Date().toISOString() 
                        })
                        .eq('id', productId);
                    if (updateError) throw updateError;
                    
                    // 2. Add keywords to the account's list
                    await handleSaveKeywordsToAccount(account.name, keywordsArray);

                    // 3. Update local state for immediate UI feedback
                    setProducts(prevProducts =>
                        prevProducts.map(p =>
                            p.id === productId
                                ? { ...p, 'ai提取关键词': keywordsArray.join('\n'), 'keywords_extracted_at': new Date().toISOString() }
                                : p
                        )
                    );
                    fetchAccounts(); // Refresh to get latest account keyword count
                    console.log(`Successfully extracted and saved keywords for ${productId}`);
                }
            } catch (e) {
                alert(`自动提取关键词失败: ${getErrorMessage(e)}\n\n商品仍会添加到待上架列表，但您需要稍后手动提取关键词。`);
            }
        }
        // --- End of Automatic Keyword Extraction ---


        const currentPending = account['待上架'] || [];
        
        const rule = account.scheduling_rule;
        const newPendingList = [...currentPending];
        let alertMessage = `产品 ${productId} 已添加到 ${account.name} 的待上架队列。`;

        // --- New Logic: Fill Placeholders First ---
        if (rule && rule.items_per_day > 0) {
            
            const scheduledItems = currentPending.filter(item => typeof item === 'object' && item?.scheduled_at) as ScheduledProduct[];
            
            const scheduledTodayCount = scheduledItems.filter(item => new Date(item.scheduled_at) > new Date()).length;

            if (scheduledTodayCount < rule.items_per_day) {
                // There is an open slot for today!
                const intervalMillis = (24 * 60 / rule.items_per_day) * 60 * 1000;
                
                // Find the timestamp of the last scheduled item today, or start a new schedule
                const lastScheduledItem = scheduledItems.length > 0 
                    ? scheduledItems.sort((a,b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime())[0]
                    : null;

                let nextScheduleTime;
                const now = Date.now();

                if (lastScheduledItem && new Date(lastScheduledItem.scheduled_at).getTime() > now) {
                    // Last scheduled item is in the future, so schedule based on it
                    nextScheduleTime = new Date(lastScheduledItem.scheduled_at).getTime() + intervalMillis;
                        } else {
                    // First item, or last item is in the past. Schedule based on the current time.
                    const firstPostOffset = 10 * 60 * 1000; // 10 minutes from now, predictable
                    nextScheduleTime = now + firstPostOffset;
                }

                const newScheduledItem: ScheduledProduct = {
                    id: productId,
                    scheduled_at: new Date(nextScheduleTime).toISOString(),
                };
                newPendingList.push(newScheduledItem);
                    } else {
                 newPendingList.push(productId); // Add as a simple ID if today is full
                 alertMessage = `今日排期已满。产品 ${productId} 已添加到待上架队列末尾。`;
                    }

                } else {
            newPendingList.push(productId); // Default behavior if no rule
        }


        try {
            const { error } = await supabase
                .from('accounts_duplicate')
                .update({ '待上架': newPendingList, updated_at: new Date().toISOString() })
                .eq('name', selectedAccountForProducts.name);

            if (error) throw error;

            alert(alertMessage);
            
            // --- Optimistic UI Update ---
            const updatedAccount = { ...account, '待上架': newPendingList };
            
            // Update the state for the detailed view immediately.
            setSelectedAccountForProducts(updatedAccount);
            
            // Update the master list of accounts.
            setAllAccounts(prevAccounts => 
                prevAccounts.map(acc => 
                    acc.name === selectedAccountForProducts.name 
                        ? updatedAccount
                        : acc
                )
            );
            
            // Manually update the specific product's pending state in the detail view
            setProducts(prevProducts => 
                prevProducts.map(p => 
                    p.id === productId ? { ...p, isPending: true } : p
                )
            );

            // Refresh from server in the background to ensure consistency.
            fetchAccounts();

        } catch (err: unknown) {
            console.error('Error deploying product:', err);
            alert(`投放产品时出错: ${getErrorMessage(err)}`);
        }
    };

    // No longer needed
    // const handleSavePrompt = async () => { ... };


    // --- View Navigation ---
    const handleAccountSelectForProducts = (account: Account) => {
        setSelectedAccountForProducts(account);
        fetchProductsForAccount(account.name);
    };
    
    const handleAccountSelectForKeywords = (account: Account) => {
        setSelectedAccountForKeywords(account);
        fetchKeywordsForAccount(account.name);
    };

    const handleBackToAccounts = () => {
        setSelectedAccountForProducts(null);
        setSelectedAccountForKeywords(null);
        setProducts([]);
        setErrorProducts(null);
        setKeywordsForEditing([]);
        setErrorKeywords(null);
    };

    const handleBackFromKeywords = () => {
        setSelectedAccountForKeywords(null);
        setKeywordsForEditing([]);
        setErrorKeywords(null);
    };

    const handleRuleChange = (accountName: string, value: string) => {
        if (value === '') {
             setEditingRules(prev => ({ ...prev, [accountName]: { ...prev[accountName], items_per_day: '' } }));
            return;
        }
        const numValue = parseInt(value, 10);
        if (!isNaN(numValue) && numValue >= 0) {
            setEditingRules(prev => ({
                ...prev,
                [accountName]: {
                    ...prev[accountName],
                    items_per_day: numValue,
                }
            }));
        }
    };

    const handleSaveRule = async (accountName: string) => {
        setLoadingStates(prev => ({ ...prev, [accountName]: { ...prev[accountName], saveRule: true } }));
        
        const items_per_day = editingRules[accountName]?.items_per_day;
        const ruleToSave = (typeof items_per_day === 'number' && items_per_day > 0) 
            ? { items_per_day } 
            : null;

        try {
            const { error } = await supabase
                .from('accounts_duplicate')
                .update({ scheduling_rule: ruleToSave, updated_at: new Date().toISOString() })
                .eq('name', accountName);
            
            if (error) throw error;
            
            alert('排期规则保存成功！');
            fetchAccounts(); // Refresh data to show new rule

        } catch (err: unknown) {
            alert(`保存规则失败: ${getErrorMessage(err)}`);
        } finally {
             setLoadingStates(prev => ({ ...prev, [accountName]: { ...prev[accountName], saveRule: false } }));
        }
    };

    const handleUpdateScheduleTime = async (accountName: string, productId: string, newTime: string) => {
        const accountToUpdate = allAccounts.find(acc => acc.name === accountName);
        if (!accountToUpdate) {
            alert('找不到账号！');
            return;
        }

        const newPendingList = [...(accountToUpdate['待上架'] || [])];
        const itemIndex = newPendingList.findIndex(item => typeof item === 'object' && item !== null && item.id === productId);

        if (itemIndex === -1) {
            // This can happen if the item is a placeholder, which we don't edit.
            // Or if data is stale. A fetchAccounts() would resolve.
            alert('在待上架列表中找不到该商品！');
            return;
        }
        
        const itemToUpdate = newPendingList[itemIndex];
        if (typeof itemToUpdate === 'string') {
            alert('无法为未调度的项目更新时间。');
            return;
        }

        const updatedItem = {
            ...itemToUpdate,
            scheduled_at: new Date(newTime).toISOString(),
        };

        newPendingList[itemIndex] = updatedItem;

        try {
            const { error } = await supabase
                .from('accounts_duplicate')
                .update({ '待上架': newPendingList, updated_at: new Date().toISOString() })
                .eq('name', accountName);

            if (error) throw error;

            alert('上架时间更新成功！');
            setEditingSchedule(null); // Exit editing mode
            await fetchAccounts();    // Refresh data to ensure consistency and proper sorting
        } catch (err: unknown) {
            alert(`更新时间失败: ${getErrorMessage(err)}`);
        }
    };

    const handleProductUpdate = useCallback(async () => {
        // Refetch accounts to update any potential changes in scheduling/pending lists
        await fetchAccounts();
        // If we are in a product detail view, also refetch the product list for that account
        if (selectedAccountForProducts) {
            await fetchProductsForAccount(selectedAccountForProducts.name);
        }
    }, [fetchAccounts, selectedAccountForProducts, fetchProductsForAccount]);

    const handleAnalyzeTopProducts = async () => {
        if (analysisCount <= 0 || !selectedAccountForProducts) return;

        setIsAnalyzing(true);
        setAnalysisResult('');
        
        const productsToAnalyze = products.slice(0, analysisCount);
        
        if (productsToAnalyze.length === 0) {
            setAnalysisResult("没有足够的商品进行分析。");
            setIsAnalyzing(false);
            return;
        }

        const productInfo = productsToAnalyze.map((p, i) => `
--- Product ${i + 1} (ID: ${p.id}) ---
Keywords: ${p.keyword || 'N/A'}
AI Extracted Keywords: ${(p.ai提取关键词 || '').replace(/\n/g, ', ')}
Content:
${p.result_text_content || ''}
        `).join('\n');

        const prompt = `
You are a senior business analyst tasked with providing strategic insights.
Based on the provided business description and a batch of the latest ${productsToAnalyze.length} products for this account, please perform a comprehensive analysis.

--- Business Context ---
Account Name: ${selectedAccountForProducts.name}
Core Business Description:
${selectedAccountForProducts['业务描述']}

--- Selected Products Data ---
${productInfo}

--- Analysis Task ---
Please provide a report with the following structure:
1.  **产品共性总结 (Product Commonality Summary):** Identify the common themes, categories, or features shared across these products. What kind of product group is this?
2.  **核心需求与痛点 (Core Needs & Pain Points):** Based on the products, infer the primary needs and pain points of the target customer. What problem are they trying to solve?
3.  **营销策略建议 (Marketing Strategy Suggestions):** Suggest 2-3 potential marketing angles or sales strategies. How can we position these products to resonate with the target audience? What kind of promotional language would be effective?
4.  **结论 (Conclusion):** Provide a brief, actionable summary of your findings.

Please format your response clearly in Chinese.
`;

        try {
            const result = await callAIApiWithFallback(prompt);
            setAnalysisResult(result);
        } catch (e) {
            setAnalysisResult(`分析失败: ${getErrorMessage(e)}`);
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleDeleteKeywordFromLibrary = async (accountName: string, keywordToDelete: string) => {
        const confirmed = window.confirm(`您确定要从账号 [${accountName}] 的【核心关键词库】中永久删除关键词 "${keywordToDelete}" 吗？\n\n此操作也会影响所有使用此关键词的AI功能。`);
        if (!confirmed) {
            // Throw a specific error to be caught in the child component to revert UI state
            throw new Error('User cancelled via confirm dialog');
        }

        try {
            const { error } = await supabase
                .from('important_keywords_本人')
                .delete()
                .eq('account_name', accountName)
                .eq('keyword', keywordToDelete);
            
            if (error) throw error;
            
            alert(`已成功从 ${accountName} 的关键词库中删除 "${keywordToDelete}"。`);
            await fetchAccounts(); // Refresh accounts to update keyword lists everywhere
        } catch (e) {
            console.error('Failed to delete keyword from library:', getErrorMessage(e));
            alert(`从关键词库删除失败: ${getErrorMessage(e)}`);
            throw e; // Re-throw to ensure calling components can handle it
        }
    };

    const handleAiBatchAddAccounts = async () => {
        if (!aiBatchInput.trim()) {
            alert("请输入要解析的账号信息。");
            return;
        }
        setIsAiAddingAccounts(true);

        const prompt = `
You are an AI assistant that generates high-end, professional account data based on user requests. Your task is to understand the user's request and then return ONLY a valid JSON array of objects representing those accounts.

Each object in the array must have the following keys: "name", "xhs_account", "xianyu_account", "phone_model", "business_description", "english_keywords".

- **name**: A professional **English** account name. This is mandatory.
- **business_description**: This is the most important part. It must be a professional description containing two paragraphs: the first in **English**, and the second a **Chinese translation/summary** of the English part. Both should describe the account's purpose based on its theme.
- **english_keywords**: An array of exactly 10 relevant **English** keywords for the account. This is mandatory.
- **xhs_account**: The XHS account. If the user asks for it to be the same as the name, use the English name. Otherwise, leave it empty.
- **xianyu_account**: The Xianyu account, similar rules to xhs_account.
- **phone_model**: Leave this as an empty string "" unless specified by the user.

Follow the user's instructions regarding topic, quantity, and naming conventions precisely.
Do NOT return any text, explanation, or markdown formatting around the JSON array. Your entire response must be the JSON array itself.

---
User Request:
${aiBatchInput}
---
`;

        try {
            const aiText = await callAIApiWithFallback(prompt);
            let parsedAccounts: AiGeneratedAccount[];

            try {
                // The AI might return a string enclosed in markdown ```json ... ```, so we clean it.
                const cleanedJson = aiText.replace(/^```json\n/, '').replace(/\n```$/, '');
                parsedAccounts = JSON.parse(cleanedJson);
            } catch {
                console.error("Failed to parse JSON from AI response:", aiText);
                throw new Error(`AI返回了无效的数据格式。请检查您的输入或稍后再试。`);
            }
            
            if (!Array.isArray(parsedAccounts)) {
                 throw new Error("AI did not return a valid array of accounts.");
            }

            const existingAccountNames = new Set(allAccounts.map(acc => acc.name));
            
            const newAccountsData: Partial<Account>[] = [];
            const allNewKeywords: Omit<AccountKeywords, 'id'>[] = [];

            for (const item of parsedAccounts) {
                const trimmedName = item.name?.trim();
                if (!trimmedName || existingAccountNames.has(trimmedName)) {
                    // Skip invalid or duplicate accounts
                    continue;
                }

                const defaultKeywordPrompt = '你是一个关键词生成工具。请为我生成5到10个相关的中文推广关键词。严格遵守以下规则：1. 只返回关键词本身。2. 每个关键词占一行。3. 禁止添加任何编号、符号、解释或无关的对话。';
                const defaultCopywritingPrompt = `修改文案，请保留关键词！不要谄媚，不要口水话，直入关键点，使其，更简洁、突出关键词，去掉敏感词汇。 不能出现脏话。敏感词。1.不能出现下面词汇：指dao答yi、答疑、中介勿扰、账号、基本没怎么用过、标价出！可以直接拍下！、电子资料售出不退不换！、不退换、拍下秒发、使用痕迹等相似词汇。                                                            2.重复检查一轮，以空格或标点为边界，删掉同时带有"退""换"两字的句子 3.删掉中文或者英文国家地名比如澳洲AU，英国UK,香港HK等等。4. 如果既有词汇 题目，又有词汇 答案 （形式如 "题目 & 答案""题目和答案"等），用"Q&A"代替 5.敏感词汇如 答案用answer替换。6.删掉最新，最好等等字体。7.删掉价格。8.排列一下文案更美观。9. 不要markdown格式符号。10.不能出现"商品信息"、"关键词"等字体。11.递归检查，不要出现"*"这个符号。12.拼写检查，删除汉字专有名词内的空格，删除英文单字内的空格。13.为文案生成 #+关键词，要求围绕业务和文案弄8个左右。14.要围绕原始文案关键词改写 不能把他的关键业务删除。15.结尾添加欢迎私信咨询，`;

                newAccountsData.push({
                    name: trimmedName,
                    xhs_account: item.xhs_account || trimmedName,
                    '闲鱼账号': item.xianyu_account || trimmedName,
                    '手机型号': item.phone_model || null,
                    '业务描述': item.business_description || `我的业务是推广名为"${trimmedName}"的社交媒体账号，用于发布相关内容以吸引客户。`,
                    '关键词prompt': defaultKeywordPrompt,
                    '文案生成prompt': defaultCopywritingPrompt,
                });

                if (Array.isArray(item.english_keywords)) {
                    item.english_keywords.forEach((kw: string) => {
                        if (kw && kw.trim()) {
                            allNewKeywords.push({
                                account_name: trimmedName,
                                keyword: kw.trim()
                            });
                        }
                    });
                }
            }


            if (newAccountsData.length === 0) {
                alert("没有找到可供添加的、不重复的新账号。");
                return;
            }
            
            // Step 1: Insert accounts
            const { error: insertAccountsError } = await supabase
                .from('accounts_duplicate')
                .insert(newAccountsData);
            
            if (insertAccountsError) throw insertAccountsError;

            // Step 2: Insert keywords
            if (allNewKeywords.length > 0) {
                const { error: insertKeywordsError } = await supabase
                    .from('important_keywords_本人')
                    .insert(allNewKeywords);
                
                if (insertKeywordsError) {
                    alert(`成功添加了 ${newAccountsData.length} 个新账号，但保存关键词时失败: ${getErrorMessage(insertKeywordsError)}`);
                } else {
                    alert(`成功添加了 ${newAccountsData.length} 个新账号和 ${allNewKeywords.length} 个关键词！`);
                }
            } else {
                 alert(`成功添加了 ${newAccountsData.length} 个新账号！(没有找到要添加的关键词)`);
            }


            await fetchAccounts();
            setIsAiAddAccountModalOpen(false);
            setAiBatchInput('');

        } catch (e) {
            alert(`AI批量添加账号失败: ${getErrorMessage(e)}`);
        } finally {
            setIsAiAddingAccounts(false);
        }
    };

    const handleOnDragEnd = async (result: DropResult) => {
        if (!result.destination) return;

        const items = Array.from(allAccounts);
        const [reorderedItem] = items.splice(result.source.index, 1);
        items.splice(result.destination.index, 0, reorderedItem);

        // Update state immediately for a smooth user experience
        setAllAccounts(items);

        // Prepare the updates for the database
        const updates = items.map((account, index) => ({
            name: account.name, // Use 'name' as the primary key for the update condition
            display_order: index,
        }));

        try {
            // Upsert the new order into the database
            const { error } = await supabase
                .from('accounts_duplicate')
                .upsert(updates, { onConflict: 'name' });
            
            if (error) throw error;
            
            // Optionally, you can refetch to confirm, but optimistic update should be fine.
            // fetchAccounts();

        } catch (e) {
            console.error("Failed to save account order:", getErrorMessage(e));
            alert(`保存账号顺序失败: ${getErrorMessage(e)}`);
            // If saving fails, you might want to refetch to revert the order in the UI
            fetchAccounts();
        }
    };

    // --- RENDER LOGIC ---

    // Render Password Lock View
    if (!isAuthenticated) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900">
                <div className="p-8 max-w-sm mx-auto bg-white dark:bg-gray-800 rounded-xl shadow-md space-y-4">
                    <h1 className="text-xl font-bold text-center text-gray-900 dark:text-gray-100">请输入密码</h1>
                    <form onSubmit={handlePasswordSubmit}>
                        <input
                            type="password"
                            value={passwordInput}
                            onChange={(e) => setPasswordInput(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                            placeholder="Password"
                        />
                        {authError && <p className="text-red-500 text-sm mt-2">{authError}</p>}
                        <button
                            type="submit"
                            className="w-full mt-4 px-4 py-2 bg-blue-500 text-white font-semibold rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-gray-800"
                        >
                            进入
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    // Render Keyword Management View
    if (selectedAccountForKeywords) {
  return (
            <div className="p-5 font-sans bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 min-h-screen">
                 <div className="flex items-center gap-4 mb-4">
                <button
                        onClick={handleBackFromKeywords}
                        className="bg-gray-500 hover:bg-gray-600 text-white text-sm py-1.5 px-4 rounded-md cursor-pointer"
                >
                        ← 返回
                </button>
                    <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-200">
                        <span className="font-normal">管理关键词: </span>
                        {selectedAccountForKeywords.name}
                    </h1>
                 <div className="ml-auto flex items-center gap-2">
                 <button
                    onClick={handleGenerateRelatedKeywords}
                    disabled={isBatchGeneratingKeywords || keywordsForEditing.length === 0}
                    className="bg-purple-500 hover:bg-purple-600 text-white text-sm py-1.5 px-4 rounded-md disabled:opacity-50"
                >
                    {isBatchGeneratingKeywords ? '生成中...' : '🤖 AI 批量生成相关词'}
                </button>
                <button
                        onClick={handleAddNewKeyword}
                        className="bg-green-500 hover:bg-green-600 text-white text-sm py-1.5 px-4 rounded-md"
                >
                        + 新增关键词
                </button>
                  </div>
                </div>

                {loadingKeywords && <p className="italic">正在加载关键词...</p>}
                {errorKeywords && <p className="text-red-500">{errorKeywords}</p>}
                
                <div className="space-y-3">
                    {keywordsForEditing.map(kw => {
                        const latestHistory = keywordHistories
                            .filter(h => h.keyword_id === kw.id)
                            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

                        return (
                            <div key={kw.id} className="flex flex-col gap-2 p-3 border rounded-lg bg-gray-50 dark:bg-gray-800 shadow-sm transition-all hover:shadow-md">
                                <div className="flex items-center gap-2">
                                   <span className="text-sm font-mono text-gray-500 w-12 flex-shrink-0">ID: {kw.id}</span>
                           <input
                             type="text"
                             value={kw.keyword}
                             onChange={(e) => handleKeywordTextChange(kw.id, e.target.value)}
                             className="flex-grow p-1.5 border rounded-md text-sm dark:bg-gray-700 dark:border-gray-600"
                           />
                <button
                             onClick={() => handleUpdateKeyword(kw.id)}
                                        className="bg-blue-500 hover:bg-blue-600 text-white text-xs py-1.5 px-3 rounded-md flex-shrink-0"
                >
                             保存
                </button>
                <button
                              onClick={() => handleDeleteKeywordFromList(kw.id)}
                                        className="bg-red-500 hover:bg-red-600 text-white text-xs py-1.5 px-3 rounded-md flex-shrink-0"
                >
                             删除
                </button>
                        </div>

                                {latestHistory ? (
                                    <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-400 space-y-1">
                                        <div className="flex justify-between items-center">
                                            <span className="flex items-center gap-1.5">
                                                <strong className="font-semibold">上次搜索:</strong> {new Date(latestHistory.search_started_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                            <span className={`px-2 py-0.5 rounded-full text-white text-xs font-bold ${latestHistory.status === 'completed' ? 'bg-green-500' : 'bg-yellow-500'}`}>{latestHistory.status}</span>
                                        </div>
                                        <div className="grid grid-cols-3 gap-2 text-center pt-1">
                                            <div className="bg-gray-100 dark:bg-gray-700 p-1 rounded">
                                                <div className="font-bold text-gray-800 dark:text-gray-200">{latestHistory.total_items_found}</div>
                                                <div>发现</div>
                                            </div>
                                            <div className="bg-gray-100 dark:bg-gray-700 p-1 rounded">
                                                <div className="font-bold text-gray-800 dark:text-gray-200">{latestHistory.filter_passed_count}</div>
                                                <div>通过</div>
                                            </div>
                                            <div className="bg-gray-100 dark:bg-gray-700 p-1 rounded">
                                                <div className="font-bold text-gray-800 dark:text-gray-200">{latestHistory.ai_approved_count}</div>
                                                <div>采纳</div>
                                            </div>
                                        </div>
                                         {latestHistory.log_details && (
                                             <div className="pt-1">
                                                <details>
                                                    <summary className="cursor-pointer hover:text-gray-900 dark:hover:text-gray-100">查看日志</summary>
                                                    <pre className="text-xs bg-black text-white p-2 rounded mt-1 whitespace-pre-wrap font-mono max-h-40 overflow-y-auto">
                                                        {latestHistory.log_details}
                                                    </pre>
                                                </details>
                                             </div>
                                         )}
                                    </div>
                                ) : (
                                    <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500 italic">
                                        无搜索记录
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
                {(!loadingKeywords && keywordsForEditing.length === 0) && (
                    <p className="text-center text-gray-500 mt-6">该账户下没有关键词。</p>
                )}

                </div>
        );
    }


    // Render Product Detail View
    if (selectedAccountForProducts) {
  return (
            <div className="p-5 font-sans bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 min-h-screen">
                {/* Modal for AI Analysis */}
                {isAnalysisModalOpen && (
                    <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50 p-4" onClick={() => setIsAnalysisModalOpen(false)}>
                        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="text-xl font-bold">🤖 批量商品AI分析</h2>
                                <button onClick={() => setIsAnalysisModalOpen(false)} className="text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100 text-2xl font-bold">&times;</button>
                            </div>
                            
                            <div className="flex-grow grid grid-cols-1 md:grid-cols-2 gap-4 overflow-y-auto pr-2">
                                {/* Left side: Info */}
                                <div className="space-y-4">
                                    <div>
                                        <h3 className="font-semibold text-lg">分析目标账号</h3>
                                        <p className="text-blue-600 dark:text-blue-400">{selectedAccountForProducts.name}</p>
                                    </div>
                                     <div>
                                        <h3 className="font-semibold text-lg">核心业务描述</h3>
                                        <p className="text-sm bg-gray-100 dark:bg-gray-700 p-2 rounded">{selectedAccountForProducts['业务描述']}</p>
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-lg">分析范围</h3>
                                         <p className="text-xs text-gray-500 mb-2">输入要分析的最新商品数量。</p>
                                        <input
                                            type="number"
                                            value={analysisCount}
                                            onChange={(e) => setAnalysisCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                                            className="w-full p-2 border rounded-md text-sm dark:bg-gray-700 dark:border-gray-600"
                                            placeholder="例如: 10"
                                        />
                                    </div>
                                </div>
                                {/* Right side: Result */}
                                <div>
                                    <h3 className="font-semibold text-lg">AI 分析报告</h3>
                                    <div className="mt-1 w-full p-3 border rounded bg-gray-50 dark:bg-gray-900 h-full min-h-[300px] whitespace-pre-wrap overflow-y-auto">
                                        {isAnalyzing ? (
                                            <div className="flex items-center justify-center h-full">
                                                <p className="text-lg animate-pulse">分析中，请稍候...</p>
                                            </div>
                                        ) : (
                                            analysisResult || "点击开始分析以生成报告。"
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="mt-4 pt-4 border-t flex justify-end">
                                <button
                                    onClick={handleAnalyzeTopProducts}
                                    disabled={isAnalyzing || analysisCount <= 0}
                                    className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-5 rounded-lg disabled:opacity-50"
                                >
                                    {isAnalyzing ? '分析中...' : `🚀 分析最新的 ${analysisCount} 项`}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
                <div className="mb-8">
                    {/* Top row: Navigation and Title */}
                    <div className="flex justify-between items-center mb-4">
                        <div className="flex items-center gap-4">
                <button
                        onClick={handleBackToAccounts}
                                className="bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-bold py-2 px-4 rounded-lg flex items-center gap-2 transition-colors"
                >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                                返回
                </button>
                            <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-200 tracking-tight">
                        {selectedAccountForProducts.name}
            </h1>
                        </div>
                        <button
                            onClick={() => setIsAnalysisModalOpen(true)}
                            className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg flex items-center gap-2 transition-transform hover:scale-105"
                        >
                            <span className="text-lg">🤖</span>
                            AI 业务分析
                        </button>
                    </div>

                    {/* Bottom row: Control Panel / Dashboard */}
                    <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-200 dark:border-gray-700/50 shadow-sm">
                        <div className="flex justify-between items-start gap-6">
                            {/* Left side: Business Info */}
                            <div className="flex-grow max-w-prose">
                                <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400">核心业务</h3>
                                <p className="text-base text-gray-800 dark:text-gray-200 mt-1 whitespace-pre-wrap">
                                    {selectedAccountForProducts['业务描述'] || '暂无描述'}
                                </p>
                                <button
                                    onClick={() => handleAccountSelectForKeywords(selectedAccountForProducts!)}
                                    className="mt-3 text-sm font-semibold text-teal-600 hover:text-teal-500 dark:text-teal-400 dark:hover:text-teal-300 transition-colors"
                                 >
                                    管理核心关键词 &rarr;
                                </button>
                            </div>

                            {/* Right side: Filters & Stats */}
                            <div className="flex-shrink-0 flex items-center gap-4 pt-1">
                                <span className="text-sm font-semibold bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 py-1.5 px-3 rounded-full">
                                    今日获取: {products.filter(p => new Date(p.created_at) >= new Date(new Date().setHours(0, 0, 0, 0))).length} 个
                        </span>
                        <select
                            value={timeFilter}
                            onChange={(e) => setTimeFilter(e.target.value)}
                                    className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-1.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                        >
                            <option value="all">全部时间</option>
                            <option value="today">今天</option>
                            <option value="yesterday">昨天</option>
                            <option value="week">一周内</option>
                        </select>
                    </div>
                </div>
                    </div>
                </div>

                {/* Global prompt section is removed */}
                
                <h2 className="text-xl font-semibold mb-3">商品列表</h2>
                {loadingProducts && <p className="text-gray-600 dark:text-gray-400 italic">正在加载商品...</p>}
                {errorProducts && <p className="text-red-600 dark:text-red-400">{errorProducts}</p>}

                {!loadingProducts && !errorProducts && selectedAccountForProducts && (() => {
                    // Create a non-nullable reference to the account within this scope to satisfy the type checker
                    const currentAccount = selectedAccountForProducts;
                    return (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                            {products.filter(product => {
                                if (timeFilter === 'all') return true;
                                const productDate = new Date(product.created_at);
                                const today = new Date();
                                const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                                
                                if (timeFilter === 'today') {
                                    return productDate >= startOfToday;
                                }
                                
                                if (timeFilter === 'yesterday') {
                                    const startOfYesterday = new Date(startOfToday);
                                    startOfYesterday.setDate(startOfYesterday.getDate() - 1);
                                    return productDate >= startOfYesterday && productDate < startOfToday;
                                }

                                if (timeFilter === 'week') {
                                    const startOfWeek = new Date(startOfToday);
                                    startOfWeek.setDate(startOfWeek.getDate() - 7);
                                    return productDate >= startOfWeek;
                                }
                                return true;
                            }).map(product => {
                                const deployedTo = productSchedules
                                    .filter(s => s.product_id === product.id)
                                    .map(s => s.account_name);
                                const isPending = currentAccount['待上架']?.some(item => {
                                    const id = typeof item === 'object' && item !== null ? (item as ScheduledProduct).id : item;
                                    return String(id) === String(product.id);
                                }) ?? false;
                                return (
                                    <div className="relative" key={product.id}>
                                        <ProductCard 
                                            product={product} 
                                            onDelete={handleDeleteProduct} 
                                            onDuplicate={handleDuplicateProduct}
                                            onDeploy={handleDeployProduct}
                                            onUpdate={handleProductUpdate}
                                            callAi={callAIApiWithFallback}
                                            accountName={currentAccount.name}
                                            onSaveKeywords={handleSaveKeywordsToAccount}
                                            onDeleteKeywordFromLibrary={handleDeleteKeywordFromLibrary}
                                            customCopywritingPrompt={currentAccount['文案生成prompt'] || ''} 
                                            businessDescription={currentAccount['业务描述'] || ''}
                                            onManageAccountKeywords={() => {
                                                if (currentAccount) {
                                                    handleAccountSelectForKeywords(currentAccount);
                                                }
                                            }}
                                            deployedTo={deployedTo} 
                                            isPending={isPending}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    );
                })()}

                {!loadingProducts && !errorProducts && products.length === 0 && (
                    <div className="text-center col-span-full p-5 text-gray-500 dark:text-gray-400">
                        该账号下没有找到任何商品。
                    </div>
                )}
            </div>
        );
    }


    // Render Main Account List View
                                               return (
        <div className="p-5 font-sans bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 min-h-screen">
                        <div className="flex justify-between items-center mb-4">
                <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-200">账号管理</h1>
                    <div className="flex items-center gap-2">
                            <button
                            onClick={() => setIsAiAddAccountModalOpen(true)}
                            className="bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold py-2 px-4 rounded"
                            >
                            🤖 AI 批量生成
                            </button>
                   <button
                    onClick={() => setIsAddAccountModalOpen(true)}
                    className="bg-green-500 hover:bg-green-600 text-white text-sm font-bold py-2 px-4 rounded"
                    >
                    + 添加账号
                    </button>
                    </div>
                </div>

            <hr className="my-6 border-gray-300 dark:border-gray-600" />

            <h2 className="text-xl font-semibold mb-3">账号列表</h2>
            {loadingAccounts && <p>正在加载账号...</p>}
            {errorAccounts && <p className="text-red-500">{errorAccounts}</p>}
            
            {!loadingAccounts && !errorAccounts && (
                <DragDropContext onDragEnd={handleOnDragEnd}>
                    <Droppable droppableId="accounts">
                        {(provided) => (
                            <div 
                                {...provided.droppableProps}
                                ref={provided.innerRef}
                                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5"
                            >
                                {allAccounts.map((account, index) => {
                        const today = new Date();
                        const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                        return (
                                        <Draggable key={account.name} draggableId={account.name} index={index}>
                                            {(provided, snapshot) => (
                                                <div
                                                    ref={provided.innerRef}
                                                    {...provided.draggableProps}
                                                    // {...provided.dragHandleProps} // We will apply this to a specific handle
                                                    className={`border rounded-lg bg-white dark:bg-gray-800 shadow-md flex flex-col gap-3 group/account transition-shadow ${snapshot.isDragging ? 'shadow-2xl ring-2 ring-purple-500' : 'shadow-md'}`}
                                                >
                                                    <div className="flex items-center p-4 border-b">
                                                        <div 
                                                            {...provided.dragHandleProps} 
                                                            className="cursor-grab p-2 mr-3 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                                                            title="拖拽排序"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                              <path d="M5 4a1 1 0 00-2 0v2a1 1 0 002 0V4zm0 6a1 1 0 00-2 0v2a1 1 0 002 0v-2zm0 6a1 1 0 00-2 0v2a1 1 0 002 0v-2zm6-12a1 1 0 00-2 0v2a1 1 0 002 0V4zm0 6a1 1 0 00-2 0v2a1 1 0 002 0v-2zm0 6a1 1 0 00-2 0v2a1 1 0 002 0v-2zm6-12a1 1 0 00-2 0v2a1 1 0 002 0V4zm0 6a1 1 0 00-2 0v2a1 1 0 002 0v-2zm0 6a1 1 0 00-2 0v2a1 1 0 002 0v-2zm6-12a1 1 0 00-2 0v2a1 1 0 002 0V4zm0 6a1 1 0 00-2 0v2a1 1 0 002 0v-2zm0 6a1 1 0 00-2 0v2a1 1 0 002 0v-2zm6-12a1 1 0 00-2 0v2a1 1 0 002 0V4zm0 6a1 1 0 00-2 0v2a1 1 0 002 0v-2zm0 6a1 1 0 00-2 0v2a1 1 0 002 0v-2zm6-12a1 1 0 00-2 0v2a1 1 0 002 0V4zm0 6a1 1 0 00-2 0v2a1 1 0 002 0v-2zm0 6a1 1 0 00-2 0v2a1 1 0 002 0v-2zm6-12a1 1 0 00-2 0v2a1 1 0 002 0V4zm0 6a1 1 0 00-2 0v2a1 1 0 002 0v-2zm0 6a1 1 0 00-2 0v2a1 1 0 002 0v-2zm6-12a1 1 0 00-2 0v2a1 1 0 002 0V4zm0 6a1 1 0 00-2 0v2a1 1 0 002 0v-2zm0 6a1 1 0 00-2 0v2a1 1 0 002 0v-2z" />
                                                            </svg>
                                                        </div>
                                                        <div className="flex-grow">
                                                            <div className="flex items-center gap-3">
                                    {account['xhs_头像'] ? (
                                                                    <div className="relative w-12 h-12 rounded-full overflow-hidden border-2 border-pink-400 flex-shrink-0">
                                            <Image 
                                                src={account['xhs_头像']} 
                                                alt={`${account.xhs_account || account.name}'s avatar`} 
                                                fill 
                                                style={{ objectFit: 'cover' }}
                                                sizes="48px"
                                            />
                                        </div>
                                    ) : (
                                                                    <div className="w-12 h-12 rounded-full bg-gray-300 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
                                            <span className="text-xl text-gray-500 dark:text-gray-400">?</span>
                                        </div>
                                    )}
                                                                <div 
                                                                    onClick={() => handleAccountSelectForProducts(account)}
                                                                    className="flex-grow cursor-pointer"
                                                                >
                                        <h3 className="font-bold text-lg">{account.name}</h3>
                                        {account.xhs_account && (
                                            <p className="text-xs text-gray-500">@{account.xhs_account}</p>
                                        )}
                                    </div>
                                </div>
                                                        </div>
                                                         <button
                                                            onClick={(e) => { e.stopPropagation(); handleDeleteAccount(account.name); }}
                                                            disabled={deletingAccount === account.name}
                                                            className="p-1 bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-800/70 rounded-full z-10 opacity-0 group-hover/account:opacity-100"
                                                            >
                                                            {deletingAccount === account.name ? "..." : "✕"}
                                                         </button>
                                                    </div>
                                                    <div 
                                                        className="px-4 pb-4 flex flex-col gap-3"
                                                        onClick={() => handleAccountSelectForProducts(account)}
                                                    >
                                                         <div className="text-xs space-y-1 text-gray-600 dark:text-gray-400">
                                <p><strong className="font-semibold text-gray-700 dark:text-gray-300">闲鱼:</strong> {account['闲鱼账号'] || 'N/A'}</p>
                                <p><strong className="font-semibold text-gray-700 dark:text-gray-300">手机:</strong> {account['手机型号'] || 'N/A'}</p>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        <span className="inline-block bg-blue-100 text-blue-800 text-xs font-semibold px-2.5 py-0.5 rounded dark:bg-blue-200 dark:text-blue-800">
                                            今日新增商品: {account.today_new_products}
                                        </span>
                                        {account['已上架json'] && (
                                            <span className="inline-block bg-green-100 text-green-800 text-xs font-semibold px-2.5 py-0.5 rounded dark:bg-green-200 dark:text-green-900">
                                                今日已上架: {(account['已上架json'] || []).filter(item => new Date(item.scheduled_at) >= startOfToday).length}
                                        </span>
                                    )}
                                    </div>
                </div>

                                <div className="flex flex-col gap-3 mt-2 border-t pt-3">
                                    <div>
                                    <TagList 
                                        title="今日上架计划" 
                                        items={account.todays_schedule || []} 
                                        color="blue" 
                                        accountName={account.name}
                                        arrayKey='待上架'
                                            onDeleteItem={handleDeleteItemFromArray}
                                        layout="vertical"
                                            deployedIds={(account['已上架json'] || []).map(item => item.id)}
                                            editingSchedule={editingSchedule}
                                            setEditingSchedule={setEditingSchedule}
                                            onUpdateTime={handleUpdateScheduleTime}
                                    />
                                </div>
                                    <div>
                                    <TagList 
                                            title="已上架" 
                                            items={account['已上架']} 
                                            color="green" 
                                        accountName={account.name}
                                            arrayKey='已上架'
                                        onDeleteItem={handleDeleteItemFromArray}
                                    />
                                    </div>
                            </div>

                            <div className="border-t border-gray-200 dark:border-gray-600 mt-2 pt-2">
                   <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingAccount(account);
                                    }}
                                    className="w-full text-sm font-semibold text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100 flex justify-between items-center"
                                >
                                    <span>高级设置</span>
                                    <span>⚙️</span>
                    </button>
                </div>
            </div>
                                            </div>
                                        )}
                                    </Draggable>
                                    );
                    })}
                                {provided.placeholder}
                </div>
                        )}
                    </Droppable>
                </DragDropContext>
            )}
            {!loadingAccounts && !errorAccounts && allAccounts.length === 0 && (
                <div className="text-center p-5 text-gray-500">没有找到任何账号。</div>
            )}
            
            {isAddAccountModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-md">
                        <h2 className="text-xl font-bold mb-4">添加新账号</h2>
                        <div className="space-y-3">
                        <input
                            type="text"
                                placeholder="输入新账号名称 (必填)" 
                            value={newAccountName}
                            onChange={(e) => setNewAccountName(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-500 rounded-md text-sm"
                            />
                             <input 
                                type="text" 
                                placeholder="小红书账号 (选填)" 
                                value={newXhsAccount} 
                                onChange={(e) => setNewXhsAccount(e.target.value)} 
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-500 rounded-md text-sm"
                            />
                             <input 
                                type="text" 
                                placeholder="闲鱼账号 (选填)" 
                                value={newXianyuAccount} 
                                onChange={(e) => setNewXianyuAccount(e.target.value)} 
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-500 rounded-md text-sm"
                            />
                             <input 
                                type="text" 
                                placeholder="手机型号 (选填)" 
                                value={newPhoneModel} 
                                onChange={(e) => setNewPhoneModel(e.target.value)} 
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-500 rounded-md text-sm"
                            />
                        </div>
                        <div className="flex justify-end gap-3 mt-5">
                            <button
                                onClick={() => {
                                    setIsAddAccountModalOpen(false);
                                    setNewAccountName('');
                                    setNewXhsAccount('');
                                    setNewXianyuAccount('');
                                    setNewPhoneModel('');
                                }}
                                className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded"
                            >
                                取消
                            </button>
                         <button
                             onClick={handleAddAccount}
                             disabled={isAddingAccount || !newAccountName.trim()}
                                className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
                         >
                                {isAddingAccount ? '添加中...' : '确认添加'}
                         </button>
                    </div>
                </div>
                </div>
             )}

            {isAiAddAccountModalOpen && (
                 <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50 p-4" onClick={() => setIsAiAddAccountModalOpen(false)}>
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-2xl w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
                         <h2 className="text-2xl font-bold mb-4 text-gray-800 dark:text-gray-200">🤖 AI 批量生成账号</h2>
                         <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                             请在下方文本框中输入或粘贴您的账号信息。AI将尝试自动解析并批量创建它们。
                             <br />
                             例如: <code className="text-xs bg-gray-200 dark:bg-gray-700 p-1 rounded">&quot;生成10个市场营销方向的高端英文账号，业务描述需要中英文&quot;</code>
                         </p>
                         <textarea
                            value={aiBatchInput}
                            onChange={(e) => setAiBatchInput(e.target.value)}
                            placeholder="在此处输入任意格式的账号信息..."
                            rows={10}
                            className="w-full p-3 border rounded-md text-sm bg-white dark:bg-gray-700 dark:border-gray-500 focus:ring-2 focus:ring-purple-500"
                            disabled={isAiAddingAccounts}
                         />
                        <div className="flex justify-end gap-3 mt-5">
                            <button
                                onClick={() => {
                                    setIsAiAddAccountModalOpen(false);
                                    setAiBatchInput('');
                                }}
                                className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded"
                                disabled={isAiAddingAccounts}
                            >
                                取消
                            </button>
                         <button
                             onClick={handleAiBatchAddAccounts}
                             disabled={isAiAddingAccounts || !aiBatchInput.trim()}
                             className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50 flex items-center gap-2"
                         >
                                {isAiAddingAccounts ? (
                                    <>
                                    <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    解析创建中...
                                    </>
                                ) : (
                                    '🚀 开始生成'
                                )}
                         </button>
                    </div>
                </div>
                </div>
             )}

            {editingAccount && (
                 <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50 p-4" onClick={() => setEditingAccount(null)}>
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-2xl font-bold">
                                高级设置: <span className="text-blue-600 dark:text-blue-400">{editingAccount.name}</span>
                            </h2>
                            <button onClick={() => setEditingAccount(null)} className="text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100 text-2xl font-bold">&times;</button>
                        </div>
                        
                        {/* Settings Content Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                            {/* Column 1: Prompts */}
                            <div className="space-y-4 p-4 border rounded-lg bg-gray-50 dark:bg-gray-800/50">
                                <h3 className="text-lg font-semibold border-b pb-2">🤖 AI 提示词管理</h3>
                                <div>
                                    <label className="text-base font-semibold text-gray-700 dark:text-gray-300 block mb-1">文案生成提示词</label>
                                    <p className="text-xs text-gray-500 mb-2">这是最重要的提示词，用于AI生成商品文案。</p>
                                    <textarea
                                        value={editingCopywritingPrompts[editingAccount.name] || ''}
                                        onChange={(e) => setEditingCopywritingPrompts(prev => ({...prev, [editingAccount.name]: e.target.value}))}
                                        rows={8}
                                        className="w-full p-2 border rounded-md text-sm bg-white dark:bg-gray-700 dark:border-gray-500"
                                    />
                                <button
                                        onClick={() => handleSaveAccountField(editingAccount.name, '文案生成prompt', editingCopywritingPrompts[editingAccount.name])}
                                        disabled={loadingStates[editingAccount.name]?.saveCopyPrompt || editingCopywritingPrompts[editingAccount.name] === (editingAccount['文案生成prompt'] || '')}
                                        className="w-full mt-2 bg-blue-600 hover:bg-blue-700 text-white text-sm py-2 px-4 rounded disabled:opacity-50"
                                    >
                                        {loadingStates[editingAccount.name]?.saveCopyPrompt ? '保存中...' : '保存文案提示词'}
                                </button>
                                </div>
                                <div>
                                    <label className="text-base font-semibold text-gray-700 dark:text-gray-300 block mb-1">业务描述</label>
                                     <textarea
                                        value={editingBusinessPrompts[editingAccount.name] || ''}
                                        onChange={(e) => setEditingBusinessPrompts(prev => ({...prev, [editingAccount.name]: e.target.value}))}
                                        rows={4}
                                        className="w-full p-2 border rounded-md text-sm bg-white dark:bg-gray-700 dark:border-gray-500"
                                    />
                                                        <button
                                        onClick={() => handleSaveAccountField(editingAccount.name, '业务描述', editingBusinessPrompts[editingAccount.name])}
                                        disabled={loadingStates[editingAccount.name]?.saveBizPrompt || editingBusinessPrompts[editingAccount.name] === (editingAccount['业务描述'] || '')}
                                        className="w-full mt-2 bg-teal-500 hover:bg-teal-600 text-white text-sm py-2 px-4 rounded disabled:opacity-50"
                                    >
                                        {loadingStates[editingAccount.name]?.saveBizPrompt ? '保存中...' : '保存业务描述'}
                                                        </button>
                                    </div>
                                <div>
                                    <label className="text-base font-semibold text-gray-700 dark:text-gray-300 block mb-1">关键词生成提示词</label>
                                    <textarea
                                        value={editingKeywordPrompts[editingAccount.name] || ''}
                                        onChange={(e) => setEditingKeywordPrompts(prev => ({...prev, [editingAccount.name]: e.target.value}))}
                                        rows={4}
                                        className="w-full p-2 border rounded-md text-sm bg-white dark:bg-gray-700 dark:border-gray-500"
                                    />
                                    <button
                                        onClick={() => handleSaveAccountField(editingAccount.name, '关键词prompt', editingKeywordPrompts[editingAccount.name])}
                                        disabled={loadingStates[editingAccount.name]?.saveKwPrompt || editingKeywordPrompts[editingAccount.name] === (editingAccount['关键词prompt'] || '')}
                                        className="w-full mt-2 bg-teal-500 hover:bg-teal-600 text-white text-sm py-2 px-4 rounded disabled:opacity-50"
                                    >
                                        {loadingStates[editingAccount.name]?.saveKwPrompt ? '保存中...' : '保存生成提示词'}
                                    </button>
                                </div>
                            </div>

                            {/* Column 2: Keywords & Assets */}
                            <div className="space-y-4 p-4 border rounded-lg bg-gray-50 dark:bg-gray-800/50">
                                <h3 className="text-lg font-semibold border-b pb-2">⚙️ 核心资产与关键词</h3>
                                 <div>
                                    <label className="text-base font-semibold text-gray-700 dark:text-gray-300 block mb-1">推广关键词</label>
                                    <p className="text-xs text-gray-500 mb-2">用于AI生成相关关键词，支持AI生成和手动管理。</p>
                                    <textarea
                                        value={editingKeywords[editingAccount.name] || ''}
                                        onChange={(e) => setEditingKeywords(prev => ({...prev, [editingAccount.name]: e.target.value}))}
                                        placeholder="点击AI生成或手动输入关键词..."
                                        rows={5}
                                        className="w-full p-2 border rounded-md text-sm bg-white dark:bg-gray-700 dark:border-gray-500"
                                    />
                                    <div className="grid grid-cols-2 gap-2 mt-2">
                                                       <button
                                            onClick={() => handleGenerateKeywords(editingAccount.name)}
                                            disabled={loadingStates[editingAccount.name]?.ai}
                                            className="bg-blue-500 hover:bg-blue-600 text-white text-sm py-2 px-2 rounded disabled:opacity-50"
                                        >
                                            {loadingStates[editingAccount.name]?.ai ? '生成中...' : 'AI生成'}
                                                       </button>
                                        <button 
                                            onClick={() => handleSaveKeywords(editingAccount.name)}
                                            disabled={loadingStates[editingAccount.name]?.saveKeywords || editingKeywords[editingAccount.name] === (editingAccount.keywords || '')}
                                            className="bg-green-500 hover:bg-green-600 text-white text-sm py-2 px-2 rounded disabled:opacity-50"
                                        >
                                            {loadingStates[editingAccount.name]?.saveKeywords ? '保存中...' : '保存'}
                                        </button>
                                    </div>
                                     <button
                                        onClick={() => handleAccountSelectForKeywords(editingAccount)}
                                        className="w-full mt-2 bg-purple-500 hover:bg-purple-600 text-white text-sm py-2 px-2 rounded"
                                    >
                                        进入关键词列表详细管理 &rarr;
                                    </button>
                                </div>
                                <div className="border-t pt-4 space-y-3">
                                    <h4 className="text-base font-semibold">核心资产</h4>
                                     <div>
                                        <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 block mb-1">小红书账号</label>
                                        <input
                                            type="text"
                                            value={editingXhs[editingAccount.name] || ''}
                                            onChange={(e) => setEditingXhs(prev => ({...prev, [editingAccount.name]: e.target.value}))}
                                            className="w-full p-2 border rounded-md text-sm bg-white dark:bg-gray-700 dark:border-gray-500"
                                        />
                                        <button
                                            onClick={() => handleSaveAccountField(editingAccount.name, 'xhs_account', editingXhs[editingAccount.name])}
                                            disabled={editingXhs[editingAccount.name] === (editingAccount.xhs_account || '')}
                                            className="w-full mt-2 bg-teal-500 hover:bg-teal-600 text-white text-xs py-1.5 px-2 rounded disabled:opacity-50"
                                        >
                                            保存
                                        </button>
                            </div>
                                   <div>
                                        <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 block mb-1">闲鱼账号</label>
                                        <input
                                            type="text"
                                            value={editingXianyu[editingAccount.name] || ''}
                                            onChange={(e) => setEditingXianyu(prev => ({...prev, [editingAccount.name]: e.target.value}))}
                                            className="w-full p-2 border rounded-md text-sm bg-white dark:bg-gray-700 dark:border-gray-500"
                                        />
                                        <button
                                            onClick={() => handleSaveAccountField(editingAccount.name, '闲鱼账号', editingXianyu[editingAccount.name])}
                                            disabled={editingXianyu[editingAccount.name] === (editingAccount['闲鱼账号'] || '')}
                                            className="w-full mt-2 bg-teal-500 hover:bg-teal-600 text-white text-xs py-1.5 px-2 rounded disabled:opacity-50"
                                        >
                                            保存
                                        </button>
                    </div>
                                   <div>
                                        <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 block mb-1">手机型号</label>
                                        <input
                                            type="text"
                                            value={editingPhone[editingAccount.name] || ''}
                                            onChange={(e) => setEditingPhone(prev => ({...prev, [editingAccount.name]: e.target.value}))}
                                            className="w-full p-2 border rounded-md text-sm bg-white dark:bg-gray-700 dark:border-gray-500"
                                        />
                                        <button
                                            onClick={() => handleSaveAccountField(editingAccount.name, '手机型号', editingPhone[editingAccount.name])}
                                            disabled={editingPhone[editingAccount.name] === (editingAccount['手机型号'] || '')}
                                            className="w-full mt-2 bg-teal-500 hover:bg-teal-600 text-white text-xs py-1.5 px-2 rounded disabled:opacity-50"
                                        >
                                            保存
                                        </button>
            </div>
                                </div>
                                 {/* Scheduling Section */}
                                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                                    <h3 className="text-lg font-semibold border-b pb-2 mb-3">🗓️ 上架规则设置</h3>
                                    <div className="space-y-2">
                                        <div>
                                            <label htmlFor={`itemsPerDay-${editingAccount.name}`} className="block text-sm font-medium text-gray-700 dark:text-gray-300">每日自动上架数量</label>
                                             <p className="text-xs text-gray-500 mb-2">设置后，系统将按此规则运作。设为0或置空则取消规则。</p>
                                            <input
                                                type="number"
                                                id={`itemsPerDay-${editingAccount.name}`}
                                                value={editingRules[editingAccount.name]?.items_per_day || ''}
                                                onChange={(e) => handleRuleChange(editingAccount.name, e.target.value)}
                                                className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                                placeholder="例如: 5"
                                            />
                                        </div>
                                    </div>
                                    <div className="mt-4 flex justify-end gap-2">
                <button
                                            onClick={() => handleSaveRule(editingAccount.name)}
                                            disabled={loadingStates[editingAccount.name]?.saveRule}
                                            className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {loadingStates[editingAccount.name]?.saveRule ? '保存中...' : '保存规则'}
                </button>
            </div>

                                    {(() => {
                                        if (!editingAccount) return null;
                                        const ruleItems = editingRules[editingAccount.name]?.items_per_day;
                                        const pendingItems = editingAccount['待上架'] || [];
                                        
                                        if (!ruleItems || ruleItems <= 0) return null;

                                        const futureScheduledItems = (pendingItems
                                            .filter(item => typeof item === 'object' && item.scheduled_at) as ScheduledProduct[])
                                            .filter(item => new Date(item.scheduled_at).getTime() > now.getTime())
                                            .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());

                                        const unscheduledCount = pendingItems.filter(item => typeof item === 'string').length;
                                        const scheduledCount = futureScheduledItems.length;
                                        const emptySlots = ruleItems - scheduledCount > 0 ? ruleItems - scheduledCount : 0;
                                        

                                        return (
                                            <div className="mt-4 p-3 rounded-md border bg-blue-50 border-blue-200 dark:bg-blue-900/30 dark:border-blue-800">
                                                <h4 className="text-sm font-semibold mb-2 text-blue-800 dark:text-blue-200">今日上架计划 (规则: {ruleItems}个/天)</h4>
                                                <div className="text-xs text-blue-700 dark:text-blue-300 space-y-1">
                                                    {futureScheduledItems.map(item => (
                                                        <p key={item.id} className="truncate">
                                                            • ID: {item.id} (预计: {new Date(item.scheduled_at).toLocaleTimeString('zh-CN')})
                                                        </p>
                                                    ))}
                                                    {emptySlots > 0 && Array.from({ length: emptySlots }).map((_, index) => (
                                                        <p key={`empty-${index}`} className="text-gray-400 dark:text-gray-500 italic">
                                                            • [空闲排期位]
                                                        </p>
                                                    ))}
                                                </div>
                                                <div className="mt-2 pt-2 border-t border-blue-200 dark:border-blue-700 text-xs space-y-0.5">
                                                    <p className="font-medium">• {scheduledCount} / {ruleItems} 个位置已预定。</p>
                                                    <p className="text-gray-600 dark:text-gray-400">• {unscheduledCount} 个商品在队列中等待排期。</p>
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
             )}
    </div>
  );
}
