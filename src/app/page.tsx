'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import { DropResult } from '@hello-pangea/dnd';

import SettingsModal from '@/components/SettingsModal';
import KeywordManagementView from '@/components/KeywordManagementView';
import type { Account, Product, AccountKeywords,  ScheduledProduct, AiGeneratedAccount } from '@/types';
import ProductDetailView from '@/components/ProductDetailView';
import AccountListView from '@/components/AccountListView';
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
// All type definitions have been moved to src/types.ts for better organization.


// --- Helper Components ---


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
    const [isAnalysisModalOpen, setIsAnalysisModalOpen] = useState(false);
    const [analysisResult, setAnalysisResult] = useState('');
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisCount, ] = useState<number>(10);
    
    // State for AI Analysis modal (used by ProductDetailView)
    const [aiAnalysisInput, setAiAnalysisInput] = useState('');
    
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
    const [isBatchGeneratingKeywords, setIsBatchGeneratingKeywords] = useState<boolean>(false);


    // State for AI Prompt (No longer global, will be per-account)
    // const [globalPrompt, setGlobalPrompt] = useState<string>('');
    // const [loadingPrompt, setLoadingPrompt] = useState<boolean>(true);
    // const [savingPrompt, setSavingPrompt] = useState<boolean>(false);
    // const [promptError, setPromptError] = useState<string | null>(null);


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
                let todays_schedule: ScheduledProduct[] = [];

                // New, simplified, and robust logic:
                const pendingItems = (acc['待上架'] || []) as (ScheduledProduct | string)[];

                // Always display all real pending items, regardless of their scheduled date.
                const realPendingItems = pendingItems
                    .filter((item): item is ScheduledProduct => {
                        if (typeof item !== 'object' || item === null) return false;
                        return !(item as ScheduledProduct).isPlaceholder;
                    });

                // Find all placeholders
                const placeholders = pendingItems
                    .filter((item): item is ScheduledProduct => {
                        if (typeof item !== 'object' || item === null) return false;
                        return (item as ScheduledProduct).isPlaceholder === true;
                    });

                // Combine them
                todays_schedule = [...realPendingItems, ...placeholders];
                
                // Sort the final list by date to ensure chronological order
                todays_schedule.sort((a, b) => {
                    const timeA = a.scheduled_at ? new Date(a.scheduled_at).getTime() : Infinity;
                    const timeB = b.scheduled_at ? new Date(b.scheduled_at).getTime() : Infinity;
                    return timeA - timeB;
                });
                
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
        try {
            const { data, error } = await supabase
                .from('important_keywords_本人')
                .select('id, account_name, keyword, search_history')
                .eq('account_name', accountName)
                .order('id', { ascending: true });
            
            if (error) throw error;
            setKeywordsForEditing(data as AccountKeywords[]);

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
            const {  error } = await supabase
                .from('product_schedules')
                .select('*');
            if (error) throw error;
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
    
 

    const handleDeleteItemFromArray = async (accountName: string, arrayKey: keyof Pick<Account, '待上架' | '已上架'>, itemToDelete: string) => {
        // Ensure we only process valid array keys
        const validArrayKeys: (keyof Pick<Account, '待上架' | '已上架'>)[] = ['待上架', '已上架'];
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
                await fetchProductsForAccount(selectedAccountForProducts.name);
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
                请基于以下业务描述和产品文案，提取2-3个最相关的英文关键词。
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

    const handleBackFromProducts = () => {
        setSelectedAccountForProducts(null);
        setProducts([]);
        setErrorProducts(null);
    };

 

    const handleBackFromKeywords = () => {
        setSelectedAccountForKeywords(null);
        setKeywordsForEditing([]);
        setErrorKeywords(null);
    };


    const handleSaveRule = async (accountName: string) => {
        setLoadingStates(prev => ({ ...prev, [accountName]: { ...prev[accountName], saveRule: true } }));
        
        const items_per_day_input = editingRules[accountName]?.items_per_day;
        const items_per_day = (typeof items_per_day_input === 'number' && items_per_day_input > 0) 
            ? items_per_day_input 
            : 0;

        const ruleToSave = { 
            items_per_day,
            enabled: allAccounts.find(acc => acc.name === accountName)?.scheduling_rule?.enabled ?? false // Preserve enabled status
        };

        try {
            // --- This is the new, crucial logic ---
            // 1. Get the current state of the account
            const accountToUpdate = allAccounts.find(acc => acc.name === accountName);
            if (!accountToUpdate) throw new Error("Account not found in current state.");

            // 2. Recalculate the schedule based on the NEW rule
            // This logic is borrowed and adapted from fetchAccounts
            const { '待上架': existingPending } = accountToUpdate;
            const now = new Date();
            const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
            const endOfDay = startOfDay + 24 * 60 * 60 * 1000 -1;
            const intervalMillis = (18 * 60 * 60 * 1000) / items_per_day;

            const finalSchedule: ScheduledProduct[] = (existingPending || [])
                .filter((item): item is ScheduledProduct => {
                    if (!item || typeof item !== 'object' || !item.scheduled_at) return false;
                    const itemTime = new Date(item.scheduled_at).getTime();
                    return itemTime >= startOfDay && itemTime <= endOfDay && !item.isPlaceholder;
                });
            
            const unscheduledIdsQueue: string[] = (existingPending || [])
                 .filter(item => typeof item === 'string' || (item && typeof item === 'object' && !item.scheduled_at))
                 .map(item => typeof item === 'string' ? item : (item as ScheduledProduct).id);

            const lastScheduleTime = Math.max(
                now.getTime(),
                ...finalSchedule.map(item => new Date(item.scheduled_at).getTime())
            );

            let nextScheduleTime: number;
            if (lastScheduleTime < startOfDay || finalSchedule.length === 0) {
                 nextScheduleTime = now.getTime() + 10 * 60 * 1000;
            } else {
                 nextScheduleTime = lastScheduleTime + intervalMillis;
            }
            if (nextScheduleTime < now.getTime()){
                 nextScheduleTime = now.getTime() + 10 * 60 * 1000;
            }

            const placeholderBaseIndex = finalSchedule.filter(item => item.isPlaceholder).length;
            let placeholderCounter = 1;

            while (finalSchedule.length < items_per_day) {
                const nextProductId = unscheduledIdsQueue.shift();
                if (nextProductId) {
                    finalSchedule.push({ id: nextProductId, scheduled_at: new Date(nextScheduleTime).toISOString(), isPlaceholder: false });
                } else {
                    finalSchedule.push({ id: `待定商品 ${placeholderBaseIndex + placeholderCounter}`, scheduled_at: new Date(nextScheduleTime).toISOString(), isPlaceholder: true });
                    placeholderCounter++;
                }
                nextScheduleTime += intervalMillis;
            }
            finalSchedule.sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
            // --- End of new logic ---


            // 3. Save both the new rule AND the newly calculated schedule
            const { error } = await supabase
                .from('accounts_duplicate')
                .update({ 
                    scheduling_rule: ruleToSave, 
                    '待上架': finalSchedule, // This is the magic part that cleans the data
                    updated_at: new Date().toISOString() 
                })
                .eq('name', accountName);
            
            if (error) throw error;
            
            alert('排期规则保存并刷新成功！');
            fetchAccounts(); // Refresh all data to show new state

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

    const handleRedeployFailedProduct = async (accountName: string, productId: string) => {
        const account = allAccounts.find(acc => acc.name === accountName);
        if (!account) {
            alert('错误：找不到当前账号的数据。');
            return;
        }

        // Remove the specific scheduled item object and add the ID to the end of the queue
        const newPendingList = (account['待上架'] || [])
            .filter(item => {
                const id = typeof item === 'object' && item !== null ? item.id : item;
                return String(id) !== String(productId);
            });
        
        newPendingList.push(productId);

        try {
            const { error } = await supabase
                .from('accounts_duplicate')
                .update({ '待上架': newPendingList, updated_at: new Date().toISOString() })
                .eq('name', accountName);

            if (error) throw error;

            alert(`商品 #${productId} 已被重新加入待上架队列末尾。`);
            await fetchAccounts(); // Refresh all data to ensure consistency
        } catch (err) {
            alert(`重新上架失败: ${getErrorMessage(err)}`);
        }
    };

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
                                keyword: kw.trim(),
                                search_history: [] // Add default empty history
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

    const handleToggleAutomation = async (accountName: string, newStatus: boolean) => {
        // Optimistic UI update
        const originalAccounts = [...allAccounts];
        setAllAccounts(prev => prev.map(acc => {
            if (acc.name === accountName) {
                const newRule = { ...(acc.scheduling_rule || { items_per_day: 0 }), enabled: newStatus };
                return { ...acc, scheduling_rule: newRule };
            }
            return acc;
        }));

        try {
            const response = await fetch('/api/update-automation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accountName, newStatus }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to update automation status');
            }
            // Optional: You can refresh accounts from the server to be 100% sure,
            // but the optimistic update should suffice.
            // await fetchAccounts(); 

        } catch (e) {
            alert(`更新自动化状态失败: ${getErrorMessage(e)}`);
            // Revert UI on failure
            setAllAccounts(originalAccounts);
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
            <KeywordManagementView
                account={selectedAccountForKeywords}
                onBack={handleBackFromKeywords}
                keywords={keywordsForEditing}
                loading={loadingKeywords}
                error={errorKeywords}
                onKeywordTextChange={handleKeywordTextChange}
                onUpdateKeyword={handleUpdateKeyword}
                onDeleteKeyword={handleDeleteKeywordFromList}
                onAddNewKeyword={handleAddNewKeyword}
                onGenerateRelatedKeywords={handleGenerateRelatedKeywords}
                isBatchGenerating={isBatchGeneratingKeywords}
            />
        );
    }


    // Render Product Detail View
    if (selectedAccountForProducts) {
  return (
            <ProductDetailView
                account={selectedAccountForProducts}
                products={products}
                allAccounts={allAccounts}
                loading={loadingProducts}
                error={errorProducts}
                onBack={handleBackFromProducts}
                onDeleteProduct={handleDeleteProduct}
                onDuplicateProduct={handleDuplicateProduct}
                onDeployProduct={handleDeployProduct}
                onUpdateProducts={() => fetchProductsForAccount(selectedAccountForProducts.name)}
                                            callAi={callAIApiWithFallback}
                onSaveKeywordsToAccount={handleSaveKeywordsToAccount}
                onDeleteKeywordFromAccountLibrary={handleDeleteKeywordFromLibrary}
                onManageAccountKeywords={handleAccountSelectForKeywords}
                onSaveBusinessDescription={(accountName, newDescription) => handleSaveAccountField(accountName, '业务描述', newDescription)}
                isAiAnalysisModalOpen={isAnalysisModalOpen}
                setIsAiAnalysisModalOpen={setIsAnalysisModalOpen}
                aiAnalysisInput={aiAnalysisInput}
                setAiAnalysisInput={setAiAnalysisInput}
                isAiAnalyzing={isAnalyzing}
                handleAiAnalysis={handleAnalyzeTopProducts}
                aiAnalysisResult={analysisResult}
            />
        );
    }


    // Render Main Account List View
                                               return (
        <>
            <AccountListView
                accounts={allAccounts}
                loading={loadingAccounts}
                error={errorAccounts}
                deletingAccount={deletingAccount}
                onDragEnd={handleOnDragEnd}
                onAccountSelect={handleAccountSelectForProducts}
                onDeleteAccount={handleDeleteAccount}
                onSettingsClick={setEditingAccount}
                onOpenAddAccountModal={() => setIsAddAccountModalOpen(true)}
                onOpenAiAddAccountModal={() => setIsAiAddAccountModalOpen(true)}
                                            editingSchedule={editingSchedule}
                                            setEditingSchedule={setEditingSchedule}
                onUpdateScheduleTime={handleUpdateScheduleTime}
                onDeleteItemFromArray={handleDeleteItemFromArray}
                onRedeploy={handleRedeployFailedProduct}
                onToggleAutomation={handleToggleAutomation}
                isAddAccountModalOpen={isAddAccountModalOpen}
                closeAddAccountModal={() => {
                                    setIsAddAccountModalOpen(false);
                                    setNewAccountName('');
                                    setNewXhsAccount('');
                                    setNewXianyuAccount('');
                                    setNewPhoneModel('');
                                }}
                newAccountName={newAccountName} setNewAccountName={setNewAccountName}
                newXhsAccount={newXhsAccount} setNewXhsAccount={setNewXhsAccount}
                newXianyuAccount={newXianyuAccount} setNewXianyuAccount={setNewXianyuAccount}
                newPhoneModel={newPhoneModel} setNewPhoneModel={setNewPhoneModel}
                isAddingAccount={isAddingAccount}
                onConfirmAddAccount={handleAddAccount}
                isAiAddAccountModalOpen={isAiAddAccountModalOpen}
                closeAiAddAccountModal={() => setIsAiAddAccountModalOpen(false)}
                aiBatchInput={aiBatchInput} setAiBatchInput={setAiBatchInput}
                isAiAddingAccounts={isAiAddingAccounts}
                onConfirmAiAddAccounts={handleAiBatchAddAccounts}
                fetchAccounts={fetchAccounts}
            />
            {editingAccount && (
                <SettingsModal
                    account={editingAccount}
                    onClose={() => setEditingAccount(null)}
                    onSaveField={handleSaveAccountField}
                    onSaveKeywords={handleSaveKeywords}
                    onGenerateKeywords={handleGenerateKeywords}
                    onSaveRule={handleSaveRule}
                    onNavigateToKeywords={handleAccountSelectForKeywords}
                    editingCopywritingPrompts={editingCopywritingPrompts}
                    setEditingCopywritingPrompts={setEditingCopywritingPrompts}
                    editingBusinessPrompts={editingBusinessPrompts}
                    setEditingBusinessPrompts={setEditingBusinessPrompts}
                    editingKeywordPrompts={editingKeywordPrompts}
                    setEditingKeywordPrompts={setEditingKeywordPrompts}
                    editingKeywords={editingKeywords}
                    setEditingKeywords={setEditingKeywords}
                    editingXhs={editingXhs}
                    setEditingXhs={setEditingXhs}
                    editingXianyu={editingXianyu}
                    setEditingXianyu={setEditingXianyu}
                    editingPhone={editingPhone}
                    setEditingPhone={setEditingPhone}
                    editingRules={editingRules}
                    setEditingRules={setEditingRules}
                    loadingStates={loadingStates}
                    now={now}
                />
            )}
        </>
  );
}
