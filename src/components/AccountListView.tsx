'use client';

import React, { useState } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import Image from 'next/image';
import TagList from '@/components/TagList';
import type { Account } from '@/types';
import DeploymentHistoryModal from './DeploymentHistoryModal'; // Import the new modal

type DeployedItem = { id: string | number; '上架时间': string };
interface AccountListViewProps {
    accounts: Account[];
    loading: boolean;
    error: string | null;
    deletingAccount: string | null;
    onDragEnd: (result: DropResult) => void;
    onAccountSelect: (account: Account) => void;
    onDeleteAccount: (accountName: string) => void;
    onSettingsClick: (account: Account) => void;
    onOpenAddAccountModal: () => void;
    onOpenAiAddAccountModal: () => void;
    // Props for TagList interaction
    editingSchedule: { accountName: string; id: string; newTime: string } | null;
    setEditingSchedule: (editState: { accountName: string; id: string; newTime: string } | null) => void;
    onUpdateScheduleTime: (accountName: string, itemId: string, newTime: string) => void;
    onDeleteItemFromArray: (accountName: string, arrayKey: keyof Pick<Account, '待上架' | '已上架'>, item: string) => void;
    onRedeploy: (accountName: string, productId: string) => Promise<void>;
    // Modals and their state can be passed as props, or handled via children, passing props is simpler for now
    isAddAccountModalOpen: boolean;
    closeAddAccountModal: () => void;
    newAccountName: string; setNewAccountName: (val: string) => void;
    newXhsAccount: string; setNewXhsAccount: (val: string) => void;
    newXianyuAccount: string; setNewXianyuAccount: (val: string) => void;
    newPhoneModel: string; setNewPhoneModel: (val: string) => void;
    isAddingAccount: boolean;
    onConfirmAddAccount: () => void;
    isAiAddAccountModalOpen: boolean;
    closeAiAddAccountModal: () => void;
    aiBatchInput: string; setAiBatchInput: (val: string) => void;
    isAiAddingAccounts: boolean;
    onConfirmAiAddAccounts: () => void;
}

const AccountListView: React.FC<AccountListViewProps> = ({
    accounts, loading, error, deletingAccount, onDragEnd, onAccountSelect, onDeleteAccount, onSettingsClick,
    onOpenAddAccountModal, onOpenAiAddAccountModal,
    editingSchedule, setEditingSchedule, onUpdateScheduleTime, onDeleteItemFromArray, onRedeploy,
    isAddAccountModalOpen, closeAddAccountModal, newAccountName, setNewAccountName, newXhsAccount, setNewXhsAccount,
    newXianyuAccount, setNewXianyuAccount, newPhoneModel, setNewPhoneModel, isAddingAccount, onConfirmAddAccount,
    isAiAddAccountModalOpen, closeAiAddAccountModal, aiBatchInput, setAiBatchInput, isAiAddingAccounts, onConfirmAiAddAccounts
}) => {
    // State for the new deployment history modal
    const [historyModalData, setHistoryModalData] = useState<{ accountName: string; items: DeployedItem[] } | null>(null);

    const handleShowAllHistory = (accountName: string, items: DeployedItem[]) => {
        setHistoryModalData({ accountName, items });
    };

    const handleCloseHistoryModal = () => {
        setHistoryModalData(null);
    };

    return (
        <div className="p-5 font-sans bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 min-h-screen">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-200">账号管理</h1>
                <div className="flex items-center gap-2">
                    <button
                        onClick={onOpenAiAddAccountModal}
                        className="bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold py-2 px-4 rounded"
                    >
                        🤖 AI 批量生成
                    </button>
                    <button
                        onClick={onOpenAddAccountModal}
                        className="bg-green-500 hover:bg-green-600 text-white text-sm font-bold py-2 px-4 rounded"
                    >
                        + 添加账号
                    </button>
                </div>
            </div>

            <hr className="my-6 border-gray-300 dark:border-gray-600" />

            <h2 className="text-xl font-semibold mb-3">账号列表</h2>
            {loading && <p>正在加载账号...</p>}
            {error && <p className="text-red-500">{error}</p>}

            {!loading && !error && (
                <DragDropContext onDragEnd={onDragEnd}>
                    <Droppable droppableId="accounts">
                        {(provided) => (
                            <div
                                {...provided.droppableProps}
                                ref={provided.innerRef}
                                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5"
                            >
                                {accounts.map((account, index) => (
                                    <Draggable key={account.name} draggableId={account.name} index={index}>
                                        {(provided, snapshot) => (
                                            <div
                                                ref={provided.innerRef}
                                                {...provided.draggableProps}
                                                className={`border rounded-lg bg-white dark:bg-gray-800 shadow-md flex flex-col gap-3 group/account transition-shadow ${snapshot.isDragging ? 'shadow-2xl ring-2 ring-purple-500' : 'shadow-md'}`}
                                            >
                                                <div 
                                                    className="flex items-center p-4 border-b dark:border-gray-700 cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50"
                                                    onClick={() => onAccountSelect(account)}
                                                >
                                                    <div
                                                        {...provided.dragHandleProps}
                                                        className="cursor-grab p-2 mr-3 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                                                        title="拖拽排序"
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                            <path d="M5 4a1 1 0 00-2 0v2a1 1 0 002 0V4zm0 6a1 1 0 00-2 0v2a1 1 0 002 0v-2zm0 6a1 1 0 00-2 0v2a1 1 0 002 0v-2zm6-12a1 1 0 00-2 0v2a1 1 0 002 0V4zm0 6a1 1 0 00-2 0v2a1 1 0 002 0v-2zm0 6a1 1 0 00-2 0v2a1 1 0 002 0v-2zm6-12a1 1 0 00-2 0v2a1 1 0 002 0V4zm0 6a1 1 0 00-2 0v2a1 1 0 002 0v-2zm0 6a1 1 0 00-2 0v2a1 1 0 002 0v-2z" />
                                                        </svg>
                                                    </div>
                                                    <div className="flex-grow">
                                                        <div className="flex items-center gap-3">
                                                            {account['xhs_头像'] ? (
                                                                <div className="relative w-12 h-12 rounded-full overflow-hidden border-2 border-pink-400 flex-shrink-0">
                                                                    <Image
                                                                        src={account['xhs_头像']}
                                                                        alt={`${account.xhs_account || account.name}'s avatar`}
                                                                        fill
                                                                        style={{ objectFit: 'cover' }}
                                                                        sizes="48px"
                                                                    />
                                                                </div>
                                                            ) : (
                                                                <div className="w-12 h-12 rounded-full bg-gray-300 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
                                                                    <span className="text-xl text-gray-500 dark:text-gray-400">?</span>
                                                                </div>
                                                            )}
                                                            <div>
                                                                <h3 className="font-bold text-lg">{account.name}</h3>
                                                                {account.xhs_account && <p className="text-xs text-gray-500">@{account.xhs_account}</p>}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); onDeleteAccount(account.name); }}
                                                        disabled={deletingAccount === account.name}
                                                        className="p-1.5 rounded-full text-gray-400 hover:text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors z-10 opacity-0 group-hover/account:opacity-100"
                                                        aria-label={`Delete account ${account.name}`}
                                                    >
                                                        {deletingAccount === account.name ? "..." : <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>}
                                                    </button>
                                                </div>
                                                <div className="px-4 pb-4 flex flex-col gap-3">
                                                    <div className="text-xs space-y-1 text-gray-600 dark:text-gray-400">
                                                        <p><strong className="font-semibold text-gray-700 dark:text-gray-300">闲鱼:</strong> {account['闲鱼账号'] || 'N/A'}</p>
                                                        <p><strong className="font-semibold text-gray-700 dark:text-gray-300">手机:</strong> {account['手机型号'] || 'N/A'}</p>
                                                        <div className="mt-2 flex flex-col gap-2">
                                                            <div className="flex flex-wrap gap-2">
                                                                <span className="inline-block bg-blue-100 text-blue-800 text-xs font-semibold px-2.5 py-0.5 rounded dark:bg-blue-200 dark:text-blue-800">
                                                                    今日新增商品: {account.today_new_products}
                                                                </span>
                                                                <span className="inline-block bg-green-100 text-green-800 text-xs font-semibold px-2.5 py-0.5 rounded dark:bg-green-200 dark:text-green-800">
                                                                    今日已上架: {
                                                                        (account['已上架json'] || []).filter((item) => {
                                                                            if (!item['上架时间']) return false;
                                                                            const itemDate = new Date(item['上架时间']);
                                                                            const today = new Date();
                                                                            return itemDate.getDate() === today.getDate() &&
                                                                                   itemDate.getMonth() === today.getMonth() &&
                                                                                   itemDate.getFullYear() === today.getFullYear();
                                                                        }).length
                                                                    }
                                                                </span>
                                                            </div>
                                                            
                                                            {/* Deployment History Tags */}
                                                            <div className="flex flex-wrap gap-1.5 items-center">
                                                                 <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">近期上架:</span>
                                                                {(() => {
                                                                    const stats: { [key: string]: number } = {};
                                                                    (account['已上架json'] || []).forEach(item => {
                                                                        if (item && item['上架时间']) {
                                                                            const date = new Date(item['上架时间']).toISOString().split('T')[0];
                                                                            stats[date] = (stats[date] || 0) + 1;
                                                                        }
                                                                    });
                                                                    const sortedStats = Object.entries(stats)
                                                                        .map(([date, count]) => ({ date, count }))
                                                                        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                                                                    
                                                                    if (sortedStats.length === 0) {
                                                                        return <span className="text-xs text-gray-400">无记录</span>;
                                                                    }

                                                                    return sortedStats.slice(0, 5).map(({ date, count }) => {
                                                                        const d = new Date(date);
                                                                        const today = new Date();
                                                                        const yesterday = new Date(today);
                                                                        yesterday.setDate(yesterday.getDate() - 1);
                                                                        
                                                                        let displayDate = '';
                                                                        if (d.toDateString() === today.toDateString()) {
                                                                            displayDate = '今天';
                                                                        } else if (d.toDateString() === yesterday.toDateString()) {
                                                                            displayDate = '昨天';
                                                                        } else {
                                                                            displayDate = d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
                                                                        }

                                                                        return (
                                                                            <span key={date} className="text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-0.5 rounded-full">
                                                                                {displayDate}: <strong>{count}</strong>
                                                                            </span>
                                                                        );
                                                                    });
                                                                })()}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-col gap-3 mt-2 border-t dark:border-gray-700 pt-3">
                                                        <div>
                                                            <TagList
                                                                title="今日上架计划"
                                                                items={account.todays_schedule || []}
                                                                color="blue"
                                                                accountName={account.name}
                                                                arrayKey='待上架'
                                                                onDeleteItem={onDeleteItemFromArray}
                                                                onRedeploy={onRedeploy}
                                                                layout="vertical"
                                                                deployedIds={(account['已上架json'] || []).map(item => String(item.id))}
                                                                editingSchedule={editingSchedule}
                                                                setEditingSchedule={setEditingSchedule}
                                                                onUpdateTime={onUpdateScheduleTime}
                                                            />
                                                        </div>
                                                        <div>
                                                            <TagList
                                                                title="已上架"
                                                                items={account['已上架json'] || []}
                                                                color="green"
                                                                accountName={account.name}
                                                                arrayKey='已上架'
                                                                onDeleteItem={onDeleteItemFromArray}
                                                                onShowAllClick={handleShowAllHistory}
                                                            />
                                                        </div>
                                                    </div>
                                                    <div className="border-t border-gray-200 dark:border-gray-600 mt-2 pt-2">
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); onSettingsClick(account); }}
                                                            className="w-full text-sm font-semibold text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100 flex justify-between items-center"
                                                        >
                                                            <span>高级设置</span>
                                                            <span>⚙️</span>
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </Draggable>
                                ))}
                                {provided.placeholder}
                            </div>
                        )}
                    </Droppable>
                </DragDropContext>
            )}
            {!loading && !error && accounts.length === 0 && (
                <div className="text-center p-5 text-gray-500">没有找到任何账号。</div>
            )}

            <DeploymentHistoryModal 
                isOpen={!!historyModalData}
                onClose={handleCloseHistoryModal}
                accountName={historyModalData?.accountName || ''}
                items={historyModalData?.items || []}
            />

            {isAddAccountModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-md">
                        <h2 className="text-xl font-bold mb-4">添加新账号</h2>
                        <div className="space-y-3">
                            <input type="text" placeholder="输入新账号名称 (必填)" value={newAccountName} onChange={(e) => setNewAccountName(e.target.value)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-500 rounded-md text-sm" />
                            <input type="text" placeholder="小红书账号 (选填)" value={newXhsAccount} onChange={(e) => setNewXhsAccount(e.target.value)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-500 rounded-md text-sm" />
                            <input type="text" placeholder="闲鱼账号 (选填)" value={newXianyuAccount} onChange={(e) => setNewXianyuAccount(e.target.value)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-500 rounded-md text-sm" />
                            <input type="text" placeholder="手机型号 (选填)" value={newPhoneModel} onChange={(e) => setNewPhoneModel(e.target.value)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-500 rounded-md text-sm" />
                        </div>
                        <div className="flex justify-end gap-3 mt-5">
                            <button onClick={closeAddAccountModal} className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded">取消</button>
                            <button onClick={onConfirmAddAccount} disabled={isAddingAccount || !newAccountName.trim()} className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded disabled:opacity-50">
                                {isAddingAccount ? '添加中...' : '确认添加'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {isAiAddAccountModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50 p-4" onClick={closeAiAddAccountModal}>
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-2xl w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
                        <h2 className="text-2xl font-bold mb-4 text-gray-800 dark:text-gray-200">🤖 AI 批量生成账号</h2>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                            请在下方文本框中输入或粘贴您的账号信息。AI将尝试自动解析并批量创建它们。
                            <br />
                            例如: <code className="text-xs bg-gray-200 dark:bg-gray-700 p-1 rounded">生成10个市场营销方向的高端英文账号，业务描述需要中英文</code>
                        </p>
                        <textarea
                            value={aiBatchInput}
                            onChange={(e) => setAiBatchInput(e.target.value)}
                            placeholder="在此处输入任意格式的账号信息..."
                            rows={10}
                            className="w-full p-3 border rounded-md text-sm bg-white dark:bg-gray-700 dark:border-gray-500 focus:ring-2 focus:ring-purple-500"
                            disabled={isAiAddingAccounts}
                        />
                        <div className="flex justify-end gap-3 mt-5">
                            <button onClick={closeAiAddAccountModal} className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded" disabled={isAiAddingAccounts}>取消</button>
                            <button onClick={onConfirmAiAddAccounts} disabled={isAiAddingAccounts || !aiBatchInput.trim()} className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50 flex items-center gap-2">
                                {isAiAddingAccounts ? '生成中...' : '🚀 开始生成'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AccountListView; 