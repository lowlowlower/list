import { createClient } from '@supabase/supabase-js';
import { type NextRequest, NextResponse } from 'next/server';
import { generateImageBufferFromText, uploadImageToSupabase } from '@/lib/ai';
import type { ScheduledProduct } from '@/types';

const supabaseUrl = "https://urfibhtfqgffpanpsjds.supabase.co";
const supabaseServiceKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVyZmliaHRmcWdmZnBhbnBzamRzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczNTc4NTY0NSwiZXhwIjoyMDUxMzYxNjQ1fQ.fHIeQZR1l_lGPV7hYJkcahkEvYytIBpasXOg4m1atAs";
const geminiApiKey = "AIzaSyDmfaMC3pHdY6BYCvL_1pWZF5NLLkh28QU";

if (!supabaseUrl || !supabaseServiceKey || !geminiApiKey) {
  throw new Error("Supabase or Gemini environment variables are not properly configured.");
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite-preview-06-17:generateContent?key=${geminiApiKey}`;

type AutomationAccount = {
    name: string;
    scheduling_rule: { enabled?: boolean; items_per_day?: number } | null;
    '文案生成prompt': string | null;
    '待上架': ScheduledProduct[] | null;
};

// Define a type for the data structure we query to get used IDs



const runId = crypto.randomUUID();
async function log(level: 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR', message: string, metadata: object = {}) {
    console.log(level, message, metadata);
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
      .select('name, scheduling_rule, "文案生成prompt", "待上架", "已上架json"')
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
        const pendingQueue = (account['待上架'] || []) as ScheduledProduct[];
        
        // This is the new, simplified logic as requested by the user.
        if (pendingQueue.length > 0) {
            await log('INFO', `Pending queue is not empty (contains ${pendingQueue.length} items). Skipping.`, {
                account_name: account.name,
                queue_size: pendingQueue.length
            });
            continue; // Skip if there's anything in the queue
        }
        
        await log('INFO', `Pending queue is empty. Attempting to schedule one new product.`, { account_name: account.name });

        // We still need to know all used product IDs across all accounts to not pick a duplicate
        const usedProductIds = new Set<string>();
        accounts.forEach((acc: AutomationAccount & { '已上架json': ScheduledProduct[] | null }) => {
            (acc['待上架'] || []).forEach(item => { if (item?.id && !item.isPlaceholder) usedProductIds.add(String(item.id)); });
            (acc['已上架json'] || []).forEach(item => { if (item?.id) usedProductIds.add(String(item.id)); });
        });

        let productQuery = supabase.from('search_results_duplicate_本人').select('id, result_text_content').eq('type', account.name);
        if (usedProductIds.size > 0) {
            productQuery = productQuery.not('id', 'in', `(${Array.from(usedProductIds).join(',')})`);
        }
        const { data: newestProduct, error: productError } = await productQuery.order('created_at', { ascending: false }).limit(1).single();

        if (productError || !newestProduct) {
            await log('WARN', `Pending queue is empty, but no new, unused products were found.`, { account_name: account.name });
        } else {
            await log('INFO', `Selected product ${newestProduct.id} to schedule.`, { account_name: account.name, product_id: newestProduct.id });
            
            const originalContent = newestProduct.result_text_content || '';
            const copywritingPrompt = account['文案生成prompt'] || 'Make this text better.';
            const aiModifiedTextRaw = await callAIApi(`${copywritingPrompt}\n\n[Original Text]:\n${originalContent}`);
            const aiModifiedText = aiModifiedTextRaw.replace(/[*#]/g, '').trim();
            
            const newImageUrl = await generateAndUploadImage(aiModifiedText);
            
            await supabase.from('search_results_duplicate_本人').update({ '修改后文案': aiModifiedText, result_image_url: newImageUrl, is_ai_generated: true }).eq('id', newestProduct.id);

            // The time logic from the frontend should be respected here.
            // But since we are only adding if the queue is empty, we must generate a time.
            // This time should ideally come from the user's pre-calculated schedule.
            // For now, we add it with a time 'soon'. A better approach would be to read the empty schedule slots.
            // However, based on the new simple rule, we just add one.
            const nextScheduleTime = new Date(Date.now() + 10 * 60 * 1000).toISOString();

            const newScheduledItem: ScheduledProduct = {
                id: newestProduct.id.toString(),
                scheduled_at: nextScheduleTime,
                isPlaceholder: false
            };

            // The new queue will contain only this one item.
            const newPendingQueue = [newScheduledItem];
            
            const { error: queueError } = await supabase.from('accounts_duplicate').update({ '待上架': newPendingQueue }).eq('name', account.name);

            if (queueError) {
                await log('ERROR', `Failed to update pending queue with the new product.`, { account_name: account.name, error: queueError.message });
            } else {
                await log('SUCCESS', `Successfully scheduled product ${newestProduct.id} at ${nextScheduleTime}.`, { account_name: account.name });
            }
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