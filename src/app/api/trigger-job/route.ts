import { createClient } from '@supabase/supabase-js';
import { type NextRequest, NextResponse } from 'next/server';
import { generateImageBufferFromHtml, uploadImageToSupabase, generateSimpleImageBuffer } from '@/lib/ai';
import type { ScheduledProduct } from '@/types';
import crossFetch from 'cross-fetch';
import * as cheerio from 'cheerio';

const supabaseUrl = "https://urfibhtfqgffpanpsjds.supabase.co";
const supabaseServiceKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVyZmliaHRmcWdmZnBhbnBzamRzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczNTc4NTY0NSwiZXhwIjoyMDUxMzYxNjQ1fQ.fHIeQZR1l_lGPV7hYJkcahkEvYytIBpasXOg4m1atAs";
const geminiApiKey = "AIzaSyDmfaMC3pHdY6BYCvL_1pWZF5NLLkh28QU";
const deepseekApiKey = "sk-78a9fd015e054281a3eb0a0712d5e6d0";

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    global: {
      fetch: crossFetch,
    },
});
const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite-preview-06-17:generateContent?key=${geminiApiKey}`;
const deepseekApiUrl = 'https://api.deepseek.com/chat/completions';
const LOG_RETENTION_LIMIT = 250; // 5 pages * 50 items/page

async function cleanupOldLogs() {
    try {
        const { count, error: countError } = await supabase
            .from('automation_logs')
            .select('*', { count: 'exact', head: true });

        if (countError) {
            await log('ERROR', 'Failed to count automation logs for cleanup.', { error: countError.message });
            return;
        }

        if (count !== null && count > LOG_RETENTION_LIMIT) {
            const deleteCount = count - LOG_RETENTION_LIMIT;
            await log('INFO', `Log retention limit exceeded. Deleting oldest ${deleteCount} logs.`, { current: count, limit: LOG_RETENTION_LIMIT });

            const { data: logsToDelete, error: selectError } = await supabase
                .from('automation_logs')
                .select('id')
                .order('created_at', { ascending: true })
                .limit(deleteCount);

            if (selectError) {
                await log('ERROR', 'Failed to select old logs for deletion.', { error: selectError.message });
                return;
            }

            if (logsToDelete && logsToDelete.length > 0) {
                const idsToDelete = logsToDelete.map(log => log.id);
                const { error: deleteError } = await supabase
                    .from('automation_logs')
                    .delete()
                    .in('id', idsToDelete);

                if (deleteError) {
                    await log('ERROR', 'Failed to delete old logs.', { error: deleteError.message });
                } else {
                    await log('SUCCESS', `Successfully deleted ${idsToDelete.length} old logs.`, { count: idsToDelete.length });
                }
            }
        }
    } catch (cleanupError) {
        const errorMessage = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
        await log('ERROR', 'An unexpected error occurred during log cleanup.', { error: errorMessage });
    }
}


type AutomationAccount = {
    name: string;
    scheduling_rule: { enabled?: boolean; items_per_day?: number } | null;
    schedule_template?: string[] | null;
    '文案生成prompt': string | null;
    '待上架': ScheduledProduct[] | null;
    '业务描述': string | null;
};

type DeployedProduct = {
    id: string;
    [key: string]: unknown;
};

const cyrb53 = (str: string, seed = 0): number => {
    let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for (let i = 0, ch; i < str.length; i++) {
        ch = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1>>>16), 2246822507) ^ Math.imul(h2 ^ (h2>>>13), 3266489909);
    h2 = Math.imul(h2 ^ (h2>>>16), 2246822507) ^ Math.imul(h1 ^ (h1>>>13), 3266489909);
    return 4294967296 * (2097151 & h2) + (h1>>>0);
};

const mulberry32 = (a: number): () => number => {
    return function() {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
}

const runId = crypto.randomUUID();
async function log(level: 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR' | 'DEBUG', message: string, metadata: object = {}) {
    console.log(`[${level}] ${message}`, JSON.stringify(metadata, null, 2));
    const { error } = await supabase.from('automation_logs').insert({ run_id: runId, level, message, metadata });
    if (error) {
        console.error("Failed to insert log into database:", error);
    }
}

async function callAIApi(prompt: string): Promise<string> {
    try {
        // --- Primary API: Gemini ---
        const res = await fetch(geminiApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        if (!res.ok) {
            const errorData = await res.json();
            throw new Error(`Gemini API Error: ${errorData.error?.message || 'Unknown error'}`);
        }
        const data = await res.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } catch (geminiError) {
        const errorMessage = geminiError instanceof Error ? geminiError.message : String(geminiError);
        await log('WARN', 'Gemini API failed, switching to DeepSeek fallback.', { error: errorMessage });
        
        // --- Fallback API: DeepSeek ---
        try {
            const res = await fetch(deepseekApiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${deepseekApiKey}`
                },
                body: JSON.stringify({
                    model: 'deepseek-chat',
                    messages: [{ role: 'user', content: prompt }],
                })
            });
            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(`DeepSeek API Error: ${errorData.error?.message || 'Unknown error'}`);
            }
            const data = await res.json();
            return data.choices?.[0]?.message?.content || '';
        } catch (deepseekError) {
            const deepseekErrorMessage = deepseekError instanceof Error ? deepseekError.message : String(deepseekError);
            await log('ERROR', 'Both Gemini and DeepSeek APIs failed.', { gemini_error: errorMessage, deepseek_error: deepseekErrorMessage });
            throw new Error('All AI providers are currently unavailable.');
        }
    }
}

// --- V10: The Final Boss - Hardened AI Prompts & Failsafes ---
const DESIGN_STYLES = [
    'Tech & Futuristic: Dark themes, neon glows, geometric shapes.',
    'Elegant & Minimalist: Light color palette, clean lines, lots of empty space.',
    'Natural & Organic: Earth tones, soft textures, nature-inspired motifs.',
    'Playful & Vibrant: Bright, saturated colors, fun fonts, whimsical shapes.',
    'Corporate & Professional: Clean, structured layout, limited color palette.',
    'Retro & Vintage: Sepia tones, classic fonts, old paper textures.'
];

const COMPLEXITY_THRESHOLD = 2500;

function cleanHtml(rawHtml: string): string {
    return rawHtml.replace(/```html/g, '').replace(/```/g, '').trim();
}

function purifyHtml(html: string): string {
    const $ = cheerio.load(html);
    $('div').each((i, el) => {
        const element = $(el);
        if (element.children().length > 1) {
            const style = element.attr('style') || '';
            if (!style.includes('display: flex')) {
                 element.attr('style', `display: flex; ${style}`);
                 log('WARN', 'Purifier fixed a div without display:flex.');
            }
        }
    });
    const body = $('body');
    if (body.children().length === 1 && body.children().is('div')) {
        const outermostDiv = body.children('div').first();
        const style = outermostDiv.attr('style') || '';
        let newStyle = style;
        if (!style.includes('width')) {
            newStyle = `width: 100%; ${newStyle}`;
        }
        if (!style.includes('height')) {
            newStyle = `height: 100%; ${newStyle}`;
        }
        if (newStyle !== style) {
            outermostDiv.attr('style', newStyle);
            log('WARN', 'Purifier fixed outermost div missing width/height.');
        }
    }
    return $('body').html() || '';
}

async function generateAndUploadImage(fullText: string): Promise<string> {
    let imageBuffer: Buffer;

    const summarizerPrompt = `Analyze the following text and extract the core, objective service or product name. Be neutral and professional, like a news headline. Do not use promotional language. Maximum 20 characters.\n\nText: "${fullText}"\n\nReturn ONLY the core service/product name.`;
    let coreDescription = (await callAIApi(summarizerPrompt)).trim();
    
    if (!coreDescription) {
        log('WARN', 'AI summarizer returned empty. Using fallback.');
        coreDescription = fullText.substring(0, 20);
    }
    await log('INFO', `AI summarized the core description.`, { summary: coreDescription });

    try {
        const randomStyle = DESIGN_STYLES[Math.floor(Math.random() * DESIGN_STYLES.length)];
        const designPrompt = `
You are a minimalist graphic designer. Create an HTML visual for Satori.
**Constraint:** You are given the final text. Do NOT add any other words. Keep the design extremely clean.

**Design Brief:**
1.  **Final Text:** "${coreDescription}"
2.  **Style:** ${randomStyle}
3.  **Font:** 'Noto Sans SC'.

**Output:**
Return ONLY the raw HTML code for a single \`<div>\` that fills the canvas.
`;
        const rawHtml = await callAIApi(designPrompt);
        const cleanedHtml = cleanHtml(rawHtml);

        if (!cleanedHtml) {
            throw new Error('AI Designer returned empty HTML.');
        }
        if (cleanedHtml.length > COMPLEXITY_THRESHOLD) {
            throw new Error(`HTML complexity (${cleanedHtml.length}) exceeds threshold.`);
        }
        
        const purifiedHtml = purifyHtml(cleanedHtml);
        imageBuffer = await generateImageBufferFromHtml(purifiedHtml);
        await log('SUCCESS', 'Generated complex image design.', { textUsed: coreDescription });

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        await log('WARN', 'Complex design failed. Falling back to simple mode.', { error: errorMessage, textUsed: coreDescription });
        imageBuffer = await generateSimpleImageBuffer(coreDescription);
    }
    
    const publicUrl = await uploadImageToSupabase(imageBuffer);
    return publicUrl;
}
// --- END V10 ---


export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  await log('INFO', 'Cron job started.');

  try {
    const { data: accounts, error: accountsError } = await supabase
      .from('accounts_duplicate')
      .select('name, scheduling_rule, schedule_template, "文案生成prompt", "待上架", "已上架json", "业务描述"')
      .eq('scheduling_rule->>enabled', 'true');

    if (accountsError) throw accountsError;
    await log('INFO', `Found ${accounts?.length || 0} accounts with automation enabled.`, { count: accounts?.length || 0 });

    for (const account of accounts as (AutomationAccount & { '已上架json': ScheduledProduct[] | null })[]) {
      await log('INFO', `Processing account: ${account.name}`, { account_name: account.name });
      const { error: runInsertError } = await supabase.from('automation_runs').insert({ account_name: account.name, status: 'running' });
      if (runInsertError) {
          await log('WARN', `Failed to acquire lock for account, it might be processed by another run.`, { account_name: account.name, error: runInsertError.message });
          continue;
      }

      try {
        const pendingQueue = (account['待上架'] || []).filter(item => item && item.id && item.scheduled_at) as ScheduledProduct[];
        
        const existingDeployedRaw = account['已上架json'];
        const deployedQueue: DeployedProduct[] = [];
        if (Array.isArray(existingDeployedRaw)) {
            for (const item of existingDeployedRaw) {
                if (item && typeof item === 'object' && item.id != null) {
                    deployedQueue.push({ ...item, id: String(item.id) });
                }
            }
        }
       
        const now = new Date();
        const realScheduledProducts = pendingQueue.filter(p => !p.isPlaceholder);
        const dueProduct = realScheduledProducts.find(p => new Date(p.scheduled_at) <= now);

        if (dueProduct) {
            // --- MODE 1: EXECUTOR (Process Manually Scheduled Item) ---
            const productToProcessId = String(dueProduct.id);
            await log('INFO', `Found due scheduled product ${productToProcessId}.`, { account_name: account.name, product_id: productToProcessId });

            const { data: dbProduct, error: productError } = await supabase
                .from('search_results_duplicate_本人')
                .select('id, result_text_content, "修改后文案"')
                .eq('id', productToProcessId)
                .single();

            if (productError || !dbProduct) {
                await log('ERROR', `Product ${productToProcessId} not found. Removing from queue.`, { product_id: productToProcessId, error: productError?.message });
                const updatedFailingQueue = pendingQueue.filter(p => String(p.id) !== productToProcessId);
                await supabase.from('accounts_duplicate').update({ '待上架': updatedFailingQueue }).eq('name', account.name);
                continue;
            }
            
            const finalText = dbProduct['修改后文案'] || dbProduct.result_text_content || '';
            const newImageUrl = await generateAndUploadImage(finalText);
            await log('INFO', `Generated new dynamic image for manually scheduled item.`, { product_id: productToProcessId });

            await supabase.from('search_results_duplicate_本人').update({ result_image_url: newImageUrl }).eq('id', dbProduct.id);
            
            const updatedPendingQueue = pendingQueue.filter(p => String(p.id) !== productToProcessId);
            const newlyDeployedItem = { id: productToProcessId, '上架时间': new Date().toISOString() };
            const updatedDeployedQueue = [...deployedQueue, newlyDeployedItem];

            await supabase.from('accounts_duplicate').update({ '待上架': updatedPendingQueue, '已上架json': updatedDeployedQueue }).eq('name', account.name);
            await log('SUCCESS', `Successfully processed and deployed MANUALLY scheduled product ${productToProcessId}.`, { product_id: productToProcessId });

        } else if (realScheduledProducts.length === 0) {
            // --- MODE 2: PLANNER (Auto-process and schedule new item) ---
            await log('INFO', `No real products in schedule. Attempting auto-processing.`, { account_name: account.name });
            
            const { data: latestProduct, error: latestProductError } = await supabase
                .from('search_results_duplicate_本人')
                .select('id, result_text_content')
                .eq('type', account.name)
                .is('修改后文案', null)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            if (latestProductError || !latestProduct) {
                await log('INFO', `Warehouse is empty for account ${account.name}.`, { account_name: account.name });
            } else {
                const productToProcess = latestProduct;
                await log('INFO', `Found new product ${productToProcess.id} to auto-process.`, { product_id: productToProcess.id });

                const originalContent = productToProcess.result_text_content || '';
                const copywritingPrompt = account['文案生成prompt'] || 'Make this text better.';
                const aiModifiedTextRaw = await callAIApi(`${copywritingPrompt}\n\n[Original Text]:\n${originalContent}`);
                const aiModifiedText = aiModifiedTextRaw.replace(/[*#]/g, '').trim();
                
                const newImageUrl = await generateAndUploadImage(aiModifiedText);
                await log('INFO', `Generated new dynamic image for auto-processed item.`, { product_id: productToProcess.id });

                const { error: updateProductError } = await supabase
                    .from('search_results_duplicate_本人')
                    .update({ '修改后文案': aiModifiedText, result_image_url: newImageUrl, is_ai_generated: true })
                    .eq('id', productToProcess.id);

                if (updateProductError) {
                    await log('ERROR', `Failed to update product ${productToProcess.id}.`, { error: updateProductError.message });
                } else {
                    await log('SUCCESS', `Successfully processed new product ${productToProcess.id}. Now finding a slot...`, { product_id: productToProcess.id });
                    
                    const realProducts = (account['待上架'] || []).filter(item => item && !item.isPlaceholder) as ScheduledProduct[];
                    const scheduleTemplate = account.schedule_template || ['09:00', '12:00', '15:00', '18:00', '21:00'];
                    const placeholders: ScheduledProduct[] = [];

                    for (let dayOffset = 0; dayOffset < 2; dayOffset++) {
                        for (const time of scheduleTemplate) {
                            const [hour, minute] = time.split(':').map(Number);
                            if (isNaN(hour) || isNaN(minute)) continue;

                            const scheduleDate = new Date();
                            scheduleDate.setDate(now.getDate() + dayOffset);
                            scheduleDate.setHours(hour, minute, 0, 0);

                            if (dayOffset === 0 && scheduleDate.getTime() < now.getTime()) {
                                continue;
                            }

                            const dateString = scheduleDate.toISOString().split('T')[0];
                            const seedString = `${account.name}-${dateString}-${time}`;
                            const seed = cyrb53(seedString);
                            const random = mulberry32(seed);

                            const baseTime = scheduleDate.getTime();
                            const thirtyMinutesInMillis = 30 * 60 * 1000;
                            const randomOffset = (random() * 2 - 1) * thirtyMinutesInMillis;
                            const randomizedTime = new Date(baseTime + randomOffset);
                            
                            const isOccupied = realProducts.some(p => Math.abs(new Date(p.scheduled_at).getTime() - randomizedTime.getTime()) < 60000);

                            if (!isOccupied) {
                                placeholders.push({
                                    id: `placeholder-${crypto.randomUUID()}`,
                                    scheduled_at: randomizedTime.toISOString(),
                                    isPlaceholder: true,
                                });
                            }
                        }
                    }

                    const futurePlaceholders = placeholders.filter(p => new Date(p.scheduled_at).getTime() > now.getTime());
                    const nextAvailableSlot = futurePlaceholders.sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())[0];


                    if (nextAvailableSlot) {
                        const newScheduledItem: ScheduledProduct = { id: String(productToProcess.id), scheduled_at: nextAvailableSlot.scheduled_at, isPlaceholder: false };
                        // Critical change: Only add to the queue, don't replace it.
                        const updatedPendingQueue = [...realProducts, newScheduledItem];
                        const { error: scheduleError } = await supabase.from('accounts_duplicate').update({ '待上架': updatedPendingQueue }).eq('name', account.name);

                        if (scheduleError) {
                            await log('ERROR', `Failed to schedule processed product ${productToProcess.id}.`, { error: scheduleError.message });
                        } else {
                            await log('SUCCESS', `Product ${productToProcess.id} scheduled for ${new Date(nextAvailableSlot.scheduled_at).toLocaleString('zh-CN')}.`, { product_id: productToProcess.id });
                        }
                    } else {
                        await log('WARN', `No available future slots to schedule product ${productToProcess.id}.`, { product_id: productToProcess.id });
                    }
                }
            }
        } else {
            await log('INFO', `Account has a schedule, but no items are due yet. Waiting.`, { account_name: account.name });
        }
        
      } finally {
          const { error: runDeleteError } = await supabase.from('automation_runs').delete().eq('account_name', account.name);
          if (runDeleteError) {
              await log('ERROR', `Failed to release lock for account.`, { account_name: account.name, error: runDeleteError.message });
          } else {
              await log('INFO', `Processing complete for account.`, { account_name: account.name });
          }
      }
    }

    await cleanupOldLogs();
    await log('SUCCESS', 'Cron job finished successfully.');
    return NextResponse.json({ status: 'ok', message: 'Cron job executed successfully.' });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    await log('ERROR', 'Cron job failed with an unhandled exception.', { error: errorMessage });
    return NextResponse.json({ status: 'error', error: errorMessage }, { status: 500 });
  }
}