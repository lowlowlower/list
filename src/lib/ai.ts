const GEMINI_API_KEY = "AIzaSyApuy_ax9jhGXpUdlgI6w_0H5aZ7XiY9vU";
const DEEPSEEK_API_KEY = 'sk-78a9fd015e054281a3eb0a0712d5e6d0';

const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`;
const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';

const DEFAULT_TRANSLATION_PROMPT_TEMPLATE = `Translate the following text into {{targetLanguage}}.
IMPORTANT: Respond with only the translated text, without any additional comments, formatting, or explanations.

Text to translate:
---
{{text}}
---`;

/**
 * Translates a given text using a primary API (Gemini) and a fallback API (DeepSeek).
 * Allows for a custom prompt template.
 * @param text The text to translate.
 * @param targetLanguage The target language (e.g., "Chinese", "English").
 * @param promptTemplate A custom prompt template with {{text}} and {{targetLanguage}} placeholders.
 * @returns A promise that resolves to the translated text.
 */
export const translateText = async (
    text: string, 
    targetLanguage: string = 'English',
    promptTemplate: string = DEFAULT_TRANSLATION_PROMPT_TEMPLATE
): Promise<string> => {

    const prompt = promptTemplate
        .replace('{{text}}', text)
        .replace('{{targetLanguage}}', targetLanguage);

    // 1. Try Gemini First
    try {
        console.log("Attempting translation with Gemini...");
        const response = await fetch(GEMINI_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        });

        if (!response.ok) {
            const errorBody = await response.json();
            throw new Error(`API request failed with status ${response.status}: ${errorBody.error?.message || 'Unknown error'}`);
        }

        const data = await response.json();
        const translatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!translatedText) {
            throw new Error("Failed to extract translated text from Gemini API response.");
        }
        console.log("Translation successful with Gemini.");
        return translatedText.trim();

    } catch (geminiError) {
        console.warn(`Gemini translation failed: ${geminiError instanceof Error ? geminiError.message : String(geminiError)}`);
        console.log("Falling back to DeepSeek for translation...");

        // 2. Fallback to DeepSeek
        try {
            const response = await fetch(DEEPSEEK_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
                },
                body: JSON.stringify({
                    model: "deepseek-chat",
                    messages: [{ role: "user", content: prompt }]
                })
            });
             if (!response.ok) {
                const errorBody = await response.json();
                throw new Error(`API request failed with status ${response.status}: ${errorBody.error?.message || 'Unknown error'}`);
            }
            const data = await response.json();
            const translatedText = data.choices?.[0]?.message?.content;

            if (!translatedText) {
                throw new Error("Failed to extract translated text from DeepSeek API response.");
            }
             console.log("Translation successful with DeepSeek.");
            return translatedText.trim();

        } catch (deepseekError) {
            console.error(`DeepSeek translation also failed: ${deepseekError instanceof Error ? deepseekError.message : String(deepseekError)}`);
            throw new Error(`Both translation APIs failed. Last error: ${deepseekError instanceof Error ? deepseekError.message : 'Unknown DeepSeek error'}`);
        }
    }
}; 