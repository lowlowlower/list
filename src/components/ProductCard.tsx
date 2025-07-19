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
};

interface ProductCardProps {
    product: Product;
    onDelete: (id: string) => Promise<void>;
    onDuplicate: (id: string) => Promise<void>;
    onDeploy: (productId: string) => Promise<void>;
    customCopywritingPrompt: string; // Replaced globalPrompt
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
const ProductCard: React.FC<ProductCardProps> = ({ product, onDelete, onDuplicate, onDeploy, customCopywritingPrompt, businessDescription, onManageAccountKeywords, deployedTo, isPending }) => {
    // Component State
    const [modifiedDescription, setModifiedDescription] = useState(product['修改后文案'] || product.result_text_content || '');
    const [isDescriptionDirty, setIsDescriptionDirty] = useState(false);
    const [aiKeywords, setAiKeywords] = useState(product['ai提取关键词'] || '');
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

    // Refs for autosizing textareas
    const originalTextareaRef = useRef<HTMLTextAreaElement>(null);
    const modifiedTextareaRef = useRef<HTMLTextAreaElement>(null);


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
        setIsEditingModalOpen(false); // Also reset modal state
    }, [product]);

    // --- Autosize Textarea Logic ---
    const autoResizeTextarea = (element: HTMLTextAreaElement | null) => {
        if (element) {
            element.style.height = 'auto'; // Reset height to recalculate
            element.style.height = `${element.scrollHeight}px`; // Set height to content height
        }
    };

    // Resize on modal open and when content changes programmatically
    useLayoutEffect(() => {
        if (isEditingModalOpen) {
            autoResizeTextarea(originalTextareaRef.current);
            autoResizeTextarea(modifiedTextareaRef.current);
        }
    }, [isEditingModalOpen, product.result_text_content, modifiedDescription]);


    // --- Handlers ---
    const handleDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setModifiedDescription(e.target.value);
        setIsDescriptionDirty(true);
        autoResizeTextarea(e.target); // Resize on typing
    };

    const modifyTextWithAI = async () => {
        if (!geminiApiUrl || !customCopywritingPrompt.trim()) return setCardError('AI未配置或账号专属的文案提示词为空');
        setIsLoadingAI(true);
        setCardError(null);
        const inputText = `${customCopywritingPrompt}\n\n[业务描述]:\n${businessDescription}\n\n[商品信息]:\n关键词: ${product.keyword}\n现有文案参考: ${modifiedDescription}`;
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
            setIsEditingModalOpen(false); // Close modal on save
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

    const searchOnXianyu = () => { const q = (product.result_text_content || '').substring(0, 40).trim(); if(q) window.open(`https://www.goofish.com/search?q=${encodeURIComponent(q)}`, '_blank'); };
    const findSimilarImagesYandex = () => { if(imageUrl) window.open(`https://yandex.com/images/search?rpt=imageview&url=${encodeURIComponent(imageUrl)}`, '_blank'); };
    const findSimilarImagesBing = () => { if(imageUrl) window.open(`https://www.bing.com/images/search?view=detailv2&iss=sbi&q=imgurl:${encodeURIComponent(imageUrl)}`, '_blank'); };


    return (
        <article className="product-card border border-gray-300 dark:border-gray-700 rounded-lg shadow-md bg-white dark:bg-gray-800 flex flex-col gap-3 p-4 relative group">
            {/* Header & Delete Button */}
            <div className="flex justify-between items-start">
                 <div className="text-sm pr-8"><strong>ID:</strong> {product.id} | <strong>价格:</strong> {product.价格 || 'N/A'}</div>
                 <div className="absolute top-2 right-2 z-10 flex gap-2">
                    <button onClick={() => onDuplicate(product.id)} className="p-1 bg-blue-500 text-white rounded-full hover:bg-blue-700 opacity-50 group-hover:opacity-100 transition-opacity">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
             </button>
                    <button onClick={() => onDelete(product.id)} className="p-1 bg-red-500 text-white rounded-full hover:bg-red-700 opacity-50 group-hover:opacity-100 transition-opacity">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
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
                 <div className="relative flex-1 group/tooltip">
                    <button onClick={findSimilarImagesYandex} disabled={!imageUrl} className="w-full text-xs bg-yellow-400 hover:bg-yellow-500 text-gray-800 py-1 rounded-md disabled:opacity-50">搜图(Yandex)</button>
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 p-2 bg-gray-800 text-white text-xs rounded-md shadow-lg opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none">
                        <p className="font-bold border-b pb-1 mb-1">原始文案:</p>
                        <p className="whitespace-pre-wrap">{product.result_text_content || '无'}</p>
                    </div>
                </div>
                 <div className="relative flex-1 group/tooltip">
                    <button onClick={findSimilarImagesBing} disabled={!imageUrl} className="w-full text-xs bg-sky-500 hover:bg-sky-600 text-white py-1 rounded-md disabled:opacity-50">搜图(Bing)</button>
                     <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 p-2 bg-gray-800 text-white text-xs rounded-md shadow-lg opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none">
                        <p className="font-bold border-b pb-1 mb-1">原始文案:</p>
                        <p className="whitespace-pre-wrap">{product.result_text_content || '无'}</p>
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

            {/* Image URL Update */}
            <div className="flex gap-2">
                <input value={newImageUrl} onChange={(e) => setNewImageUrl(e.target.value)} placeholder="输入新图片URL..." className="w-full p-1 border rounded text-xs dark:bg-gray-700 dark:border-gray-600 flex-grow"/>
                <button onClick={updateProductImage} className="text-xs bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 px-3 rounded-md">更新</button>
                </div>

            {/* Descriptions - Now triggers a modal */}
             <div>
                        <button
                    onClick={() => setIsEditingModalOpen(true)}
                    className="w-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md py-2 px-3 text-sm text-center"
                        >
                    查看 / 编辑文案
                        </button>
            </div>

            {/* Deployment Section - MORE PROMINENT */}
            <div className="border-2 border-indigo-300 dark:border-indigo-600 mt-3 pt-3 p-3 rounded-lg bg-indigo-50 dark:bg-gray-800/50">
                <div className="flex justify-between items-center">
                    <h4 className="text-sm font-semibold">发布管理</h4>
                    <span className="text-xs text-gray-500">{isPending ? '待上架' : '已上架'}</span>
                </div>

                {deployError && <p className="text-xs text-red-500 mt-1">{deployError}</p>}

                <div className="mt-2">
                            <button
                        onClick={handleDeployClick}
                        disabled={isDeploying || isDescriptionDirty || isPending || !product['修改后文案']}
                        className="w-full bg-green-500 text-white py-2 rounded-md hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                            >
                        {isDeploying ? '投放中...' : (isPending ? '待上架' : '投放到此账号')}
                            </button>
                    {isDescriptionDirty && <p className="text-xs text-center text-yellow-600 mt-1">请先保存文案再进行投放</p>}
                    {!isDescriptionDirty && !product['修改后文案'] && <p className="text-xs text-center text-red-500 mt-1">必须先保存文案才能投放</p>}
                </div>

                <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                     {deployedTo.length > 0 && (
                        <p>已投放到: {deployedTo.join(', ')}</p>
                    )}
                </div>
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

            {/* Text Editing Modal */}
            {isEditingModalOpen && (
                <div 
                    className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50 p-4"
                    onClick={() => setIsEditingModalOpen(false)}
                >
                    <div 
                        className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold">编辑文案 (ID: {product.id})</h2>
                            <button onClick={() => setIsEditingModalOpen(false)} className="text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100 text-2xl font-bold">&times;</button>
                        </div>
                        
                        <div className="flex-grow grid grid-cols-1 md:grid-cols-2 gap-4 overflow-y-auto">
                            {/* Original Text */}
                            <div>
                                <label className="text-lg font-semibold mb-2">原始文案</label>
                                <textarea 
                                    ref={originalTextareaRef}
                                    readOnly 
                                    value={product.result_text_content || ''} 
                                    className="w-full p-2 border rounded bg-gray-100 dark:bg-gray-900 dark:border-gray-600 text-sm resize-none overflow-hidden"
                                    rows={1}
                                />
                            </div>
                            {/* Modified Text */}
                            <div>
                                <div className="flex justify-between items-center mb-2">
                                    <label className="text-lg font-semibold">修改后文案</label>
                                    {isDescriptionDirty && <span className="text-sm text-yellow-600 dark:text-yellow-400 font-semibold">未保存</span>}
                                </div>
                                <textarea 
                                    ref={modifiedTextareaRef}
                                    value={modifiedDescription} 
                                    onChange={handleDescriptionChange} 
                                    className="w-full p-2 border rounded bg-white dark:bg-gray-700 dark:border-gray-500 text-sm resize-none overflow-hidden"
                                    rows={1}
                                />
                            </div>
                        </div>

                        <div className="mt-4 pt-4 border-t flex justify-end items-center gap-3">
                 <button
                                onClick={modifyTextWithAI} 
                                disabled={isLoadingAI} 
                                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-5 rounded-lg disabled:opacity-50"
                            >
                                {isLoadingAI ? '生成中...' : '🤖 AI 优化文案'}
                 </button>
                 <button
                                onClick={confirmChanges} 
                                disabled={isLoadingConfirm || !isDescriptionDirty} 
                                className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-5 rounded-lg disabled:opacity-50"
                            >
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