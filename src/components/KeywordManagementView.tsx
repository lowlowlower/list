'use client';

import React, { useState } from 'react';
import type { Account, AccountKeywords } from '@/types';

// Helper function to format relative time
const getRelativeTime = (isoString: string): string => {
    if (!isoString) return '';
    const date = new Date(isoString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    const minutes = Math.floor(diffInSeconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 1) return `${days}天前`;
    if (days === 1) return '昨天';
    if (hours > 0) return `${hours}小时前`;
    if (minutes > 0) return `${minutes}分钟前`;
    return '刚刚';
};


interface KeywordManagementViewProps {
    account: Account;
    onBack: () => void;
    keywords: AccountKeywords[];
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
    loading,
    error,
    onKeywordTextChange,
    onUpdateKeyword,
    onDeleteKeyword,
    onAddNewKeyword,
    onGenerateRelatedKeywords,
    isBatchGenerating,
}) => {
    const [expandedKeywordId, setExpandedKeywordId] = useState<number | null>(null);

    const handleToggleExpand = (keywordId: number) => {
        setExpandedKeywordId(prevId => (prevId === keywordId ? null : keywordId));
    };

    return (
        <div className="p-5 font-sans bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 min-h-screen">
            <div className="flex items-center gap-4 mb-6">
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

            {loading && <p className="italic text-center py-4">正在加载关键词...</p>}
            {error && <p className="text-red-500 text-center py-4">{error}</p>}
            
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                <table className="w-full">
                    <thead className="bg-gray-100 dark:bg-gray-800 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400">
                        <tr>
                            <th className="p-3 w-12 text-center"></th>
                            <th className="p-3">ID</th>
                            <th className="p-3 w-2/5">关键词</th>
                            <th className="p-3">最新搜索摘要</th>
                            <th className="p-3 text-right">操作</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {keywords.map(kw => {
                            const sortedHistory = (kw.search_history || []).slice().sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
                            const latestHistory = sortedHistory[0] || null;
                            const isExpanded = expandedKeywordId === kw.id;

                            return (
                                <React.Fragment key={kw.id}>
                                    <tr onClick={() => handleToggleExpand(kw.id)} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer">
                                        <td className="p-3 text-center">
                                            <span className={`transition-transform duration-200 inline-block ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                                        </td>
                                        <td className="p-3 text-sm font-mono text-gray-500">{kw.id}</td>
                                        <td className="p-3" onClick={e => e.stopPropagation()}>
                                           <input
                                             type="text"
                                             value={kw.keyword}
                                             onChange={(e) => onKeywordTextChange(kw.id, e.target.value)}
                                             className="w-full p-1.5 border rounded-md text-sm dark:bg-gray-700 dark:border-gray-600"
                                           />
                                        </td>
                                        <td className="p-3 text-sm text-gray-600 dark:text-gray-400">
                                            {latestHistory ? (
                                                <span title={new Date(latestHistory.timestamp).toLocaleString('zh-CN')}>
                                                    {`${getRelativeTime(latestHistory.timestamp)}, 发现 ${latestHistory.count} 个`}
                                                </span>
                                            ) : (
                                                <span className="text-gray-400 italic">从未搜索</span>
                                            )}
                                        </td>
                                        <td className="p-3 text-right" onClick={e => e.stopPropagation()}>
                                            <div className="flex justify-end items-center gap-2">
                                                <button onClick={() => onUpdateKeyword(kw.id)} className="bg-blue-500 hover:bg-blue-600 text-white text-xs py-1.5 px-3 rounded-md">保存</button>
                                                <button onClick={() => onDeleteKeyword(kw.id)} className="bg-red-500 hover:bg-red-600 text-white text-xs py-1.5 px-3 rounded-md">删除</button>
                                            </div>
                                        </td>
                                    </tr>
                                    {isExpanded && (
                                        <tr className="bg-gray-50 dark:bg-gray-800">
                                            <td colSpan={5} className="p-4">
                                                <div className="bg-white dark:bg-gray-700/50 p-3 rounded-md shadow-inner">
                                                    <h4 className="font-semibold text-md mb-2">搜索历史记录 ({sortedHistory.length} 次)</h4>
                                                    {sortedHistory.length > 0 ? (
                                                        <ul className="space-y-2 max-h-48 overflow-y-auto pr-2">
                                                            {sortedHistory.map((hist, index) => (
                                                                <li key={index} className="flex justify-between items-center text-sm p-2 rounded-md bg-gray-100 dark:bg-gray-900/70">
                                                                    <span className="text-gray-700 dark:text-gray-300">{new Date(hist.timestamp).toLocaleString('zh-CN')}</span>
                                                                    <span className="font-bold text-indigo-600 dark:text-indigo-400">{hist.count} 个结果</span>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    ) : (
                                                        <p className="text-sm text-gray-500 italic">无历史记录</p>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            )
                        })}
                    </tbody>
                </table>
            </div>
            
            {(!loading && keywords.length === 0) && (
                <p className="text-center text-gray-500 mt-6 py-4">该账户下没有关键词。</p>
            )}
        </div>
    );
};

export default KeywordManagementView; 