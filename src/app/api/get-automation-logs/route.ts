import { createClient } from '@supabase/supabase-js';
import { type NextRequest, NextResponse } from 'next/server';

const supabaseUrl = "https://urfibhtfqgffpanpsjds.supabase.co";
const supabaseServiceKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVyZmliaHRmcWdmZnBhbnBzamRzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczNTc4NTY0NSwiZXhwIjoyMDUxMzYxNjQ1fQ.fHIeQZR1l_lGPV7hYJkcahkEvYytIBpasXOg4m1atAs";

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error("Supabase URL or service key is not defined.");
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const LOGS_PER_PAGE = 50;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1', 10);
  
  const from = (page - 1) * LOGS_PER_PAGE;
  const to = from + LOGS_PER_PAGE - 1;

  try {
    const { data, error, count } = await supabase
      .from('automation_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      console.error('Supabase error fetching automation logs:', error);
      throw error;
    }

    return NextResponse.json({
        logs: data,
        totalCount: count,
        totalPages: Math.ceil((count || 0) / LOGS_PER_PAGE),
        currentPage: page
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    console.error('API Error:', errorMessage);
    return NextResponse.json({ error: `Failed to fetch automation logs: ${errorMessage}` }, { status: 500 });
  }
} 