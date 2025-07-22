import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import satori from 'satori';
import { html } from 'satori-html';
import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';

// It's recommended to move these to environment variables for better security.
const supabaseUrl = 'https://urfibhtfqgffpanpsjds.supabase.co';
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVyZmliaHRmcWdmZnBhbnBzamRzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzU3ODU2NDUsImV4cCI6MjA1MTM2MTY0NX0.Q1WPGBj23uSL3RKhYxGhs7Si1_HfrvC9P-JxkXl6eVE";
createClient(supabaseUrl, supabaseKey);


/**
 * Creates the VDOM (Virtual DOM) structure that Satori will render into an SVG.
 * This function defines the appearance of your generated image.
 */
function createVNodeForImage(text: string) {
    // Satori uses a JSX-like structure, which we create using satori-html.
    // This allows us to use familiar HTML tags.
    const template = html(`
        <div style="display: flex; height: 100%; width: 100%; align-items: center; justify-content: center; background-image: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%); font-family: 'Noto Sans SC'; padding: 60px; text-align: center; color: #333; line-height: 1.8; font-size: 48px; white-space: pre-wrap; word-wrap: break-word;">
            ${text}
        </div>
    `);
    // We explicitly cast the result to `React.ReactNode` to satisfy Satori's type requirements.
    return template as React.ReactNode;
}

/**
 * Fetches the font needed to render Chinese characters.
 * Satori requires font data to be provided explicitly.
 */
async function getFontData() {
    // We now read the font from the local filesystem instead of fetching it.
    // This makes the process faster and more reliable.
    const fontPath = path.join(process.cwd(), 'src', 'lib', 'fonts', 'NotoSansSC-Regular.woff');
    try {
        const fontData = await fs.readFile(fontPath);
        return fontData;
    } catch (error) {
        console.error("Error reading local font file:", error);
        throw new Error('Failed to load local font data for image generation. Ensure the font file exists at src/lib/fonts/NotoSansSC-Regular.woff');
    }
}

/**
 * This is the API endpoint that handles the POST request to generate an image.
 */
export async function POST(request: Request) {
    try {
        const { text } = await request.json();
        if (!text || typeof text !== 'string') {
            return NextResponse.json({ error: 'Text is required' }, { status: 400 });
        }

        // 1. Get the font data
        const fontData = await getFontData();

        // 2. Create the VNode structure for Satori
        const vnode = createVNodeForImage(text);

        // 3. Use Satori to convert the VNode into an SVG
        const svg = await satori(vnode, {
            width: 1080,
            height: 1080,
            fonts: [{
                name: 'Noto Sans SC',
                data: fontData,
                weight: 400,
                style: 'normal',
            }],
        });

        // 4. Use Sharp to convert the SVG into a PNG image buffer
        const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();

        // --- TEMPORARY DEBUGGING STEP ---
        // To verify local image generation, we will return the image as a
        // Base64 data URL directly, skipping the Supabase upload for now.
        const dataUrl = `data:image/png;base64,${pngBuffer.toString('base64')}`;
        return NextResponse.json({ imageUrl: dataUrl });

    } catch (error) {
        console.error('Image generation endpoint failed:', error);
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred during image generation.';
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
} 