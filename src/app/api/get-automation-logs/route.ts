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

const ITEMS_PER_PAGE = 50;

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const accountName = searchParams.get('accountName');

    const from = (page - 1) * ITEMS_PER_PAGE;
    const to = from + ITEMS_PER_PAGE - 1;

    try {
        let query = supabase
            .from('automation_logs')
            .select('*', { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(from, to);
        
        if (accountName) {
            query = query.eq('metadata->>account_name', accountName);
        }

        const { data, error, count } = await query;

        if (error) {
            console.error('Supabase error fetching automation logs:', { message: error.message, details: error.details, hint: error.hint, code: error.code });
            throw error;
        }

        return NextResponse.json({
            logs: data,
            totalPages: Math.ceil((count ?? 0) / ITEMS_PER_PAGE),
            currentPage: page
        });

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        console.error('Catch block error in get-automation-logs:', { message: errorMessage, stack: error instanceof Error ? error.stack : '' });
        return NextResponse.json({ error: 'Failed to fetch automation logs', details: errorMessage }, { status: 500 });
    }
} 