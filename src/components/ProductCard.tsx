'use client';

import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import Image from 'next/image';

// --- Types ---
type Product = {
  id: string;
    keyword: string | null;
    result_image_url: string | null;
    result_text_content: string | null;
  created_at: string;
  '修改后文案': string | null;
  '价格': string | null;
  'ai提取关键词': string | null;
  type: string | null;
  // Other fields are not directly used in this component but are part of the object
  keywords_extracted_at?: string | null;
};

interface ProductCardProps {
    product: Product;
    onDelete: (id: string) => Promise<void>;
    onDuplicate: (id: string) => Promise<void>;
    onDeploy: (productId: string) => Promise<void>;
    onUpdate: () => void; // Callback to notify parent of an update
    callAi: (prompt: string) => Promise<string>;
    accountName: string;
    onSaveKeywords: (accountName: string, keywords: string[]) => Promise<void>;
    onDeleteKeywordFromLibrary: (accountName: string, keyword: string) => Promise<void>;
    customCopywritingPrompt: string; // Replaced globalPrompt
    businessDescription: string;
    onManageAccountKeywords: () => void; // New prop for navigation
    deployedTo: string[]; // List of account names this product is already deployed to
    isPending: boolean;
}

// --- Environment Variables ---
const supabaseUrl = 'https://urfibhtfqgffpanpsjds.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVyZmliaHRmcWdmZnBhbnBzamRzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzU3ODU2NDUsImV4cCI6MjA1MTM2MTY0NX0.Q1WPGBj23uSL3RKhYxGhs7Si1_HfrvC9P-JxkXl6eVE';

const databaseUrl = supabaseUrl ? `${supabaseUrl}/rest/v1/search_results_duplicate_本人` : null;

// --- Helper Functions ---
const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error) return error.message;
    return String(error);
};

const getRelativeTime = (isoString: string) => {
    const date = new Date(isoString);
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    const diffTime = startOfToday.getTime() - new Date(date).setHours(0,0,0,0);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (date >= startOfToday) {
        return "今天爬取";
    }
    if (diffDays === 0) { // Should be caught by the above, but as a fallback
        return "今天爬取";
    }
    if (diffDays === 1) {
         return "1天前爬取";
    }
    return `${diffDays}天前爬取`;
};

// --- Main Component ---
const ProductCard: React.FC<ProductCardProps> = ({ product, onDelete, onDuplicate, onDeploy, onUpdate, callAi, accountName, onSaveKeywords, onDeleteKeywordFromLibrary, customCopywritingPrompt, businessDescription, onManageAccountKeywords, deployedTo, isPending }) => {
    // Component State
    const [modifiedDescription, setModifiedDescription] = useState(product['修改后文案'] || product.result_text_content || '');
    const [isDescriptionDirty, setIsDescriptionDirty] = useState(false);
    const [aiKeywords, setAiKeywords] = useState<string[]>([]);
    const [selectedKeywords, setSelectedKeywords] = useState<Set<string>>(new Set());
    const [isLoadingKeywords, setIsLoadingKeywords] = useState(false);
    const [isAiToolsExpanded, setIsAiToolsExpanded] = useState(false); // For accordion
    const [newImageUrl, setNewImageUrl] = useState('');
    const [isLoadingAI, setIsLoadingAI] = useState(false);
    const [isLoadingConfirm, setIsLoadingConfirm] = useState(false);
    const [cardError, setCardError] = useState<string | null>(null);
    const [imageUrl, setImageUrl] = useState(product.result_image_url);
    const [isDeploying, setIsDeploying] = useState(false);
    const [deployError, setDeployError] = useState<string | null>(null);
    const [isEditingModalOpen, setIsEditingModalOpen] = useState(false); // For the new editing modal
    const [hasSavedCopy, setHasSavedCopy] = useState(!!product['修改后文案']);
    const [isGeneratingImage, setIsGeneratingImage] = useState(false);
    const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null); // This will hold the base64 data URL
    const [isSavingImage, setIsSavingImage] = useState(false);
    const [isSuggestingKeyword, setIsSuggestingKeyword] = useState(false);
    const [isSearchingImage, setIsSearchingImage] = useState(false);
    const [imageSearchKeyword, setImageSearchKeyword] = useState('');
    const originalTextareaRef = useRef<HTMLTextAreaElement>(null);
    const modifiedTextareaRef = useRef<HTMLTextAreaElement>(null);

    // Reset state if product prop changes
    useEffect(() => {
        setModifiedDescription(product['修改后文案'] || product.result_text_content || '');
        setIsDescriptionDirty(false);
        setAiKeywords((product['ai提取关键词'] || '').split('\n').filter(Boolean));
        setSelectedKeywords(new Set());
        setImageUrl(product.result_image_url);
        setCardError(null);
        setDeployError(null);
            setIsDeploying(false);
        setIsAiToolsExpanded(false);
        setIsEditingModalOpen(false);
        setHasSavedCopy(!!product['修改后文案']);
        setIsGeneratingImage(false);
        setGeneratedImageUrl(null);
        setIsSavingImage(false);
        setImageSearchKeyword('');
        setIsSuggestingKeyword(false);
        setIsSearchingImage(false);
    }, [product]);

    const handleDeleteKeyword = async (keywordToDelete: string) => {
        const originalKeywords = [...aiKeywords];
        const newKeywords = originalKeywords.filter(k => k !== keywordToDelete);
        
        // Optimistically update UI
        setAiKeywords(newKeywords);
        
        try {
            // Update product's own keyword list
            const updateRes = await fetch(`${databaseUrl}?id=eq.${product.id}`, {
                method: 'PATCH',
                headers: { 'apikey': supabaseAnonKey, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
                body: JSON.stringify({ "ai提取关键词": newKeywords.join('\n') })
            });
            if (!updateRes.ok) {
                throw new Error(`Failed to update product keywords: ${await updateRes.text()}`);
            }

            // Call parent to delete from central library
            await onDeleteKeywordFromLibrary(accountName, keywordToDelete);
            
            onUpdate(); // Refresh parent state

        } catch (e) {
            if (getErrorMessage(e).includes('confirm')) {
                // User cancelled the action in the confirmation dialog, so no error message is needed
                setAiKeywords(originalKeywords); // Revert UI
                return;
            }
            setCardError(getErrorMessage(e));
            // Revert UI on failure
            setAiKeywords(originalKeywords);
        }
    };

    const handleAiSuggestKeyword = async () => {
        setIsSuggestingKeyword(true);
        setCardError(null);
        try {
            const keywordPrompt = `
                Based on the following product description, what is the single best English keyword for finding a representative stock photo?
                Return ONLY the single keyword, with no explanation or extra text.
                Description:
                ---
                ${modifiedDescription}
                ---
            `;
            const keyword = await callAi(keywordPrompt);
            if (!keyword.trim()) {
                throw new Error("AI did not suggest a keyword.");
            }
            setImageSearchKeyword(keyword.trim());
        } catch (e) {
            setCardError(getErrorMessage(e));
        } finally {
            setIsSuggestingKeyword(false);
        }
    };

    const handleSearchImageWithKeyword = async () => {
        if (!imageSearchKeyword.trim()) {
            setCardError("Please provide a keyword to search for an image.");
            return;
        }
        setIsSearchingImage(true);
        setCardError(null);
        try {
            // Call our backend API to get an image URL
            const response = await fetch('/api/find-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ keyword: imageSearchKeyword.trim() })
            });

            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || 'Failed to find image.');
            }

            // Save the new URL to the product
            await saveImageUrlToProduct(result.imageUrl);
            // The card will be updated automatically via onUpdate() triggered by saveImageUrlToProduct

        } catch (e) {
            setCardError(getErrorMessage(e));
        } finally {
            setIsSearchingImage(false);
        }
    };

    const handleExternalSearch = (engine: 'yandex' | 'bing') => {
        if (imageSearchKeyword.trim()) {
            // Keyword search
            const query = encodeURIComponent(imageSearchKeyword.trim());
            if (engine === 'yandex') {
                window.open(`https://yandex.com/images/search?text=${query}`, '_blank');
            } else {
                window.open(`https://www.bing.com/images/search?q=${query}`, '_blank');
            }
        } else if (imageUrl) {
            // Reverse image search
            const url = encodeURIComponent(imageUrl);
            if (engine === 'yandex') {
                window.open(`https://yandex.com/images/search?rpt=imageview&url=${url}`, '_blank');
            } else {
                window.open(`https://www.bing.com/images/search?view=detailv2&iss=sbi&q=imgurl:${url}`, '_blank');
            }
        }
    };


    const saveImageUrlToProduct = async (url: string) => {
        if (!databaseUrl || !url.trim()) return;
        setCardError(null);
        try {
            const res = await fetch(`${databaseUrl}?id=eq.${product.id}`, {
                method: 'PATCH',
                headers: { 'apikey': supabaseAnonKey, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
                body: JSON.stringify({ 'result_image_url': url.trim() })
            });
            if (!res.ok) throw new Error((await res.json()).message);
            setImageUrl(url.trim()); // Update local image state immediately
            setNewImageUrl(''); // Clear the input
            onUpdate(); // Trigger parent refresh
        } catch (e) {
            setCardError(getErrorMessage(e));
            throw e; // Re-throw to be caught by the calling function
        }
    };

    // Autosize Textarea Logic
    const autoResizeTextarea = (element: HTMLTextAreaElement | null) => {
        if (element) {
            element.style.height = 'auto';
            element.style.height = `${element.scrollHeight}px`;
        }
    };

    useLayoutEffect(() => {
        if (isEditingModalOpen) {
            autoResizeTextarea(originalTextareaRef.current);
            autoResizeTextarea(modifiedTextareaRef.current);
        }
    }, [isEditingModalOpen, product.result_text_content, modifiedDescription]);

    // Handlers
    const handleDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setModifiedDescription(e.target.value);
        setIsDescriptionDirty(true);
        autoResizeTextarea(e.target);
    };

    const handleGenerateImage = async () => {
        if (!modifiedDescription.trim()) {
            setCardError("文案为空，无法生成图片。");
            return;
        }
        setIsGeneratingImage(true);
        setGeneratedImageUrl(null);
        setCardError(null);

        try {
            const response = await fetch('/api/generate-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: modifiedDescription })
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || '生成图片失败');
            }

            // The API now returns a base64 data URL for preview
            setGeneratedImageUrl(result.imageUrl);

        } catch (e) {
            setCardError(getErrorMessage(e));
        } finally {
            setIsGeneratingImage(false);
        }
    };

    const handleSaveGeneratedImage = async () => {
        if (!generatedImageUrl || !generatedImageUrl.startsWith('data:image/png;base64,')) {
            setCardError("没有可保存的预览图片。");
            return;
        }
        setIsSavingImage(true);
        setCardError(null);
        try {
            // Step 1: Upload the image data to get the permanent URL
            const response = await fetch('/api/save-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageDataUrl: generatedImageUrl })
            });
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || '图片保存失败');
            }

            // Step 2: Save the new URL to the product and refresh the UI
            await saveImageUrlToProduct(result.supabaseUrl);
            
            setCardError("图片已成功保存并更新！");
            setGeneratedImageUrl(null); // Clear the preview
        } catch (e) {
            // Error will be set by saveImageUrlToProduct or caught here
            setCardError(getErrorMessage(e));
        } finally {
            setIsSavingImage(false);
        }
    };

    const modifyTextWithAI = async () => {
        if (!customCopywritingPrompt.trim()) return setCardError('账号专属的文案提示词为空');
        setIsLoadingAI(true);
        setCardError(null);
        const inputText = `${customCopywritingPrompt}\n\n[业务描述]:\n${businessDescription}\n\n[商品信息]:\n关键词: ${product.keyword}\n现有文案参考: ${modifiedDescription}`;
        try {
            const aiText = await callAi(inputText);
                setModifiedDescription(aiText.trim());
                setIsDescriptionDirty(true);
        } catch (e) { setCardError(getErrorMessage(e)); } finally { setIsLoadingAI(false); }
    };

    const extractKeywordsWithAI = async () => {
        setIsLoadingKeywords(true);
        setCardError(null);
        const original_text = product.result_text_content || '';
        const prompt = `
            请基于以下业务描述和产品文案，提取5-8个最相关英文关键词。
            要求：
            1.  每个关键词占一行。
            2.  不要添加任何编号、解释或无关文字。
            3.  英文词汇最重要要保留。
            ---
            业务描述: ${businessDescription}
            ---
            产品文案: ${original_text}
            ---
        `;
        try {
            const keywordsText = await callAi(prompt);
            const keywordsArray = keywordsText.split('\n').map(k => k.trim()).filter(Boolean);
            if (keywordsArray.length > 0) {
            const updateRes = await fetch(`${databaseUrl}?id=eq.${product.id}`, {
                method: 'PATCH',
                headers: { 'apikey': supabaseAnonKey, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
                    body: JSON.stringify({
                        "ai提取关键词": keywordsArray.join('\n'),
                        "keywords_extracted_at": new Date().toISOString()
                    })
            });
                if (!updateRes.ok) throw new Error((await updateRes.json()).message);
                setAiKeywords(keywordsArray);
                onUpdate();
            }
        } catch (e) {
            setCardError(getErrorMessage(e));
        } finally {
            setIsLoadingKeywords(false);
        }
    };

    const handleSaveKeywordsClick = async () => {
        const keywordsToSave = Array.from(selectedKeywords);
        if (keywordsToSave.length === 0) {
            alert("请至少选择一个关键词。");
            return;
        }
        await onSaveKeywords(accountName, keywordsToSave);
        onUpdate();
    };

    const handleKeywordToggle = (keyword: string) => {
        setSelectedKeywords(prev => {
            const newSet = new Set(prev);
            if (newSet.has(keyword)) newSet.delete(keyword);
            else newSet.add(keyword);
            return newSet;
        });
    };

    const confirmChanges = async () => {
        if (!databaseUrl) return setCardError('Supabase配置不完整');
        setIsLoadingConfirm(true);
        setCardError(null);
        try {
            const res = await fetch(`${databaseUrl}?id=eq.${product.id}`, { method: 'PATCH', headers: { 'apikey': supabaseAnonKey, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }, body: JSON.stringify({ "修改后文案": modifiedDescription }) });
            if (!res.ok) throw new Error((await res.json()).message);
            setIsDescriptionDirty(false);
            setHasSavedCopy(true); // Manually update save state
            setIsEditingModalOpen(false);
        } catch (e) { setCardError(getErrorMessage(e)); } finally { setIsLoadingConfirm(false); }
    };

    const updateProductImage = async () => {
        if (!databaseUrl || !newImageUrl.trim()) return;
        setCardError(null);
        try {
            await saveImageUrlToProduct(newImageUrl.trim());
        } catch { 
            /* Error is handled by the helper */
        }
    };
    
    const handleDeployClick = async () => {
        setIsDeploying(true);
        setDeployError(null);
        try {
            await onDeploy(product.id);
        } catch (e) {
            setDeployError(getErrorMessage(e));
        } finally {
            setIsDeploying(false);
        }
    };

    const searchOnXianyu = () => { const q = (product.result_text_content || '').substring(0, 40).trim(); if (q) window.open(`https://www.goofish.com/search?q=${encodeURIComponent(q)}`, '_blank'); };

    return (
        <article className="product-card border border-gray-300 dark:border-gray-700 rounded-lg shadow-md bg-white dark:bg-gray-800 flex flex-col gap-3 p-4 relative group">
            <div className="flex justify-between items-start">
                <div className="text-sm pr-8">
                    <div><strong>ID:</strong> {product.id} | <strong>价格:</strong> {product.价格 || 'N/A'}</div>
                    <div className="mt-2 flex items-center gap-2">
                        <span className="text-sm font-semibold bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 py-1 px-2.5 rounded-md">
                            {getRelativeTime(product.created_at)}
                        </span>
                        {product.keyword && (
                            <span className="text-sm font-semibold bg-teal-100 dark:bg-teal-800 text-teal-800 dark:text-teal-200 py-1 px-2.5 rounded-md">
                                关键词: {product.keyword}
                            </span>
                        )}
                    </div>
                </div>
                 <div className="absolute top-2 right-2 z-10 flex gap-2">
                    <button onClick={() => onDuplicate(product.id)} className="p-1 bg-blue-500 text-white rounded-full hover:bg-blue-700 opacity-50 group-hover:opacity-100 transition-opacity">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
             </button>
                    <button onClick={() => onDelete(product.id)} className="p-1 bg-red-500 text-white rounded-full hover:bg-red-700 opacity-50 group-hover:opacity-100 transition-opacity">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
                </div>
            {imageUrl && !imageUrl.includes('[反爬陷阱图片]') && (
                <div className="relative w-full h-48">
                    <Image src={imageUrl} alt="商品图片" fill sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw" style={{ objectFit: 'cover' }} className="rounded-md" />
                        </div>
                    )}
            
            <div className="mt-1">
                <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">原始文案</label>
                <p className="mt-1 p-2 w-full text-xs bg-gray-100 dark:bg-gray-900/50 rounded-md border dark:border-gray-600/50 max-h-24 overflow-y-auto whitespace-pre-wrap font-mono">
                    {product.result_text_content || '无原始文案'}
                </p>
            </div>

            <div className="flex gap-2">
                 <div className="relative flex-1 group/tooltip">
                    <button onClick={() => handleExternalSearch('yandex')} disabled={!imageUrl && !imageSearchKeyword.trim()} className="w-full text-xs bg-yellow-400 hover:bg-yellow-500 text-gray-800 py-1 rounded-md disabled:opacity-50">搜图(Yandex)</button>
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 p-2 bg-gray-800 text-white text-xs rounded-md shadow-lg opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none">
                        <p className="font-bold border-b pb-1 mb-1">提示:</p>
                        <p className="whitespace-pre-wrap">如果下方输入框有关键词，将使用关键词搜索；否则使用当前图片进行反向搜图。</p>
                    </div>
                </div>
                 <div className="relative flex-1 group/tooltip">
                    <button onClick={() => handleExternalSearch('bing')} disabled={!imageUrl && !imageSearchKeyword.trim()} className="w-full text-xs bg-sky-500 hover:bg-sky-600 text-white py-1 rounded-md disabled:opacity-50">搜图(Bing)</button>
                     <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 p-2 bg-gray-800 text-white text-xs rounded-md shadow-lg opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none">
                        <p className="font-bold border-b pb-1 mb-1">提示:</p>
                        <p className="whitespace-pre-wrap">如果下方输入框有关键词，将使用关键词搜索；否则使用当前图片进行反向搜图。</p>
                    </div>
                </div>
                 <div className="relative flex-1 group/tooltip">
                    <button onClick={searchOnXianyu} className="w-full text-xs bg-orange-500 hover:bg-orange-600 text-white py-1 rounded-md">搜闲鱼</button>
                     <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 p-2 bg-gray-800 text-white text-xs rounded-md shadow-lg opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none">
                        <p className="font-bold border-b pb-1 mb-1">原始文案:</p>
                        <p className="whitespace-pre-wrap">{product.result_text_content || '无'}</p>
                    </div>
                </div>
                 </div>
            <div className="space-y-2 mt-2">
                <div className="p-2 border rounded-md bg-gray-50 dark:bg-gray-800">
                    <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">智能图片搜索</label>
                    <div className="grid grid-cols-3 gap-2 mt-1">
                        <input
                            value={imageSearchKeyword}
                            onChange={(e) => setImageSearchKeyword(e.target.value)}
                            placeholder="图片关键词 (英文)"
                            className="col-span-3 w-full p-1 border rounded text-xs dark:bg-gray-700 dark:border-gray-600"
                        />
                        <button
                            onClick={handleAiSuggestKeyword}
                            disabled={isSuggestingKeyword || isSearchingImage}
                            className="text-xs bg-purple-500 hover:bg-purple-600 text-white px-2 py-1.5 rounded-md disabled:opacity-50"
                            title="让AI根据文案建议一个搜索关键词"
                        >
                            {isSuggestingKeyword ? '提词中...' : '🤖 AI提词'}
                        </button>
                        <button
                            onClick={handleSearchImageWithKeyword}
                            disabled={isSearchingImage || isSuggestingKeyword || !imageSearchKeyword.trim()}
                            className="col-span-2 text-xs bg-blue-500 hover:bg-blue-600 text-white px-2 py-1.5 rounded-md disabled:opacity-50"
                            title="使用上方关键词搜索图片并更新"
                        >
                            {isSearchingImage ? '搜索中...' : '🔍 搜索并更新图片'}
                        </button>
                    </div>
                </div>
                 <div className="p-2 border rounded-md bg-gray-50 dark:bg-gray-800">
                    <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">手动更新图片</label>
                    <div className="flex gap-2 mt-1">
                        <input value={newImageUrl} onChange={(e) => setNewImageUrl(e.target.value)} placeholder="输入新图片URL..." className="w-full p-1 border rounded text-xs dark:bg-gray-700 dark:border-gray-600 flex-grow" />
                        <button onClick={updateProductImage} className="text-xs bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 px-3 rounded-md flex-shrink-0">更新</button>
                    </div>
                </div>
            </div>

             <div>
                <button onClick={() => setIsEditingModalOpen(true)} className="w-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md py-2 px-3 text-sm text-center">
                    查看 / 编辑文案
                        </button>
            </div>
            <div className="border-2 border-indigo-300 dark:border-indigo-600 mt-3 pt-3 p-3 rounded-lg bg-indigo-50 dark:bg-gray-800/50">
                <div className="flex justify-between items-center">
                    <h4 className="text-sm font-semibold">发布管理</h4>
                    <span className="text-xs text-gray-500">{isPending ? '待上架' : '已上架'}</span>
                </div>
                {deployError && <p className="text-xs text-red-500 mt-1">{deployError}</p>}
                <div className="mt-2">
                            <button
                        onClick={handleDeployClick}
                        disabled={isDeploying || isDescriptionDirty || isPending || !hasSavedCopy}
                        className="w-full bg-green-500 text-white py-2 rounded-md hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                            >
                        {isDeploying ? '投放中...' : (isPending ? '待上架' : '投放到此账号')}
                            </button>
                    {isDescriptionDirty && <p className="text-xs text-center text-yellow-600 mt-1">请先保存文案再进行投放</p>}
                    {!isDescriptionDirty && !hasSavedCopy && <p className="text-xs text-center text-red-500 mt-1">必须先保存文案才能投放</p>}
                </div>
                <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                     {deployedTo.length > 0 && (
                        <p>已投放到: {deployedTo.join(', ')}</p>
                    )}
                </div>
                </div>
            <div className="border-t border-gray-200 dark:border-gray-600 mt-2 pt-2">
                <button onClick={() => setIsAiToolsExpanded(!isAiToolsExpanded)} className="w-full text-sm font-semibold text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100 flex justify-between items-center py-1">
                    <span>🤖 AI 工具</span>
                    <span className={`transform transition-transform ${isAiToolsExpanded ? 'rotate-180' : 'rotate-0'}`}>▼</span>
                 </button>
                {isAiToolsExpanded && (
                    <div className="mt-2 space-y-3">
                        <div>
                            <div className="flex justify-between items-center">
                            <label className="text-sm font-bold">AI提取关键词</label>
                                {product.keywords_extracted_at && (
                                    <span className="text-xs text-gray-400">
                                        上次提取于: {new Date(product.keywords_extracted_at).toLocaleTimeString('zh-CN')}
                                    </span>
                                )}
                            </div>
                            <div className="mt-1 p-2 w-full text-xs bg-gray-50 dark:bg-gray-700 rounded-md border dark:border-gray-600 space-y-1 max-h-48 overflow-y-auto">
                                {aiKeywords.length > 0 ? (
                                    aiKeywords.map((kw, index) => (
                                        <div key={index} className="flex items-center justify-between group/keyword">
                                            <div className="flex items-center flex-grow overflow-hidden">
                                                <input type="checkbox" id={`kw-${product.id}-${index}`} checked={selectedKeywords.has(kw)} onChange={() => handleKeywordToggle(kw)} className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 flex-shrink-0" />
                                                <label htmlFor={`kw-${product.id}-${index}`} className="ml-2 block text-sm text-gray-900 dark:text-gray-200 truncate" title={kw}>
                                                    {kw}
                                                </label>
                                            </div>
                                            <button
                                                onClick={() => handleDeleteKeyword(kw)}
                                                className="ml-2 text-red-500 hover:text-red-700 text-xl opacity-0 group-hover/keyword:opacity-100 transition-opacity flex-shrink-0"
                                                title={`从该商品和关键词库中删除 '${kw}'`}
                                            >
                                                &times;
                                            </button>
                                        </div>
                                    ))
                                ) : (
                                    <span className="text-gray-400">点击下方AI提取，或等待自动提取。</span>
                                )}
                            </div>
                            <div className="flex gap-2 mt-2">
                                <button onClick={extractKeywordsWithAI} disabled={isLoadingKeywords} className="flex-1 bg-purple-500 hover:bg-purple-600 text-white py-1 px-2 rounded text-sm disabled:opacity-50">
                                    {isLoadingKeywords ? '提取中...' : (product.keywords_extracted_at ? '🤖 重新提取' : '🤖 AI 提取')}
                 </button>
                                <button onClick={handleSaveKeywordsClick} disabled={selectedKeywords.size === 0} className="flex-1 bg-green-500 hover:bg-green-600 text-white py-1 px-2 rounded text-sm disabled:opacity-50">
                                    保存选中 ({selectedKeywords.size})
                    </button>
                            </div>
                            <button onClick={onManageAccountKeywords} className="w-full mt-2 bg-teal-500 hover:bg-teal-600 text-white py-1 px-2 rounded text-sm">
                                管理账号关键词 &rarr;
                            </button>
                            </div>
                        </div>
                    )}
                </div>
            {cardError && <p className="text-red-500 text-xs mt-2">{cardError}</p>}
            {isEditingModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50 p-4" onClick={() => setIsEditingModalOpen(false)}>
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold">编辑文案 (ID: {product.id})</h2>
                            <button onClick={() => setIsEditingModalOpen(false)} className="text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100 text-2xl font-bold">&times;</button>
                        </div>
                        <div className="flex-grow grid grid-cols-1 md:grid-cols-2 gap-4 overflow-y-auto">
                            <div>
                                <label className="text-lg font-semibold mb-2">原始文案</label>
                                <textarea ref={originalTextareaRef} readOnly value={product.result_text_content || ''} className="w-full p-2 border rounded bg-gray-100 dark:bg-gray-900 dark:border-gray-600 text-sm resize-none overflow-hidden" rows={1} />
                            </div>
                            <div>
                                <div className="flex justify-between items-center mb-2">
                                    <label className="text-lg font-semibold">修改后文案</label>
                                    {isDescriptionDirty && <span className="text-sm text-yellow-600 dark:text-yellow-400 font-semibold">未保存</span>}
                                </div>
                                <textarea ref={modifiedTextareaRef} value={modifiedDescription} onChange={handleDescriptionChange} className="w-full p-2 border rounded bg-white dark:bg-gray-700 dark:border-gray-500 text-sm resize-none overflow-hidden" rows={1} />
                            </div>
                        </div>
                        {isGeneratingImage && <p className="text-center text-blue-500 mt-4">图片生成中，请稍候...</p>}
                        {generatedImageUrl && (
                            <div className="mt-4 p-4 border-2 border-dashed border-green-400 rounded-lg">
                                <p className="text-lg font-semibold mb-2 text-center">生成效果预览</p>
                                <div className="relative w-full max-w-md mx-auto aspect-square border rounded-md overflow-hidden bg-gray-100">
                                    <Image src={generatedImageUrl} alt="生成的图片" fill style={{ objectFit: 'contain' }} />
                                </div>
                                <div className="mt-4 text-center">
                                    <button onClick={handleSaveGeneratedImage} disabled={isSavingImage} className="bg-teal-600 hover:bg-teal-700 text-white font-semibold py-2 px-5 rounded-lg disabled:opacity-50">
                                        {isSavingImage ? '保存中...' : '✅ 保存此图片并更新'}
                                    </button>
                                </div>
                            </div>
                        )}
                        <div className="mt-4 pt-4 border-t flex justify-end items-center gap-3 flex-wrap">
                            <button onClick={handleGenerateImage} disabled={isGeneratingImage || isLoadingAI} className="bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 px-5 rounded-lg disabled:opacity-50">
                                {isGeneratingImage ? '生成中...' : '🎨 生成预览'}
                            </button>
                            <button onClick={modifyTextWithAI} disabled={isLoadingAI || isGeneratingImage} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-5 rounded-lg disabled:opacity-50">
                                {isLoadingAI ? '生成中...' : '🤖 AI 优化文案'}
                 </button>
                            <button onClick={confirmChanges} disabled={isLoadingConfirm || !isDescriptionDirty} className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-5 rounded-lg disabled:opacity-50">
                                {isLoadingConfirm ? '保存中...' : '✅ 保存并关闭'}
                 </button>
                        </div>
                    </div>
                </div>
            )}
        </article>
    );
};

export default ProductCard; 