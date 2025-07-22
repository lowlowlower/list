import { NextResponse } from 'next/server';

// Switched from Pexels to Unsplash for better quality results.
// IMPORTANT: You must get a free API key from https://unsplash.com/developers
// and add it to your .env.local file as UNSPLASH_ACCESS_KEY
const unsplashAccessKey = "0PUf5DkJExDMuGAJGCWMFoUKCicjA6bEQsSHf7zFWro";

export async function POST(request: Request) {
    if (!unsplashAccessKey) {
        console.error("Unsplash Access Key is not configured.");
        return NextResponse.json({ error: "Server is not configured for image search. Missing API key." }, { status: 500 });
    }

    try {
        const { keyword } = await request.json();

        if (!keyword || typeof keyword !== 'string') {
            return NextResponse.json({ error: "A valid 'keyword' is required." }, { status: 400 });
        }

        console.log(`Searching Unsplash for keyword: "${keyword}"`);

        // Search Unsplash API
        const unsplashUrl = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(keyword)}&per_page=1&orientation=landscape`;
        const unsplashResponse = await fetch(unsplashUrl, {
            headers: {
                'Authorization': `Client-ID ${unsplashAccessKey}`
            }
        });

        if (!unsplashResponse.ok) {
            const errorText = await unsplashResponse.text();
            console.error(`Unsplash API error: ${unsplashResponse.status}`, errorText);
            throw new Error(`Failed to fetch from image provider (Unsplash). Status: ${unsplashResponse.status}`);
        }

        const unsplashData = await unsplashResponse.json();

        if (!unsplashData.results || unsplashData.results.length === 0) {
            return NextResponse.json({ error: `No images found on Unsplash for keyword: "${keyword}"` }, { status: 404 });
        }

        // Return the URL of the first image found. 'regular' is a good balance of size and quality.
        const imageUrl = unsplashData.results[0].urls.regular;

        return NextResponse.json({ imageUrl });

    } catch (error) {
        console.error("Error in find-image API:", error);
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
} 