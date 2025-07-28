import { type NextRequest, NextResponse } from 'next/server';

// This file will contain the server-side logic for translation.
// It's a secure way to handle API keys and external API calls.

const geminiApiKey = "AIzaSyDmfaMC3pHdY6BYCvL_1pWZF5NLLkh28QU";
const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite-preview-06-17:generateContent?key=${geminiApiKey}`;

const DEFAULT_TRANSLATION_PROMPT_TEMPLATE = `Translate the following text into {{targetLanguage}}.
IMPORTANT: Respond with only the translated text, without any additional comments, formatting, or explanations.

Text to translate:
---
{{text}}
---`;

export async function POST(request: NextRequest) {
    try {
        const { text, targetLanguage, promptTemplate } = await request.json();

        if (!text || !targetLanguage) {
            return NextResponse.json({ error: 'Missing required parameters: text and targetLanguage' }, { status: 400 });
        }

        const finalPrompt = (promptTemplate || DEFAULT_TRANSLATION_PROMPT_TEMPLATE)
            .replace('{{text}}', text)
            .replace('{{targetLanguage}}', targetLanguage);

        const response = await fetch(geminiApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: finalPrompt }] }] }),
        });

        if (!response.ok) {
            const errorBody = await response.json();
            console.error('Gemini API Error:', errorBody);
            throw new Error(`API request failed with status ${response.status}: ${errorBody.error?.message || 'Unknown error'}`);
        }

        const data = await response.json();
        const translatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!translatedText) {
            throw new Error("Failed to extract translated text from Gemini API response.");
        }

        return NextResponse.json({ translatedText: translatedText.trim() });

    } catch (error) {
        console.error('Translate API endpoint failed:', error);
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred during translation.';
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
} 