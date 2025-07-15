'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import ProductCard from '@/components/ProductCard'; // Import the new component

// --- Environment Variables --- 
const supabaseUrl = 'https://urfibhtfqgffpanpsjds.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVyZmliaHRmcWdmZnBhbnBzamRzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzU3ODU2NDUsImV4cCI6MjA1MTM2MTY0NX0.Q1WPGBj23uSL3RKhYxGhs7Si1_HfrvC9P-JxkXl6eVE';
const geminiApiKey = "AIzaSyApuy_ax9jhGXpUdlgI6w_0H5aZ7XiY9vU";

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

// --- Type Definitions ---
type Account = {
  name: string;
  created_at: string;
  updated_at: string;
  '待上架': string[] | null;
  '已上架': string[] | null;
  '点赞队列': string[] | null;
  '已点赞': string[] | null;
  '关键词prompt': string | null;
  '业务描述': string | null;
  keywords?: string | null; // <-- Add keywords property
};

type AccountKeywords = {
    id: number; // <-- Add ID for editing/deleting
    account_name: string;
    keyword: string;
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
};

type ProductSchedule = {
    id: string; // UUID
  product_id: string; // Corrected type
    account_name: string;
  status: string;
};


// --- Helper Components ---
const TagList: React.FC<{ 
    title: string; 
    items: string[] | null; 
    color: string;
    accountName: string;
    arrayKey: keyof Account;
    onDeleteItem: (accountName: string, arrayKey: keyof Account, item: string) => void;
}> = ({ title, items, color, accountName, arrayKey, onDeleteItem }) => (
    <div>
        <h4 className={`font-semibold text-sm mb-1 text-${color}-600 dark:text-${color}-400`}>{title} ({items?.length || 0})</h4>
        <div className="flex flex-wrap gap-1">
            {(items && items.length > 0) ? (
                items.map((item, index) => (
                    <span key={index} className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono bg-${color}-100 dark:bg-${color}-900/50 text-${color}-800 dark:text-${color}-300 group/tag relative`}>
                        {item}
                        <button 
                            onClick={(e) => {
                                e.stopPropagation(); // Prevent card click which navigates to product list
                                onDeleteItem(accountName, arrayKey, item);
                            }}
                            className="ml-1.5 -mr-0.5 opacity-0 group-hover/tag:opacity-100 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-200 focus:opacity-100 transition-opacity"
                            aria-label={`Remove ${item}`}
                        >
                            &times;
                        </button>
                    </span>
                ))
            ) : (
                <span className="text-xs text-gray-500 dark:text-gray-400">无</span>
            )}
        </div>
    </div>
);

// --- Main Page Component ---
export default function AccountsPage() {
    // State for accounts
    const [allAccounts, setAllAccounts] = useState<Account[]>([]); 
    const [loadingAccounts, setLoadingAccounts] = useState<boolean>(true);
    const [errorAccounts, setErrorAccounts] = useState<string | null>(null);
    const [newAccountName, setNewAccountName] = useState<string>('');
    const [isAddingAccount, setIsAddingAccount] = useState<boolean>(false); 
    const [deletingAccount, setDeletingAccount] = useState<string | null>(null); 
    const [isAddAccountModalOpen, setIsAddAccountModalOpen] = useState<boolean>(false);
    
    // State for Keywords and Prompts
    const [editingKeywords, setEditingKeywords] = useState<{ [key: string]: string }>({});
    const [editingKeywordPrompts, setEditingKeywordPrompts] = useState<{ [key: string]: string }>({});
    const [editingBusinessPrompts, setEditingBusinessPrompts] = useState<{ [key: string]: string }>({});
    const [loadingStates, setLoadingStates] = useState<{ [key: string]: { ai: boolean; saveKeywords: boolean; saveKwPrompt: boolean; saveBizPrompt: boolean; } }>({});
    const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set());


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


    // State for AI Prompt
    const [globalPrompt, setGlobalPrompt] = useState<string>('');
    const [loadingPrompt, setLoadingPrompt] = useState<boolean>(true);
    const [savingPrompt, setSavingPrompt] = useState<boolean>(false);
    const [promptError, setPromptError] = useState<string | null>(null);
    const [productSchedules, setProductSchedules] = useState<ProductSchedule[]>([]);


    // --- Data Fetching ---
    const fetchAccounts = useCallback(async () => {
        setLoadingAccounts(true);
        setErrorAccounts(null);
        try {
            // Fetch accounts and keywords in parallel
            const [accountsPromise, keywordsPromise] = await Promise.all([
                 supabase
                    .from('accounts_duplicate')
                    .select('name, created_at, updated_at, "待上架", "已上架", "点赞队列", "已点赞", "关键词prompt", "业务描述"')
                    .order('name', { ascending: true }),
                 supabase.from('important_keywords_本人').select('id, account_name, keyword') // <-- Use new 'keyword' column
            ]);
            
            const { data: accounts, error: accountsError } = accountsPromise;
            if (accountsError) throw accountsError;

            const { data: keywordsData, error: keywordsError } = keywordsPromise;
            if (keywordsError) throw keywordsError;

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
                const joinedKeywords = (keywordsMap.get(acc.name) || []).join('\n');
                return {
                    ...acc,
                    keywords: joinedKeywords,
                    '关键词prompt': acc['关键词prompt'] || defaultKeywordPrompt,
                    '业务描述': acc['业务描述'] || defaultBusinessPrompt,
                };
            });

            const initialEditingKeywords: { [key: string]: string } = {};
            const initialKeywordPrompts: { [key: string]: string } = {};
            const initialBusinessPrompts: { [key: string]: string } = {};

            mergedAccounts.forEach(acc => {
                initialEditingKeywords[acc.name] = acc.keywords || '';
                initialKeywordPrompts[acc.name] = acc['关键词prompt']!;
                initialBusinessPrompts[acc.name] = acc['业务描述']!;
            });
            
            setAllAccounts(mergedAccounts as Account[]);
            setEditingKeywords(initialEditingKeywords);
            setEditingKeywordPrompts(initialKeywordPrompts);
            setEditingBusinessPrompts(initialBusinessPrompts);

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
                .select('id, account_name, keyword')
                .eq('account_name', accountName)
                .order('id', { ascending: true });
            
            if (error) throw error;
            setKeywordsForEditing(data);

        } catch(err: unknown) {
            setErrorKeywords(`加载关键词列表失败: ${getErrorMessage(err)}`);
        } finally {
            setLoadingKeywords(false);
        }
    }, []);

    const fetchGlobalPrompt = useCallback(async () => {
        setLoadingPrompt(true);
        try {
            const { data, error } = await supabase
                .from('app_settings')
                .select('value')
                .eq('key', 'global_ai_prompt')
                .limit(1)
                .single();

            if (error && error.code !== 'PGRST116') { // Gracefully handle no-row error
                throw error;
            }
            if (data && data.value) {
                setGlobalPrompt(data.value);
            } else {
                setGlobalPrompt('请根据以下信息，为我生成一段吸引人的社交媒体商品推广文案：');
            }
        } catch (error: unknown) {
            setPromptError(getErrorMessage(error));
        } finally {
            setLoadingPrompt(false);
        }
    }, []);

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

    // --- Initial Data Load ---
    useEffect(() => {
        fetchAccounts();
        fetchGlobalPrompt();
        fetchProductSchedules();
    }, [fetchAccounts, fetchGlobalPrompt, fetchProductSchedules]);


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
            const defaultKeywordPrompt = '你是一个关键词生成工具。请为我生成5到10个相关的中文推广关键词。严格遵守以下规则：1. 只返回关键词本身。2. 每个关键词占一行。3. 禁止添加任何编号、符号、解释或无关的对话。';
            const defaultBusinessPrompt = `我的业务是推广名为"${trimmedName}"的社交媒体账号，用于发布相关内容以吸引客户。`;
            const { error } = await supabase
                .from('accounts_duplicate')
                .insert({ 
                    name: trimmedName,
                    '关键词prompt': defaultKeywordPrompt,
                    '业务描述': defaultBusinessPrompt,
                 });
            if (error) throw error;
            alert(`账号 "${trimmedName}" 添加成功！`);
            fetchAccounts(); 
            setIsAddAccountModalOpen(false); // Close modal on success
            setNewAccountName(''); // Reset input
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
            const res = await fetch(geminiApiUrl, { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify({ contents: [{ parts: [{ text: finalPrompt }] }] }) 
            });
            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(`AI API 错误: ${errorData.error.message}`);
            }
            const data = await res.json();
            const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text;

            if (aiText) {
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

            } else {
                throw new Error("AI未能返回有效的关键词。");
            }
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

    const handleSaveAccountField = async (accountName: string, field: '关键词prompt' | '业务描述', value: string) => {
        const stateKey = field === '关键词prompt' ? 'saveKwPrompt' : 'saveBizPrompt';
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
        const validArrayKeys: (keyof Account)[] = ['待上架', '已上架', '点赞队列', '已点赞'];
        if (!validArrayKeys.includes(arrayKey)) {
            console.error("Invalid key passed to handleDeleteItemFromArray:", arrayKey);
            return;
        }

        if (!confirm(`确定要从 "${accountName}" 的 "${arrayKey}" 列表中移除 "${itemToDelete}" 吗？`)) return;

        const originalAccount = allAccounts.find(acc => acc.name === accountName);
        if (!originalAccount) return;

        const originalArray = (originalAccount[arrayKey] as string[] | null) || [];
        const newArray = originalArray.filter(item => item !== itemToDelete);

        // Optimistic UI update
        setAllAccounts(prevAccounts => 
            prevAccounts.map(acc => 
                acc.name === accountName ? { ...acc, [arrayKey]: newArray } : acc
            )
        );

        // Update Supabase
        try {
            const { error } = await supabase
                .from('accounts_duplicate')
                .update({ [arrayKey]: newArray, updated_at: new Date().toISOString() })
                .eq('name', accountName);

            if (error) {
                alert(`删除失败: ${error.message}`);
                // Revert UI on failure by restoring the original account
                setAllAccounts(prevAccounts => 
                    prevAccounts.map(acc => 
                        acc.name === accountName ? originalAccount : acc
                    )
                );
            }
        } catch (err: unknown) {
            alert(`删除时发生意外错误: ${getErrorMessage(err)}`);
            // Also revert UI
             setAllAccounts(prevAccounts => 
                prevAccounts.map(acc => 
                    acc.name === accountName ? originalAccount : acc
                )
            );
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
            alert(`关键词 #${id} 已删除！`);
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

    const toggleAccountExpansion = (accountName: string) => {
        setExpandedAccounts(prev => {
            const newSet = new Set(prev);
            if (newSet.has(accountName)) {
                newSet.delete(accountName);
            } else {
                newSet.add(accountName);
            }
            return newSet;
        });
    };

    // --- Product Management ---
    const handleDeleteProduct = async (productId: string) => {
        try {
            const { error } = await supabase
                .from('search_results_duplicate_本人')
                .delete()
                .eq('id', productId);
            if (error) throw error;
            // On success, remove the product from the local state to update UI instantly
            setProducts(prev => prev.filter(p => p.id !== productId));
        } catch (error: unknown) {
            console.error("Delete product failed:", error);
            // Re-throw to be caught by the card and display an error
            throw new Error(getErrorMessage(error));
        }
    };

    const handleDeployProduct = async (productId: string) => {
        if (!selectedAccountForProducts) {
            alert('请先选择一个账户');
            return;
        }

        try {
            // Add product to the "待上架" list of the selected account
            const currentPending = selectedAccountForProducts['待上架'] || [];
            if (currentPending.includes(productId)) {
                alert('该产品已在待上架列表中。');
                return;
            }

            const newPending = [...currentPending, productId];
            
            const { error } = await supabase
                .from('accounts_duplicate')
                .update({ '待上架': newPending, updated_at: new Date().toISOString() })
                .eq('name', selectedAccountForProducts.name);

            if (error) throw error;

            alert(`产品 ${productId} 已成功添加到账户 ${selectedAccountForProducts.name} 的待上架队列。`);

            // Optimistically update local state
            const updatedAccount = { ...selectedAccountForProducts, '待上架': newPending };
            setSelectedAccountForProducts(updatedAccount);

            // Also update the main accounts list
            setAllAccounts(prev => prev.map(acc => acc.name === selectedAccountForProducts.name ? updatedAccount : acc));

        } catch (err: unknown) {
            console.error('Error deploying product:', err);
            alert(`投放产品时出错: ${getErrorMessage(err)}`);
        }
    };

    const handleSavePrompt = async () => {
        setSavingPrompt(true);
        setPromptError(null);
        try {
            const { error } = await supabase
                .from('app_settings')
                .upsert({ key: 'global_ai_prompt', value: globalPrompt }, { onConflict: 'key' });

            if (error) throw error;
            alert('提示词已成功保存到云端！');
        } catch (error: unknown) {
            setPromptError(getErrorMessage(error));
            alert(`保存提示词失败: ${getErrorMessage(error)}`);
        } finally {
            setSavingPrompt(false);
        }
    };


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


    // --- RENDER LOGIC ---

    // Render Keyword Management View
    if (selectedAccountForKeywords) {
        return (
            <div className="p-5 font-sans bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 min-h-screen">
                 <div className="flex items-center gap-4 mb-4">
                    <button
                        onClick={handleBackToAccounts}
                        className="bg-gray-500 hover:bg-gray-600 text-white text-sm py-1.5 px-4 rounded-md cursor-pointer"
                    >
                        ← 返回账户列表
                    </button>
                    <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-200">
                        <span className="font-normal">管理关键词: </span>
                        {selectedAccountForKeywords.name}
                    </h1>
                    <button 
                        onClick={handleAddNewKeyword}
                        className="ml-auto bg-green-500 hover:bg-green-600 text-white text-sm py-1.5 px-4 rounded-md"
                    >
                        + 新增关键词
                    </button>
                </div>

                {loadingKeywords && <p className="italic">正在加载关键词...</p>}
                {errorKeywords && <p className="text-red-500">{errorKeywords}</p>}
                
                <div className="space-y-3">
                    {keywordsForEditing.map(kw => (
                        <div key={kw.id} className="flex items-center gap-2 p-2 border rounded-md bg-gray-50 dark:bg-gray-800">
                           <span className="text-sm font-mono text-gray-500 w-12">ID: {kw.id}</span>
                           <input
                             type="text"
                             value={kw.keyword}
                             onChange={(e) => handleKeywordTextChange(kw.id, e.target.value)}
                             className="flex-grow p-1.5 border rounded-md text-sm dark:bg-gray-700 dark:border-gray-600"
                           />
                <button
                             onClick={() => handleUpdateKeyword(kw.id)}
                             className="bg-blue-500 hover:bg-blue-600 text-white text-xs py-1.5 px-3 rounded-md"
                >
                             保存
                </button>
                <button
                              onClick={() => handleDeleteKeywordFromList(kw.id)}
                              className="bg-red-500 hover:bg-red-600 text-white text-xs py-1.5 px-3 rounded-md"
                >
                             删除
                </button>
                        </div>
                    ))}
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
                <div className="flex items-center gap-4 mb-4">
                <button
                        onClick={handleBackToAccounts}
                        className="bg-gray-500 hover:bg-gray-600 text-white text-sm py-1.5 px-4 rounded-md cursor-pointer"
                >
                        ← 返回账户列表
                </button>
                    <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-200">
                        <span className="font-normal">账号: </span>
                        {selectedAccountForProducts.name}
            </h1>
                </div>

                <div className="mb-6 p-4 border rounded-lg bg-gray-50 dark:bg-gray-800">
                    <label htmlFor="aiPromptInput" className="block text-lg font-semibold text-gray-800 dark:text-gray-100 mb-2">全局 AI 提示词:</label>
                    {loadingPrompt && <p className="italic">正在加载...</p>}
                    {promptError && <p className="text-red-500">{promptError}</p>}
                    {!loadingPrompt && (
                        <textarea
                            id="aiPromptInput"
                            value={globalPrompt}
                            onChange={(e) => setGlobalPrompt(e.target.value)}
                            rows={3}
                            className="w-full p-2 border rounded dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600"
                            disabled={savingPrompt}
                        />
                    )}
                    <button onClick={handleSavePrompt} disabled={loadingPrompt || savingPrompt} className="mt-2 bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 disabled:opacity-50">
                        {savingPrompt ? '保存中...' : '保存提示词'}
                    </button>
                </div>

                <hr className="my-6 border-gray-300 dark:border-gray-600" />
                
                <h2 className="text-xl font-semibold mb-3">商品列表</h2>
                {loadingProducts && <p className="text-gray-600 dark:text-gray-400 italic">正在加载商品...</p>}
                {errorProducts && <p className="text-red-600 dark:text-red-400">{errorProducts}</p>}

                {!loadingProducts && !errorProducts && (
                     <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                        {products.map(product => {
                            const deployedTo = productSchedules
                                .filter(s => s.product_id === product.id)
                                .map(s => s.account_name);
                            const isPending = selectedAccountForProducts?.['待上架']?.includes(product.id) ?? false;
                            return (
                                <ProductCard 
                                    key={product.id} 
                                    product={product} 
                                    onDelete={handleDeleteProduct} 
                                    onDeploy={handleDeployProduct} 
                                    globalPrompt={globalPrompt} 
                                    deployedTo={deployedTo} 
                                    isPending={isPending}
                                />
                            );
                        })}
                    </div>
                )}
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
                   <button
                    onClick={() => setIsAddAccountModalOpen(true)}
                    className="bg-green-500 hover:bg-green-600 text-white text-sm font-bold py-2 px-4 rounded"
                    >
                    + 添加账号
                    </button>
                </div>
            
            <hr className="my-6 border-gray-300 dark:border-gray-600" />

            <h2 className="text-xl font-semibold mb-3">账号列表</h2>
            {loadingAccounts && <p>正在加载账号...</p>}
            {errorAccounts && <p className="text-red-500">{errorAccounts}</p>}
            
            {!loadingAccounts && !errorAccounts && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {allAccounts.map(account => (
                        <div key={account.name}
                             onClick={() => handleAccountSelectForProducts(account)}
                             className="border border-gray-200 dark:border-gray-700 p-4 rounded-lg bg-white dark:bg-gray-800 shadow-md relative group/account flex flex-col gap-3 cursor-pointer hover:border-blue-500 dark:hover:border-blue-400 transition-colors"
                        >
                <button
                                onClick={(e) => { e.stopPropagation(); handleDeleteAccount(account.name); }}
                                disabled={deletingAccount === account.name}
                                className="absolute top-2 right-2 p-1 bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-800/70 rounded-full opacity-0 group-hover/account:opacity-100 z-10"
                >
                                {deletingAccount === account.name ? "..." : "✕"}
                </button>
                            <h3 className="font-bold text-lg border-b pb-2 pr-8">{account.name}</h3>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                                <TagList title="待上架" items={account['待上架']} color="orange" accountName={account.name} arrayKey="待上架" onDeleteItem={handleDeleteItemFromArray} />
                                <TagList title="已上架" items={account['已上架']} color="green" accountName={account.name} arrayKey="已上架" onDeleteItem={handleDeleteItemFromArray} />
                                <TagList title="点赞队列" items={account['点赞队列']} color="blue" accountName={account.name} arrayKey="点赞队列" onDeleteItem={handleDeleteItemFromArray} />
                                <TagList title="已点赞" items={account['已点赞']} color="purple" accountName={account.name} arrayKey="已点赞" onDeleteItem={handleDeleteItemFromArray} />
                            </div>

                            <div className="border-t border-gray-200 dark:border-gray-600 mt-2 pt-2">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        toggleAccountExpansion(account.name);
                                    }}
                                    className="w-full text-sm font-semibold text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100 flex justify-between items-center"
                                >
                                    <span>高级设置</span>
                                    <span className={`transform transition-transform ${expandedAccounts.has(account.name) ? 'rotate-180' : 'rotate-0'}`}>▼</span>
                                </button>
                            </div>
                            
                            {expandedAccounts.has(account.name) && (
                                <>
                                    {/* Keywords Section */}
                                    <div className="border-t border-gray-200 dark:border-gray-600 mt-3 pt-3">
                                        <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 block mb-1">推广关键词</label>
                                        <textarea
                                            value={editingKeywords[account.name] || ''}
                                            onChange={(e) => setEditingKeywords(prev => ({...prev, [account.name]: e.target.value}))}
                                            onClick={(e) => e.stopPropagation()}
                                            placeholder="点击AI生成或手动输入关键词..."
                                            rows={3}
                                            className="w-full p-1.5 border rounded-md text-xs bg-gray-50 dark:bg-gray-700 dark:border-gray-500"
                                        />
                                        <div className="flex gap-2 mt-2">
                                            <button 
                                                onClick={(e) => {e.stopPropagation(); handleGenerateKeywords(account.name)}}
                                                disabled={loadingStates[account.name]?.ai}
                                                className="flex-1 bg-blue-500 hover:bg-blue-600 text-white text-xs py-1 px-2 rounded disabled:opacity-50"
                                            >
                                                {loadingStates[account.name]?.ai ? '生成中...' : 'AI生成'}
                                            </button>
                                            <button 
                                                onClick={(e) => {e.stopPropagation(); handleSaveKeywords(account.name)}}
                                                disabled={loadingStates[account.name]?.saveKeywords || editingKeywords[account.name] === (account.keywords || '')}
                                                className="flex-1 bg-green-500 hover:bg-green-600 text-white text-xs py-1 px-2 rounded disabled:opacity-50"
                                            >
                                                {loadingStates[account.name]?.saveKeywords ? '保存中...' : '保存'}
                                            </button>
                                        </div>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleAccountSelectForKeywords(account); }}
                                            className="w-full mt-2 bg-purple-500 hover:bg-purple-600 text-white text-xs py-1 px-2 rounded"
                                        >
                                            管理关键词 &rarr;
                                        </button>
                                    </div>
                                    
                                    {/* Prompts Section */}
                                    <div className="border-t border-gray-200 dark:border-gray-600 mt-3 pt-3 space-y-3">
                                       <div>
                                            <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 block mb-1">关键词生成提示词</label>
                                            <textarea
                                                value={editingKeywordPrompts[account.name] || ''}
                                                onChange={(e) => setEditingKeywordPrompts(prev => ({...prev, [account.name]: e.target.value}))}
                                                onClick={(e) => e.stopPropagation()}
                                                rows={3}
                                                className="w-full p-1.5 border rounded-md text-xs bg-gray-50 dark:bg-gray-700 dark:border-gray-500"
                                            />
                                            <button
                                                onClick={(e) => {e.stopPropagation(); handleSaveAccountField(account.name, '关键词prompt', editingKeywordPrompts[account.name])}}
                                                disabled={loadingStates[account.name]?.saveKwPrompt || editingKeywordPrompts[account.name] === (account['关键词prompt'] || '')}
                                                className="w-full mt-1 bg-teal-500 hover:bg-teal-600 text-white text-xs py-1 px-2 rounded disabled:opacity-50"
                                            >
                                                {loadingStates[account.name]?.saveKwPrompt ? '保存中...' : '保存生成提示词'}
                                            </button>
                                       </div>
                                       <div>
                                            <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 block mb-1">业务描述</label>
                                            <textarea
                                                value={editingBusinessPrompts[account.name] || ''}
                                                onChange={(e) => setEditingBusinessPrompts(prev => ({...prev, [account.name]: e.target.value}))}
                                                onClick={(e) => e.stopPropagation()}
                                                rows={3}
                                                className="w-full p-1.5 border rounded-md text-xs bg-gray-50 dark:bg-gray-700 dark:border-gray-500"
                                            />
                                            <button
                                                 onClick={(e) => {e.stopPropagation(); handleSaveAccountField(account.name, '业务描述', editingBusinessPrompts[account.name])}}
                                                disabled={loadingStates[account.name]?.saveBizPrompt || editingBusinessPrompts[account.name] === (account['业务描述'] || '')}
                                                className="w-full mt-1 bg-teal-500 hover:bg-teal-600 text-white text-xs py-1 px-2 rounded disabled:opacity-50"
                                            >
                                                {loadingStates[account.name]?.saveBizPrompt ? '保存中...' : '保存筛选提示词'}
                                            </button>
                                       </div>
                                    </div>
                                </>
                            )}


                            <div className="text-xs text-gray-400 dark:text-gray-500 border-t mt-auto pt-2">
                                <div>更新于: {new Date(account.updated_at).toLocaleString()}</div>
            </div>
                            </div>
                        ))}
                    </div>
                )}
             {!loadingAccounts && !errorAccounts && allAccounts.length === 0 && (
                <div className="text-center p-5 text-gray-500">没有找到任何账号。</div>
                    )}
            
            {isAddAccountModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-md">
                        <h2 className="text-xl font-bold mb-4">添加新账号</h2>
                        <input 
                            type="text" 
                            placeholder="输入新账号名称" 
                            value={newAccountName} 
                            onChange={(e) => setNewAccountName(e.target.value)} 
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-500 rounded-md text-sm mb-4"
                        />
                        <div className="flex justify-end gap-3">
                <button
                                onClick={() => {
                                    setIsAddAccountModalOpen(false);
                                    setNewAccountName('');
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
    </div>
  );
}
