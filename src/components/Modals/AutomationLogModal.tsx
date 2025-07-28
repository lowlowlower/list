'use client';

import React, { useState, useEffect } from 'react';

// Define the type for a single log entry, mirroring the database structure
type LogEntry = {
    id: number;
    created_at: string;
    run_id: string;
    level: 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR';
    message: string;
    metadata: object | null;
};

// Define the shape of the API response
type ApiResponse = {
    logs: LogEntry[];
    totalCount: number;
    totalPages: number;
    currentPage: number;
};

interface AutomationLogModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const AutomationLogModal: React.FC<AutomationLogModalProps> = ({ isOpen, onClose }) => {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);

    useEffect(() => {
        if (isOpen) {
            fetchLogs(page);
        }
    }, [isOpen, page]);

    const fetchLogs = async (pageNum: number) => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch(`/api/get-automation-logs?page=${pageNum}`);
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to fetch logs');
            }
            const data: ApiResponse = await response.json();
            setLogs(data.logs);
            setTotalPages(data.totalPages);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An unknown error occurred.');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    const getLevelColor = (level: LogEntry['level']) => {
        switch (level) {
            case 'SUCCESS': return 'text-green-500';
            case 'ERROR': return 'text-red-500';
            case 'WARN': return 'text-yellow-500';
            default: return 'text-gray-400';
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50 p-4" onClick={onClose}>
            <div 
                className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col" 
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex justify-between items-center mb-4 border-b pb-3 dark:border-gray-600">
                    <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-200">自动化日志中心</h2>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100 text-3xl font-light">&times;</button>
                </div>

                <div className="flex-grow flex gap-4 overflow-hidden">
                    {/* Log Table */}
                    <div className="w-2/3 flex flex-col">
                        <div className="flex-grow overflow-y-auto border dark:border-gray-600 rounded-lg">
                            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-medium uppercase">Time</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium uppercase">Level</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium uppercase">Message</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                    {loading ? (
                                        <tr><td colSpan={3} className="text-center p-8">加载中...</td></tr>
                                    ) : error ? (
                                        <tr><td colSpan={3} className="text-center p-8 text-red-500">{error}</td></tr>
                                    ) : logs.map(log => (
                                        <tr key={log.id} onClick={() => setSelectedLog(log)} className={`cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 ${selectedLog?.id === log.id ? 'bg-blue-50 dark:bg-blue-900/50' : ''}`}>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm">{new Date(log.created_at).toLocaleString()}</td>
                                            <td className={`px-4 py-3 whitespace-nowrap text-sm font-bold ${getLevelColor(log.level)}`}>{log.level}</td>
                                            <td className="px-4 py-3 text-sm truncate" title={log.message}>{log.message}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {/* Pagination */}
                        <div className="flex justify-between items-center pt-4">
                            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="px-4 py-2 text-sm bg-gray-200 dark:bg-gray-600 rounded disabled:opacity-50">上一页</button>
                            <span>第 {page} 页 / 共 {totalPages} 页</span>
                            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-4 py-2 text-sm bg-gray-200 dark:bg-gray-600 rounded disabled:opacity-50">下一页</button>
                        </div>
                    </div>

                    {/* Metadata Viewer */}
                    <div className="w-1/3 bg-gray-50 dark:bg-gray-900/50 p-4 rounded-lg overflow-y-auto">
                        <h3 className="font-semibold text-lg mb-2 border-b pb-2 dark:border-gray-600">元数据详情</h3>
                        {selectedLog ? (
                            <div>
                                <p><strong>Run ID:</strong> {selectedLog.run_id}</p>
                                {selectedLog.metadata && <pre className="mt-2 text-xs bg-white dark:bg-gray-800 p-2 rounded whitespace-pre-wrap"><code>{JSON.stringify(selectedLog.metadata, null, 2)}</code></pre>}
                            </div>
                        ) : (
                            <p className="text-gray-500">点击左侧日志查看详情</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AutomationLogModal; 