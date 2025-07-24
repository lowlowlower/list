'use client';

import React, { useState, useMemo } from 'react';

type DeployedItem = { id: string | number; '上架时间': string };

interface DeploymentHistoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    accountName: string;
    items: DeployedItem[];
}

const DeploymentHistoryModal: React.FC<DeploymentHistoryModalProps> = ({
    isOpen,
    onClose,
    accountName,
    items,
}) => {
    const [searchQuery, setSearchQuery] = useState('');

    const filteredItems = useMemo(() => {
        const sorted = items.slice().sort((a, b) => new Date(b['上架时间']).getTime() - new Date(a['上架时间']).getTime());
        if (!searchQuery.trim()) {
            return sorted;
        }
        return sorted.filter(item => String(item.id).includes(searchQuery.trim()));
    }, [items, searchQuery]);

    if (!isOpen) return null;

    return (
        <div 
            className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50 p-4" 
            onClick={onClose}
        >
            <div 
                className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex justify-between items-center mb-4">
                    <div>
                        <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200">上架历史记录</h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{accountName}</p>
                    </div>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100 text-2xl font-bold">&times;</button>
                </div>
                
                <input
                    type="text"
                    placeholder="按商品ID搜索..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full p-2 mb-4 border rounded-md text-sm bg-gray-50 dark:bg-gray-700 dark:border-gray-600"
                />

                <div className="flex-grow overflow-y-auto pr-2">
                    <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                        {filteredItems.map(item => (
                            <li key={String(item.id)} className="py-3 flex justify-between items-center">
                                <span className="font-mono text-gray-700 dark:text-gray-300">ID: {String(item.id)}</span>
                                <span className="text-sm text-gray-500 dark:text-gray-400">
                                    {new Date(item['上架时间']).toLocaleString('zh-CN')}
                                </span>
                            </li>
                        ))}
                    </ul>
                    {filteredItems.length === 0 && (
                        <p className="text-center text-gray-500 py-8">
                            {searchQuery ? '没有找到匹配的记录。' : '无上架记录。'}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default DeploymentHistoryModal; 