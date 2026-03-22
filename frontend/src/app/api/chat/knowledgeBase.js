/**
 * AgniShakti Knowledge Base
 * Pre-written responses for all platform features
 * Organized by category for easy maintenance
 */

export const KNOWLEDGE_BASE = {
    // PROPERTY REGISTRATION
    property_registration: {
        title: "Property Registration",
        response: `To register your property on AgniShakti:

1. **Click "Add Property"** on your dashboard
2. **Enter Property Address** (e.g., "123 Main Street, City")
3. **Select Location on Map** - GPS will auto-detect your location, or you can manually select on the interactive map
4. **Set Monitor Password** - A secure password for camera access
5. **Click "Add Property"**

✅ **Automatic Fire Station Assignment:** The system automatically assigns the nearest fire station to your property based on GPS coordinates.

Your property will be ready for camera setup immediately!`
    },

    camera_setup: {
        title: "Camera Setup & Monitoring",
        response: `To add cameras to your property:

1. **Select a Property** from your dashboard
2. **Click "Add Camera"**
3. **Enter Camera Name** (e.g., "Living Room Camera")
4. **Provide Stream URL** - Your camera's RTSP/HTTP stream URL
5. **Click "Add Camera"**

📹 **Monitoring Features:**
- **Real-time AI Detection:** YOLO AI analyzes video at 2 FPS
- **Gemini Verification:** Every detection is verified by Gemini AI to prevent false alarms
- **Live Feed:** View camera feed directly in dashboard
- **Start/Stop Monitoring:** Control monitoring anytime

🔒 **Security:** All camera streams are encrypted and only accessible with your monitor password.`
    },

    alert_system: {
        title: "Fire Alert System",
        response: `AgniShakti's intelligent alert system works in 3 stages:

**Stage 1: Detection (YOLO AI)**
- Analyzes camera feed at 2 FPS
- Detects fire and smoke with 75%+ confidence
- Captures image snapshot

**Stage 2: Verification (Gemini AI)**
- Verifies if it's a real fire emergency
- Distinguishes from false alarms (sunlight, fog, vehicle lights)
- Takes ~30 seconds

**Stage 3: Alert Dispatch**
- ✅ **Real Fire:** Sends alerts to you AND nearest fire station
- ❌ **False Alarm:** Auto-resets after 15 minutes
- 🔒 **User Lockout:** If Gemini confirms real fire, you cannot cancel for 15 minutes (safety feature)

📧 **Notifications Include:**
- Fire image with timestamp
- GPS location with Google Maps link
- Live image updates every 20 seconds
- Estimated response time from fire station`
    },

    gps_location: {
        title: "GPS Location & Auto-Assignment",
        response: `AgniShakti uses GPS for intelligent emergency routing:

**Property Registration:**
- Click "Select Location on Map"
- GPS auto-detects your current location
- Or manually select on interactive Google Maps
- Coordinates saved automatically

**Fire Station Assignment:**
- System calculates distance to all registered fire stations
- Automatically assigns nearest station
- Updates in real-time if stations change

**Emergency Dispatch:**
- Alerts go to nearest ACTIVE responder
- Based on live GPS location tracking
- Includes navigation link and ETA
- Continuous location updates every 10 seconds

🎯 **Accuracy:** Uses Haversine formula for precise distance calculation, ensuring fastest emergency response.`
    },

    security_features: {
        title: "Security & Privacy",
        response: `AgniShakti prioritizes your security:

🔒 **Data Protection:**
- All camera streams are encrypted
- Monitor passwords required for access
- API keys never exposed to frontend
- Firebase security rules enforce access control

🛡️ **Alert Security:**
- 15-minute user lockout for confirmed fires (prevents accidental cancellation)
- Gemini AI verification prevents false alarms
- Spam prevention (15-min cooldown between alerts)
- Only verified alerts sent to responders

🔐 **Authentication:**
- Firebase Authentication for all users
- Role-based access (Owner/Responder)
- Secure session management
- Password-protected camera access

📊 **Privacy:**
- Camera feeds not stored permanently
- Alert images saved for 24 hours only
- No data sharing with third parties
- GDPR compliant data handling`
    },

    gemini_verification: {
        title: "Gemini AI Verification",
        response: `Gemini AI is our second line of defense against false alarms:

**How It Works:**
1. YOLO detects potential fire/smoke
2. Image sent to Gemini AI for verification
3. Gemini analyzes using strict criteria:
   - ✅ Real Fire: Visible flames, thick smoke, active burning
   - ❌ False Alarm: Sunlight, fog, vehicle lights, camera noise

**Verification Criteria:**
- Visible orange/red/yellow flames
- Thick or spreading smoke
- Heat distortion patterns
- Fire glow or ignition source

**False Alarm Detection:**
- Sunlight reflections
- Vehicle headlights
- Fog or steam
- Light cooking smoke
- Camera artifacts

**Safety-First Default:**
- If Gemini verification fails → Assumes REAL FIRE
- Multiple API key fallback for reliability
- 3 different models tried automatically

⏱️ **Speed:** Verification completes in ~30 seconds`
    },

    responder_system: {
        title: "Fire Responder System",
        response: `AgniShakti connects properties with fire stations:

**For Fire Stations:**
- Register with station details and GPS location
- Receive real-time fire alerts in coverage area
- Get navigation links and live images
- Track multiple properties simultaneously

**For Property Owners:**
- Nearest station auto-assigned during registration
- Alerts dispatched to active responders only
- Responder location tracked every 10 seconds
- Backup stations available if primary unavailable

**Smart Dispatch:**
- Finds nearest ACTIVE responder (GPS-based)
- Calculates distance using Haversine formula
- Provides ETA and navigation
- Sends continuous image updates (every 20 seconds)

**Responder Dashboard:**
- View all assigned properties
- Receive instant fire alerts
- Access live camera feeds
- Track alert history`
    },

    cooldown_system: {
        title: "Alert Cooldown & Spam Prevention",
        response: `AgniShakti prevents alert spam with intelligent cooldown:

**15-Minute Cooldown:**
- After an alert is sent, no new alerts for 15 minutes
- Prevents repeated notifications for same fire
- Applies per camera/property

**How It Works:**
1. Fire detected → Alert sent
2. Status: NOTIFIED_COOLDOWN
3. New detections ignored for 15 minutes
4. After 15 min → Ready for new alerts

**User Lockout (Safety Feature):**
- If Gemini confirms REAL FIRE
- User cannot cancel alert for 15 minutes
- Prevents accidental dismissal during emergency
- Ensures responders are notified

**Auto-Reset:**
- False alarms auto-reset after 15 minutes
- No manual intervention needed
- System cleans up old alerts automatically

🎯 **Benefit:** Reduces notification fatigue while ensuring real emergencies are never missed.`
    },

    ai_technology: {
        title: "AI Technology Stack",
        response: `AgniShakti uses cutting-edge AI:

**YOLO (You Only Look Once):**
- Real-time object detection
- Analyzes video at 2 FPS
- Detects fire and smoke
- 75%+ confidence threshold
- Runs on local Python server

**Gemini AI:**
- Google's latest AI model
- Verifies fire detections
- Multi-model fallback (3 models)
- Multi-API-key rotation
- Strict verification criteria

**Technology Stack:**
- Frontend: Next.js + React
- Backend: Node.js + Firebase
- AI Service: Python + FastAPI
- Database: Firestore
- Authentication: Firebase Auth
- Maps: Google Maps API

**Performance:**
- 2 FPS video analysis
- ~30 second verification time
- Real-time alert dispatch
- 99.9% uptime target

🚀 **No Additional Hardware:** Works with existing CCTV cameras!`
    },

    pricing_deployment: {
        title: "Pricing & Deployment",
        response: `AgniShakti is designed to be affordable and scalable:

**Cost Advantages:**
- ✅ No additional hardware required
- ✅ Uses existing CCTV cameras
- ✅ Cloud-based (no on-premise servers)
- ✅ Pay-as-you-grow model

**Deployment:**
- Quick setup (< 30 minutes)
- Works with any IP camera
- Supports RTSP/HTTP streams
- Remote monitoring from anywhere

**Ideal For:**
- 🏢 Office Buildings
- 🏘️ Residential Societies
- 🏭 Industrial Facilities
- 🏪 Retail Stores
- 🏫 Educational Institutions
- 🏥 Healthcare Facilities

**Scalability:**
- Add unlimited properties
- Monitor multiple cameras per property
- Centralized dashboard
- Multi-user access

For detailed pricing, please contact: frostyanand@gmail.com`
    },

    troubleshooting: {
        title: "Common Issues & Solutions",
        response: `Quick fixes for common issues:

**Camera Not Connecting:**
- Verify stream URL is correct
- Check camera is online
- Ensure monitor password is correct
- Try stopping and restarting monitoring

**Alerts Not Received:**
- Check email spam folder
- Verify property has assigned fire station
- Ensure camera monitoring is active
- Check alert cooldown status

**GPS Location Issues:**
- Allow browser location permission
- Use "Re-detect" button for fresh GPS
- Manually adjust pin on map if needed
- Ensure Google Maps API key is configured

**False Alarms:**
- Gemini AI filters most false alarms
- Adjust camera angle to avoid sunlight
- Ensure good lighting conditions
- Check camera lens is clean

**Need Help?**
Contact AgniShakti support: frostyanand@gmail.com`
    },

    features_overview: {
        title: "AgniShakti Features Overview",
        response: `Complete feature list:

🔥 **Fire Detection:**
- Real-time YOLO AI detection
- Gemini AI verification
- 2 FPS video analysis
- Image snapshot capture

📍 **Smart Location:**
- GPS auto-detection
- Interactive map selection
- Automatic fire station assignment
- Distance-based routing

🚨 **Alert System:**
- Instant email notifications
- Live image updates (20s intervals)
- Google Maps navigation
- 15-minute safety lockout

📹 **Camera Management:**
- Multiple cameras per property
- Live feed viewing
- Start/stop monitoring
- Stream URL configuration

🏢 **Property Management:**
- Unlimited properties
- Address management
- GPS coordinates
- Fire station assignment

🚒 **Responder Integration:**
- Real-time dispatch
- Live location tracking
- Navigation links
- Alert history

🤖 **AI Assistant:**
- 24/7 chat support
- Feature guidance
- Troubleshooting help
- Multi-language support

Type "help [feature]" for detailed information on any feature!`
    }
};

// Intent keywords for classification
export const INTENT_KEYWORDS = {
    property_registration: ['register', 'add property', 'new property', 'setup property', 'create property', 'property registration'],
    camera_setup: ['camera', 'add camera', 'setup camera', 'stream url', 'rtsp', 'monitoring', 'video feed'],
    alert_system: ['alert', 'notification', 'fire alert', 'emergency', 'warning', 'email alert'],
    gps_location: ['gps', 'location', 'map', 'coordinates', 'latitude', 'longitude', 'auto-detect'],
    security_features: ['security', 'privacy', 'encryption', 'password', 'safe', 'protect', 'secure'],
    gemini_verification: ['gemini', 'ai verification', 'false alarm', 'verification', 'ai check'],
    responder_system: ['fire station', 'responder', 'fire department', 'emergency services', 'dispatch'],
    cooldown_system: ['cooldown', 'spam', 'repeated alerts', '15 minutes', 'lockout', 'cannot cancel'],
    ai_technology: ['ai', 'yolo', 'technology', 'how it works', 'machine learning', 'detection'],
    pricing_deployment: ['price', 'cost', 'pricing', 'deployment', 'install', 'setup cost'],
    troubleshooting: ['problem', 'issue', 'not working', 'error', 'fix', 'help', 'trouble'],
    features_overview: ['features', 'what can', 'capabilities', 'overview', 'all features']
};
