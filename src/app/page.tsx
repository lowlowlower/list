'use client'; // Required for useState, useEffect, and event handlers

import React, { useState, useEffect, useRef, useCallback } from 'react';
import ProductCard from '@/components/ProductCard'; // Import the new component

// --- Environment Variables --- 
const supabaseUrl = 'https://urfibhtfqgffpanpsjds.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVyZmliaHRmcWdmZnBhbnBzamRzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzU3ODU2NDUsImV4cCI6MjA1MTM2MTY0NX0.Q1WPGBj23uSL3RKhYxGhs7Si1_HfrvC9P-JxkXl6eVE';

// Check if Supabase keys are loaded
if (!supabaseUrl || !supabaseAnonKey) {
    console.error("Supabase environment variables (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY) are not set!");
    // Ideally, handle this more gracefully, e.g., show an error message on the page
}

// Construct dependent URLs (only if keys exist)
const databaseUrl = supabaseUrl ? `${supabaseUrl}/rest/v1/search_results_duplicate_本人` : null;

// NEW: Type for keyword mapping table
type KeywordType = {
    keywords: string | null;
    type: string | null;
};

// Define Product type locally or import from a shared file
type Product = {
    id: string | number;
    created_at: string;
    keyword: string | null;
    result_image_url: string | null;
    result_text_content: string | null;
    '修改后文案'?: string | null; // Optional field for modified description
    价格?: string | number | null; // Optional field for price
    sort_order?: number | null; // Optional field for sort order
    type?: string | null; // Changed from '建议投放账号'
    // Add other potential fields from your Supabase table
};

// Type definition for the new schedule data
type ProductSchedule = {
    id: string; // UUID
    account_name: string;
    product_id: number; // Changed from string to number
    status: string; // e.g., 'pending', 'live'
    scheduled_at: string | null;
    created_at: string;
    updated_at: string;
};

// NEW: Type definition for accounts table data (only name needed for now)
type Account = {
    name: string;
    '待上架'?: string[] | null; // Add pending field
    '已上架'?: string[] | null; // Add live field
    // Add other fields if needed later
};

export default function ProductListPage() {
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [findProductId, setFindProductId] = useState<string>('');
    const [visibleProducts, setVisibleProducts] = useState<Product[]>([]);
    // State for category filter
    const [availableCategories, setAvailableCategories] = useState<string[]>([]);
    const [selectedCategory, setSelectedCategory] = useState<string>('all');
    // State for schedule display - RESTORE
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [productSchedules, setProductSchedules] = useState<ProductSchedule[]>([]);
    // NEW: State for all account names from the 'accounts' table
    const [allAccounts, setAllAccounts] = useState<Account[]>([]); 
    const [loadingAccounts, setLoadingAccounts] = useState<boolean>(true);
    const [errorAccounts, setErrorAccounts] = useState<string | null>(null);
    // State for Time Range Filter
    const [selectedTimeRange, setSelectedTimeRange] = useState<string>('all'); 
    // State for Adding New Account
    const [newAccountName, setNewAccountName] = useState<string>('');
    const [isAddingAccount, setIsAddingAccount] = useState<boolean>(false); 
    const [deletingAccount, setDeletingAccount] = useState<string | null>(null); 
    const [deletingSchedule, setDeletingSchedule] = useState<{ account: string; productId: string } | null>(null); 
    // State for Sorting
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [sortOption, setSortOption] = useState<string>('created_at_desc');
    // NEW: State for the AI prompt
    const [promptText, setPromptText] = useState<string>(''); // Default to empty, will be loaded
    const [loadingPrompt, setLoadingPrompt] = useState<boolean>(true);
    const [savingPrompt, setSavingPrompt] = useState<boolean>(false);
    const [promptError, setPromptError] = useState<string | null>(null);

    const productListContainerRef = useRef<HTMLDivElement>(null);

    // --- Fetching Logic --- (Wrap functions with useCallback)
    
    // NEW: Fetch keyword-to-type mapping and return a Map
    const fetchKeywordTypeMap = useCallback(async (): Promise<Map<string, string>> => {
        const keywordsUrl = supabaseUrl ? `${supabaseUrl}/rest/v1/important_keywords_本人` : null;
        if (!keywordsUrl || !supabaseAnonKey) {
            console.error("Supabase config is incomplete, cannot fetch keyword map.");
            return new Map();
        }

        try {
            // Fetch all keywords and their types
            const response = await fetch(`${keywordsUrl}?select=keywords,type`, {
                headers: { 'apikey': supabaseAnonKey, 'Accept': 'application/json' }
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`Failed to fetch keyword map: ${response.status} ${errorData?.message || ''}`);
            }

            const keywordEntries: KeywordType[] = await response.json();
            const keywordMap = new Map<string, string>();

            for (const entry of keywordEntries) {
                // Assuming entry.keywords is a single keyword that directly maps to a type
                if (entry.keywords && entry.type) {
                    keywordMap.set(entry.keywords, entry.type);
                }
            }
            return keywordMap;

        } catch (err) {
            console.error("Failed to fetch or process keyword map:", err);
            // Append to existing errors, so user sees all failures
            setError(prev => `${prev ? prev + '\n' : ''}Failed to load keyword types: ${(err as Error).message}`);
            return new Map(); // Return empty map on failure
        }
    }, []); // Dependencies are constant and defined outside

    // REFACTORED: This function now only fetches and returns products. State is set elsewhere.
    const fetchProducts = useCallback(async (): Promise<Product[] | null> => {
        if (!databaseUrl || !supabaseAnonKey) {
             setError("Supabase 配置不完整，无法加载数据。");
             return null;
         }
        const fetchUrl = `${databaseUrl}?select=*&order=created_at.desc`;
        try {
            const response = await fetch(fetchUrl, {
                headers: {
                    'apikey': supabaseAnonKey,
                    'Accept': 'application/json'
                 }
            });
            if (!response.ok) {
                let errorBody = null;
                try { errorBody = await response.json(); } catch { /* Ignore */ } // Removed unused 'e'
                console.error("Supabase fetch error details:", errorBody);
                throw new Error(`HTTP error! status: ${response.status}, message: ${errorBody?.message || response.statusText}`);
            }
            const fetchedProducts: Product[] = await response.json();
            return fetchedProducts;

        } catch (err: unknown) {
            console.error("获取商品数据失败:", err);
            setError(prev => `${prev ? prev + '\n' : ''}加载商品数据失败: ${(err as Error).message}`);
            return null; // Return null on failure
        }
    }, []); // Empty dependency array as it relies on constants defined outside

    // --- NEW: Fetching Logic for Accounts ---
    const fetchAccounts = useCallback(async () => {
        const accountsDatabaseUrl = supabaseUrl ? `${supabaseUrl}/rest/v1/accounts_duplicate` : null;
        if (!accountsDatabaseUrl || !supabaseAnonKey) {
            setErrorAccounts("Supabase 配置不完整，无法加载账号列表。");
            setLoadingAccounts(false);
            return;
        }
        setLoadingAccounts(true);
        setErrorAccounts(null);
        try {
            // Select name, 待上架, and 已上架 fields
            const response = await fetch(`${accountsDatabaseUrl}?select=name,待上架,已上架&order=name.asc`, {
                headers: { 'apikey': supabaseAnonKey, 'Accept': 'application/json' }
            });
            if (!response.ok) {
                let errorBody = null; try { errorBody = await response.json(); } catch { /* Ignore */ }
                console.error("Supabase fetch accounts error details:", errorBody);
                throw new Error(`HTTP error! status: ${response.status}, message: ${errorBody?.message || response.statusText}`);
            }
            const fetchedAccounts: Account[] = await response.json();
            setAllAccounts(fetchedAccounts);
        } catch (err: unknown) {
            console.error("获取账号列表数据失败:", err);
            setErrorAccounts(`加载账号列表失败: ${(err as Error).message}`);
        } finally {
            setLoadingAccounts(false);
        }
    }, []);

    // --- NEW: Fetching Logic for Schedules --- (Wrap with useCallback) - RESTORE
    const fetchProductSchedules = useCallback(async () => {
        console.log("[fetchProductSchedules] Starting fetch...");
        const scheduleDatabaseUrl = supabaseUrl ? `${supabaseUrl}/rest/v1/product_schedules` : null;
        if (!scheduleDatabaseUrl || !supabaseAnonKey) {
            console.log("[fetchProductSchedules] Aborted: Missing config.");
            return;
        }
    
        try {
            const response = await fetch(`${scheduleDatabaseUrl}?select=*&order=account_name.asc`, {
                headers: { 'apikey': supabaseAnonKey, 'Accept': 'application/json' }
            });
    
            if (!response.ok) {
                let errorBody = null; try { errorBody = await response.json(); } catch { /* Ignore */ }
                console.error("Supabase fetch schedules error details:", errorBody);
                throw new Error(`HTTP error! status: ${response.status}, message: ${errorBody?.message || response.statusText}`);
            }
    
            const fetchedSchedules: ProductSchedule[] = await response.json();
            console.log("[fetchProductSchedules] Raw fetched data:", JSON.stringify(fetchedSchedules.slice(0, 5))); // Log first 5
            setProductSchedules(fetchedSchedules);
    
            // Grouping is no longer needed for display
            // const grouped = groupSchedules(fetchedSchedules); 
            // console.log("[fetchProductSchedules] Grouped data before setting state:", JSON.stringify(grouped));
            // setGroupedSchedules(grouped);
    
        } catch (err: unknown) {
            console.error("获取投放计划数据失败:", err);
        } finally {
            console.log("[fetchProductSchedules] Fetch finished.");
        }
    }, []);

    // --- Fetch Global Prompt from Supabase ---
    const fetchGlobalPrompt = useCallback(async () => {
        const settingsUrl = supabaseUrl ? `${supabaseUrl}/rest/v1/app_settings` : null;
        if (!settingsUrl || !supabaseAnonKey) {
            setPromptError("Supabase 配置不完整，无法加载提示词。");
            setLoadingPrompt(false);
            return;
        }
        setLoadingPrompt(true);
        setPromptError(null);
        try {
            const response = await fetch(`${settingsUrl}?key=eq.global_ai_prompt&select=value&limit=1`, {
                headers: { 'apikey': supabaseAnonKey, 'Accept': 'application/json' }
            });
            if (!response.ok) {
                let errorBody = null; try { errorBody = await response.json(); } catch { /* Ignore */ }
                throw new Error(`HTTP error! status: ${response.status}, message: ${errorBody?.message || response.statusText}`);
            }
            const data = await response.json();
            if (data && data.length > 0 && data[0].value) {
                setPromptText(data[0].value);
            } else {
                // Set a default prompt if none is found in the database
                setPromptText('请根据以下信息，为我生成一段吸引人的社交媒体商品推广文案：');
                console.log("未找到云端提示词，使用默认值。");
            }
        } catch (err: unknown) {
            console.error("加载全局提示词失败:", err);
            setPromptError(`加载提示词失败: ${(err as Error).message}`);
            // Fallback to default if loading fails
            setPromptText('请根据以下信息，为我生成一段吸引人的社交媒体商品推广文案：');
        } finally {
            setLoadingPrompt(false);
        }
    }, []); // Dependencies: supabaseUrl, supabaseAnonKey (implicit via closure)

    // REWRITTEN: Main effect to orchestrate all data fetching and processing
    useEffect(() => {
        const fetchAndProcessData = async () => {
            setLoading(true);
            setError(null);
            
            try {
                // Step 1: Fetch products and the keyword-type map in parallel
                const [productsResponse, keywordTypeMap] = await Promise.all([
                    fetchProducts(),
                    fetchKeywordTypeMap()
                ]);

                // Abort if fetching products failed
                if (!productsResponse) {
                    setLoading(false);
                    return;
                }
                
                // Step 2: Enrich products with the 'type' from the map
                const enrichedProducts = productsResponse.map(product => ({
                    ...product,
                    // Find type from map using product's keyword. Default to null if not found.
                    type: product.keyword ? keywordTypeMap.get(product.keyword) || null : null
                }));

                // Step 3: Update state with the final, processed data
                setProducts(enrichedProducts);
                setVisibleProducts(enrichedProducts);
    
                // Step 4: Extract categories from the *enriched* products for the filter dropdown
                const categories = [...new Set(
                    enrichedProducts
                        .map(p => p.type)
                        .filter((category): category is string => typeof category === 'string' && category.trim() !== '')
                )].sort();
                setAvailableCategories(categories);

            } catch (err) {
                console.error("An error occurred during data fetching and processing:", err);
                setError(prev => `${prev ? prev + '\n' : ''}An error occurred: ${(err as Error).message}`);
            } finally {
                setLoading(false);
            }
        };

        // Fetch primary data
        fetchAndProcessData();

        // Fetch auxiliary data (can run in parallel to the main logic)
        fetchGlobalPrompt();
        fetchAccounts();
        fetchProductSchedules();

    }, [fetchProducts, fetchKeywordTypeMap, fetchGlobalPrompt, fetchAccounts, fetchProductSchedules]); // Add new dependencies

    // --- Filtering and Sorting Logic ---
    useEffect(() => {
        console.log(`Applying filters/sort. Category: ${selectedCategory}, Time: ${selectedTimeRange}, Sort: ${sortOption}`);
        const now = new Date();
        let timeCutoff: Date | null = null;
        let filterMode: 'newer' | 'older' | 'all' = 'all';

        // --- Determine Time Filter Cutoff ---
        switch (selectedTimeRange) {
            case '1d': timeCutoff = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000); filterMode = 'newer'; break;
            case '2d': timeCutoff = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000); filterMode = 'newer'; break;
            case '3d': timeCutoff = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000); filterMode = 'newer'; break;
            case 'older': timeCutoff = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000); filterMode = 'older'; break;
            default: filterMode = 'all';
        }

        // --- Apply Filtering ---
        const filtered = products.filter(product => {
            // Category filter
            const categoryMatch = selectedCategory === 'all' || (product.type || '未分类') === selectedCategory;
            if (!categoryMatch) return false;

            // Time range filter
            if (filterMode !== 'all' && timeCutoff) {
                try {
                    const productDate = new Date(product.created_at);
                    let timeMatch = false;
                    if (filterMode === 'newer') {
                        timeMatch = productDate >= timeCutoff;
                    } else { // filterMode === 'older'
                        timeMatch = productDate < timeCutoff;
                    }
                    if (!timeMatch) return false;
                } catch {
                    console.warn(`Invalid date format for product ${product.id}: ${product.created_at}`);
                    return false;
                }
            }
            return true; // Pass all filters
        });

        // --- Apply Sorting --- 
        const sortedAndFiltered = [...filtered].sort((a, b) => {
            switch (sortOption) {
                case 'created_at_asc':
                    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
                case 'created_at_desc':
                    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
                case 'sort_order_asc': {
                    const sortA = a.sort_order ?? Infinity;
                    const sortB = b.sort_order ?? Infinity;
                    return sortA - sortB;
                }
                case 'price_asc': {
                    const priceA = typeof a.价格 === 'string' ? parseFloat(a.价格) : (a.价格 ?? Infinity);
                    const priceB = typeof b.价格 === 'string' ? parseFloat(b.价格) : (b.价格 ?? Infinity);
                    return (isNaN(priceA) ? Infinity : priceA) - (isNaN(priceB) ? Infinity : priceB);
                }
                case 'price_desc': {
                    const priceA = typeof a.价格 === 'string' ? parseFloat(a.价格) : (a.价格 ?? -Infinity);
                    const priceB = typeof b.价格 === 'string' ? parseFloat(b.价格) : (b.价格 ?? -Infinity);
                    return (isNaN(priceB) ? -Infinity : priceB) - (isNaN(priceA) ? -Infinity : priceA);
                }
                default:
                    return 0;
            }
        });

        // --- Update Visible Products State ---
        setVisibleProducts(sortedAndFiltered);
        console.log(`Filter/Sort applied. Showing ${sortedAndFiltered.length} products.`);

    }, [products, selectedCategory, selectedTimeRange, sortOption]); // Dependencies: Original data + filter/sort criteria

    // --- Save prompt to Local Storage --- // MODIFIED to save to Supabase
    const handleSavePrompt = async () => {
        // REMOVE Local Storage saving
        // localStorage.setItem('aiPrompt', promptText);
        // alert('提示词已保存！'); 

        const settingsUrl = supabaseUrl ? `${supabaseUrl}/rest/v1/app_settings` : null;
        if (!settingsUrl || !supabaseAnonKey) {
            alert("Supabase 配置不完整，无法保存提示词。");
            return;
        }

        setSavingPrompt(true);
        setPromptError(null);

        try {
            const response = await fetch(settingsUrl, {
                method: 'POST', // Using POST for upsert with Prefer header
                headers: {
                    'apikey': supabaseAnonKey,
                    'Content-Type': 'application/json',
                    'Prefer': 'resolution=merge-duplicates' // Key for upsert
                },
                body: JSON.stringify({ key: 'global_ai_prompt', value: promptText })
            });

            if (!response.ok) {
                let errorBody = null; try { errorBody = await response.json(); } catch { /* Ignore */ }
                console.error("保存提示词失败 (Supabase):", errorBody);
                throw new Error(`HTTP error! status: ${response.status}, message: ${errorBody?.message || response.statusText}`);
            }

            alert('提示词已成功保存到云端！');

        } catch (err: unknown) {
            console.error("保存全局提示词失败:", err);
            setPromptError(`保存提示词失败: ${(err as Error).message}`);
            alert(`保存提示词失败: ${(err as Error).message}`);
        } finally {
            setSavingPrompt(false);
        }
    };

    // --- Find Logic --- (Modified for flashing animation)
    function findProductById() {
        // Clear previous flash class if any (e.g., if user clicks find rapidly)
        const previouslyFlashed = productListContainerRef.current?.querySelector('.flash-border');
        previouslyFlashed?.classList.remove('flash-border');

        if (!findProductId) {
            alert("请输入要查找的商品编号。");
            return;
        }

        const targetCard = productListContainerRef.current?.querySelector<HTMLElement>(`.product-card[data-product-id="${findProductId}"]`);

        if (targetCard) {
            // Scroll to the card
            targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });

            // Add the flash animation class
            targetCard.classList.add('flash-border');

            // Remove the class after the animation duration (0.75s * 2 = 1.5s)
            // so it can be re-triggered on subsequent searches
            setTimeout(() => {
                targetCard.classList.remove('flash-border');
            }, 1500); // 1500 milliseconds = 1.5 second

            console.log(`已定位到商品 ID: ${findProductId} 并应用闪烁动画。`);
        } else {
            alert(`未找到商品编号为 "${findProductId}" 的商品。`);
            console.log(`未找到商品 ID: ${findProductId}`);
        }
    }

    // --- Delete Logic ---
     async function deleteProduct(productId: string | number) {
         if (!databaseUrl || !supabaseAnonKey) {
             // Cannot perform deletion without config
             alert("Supabase 配置不完整，无法删除。");
             throw new Error("Supabase configuration is missing.");
         }
        // Confirmation is handled within ProductCard now, or keep here if preferred

        // Loading/error state indication can be handled within ProductCard

        try {
            const response = await fetch(`${databaseUrl}?id=eq.${productId}`, {
                method: 'DELETE',
                headers: {
                    'apikey': supabaseAnonKey, // Use env var
                    'Prefer': 'return=minimal'
                },
            });
            // ... (rest of delete logic)
            if (!response.ok) {
                if (response.status === 404) {
                    console.warn(`Attempted to delete product ID ${productId} which was not found.`);
                    // Remove from state even if not found in DB (might be already deleted)
                    setProducts(prev => prev.filter(p => p.id !== productId));
                    setVisibleProducts(prev => prev.filter(p => p.id !== productId));
                    // alert(`商品 ${productId} 在数据库中未找到，已从界面移除。`); // Alert can be handled in card or here
                    return; // Or throw error to be caught below?
                }
                const errorData = await response.json();
                console.error("Supabase delete error:", errorData);
                throw new Error(`删除失败! Status: ${response.status}. ${errorData?.message || response.statusText}`);
            }

            // Remove from state on successful deletion
            setProducts(prev => prev.filter(p => p.id !== productId));
            setVisibleProducts(prev => prev.filter(p => p.id !== productId));
            // alert(`商品 ${productId} 已成功删除！`); // Alert can be handled in card or here

        } catch (err: unknown) { // Changed any to unknown
            console.error(`删除商品 ID ${productId} 失败:`, err);
            // alert(`删除商品 ${productId} 失败: ${err.message}`); // Alert handled in ProductCard now
             // Potentially re-throw or handle UI feedback here if needed
            // Re-throwing allows ProductCard to potentially catch it if needed
            throw err; // Re-throw so the calling component (ProductCard) knows about the failure
        }
    }

    // --- Delete Duplicates Logic ---
    async function deleteDuplicateProducts() {
         if (!databaseUrl || !supabaseAnonKey) {
             alert("Supabase 配置不完整，无法删除重复项。");
             return;
         }
        console.log("开始查找并删除重复商品...");
        if (products.length < 2) {
            alert("商品数量不足，无需检查重复。");
            return;
        }

        const descriptionMap = new Map<string, Product>();
        const idsToDeleteSet = new Set<string | number>(); // Use a Set for easier checking later
        const productsToKeep: Product[] = [];

        // First pass: Identify potential duplicates and items to keep
        products.forEach(product => {
            const originalDescription = (product.result_text_content || '').trim();

            if (!originalDescription) {
                productsToKeep.push(product); // Keep products with no original description
                return;
            }

            if (descriptionMap.has(originalDescription)) {
                // Found potential duplicate
                const existingProduct = descriptionMap.get(originalDescription)!;
                
                // Decide which one to keep based on '修改后文案'
                const currentHasModified = !!product['修改后文案'];
                const existingHasModified = !!existingProduct['修改后文案'];

                if (currentHasModified && !existingHasModified) {
                    // Current product has modified text, existing one doesn't. Keep current, mark existing for delete.
                    console.log(`标记删除 ID: ${existingProduct.id} (原始文案重复, 但 ${product.id} 有修改后文案)`);
                    idsToDeleteSet.add(existingProduct.id);
                    descriptionMap.set(originalDescription, product); // Replace the one in the map with the current one
                    // Remove existingProduct from productsToKeep if it was added earlier (shouldn't happen with this logic flow, but safer)
                    const indexToRemove = productsToKeep.findIndex(p => p.id === existingProduct.id);
                    if (indexToRemove > -1) productsToKeep.splice(indexToRemove, 1);
                    productsToKeep.push(product); // Add current product to keep list
                } else if (!currentHasModified && existingHasModified) {
                    // Existing product has modified text, current one doesn't. Keep existing, mark current for delete.
                    console.log(`标记删除 ID: ${product.id} (原始文案重复, 但 ${existingProduct.id} 有修改后文案)`);
                    idsToDeleteSet.add(product.id);
                    // productsToKeep already contains existingProduct, no need to add current one.
                } else {
                    // Both have modified text, or neither has. Default: Keep the first one encountered (existing), delete current.
                    console.log(`标记删除 ID: ${product.id} (原始文案重复, 修改后文案状态相同或都无，保留第一个)`);
                    idsToDeleteSet.add(product.id);
                }
            } else {
                // First occurrence of this original description, keep it
                descriptionMap.set(originalDescription, product);
                productsToKeep.push(product);
            }
        });

        // Convert Set to Array for filtering/confirmation message
        const idsToDelete = Array.from(idsToDeleteSet);

        if (idsToDelete.length === 0) {
            alert("未发现可删除的重复商品（已保留有修改后文案的商品）。");
            return;
        }

        // Confirmation message needs adjustment if logic changes significantly
        if (!confirm(`发现 ${idsToDelete.length} 个可删除的重复商品（基于原始文案，且优先保留有修改后文案的项）。确定要删除吗？`)) {
            return;
        }

        // --- Deletion Loop (Remains largely the same, but operates on the filtered idsToDelete) ---
        let deletedCount = 0;
        let failedCount = 0;
        const finalKeptProductIds = new Set(productsToKeep.map(p => p.id)); // Track IDs we definitely want to keep

        for (const productId of idsToDelete) {
            // Double check: Make sure we are not accidentally deleting something we decided to keep
            if (finalKeptProductIds.has(productId)) {
                console.warn(`尝试删除 ID ${productId}, 但它已被标记为保留，跳过删除。`);
                continue; // Skip deletion
            }
            
            try {
                const response = await fetch(`${databaseUrl}?id=eq.${productId}`, {
                    method: 'DELETE',
                    headers: {
                        'apikey': supabaseAnonKey,
                        'Prefer': 'return=minimal'
                    },
                });
                if (!response.ok && response.status !== 404) {
                    const errorData = await response.json();
                    throw new Error(`Status: ${response.status}. ${errorData?.message || response.statusText}`);
                }
                deletedCount++;
                console.log(`重复商品 ID ${productId} 已成功删除 (或未找到)。`);
            } catch (error: unknown) {
                console.error(`删除重复商品 ID ${productId} 时出错:`, error);
                failedCount++;
                // If deletion failed, ensure it's *not* added back to the keep list unless it was there originally
                // Since we filter state at the end based on original products - failed IDs, this is handled
            }
        }

        // Simpler & Safer: Refetch products after deletion to reflect the true state
        console.log("重复项删除完成，正在重新获取商品列表...");
        fetchProducts(); // Call fetchProducts to get the accurate list from the DB

        // Show summary message
        let message = `重复商品删除完成。
尝试删除: ${idsToDelete.length} 个。
成功删除/未找到: ${deletedCount} 个。`;
        if (failedCount > 0) message += `
删除失败: ${failedCount} 个 (详情请查看控制台)。`;
        alert(message);
        // State update is now handled by fetchProducts
    }

    // --- NEW: Handle Add Account --- (Placeholder & Explanation)
    async function handleAddAccount() {
        const trimmedName = newAccountName.trim();
        if (!trimmedName) {
            alert("请输入要添加的账号名称。");
            return;
        }

        // OPTIONAL: Check against allAccounts state first for quicker feedback
        if (allAccounts.some(acc => acc.name === trimmedName)) {
             alert(`账号 "${trimmedName}" 已经存在 (from state)。`);
             setNewAccountName('');
             return;
        }

        setIsAddingAccount(true);
        setErrorAccounts(null); 

        const accountsDatabaseUrl = supabaseUrl ? `${supabaseUrl}/rest/v1/accounts_duplicate` : null;
        if (!accountsDatabaseUrl || !supabaseAnonKey) {
            alert("Supabase 配置不完整，无法添加账号。");
            setIsAddingAccount(false);
            return;
        }

        try {
            const response = await fetch(accountsDatabaseUrl, {
                method: 'POST',
                headers: { 'apikey': supabaseAnonKey, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
                body: JSON.stringify({ name: trimmedName })
            });
            if (!response.ok) {
                let errorData = { message: response.statusText };
                try {
                    errorData = await response.json();
                } catch { /* Ignore if body isn't JSON */ }
                console.error("Supabase 添加账号错误:", errorData);
                throw new Error(`添加失败! 状态码: ${response.status}. ${errorData?.message || response.statusText}`);
            }

            console.log(`账号 "${trimmedName}" 已成功添加。`);
            alert(`账号 "${trimmedName}" 已成功添加！`);
            
            // Refetch the list of accounts to include the new one
            fetchAccounts(); 
            
        } catch (error: unknown) {
            console.error(`添加账号 "${trimmedName}" 时出错:`, error);
            alert(`添加账号 "${trimmedName}" 时出错: ${(error as Error).message}`);
            setErrorAccounts(`添加账号 "${trimmedName}" 时出错: ${(error as Error).message}`);
        } finally {
            setNewAccountName('');
            setIsAddingAccount(false);
        }
    }

    // --- NEW: Handle Delete Account ---
    async function handleDeleteAccount(accountNameToDelete: string) {
        if (!accountNameToDelete) return;

        if (!confirm(`确定要删除账号 "${accountNameToDelete}" 及其所有投放计划吗？此操作无法撤销。`)) {
            return;
        }

        const scheduleDatabaseUrl = supabaseUrl ? `${supabaseUrl}/rest/v1/product_schedules` : null;
        const accountsDatabaseUrl = supabaseUrl ? `${supabaseUrl}/rest/v1/accounts_duplicate` : null;
        if (!scheduleDatabaseUrl || !accountsDatabaseUrl || !supabaseAnonKey) {
            alert("Supabase 配置不完整，无法删除账号计划。");
            return;
        }

        setDeletingAccount(accountNameToDelete); // Set loading state for this account
        setErrorAccounts(null); // Clear previous errors

        try {
            // Step 1: Delete associated schedules
            const deleteSchedulesResponse = await fetch(`${scheduleDatabaseUrl}?account_name=eq.${encodeURIComponent(accountNameToDelete)}`, {
                method: 'DELETE',
                headers: { 'apikey': supabaseAnonKey, 'Prefer': 'return=minimal' }
            });

            if (!deleteSchedulesResponse.ok) {
                let errorData = { message: deleteSchedulesResponse.statusText };
                try { errorData = await deleteSchedulesResponse.json(); } catch { /* Ignore */ }
                console.error("Supabase 删除账号计划错误:", errorData);
                throw new Error(`删除投放计划失败: ${errorData?.message || deleteSchedulesResponse.statusText}`);
            }
            console.log(`账号 "${accountNameToDelete}" 的所有计划已删除。`);

            // Step 2: Delete the account itself from the accounts table
            let accountDeletionSuccess = false;
            if (!accountsDatabaseUrl) {
                console.warn("Accounts database URL is not configured, cannot delete account row.");
            } else {
                 const deleteAccountResponse = await fetch(`${accountsDatabaseUrl}?name=eq.${encodeURIComponent(accountNameToDelete)}`, {
                    method: 'DELETE',
                    headers: { 'apikey': supabaseAnonKey, 'Prefer': 'return=minimal' }
                });

                 if (!deleteAccountResponse.ok && deleteAccountResponse.status !== 404) { // Allow 404 (already deleted)
                    let errorData = { message: deleteAccountResponse.statusText };
                    try { errorData = await deleteAccountResponse.json(); } catch { /* Ignore */ }
                    console.error(`Supabase 删除账号 '${accountNameToDelete}' 失败:`, errorData);
                    // Keep accountDeletionSuccess as false
                    alert(`成功删除账号 "${accountNameToDelete}" 的投放计划，但删除账号本身失败。详情请查看控制台。`);
                 } else {
                    console.log(`账号 "${accountNameToDelete}" 已成功从 accounts 表删除 (或未找到)。`);
                    accountDeletionSuccess = true;
                 }
            }

            // Step 3: Update frontend state *directly* and *immediately*
            console.log(`[handleDeleteAccount] Updating state directly for ${accountNameToDelete}`);
            setAllAccounts(prev => {
                const newState = prev.filter(acc => acc.name !== accountNameToDelete);
                console.log('[handleDeleteAccount] New allAccounts state:', newState.map(a => a.name));
                return newState;
            });
            // DO NOT CALL fetchProductSchedules() HERE

            // Step 4: Show final success alert
            if (accountDeletionSuccess) {
                  alert(`账号 "${accountNameToDelete}" 及其所有计划已成功删除！`);
                  // Force a page reload to ensure UI consistency as a workaround
                  console.log("[handleDeleteAccount] Forcing page reload after successful delete.");
                  window.location.reload(); 
            }

        } catch (error: unknown) {
            console.error(`删除账号 "${accountNameToDelete}" 时出错:`, error);
            alert(`删除账号 "${accountNameToDelete}" 时出错: ${(error as Error).message}`);
            setErrorAccounts(`删除账号 "${accountNameToDelete}" 时出错: ${(error as Error).message}`);
        } finally {
            setDeletingAccount(null); // Clear loading state
        }
    }

    // --- NEW: Handle Delete Single Schedule ---
    async function handleDeleteSchedule(accountName: string, productIdString: string) {
        if (!accountName || !productIdString) return;

        // Convert productIdString to number, as it's stored as number in DB
        const productId = parseInt(productIdString, 10);
        if (isNaN(productId)) {
            console.error(`Invalid product ID for deletion: ${productIdString}`);
            alert(`无效的商品 ID: ${productIdString}`);
            return;
        }

        if (!confirm(`确定要从账号 "${accountName}" 中删除商品 ID "${productId}" 的投放计划吗？`)) {
            return;
        }

        const scheduleDatabaseUrl = supabaseUrl ? `${supabaseUrl}/rest/v1/product_schedules` : null;
        const accountsDatabaseUrl = supabaseUrl ? `${supabaseUrl}/rest/v1/accounts_duplicate` : null;
        if (!scheduleDatabaseUrl || !accountsDatabaseUrl || !supabaseAnonKey) {
            alert("Supabase 配置不完整，无法删除投放计划。");
            setDeletingSchedule(null);
            return;
        }

        setDeletingSchedule({ account: accountName, productId: productIdString });

        // FIX: Find the schedule ID directly from the database first
        let scheduleIdToDelete: string | null = null;

        try {
            // Step 1: Query for the schedule ID
            console.log(`Querying schedule ID for account: ${accountName}, product ID: ${productIdString}`);
            const queryUrl = `${scheduleDatabaseUrl}?account_name=eq.${encodeURIComponent(accountName)}&product_id=eq.${productId}&select=id&limit=1`;
            const findResponse = await fetch(queryUrl, {
                headers: { 'apikey': supabaseAnonKey, 'Accept': 'application/json' }
            });

            if (!findResponse.ok) {
                 let errorBody = null; try { errorBody = await findResponse.json(); } catch { /* Ignore */ }
                 throw new Error(`查找计划 ID 失败: ${errorBody?.message || findResponse.statusText}`);
            }

            const findData = await findResponse.json();
            if (findData && findData.length > 0) {
                scheduleIdToDelete = findData[0].id;
                console.log(`Found schedule ID: ${scheduleIdToDelete}`);
            } else {
                console.warn(`在数据库中未找到账号 ${accountName} 的商品 ${productIdString} 的投放计划。可能已被删除。将尝试清理账号列表。`);
                // Proceed to account cleanup even if schedule not found
            }

            // Step 2: Delete the schedule entry if found
            if (scheduleIdToDelete) {
                console.log(`Attempting to delete schedule ID: ${scheduleIdToDelete}`);
                const deleteResponse = await fetch(`${scheduleDatabaseUrl}?id=eq.${scheduleIdToDelete}`, {
                    method: 'DELETE',
                    headers: {
                        'apikey': supabaseAnonKey,
                        'Prefer': 'return=minimal'
                    }
                });

                if (!deleteResponse.ok && deleteResponse.status !== 404) { // Allow 404 Not Found
                    let errorBody = null;
                    try { errorBody = await deleteResponse.json(); } catch { /* Ignore */ } 
                    console.error("Supabase delete schedule error details:", errorBody);
                    // Should we stop here or still try to cleanup account?
                    // Let's throw for now, as deleting the primary record failed.
                    throw new Error(`删除投放计划 (ID: ${scheduleIdToDelete}) 失败: ${errorBody?.message || deleteResponse.statusText}`);
                }
                console.log(`Schedule ID ${scheduleIdToDelete} deleted successfully (or was not found).`);
            } else {
                 // If not found, scheduleIdToDelete remains null, we skip deletion but proceed to cleanup
            }

            // Step 3: Update the corresponding account lists (Cleanup)
            console.log(`Attempting to cleanup account lists for account: ${accountName}, product ID: ${productIdString}`);
            // Fetch the current account data
            const getAccountUrl = `${accountsDatabaseUrl}?name=eq.${encodeURIComponent(accountName)}&select=待上架,已上架`;
            const getAccountResponse = await fetch(getAccountUrl, {
                headers: { 'apikey': supabaseAnonKey, 'Accept': 'application/json' }
            });
            if (!getAccountResponse.ok) {
                console.warn(`获取账号 ${accountName} 信息失败，无法清理列表。`);
                // If we can't get the account, we can't clean it up. But the schedule might be deleted.
                // Throw an error or just log?
                throw new Error(`获取账号信息失败 (status: ${getAccountResponse.status})，无法清理列表。`);
            } else {
                const accountData = await getAccountResponse.json();
                if (accountData && accountData.length > 0) {
                    const currentPendingList: string[] = accountData[0]?.待上架 || [];
                    const currentLiveList: string[] = accountData[0]?.已上架 || [];

                    // Remove the productIdString from both lists
                    const updatedPendingList = currentPendingList.filter(id => id !== productIdString);
                    const updatedLiveList = currentLiveList.filter(id => id !== productIdString);

                    // Check if update is actually needed
                    if (updatedPendingList.length !== currentPendingList.length || updatedLiveList.length !== currentLiveList.length) {
                        console.log(`Account list update needed for ${accountName}. Updating...`);
                        // Update the account record
                        const updateAccountUrl = `${accountsDatabaseUrl}?name=eq.${encodeURIComponent(accountName)}`;
                        const updateAccountResponse = await fetch(updateAccountUrl, {
                            method: 'PATCH',
                            headers: {
                                'apikey': supabaseAnonKey,
                                'Content-Type': 'application/json',
                                'Prefer': 'return=minimal'
                            },
                            body: JSON.stringify({
                                '待上架': updatedPendingList,
                                '已上架': updatedLiveList,
                                'updated_at': new Date().toISOString()
                            })
                        });
                        if (!updateAccountResponse.ok) {
                            // Log warning but don't block the whole process if only cleanup fails
                            console.warn(`更新账号 ${accountName} 列表失败 after schedule deletion/cleanup.`);
                        } else {
                            console.log(`Account ${accountName} lists updated successfully after cleanup for product ${productIdString}.`);
                        }
                    } else {
                        console.log(`Product ID ${productIdString} not found in lists for account ${accountName}, no account update needed.`);
                    }
                } else {
                    console.warn(`Account ${accountName} not found in database during cleanup.`);
                }
            }

            // Step 4: Refetch data to update UI
            console.log("Refetching accounts and schedules after deletion attempt...");
            fetchProductSchedules();
            fetchAccounts();

            alert(`账号 ${accountName} 的商品 ${productIdString} 相关计划已处理。`);

        } catch (error) {
            console.error(`处理账号 ${accountName} 的商品 ${productIdString} 投放计划时出错:`, error);
            setErrorAccounts(`处理投放计划失败: ${(error as Error).message}`);
            alert(`处理投放计划失败: ${(error as Error).message}`);
        } finally {
            setDeletingSchedule(null); // Clear loading state
        }
    }

    // --- NEW: Handle Deploy Product to Account ---
    async function handleDeployProduct(productIdToDeploy: string | number, accountName: string) {
        const scheduleDatabaseUrl = supabaseUrl ? `${supabaseUrl}/rest/v1/product_schedules` : null;
        const accountsDatabaseUrl = supabaseUrl ? `${supabaseUrl}/rest/v1/accounts_duplicate` : null; // URL for accounts table

        if (!scheduleDatabaseUrl || !accountsDatabaseUrl || !supabaseAnonKey) {
            throw new Error("Supabase 配置不完整，无法投放。");
        }

        const productIdString = productIdToDeploy.toString(); // Ensure product ID is a string

        try {
            // --- Step 1: Create the schedule entry (existing logic) ---
            const createScheduleResponse = await fetch(scheduleDatabaseUrl, {
                method: 'POST',
                headers: {
                    'apikey': supabaseAnonKey,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify({
                    product_id: productIdToDeploy, // Keep original type if table expects number
                    account_name: accountName,
                    status: 'pending',
                    scheduled_at: null
                 })
            });

            if (!createScheduleResponse.ok) {
                let errorBody = null;
                try { errorBody = await createScheduleResponse.json(); } catch { /* Ignore */ }
                console.error("Supabase deploy (create schedule) error details:", errorBody);
                throw new Error(`创建投放计划失败: ${errorBody?.message || createScheduleResponse.statusText}`);
            }

            // --- Step 2: Update the '待上架' list in the 'accounts' table ---
            // Fetch the current account data
            const getAccountUrl = `${accountsDatabaseUrl}?name=eq.${encodeURIComponent(accountName)}&select=待上架`;
            const getAccountResponse = await fetch(getAccountUrl, {
                headers: { 'apikey': supabaseAnonKey, 'Accept': 'application/json' }
            });

            if (!getAccountResponse.ok) {
                 let errorBody = null;
                 try { errorBody = await getAccountResponse.json(); } catch { /* Ignore */ }
                 console.error("Supabase deploy (get account) error details:", errorBody);
                 // Don't throw yet, maybe log a warning? Or proceed and potentially overwrite?
                 // Let's throw for now to be safe, but you might adjust this.
                 throw new Error(`获取账号信息失败: ${errorBody?.message || getAccountResponse.statusText}`);
            }

            const accountData = await getAccountResponse.json();

            if (!accountData || accountData.length === 0) {
                // Account not found - this shouldn't happen if the deploy button is shown for an existing account
                console.warn(`尝试更新账号 ${accountName} 的待上架列表，但未找到该账号。`);
                // Proceed without updating the account, or throw an error?
                // Let's proceed for now.
            } else {
                const currentPendingList: string[] = accountData[0]?.待上架 || [];
                const updatedPendingList = [...currentPendingList];

                // Add the product ID if it's not already there
                if (!updatedPendingList.includes(productIdString)) {
                    updatedPendingList.push(productIdString);
                }
                // OPTIONAL: Remove from '已上架' if it exists there? Decide based on your logic.
                // const currentLiveList: string[] = accountData[0]?.已上架 || [];
                // const updatedLiveList = currentLiveList.filter(id => id !== productIdString);

                 // Update the account record
                const updateAccountUrl = `${accountsDatabaseUrl}?name=eq.${encodeURIComponent(accountName)}`;
                const updateAccountResponse = await fetch(updateAccountUrl, {
                    method: 'PATCH',
                    headers: {
                        'apikey': supabaseAnonKey,
                        'Content-Type': 'application/json',
                        'Prefer': 'return=minimal'
                    },
                    body: JSON.stringify({
                        '待上架': updatedPendingList,
                        // '已上架': updatedLiveList, // Uncomment if you also modify 已上架
                        'updated_at': new Date().toISOString() // Update timestamp
                    })
                });

                 if (!updateAccountResponse.ok) {
                    let errorBody = null;
                    try { errorBody = await updateAccountResponse.json(); } catch { /* Ignore */ }
                    console.error("Supabase deploy (update account) error details:", errorBody);
                    // Don't throw critical error for this secondary update? Log warning instead?
                     console.warn(`更新账号 ${accountName} 的待上架列表失败: ${errorBody?.message || updateAccountResponse.statusText}`);
                     // Maybe show a non-blocking warning to the user?
                 }
            }


            // --- Step 3: Refetch schedules to update the display (existing logic) ---
            fetchProductSchedules();
            // You might also want to refetch account data if you display the '待上架' list directly from the accounts table somewhere else.

        } catch (error) {
            console.error(`为商品 ${productIdToDeploy} 创建投放计划到账号 ${accountName} 时出错:`, error);
            throw new Error(`创建投放计划失败: ${(error as Error).message}`);
        }
        // finally block removed as state updates were removed
    }

  return (
        <div className="p-5 font-sans bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 min-h-screen"> {/* Base styling with dark mode */}
             {/* Header */}
            <h1 className="text-2xl font-bold mb-4 flex items-center gap-2 flex-wrap text-gray-800 dark:text-gray-200"> {/* Reduced gap slightly */}
                <span>商品列表</span>
                {/* Styled Refresh Button */}
                <button
                    className="bg-gray-500 hover:bg-gray-600 text-white text-sm py-1.5 px-3 rounded-md disabled:opacity-50 cursor-pointer dark:bg-gray-600 dark:hover:bg-gray-700"
                    onClick={fetchProducts}
                    disabled={loading}
                >
                    {loading ? '正在刷新...' : '刷新商品列表'}
                </button>
                {/* Styled Delete Duplicates Button */}
                <button
                    className="bg-red-500 hover:bg-red-600 text-white text-sm py-1.5 px-3 rounded-md disabled:opacity-50 cursor-pointer"
                    onClick={deleteDuplicateProducts}
                     disabled={loading}
                >
                    删除重复商品(按原始文案)
                </button>
            </h1>

            {/* Display error if Supabase config is missing */} 
            {(!supabaseUrl || !supabaseAnonKey) && 
                <div className="error-message text-red-600 dark:text-red-400 text-center p-5 border border-red-300 dark:border-red-600 bg-red-50 dark:bg-red-900/30 mb-4 rounded">
                    错误：Supabase 未正确配置。请检查 .env.local 文件中的 NEXT_PUBLIC_SUPABASE_URL 和 NEXT_PUBLIC_SUPABASE_ANON_KEY。
                </div>
            }

            {/* --- Filter Controls Row --- */}
            <div className="flex flex-wrap gap-4 mb-5 items-center">
                {/* Category Filter */}
                <div className="category-filter-controls p-3 bg-gray-200 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded flex items-center gap-2 flex-wrap">
                    <label htmlFor="category-filter" className="font-bold text-sm mr-1 text-gray-700 dark:text-gray-300">类型:</label>
                    <select
                        id="category-filter"
                        value={selectedCategory}
                        onChange={(e) => setSelectedCategory(e.target.value)}
                        className="px-2 py-1 border border-gray-300 dark:border-gray-500 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    >
                        <option value="all">所有类型</option>
                        {availableCategories.map(category => (
                            <option key={category} value={category}>{category}</option>
                        ))}
                    </select>
                </div>

                {/* Time Range Filter (Updated Options) */}
                <div className="time-range-filter-controls p-3 bg-gray-200 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded flex items-center gap-2 flex-wrap">
                    <label htmlFor="time-range-filter" className="font-bold text-sm mr-1 text-gray-700 dark:text-gray-300">搜索时间:</label>
                    <select
                        id="time-range-filter"
                        value={selectedTimeRange}
                        onChange={(e) => setSelectedTimeRange(e.target.value)}
                        className="px-2 py-1 border border-gray-300 dark:border-gray-500 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    >
                        <option value="all">所有时间</option>
                        <option value="1d">最近 1 天</option>
                        <option value="2d">最近 2 天</option>
                        <option value="3d">最近 3 天</option>
                        <option value="older">3 天之前</option>
                    </select>
                </div>

                 {/* Find Product Controls - Moved Inside */}
                 <div className="find-product-controls p-3 bg-gray-200 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded flex items-center gap-2"> {/* Removed mb-5 */} 
                    <label htmlFor="find-product-id" className="font-bold text-sm mr-1 text-gray-700 dark:text-gray-300">查找商品编号:</label> {/* Added mr-1 */}
                    {/* Styled Input */}
                   <input
                       type="text"
                       id="find-product-id"
                       placeholder="输入商品 ID"
                       value={findProductId}
                       onChange={(e) => setFindProductId(e.target.value)}
                       className="px-2 py-1 border border-gray-300 dark:border-gray-500 rounded-md w-36 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" /* Added dark mode styles */
                    />
                    {/* Styled Find Button */}
                   <button
                        id="find-button"
                        onClick={findProductById}
                        className="bg-cyan-500 hover:bg-cyan-600 text-white text-sm py-1.5 px-3 rounded-md cursor-pointer"
                    >
                        查找
                    </button>
                </div>
            </div>
            {/* --------------------------- */}

            {/* --- NEW: Schedule Display Area --- */}
            <div className="schedules-display mt-6 border-t border-gray-200 dark:border-gray-700 pt-4">
                <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
                    <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200">账号投放商品状态</h2>
                    {/* Add New Account UI & Save Button */}
                    <div className="flex items-center gap-2">
                        <input
                            type="text"
                            placeholder="输入新账号名称"
                            value={newAccountName}
                            onChange={(e) => setNewAccountName(e.target.value)}
                            className="px-2 py-1 border border-gray-300 dark:border-gray-500 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-green-500 focus:border-green-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                        />
                         <button
                             onClick={handleAddAccount}
                             disabled={isAddingAccount || !newAccountName.trim()}
                             className="bg-green-500 hover:bg-green-600 text-white text-sm py-1 px-3 rounded-md disabled:opacity-50 cursor-pointer dark:bg-green-600 dark:hover:bg-green-700"
                         >
                             {isAddingAccount ? '添加中...' : '添加账号'}
                         </button>
                         {/* Save Button - Consider purpose or remove if deploy handles all additions */}
                         {/* <button
                             onClick={handleSaveSchedules}
                             disabled={isSavingSchedules}
                             className="bg-blue-500 hover:bg-blue-600 text-white text-sm py-1 px-3 rounded-md disabled:opacity-50 cursor-pointer"
                         >
                             {isSavingSchedules ? '保存中...' : '保存'}
                         </button> */}
                    </div>
                </div>
                {(loadingAccounts) && <p className="text-gray-600 dark:text-gray-400 italic">正在加载账号与投放计划...</p>}
                {/* Show combined error state */} 
                {!loadingAccounts && (errorAccounts) && (
                    <p className="text-red-600 dark:text-red-400">
                        {errorAccounts}
                    </p>
                )}
                {!loadingAccounts && !errorAccounts && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                         {/* Use allAccounts directly */} 
                        {allAccounts.map(account => (
                            <div key={account.name} className="border border-gray-200 dark:border-gray-700 p-3 rounded-md bg-white dark:bg-gray-800 shadow relative group/account">
                                {/* Delete Account Button */}
                                <button
                                    onClick={() => handleDeleteAccount(account.name)}
                                    disabled={deletingAccount === account.name}
                                    className="absolute top-1 right-1 p-0.5 bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-800/70 rounded-full opacity-0 group-hover/account:opacity-100 transition-opacity disabled:opacity-50 z-10"
                                    title={`删除账号 ${account.name}`}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>

                                <h3 className="font-bold text-lg mb-2 border-b border-gray-200 dark:border-gray-700 pb-1 pr-6 text-gray-800 dark:text-gray-200">
                                    {account.name}
                                    {deletingAccount === account.name && <span className="text-sm text-gray-500 dark:text-gray-400 italic ml-2">删除中...</span>}
                                </h3>
                                <div>
                                    <h4 className="font-semibold text-sm mb-1 text-orange-600 dark:text-orange-400">待上架 ({account['待上架']?.length || 0})</h4>
                                    <div className="flex flex-wrap gap-1">
                                        {(account['待上架'] && account['待上架']!.length > 0) ? (
                                            account['待上架']!.map(id => {
                                                const isDeletingThis = deletingSchedule?.account === account.name && deletingSchedule?.productId === id;
                                                return (
                                                    <span key={`${account.name}-pending-${id}`} className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono bg-orange-100 dark:bg-orange-900/50 text-orange-800 dark:text-orange-300 group/item relative ${isDeletingThis ? 'opacity-50' : ''}`}>
                                                        {id}
                                                        {/* Delete individual schedule button (still triggers handleDeleteSchedule) */}
                                                        <button
                                                            onClick={() => !isDeletingThis && handleDeleteSchedule(account.name, id)}
                                                            disabled={isDeletingThis || !!deletingAccount}
                                                            className="ml-1 -mr-0.5 p-0 text-orange-500 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 opacity-0 group-hover/item:opacity-100 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
                                                            title={`从 ${account.name} 删除 ${id}`}
                                                        >
                                                            {isDeletingThis ? '...' : '×'}
                                                        </button>
                                                    </span>
                                                );
                                            })
                                        ) : (
                                            <span className="text-xs text-gray-500">无</span>
                                        )}
                                    </div>
                                </div>
                                <div className="mt-2">
                                    <h4 className="font-semibold text-sm mb-1 text-green-600 dark:text-green-400">已上架 ({account['已上架']?.length || 0})</h4>
                                    <div className="flex flex-wrap gap-1">
                                        {(account['已上架'] && account['已上架']!.length > 0) ? (
                                            account['已上架']!.map(id => {
                                               const isDeletingThis = deletingSchedule?.account === account.name && deletingSchedule?.productId === id;
                                               return (
                                                   <span key={`${account.name}-live-${id}`} className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300 group/item relative ${isDeletingThis ? 'opacity-50' : ''}`}>
                                                       {id}
                                                       {/* Delete individual schedule button (still triggers handleDeleteSchedule) */}
                                                       <button
                                                           onClick={() => !isDeletingThis && handleDeleteSchedule(account.name, id)}
                                                           disabled={isDeletingThis || !!deletingAccount}
                                                           className="ml-1 -mr-0.5 p-0 text-green-500 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 opacity-0 group-hover/item:opacity-100 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
                                                           title={`从 ${account.name} 删除 ${id}`}
                                                       >
                                                           {isDeletingThis ? '...' : '×'}
                                                       </button>
                                                   </span>
                                                );
                                            })
                                        ) : (
                                            <span className="text-xs text-gray-500">无</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
            {/* ---------------------------------- */}

            {/* --- ADD SEPARATOR --- */}
            <hr className="my-6 border-gray-300 dark:border-gray-600" />

            {/* --- NEW: AI Prompt Input Area --- */}
            <div className="mb-6 p-4 border rounded bg-gray-50 dark:bg-gray-800">
                <label htmlFor="aiPromptInput" className="block text-lg font-semibold text-gray-800 dark:text-gray-100 mb-2">全局 AI 提示词:</label>
                {loadingPrompt && <p className="text-gray-500 dark:text-gray-400 italic">正在加载提示词...</p>}
                {promptError && <p className="text-red-500 dark:text-red-400">错误: {promptError}</p>}
                {!loadingPrompt && (
                    <textarea
                        id="aiPromptInput"
                        value={promptText}
                        onChange={(e) => setPromptText(e.target.value)}
                        placeholder="输入你的 AI 修改文案指令..."
                        rows={4}
                        className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600"
                        disabled={savingPrompt} // Disable while saving
                    />
                )}
                <button
                    onClick={handleSavePrompt}
                    className="mt-2 bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-700 disabled:opacity-50"
                    disabled={loadingPrompt || savingPrompt} // Disable while loading or saving
                >
                    {savingPrompt ? '保存中...' : '保存提示词到云端'}
                </button>
                {/* <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">提示词将保存在浏览器本地，刷新页面不会丢失。</p> */}
                {!loadingPrompt && !promptError && 
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">提示词保存在云端，所有用户共享。</p>
                }
            </div>

            {/* Product List Header (Optional Separator) */} 
            <h2 className="text-xl font-semibold mt-6 border-t border-gray-200 dark:border-gray-700 pt-4 mb-3 text-gray-800 dark:text-gray-200">商品列表 (筛选结果)</h2>

            {/* Product List */}
             {loading && <div className="loading-indicator text-center p-5 text-gray-600 dark:text-gray-400 italic">正在加载商品...</div>}
             {error && <div className="error-message text-red-600 dark:text-red-400 text-center p-5">{error}</div>}
             {!loading && !error && (!supabaseUrl || !supabaseAnonKey) && (
                <div className="text-center col-span-full p-5 text-red-600 dark:text-red-400">无法加载商品，请检查 Supabase 配置。</div>
             )}
             {!loading && !error && supabaseUrl && supabaseAnonKey && (
                 <div
                    ref={productListContainerRef}
                    id="product-list-container"
                    className="product-list grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-5"
                 >
                    {visibleProducts.length > 0 ? (
                         visibleProducts.map(product => (
                             // Use the ProductCard component
                             <ProductCard
                                key={product.id}
                                product={product}
                                onDelete={deleteProduct} // Pass the delete function
                                onDeploy={handleDeployProduct}
                                allAccountNames={allAccounts.map(acc => acc.name)}
                                globalPrompt={promptText} // Pass the prompt down
                             />
                         ))
                    ) : (
                        <div className="text-center col-span-full p-5 text-gray-500 dark:text-gray-400">没有符合条件的商品。</div>
                    )}
                </div>
             )}

             {/* Commented out original script functions for reference - TO BE REFACTORED */}
             {/*
             function autoResizeTextareas() { ... }
             function adjustTextareaHeight(textarea) { ... }
             async function copyProductId(productId, buttonElement) { ... }
             async function modifyTextWithAI(productCard) { ... }
             async function confirmChanges(productCard) { ... }
             function findSimilarImages(imageUrl) { ... }
             async function updateProductImage(productCard, productImgElement) { ... }
             function isValidUrl(string) { ... }
             function dragStart(event) { ... }
             function dragEnd(event) { ... }
             function allowDrop(event) { ... }
             function drop(event) { ... }
             async function updateSortOrder() { ... }
             function searchOnXianyu(description) { ... }
             function formatTimeAgo(timestamp) { ... }
             function toggleDescriptionLength(textarea, button) { ... }
              */}
    </div>
  );
}

// Add necessary CSS classes to src/app/globals.css or use Tailwind utilities
// Example placeholder classes used:
// .refresh-button, .delete-duplicates-button, .filter-controls, .filter-input, .filter-button-apply, .filter-button-clear
// .find-product-controls, .find-input, .find-button, .product-list, .product-card, .loading-indicator, .error-message
// .highlighted, .delete-button
// Need to add styles for these or replace with Tailwind equivalents.
