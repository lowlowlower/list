import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import crossFetch from 'cross-fetch'; // Use a robust fetch implementation

const supabaseUrl = "https://urfibhtfqgffpanpsjds.supabase.co";
const supabaseServiceKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVyZmliaHRmcWdmZnBhbnBzamRzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczNTc4NTY0NSwiZXhwIjoyMDUxMzYxNjQ1fQ.fHIeQZR1l_lGPV7hYJkcahkEvYytIBpasXOg4m1atAs";

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  global: {
    fetch: crossFetch,
  },
});

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { data, error } = await supabase
        .from('automation_runs')
        .select('*');

    if (error) {
        console.error('Supabase error fetching automation status:', { message: error.message, details: error.details, hint: error.hint, code: error.code });
        throw error;
    }
    return NextResponse.json(data);

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    console.error('Failed to get automation status:', { message: errorMessage, stack: error instanceof Error ? error.stack : '' });
    return NextResponse.json({ error: 'Failed to get automation status', details: errorMessage }, { status: 500 });
  }
} 