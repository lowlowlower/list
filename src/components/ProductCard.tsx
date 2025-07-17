'use client';

import React, { useState, useEffect } from 'react';
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
};

interface ProductCardProps {
    product: Product;
    onDelete: (id: string) => Promise<void>;
    onDeploy: (productId: string) => Promise<void>;
    globalPrompt: string;
    businessDescription: string;
    onManageAccountKeywords: () => void; // New prop for navigation
    deployedTo: string[]; // List of account names this product is already deployed to
    isPending: boolean;
}

// --- Environment Variables ---
const supabaseUrl = 'https://urfibhtfqgffpanpsjds.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVyZmliaHRmcWdmZnBhbnBzamRzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzU3ODU2NDUsImV4cCI6MjA1MTM2MTY0NX0.Q1WPGBj23uSL3RKhYxGhs7Si1_HfrvC9P-JxkXl6eVE';
const geminiApiKey = "AIzaSyApuy_ax9jhGXpUdlgI6w_0H5aZ7XiY9vU";

const databaseUrl = supabaseUrl ? `${supabaseUrl}/rest/v1/search_results_duplicate_本人` : null;
const geminiApiUrl = geminiApiKey ? `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite-preview-06-17:generateContent?key=${geminiApiKey}` : null;


// --- Helper Functions ---
const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error) return error.message;
    return String(error);
};

// --- Main Component ---
const ProductCard: React.FC<ProductCardProps> = ({ product, onDelete, onDeploy, globalPrompt, businessDescription, onManageAccountKeywords, deployedTo, isPending }) => {
    // Component State
    const [modifiedDescription, setModifiedDescription] = useState(product['修改后文案'] || product.result_text_content || '');
    const [isDescriptionDirty, setIsDescriptionDirty] = useState(false);
    const [aiKeywords, setAiKeywords] = useState(product['ai提取关键词'] || '');
    const [isLoadingKeywords, setIsLoadingKeywords] = useState(false);
    const [isAiToolsExpanded, setIsAiToolsExpanded] = useState(false); // For accordion
    const [newImageUrl, setNewImageUrl] = useState('');
    const [isOriginalCollapsed, setIsOriginalCollapsed] = useState(true);
    const [isLoadingAI, setIsLoadingAI] = useState(false);
    const [isLoadingConfirm, setIsLoadingConfirm] = useState(false);
    const [cardError, setCardError] = useState<string | null>(null);
    const [imageUrl, setImageUrl] = useState(product.result_image_url);
    const [isDeploying, setIsDeploying] = useState(false);
    const [deployError, setDeployError] = useState<string | null>(null);

    // Reset state if product prop changes
    useEffect(() => {
        setModifiedDescription(product['修改后文案'] || product.result_text_content || '');
        setIsDescriptionDirty(false);
        setAiKeywords(product['ai提取关键词'] || '');
        setImageUrl(product.result_image_url);
        setCardError(null);
        setDeployError(null);
            setIsDeploying(false);
        setIsAiToolsExpanded(false); // Reset on product change
    }, [product]);

    // --- Handlers ---
    const handleDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setModifiedDescription(e.target.value);
        setIsDescriptionDirty(true);
    };

    const modifyTextWithAI = async () => {
        if (!geminiApiUrl || !globalPrompt.trim()) return setCardError('AI未配置或提示词为空');
        setIsLoadingAI(true);
        setCardError(null);
        const inputText = `${globalPrompt}\n\n商品信息：\n关键词: ${product.keyword}\n现有文案参考: ${modifiedDescription}`;
        try {
            const res = await fetch(geminiApiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: inputText }] }] }) });
            if (!res.ok) throw new Error(`AI API错误: ${(await res.json()).error.message}`);
            const data = await res.json();
            const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (aiText) {
                setModifiedDescription(aiText.trim());
                setIsDescriptionDirty(true);
            } else {
                throw new Error("AI未返回有效文案");
            }
        } catch (e) { setCardError(getErrorMessage(e)); } finally { setIsLoadingAI(false); }
    };

    const extractKeywordsWithAI = async () => {
        if (!geminiApiUrl) return setCardError('AI未配置');
        setIsLoadingKeywords(true);
        setCardError(null);

        const original_text = product.result_text_content || '';

        const prompt = `
            请基于以下业务描述和产品文案，提取5-8个最相关的中文推广关键词。
            要求：
            1.  只返回关键词本身，用逗号（,）分隔。
            2.  不要添加任何编号、解释或无关文字。

            ---
            业务描述:
            ${businessDescription}
            ---
            产品文案:
            ${original_text}
            ---
        `;

        try {
            const res = await fetch(geminiApiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            });

            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(`AI API 错误: ${getErrorMessage(errorData.error)}`);
            }

            const data = await res.json();
            const keywords = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

            if (!keywords) {
                throw new Error("AI未能返回有效关键词");
            }

            // Save keywords to the database
            const updateRes = await fetch(`${databaseUrl}?id=eq.${product.id}`, {
                method: 'PATCH',
                headers: { 'apikey': supabaseAnonKey, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
                body: JSON.stringify({ "ai提取关键词": keywords })
            });

            if (!updateRes.ok) {
                throw new Error((await updateRes.json()).message);
            }

            setAiKeywords(keywords); // Update state to show in UI

        } catch (e) {
            setCardError(getErrorMessage(e));
        } finally {
            setIsLoadingKeywords(false);
        }
    };

    const confirmChanges = async () => {
        if (!databaseUrl) return setCardError('Supabase配置不完整');
        setIsLoadingConfirm(true);
        setCardError(null);
        try {
            const res = await fetch(`${databaseUrl}?id=eq.${product.id}`, { method: 'PATCH', headers: { 'apikey': supabaseAnonKey, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }, body: JSON.stringify({ "修改后文案": modifiedDescription }) });
            if (!res.ok) throw new Error((await res.json()).message);
            setIsDescriptionDirty(false); // Mark as not dirty after save
            alert("文案已保存");
        } catch (e) { setCardError(getErrorMessage(e)); } finally { setIsLoadingConfirm(false); }
    };

    const updateProductImage = async () => {
        if (!databaseUrl || !newImageUrl.trim()) return;
        setCardError(null);
        try {
            const res = await fetch(`${databaseUrl}?id=eq.${product.id}`, { method: 'PATCH', headers: { 'apikey': supabaseAnonKey, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }, body: JSON.stringify({ 'result_image_url': newImageUrl.trim() }) });
            if (!res.ok) throw new Error((await res.json()).message);
            setImageUrl(newImageUrl.trim());
            setNewImageUrl('');
        } catch (e) { setCardError(getErrorMessage(e)); }
    };

    const handleDeleteClick = async () => {
        if (confirm(`确定要删除商品 ${product.id} 吗？`)) {
            try { await onDelete(product.id); } catch (e) { setCardError(`删除失败: ${getErrorMessage(e)}`); }
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

    const searchOnXianyu = () => { const q = (modifiedDescription || product.result_text_content || '').substring(0, 40).trim(); if(q) window.open(`https://www.goofish.com/search?q=${encodeURIComponent(q)}`, '_blank'); };
    const findSimilarImagesYandex = () => { if(imageUrl) window.open(`https://yandex.com/images/search?rpt=imageview&url=${encodeURIComponent(imageUrl)}`, '_blank'); };
    const findSimilarImagesBing = () => { if(imageUrl) window.open(`https://www.bing.com/images/search?view=detailv2&iss=sbi&q=imgurl:${encodeURIComponent(imageUrl)}`, '_blank'); };


    return (
        <article className="product-card border border-gray-300 dark:border-gray-700 rounded-lg shadow-md bg-white dark:bg-gray-800 flex flex-col gap-3 p-4 relative group">
            {/* Header & Delete Button */}
            <div className="flex justify-between items-start">
                 <div className="text-sm pr-8"><strong>ID:</strong> {product.id} | <strong>价格:</strong> {product.价格 || 'N/A'}</div>
                <button onClick={handleDeleteClick} className="absolute top-2 right-2 z-10 p-1 bg-red-500 text-white rounded-full hover:bg-red-700 opacity-50 group-hover:opacity-100">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

            {/* Image & Search */}
            {imageUrl && (
                <div className="relative w-full h-48">
                        <Image
                            src={imageUrl}
                        alt="商品图片"
                        fill
                        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                        style={{ objectFit: 'cover' }}
                        className="rounded-md"
                    />
                </div>
            )}
            <div className="flex gap-2">
                <button onClick={findSimilarImagesYandex} disabled={!imageUrl} className="text-xs flex-1 bg-yellow-400 hover:bg-yellow-500 text-gray-800 py-1 rounded-md disabled:opacity-50">搜图(Yandex)</button>
                <button onClick={findSimilarImagesBing} disabled={!imageUrl} className="text-xs flex-1 bg-sky-500 hover:bg-sky-600 text-white py-1 rounded-md disabled:opacity-50">搜图(Bing)</button>
                        </div>

            {/* Image URL Update */}
            <div className="flex gap-2">
                <input value={newImageUrl} onChange={(e) => setNewImageUrl(e.target.value)} placeholder="输入新图片URL..." className="w-full p-1 border rounded text-xs dark:bg-gray-700 dark:border-gray-600 flex-grow"/>
                <button onClick={updateProductImage} className="text-xs bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 px-3 rounded-md">更新</button>
                </div>

            {/* Descriptions */}
            <div>
                <label className="text-sm font-bold">原始文案</label>
                <textarea readOnly value={product.result_text_content || ''} rows={isOriginalCollapsed ? 2 : 6} onClick={() => setIsOriginalCollapsed(!isOriginalCollapsed)} className="w-full p-1 border rounded text-xs bg-gray-100 dark:bg-gray-700 dark:border-gray-600 cursor-pointer"/>
            </div>
            <div>
                <div className="flex justify-between items-center mb-1">
                    <label className="text-sm font-bold">修改后文案</label>
                    {isDescriptionDirty && <span className="text-xs text-red-500 dark:text-red-400 font-semibold animate-pulse">有未保存的修改</span>}
                </div>
                <textarea value={modifiedDescription} onChange={handleDescriptionChange} rows={6} className="w-full p-1 border rounded text-xs dark:bg-gray-700 dark:border-gray-600"/>
                 </div>

            {/* Main Actions */}
            <div className="flex flex-wrap gap-2 text-sm">
                <button onClick={modifyTextWithAI} disabled={isLoadingAI} className="flex-1 bg-blue-500 hover:bg-blue-600 text-white py-1 px-2 rounded disabled:opacity-50">{isLoadingAI ? '生成中...' : 'AI修改'}</button>
                <button onClick={confirmChanges} disabled={isLoadingConfirm || !isDescriptionDirty} className="flex-1 bg-green-500 hover:bg-green-600 text-white py-1 px-2 rounded disabled:opacity-50">{isLoadingConfirm ? '保存中...' : '保存'}</button>
                <button onClick={searchOnXianyu} className="flex-1 bg-orange-500 hover:bg-orange-600 text-white py-1 px-2 rounded">搜闲鱼</button>
                </div>

            {/* Deployment Section - MORE PROMINENT */}
            <div className="border-2 border-indigo-300 dark:border-indigo-600 mt-3 pt-3 p-3 rounded-lg bg-indigo-50 dark:bg-gray-800/50">
                <div className="flex justify-between items-center">
                    <span className="text-base font-bold text-indigo-800 dark:text-indigo-200">投放状态</span>
                        <button
                        onClick={handleDeployClick} 
                        disabled={isDeploying || isPending} 
                        className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold py-2 px-4 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105 transition-transform"
                        >
                        {isDeploying ? '投放中...' : (isPending ? '待上架' : '投放到此账号')}
                        </button>
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                    {deployedTo.length > 0 ? deployedTo.map(name => (
                        <span key={name} className="px-1.5 py-0.5 text-xs rounded bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200">{name} (已上架)</span>
                    )) : <span className="text-sm text-gray-500">未投放到任何账号</span>}
                </div>
                 {deployError && <p className="text-red-500 text-xs mt-1">{deployError}</p>}
                </div>

            {/* AI Tools Accordion */}
            <div className="border-t border-gray-200 dark:border-gray-600 mt-2 pt-2">
                 <button
                    onClick={() => setIsAiToolsExpanded(!isAiToolsExpanded)}
                    className="w-full text-sm font-semibold text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100 flex justify-between items-center py-1"
                 >
                    <span>🤖 AI 工具</span>
                    <span className={`transform transition-transform ${isAiToolsExpanded ? 'rotate-180' : 'rotate-0'}`}>▼</span>
                 </button>
                {isAiToolsExpanded && (
                    <div className="mt-2 space-y-3">
                         {/* AI Keywords Section */}
                        <div>
                            <label className="text-sm font-bold">AI提取关键词</label>
                            <div className="mt-1 p-2 w-full text-xs min-h-[4rem] bg-gray-50 dark:bg-gray-700 rounded-md border dark:border-gray-600">
                                {aiKeywords || <span className="text-gray-400">点击下方按钮生成...</span>}
                            </div>
                            <div className="flex gap-2 mt-2">
                 <button
                                    onClick={extractKeywordsWithAI} 
                                    disabled={isLoadingKeywords} 
                                    className="flex-1 bg-purple-500 hover:bg-purple-600 text-white py-1 px-2 rounded text-sm disabled:opacity-50"
                 >
                                    {isLoadingKeywords ? '提取中...' : 'AI提取关键词'}
                 </button>
                    <button
                                    onClick={onManageAccountKeywords}
                                    className="flex-1 bg-teal-500 hover:bg-teal-600 text-white py-1 px-2 rounded text-sm"
                                >
                                    管理账号关键词 &rarr;
                    </button>
                            </div>
                            </div>
                        </div>
                    )}
                </div>

            {cardError && <p className="text-red-500 text-xs mt-2">{cardError}</p>}
        </article>
    );
};

export default ProductCard; 