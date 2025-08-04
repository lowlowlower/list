import { createClient } from '@supabase/supabase-js';
import { type NextRequest, NextResponse } from 'next/server';
import { generateImageBufferFromText, uploadImageToSupabase } from '@/lib/ai';
import type { ScheduledProduct } from '@/types';
import crossFetch from 'cross-fetch';

const supabaseUrl = "https://urfibhtfqgffpanpsjds.supabase.co";
const supabaseServiceKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVyZmliaHRmcWdmZnBhbnBzamRzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczNTc4NTY0NSwiZXhwIjoyMDUxMzYxNjQ1fQ.fHIeQZR1l_lGPV7hYJkcahkEvYytIBpasXOg4m1atAs";
const geminiApiKey = "AIzaSyDmfaMC3pHdY6BYCvL_1pWZF5NLLkh28QU";

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    global: {
      fetch: crossFetch,
    },
});
const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite-preview-06-17:generateContent?key=${geminiApiKey}`;

type AutomationAccount = {
    name: string;
    scheduling_rule: { enabled?: boolean; items_per_day?: number } | null;
    schedule_template?: string[] | null; // Add the new template field
    '文案生成prompt': string | null;
    '待上架': ScheduledProduct[] | null;
};

// Define a minimal type for items in the deployed queue to satisfy the linter
type DeployedProduct = {
    id: string; // Ensure ID is always treated as a string internally
    [key: string]: unknown;
};

// --- V5: Seeded PRNG for Deterministic Randomness (must be identical to frontend) ---
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
// --- END Seeded PRNG ---

const runId = crypto.randomUUID();
async function log(level: 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR' | 'DEBUG', message: string, metadata: object = {}) {
    // For server logs, pretty-print the metadata for better readability
    console.log(`[${level}] ${message}`, JSON.stringify(metadata, null, 2));
    const { error } = await supabase.from('automation_logs').insert({ run_id: runId, level, message, metadata });
    if (error) {
        console.error("Failed to insert log into database:", error);
    }
}

async function callAIApi(prompt: string): Promise<string> {
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
}

async function generateAndUploadImage(text: string): Promise<string> {
    const imageBuffer = await generateImageBufferFromText(text);
    const publicUrl = await uploadImageToSupabase(imageBuffer);
    return publicUrl;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  await log('INFO', 'Cron job started.');

  try {
    const { data: accounts, error: accountsError } = await supabase
      .from('accounts_duplicate')
      .select('name, scheduling_rule, schedule_template, "文案生成prompt", "待上架", "已上架json"') // Select the new field
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
        
        // --- ROBUST DEPLOYED QUEUE SANITIZATION ---
        const existingDeployedRaw = account['已上架json'];
        const deployedQueue: DeployedProduct[] = [];
        if (Array.isArray(existingDeployedRaw)) {
            for (const item of existingDeployedRaw) {
                // Filter out nulls, non-objects, or objects without an ID.
                // Crucially, standardize all incoming IDs to strings.
                if (item && typeof item === 'object' && item.id != null) {
                    deployedQueue.push({ ...item, id: String(item.id) });
                }
            }
        }
        await log('DEBUG', `Sanitized deployed queue for account: ${account.name}`, { 
            account_name: account.name,
            sanitized_count: deployedQueue.length,
            sample: deployedQueue.slice(-5) // Log the last 5 items to see the newest additions
        });
        // --- END SANITIZATION ---

        const now = new Date();

        let productToProcessId: string | null = null;
        let isFromSchedule = false;

        const realScheduledProducts = pendingQueue.filter(p => !p.isPlaceholder);

        if (realScheduledProducts.length > 0) {
            // --- MODE 1: EXECUTOR ---
            // User has manually scheduled items. Process only the one that is due.
            const dueProduct = realScheduledProducts.find(p => new Date(p.scheduled_at) <= now);
            if (dueProduct) {
                productToProcessId = String(dueProduct.id);
                isFromSchedule = true;
                await log('INFO', `Found due scheduled product ${productToProcessId}.`, { account_name: account.name, product_id: productToProcessId });
            } else {
                await log('INFO', `Account has a schedule, but no items are due yet. Waiting.`, { account_name: account.name });
            }
        } else {
            // --- MODE 2: PLANNER ---
            // The schedule is empty. Replicate the frontend's logic to find the first available
            // placeholder slot and schedule the newest product into it.
            await log('INFO', `No real products in schedule. Finding first available slot to occupy.`, { account_name: account.name });

            const scheduleTemplate = account.schedule_template || ['09:00', '12:00', '15:00', '18:00', '21:00'];
            if (!scheduleTemplate || scheduleTemplate.length === 0) {
                await log('WARN', `Account has no schedule template. Cannot auto-schedule.`, { account_name: account.name });
            } else {
                // --- REPLICATE FRONTEND PLACEHOLDER GENERATION ---
                const placeholders: ScheduledProduct[] = [];
                // Generate for today and tomorrow to find the absolute next slot.
                for (let dayOffset = 0; dayOffset < 2; dayOffset++) { 
                    for (const time of scheduleTemplate) {
                        const [hour, minute] = time.split(':').map(Number);
                        if (isNaN(hour) || isNaN(minute)) continue;

                        const scheduleDate = new Date();
                        scheduleDate.setDate(now.getDate() + dayOffset);
                        scheduleDate.setHours(hour, minute, 0, 0);

                        if (scheduleDate.getTime() <= now.getTime()) {
                            continue;
                        }

                        // --- V5: Deterministic Randomization ---
                        const dateString = scheduleDate.toISOString().split('T')[0];
                        const seedString = `${account.name}-${dateString}-${time}`;
                        const seed = cyrb53(seedString);
                        const random = mulberry32(seed);

                        const baseTime = scheduleDate.getTime();
                        const thirtyMinutesInMillis = 30 * 60 * 1000;
                        const randomOffset = (random() * 2 - 1) * thirtyMinutesInMillis;
                        const randomizedTime = new Date(baseTime + randomOffset);
                        // --- END ---

                        placeholders.push({
                            id: `placeholder-${crypto.randomUUID()}`,
                            scheduled_at: randomizedTime.toISOString(),
                            isPlaceholder: true,
                        });
                    }
                }
                // --- END REPLICATION ---

                if (placeholders.length > 0) {
                    // Find the very first available slot from the generated placeholders
                    const firstAvailableSlot = placeholders.sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())[0];

                    // Find a product to schedule into this slot
                    const { data: latestProduct, error: latestProductError } = await supabase
                        .from('search_results_duplicate_本人')
                        .select('id')
                        .eq('type', account.name)
                        .order('created_at', { ascending: false })
                        .limit(1)
                        .single();

                    if (latestProductError) {
                        await log('ERROR', `Failed to fetch latest product for scheduling.`, { account_name: account.name, error: latestProductError.message });
                    } else if (latestProduct) {
                        const newScheduledItem: ScheduledProduct = {
                            id: String(latestProduct.id),
                            scheduled_at: firstAvailableSlot.scheduled_at, // Use the exact time from the placeholder
                            isPlaceholder: false,
                        };
                        
                        const updatedPendingQueue = [newScheduledItem]; // The queue was empty, so it's just this one.
                        
                        const { error: queueError } = await supabase
                            .from('accounts_duplicate')
                            .update({ '待上架': updatedPendingQueue })
                            .eq('name', account.name);

                        if (queueError) {
                            await log('ERROR', `Failed to save auto-scheduled product to queue.`, { product_id: newScheduledItem.id, error: queueError.message });
                        } else {
                            await log('SUCCESS', `Successfully occupied first slot. Product ${newScheduledItem.id} is scheduled for ${new Date(newScheduledItem.scheduled_at).toLocaleString('zh-CN')}.`, { product_id: newScheduledItem.id });
                        }
                    } else {
                        await log('INFO', `Warehouse is empty for account ${account.name}. Nothing to schedule.`, { account_name: account.name });
                    }
                } else {
                     await log('WARN', `Could not generate any future placeholder slots from the template.`, { account_name: account.name });
                }
            }
        }

        // --- UNIFIED PROCESSING BLOCK (only runs if a product was found in EXECUTOR mode) ---
        if (productToProcessId) {
            await log('DEBUG', `Product selected for processing.`, { account_name: account.name, product_id: productToProcessId, source: isFromSchedule ? 'schedule' : 'warehouse' });

            // --- Unified Processing Block ---
        const { data: dbProduct, error: productError } = await supabase
            .from('search_results_duplicate_本人')
            .select('id, result_text_content')
                .eq('id', productToProcessId)
            .single();

        if (productError || !dbProduct) {
                await log('ERROR', `Product ${productToProcessId} not found in database, cannot process.`, { product_id: productToProcessId, error: productError?.message });
                if (isFromSchedule) {
                    const updatedFailingQueue = pendingQueue.filter(p => String(p.id) !== productToProcessId);
            await supabase.from('accounts_duplicate').update({ '待上架': updatedFailingQueue }).eq('name', account.name);
                }
            continue;
        }

            // AI Processing
        const originalContent = dbProduct.result_text_content || '';
        const copywritingPrompt = account['文案生成prompt'] || 'Make this text better.';
        const aiModifiedTextRaw = await callAIApi(`${copywritingPrompt}\n\n[Original Text]:\n${originalContent}`);
        const aiModifiedText = aiModifiedTextRaw.replace(/[*#]/g, '').trim();
        const newImageUrl = await generateAndUploadImage(aiModifiedText);
        
            // Update product table
        const { error: updateProductError } = await supabase
            .from('search_results_duplicate_本人')
            .update({ '修改后文案': aiModifiedText, result_image_url: newImageUrl, is_ai_generated: true })
            .eq('id', dbProduct.id);

        if (updateProductError) {
                 await log('ERROR', `Failed to update product ${dbProduct.id} after AI processing.`, { product_id: dbProduct.id, error: updateProductError.message });
             continue;
        }

            // Update queues
            let updatedPendingQueue = pendingQueue;
            if (isFromSchedule) {
                updatedPendingQueue = pendingQueue.filter(p => String(p.id) !== productToProcessId);
            }
            const newlyDeployedItem = { id: productToProcessId, deployed_at: now.toISOString() };
        const updatedDeployedQueue = [...deployedQueue, newlyDeployedItem];

            await log('DEBUG', `Preparing to update queues for account: ${account.name}`, {
                account_name: account.name,
                product_id: productToProcessId,
                payload_pending_queue: updatedPendingQueue,
                payload_deployed_queue: updatedDeployedQueue
            });

        const { error: queueError } = await supabase
            .from('accounts_duplicate')
            .update({ 
                '待上架': updatedPendingQueue,
                '已上架json': updatedDeployedQueue 
            })
            .eq('name', account.name);

        if (queueError) {
                await log('ERROR', `Failed to update queues for account ${account.name}.`, { error: queueError.message });
            } else {
                await log('SUCCESS', `Successfully processed and deployed product ${productToProcessId}.`, { product_id: productToProcessId });
            }
        } else {
            await log('INFO', `No product found to process for account ${account.name} in this run.`, { account_name: account.name });
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

    await log('SUCCESS', 'Cron job finished successfully.');
    return NextResponse.json({ status: 'ok', message: 'Cron job executed successfully.' });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    await log('ERROR', 'Cron job failed with an unhandled exception.', { error: errorMessage });
    return NextResponse.json({ status: 'error', error: errorMessage }, { status: 500 });
  }
} 