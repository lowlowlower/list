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
            // The schedule is empty. Find the newest product and schedule it for the first available future slot.
            await log('INFO', `No real products in schedule. Attempting to schedule into first available slot.`, { account_name: account.name });

            const scheduleTemplate = account.schedule_template || ['09:00', '12:00', '15:00', '18:00', '21:00'];
            if (!scheduleTemplate || scheduleTemplate.length === 0) {
                await log('WARN', `Account has no schedule template. Cannot auto-schedule.`, { account_name: account.name });
            } else {
                // Find the next available time slot
                let nextAvailableSlot: Date | null = null;
                const sortedTemplate = [...scheduleTemplate].sort();

                // Look for a slot today
                for (const time of sortedTemplate) {
                    const [hour, minute] = time.split(':').map(Number);
                    if (isNaN(hour) || isNaN(minute)) continue;
                    const potentialSlot = new Date();
                    potentialSlot.setHours(hour, minute, 0, 0);
                    if (potentialSlot.getTime() > now.getTime()) {
                        nextAvailableSlot = potentialSlot;
                        break;
                    }
                }

                // If no slot was found for today, find the first slot for tomorrow
                if (!nextAvailableSlot) {
                    const tomorrow = new Date();
                    tomorrow.setDate(now.getDate() + 1);
                    const [hour, minute] = sortedTemplate[0].split(':').map(Number);
                    if (!isNaN(hour) && !isNaN(minute)) {
                       tomorrow.setHours(hour, minute, 0, 0);
                       nextAvailableSlot = tomorrow;
                    }
                }

                if (nextAvailableSlot) {
                    // Find a product to schedule
                    const pendingIds = new Set(pendingQueue.map(p => String(p.id)));
                    const { data: latestProducts, error: latestProductError } = await supabase
                        .from('search_results_duplicate_本人')
                        .select('id')
                        .eq('type', account.name)
                        .order('created_at', { ascending: false })
                        .limit(10);

                    if (latestProductError) {
                        await log('ERROR', `Failed to fetch latest products for scheduling.`, { account_name: account.name, error: latestProductError.message });
                    } else {
                        const productToSchedule = latestProducts.find(p => !pendingIds.has(String(p.id)));
                        if (productToSchedule) {
                            const newScheduledItem: ScheduledProduct = {
                                id: String(productToSchedule.id),
                                scheduled_at: nextAvailableSlot.toISOString(),
                                isPlaceholder: false,
                            };
                            const updatedPendingQueue = [...pendingQueue, newScheduledItem];
                            const { error: queueError } = await supabase
                                .from('accounts_duplicate')
                                .update({ '待上架': updatedPendingQueue })
                                .eq('name', account.name);

                            if (queueError) {
                                await log('ERROR', `Failed to save auto-scheduled product to queue.`, { product_id: newScheduledItem.id, error: queueError.message });
                            } else {
                                await log('SUCCESS', `Successfully auto-scheduled product ${newScheduledItem.id} for ${nextAvailableSlot.toLocaleString('zh-CN')}.`, { product_id: newScheduledItem.id });
                            }
                        } else {
                            await log('INFO', `No new products found in warehouse to schedule for account ${account.name}.`, { account_name: account.name });
                        }
                    }
                } else {
                     await log('WARN', `Could not determine a next available slot from the template.`, { account_name: account.name, template: sortedTemplate });
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