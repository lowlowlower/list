'use client';

import React from 'react';
import type { Account, AccountKeywords, KeywordSearchHistory } from '@/types';

interface KeywordManagementViewProps {
    account: Account;
    onBack: () => void;
    keywords: AccountKeywords[];
    histories: KeywordSearchHistory[];
    loading: boolean;
    error: string | null;
    onKeywordTextChange: (id: number, newText: string) => void;
    onUpdateKeyword: (id: number) => Promise<void>;
    onDeleteKeyword: (id: number) => Promise<void>;
    onAddNewKeyword: () => Promise<void>;
    onGenerateRelatedKeywords: () => Promise<void>;
    isBatchGenerating: boolean;
}

const KeywordManagementView: React.FC<KeywordManagementViewProps> = ({
    account,
    onBack,
    keywords,
    histories,
    loading,
    error,
    onKeywordTextChange,
    onUpdateKeyword,
    onDeleteKeyword,
    onAddNewKeyword,
    onGenerateRelatedKeywords,
    isBatchGenerating,
}) => {
    return (
        <div className="p-5 font-sans bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 min-h-screen">
            <div className="flex items-center gap-4 mb-4">
                <button
                    onClick={onBack}
                    className="bg-gray-500 hover:bg-gray-600 text-white text-sm py-1.5 px-4 rounded-md cursor-pointer"
                >
                    ← 返回
                </button>
                <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-200">
                    <span className="font-normal">管理关键词: </span>
                    {account.name}
                </h1>
                <div className="ml-auto flex items-center gap-2">
                    <button
                        onClick={onGenerateRelatedKeywords}
                        disabled={isBatchGenerating || keywords.length === 0}
                        className="bg-purple-500 hover:bg-purple-600 text-white text-sm py-1.5 px-4 rounded-md disabled:opacity-50"
                    >
                        {isBatchGenerating ? '生成中...' : '🤖 AI 批量生成相关词'}
                    </button>
                    <button
                        onClick={onAddNewKeyword}
                        className="bg-green-500 hover:bg-green-600 text-white text-sm py-1.5 px-4 rounded-md"
                    >
                        + 新增关键词
                    </button>
                </div>
            </div>

            {loading && <p className="italic">正在加载关键词...</p>}
            {error && <p className="text-red-500">{error}</p>}
            
            <div className="space-y-3">
                {keywords.map(kw => {
                    const latestHistory = histories
                        .filter(h => h.keyword_id === kw.id)
                        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

                    return (
                        <div key={kw.id} className="flex flex-col gap-2 p-3 border rounded-lg bg-gray-50 dark:bg-gray-800 shadow-sm transition-all hover:shadow-md">
                            <div className="flex items-center gap-2">
                               <span className="text-sm font-mono text-gray-500 w-12 flex-shrink-0">ID: {kw.id}</span>
                               <input
                                 type="text"
                                 value={kw.keyword}
                                 onChange={(e) => onKeywordTextChange(kw.id, e.target.value)}
                                 className="flex-grow p-1.5 border rounded-md text-sm dark:bg-gray-700 dark:border-gray-600"
                               />
                                <button
                                    onClick={() => onUpdateKeyword(kw.id)}
                                    className="bg-blue-500 hover:bg-blue-600 text-white text-xs py-1.5 px-3 rounded-md flex-shrink-0"
                                >
                                    保存
                                </button>
                                <button
                                    onClick={() => onDeleteKeyword(kw.id)}
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
            {(!loading && keywords.length === 0) && (
                <p className="text-center text-gray-500 mt-6">该账户下没有关键词。</p>
            )}
        </div>
    );
};

export default KeywordManagementView; 