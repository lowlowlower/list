'use client';

import React from 'react';
import type { PublishedNote } from '@/types';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface StatsHistoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    note: PublishedNote | null;
}

const StatsHistoryModal: React.FC<StatsHistoryModalProps> = ({ isOpen, onClose, note }) => {
    if (!isOpen || !note) {
        return null;
    }

    const formattedHistory = (note.stats_history || [])
        .slice() // Create a shallow copy to avoid mutating original data
        .sort((a, b) => new Date(a.crawled_at).getTime() - new Date(b.crawled_at).getTime())
        .map(item => ({
            ...item,
            // Format date for display on the X-axis
            date: new Date(item.crawled_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
        }));


    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50 p-4" onClick={onClose}>
            <div 
                className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col" 
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex justify-between items-center mb-4 border-b pb-3 dark:border-gray-600">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-200 truncate" title={note.title || ''}>
                            数据详情: {note.title}
                        </h2>
                        {note.note_url && (
                            <a 
                                href={note.note_url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-sm text-blue-500 hover:text-blue-600 hover:underline"
                            >
                                打开小红书原文 ↗
                            </a>
                        )}
                    </div>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100 text-3xl font-light">&times;</button>
                </div>

                <div className="flex-grow overflow-y-auto space-y-6">
                    {/* Chart Section */}
                    <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-lg">
                        <h3 className="font-semibold text-lg mb-4 text-center">数据趋势图</h3>
                        <div style={{ width: '100%', height: 300 }}>
                            <ResponsiveContainer>
                                <LineChart
                                    data={formattedHistory}
                                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="date" />
                                    <YAxis />
                                    <Tooltip 
                                        contentStyle={{ 
                                            backgroundColor: 'rgba(31, 41, 55, 0.8)', // dark:bg-gray-800 with opacity
                                            borderColor: 'rgba(75, 85, 99, 1)', // dark:border-gray-600
                                            color: '#f9fafb' // dark:text-gray-50
                                        }}
                                    />
                                    <Legend />
                                    <Line type="monotone" dataKey="views" name="浏览" stroke="#8884d8" activeDot={{ r: 8 }} />
                                    <Line type="monotone" dataKey="likes" name="点赞" stroke="#82ca9d" />
                                    <Line type="monotone" dataKey="saves" name="收藏" stroke="#ffc658" />
                                    <Line type="monotone" dataKey="comments" name="评论" stroke="#ff8042" />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Stats History Table Section */}
                    <div className="p-4">
                        <h3 className="font-semibold text-lg mb-2 text-center">历史记录详情</h3>
                        <div className="max-h-60 overflow-y-auto border dark:border-gray-600 rounded-lg">
                            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0">
                                    <tr>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">抓取时间</th>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">浏览</th>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">点赞</th>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">收藏</th>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">评论</th>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">分享</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                    {formattedHistory.slice().reverse().map((item, index) => (
                                        <tr key={index}>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{item.date}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{item.views}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{item.likes}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{item.saves}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{item.comments}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{item.shares}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                         {formattedHistory.length === 0 && (
                            <p className="text-center text-gray-500 mt-4">没有可用的历史数据。</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default StatsHistoryModal; 