'use client';

import React, { useState } from 'react';
import type { Account, ScheduledProduct } from '@/types';

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

const TagList: React.FC<{ 
    title: string; 
    items: (string | number | ScheduledProduct | { id: string | number; '上架时间': string })[] | null; 
    color: string;
    accountName: string;
    arrayKey: keyof Pick<Account, '待上架' | '已上架'>;
    onDeleteItem: (accountName: string, arrayKey: keyof Pick<Account, '待上架' | '已上架'>, item: string) => void;
    onRedeploy?: (accountName: string, productId: string) => Promise<void>;
    onShowAllClick?: (accountName: string, items: { id: string | number; '上架时间': string }[]) => void;
    schedulePreview?: ScheduledProduct[] | null;
    layout?: 'horizontal' | 'vertical';
    deployedIds?: (string | number)[] | null;
    // Props for editing schedule time
    editingSchedule?: { accountName: string; id: string; newTime: string } | null;
    setEditingSchedule?: (editState: { accountName: string; id: string; newTime: string } | null) => void;
    onUpdateTime?: (accountName: string, itemId: string, newTime: string) => void;
}> = ({ 
    title, items, color, accountName, arrayKey, onDeleteItem, onRedeploy, onShowAllClick,
    schedulePreview, layout = 'horizontal', deployedIds = [], editingSchedule, setEditingSchedule, onUpdateTime 
}) => {
    const [isExpanded, setIsExpanded] = useState(false);

    // --- RENDER LOGIC FOR '已上架' (DEPLOYED) LIST ---
    if (title === '已上架') {
        const sortedItems = (items as { id: string | number; '上架时间': string }[] || [])
            .slice()
            .sort((a, b) => new Date(b['上架时间']).getTime() - new Date(a['上架时间']).getTime());
        
        const totalCount = sortedItems.length;
        const latestItem = sortedItems[0] || null;

        if (totalCount === 0) {
            return (
                <div>
                    <h4 className={`font-semibold text-sm mb-1 text-gray-500 dark:text-gray-400`}>已上架 (0)</h4>
                    <span className="text-xs text-gray-500 dark:text-gray-400">无</span>
                </div>
            );
        }

        return (
            <div>
                 <div 
                    className={`font-semibold text-sm mb-1 text-${color}-600 dark:text-${color}-400 cursor-pointer flex justify-between items-center`}
                    onClick={() => setIsExpanded(!isExpanded)}
                >
                    <h4>{title} ({totalCount})</h4>
                     <span className={`transition-transform duration-200 inline-block text-xs ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                </div>

                {!isExpanded ? (
                    // Layer 1: Collapsed Summary View
                    <div onClick={(e) => { e.stopPropagation(); setIsExpanded(true); }} className="text-xs text-gray-600 dark:text-gray-400 cursor-pointer hover:text-black dark:hover:text-white">
                        {latestItem && (
                            <span title={new Date(latestItem['上架时间']).toLocaleString('zh-CN')}>
                                最新: ID {String(latestItem.id)} ({getRelativeTime(latestItem['上架时间'])})
                            </span>
                        )}
                    </div>
                ) : (
                    // Layer 2: Expanded Preview List
                    <div className="flex flex-col gap-1.5 mt-2">
                        {sortedItems.slice(0, 3).map(item => (
                             <div key={String(item.id)} className={`w-full flex justify-between items-center px-2 py-1.5 rounded-md text-xs font-mono bg-${color}-100 dark:bg-${color}-900/50 text-${color}-800 dark:text-${color}-300 group/tag`}>
                                <span><strong>ID: {String(item.id)}</strong> @ {new Date(item['上架时间']).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                                 <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onDeleteItem(accountName, arrayKey, String(item.id));
                                    }}
                                    className="p-1.5 text-2xl leading-none rounded-full opacity-0 group-hover/tag:opacity-100 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-200"
                                    aria-label={`Remove ${item.id}`}
                                >
                                    &times;
                                </button>
                            </div>
                        ))}
                        {totalCount > 3 && (
                            <button 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onShowAllClick?.(accountName, sortedItems);
                                }}
                                className="text-xs text-center text-blue-600 dark:text-blue-400 hover:underline mt-1 w-full"
                            >
                                ... 查看全部 ({totalCount})
                            </button>
                        )}
                    </div>
                )}
            </div>
        );
    }
    
    // --- RENDER LOGIC FOR OTHER LISTS (e.g., '今日上架计划') ---
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

        let placeholderRenderIndex = 1;

        return displayItems.map((item, index) => {
            // Handle placeholders in '待上架'
            if (typeof item === 'object' && item !== null && (item as ScheduledProduct).isPlaceholder) {
                const placeholder = item as ScheduledProduct;
                const displayId = `待定商品 ${placeholderRenderIndex++}`;
                return (
                    <div key={`placeholder-${index}`} className="w-full text-xs font-mono bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border border-dashed border-gray-400 dark:border-gray-600 px-2 py-1.5 rounded-md">
                        <span>{displayId}</span>
                        <span className="float-right font-sans"> (预计 @ {new Date(placeholder.scheduled_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })})</span>
                    </div>
                );
            }
            
            // This case should now be handled by the specific logic block above for `title === '已上架'`
            if (typeof item === 'object' && item !== null && '上架时间' in item) {
                return null; 
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