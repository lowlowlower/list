'use client';

import React, { createContext, useState, useContext, ReactNode, useCallback, useEffect } from 'react';

// The new translateText function is a client-side wrapper for our API endpoint.
const translateText = async (
    text: string,
    sourceLanguage: string, // Kept for potential future use, but currently unused
    targetLanguage: string,
    promptTemplate?: string
): Promise<string> => {
    if (!text.trim()) {
        return '';
    }
    try {
        const response = await fetch('/api/translate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, targetLanguage, promptTemplate }),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Translation failed');
        }

        return data.translatedText;
    } catch (error) {
        console.error("Translation API call failed:", error);
        // Return the original text as a fallback
        return `Translation Error: ${error instanceof Error ? error.message : String(error)}`;
    }
};


// 1. Define the context shape
interface TranslationContextType {
    translate: (text: string, sourceLang: string, targetLang: string) => Promise<void>;
}

// 2. Create the context
const TranslationContext = createContext<TranslationContextType | undefined>(undefined);

// 3. Create a custom hook for easy access
export const useTranslation = () => {
    const context = useContext(TranslationContext);
    if (!context) {
        throw new Error('useTranslation must be used within a TranslationProvider');
    }
    return context;
};

const DEFAULT_PROMPT = `Translate the following text into {{targetLanguage}}.
IMPORTANT: Respond with only the translated text, without any additional comments, formatting, or explanations.

Text to translate:
---
{{text}}
---`;

// 4. Create the provider component
export const TranslationProvider = ({ children }: { children: ReactNode }) => {
    const [isWidgetVisible, setIsWidgetVisible] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [originalText, setOriginalText] = useState('');
    const [translatedText, setTranslatedText] = useState('');
    const [error, setError] = useState<string | null>(null);

    // --- New State for Settings ---
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [customPrompt, setCustomPrompt] = useState(DEFAULT_PROMPT);
    const [testInput, setTestInput] = useState('Hello world');
    const [testOutput, setTestOutput] = useState('');
    const [isTesting, setIsTesting] = useState(false);
    
    // Load custom prompt from local storage on mount
    useEffect(() => {
        const savedPrompt = localStorage.getItem('translation_prompt');
        if (savedPrompt) {
            setCustomPrompt(savedPrompt);
        }
    }, []);

    const handleSavePrompt = () => {
        localStorage.setItem('translation_prompt', customPrompt);
        alert('提示词已保存！');
    };

    const handleTestPrompt = async () => {
        setIsTesting(true);
        setTestOutput('');
        try {
            const result = await translateText(testInput, 'Chinese', customPrompt);
            setTestOutput(result);
        } catch (err) {
            setTestOutput(`测试出错: ${err instanceof Error ? err.message : 'Unknown error'}`);
        } finally {
            setIsTesting(false);
        }
    };

    const translate = useCallback(async (text: string, sourceLang: string, targetLang: string) => {
        setIsLoading(true);
        setOriginalText(text);
        setTranslatedText('');
        setError(null);
        try {
            const result = await translateText(text, sourceLang, targetLang, customPrompt);
            setTranslatedText(result);
            // Copy to clipboard automatically
            await navigator.clipboard.writeText(result);
            alert('翻译成功，已复制到剪贴板！');
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            setError(`Translation failed: ${errorMessage}`);
            alert(`翻译失败: ${errorMessage}`);
        } finally {
            setIsLoading(false);
        }
    }, [customPrompt]); // Depend on customPrompt

    const value = { translate };

    return (
        <TranslationContext.Provider value={value}>
            {children}

            {isWidgetVisible && (
                <div 
                    style={{
                        position: 'fixed',
                        bottom: '20px',
                        right: '20px',
                        width: '450px',
                        zIndex: 9999,
                        backgroundColor: '#1f2937', // dark:bg-gray-800
                        color: '#d1d5db', // dark:text-gray-300
                        borderRadius: '12px',
                        border: '1px solid #4b5563', // dark:border-gray-600
                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2)',
                        display: 'flex',
                        flexDirection: 'column',
                        fontFamily: 'sans-serif',
                    }}
                >
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #4b5563' }}>
                        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{color: '#60a5fa'}}>AI 翻译</span>
                        </h3>
                        <div style={{display: 'flex', alignItems: 'center', gap: '12px'}}>
                             <button onClick={() => setIsSettingsOpen(!isSettingsOpen)} title="设置" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#9ca3af' }}>
                                <svg xmlns="http://www.w3.org/2000/svg" style={{height: '18px', width: '18px'}} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                            </button>
                            <button onClick={() => setIsWidgetVisible(false)} title="关闭" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#9ca3af' }}>
                                <svg xmlns="http://www.w3.org/2000/svg" style={{height: '20px', width: '20px'}} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                    </div>
                    
                    {/* Main Content */}
                    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto', maxHeight: isSettingsOpen ? '150px' : '400px', transition: 'max-height 0.3s ease-in-out' }}>
                        <div>
                            <label style={{ fontSize: '12px', fontWeight: '600', color: '#9ca3af' }}>原文</label>
                            <p style={{ fontSize: '14px', marginTop: '4px', padding: '10px', backgroundColor: '#374151', borderRadius: '6px', whiteSpace: 'pre-wrap', maxHeight: '120px', overflowY: 'auto', margin: 0, border: '1px solid #4b5563' }}>{originalText}</p>
                        </div>
                        <div style={{ position: 'relative' }}>
                            <label style={{ fontSize: '12px', fontWeight: '600', color: '#9ca3af' }}>译文</label>
                             {isLoading && (
                                <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(31, 41, 55, 0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', marginTop: '24px' }}>
                                    <p style={{ animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite', fontSize: '14px', color: '#e5e7eb' }}>翻译中...</p>
                                </div>
                            )}
                            <p style={{ fontSize: '14px', marginTop: '4px', padding: '10px', backgroundColor: '#1e3a8a', color: '#eff6ff', borderRadius: '6px', whiteSpace: 'pre-wrap', maxHeight: '120px', overflowY: 'auto', margin: 0, filter: isLoading ? 'blur(1px)' : 'none' }}>{translatedText || '...'}</p>
                        </div>
                         {error && <p style={{ color: '#fca5a5', fontSize: '12px', padding: '8px', backgroundColor: 'rgba(153, 27, 27, 0.5)', borderRadius: '6px', margin: 0 }}><strong>翻译出错:</strong> {error}</p>}
                    </div>
                    
                    {/* Settings Panel */}
                    {isSettingsOpen && (
                         <div style={{ padding: '16px', borderTop: '1px solid #4b5563', backgroundColor: 'rgba(17, 24, 39, 0.8)', overflowY: 'auto', maxHeight: '45vh' }}>
                            <h4 style={{fontSize: '14px', fontWeight: 'bold', marginBottom: '12px'}}>高级设置</h4>
                            <div>
                                <label style={{ fontSize: '12px', fontWeight: '600', color: '#9ca3af', display: 'block', marginBottom: '4px' }}>翻译提示词模板</label>
                                 <p style={{fontSize: '11px', color: '#6b7280', margin: '0 0 8px 0'}}>{'使用 `{{text}}` 和 `{{targetLanguage}}` 作为占位符。'}</p>
                                <textarea
                                    value={customPrompt}
                                    onChange={(e) => setCustomPrompt(e.target.value)}
                                    rows={6}
                                    style={{width: '100%', padding: '8px', border: '1px solid #4b5563', borderRadius: '6px', backgroundColor: '#374151', color: '#d1d5db', fontSize: '12px', boxSizing: 'border-box' }}
                                />
                                <button onClick={handleSavePrompt} style={{width: '100%', padding: '8px 12px', marginTop: '8px', border: 'none', borderRadius: '6px', backgroundColor: '#1d4ed8', color: 'white', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold'}}>保存提示词</button>
                            </div>
                             <div style={{marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #4b5563'}}>
                                <label style={{ fontSize: '12px', fontWeight: '600', color: '#9ca3af', display: 'block', marginBottom: '4px' }}>测试提示词</label>
                                <textarea
                                    value={testInput}
                                    onChange={(e) => setTestInput(e.target.value)}
                                    rows={2}
                                    style={{width: '100%', padding: '8px', border: '1px solid #4b5563', borderRadius: '6px', backgroundColor: '#374151', color: '#d1d5db', fontSize: '12px', boxSizing: 'border-box' }}
                                />
                                <button onClick={handleTestPrompt} disabled={isTesting} style={{width: '100%', padding: '8px 12px', marginTop: '8px', border: 'none', borderRadius: '6px', backgroundColor: '#16a34a', color: 'white', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', opacity: isTesting ? 0.5 : 1}}>
                                    {isTesting ? '测试中...' : '运行测试 (翻译到中文)'}
                                </button>
                                {testOutput && <p style={{ fontSize: '12px', marginTop: '8px', padding: '8px', backgroundColor: '#111827', borderRadius: '6px', whiteSpace: 'pre-wrap' }}><strong>测试结果:</strong><br/>{testOutput}</p>}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </TranslationContext.Provider>
    );
}; 