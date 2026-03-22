import { NextResponse } from 'next/server';
import { KNOWLEDGE_BASE, INTENT_KEYWORDS } from './knowledgeBase';

// Get API keys from environment
const ALL_API_KEYS = process.env.GEMINI_API_KEYS?.split(',').map(k => k.trim()).filter(k => k && k !== 'YOUR_NEW_KEY_1' && k !== 'YOUR_NEW_KEY_2') || [];

// Working models
const WORKING_MODELS = [
    'gemini-3-flash-preview',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
];

// Compact system prompt for intent classification
const INTENT_CLASSIFIER_PROMPT = `You are an intent classifier for AgniShakti (AI fire safety system).

Analyze the user's question and respond with ONLY ONE of these intent codes:

INTENT_CODES:
- property_registration: Questions about registering/adding properties
- camera_setup: Questions about adding/configuring cameras
- alert_system: Questions about fire alerts/notifications
- gps_location: Questions about GPS/location/maps
- security_features: Questions about security/privacy/passwords
- gemini_verification: Questions about AI verification/false alarms
- responder_system: Questions about fire stations/responders
- cooldown_system: Questions about alert cooldown/spam prevention
- ai_technology: Questions about AI/YOLO/technology
- pricing_deployment: Questions about pricing/cost/deployment
- troubleshooting: Questions about problems/errors/issues
- features_overview: Questions about features/capabilities
- general_chat: Greetings, thanks, or general conversation

RULES:
1. Respond with ONLY the intent code (e.g., "camera_setup")
2. If multiple intents match, choose the most specific one
3. For greetings/thanks, use "general_chat"
4. For unclear questions, use "features_overview"

Example:
User: "How do I add a camera?"
Response: camera_setup

User: "What is AgniShakti?"
Response: features_overview`;

// Track current indices for round-robin
let currentKeyIndex = 0;
let currentModelIndex = 0;

// Function to detect intent locally (fast, no API call)
function detectIntentLocally(userMessage) {
    const messageLower = userMessage.toLowerCase();

    // Check for greetings
    const greetings = ['hi', 'hello', 'hey', 'good morning', 'good evening', 'thanks', 'thank you'];
    if (greetings.some(g => messageLower === g || messageLower.startsWith(g + ' '))) {
        return 'general_chat';
    }

    // Check keywords for each intent
    let bestMatch = null;
    let maxMatches = 0;

    for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
        const matches = keywords.filter(keyword => messageLower.includes(keyword.toLowerCase())).length;
        if (matches > maxMatches) {
            maxMatches = matches;
            bestMatch = intent;
        }
    }

    // If we found a good match (2+ keywords), use it
    if (maxMatches >= 2) {
        return bestMatch;
    }

    // If we found any match, use it
    if (bestMatch) {
        return bestMatch;
    }

    // Default to features overview for unclear questions
    return null; // Will use Gemini for classification
}

// Function to call Gemini for intent classification
async function classifyIntentWithGemini(userMessage) {
    const maxAttempts = Math.min(3, WORKING_MODELS.length * ALL_API_KEYS.length); // Limit to 3 attempts for speed
    let attempt = 0;

    for (let i = 0; i < maxAttempts; i++) {
        const modelIdx = (currentModelIndex + i) % WORKING_MODELS.length;
        const keyIdx = (currentKeyIndex + i) % ALL_API_KEYS.length;
        const model = WORKING_MODELS[modelIdx];
        const apiKey = ALL_API_KEYS[keyIdx];

        if (!apiKey) continue;

        try {
            attempt++;
            console.log(`[INTENT_CLASSIFIER] Attempt ${attempt}: Model="${model}"`);

            const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'x-goog-api-key': apiKey,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [
                        {
                            role: 'user',
                            parts: [{ text: INTENT_CLASSIFIER_PROMPT }]
                        },
                        {
                            role: 'model',
                            parts: [{ text: 'Understood. I will classify user questions into intent codes.' }]
                        },
                        {
                            role: 'user',
                            parts: [{ text: `User question: "${userMessage}"\n\nIntent code:` }]
                        }
                    ],
                    generationConfig: {
                        temperature: 0.1, // Low temperature for consistent classification
                        maxOutputTokens: 50,
                    },
                }),
            });

            const data = await response.json();

            if (response.ok && data.candidates?.[0]?.content?.parts?.[0]?.text) {
                const intent = data.candidates[0].content.parts[0].text.trim().toLowerCase();
                console.log(`[INTENT_CLASSIFIER] ✅ Classified as: ${intent}`);

                // Update indices
                currentKeyIndex = keyIdx;
                currentModelIndex = modelIdx;

                return intent;
            }

            // Handle errors
            if (data.error) {
                console.warn(`[INTENT_CLASSIFIER] Error: ${data.error.message}`);
                continue;
            }

        } catch (error) {
            console.error(`[INTENT_CLASSIFIER] Request failed:`, error.message);
            continue;
        }
    }

    // Fallback to features overview
    console.warn('[INTENT_CLASSIFIER] All attempts failed, using features_overview');
    return 'features_overview';
}

// Function to generate personalized response
function generateResponse(intent, userMessage) {
    // Handle general chat
    if (intent === 'general_chat') {
        const messageLower = userMessage.toLowerCase();
        if (messageLower.includes('hi') || messageLower.includes('hello') || messageLower.includes('hey')) {
            return `Hello! 👋 I'm AgniShakti Assistant, here to help you with our AI-powered fire safety system.

I can help you with:
• Property registration
• Camera setup
• Alert system
• GPS location features
• Security & privacy
• And much more!

What would you like to know about?`;
        }
        if (messageLower.includes('thank') || messageLower.includes('thanks')) {
            return `You're welcome! 😊 If you have any more questions about AgniShakti, feel free to ask. Stay safe! 🔥`;
        }
        return `I'm here to help! Ask me anything about AgniShakti's fire safety features.`;
    }

    // Get knowledge base response
    const knowledge = KNOWLEDGE_BASE[intent];

    if (knowledge) {
        return `**${knowledge.title}**\n\n${knowledge.response}`;
    }

    // Fallback
    return KNOWLEDGE_BASE.features_overview.response;
}

export async function POST(request) {
    try {
        const { messages } = await request.json();

        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return NextResponse.json(
                { error: 'Messages array is required' },
                { status: 400 }
            );
        }

        // Get last user message
        const lastMessage = messages[messages.length - 1];
        const userMessage = lastMessage.content;

        console.log(`[CHAT_API] User question: "${userMessage}"`);

        // Step 1: Try local intent detection (fast)
        let intent = detectIntentLocally(userMessage);

        // Step 2: If no local match, use Gemini classification
        if (!intent) {
            intent = await classifyIntentWithGemini(userMessage);
        } else {
            console.log(`[CHAT_API] ✅ Local detection: ${intent}`);
        }

        // Step 3: Generate response from knowledge base
        const responseText = generateResponse(intent, userMessage);

        console.log(`[CHAT_API] ✅ Response generated for intent: ${intent}`);

        return NextResponse.json({
            success: true,
            message: responseText,
            intent: intent, // Include intent for debugging
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('[CHAT_API] Error:', error.message);

        return NextResponse.json({
            success: false,
            error: error.message,
            fallbackMessage: `I apologize for the technical difficulty. Here's what AgniShakti offers:

${KNOWLEDGE_BASE.features_overview.response}

For specific questions, please contact: frostyanand@gmail.com`
        }, { status: 500 });
    }
}
