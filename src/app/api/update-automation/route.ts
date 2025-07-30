import { createClient } from '@supabase/supabase-js';
import { type NextRequest, NextResponse } from 'next/server';
import crossFetch from 'cross-fetch';

const supabaseUrl = "https://urfibhtfqgffpanpsjds.supabase.co";
const supabaseServiceKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVyZmliaHRmcWdmZnBhbnBzamRzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczNTc4NTY0NSwiZXhwIjoyMDUxMzYxNjQ1fQ.fHIeQZR1l_lGPV7hYJkcahkEvYytIBpasXOg4m1atAs";

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  global: {
    fetch: crossFetch,
  },
});

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { accountName, newStatus } = await request.json();

    if (!accountName || typeof newStatus !== 'boolean') {
      return NextResponse.json({ error: 'Missing accountName or newStatus' }, { status: 400 });
    }

    const { data: account, error: fetchError } = await supabase
        .from('accounts_duplicate')
        .select('scheduling_rule')
        .eq('name', accountName)
        .single();
    
    if (fetchError) {
        console.error('Supabase error fetching account for automation update:', { message: fetchError.message, details: fetchError.details });
        throw fetchError;
    }

    const currentRule = account?.scheduling_rule || { items_per_day: 0 };
    const newRule = { ...currentRule, enabled: newStatus };

    const { error: updateError } = await supabase
        .from('accounts_duplicate')
        .update({ scheduling_rule: newRule, updated_at: new Date().toISOString() })
        .eq('name', accountName);

    if (updateError) {
        console.error('Supabase error updating automation status:', { message: updateError.message, details: updateError.details });
        throw updateError;
    }

    return NextResponse.json({ success: true, message: `Automation for ${accountName} set to ${newStatus}` });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    console.error('Catch block error in update-automation:', { message: errorMessage, stack: error instanceof Error ? error.stack : '' });
    return NextResponse.json({ error: 'Failed to update automation status', details: errorMessage }, { status: 500 });
  }
} 