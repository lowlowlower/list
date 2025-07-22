import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// --- Supabase Clients ---
const supabaseUrl = 'https://urfibhtfqgffpanpsjds.supabase.co';

// This is the provided service_role key.
// IMPORTANT: This should be moved to a .env.local file and not be hardcoded.
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVyZmliaHRmcWdmZnBhbnBzamRzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczNTc4NTY0NSwiZXhwIjoyMDUxMzYxNjQ1fQ.fHIeQZR1l_lGPV7hYJkcahkEvYytIBpasXOg4m1atAs';

// The admin client uses the service_role key and has full access, bypassing RLS.
// This is the correct way to handle uploads from a secure server-side environment.
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

const STORAGE_BUCKET_NAME = 'product-images';

/**
 * API endpoint to save a Base64 encoded image to Supabase Storage.
 */
export async function POST(request: Request) {
    try {
        const { imageDataUrl } = await request.json();
        if (!imageDataUrl || !imageDataUrl.startsWith('data:image/png;base64,')) {
            return NextResponse.json({ error: 'Invalid image data URL provided.' }, { status: 400 });
        }

        // 1. Convert the Base64 data URL to a Buffer.
        const base64Data = imageDataUrl.replace(/^data:image\/png;base64,/, '');
        const imageBuffer = Buffer.from(base64Data, 'base64');

        // 2. Upload the image buffer to Supabase Storage using the admin client.
        const fileName = `generated-images/product-image-${Date.now()}.png`;
        const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
            .from(STORAGE_BUCKET_NAME)
            .upload(fileName, imageBuffer, {
                contentType: 'image/png',
                cacheControl: '3600', // Cache on the browser for 1 hour
                upsert: false,
            });

        if (uploadError) {
            console.error('Supabase Storage upload error:', uploadError);
            throw new Error(`Failed to upload image to Supabase Storage. Details: ${uploadError.message}`);
        }

        // 3. Get the public URL of the uploaded file.
        const { data: publicUrlData } = supabaseAdmin.storage
            .from(STORAGE_BUCKET_NAME)
            .getPublicUrl(uploadData.path);

        if (!publicUrlData || !publicUrlData.publicUrl) {
            throw new Error('Could not retrieve public URL for the uploaded image.');
        }

        // 4. Return the permanent Supabase URL to the client.
        return NextResponse.json({ supabaseUrl: publicUrlData.publicUrl });

    } catch (error) {
        console.error('Save image endpoint failed:', error);
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred while saving the image.';
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
} 