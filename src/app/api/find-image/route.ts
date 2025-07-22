import { NextResponse } from 'next/server';

// IMPORTANT: You must get a free API key from https://www.pexels.com/api/
// and add it to your .env.local file as PEXELS_API_KEY
// const pexelsApiKey = process.env.PEXELS_API_KEY;
const pexelsApiKey = 'MrYegzS3s0enFskk1VFYcfdt4H1B0pD2gAwI0sqOVSHSOYvBO9Gvzyfe';

export async function POST(request: Request) {
    if (!pexelsApiKey) {
        console.error("Pexels API key is not configured.");
        return NextResponse.json({ error: "Server is not configured for image search. Missing API key." }, { status: 500 });
    }

    try {
        const { keyword } = await request.json();

        if (!keyword || typeof keyword !== 'string') {
            return NextResponse.json({ error: "A valid 'keyword' is required." }, { status: 400 });
        }

        console.log(`Searching Pexels for keyword: "${keyword}"`);

        // Search Pexels API
        const pexelsUrl = `https://api.pexels.com/v1/search?query=${encodeURIComponent(keyword)}&per_page=1`;
        const pexelsResponse = await fetch(pexelsUrl, {
            headers: {
                'Authorization': pexelsApiKey
            }
        });

        if (!pexelsResponse.ok) {
            const errorText = await pexelsResponse.text();
            console.error(`Pexels API error: ${pexelsResponse.status}`, errorText);
            throw new Error(`Failed to fetch from image provider. Status: ${pexelsResponse.status}`);
        }

        const pexelsData = await pexelsResponse.json();

        if (!pexelsData.photos || pexelsData.photos.length === 0) {
            return NextResponse.json({ error: `No images found for keyword: "${keyword}"` }, { status: 404 });
        }

        // Return the URL of the first image found
        // We use 'original' for high quality, but you can use 'large2x', 'large', 'medium', etc.
        const imageUrl = pexelsData.photos[0].src.original;

        return NextResponse.json({ imageUrl });

    } catch (error) {
        console.error("Error in find-image API:", error);
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
} 