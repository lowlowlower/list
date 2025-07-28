import { createClient } from '@supabase/supabase-js';
import { type NextRequest, NextResponse } from 'next/server';

const supabaseUrl = "https://urfibhtfqgffpanpsjds.supabase.co";
const supabaseServiceKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVyZmliaHRmcWdmZnBhbnBzamRzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczNTc4NTY0NSwiZXhwIjoyMDUxMzYxNjQ1fQ.fHIeQZR1l_lGPV7hYJkcahkEvYytIBpasXOg4m1atAs";

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error("Supabase URL or service key is not defined.");
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(request: NextRequest) {
  const { accountName, newStatus } = await request.json();

  if (!accountName) {
    return NextResponse.json({ error: 'accountName is required' }, { status: 400 });
  }
  
  if (typeof newStatus !== 'boolean') {
      return NextResponse.json({ error: 'newStatus must be a boolean' }, { status: 400 });
  }

  try {
    // First, fetch the existing scheduling_rule
    const { data: accountData, error: fetchError } = await supabase
      .from('accounts_duplicate')
      .select('scheduling_rule')
      .eq('name', accountName)
      .single();

    if (fetchError) throw fetchError;

    // Prepare the new rule
    const currentRule = accountData?.scheduling_rule || {};
    const newRule = { ...currentRule, enabled: newStatus };

    // Now, update the record
    const { error: updateError } = await supabase
      .from('accounts_duplicate')
      .update({ scheduling_rule: newRule })
      .eq('name', accountName);

    if (updateError) {
      console.error('Supabase update error:', updateError);
      throw updateError;
    }

    return NextResponse.json({ success: true, newRule });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    console.error('API Error:', errorMessage);
    return NextResponse.json({ error: `Failed to update automation status: ${errorMessage}` }, { status: 500 });
  }
} 