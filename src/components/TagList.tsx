'use client';

import React from 'react';
import type { Account, ScheduledProduct } from '@/types';

const TagList: React.FC<{ 
    title: string; 
    items: (string | number | ScheduledProduct | { id: string | number; '上架时间': string })[] | null; 
    color: string;
    accountName: string;
    arrayKey: keyof Pick<Account, '待上架' | '已上架'>;
    onDeleteItem: (accountName: string, arrayKey: keyof Pick<Account, '待上架' | '已上架'>, item: string) => void;
    onRedeploy?: (accountName: string, productId: string) => Promise<void>;
    schedulePreview?: ScheduledProduct[] | null;
    layout?: 'horizontal' | 'vertical';
    deployedIds?: (string | number)[] | null;
    // Props for editing schedule time
    editingSchedule?: { accountName: string; id: string; newTime: string } | null;
    setEditingSchedule?: (editState: { accountName: string; id: string; newTime: string } | null) => void;
    onUpdateTime?: (accountName: string, itemId: string, newTime: string) => void;
}> = ({ title, items, color, accountName, arrayKey, onDeleteItem, onRedeploy, schedulePreview, layout = 'horizontal', deployedIds = [], editingSchedule, setEditingSchedule, onUpdateTime }) => {
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
            const scheduledTime = new Date(scheduledItem.scheduled_at);
            const isPastDue = new Date() > scheduledTime;
            const hasFailed = isPastDue && !isDeployed;

            const displayTime = scheduledTime.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
            
            const itemColor = isDeployed ? 'green' : (hasFailed ? 'red' : color);
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
                    <div className="flex flex-col">
                        <span><strong>ID: {scheduledItem.id}</strong> @ {displayTime}</span>
                        {hasFailed && <span className="font-sans font-bold text-xs mt-1">投放失败</span>}
                    </div>
                    <div className="flex items-center gap-1.5 opacity-0 group-hover/tag:opacity-100 transition-opacity">
                        {isDeployed && (
                            <span className="font-sans font-bold text-xs pr-2">✅ 已上架</span>
                        )}

                        {hasFailed && onRedeploy && (
                             <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onRedeploy(accountName, String(scheduledItem.id));
                                }}
                                className="bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold py-1 px-2 rounded-md"
                                title="将此商品重新加入待上架队列末尾"
                            >
                                重新上架
                            </button>
                        )}

                        {onUpdateTime && setEditingSchedule && !hasFailed && (
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

export default TagList; 