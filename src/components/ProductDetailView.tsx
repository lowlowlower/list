'use client';

import React, { useState, useEffect } from 'react';
import ProductCard from '@/components/ProductCard';
import type { Account, Product, PublishedNote } from '@/types';

type ProductWithStatus = Product & {
    isPending: boolean;
    isDeployedToThisAccount: boolean;
    noteStats?: PublishedNote | null; // <-- Add noteStats here
};

interface ProductDetailViewProps {
    account: Account;
    allAccounts: Account[]; // Receive the full list of accounts
    products: Product[];
    loading: boolean;
    error: string | null;
    onBack: () => void;
    onDeleteProduct: (id: string) => Promise<void>;
    onDuplicateProduct: (id: string) => Promise<void>;
    onDeployProduct: (id: string) => Promise<void>;
    onUpdateProducts: () => void;
    callAi: (prompt: string) => Promise<string>;
    onSaveKeywordsToAccount: (accountName: string, keywords: string[]) => Promise<void>;
    onDeleteKeywordFromAccountLibrary: (accountName: string, keyword: string) => Promise<void>;
    onManageAccountKeywords: (account: Account) => void;
    // New prop for saving the business description
    onSaveBusinessDescription: (accountName: string, newDescription: string) => Promise<void>;
    
    // AI Analysis Modal Props
    isAiAnalysisModalOpen: boolean;
    setIsAiAnalysisModalOpen: (isOpen: boolean) => void;
    aiAnalysisInput: string;
    setAiAnalysisInput: (input: string) => void;
    isAiAnalyzing: boolean;
    handleAiAnalysis: (accountName: string, text: string) => void;
    aiAnalysisResult: string;
}

const ProductDetailView: React.FC<ProductDetailViewProps> = ({
    account,
    allAccounts,
    products,
    loading,
    error,
    onBack,
    onDeleteProduct,
    onDuplicateProduct,
    onDeployProduct,
    onUpdateProducts,
    callAi,
    onSaveKeywordsToAccount,
    onDeleteKeywordFromAccountLibrary,
    onManageAccountKeywords,
    onSaveBusinessDescription,
    isAiAnalysisModalOpen,
    setIsAiAnalysisModalOpen,
    aiAnalysisInput,
    setAiAnalysisInput,
    isAiAnalyzing,
    handleAiAnalysis,
    aiAnalysisResult,
}) => {
    const [otherProducts, setOtherProducts] = useState<ProductWithStatus[]>([]);
    const [deployedProducts, setDeployedProducts] = useState<ProductWithStatus[]>([]);
    const [isDeployedSectionExpanded, setIsDeployedSectionExpanded] = useState(false);
    const [sortOrder, setSortOrder] = useState('pendingFirst'); // 'newest', 'pendingFirst'
    const [searchQuery, setSearchQuery] = useState('');
    const [noteStats, setNoteStats] = useState<PublishedNote[]>([]); // New state for note stats
    
    // --- New State for Editable Business Description ---
    const [businessDescription, setBusinessDescription] = useState(account['业务描述'] || '');
    const [isSavingDescription, setIsSavingDescription] = useState(false);
    const [isDescriptionModalOpen, setIsDescriptionModalOpen] = useState(false);
    
    useEffect(() => {
        setBusinessDescription(account['业务描述'] || '');
    }, [account]);

    const handleSaveDescription = async () => {
        setIsSavingDescription(true);
        try {
            await onSaveBusinessDescription(account.name, businessDescription);
            alert('业务描述已更新！');
            setIsDescriptionModalOpen(false); // Close modal on success
        } catch (e) {
            alert(`保存失败: ${e instanceof Error ? e.message : 'Unknown error'}`);
        } finally {
            setIsSavingDescription(false);
        }
    };

    // --- Fetch Note Stats ---
    useEffect(() => {
        const fetchNoteStats = async () => {
            if (!account.name) return;
            try {
                const response = await fetch(`/api/get-note-stats?account_name=${encodeURIComponent(account.name)}`);
                if (!response.ok) {
                    throw new Error(`Failed to fetch note stats: ${response.statusText}`);
                }
                const data: PublishedNote[] = await response.json();
                setNoteStats(data);
            } catch (err) {
                console.error(err);
                // Optionally set an error state to show in the UI
            }
        };

        fetchNoteStats();
    }, [account.name]);


    useEffect(() => {
        const deployedToThisAccountIds = new Set(
            (account['已上架json'] || []).map(p => String(p.id))
        );

        // 1. Filter products based on search query
        const filteredProducts = products.filter(p => {
            const trimmedQuery = searchQuery.trim();
            if (!trimmedQuery) {
                return true;
            }
            
            // ID match (exact contains)
            const idMatch = String(p.id).includes(trimmedQuery);

            // Text fields match (case-insensitive)
            const lowercasedQuery = trimmedQuery.toLowerCase();
            const keywordMatch = p.keyword?.toLowerCase().includes(lowercasedQuery);
            const originalContentMatch = p.result_text_content?.toLowerCase().includes(lowercasedQuery);
            const modifiedContentMatch = p['修改后文案']?.toLowerCase().includes(lowercasedQuery);
            const aiKeywordsMatch = p['ai提取关键词']?.toLowerCase().replace(/\n/g, ' ').includes(lowercasedQuery);

            return idMatch || keywordMatch || originalContentMatch || modifiedContentMatch || aiKeywordsMatch;
        });

        // 2. Separate products into "deployed" and "others"
        const deployed: ProductWithStatus[] = [];
        const others: ProductWithStatus[] = [];

        filteredProducts.forEach(p => {
            const isDeployedToThisAccount = deployedToThisAccountIds.has(String(p.id));
            const isPending = (account['待上架'] || []).some(item => {
                const id = typeof item === 'object' && item !== null ? (item as {id: string | number}).id : item;
                return String(id) === String(p.id);
            });

            // --- Match product with note stats ---
            const matchingNote = noteStats.find(note => {
                const productTitle = p['修改后文案'] || p.result_text_content;
                const noteTitle = note.title;
                return productTitle && noteTitle && productTitle.startsWith(noteTitle);
            });

            const productWithStatus: ProductWithStatus = { 
                ...p, 
                isPending, 
                isDeployedToThisAccount,
                noteStats: matchingNote // Add stats to product object
            };

            if (isDeployedToThisAccount) {
                deployed.push(productWithStatus);
            } else {
                others.push(productWithStatus);
            }
        });

        // 3. Sort the "others" list based on the selected sort order
        const sortedOthers = [...others];
        if (sortOrder === 'pendingFirst') {
            sortedOthers.sort((a, b) => {
                if (a.isPending !== b.isPending) {
                    return a.isPending ? -1 : 1;
                }
                return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
            });
        } else { // Default to 'newest'
             sortedOthers.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        }

        // 4. Sort the "deployed" list (e.g., by newest first)
        deployed.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        setDeployedProducts(deployed);
        setOtherProducts(sortedOthers);

    }, [products, sortOrder, account, searchQuery, noteStats]);

    const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setSortOrder(e.target.value);
    };

    if (loading) return <div className="p-8 text-center">正在加载商品...</div>;
    if (error) return <div className="p-8 text-center text-red-500">加载商品失败: {error}</div>;

    return (
        <div className="p-5 font-sans bg-gray-50 dark:bg-gray-900 min-h-screen">
            {/* Top Bar */}
            <div className="flex justify-between items-center mb-5">
                {/* Back Button on the left */}
                <button
                    onClick={onBack}
                    className="bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 text-sm font-semibold py-1.5 px-3 rounded-md flex items-center"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    返回
                </button>

                {/* Action Buttons on the right */}
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => onManageAccountKeywords(account)}
                        className="bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold py-1.5 px-3 rounded-md"
                    >
                        关键词
                    </button>
                    <button
                        onClick={() => {
                            setBusinessDescription(account['业务描述'] || '');
                            setIsDescriptionModalOpen(true);
                        }}
                        className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-1.5 px-3 rounded-md"
                    >
                        业务描述
                    </button>
                    <button
                        onClick={() => {
                            setIsAiAnalysisModalOpen(true);
                            setAiAnalysisInput(aiAnalysisResult || `帮我分析一下${account.name}这个账号的产品特点、定价策略和潜在爆款。`);
                        }}
                        disabled={isAiAnalyzing}
                        className="bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold py-1.5 px-3 rounded-md flex items-center gap-1.5"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                           <path d="M10 2a.75.75 0 01.75.75v.008l.004.008.004.008.004.008.004.008.004.008.004.008.004.008.004.008.004.008.004.008c.026.108.064.21.11.308l.004.008.004.008.004.008.004.008.004.008a4.92 4.92 0 011.082 1.348l.004.008.004.008.004.008.004.008.004.008.004.008.004.008.004.008a4.92 4.92 0 01.794 1.822l.004.008.004.008.004.008.004.008.004.008.004.008.004.008.004.008a4.92 4.92 0 010 3.868l-.004.008-.004.008-.004.008-.004.008-.004.008-.004.008-.004.008-.004.008a4.92 4.92 0 01-.794 1.822l-.004.008-.004.008-.004.008-.004.008-.004.008-.004.008-.004.008-.004.008a4.92 4.92 0 01-1.082 1.348l-.004.008-.004.008-.004.008-.004.008-.004.008c-.046.098-.084.2-.11.308l-.004.008-.004.008-.004.008-.004.008-.004.008-.004.008-.004.008-.004.008.004.008.004.008.004.008.004.008.004.008.004.008.004.008c-.026-.108-.064-.21-.11-.308l-.004-.008-.004-.008-.004-.008-.004-.008-.004-.008a4.92 4.92 0 01-1.082-1.348l-.004-.008-.004-.008-.004-.008-.004-.008-.004-.008-.004-.008-.004-.008-.004-.008a4.92 4.92 0 01-.794-1.822l-.004-.008-.004-.008-.004-.008-.004-.008-.004-.008-.004-.008-.004-.008-.004-.008a4.92 4.92 0 010-3.868l.004-.008.004-.008.004-.008.004-.008.004-.008.004-.008.004-.008.004-.008a4.92 4.92 0 01.794-1.822l.004-.008.004-.008.004-.008.004-.008.004-.008.004-.008.004-.008.004-.008a4.92 4.92 0 011.082-1.348l.004-.008.004-.008.004-.008.004-.008.004-.008c.046-.098.084-.2.11-.308l.004-.008.004-.008-.004-.008-.004-.008-.004-.008-.004-.008.004-.008A.75.75 0 0110 2zM10 7a1 1 0 100-2 1 1 0 000 2zm0 1a1 1 0 100 2zm-1.25 5.25a.75.75 0 00-1.5 0v.5a.75.75 0 001.5 0v-.5z" />
                        </svg>
                        {isAiAnalyzing ? '分析中' : `AI分析`}
                    </button>
                </div>
            </div>

            {/* Collapsible Deployed Products Section */}
            <div className="mb-6 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                <button
                    onClick={() => setIsDeployedSectionExpanded(!isDeployedSectionExpanded)}
                    className="w-full flex justify-between items-center p-4 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                    <div className="flex items-center gap-3">
                        <span className="font-semibold text-lg text-gray-800 dark:text-gray-200">已投放商品</span>
                        <span className="bg-green-200 text-green-800 text-sm font-bold px-2.5 py-0.5 rounded-full">
                            {deployedProducts.length}
                        </span>
                    </div>
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className={`h-6 w-6 text-gray-600 dark:text-gray-400 transform transition-transform ${isDeployedSectionExpanded ? 'rotate-180' : ''}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </button>

                {isDeployedSectionExpanded && (
                    <div className="p-4 bg-white dark:bg-gray-800/50">
                        {deployedProducts.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
                                {deployedProducts.map((product) => {
                                    const deployedToAccounts = allAccounts
                                        .filter(acc => (acc['已上架json'] || []).some(item => String(item.id) === String(product.id)))
                                        .map(acc => acc.name);

                                    return (
                                        <ProductCard
                                            key={`deployed-${product.id}`}
                                            product={product}
                                            onDelete={onDeleteProduct}
                                            onDuplicate={onDuplicateProduct}
                                            onDeploy={onDeployProduct}
                                            onUpdate={onUpdateProducts}
                                            callAi={callAi}
                                            accountName={account.name}
                                            onSaveKeywords={onSaveKeywordsToAccount}
                                            onDeleteKeywordFromLibrary={onDeleteKeywordFromAccountLibrary}
                                            customCopywritingPrompt={account['文案生成prompt'] || ''}
                                            businessDescription={account['业务描述'] || ''}
                                            onManageAccountKeywords={() => onManageAccountKeywords(account)}
                                            deployedTo={deployedToAccounts}
                                            isPending={false} // Already deployed, so not pending
                                            noteStats={product.noteStats} // Pass stats to card
                                        />
                                    );
                                })}
                            </div>
                        ) : (
                            <p className="text-center text-gray-500 py-4">该账号没有已投放的商品。</p>
                        )}
                    </div>
                )}
            </div>

            <div className="flex justify-between items-center mb-4">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white">商品列表 ({otherProducts.length})</h3>
                <div className="flex items-center gap-4">
                    <input
                        type="text"
                        placeholder="搜索商品ID、关键词、文案..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-64 p-2 border rounded-md text-sm bg-white dark:bg-gray-800 dark:border-gray-600 focus:ring-2 focus:ring-indigo-500"
                    />
                    <select
                        value={sortOrder}
                        onChange={handleSortChange}
                        className="text-sm bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md p-2"
                    >
                        <option value="newest">最新商品优先</option>
                        <option value="pendingFirst">待上架优先</option>
                    </select>
                </div>
            </div>

            {isAiAnalysisModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50 p-4" onClick={() => setIsAiAnalysisModalOpen(false)}>
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-2xl w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
                        <h2 className="text-2xl font-bold mb-4">🤖 AI 分析 Top 商品</h2>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">AI 将根据当前账号最新的 {products.slice(0, 50).length} 个商品进行分析。</p>
                        <textarea
                            value={aiAnalysisInput}
                            onChange={(e) => setAiAnalysisInput(e.target.value)}
                            rows={15}
                            className="w-full p-3 border rounded-md text-sm bg-gray-50 dark:bg-gray-700 dark:border-gray-600"
                            placeholder="AI 分析结果将显示在这里..."
                        />
                        <div className="mt-4 flex justify-end">
                             <button
                                onClick={() => handleAiAnalysis(account.name, aiAnalysisInput)}
                                disabled={isAiAnalyzing}
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg disabled:opacity-50"
                            >
                                {isAiAnalyzing ? '分析中...' : `开始分析 (Top ${products.slice(0, 50).length}个)`}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Business Description Edit Modal */}
            {isDescriptionModalOpen && (
                 <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50 p-4" onClick={() => setIsDescriptionModalOpen(false)}>
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-2xl w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
                        <h2 className="text-xl font-bold mb-4">编辑业务描述</h2>
                        <textarea
                            value={businessDescription}
                            onChange={(e) => setBusinessDescription(e.target.value)}
                            rows={10}
                            className="w-full p-3 border rounded-md text-sm bg-gray-50 dark:bg-gray-700 dark:border-gray-600"
                        />
                        <div className="flex justify-end gap-3 mt-5">
                            <button onClick={() => setIsDescriptionModalOpen(false)} className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded">取消</button>
                            <button 
                                onClick={handleSaveDescription} 
                                disabled={isSavingDescription || businessDescription === (account['业务描述'] || '')} 
                                className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
                            >
                                {isSavingDescription ? '保存中...' : '确认保存'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            
            {loading && <p className="text-center text-lg italic">正在加载商品...</p>}
            {error && <p className="text-center text-lg text-red-500">加载商品失败: {error}</p>}

            {!loading && !error && (
                <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
                    {otherProducts.map((product) => {
                        // Correctly find all accounts where this product has been deployed
                        const deployedToAccounts = allAccounts
                            .filter(acc => 
                                (acc['已上架json'] || []).some(item => String(item.id) === String(product.id))
                            )
                            .map(acc => acc.name);

                        return (
                            <ProductCard
                                key={product.id}
                                product={product}
                                onDelete={onDeleteProduct}
                                onDuplicate={onDuplicateProduct}
                                onDeploy={onDeployProduct}
                                onUpdate={onUpdateProducts}
                                callAi={callAi}
                                accountName={account.name}
                                onSaveKeywords={onSaveKeywordsToAccount}
                                onDeleteKeywordFromLibrary={onDeleteKeywordFromAccountLibrary}
                                customCopywritingPrompt={account['文案生成prompt'] || ''}
                                businessDescription={account['业务描述'] || ''}
                                onManageAccountKeywords={() => onManageAccountKeywords(account)}
                                deployedTo={deployedToAccounts}
                                isPending={!!product.isPending} // Use the pre-calculated flag
                                noteStats={product.noteStats} // Pass stats to card
                            />
                        );
                    })}
                </div>
            )}
            {!loading && products.length === 0 && (
                <div className="text-center py-10">
                    <p className="text-gray-500 text-lg">这个账号下没有找到任何商品。</p>
                </div>
            )}
        </div>
    );
};

export default ProductDetailView; 