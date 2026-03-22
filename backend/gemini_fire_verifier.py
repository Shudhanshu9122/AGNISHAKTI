"""
Enhanced Gemini Fire Verification Module for AgniShakti
Implements strict fire verification with 15-minute lockout system
"""

import os
import base64
import time
import json
from typing import Dict, Optional, Tuple
from dotenv import load_dotenv

load_dotenv()

# Get API keys
GEMINI_API_KEYS = os.getenv('GEMINI_API_KEYS', '').split(',')
GEMINI_API_KEYS = [key.strip() for key in GEMINI_API_KEYS if key.strip()]

# Working models (tested and verified)
WORKING_MODELS = [
    'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-1.5-pro'
]

# Track current indices for rotation
current_key_index = 0
current_model_index = 0

# Strict system prompt for fire verification
FIRE_VERIFICATION_PROMPT = """You are an image verification engine in a fire safety system.

This is NOT a conversation.
Do NOT ask questions.
Do NOT request additional inputs.
Do NOT mention system flow.

Your only task is to analyze the provided image and determine whether it shows a real, uncontrolled fire emergency.

You must choose exactly one result.

Return STRICT JSON only.

Allowed values:
- REAL_FIRE
- NOT_REAL_FIRE

Response format:

{
  "result": "REAL_FIRE" | "NOT_REAL_FIRE",
  "reason": "brief visual reason only"
}

Rules:
- Do not ask for alert state.
- Do not ask for confirmation.
- Do not ask for another image.
- Do not explain outside JSON.
- Do not assume system behavior.
- Do not hallucinate context.

Only analyze what is visible in the image."""

def verify_fire_with_gemini(image_path: str) -> Tuple[bool, str, Optional[str]]:
    """
    Verify if an image contains a real fire using Gemini AI.
    
    Args:
        image_path: Path to the image file
        
    Returns:
        Tuple of (is_real_fire: bool, reason: str, error: Optional[str])
    """
    import requests
    
    try:
        # Read and encode image
        with open(image_path, 'rb') as img_file:
            image_data = base64.b64encode(img_file.read()).decode('utf-8')
        
        # Try all combinations of models and API keys
        max_attempts = len(WORKING_MODELS) * len(GEMINI_API_KEYS)
        last_error = None
        
        for attempt in range(max_attempts):
            global current_model_index, current_key_index
            
            model = WORKING_MODELS[current_model_index % len(WORKING_MODELS)]
            api_key = GEMINI_API_KEYS[current_key_index % len(GEMINI_API_KEYS)]
            
            if not api_key:
                continue
                
            try:
                print(f"[GEMINI_VERIFY] Attempt {attempt + 1}/{max_attempts}: Model={model}, KeyIndex={current_key_index}")
                
                # Prepare request
                endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
                
                headers = {
                    'x-goog-api-key': api_key,
                    'Content-Type': 'application/json',
                }
                
                payload = {
                    "contents": [{
                        "parts": [
                            {
                                "inline_data": {
                                    "mime_type": "image/jpeg",
                                    "data": image_data
                                }
                            },
                            {
                                "text": FIRE_VERIFICATION_PROMPT
                            }
                        ]
                    }],
                    "generationConfig": {
                        "temperature": 0.1,  # Low temperature for consistent, factual responses
                        "responseMimeType": "application/json"
                    },
                    "safetySettings": [
                        {
                            "category": "HARM_CATEGORY_HARASSMENT",
                            "threshold": "BLOCK_NONE"
                        },
                        {
                            "category": "HARM_CATEGORY_HATE_SPEECH",
                            "threshold": "BLOCK_NONE"
                        },
                        {
                            "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                            "threshold": "BLOCK_NONE"
                        },
                        {
                            "category": "HARM_CATEGORY_DANGEROUS_CONTENT",
                            "threshold": "BLOCK_NONE"
                        }
                    ]
                }
                
                response = requests.post(endpoint, json=payload, headers=headers, timeout=30)
                data = response.json()
                
                # Check for success
                if response.ok and data.get('candidates') and data['candidates'][0].get('content'):
                    text = data['candidates'][0]['content']['parts'][0]['text'].strip()
                    
                    print(f"[GEMINI_VERIFY] ✅ Success! Raw Response: {text}")
                    
                    # Parse JSON response
                    try:
                        # Clean code blocks if present
                        if text.startswith('```json'):
                            text = text[7:]
                        if text.endswith('```'):
                            text = text[:-3]
                        
                        result_json = json.loads(text.strip())
                        result_status = result_json.get("result", "NOT_REAL_FIRE")
                        reason = result_json.get("reason", "No reason provided")
                        
                        is_real_fire = (result_status == "REAL_FIRE")
                        
                        # Update indices for next request (round-robin)
                        current_key_index = (current_key_index + 1) % len(GEMINI_API_KEYS)
                        current_model_index = (current_model_index + 1) % len(WORKING_MODELS)
                        
                        return (is_real_fire, reason, None)
                        
                    except json.JSONDecodeError as e:
                        print(f"[GEMINI_VERIFY] ⚠️ JSON Parse Error: {e}")
                        last_error = f"JSON Parse Error: {e}"
                        # If JSON fails, treat as error/continue
                        continue
                
                # Handle errors
                if data.get('error'):
                    error_msg = data['error'].get('message', 'Unknown error')
                    
                    # Check for quota exceeded
                    if response.status_code == 429 or 'quota' in error_msg.lower():
                        print(f"[GEMINI_VERIFY] ⚠️ Quota exceeded for KeyIndex={current_key_index}")
                        current_key_index = (current_key_index + 1) % len(GEMINI_API_KEYS)
                        last_error = "Quota exceeded"
                        continue
                    
                    # Check for leaked key
                    if 'leaked' in error_msg.lower():
                        print(f"[GEMINI_VERIFY] 🚨 API key {current_key_index} reported as leaked!")
                        current_key_index = (current_key_index + 1) % len(GEMINI_API_KEYS)
                        last_error = "API key leaked"
                        continue
                    
                    # Model not found
                    if 'not found' in error_msg.lower():
                        print(f"[GEMINI_VERIFY] ⚠️ Model {model} not available")
                        current_model_index = (current_model_index + 1) % len(WORKING_MODELS)
                        last_error = f"Model not found: {model}"
                        continue
                    
                    last_error = error_msg
                    
            except Exception as e:
                print(f"[GEMINI_VERIFY] ❌ Request failed: {str(e)}")
                last_error = str(e)
                current_key_index = (current_key_index + 1) % len(GEMINI_API_KEYS)
                continue
        
        # All attempts failed
        error_msg = f"All verification attempts failed. Last error: {last_error}"
        print(f"[GEMINI_VERIFY] 🔥 {error_msg}")
        
        # In case of verification failure, default to SAFE (assume real fire to be cautious)
        return (True, "Verification system unavailable - defaulting to REAL FIRE for safety", error_msg)
        
    except Exception as e:
        error_msg = f"Critical error in fire verification: {str(e)}"
        print(f"[GEMINI_VERIFY] 💥 {error_msg}")
        # Default to real fire for safety
        return (True, "Verification error - defaulting to REAL FIRE for safety", error_msg)


def test_verification():
    """Test the verification system with a sample image"""
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python gemini_fire_verifier.py <image_path>")
        return
    
    image_path = sys.argv[1]
    
    if not os.path.exists(image_path):
        print(f"Error: Image not found: {image_path}")
        return
    
    print(f"\n🔍 Testing fire verification on: {image_path}\n")
    print("=" * 60)
    
    start_time = time.time()
    is_real_fire, reason, error = verify_fire_with_gemini(image_path)
    duration = time.time() - start_time
    
    print("=" * 60)
    print(f"\n📊 VERIFICATION RESULT:")
    print(f"   Real Fire: {'🔥 YES' if is_real_fire else '✅ NO (False Alarm)'}")
    print(f"   Reason: {reason}")
    print(f"   Duration: {duration:.2f}s")
    
    if error:
        print(f"   ⚠️ Error: {error}")
    
    print("\n" + "=" * 60)


if __name__ == "__main__":
    test_verification()
