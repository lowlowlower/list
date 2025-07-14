'use client';

import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image'; // Use Next.js Image component for optimization

// --- Environment Variables --- 
// Read from process.env (ensure .env.local is set up)
const supabaseUrl = 'https://urfibhtfqffpabnpsjds.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVyZmliaHRmcWdmZnBhbnBzamRzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzU3ODU2NDUsImV4cCI6MjA1MTM2MTY0NX0.Q1WPGBj23uSL3RKhYxGhs7Si1_HfrvC9P-JxkXl6eVE';
const geminiApiKey ="AIzaSyApuy_ax9jhGXpUdlgI6w_0H5aZ7XiY9vU"; // WARNING: Insecure for production client-side use

// Check if keys are loaded (basic check)
if (!supabaseUrl || !supabaseAnonKey) {
    console.error("Supabase environment variables (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY) are not set!");
    // Optionally throw an error or show a message to the user
}
if (!geminiApiKey) {
     console.warn("Gemini API key (NEXT_PUBLIC_GEMINI_API_KEY) is not set. AI features will not work.");
     // AI features will fail gracefully in the component
}

// Construct dependent URLs (only if keys exist)
const databaseUrl = supabaseUrl ? `${supabaseUrl}/rest/v1/search_results_duplicate_本人` : null;
const geminiApiUrl = geminiApiKey ? `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}` : null;

// Define Product type (should match the one in page.tsx or be imported)
type Product = {
    id: string | number;
    created_at: string;
    keyword: string | null;
    result_image_url: string | null;
    result_text_content: string | null;
    '修改后文案'?: string | null;
    价格?: string | number | null;
    sort_order?: number | null;
    type?: string | null;
};

// Define Props type for the component
interface ProductCardProps {
    product: Product;
    onDelete: (id: string | number) => Promise<void>; // Callback for deletion
    // Props for deployment
    allAccountNames: string[]; // List of account names for the dropdown
    onDeploy: (productId: string | number, accountName: string) => Promise<void>; // Callback for deploy action
    globalPrompt: string; // NEW: Accept the global prompt from the parent
    // Add other callbacks as needed
}

// Utility function (can be moved to a separate utils file)
function formatTimeAgo(timestamp?: string): string {
    if (!timestamp) return '未知';
    try {
        const pastDate = new Date(timestamp);
        const now = new Date();
        const seconds = Math.floor((now.getTime() - pastDate.getTime()) / 1000);

        let interval = Math.floor(seconds / 31536000);
        if (interval >= 1) return interval + " 年前";
        interval = Math.floor(seconds / 2592000);
        if (interval >= 1) return interval + " 个月前";
        interval = Math.floor(seconds / 86400);
        if (interval >= 1) return interval + " 天前";
        interval = Math.floor(seconds / 3600);
        if (interval >= 1) return interval + " 小时前";
        interval = Math.floor(seconds / 60);
        if (interval >= 1) return interval + " 分钟前";
        return Math.floor(seconds) + " 秒前";
    } catch (e) {
        console.error("格式化时间戳时出错:", timestamp, e);
        return '无效的日期';
    }
}

const ProductCard: React.FC<ProductCardProps> = ({
    product,
    onDelete,
    allAccountNames,
    onDeploy,
    globalPrompt // Destructure the new prop
}) => {
    // --- State for Card --- 
    const [modifiedDescription, setModifiedDescription] = useState(product['修改后文案'] || product.result_text_content || '');
    const [newImageUrl, setNewImageUrl] = useState('');
    const [isOriginalCollapsed, setIsOriginalCollapsed] = useState(true);
    const [isModifiedCollapsed, setIsModifiedCollapsed] = useState(true);
    const [charCount, setCharCount] = useState(modifiedDescription.length);
    const [isLoadingAI, setIsLoadingAI] = useState(false);
    const [isLoadingConfirm, setIsLoadingConfirm] = useState(false);
    const [isLoadingUpdateImage, setIsLoadingUpdateImage] = useState(false);
    const [cardError, setCardError] = useState<string | null>(null);
    const [imageUrl, setImageUrl] = useState(product.result_image_url);
    // NEW: State for deployment dropdown and loading
    const [isDeployDropdownOpen, setIsDeployDropdownOpen] = useState(false);
    const [isDeploying, setIsDeploying] = useState(false);
    const [deployError, setDeployError] = useState<string | null>(null);
    const deployDropdownRef = useRef<HTMLDivElement>(null); // Ref for click outside

    // Refs for textareas to manage height
    const originalDescRef = useRef<HTMLTextAreaElement>(null);
    const modifiedDescRef = useRef<HTMLTextAreaElement>(null);
    const newImageUrlRef = useRef<HTMLTextAreaElement>(null);

    // --- Effects --- 
    // Update char count when modifiedDescription changes
    useEffect(() => {
        setCharCount(modifiedDescription.length);
    }, [modifiedDescription]);

    // Auto-resize textareas (basic implementation)
    const adjustTextareaHeight = (textarea: HTMLTextAreaElement | null) => {
        if (textarea) {
            // Only adjust if not collapsed
            const isCollapsed = textarea.classList.contains('line-clamp-2') || textarea.classList.contains('h-[3.6em]');
            if (!isCollapsed) {
                 textarea.style.height = 'auto';
                 textarea.style.height = (textarea.scrollHeight + 2) + 'px';
            } else {
                 // If collapsed, ensure inline height is removed so CSS takes over
                 textarea.style.height = '';
            }
        }
    };

    // Adjust height on relevant state changes
    useEffect(() => {
        adjustTextareaHeight(originalDescRef.current);
    }, [isOriginalCollapsed]); // Trigger only on collapse change

    useEffect(() => {
        adjustTextareaHeight(modifiedDescRef.current);
    }, [isModifiedCollapsed]); // Trigger only on collapse change

    // Adjust height on input for dynamic textareas
    useEffect(() => {
        adjustTextareaHeight(newImageUrlRef.current);
    }, [newImageUrl]);

    // Adjust initially and when description text itself changes
    useEffect(() => {
         if (originalDescRef.current) adjustTextareaHeight(originalDescRef.current);
    }, [product.result_text_content, isOriginalCollapsed]);

    useEffect(() => {
        if (modifiedDescRef.current) adjustTextareaHeight(modifiedDescRef.current);
    }, [modifiedDescription, isModifiedCollapsed]);

    // NEW: Effect to handle clicks outside the deploy dropdown
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (deployDropdownRef.current && !deployDropdownRef.current.contains(event.target as Node)) {
                setIsDeployDropdownOpen(false);
            }
        }
        // Bind the event listener
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            // Unbind the event listener on clean up
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [deployDropdownRef]);

    // --- Event Handlers --- 
    const handleDescriptionChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
        setModifiedDescription(event.target.value);
    };

    const handleNewImageUrlChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
        setNewImageUrl(event.target.value);
    };

    const toggleOriginalDescription = () => {
        setIsOriginalCollapsed(!isOriginalCollapsed);
    };

    const toggleModifiedDescription = () => {
        setIsModifiedCollapsed(!isModifiedCollapsed);
    };

    const handleImageError = () => {
        console.error(`无法加载图片: ${product.result_image_url}`);
        setImageUrl('/placeholder-image.png'); // TODO: Add a placeholder image to /public
    };

    const handleDeleteClick = async () => {
         if (confirm(`确定要永久删除商品编号 ${product.id} 吗？`)) {
             try {
                 await onDelete(product.id); // Call the parent delete function
                 // Optionally show a success message here if not handled by parent
             } catch (error) {
                 console.error("Delete failed in ProductCard:", error);
                 setCardError(`删除失败: ${(error as Error).message}`);
             }
         }
    };

    // NEW: Handler for deploy button click
    const handleDeployClick = () => {
        setDeployError(null); // Clear previous errors
        setIsDeployDropdownOpen(!isDeployDropdownOpen);
    };

    // NEW: Handler for selecting an account from dropdown and deploying
    const handleDeployAccountSelect = async (accountName: string) => {
        setIsDeploying(true);
        setDeployError(null);
        setIsDeployDropdownOpen(false); // Close dropdown immediately

        try {
            await onDeploy(product.id, accountName);
            // Optional: Show success feedback if parent doesn't handle it sufficiently
            // alert(`Product ${product.id} successfully scheduled for account ${accountName}`);
        } catch (error) {
            console.error(`Deploy failed in ProductCard for account ${accountName}:`, error);
            setDeployError(`投放失败: ${(error as Error).message}`);
            // Optionally re-open dropdown or provide other feedback
        } finally {
            setIsDeploying(false);
        }
    };

    // --- Placeholder Functions for Actions --- 
    const modifyTextWithAI = async () => {
        if (!geminiApiUrl) {
             setCardError('Gemini API Key 未配置。');
             return;
         }
        // Use the description currently shown in the textarea
        const currentDescription = modifiedDescription.trim();
        // Use the global prompt passed from the parent
        const promptValue = globalPrompt.trim(); 

        if (!promptValue) {
            setCardError('全局 AI 提示词为空，请在页面上方设置并保存。');
            return;
        }

        setIsLoadingAI(true);
        setCardError(null);

        // Construct the text payload for the AI
        let inputText = promptValue; // Start with the global prompt
        inputText += "\n\n商品信息：";
        if (product.keyword) {
            inputText += `\n关键词: ${product.keyword}`;
        }
        if (currentDescription) {
            inputText += `\n现有文案参考: ${currentDescription}`;
        } else if (product.result_text_content) {
            inputText += `\n原始文案参考: ${product.result_text_content}`;
        }
        if (product.价格) {
            inputText += `\n价格: ${product.价格}`;
        }
        // Add any other relevant product details here

        const requestBody = {
            "contents": [{
                "parts": [{"text": inputText}]
            }],
            "generationConfig": {
                // Adjust generation parameters if needed
                 "temperature": 0.8, // Example: Increase creativity slightly
                 "maxOutputTokens": 300 // Example: Allow slightly longer output than default
             }
        };

        console.log("Sending to AI:", JSON.stringify(requestBody, null, 2)); // Log the request

        try {
            const response = await fetch(geminiApiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                 const errorData = await response.json().catch(() => ({})); // Try to parse error, default to empty obj
                 console.error("AI API 错误响应:", errorData);
                throw new Error(`AI API 错误! 状态码: ${response.status}. ${errorData?.error?.message || response.statusText}`);
            }

            const data = await response.json();
            console.log("AI API 响应:", data);

            let aiModifiedDescription = '';
            if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
               aiModifiedDescription = data.candidates[0].content.parts[0].text.trim();
            } else if (data.candidates?.[0]?.text) { // Fallback for older/different structure
               aiModifiedDescription = data.candidates[0].text.trim();
            } else {
               console.error("AI API 响应格式无法解析:", data);
               throw new Error("AI API 响应格式错误，无法提取生成的文本。");
            }

            if (aiModifiedDescription) {
                setModifiedDescription(aiModifiedDescription);
                 // Ensure the textarea is expanded after AI modification
                 setIsModifiedCollapsed(false);
                 // Manually trigger height adjustment after state update might be needed
                 setTimeout(() => adjustTextareaHeight(modifiedDescRef.current), 0);
                 alert("文案已使用 AI 修改完成！");
            } else {
                setCardError("AI 返回了空文案。");
            }

        } catch (error: unknown) {
            console.error("AI 修改失败:", error);
            setCardError(`AI 修改失败: ${(error as Error).message}`);
        } finally {
            setIsLoadingAI(false);
        }
    };

    const confirmChanges = async () => {
         if (!databaseUrl || !supabaseAnonKey) {
             setCardError('Supabase 配置不完整。');
             return;
         }
        setIsLoadingConfirm(true);
        setCardError(null);

        try {
            const response = await fetch(`${databaseUrl}?id=eq.${product.id}`, {
                method: 'PATCH',
                headers: {
                    'apikey': supabaseAnonKey,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify({ "修改后文案": modifiedDescription })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.error("Supabase 更新错误:", errorData);
                throw new Error(`保存失败! 状态码: ${response.status}. ${errorData?.message || response.statusText}`);
            }
            alert("商品文案已成功保存");
             // Optionally update the original product prop if parent needs it
             // This is tricky, usually parent refetches or updates its state based on success

        } catch (error: unknown) {
            console.error("更新失败:", error); 
            setCardError(`更新失败: ${(error as Error).message}`);
            alert(`更新失败: ${(error as Error).message}`); // Also show alert on failure
        } finally {
            setIsLoadingConfirm(false);
        }
    };

    const updateProductImage = async () => {
         if (!databaseUrl || !supabaseAnonKey) {
             setCardError('Supabase 配置不完整。');
             return;
         }
        const trimmedUrl = newImageUrl.trim();
        if (!trimmedUrl || !isValidUrl(trimmedUrl)) {
            alert("请输入有效的图片 URL。");
            return;
        }
        setIsLoadingUpdateImage(true);
        setCardError(null);

        try {
             const response = await fetch(`${databaseUrl}?id=eq.${product.id}`, {
                method: 'PATCH',
                headers: {
                    'apikey': supabaseAnonKey,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify({ 'result_image_url': trimmedUrl })
            });

            if (!response.ok) {
                let errorBody = null;
                try { errorBody = await response.json(); } catch { /* Ignore */ } // Removed unused 'e'
                console.error("Supabase image update error details:", errorBody);
                throw new Error(`HTTP error! status: ${response.status}, message: ${errorBody?.message || response.statusText}`);
            }

            // Update the image URL in the local state *only on success*
            setImageUrl(trimmedUrl);
            setNewImageUrl(''); // Clear the input field
            adjustTextareaHeight(newImageUrlRef.current); // Reset height

        } catch (error) { // Use unknown or Error type
            console.error("更新图片 URL 失败:", error);
            setCardError(`更新图片失败: ${(error as Error).message}`); // Type assertion
        } finally {
            setIsLoadingUpdateImage(false);
        }
    };

     const findSimilarImages = () => {
        // Opens Yandex Images search in a new tab
        if (!imageUrl) {
            setCardError("没有图片可供搜索。");
            return;
        }
        // Use encodeURIComponent to handle special characters in the URL
        const searchUrl = `https://yandex.com/images/search?source=collections&rpt=imageview&url=${encodeURIComponent(imageUrl)}`;
        window.open(searchUrl, '_blank');
    };

    // NEW: Handler for Bing Image Search
    const findSimilarImagesBing = () => {
        if (!imageUrl) {
            setCardError("没有图片可供搜索。");
            return;
        }
        // Construct Bing Images search URL (URL Reverse Image Search)
        const searchUrl = `https://www.bing.com/images/search?view=detailv2&iss=sbi&form=SBIVSP&sbisrc=UrlSearch&q=imgurl:${encodeURIComponent(imageUrl)}`;
        window.open(searchUrl, '_blank');
    };

    const searchOnXianyu = () => {
        const descriptionForSearch = modifiedDescription || product.result_text_content || '';
        if (!descriptionForSearch) {
            alert("商品文案为空，无法搜索。");
            return;
        }
        const searchQuery = descriptionForSearch.substring(0, 40).trim();
        if (!searchQuery) {
            alert("无法从文案中提取有效搜索词。");
            return;
        }
        const xianyuBaseUrl = 'https://www.goofish.com/search?q=';
        const encodedQuery = encodeURIComponent(searchQuery);
        const searchUrl = `${xianyuBaseUrl}${encodedQuery}`;
        window.open(searchUrl, '_blank');
    };

    // Helper for URL validation (can be moved to utils)
    function isValidUrl(string: string): boolean {
        try {
            new URL(string);
            return true;
        } catch { // Removed unused '_'
            return false;
        }
    }


    // --- Render --- 
    return (
        <article
            className="product-card border border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden shadow-md bg-white dark:bg-gray-800 flex flex-col relative group text-gray-900 dark:text-gray-100"
            data-product-id={product.id}
            draggable="true" // Keep draggable if using drag-and-drop for sorting
            // onDragStart={dragStart} // Link drag handlers if needed
            // onDragEnd={dragEnd}     // Link drag handlers if needed
        >
             {/* Delete Button (Top Right) */}
             <button
                 onClick={handleDeleteClick}
                 className="absolute top-2 right-2 z-10 p-1 bg-red-500 text-white rounded-full hover:bg-red-700 transition-colors opacity-50 group-hover:opacity-100 focus:opacity-100"
                 title={`删除商品 ${product.id}`}
             >
                 {/* ... SVG icon ... */}
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                     <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                 </svg>
             </button>

             <div className="p-4 flex-grow flex flex-col">
                {/* ID and Time */}
                <div className="product-id-container flex items-center mb-2 gap-1">
                    <span className="product-id-label font-bold text-sm text-gray-700 dark:text-gray-300">编号:</span>
                    <span className="product-id-display font-mono text-xs bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-2 py-1 rounded">{product.id}</span>
                    <span className="product-id-label font-bold text-sm ml-3 text-gray-700 dark:text-gray-300">价格:</span>
                    <span className="product-id-display font-mono text-xs bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-2 py-1 rounded">{product.价格 || 'N/A'}</span>
                </div>

                {/* --- Added Category Display --- */}
                <div className="product-category-container flex items-center mb-2.5 text-sm">
                    <span className="font-bold mr-1 text-gray-700 dark:text-gray-300">类型:</span>
                    <span className="font-mono text-xs bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-2 py-1 rounded">
                        {product.type || '未分类'}
                    </span>
                </div>
                {/* ----------------------------- */}

                <div className="product-keyword-container flex items-center mb-2.5 gap-1">
                    <span className="font-bold text-sm mr-1 text-gray-700 dark:text-gray-300">关键词:</span>
                    <span className="font-mono text-xs bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-2 py-1 rounded mr-1">{product.keyword || 'N/A'}</span>
                    <button
                        onClick={searchOnXianyu}
                        className="bg-orange-500 hover:bg-orange-600 text-white dark:text-black text-xs px-1.5 py-0.5 rounded-sm cursor-pointer ml-1"
                        title="使用当前文案在闲鱼搜索"
                    >
                        搜闲鱼
                    </button>
                </div>

                {/* Image */} 
                <div className="mb-2.5 flex justify-center" style={{ minHeight: '150px' }}> {/* Ensure space for image/placeholder */} 
                     {/* Check if imageUrl exists AND is a valid URL format */} 
                     {imageUrl && isValidUrl(imageUrl) ? (
                        <Image
                            src={imageUrl}
                            alt={product.keyword || `Product ${product.id}`}
                            width={250}
                            height={150}
                            className="max-w-full h-auto rounded object-contain select-none"
                            draggable="false" // Standard way to prevent dragging
                            onError={handleImageError}
                            priority={false}
                        />
                    ) : (
                        <div className="w-[250px] h-[150px] flex items-center justify-center bg-gray-200 dark:bg-gray-700 rounded text-gray-500 dark:text-gray-400 text-sm">
                            {!product.result_image_url ? '无图片' : (imageUrl === '/placeholder-image.png' ? '图片加载失败' : '无效图片链接')}
                        </div>
                    )}
                </div>

                {/* Search Time */} 
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 mb-2.5 text-right">
                     搜索时间: {formatTimeAgo(product.created_at)}
                 </div>

                {/* Display Keyword */}
                {product.keyword && (
                    <p className="text-sm text-gray-500 mb-2">
                        关键词: {product.keyword}
                    </p>
                )}

                {/* NEW: Display "修改后文案" if available, with reminder next to label */}
                <div className="mb-2 text-sm">
                    <span className="font-semibold text-gray-700 dark:text-gray-300 mr-1">修改后文案:</span>
                    {!product['修改后文案'] ? (
                        <span className="bg-blue-500 text-white text-xs px-1.5 py-0.5 rounded-sm ml-1 font-sans">
                            请保存文案
                        </span>
                    ) : (
                        <span className="text-gray-600 dark:text-gray-400 ml-1">{product['修改后文案']}</span>
                    )}
                </div>

                {/* Original Description */} 
                <div className="mb-2.5">
                    <label className="font-bold text-sm block mb-1 flex justify-between items-center text-gray-700 dark:text-gray-300">
                        <span>原始文案:</span>
                        <button
                            onClick={toggleOriginalDescription}
                            className="bg-gray-500 hover:bg-gray-600 text-white dark:bg-gray-600 dark:hover:bg-gray-700 text-xs px-2 py-0.5 rounded ml-2 align-middle"
                        >
                            {isOriginalCollapsed ? '展开' : '收起'}
                        </button>
                    </label>
                    <textarea
                        ref={originalDescRef}
                        value={product.result_text_content || ''}
                        readOnly
                        className={`w-full p-2 border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 rounded text-sm resize-none overflow-hidden font-sans text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 ${isOriginalCollapsed ? 'line-clamp-2' : ''}`}
                        style={{ minHeight: '3em' }}
                    />
                </div>

                {/* Modified Description */} 
                <div className="mb-2.5">
                    <label className="font-bold text-sm block mb-1 flex justify-between items-center text-gray-700 dark:text-gray-300">
                        <span>修改后文案:</span>
                        <div>
                            <span className="text-xs text-gray-500 dark:text-gray-400 mr-2 font-normal">{charCount} 字</span>
                            <button
                                onClick={toggleModifiedDescription}
                                className="bg-gray-500 hover:bg-gray-600 text-white dark:bg-gray-600 dark:hover:bg-gray-700 text-xs px-2 py-0.5 rounded align-middle"
                            >
                                {isModifiedCollapsed ? '展开' : '收起'}
                            </button>
                        </div>
                    </label>
                    <textarea
                        ref={modifiedDescRef}
                        value={modifiedDescription}
                        onChange={handleDescriptionChange}
                        className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded text-sm resize-none overflow-hidden font-sans bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 min-h-[3em] ${isModifiedCollapsed ? 'line-clamp-2' : ''}`}
                        style={{ minHeight: '3em' }}
                    />
                </div>

                 {/* Update Image URL */}
                <div className="mb-2.5">
                    <label className="font-bold text-sm block mb-1 text-gray-700 dark:text-gray-300">新的图片 URL:</label>
                    <textarea
                        ref={newImageUrlRef}
                        value={newImageUrl}
                        onChange={handleNewImageUrlChange}
                        className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded text-sm resize-none overflow-hidden font-sans bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 min-h-[3em]" // Using text-sm
                        placeholder="在此粘贴新的图片 URL"
                        rows={1} // Start with 1 row, auto-resize will handle expansion
                        style={{ minHeight: '3em' }} // Keep min-height
                    />
                </div>

                 {/* Card-level Error Message */}
                 {cardError && <p className="text-red-600 dark:text-red-400 text-sm mt-2">{cardError}</p>}

             </div> {/* End of main content padding */}

             {/* --- Action Buttons Row --- */}
             <div className="card-actions bg-gray-100 dark:bg-gray-700/50 border-t border-gray-200 dark:border-gray-700 p-3 flex flex-wrap items-center gap-2 justify-start">
                 {/* Save Changes Button (Renamed) */}
                 <button
                     onClick={confirmChanges}
                     disabled={isLoadingConfirm || isLoadingAI}
                     className="bg-blue-500 hover:bg-blue-600 text-white dark:bg-blue-600 dark:hover:bg-blue-700 text-xs py-1 px-2 rounded disabled:opacity-50"
                 >
                     {isLoadingConfirm ? '保存中...' : '保存文案'}
                 </button>

                 {/* Modify with AI Button */}
                 <button
                     onClick={modifyTextWithAI}
                     disabled={isLoadingAI || isLoadingConfirm}
                     className="bg-purple-500 hover:bg-purple-600 text-white dark:bg-purple-600 dark:hover:bg-purple-700 text-xs py-1 px-2 rounded disabled:opacity-50"
                 >
                     {isLoadingAI ? '生成中...' : 'AI修改文案'}
                 </button>

                {/* NEW: Deploy Button & Dropdown */}
                <div className="relative inline-block text-left" ref={deployDropdownRef}>
                    <button
                        onClick={handleDeployClick}
                        disabled={isDeploying}
                        className={`bg-green-500 hover:bg-green-600 text-white dark:bg-green-600 dark:hover:bg-green-700 text-xs py-1 px-2 rounded disabled:opacity-50 flex items-center gap-1 ${
                            isDeploying ? 'cursor-wait' : ''
                        }`}
                    >
                         {isDeploying ? (
                             <>
                                 <svg className="animate-spin -ml-1 mr-1 h-3 w-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                     <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                     <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                 </svg>
                                 投放中...
                             </>
                         ) : (
                             '投放'
                         )}
                         {!isDeploying && (
                            <svg className={`w-3 h-3 transition-transform ${isDeployDropdownOpen ? 'rotate-180' : ''}`} aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 10 6">
                                <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m1 1 4 4 4-4"/>
                            </svg>
                         )}
                    </button>

                    {/* Dropdown Menu */}
                    {isDeployDropdownOpen && (
                        <div className="origin-bottom-left absolute left-0 bottom-full mb-2 w-48 rounded-md shadow-lg bg-white dark:bg-gray-900 ring-1 ring-black dark:ring-gray-700 ring-opacity-5 focus:outline-none z-20 max-h-40 overflow-y-auto">
                            <div className="py-1" role="menu" aria-orientation="vertical" aria-labelledby="options-menu">
                                {allAccountNames.length > 0 ? (
                                    allAccountNames.map((accountName) => (
                                        <a // Use anchor for styling, acts as button
                                            key={accountName}
                                            href="#" // Prevent page jump
                                            onClick={(e) => {
                                                e.preventDefault(); // Prevent default anchor behavior
                                                handleDeployAccountSelect(accountName);
                                            }}
                                            className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-100"
                                            role="menuitem"
                                        >
                                            {accountName}
                                        </a>
                                    ))
                                ) : (
                                    <span className="block px-4 py-2 text-sm text-gray-500 dark:text-gray-400 italic">无可投放账号</span>
                                )}
                            </div>
                        </div>
                    )}
                </div>
                {/* Deploy Error Message */}
                {deployError && <p className="text-red-500 dark:text-red-400 text-xs mt-1 w-full">{deployError}</p>}
                 {/* --- End of Deploy Button --- */}

                 {/* Update Image Button */}
                 <button
                     onClick={updateProductImage}
                     disabled={isLoadingUpdateImage || isLoadingAI || isLoadingConfirm || !newImageUrl.trim()}
                     className="bg-teal-500 hover:bg-teal-600 text-white dark:bg-teal-600 dark:hover:bg-teal-700 text-xs py-1 px-2 rounded disabled:opacity-50"
                 >
                     {isLoadingUpdateImage ? '更新中...' : '更新图片'}
                 </button>

                 {/* Find Similar Images Button (Yandex) */}
                 <button
                     onClick={findSimilarImages}
                     className="bg-yellow-400 hover:bg-yellow-500 text-gray-800 dark:bg-yellow-500 dark:hover:bg-yellow-600 dark:text-gray-900 text-xs py-1 px-2 rounded disabled:opacity-50"
                     disabled={!imageUrl || !isValidUrl(imageUrl)}
                 >
                     搜图 (Yandex)
                 </button>

                 {/* NEW: Find Similar Images Button (Bing) */}
                 <button
                     onClick={findSimilarImagesBing}
                     className="bg-sky-500 hover:bg-sky-600 text-white dark:bg-sky-600 dark:hover:bg-sky-700 text-xs py-1 px-2 rounded disabled:opacity-50"
                     disabled={!imageUrl || !isValidUrl(imageUrl)}
                 >
                     搜图 (Bing)
                 </button>

                 {/* Search on Xianyu Button */}
                 {/* ... existing Search on Xianyu Button ... */}

             </div> {/* End of actions row */}
        </article>
    );
};

export default ProductCard; 