'use server';

import satori from 'satori';
import { html } from 'satori-html';
import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import crossFetch from 'cross-fetch';

// --- Reusable Supabase Client ---
const supabaseUrl = "https://urfibhtfqgffpanpsjds.supabase.co";
const supabaseServiceKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVyZmliaHRmcWdmZnBhbnBzamRzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczNTc4NTY0NSwiZXhwIjoyMDUxMzYxNjQ1fQ.fHIeQZR1l_lGPV7hYJkcahkEvYytIBpasXOg4m1atAs";
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    global: {
        fetch: crossFetch,
    },
});
const STORAGE_BUCKET_NAME = 'product-images';

// --- Reusable Font Loading ---
let fontData: Buffer | null = null;
async function getFontData() {
    if (fontData) return fontData;
    const fontPath = path.join(process.cwd(), 'src', 'lib', 'fonts', 'NotoSansSC-Regular.woff');
    try {
        fontData = await fs.readFile(fontPath);
        return fontData;
    } catch (error) {
        console.error("Error reading local font file:", error);
        throw new Error('Failed to load local font data for image generation.');
    }
}

// --- V3: Main generation logic for complex HTML from AI ---
export async function generateImageBufferFromHtml(htmlContent: string): Promise<Buffer> {
    const font = await getFontData();
    const template = html(htmlContent);

    const svg = await satori(template as React.ReactNode, {
        width: 1080,
        height: 1350, // Optimal for social media like Xiaohongshu
        fonts: [{
            name: 'Noto Sans SC',
            data: font,
            weight: 400,
            style: 'normal',
        }],
    });

    return sharp(Buffer.from(svg)).png({ quality: 90 }).toBuffer();
}

// --- V3: Fallback generator for simple text ---
export async function generateSimpleImageBuffer(text: string): Promise<Buffer> {
    const font = await getFontData();
    const simpleTemplate = html(`
        <div style="display: flex; height: 100%; width: 100%; align-items: center; justify-content: center; background-image: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%); font-family: 'Noto Sans SC'; padding: 80px; text-align: center; color: #333; line-height: 1.8; font-size: 52px; white-space: pre-wrap; word-wrap: break-word;">
            ${text}
        </div>
    `);

    const svg = await satori(simpleTemplate as React.ReactNode, {
        width: 1080,
        height: 1350, // Optimal for social media
        fonts: [{
            name: 'Noto Sans SC',
            data: font,
            weight: 400,
            style: 'normal',
        }],
    });
    
    return sharp(Buffer.from(svg)).png({ quality: 90 }).toBuffer();
}


// --- CORE LOGIC: UPLOAD IMAGE TO SUPABASE ---
export async function uploadImageToSupabase(imageBuffer: Buffer): Promise<string> {
    const fileName = `generated-images/product-image-${Date.now()}.png`;
    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
        .from(STORAGE_BUCKET_NAME)
        .upload(fileName, imageBuffer, {
            contentType: 'image/png',
            cacheControl: '3600',
            upsert: false,
        });

    if (uploadError) {
        console.error('Supabase Storage upload error:', uploadError);
        throw new Error(`Failed to upload image to Supabase Storage. Details: ${uploadError.message}`);
    }

    const { data: publicUrlData } = supabaseAdmin.storage
        .from(STORAGE_BUCKET_NAME)
        .getPublicUrl(uploadData.path);

    if (!publicUrlData || !publicUrlData.publicUrl) {
        throw new Error('Could not retrieve public URL for the uploaded image.');
    }

    return publicUrlData.publicUrl;
}
