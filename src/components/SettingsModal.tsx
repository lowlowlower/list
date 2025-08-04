'use client';

import React from 'react';
import type { Account } from '@/types';

interface SettingsModalProps {
  account: Account;
  onClose: () => void;
  onSaveField: (accountName: string, field: '关键词prompt' | '业务描述' | '文案生成prompt' | 'xhs_account' | '闲鱼账号' | '手机型号', value: string) => Promise<void>;
  onSaveKeywords: (accountName: string) => Promise<void>;
  onGenerateKeywords: (accountName: string) => Promise<void>;
  onSaveRule: (accountName: string, scheduleTemplate: string[]) => Promise<void>;
  onResetSchedule: (accountName: string) => void;
  onNavigateToKeywords: (account: Account) => void;
  
  isSubmitting: boolean;
  
  editingCopywritingPrompts: { [key: string]: string };
  setEditingCopywritingPrompts: React.Dispatch<React.SetStateAction<{ [key: string]: string }>>;
  
  editingBusinessPrompts: { [key: string]: string };
  setEditingBusinessPrompts: React.Dispatch<React.SetStateAction<{ [key: string]: string }>>;

  editingKeywordPrompts: { [key: string]: string };
  setEditingKeywordPrompts: React.Dispatch<React.SetStateAction<{ [key: string]: string }>>;
  
  editingKeywords: { [key: string]: string };
  setEditingKeywords: React.Dispatch<React.SetStateAction<{ [key: string]: string }>>;
  
  editingXhs: { [key: string]: string };
  setEditingXhs: React.Dispatch<React.SetStateAction<{ [key: string]: string }>>;
  
  editingXianyu: { [key: string]: string };
  setEditingXianyu: React.Dispatch<React.SetStateAction<{ [key: string]: string }>>;

  editingPhone: { [key: string]: string };
  setEditingPhone: React.Dispatch<React.SetStateAction<{ [key: string]: string }>>;
  
  loadingStates: { [key: string]: { ai?: boolean; saveKeywords?: boolean; saveKwPrompt?: boolean; saveBizPrompt?: boolean; saveCopyPrompt?: boolean; saveRule?: boolean; } };
}

const SettingsModal: React.FC<SettingsModalProps> = ({
  account,
  onClose,
  onSaveField,
  onSaveKeywords,
  onGenerateKeywords,
  onSaveRule,
  onResetSchedule,
  onNavigateToKeywords,
  editingCopywritingPrompts, setEditingCopywritingPrompts,
  editingBusinessPrompts, setEditingBusinessPrompts,
  editingKeywordPrompts, setEditingKeywordPrompts,
  editingKeywords, setEditingKeywords,
  editingXhs, setEditingXhs,
  editingXianyu, setEditingXianyu,
  editingPhone, setEditingPhone,
  loadingStates,
  isSubmitting,
}) => {
    
    const [scheduleTemplate, setScheduleTemplate] = React.useState<string[]>([]);

    React.useEffect(() => {
        const existingTemplate = account.schedule_template;
        if (existingTemplate && Array.isArray(existingTemplate) && existingTemplate.length > 0) {
            setScheduleTemplate(existingTemplate.map(time => String(time || '')));
        } else {
            // Provide a default, user-friendly template if none exists
            setScheduleTemplate(['09:00', '12:00', '15:00', '18:00', '21:00']);
        }
    }, [account]);

    const handleTemplateChange = (index: number, value: string) => {
        const newTemplate = [...scheduleTemplate];
        newTemplate[index] = value;
        setScheduleTemplate(newTemplate);
    };

    const addTemplateTime = () => {
        setScheduleTemplate([...scheduleTemplate, '']);
    };

    const removeTemplateTime = (index: number) => {
        const newTemplate = scheduleTemplate.filter((_, i) => i !== index);
        setScheduleTemplate(newTemplate);
    };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold">
            高级设置: <span className="text-blue-600 dark:text-blue-400">{account.name}</span>
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100 text-2xl font-bold">&times;</button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          <div className="space-y-4 p-4 border rounded-lg bg-gray-50 dark:bg-gray-800/50">
            <h3 className="text-lg font-semibold border-b pb-2">🤖 AI 提示词管理</h3>
            <div>
              <label className="text-base font-semibold text-gray-700 dark:text-gray-300 block mb-1">文案生成提示词</label>
              <p className="text-xs text-gray-500 mb-2">这是最重要的提示词，用于AI生成商品文案。</p>
              <textarea
                value={editingCopywritingPrompts[account.name] || ''}
                onChange={(e) => setEditingCopywritingPrompts(prev => ({...prev, [account.name]: e.target.value}))}
                rows={8}
                className="w-full p-2 border rounded-md text-sm bg-white dark:bg-gray-700 dark:border-gray-500"
              />
              <button
                onClick={() => onSaveField(account.name, '文案生成prompt', editingCopywritingPrompts[account.name])}
                disabled={loadingStates[account.name]?.saveCopyPrompt || editingCopywritingPrompts[account.name] === (account['文案生成prompt'] || '')}
                className="w-full mt-2 bg-blue-600 hover:bg-blue-700 text-white text-sm py-2 px-4 rounded disabled:opacity-50"
              >
                {loadingStates[account.name]?.saveCopyPrompt ? '保存中...' : '保存文案提示词'}
              </button>
            </div>
            <div>
              <label className="text-base font-semibold text-gray-700 dark:text-gray-300 block mb-1">业务描述</label>
              <textarea
                value={editingBusinessPrompts[account.name] || ''}
                onChange={(e) => setEditingBusinessPrompts(prev => ({...prev, [account.name]: e.target.value}))}
                rows={4}
                className="w-full p-2 border rounded-md text-sm bg-white dark:bg-gray-700 dark:border-gray-500"
              />
              <button
                onClick={() => onSaveField(account.name, '业务描述', editingBusinessPrompts[account.name])}
                disabled={loadingStates[account.name]?.saveBizPrompt || editingBusinessPrompts[account.name] === (account['业务描述'] || '')}
                className="w-full mt-2 bg-teal-500 hover:bg-teal-600 text-white text-sm py-2 px-4 rounded disabled:opacity-50"
              >
                {loadingStates[account.name]?.saveBizPrompt ? '保存中...' : '保存业务描述'}
              </button>
            </div>
            <div>
              <label className="text-base font-semibold text-gray-700 dark:text-gray-300 block mb-1">关键词生成提示词</label>
              <textarea
                value={editingKeywordPrompts[account.name] || ''}
                onChange={(e) => setEditingKeywordPrompts(prev => ({...prev, [account.name]: e.target.value}))}
                rows={4}
                className="w-full p-2 border rounded-md text-sm bg-white dark:bg-gray-700 dark:border-gray-500"
              />
              <button
                onClick={() => onSaveField(account.name, '关键词prompt', editingKeywordPrompts[account.name])}
                disabled={loadingStates[account.name]?.saveKwPrompt || editingKeywordPrompts[account.name] === (account['关键词prompt'] || '')}
                className="w-full mt-2 bg-teal-500 hover:bg-teal-600 text-white text-sm py-2 px-4 rounded disabled:opacity-50"
              >
                {loadingStates[account.name]?.saveKwPrompt ? '保存中...' : '保存生成提示词'}
              </button>
            </div>
          </div>

          <div className="space-y-4 p-4 border rounded-lg bg-gray-50 dark:bg-gray-800/50">
            <h3 className="text-lg font-semibold border-b pb-2">⚙️ 核心资产与关键词</h3>
            <div>
              <label className="text-base font-semibold text-gray-700 dark:text-gray-300 block mb-1">推广关键词</label>
              <p className="text-xs text-gray-500 mb-2">用于AI生成相关关键词，支持AI生成和手动管理。</p>
              <textarea
                value={editingKeywords[account.name] || ''}
                onChange={(e) => setEditingKeywords(prev => ({...prev, [account.name]: e.target.value}))}
                placeholder="点击AI生成或手动输入关键词..."
                rows={5}
                className="w-full p-2 border rounded-md text-sm bg-white dark:bg-gray-700 dark:border-gray-500"
              />
              <div className="grid grid-cols-2 gap-2 mt-2">
                <button
                  onClick={() => onGenerateKeywords(account.name)}
                  disabled={loadingStates[account.name]?.ai}
                  className="bg-blue-500 hover:bg-blue-600 text-white text-sm py-2 px-2 rounded disabled:opacity-50"
                >
                  {loadingStates[account.name]?.ai ? '生成中...' : 'AI生成'}
                </button>
                <button 
                  onClick={() => onSaveKeywords(account.name)}
                  disabled={loadingStates[account.name]?.saveKeywords || editingKeywords[account.name] === (account.keywords || '')}
                  className="bg-green-500 hover:bg-green-600 text-white text-sm py-2 px-2 rounded disabled:opacity-50"
                >
                  {loadingStates[account.name]?.saveKeywords ? '保存中...' : '保存'}
                </button>
              </div>
              <button
                onClick={() => onNavigateToKeywords(account)}
                className="w-full mt-2 bg-purple-500 hover:bg-purple-600 text-white text-sm py-2 px-2 rounded"
              >
                进入关键词列表详细管理 &rarr;
              </button>
            </div>
            <div className="border-t pt-4 space-y-3">
              <h4 className="text-base font-semibold">核心资产</h4>
              <div>
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 block mb-1">小红书账号</label>
                <input
                  type="text"
                  value={editingXhs[account.name] || ''}
                  onChange={(e) => setEditingXhs(prev => ({...prev, [account.name]: e.target.value}))}
                  className="w-full p-2 border rounded-md text-sm bg-white dark:bg-gray-700 dark:border-gray-500"
                />
                <button
                  onClick={() => onSaveField(account.name, 'xhs_account', editingXhs[account.name])}
                  disabled={editingXhs[account.name] === (account.xhs_account || '')}
                  className="w-full mt-2 bg-teal-500 hover:bg-teal-600 text-white text-xs py-1.5 px-2 rounded disabled:opacity-50"
                >
                  保存
                </button>
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 block mb-1">闲鱼账号</label>
                <input
                  type="text"
                  value={editingXianyu[account.name] || ''}
                  onChange={(e) => setEditingXianyu(prev => ({...prev, [account.name]: e.target.value}))}
                  className="w-full p-2 border rounded-md text-sm bg-white dark:bg-gray-700 dark:border-gray-500"
                />
                <button
                  onClick={() => onSaveField(account.name, '闲鱼账号', editingXianyu[account.name])}
                  disabled={editingXianyu[account.name] === (account['闲鱼账号'] || '')}
                  className="w-full mt-2 bg-teal-500 hover:bg-teal-600 text-white text-xs py-1.5 px-2 rounded disabled:opacity-50"
                >
                  保存
                </button>
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 block mb-1">手机型号</label>
                <input
                  type="text"
                  value={editingPhone[account.name] || ''}
                  onChange={(e) => setEditingPhone(prev => ({...prev, [account.name]: e.target.value}))}
                  className="w-full p-2 border rounded-md text-sm bg-white dark:bg-gray-700 dark:border-gray-500"
                />
                <button
                  onClick={() => onSaveField(account.name, '手机型号', editingPhone[account.name])}
                  disabled={editingPhone[account.name] === (account['手机型号'] || '')}
                  className="w-full mt-2 bg-teal-500 hover:bg-teal-600 text-white text-xs py-1.5 px-2 rounded disabled:opacity-50"
                >
                  保存
                </button>
              </div>
            </div>
            
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold border-b pb-2 mb-3">🗓️ 每日上架时刻表</h3>
               <p className="text-xs text-gray-500 mb-2">设定每天自动上架的精确时间点。此模板将每日重复使用。</p>
                <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                    {scheduleTemplate.map((time, index) => (
                        <div key={index} className="flex items-center gap-2">
                            <input
                                type="time"
                                value={time}
                                onChange={(e) => handleTemplateChange(index, e.target.value)}
                                className="w-full px-3 py-2 bg-white dark:bg-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                            />
                            <button
                                onClick={() => removeTemplateTime(index)}
                                className="px-3 py-2 text-sm font-medium text-white bg-red-500 rounded-md hover:bg-red-600"
                            >
                                &ndash;
                            </button>
                        </div>
                    ))}
                </div>
                <button
                    onClick={addTemplateTime}
                    className="w-full mt-3 px-4 py-2 text-sm font-medium text-white bg-blue-500 rounded-md hover:bg-blue-600"
                >
                    + 添加时间点
                </button>
              
              <div className="mt-4 flex justify-end gap-2">
                <button
                  onClick={() => onSaveRule(account.name, scheduleTemplate)}
                  disabled={isSubmitting}
                  className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? '保存中...' : '保存时刻表'}
                </button>
                <button 
                  onClick={() => onResetSchedule(account.name)}
                  disabled={isSubmitting}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? '重置中...' : '清空已排期'}
                </button>
              </div>

                <div className="mt-4 p-3 rounded-md border bg-blue-50 border-blue-200 dark:bg-blue-900/30 dark:border-blue-800">
                    <h4 className="text-sm font-semibold mb-2 text-blue-800 dark:text-blue-200">
                        今日排期预览 (共 {scheduleTemplate.filter(t => t).length} 个)
                    </h4>
                    <div className="text-xs text-blue-700 dark:text-blue-300 space-y-1">
                        {scheduleTemplate.filter(t => t).sort().map((time, index) => (
                             <p key={`preview-${index}`} className="text-gray-600 dark:text-gray-300">
                                 • 预计上架于: <span className="font-semibold">{time}</span>
                             </p>
                        ))}
                    </div>
                </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal; 