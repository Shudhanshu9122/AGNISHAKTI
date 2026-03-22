import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Toaster, toast } from 'react-hot-toast';
import AgniShaktiChat from './AgniShaktiChat';
import LocationPicker from './LocationPicker';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import {
  Shield,
  Eye,
  Zap,
  Bell,
  Camera,
  Users,
  X,
  MapPin,
  Phone,
  Building,
  Lock,
  Mail,
  User,
  Play,
  Pause,
  SkipForward,
  Volume2,
  VolumeX,
  Plus,
  Settings,
  Home,
  AlertTriangle,
  Power,
  PowerOff,
  Upload,
  Video,
  Clock,
  Trash2,
  Edit,
  Save,
  LogOut,
  FilePenLine
} from 'lucide-react';

// Video playlist for background
const VIDEO_PLAYLIST = [
  "https://sample-videos.com/zip/10/mp4/480/SampleVideo_1280x720_1mb.mp4",
];

// CameraFeed component for displaying live webcam feed
const CameraFeed = ({ camera, onCameraDeleted, onToggleMonitoring, activeAlert }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null); // For grabbing frames for AI analysis
  const [isMonitoring, setIsMonitoring] = useState(camera.isMonitoring || false);
  const [streamError, setStreamError] = useState(false);

  // Effect to load the video stream
  useEffect(() => {
    let stream;
    const startStream = async () => {
      if (camera.streamType === 'webcam' && videoRef.current) {
        try {
          setStreamError(false);
          stream = await navigator.mediaDevices.getUserMedia({
            video: { deviceId: { exact: camera.source } }
          });
          videoRef.current.srcObject = stream;
        } catch (err) {
          console.error("Error starting webcam stream:", err);
          setStreamError(true);
        }
      }
    };
    startStream();

    // Cleanup
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [camera.source, camera.streamType]);

  // This effect runs the 2 FPS analysis loop
  useEffect(() => {
    let analysisInterval;
    const video = videoRef.current;
    const canvas = canvasRef.current;

    const runAnalysis = () => {
      if (!video || !canvas || video.videoWidth === 0 || video.paused) return;

      // 1. Draw and get blob (Optimized)
      const POLL_INTERVAL_ACTIVE = 2000;  // 2s when alert is active (fast Gemini badge update)
      const POLL_INTERVAL_IDLE = 5000;    // 5s when no active alert
      const MAX_WIDTH = 800;
      const scale = MAX_WIDTH / video.videoWidth;
      canvas.width = MAX_WIDTH;
      canvas.height = video.videoHeight * scale;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(async (blob) => {
        if (!blob) return;

        // 2. Send blob to NEW Python endpoint
        const formData = new FormData();
        formData.append('file', blob, 'frame.jpg');
        formData.append('camera_id', camera.cameraId); // Send camera ID for cooldown image updates

        try {
          const aiResponse = await fetch(`${process.env.NEXT_PUBLIC_PYTHON_SERVICE_URL}/analyze_and_save_frame`, {
            method: 'POST',
            body: formData,
          });

          if (!aiResponse.ok) {
            console.error("[REACT_FRONTEND] AI server request failed.");
            return;
          }

          const result = await aiResponse.json();

          // 3. Check for detection
          if (result.detection && result.imageId) {

            // 4. --- SPAM CHECK ---
            // Check if there's an active alert that should block new detections
            // Only block if alert is PENDING, CONFIRMED_BY_GEMINI, SENDING_NOTIFICATIONS, or NOTIFIED_COOLDOWN
            // Don't block if REJECTED_BY_GEMINI or CANCELLED_BY_USER (these are resolved)
            const shouldBlock = activeAlert &&
              activeAlert.status !== "REJECTED_BY_GEMINI" &&
              activeAlert.status !== "CANCELLED_BY_USER";

            if (shouldBlock) {
              console.log(`[REACT_FRONTEND] (${camera.label}) ⏳ Alert is already active (status: ${activeAlert.status}). Ignoring new detection.`);
              return;
            }

            // --- THIS IS A NEW FIRE! ---
            console.log(`[REACT_FRONTEND] (${camera.label}) ➡️ NEW FIRE! Triggering alert...`);

            // B. Call the *existing* client-trigger with the REAL imageId
            // NOTE: We do NOT stop monitoring - detection should continue to run
            // so that fake alerts can be shut out again and real fires can still trigger
            await fetch('/api/alerts/client-trigger', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                cameraId: camera.cameraId,
                imageId: result.imageId, // <-- The REAL, VALID imageId from Python
                className: result.detection.class,
                confidence: result.detection.confidence,
                bbox: result.detection.bbox,
                timestamp: new Date().toISOString(),
              }),
            });

          } else {
            // This is a "No fire" frame - continue monitoring normally
          }
        } catch (err) {
          console.error("[REACT_FRONTEND] Error in analysis loop:", err);
        }
      }, 'image/jpeg', 0.8);
    }; // end runAnalysis

    if (isMonitoring) {
      // Run at 2 FPS (every 500ms)
      analysisInterval = setInterval(runAnalysis, 500);
    }

    return () => {
      if (analysisInterval) clearInterval(analysisInterval);
    };

  }, [isMonitoring, camera.cameraId, activeAlert]); // Monitor activeAlert to react to status changes

  // Handler for Start/Stop monitoring
  const handleToggleMonitoring = async () => {
    const newMonitoringStatus = !isMonitoring;
    const endpoint = newMonitoringStatus ? '/api/monitoring/start' : '/api/monitoring/stop';

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cameraId: camera.cameraId })
      });

      if (response.ok) {
        setIsMonitoring(newMonitoringStatus);
        onToggleMonitoring(); // Tell parent to re-fetch
      } else {
        throw new Error('Failed to toggle monitoring');
      }
    } catch (err) {
      console.error('Error toggling monitoring:', err);
    }
  };

  // Handler for Delete
  const handleDelete = async () => {
    if (!window.confirm("Are you sure you want to delete this camera?")) return;

    try {
      const response = await fetch('/api/cameras', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cameraId: camera.cameraId })
      });

      if (response.ok) {
        onCameraDeleted(); // Tell parent to re-fetch
      } else {
        throw new Error('Failed to delete camera');
      }
    } catch (err) {
      console.error('Error deleting camera:', err);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-6 bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl hover:bg-white/10 hover:border-white/20 transition-all duration-300 shadow-2xl relative"
    >
      {/* Video Feed */}
      <div className="aspect-video bg-black rounded-xl overflow-hidden mb-4 border border-white/10 relative">
        {streamError ? (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-center">
              <Camera className="w-12 h-12 text-red-500 mx-auto mb-2" />
              <p className="text-red-400 text-sm">Camera access error</p>
            </div>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover"
            />
            {/* Hidden canvas for AI frame capture */}
            <canvas ref={canvasRef} style={{ display: 'none' }} />

            {/* AI Monitoring Indicator */}
            {isMonitoring && (
              <div className="absolute top-2 left-2 flex items-center gap-2 px-3 py-1 bg-red-600/80 backdrop-blur-md rounded-full">
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                  className="w-2 h-2 bg-white rounded-full"
                />
                <span className="text-white text-xs font-semibold">AI Monitoring</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Action buttons in top-right corner of video */}
      <div className="absolute top-8 right-8 flex items-center gap-2 z-10">
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={handleDelete}
          className="p-2 bg-red-600/80 backdrop-blur-md rounded-full text-white hover:bg-red-700 transition-colors shadow-lg"
          title="Delete Camera"
        >
          <Trash2 className="w-4 h-4" />
        </motion.button>
      </div>

      {/* Camera info and controls */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-xl font-bold text-white mb-1">{camera.label}</h3>
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${isMonitoring ? 'bg-green-400' : 'bg-gray-500'}`} />
            <span className="text-sm text-gray-400">
              {isMonitoring ? 'Monitoring' : 'Offline'}
            </span>
          </div>
        </div>

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleToggleMonitoring}
          className={`px-6 py-3 rounded-xl font-semibold transition-all duration-300 ${isMonitoring
            ? 'bg-red-500 hover:bg-red-600 text-white'
            : 'bg-green-500 hover:bg-green-600 text-white'
            }`}
        >
          {isMonitoring ? 'Stop Monitoring' : 'Start Monitoring'}
        </motion.button>
      </div>
    </motion.div>
  );
};

// SignOutButton component - properly signs out user using AuthContext
const SignOutButton = () => {
  const { signOutUser } = useAuth();
  const router = useRouter();

  const handleSignOut = async () => {
    try {
      await signOutUser();
      console.log('[OWNER_DASHBOARD] User signed out successfully');
      router.push('/');
    } catch (error) {
      console.error('[OWNER_DASHBOARD] Sign out error:', error);
      toast.error('Failed to sign out. Please try again.');
    }
  };

  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      onClick={handleSignOut}
      className="w-full px-6 py-4 bg-gradient-to-r from-gray-600 to-gray-700 text-white rounded-xl font-semibold hover:from-gray-700 hover:to-gray-800 transition-all duration-300 flex items-center justify-center gap-2"
    >
      <LogOut className="w-5 h-5" />
      Sign Out
    </motion.button>
  );
};

const OwnerDashboard = ({ email }) => {
  // User and profile state
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // UI state
  const [modalState, setModalState] = useState(null);
  const [selectedHouse, setSelectedHouse] = useState(null);
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const [isVideoPlaying, setIsVideoPlaying] = useState(true);
  const [isVideoMuted, setIsVideoMuted] = useState(true);

  // Edit modal state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [houseToEdit, setHouseToEdit] = useState(null);

  // Data state
  const [houses, setHouses] = useState([]);
  const [cameras, setCameras] = useState({});
  const [alerts, setAlerts] = useState([]);
  const [activeStreams, setActiveStreams] = useState({});
  const [videoDevices, setVideoDevices] = useState([]);

  // Form states
  const [houseForm, setHouseForm] = useState({
    address: '',
    latitude: '',
    longitude: '',
    monitorPassword: ''
  });
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [cameraForm, setCameraForm] = useState({
    cameraName: '',
    streamUrl: ''
  });

  // Alert system
  const [activeAlert, setActiveAlert] = useState(null);
  const [alertCountdown, setAlertCountdown] = useState(0);
  const alertCountdownInterval = useRef(null);
  const [allActiveAlerts, setAllActiveAlerts] = useState({});

  // WhatsApp number for receiving fire alerts
  const [whatsappInput, setWhatsappInput] = useState('');
  const [whatsappSaving, setWhatsappSaving] = useState(false);

  // Refs to access latest values in closures without causing re-renders
  const userRef = useRef(null);
  const activeAlertRef = useRef(null);
  const whatsappLoopRef = useRef(null); // Tracks the 30s WhatsApp update interval

  // Keep refs in sync with state
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    activeAlertRef.current = activeAlert;
  }, [activeAlert]);

  /**
   * 30-Second WhatsApp Update Loop
   * Fires when any camera has an active alert in NOTIFIED_COOLDOWN or DISPATCHED state.
   * Stops automatically when:
   *  - The alert is no longer found in allActiveAlerts
   *  - The backend returns { stop: true } (alert finished or cancelled)
   *  - The component unmounts
   */
  useEffect(() => {
    // Find any alert that is in an active post-notification state
    const trackedAlert = Object.values(allActiveAlerts).find(
      (a) => a && ['CONFIRMED_BY_GEMINI', 'SENDING_NOTIFICATIONS', 'NOTIFIED_COOLDOWN', 'DISPATCHED'].includes(a.status)
    );

    if (!trackedAlert) {
      // No active cooldown alert — clear any existing loop
      if (whatsappLoopRef.current) {
        clearInterval(whatsappLoopRef.current);
        whatsappLoopRef.current = null;
        console.log('[REACT_FRONTEND] 🔄 WhatsApp update loop stopped (no active alert).');
      }
      return;
    }

    // Already running for this alert — don't start another loop
    if (whatsappLoopRef.current) return;

    console.log(`[REACT_FRONTEND] 🔄 Starting 30s WhatsApp update loop for alert ${trackedAlert.alertId}`);

    const sendUpdate = async (alertId, cameraId) => {
      try {
        const res = await fetch('/api/alerts/whatsapp-update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ alertId, cameraId }),
        });
        const data = await res.json();

        if (data.stop) {
          // Backend says the alert is no longer active — stop the loop
          console.log('[REACT_FRONTEND] 🔄 WhatsApp update loop: backend said stop. Clearing interval.');
          clearInterval(whatsappLoopRef.current);
          whatsappLoopRef.current = null;
        } else {
          console.log(`[REACT_FRONTEND] 🔄 WhatsApp update sent — sent:${data.sent}, failed:${data.failed}`);
        }
      } catch (err) {
        console.warn('[REACT_FRONTEND] 🔄 WhatsApp update error (non-fatal):', err.message);
      }
    };

    const { alertId, cameraId } = trackedAlert;

    // Start the interval — fires every 30 seconds
    whatsappLoopRef.current = setInterval(() => sendUpdate(alertId, cameraId), 30_000);

    // Cleanup when allActiveAlerts changes (e.g., alert cancelled)
    return () => {
      if (whatsappLoopRef.current) {
        clearInterval(whatsappLoopRef.current);
        whatsappLoopRef.current = null;
        console.log('[REACT_FRONTEND] 🔄 WhatsApp update loop cleaned up.');
      }
    };
  }, [allActiveAlerts]); // Re-evaluate whenever alert statuses change


  // Demo states
  const [selectedFile, setSelectedFile] = useState(null);
  const [demoStream, setDemoStream] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // WebSocket for real-time alerts
  const ws = useRef(null);

  // Reusable function to fetch houses from API
  const fetchHouses = async () => {
    try {
      const housesResponse = await fetch(`/api/houses?ownerEmail=${email}`);
      if (!housesResponse.ok) throw new Error('Failed to fetch houses');
      const housesData = await housesResponse.json();
      const housesArray = housesData.houses || [];
      setHouses(housesArray);
      return housesArray;
    } catch (err) {
      console.error('Failed to fetch houses:', err);
      throw err;
    }
  };

  // Function to load available video devices (webcams)
  const loadVideoDevices = async () => {
    try {
      // Request permission first
      await navigator.mediaDevices.getUserMedia({ video: true });

      // Get all devices
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter(device => device.kind === 'videoinput');

      setVideoDevices(videoInputs);
      console.log('Video devices loaded:', videoInputs);
    } catch (err) {
      console.error("Error loading video devices:", err);
      showToast('Unable to access camera. Please grant camera permissions.');
    }
  };

  // Function to fetch cameras for the current user
  const fetchCameras = async () => {
    try {
      const camerasResponse = await fetch(`/api/cameras?ownerEmail=${email}`);
      if (!camerasResponse.ok) throw new Error('Failed to fetch cameras');
      const camerasData = await camerasResponse.json();
      const camerasArray = camerasData.cameras || [];

      // Group cameras by houseId for easier lookup
      const camerasByHouse = camerasArray.reduce((acc, camera) => {
        const { houseId } = camera;
        if (!acc[houseId]) {
          acc[houseId] = [];
        }
        acc[houseId].push(camera);
        return acc;
      }, {});

      setCameras(camerasByHouse);
      console.log('Cameras fetched and grouped:', camerasByHouse);
    } catch (err) {
      console.error('Failed to fetch cameras:', err);
      throw err;
    }
  };

  useEffect(() => {
    // Flag to prevent state updates on unmounted component
    let isMounted = true;
    let pollingInterval = null;

    // A single, comprehensive function to fetch all initial data
    const fetchAllData = async () => {
      try {
        setLoading(true);
        setError('');

        // 1. Fetch User Data
        const userResponse = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });

        if (!userResponse.ok) throw new Error('Failed to fetch user data');
        const userData = await userResponse.json();
        if (isMounted) setUser(userData.user);
        // Pre-fill WhatsApp input from saved profile
        if (userData.user?.whatsappNumber) {
          setWhatsappInput(userData.user.whatsappNumber.replace('whatsapp:', ''));
        }

        // 2. Fetch ALL Houses for the owner
        const housesArray = await fetchHouses();

        // 3. Fetch ALL Cameras for the owner
        const camerasResponse = await fetch(`/api/cameras?ownerEmail=${email}`);
        if (!camerasResponse.ok) throw new Error('Failed to fetch cameras');
        const camerasData = await camerasResponse.json();
        const camerasArray = camerasData.cameras || [];

        // Group cameras by houseId for easier lookup
        const camerasByHouse = camerasArray.reduce((acc, camera) => {
          const { houseId } = camera;
          if (!acc[houseId]) {
            acc[houseId] = [];
          }
          acc[houseId].push(camera);
          return acc;
        }, {});
        if (isMounted) setCameras(camerasByHouse);

        // Check if user needs to complete profile
        if (housesArray.length === 0 && isMounted) {
          setModalState('add-house-prompt');
        }
      } catch (err) {
        if (isMounted) {
          console.error("Dashboard initialization failed:", err);
          setError("Failed to load dashboard data. Please try again.");
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    // Function to poll for alerts
    const pollAlerts = async () => {
      // Use refs to get latest values without causing re-renders
      const currentUser = userRef.current;
      const currentActiveAlert = activeAlertRef.current;
      const currentUserEmail = currentUser?.email || email;

      if (!currentUserEmail) return;

      try {
        const response = await fetch(`/api/alerts?ownerEmail=${currentUserEmail}`);
        if (!response.ok) {
          // If quota exceeded or server error, log but don't crash
          if (response.status === 500 || response.status === 429) {
            console.warn(`[REACT_FRONTEND] Poll: Failed to fetch alerts (status ${response.status}). Will retry on next poll.`);
          }
          return;
        }

        const responseData = await response.json();
        const currentAlerts = responseData.alerts || [];

        // Find the "main" active alert (the one we're showing a modal for)
        const mainAlertId = currentActiveAlert ? currentActiveAlert.alertId : null;
        const mainAlertUpdated = currentAlerts.find(a => a.alertId === mainAlertId);

        // --- NEW Smart UI Logic ---
        if (mainAlertUpdated) {
          // We are ALREADY showing a modal. Let's check its status.
          const newStatus = mainAlertUpdated.status;

          if (newStatus === "REJECTED_BY_GEMINI") {
            // Gemini rejected it! Close the modal and show a toast.
            console.log(`[REACT_FRONTEND] Poll: Gemini REJECTED alert ${mainAlertUpdated.alertId}.`);
            toast.error(`False Alarm: Gemini verification failed. Reason: ${mainAlertUpdated.geminiCheck?.reason || 'Unknown reason'}`);
            clearInterval(alertCountdownInterval.current); // Stop the timer
            setActiveAlert(null); // Close the modal
            setAlertCountdown(0);

          } else if (newStatus === "CONFIRMED_BY_GEMINI") {
            // Gemini confirmed! Update modal badge and show a success toast.
            if (currentActiveAlert?.status !== "CONFIRMED_BY_GEMINI") { // Only show once
              console.log(`[REACT_FRONTEND] Poll: Gemini CONFIRMED alert ${mainAlertUpdated.alertId}.`);
              toast.success(`✅ Gemini Verified: Real fire confirmed!`);
            }
            setActiveAlert(mainAlertUpdated); // Update modal so badge changes to "Confirmed"

          } else if (newStatus === "PENDING") {
            // Still verifying — update state to keep data fresh (e.g. confidence)
            setActiveAlert(mainAlertUpdated);

          } else if (newStatus === "NOTIFIED_COOLDOWN" || newStatus === "CANCELLED_BY_USER") {
            // The alert is finished (either sent or cancelled). Close the modal.
            console.log(`[REACT_FRONTEND] Poll: Alert ${mainAlertUpdated.alertId} is now ${newStatus}. Closing modal.`);
            clearInterval(alertCountdownInterval.current);
            setActiveAlert(null);
            setAlertCountdown(0);
          }
          // If status is "PENDING", we just let the timer run.

        } else {
          // We are NOT showing a modal. Check if we *should* show one.

          const newPendingAlert = currentAlerts.find(a => {
            // Parse createdAt regardless of how Firestore serializes it
            let alertCreatedAt = 0;
            try {
              const ca = a.createdAt;
              if (!ca) {
                alertCreatedAt = Date.now(); // No createdAt? Treat as brand new
              } else if (typeof ca.toDate === 'function') {
                alertCreatedAt = ca.toDate().getTime();
              } else if (ca._seconds !== undefined) {
                alertCreatedAt = ca._seconds * 1000;
              } else if (ca.seconds !== undefined) {
                alertCreatedAt = ca.seconds * 1000;
              } else {
                alertCreatedAt = new Date(ca).getTime() || Date.now();
              }
            } catch (_) {
              alertCreatedAt = Date.now(); // On parse error, treat as new
            }

            const tenMinutesAgo = Date.now() - (10 * 60 * 1000);
            const isRecent = alertCreatedAt > tenMinutesAgo;

            // Show the popup as soon as YOLO detects (PENDING) or Gemini confirms
            // This ensures the user sees the alert immediately and can cancel if false alarm
            return (a.status === 'PENDING' || a.status === 'CONFIRMED_BY_GEMINI') &&
              isRecent &&
              (!currentActiveAlert || currentActiveAlert.alertId !== a.alertId);
          });

          if (newPendingAlert) {
            // Show alert popup immediately on detection
            console.log(`[REACT_FRONTEND] Poll: New ${newPendingAlert.status} alert ${newPendingAlert.alertId}. Showing alert popup.`);
            startAlertCountdown(newPendingAlert);
            if (newPendingAlert.status === 'CONFIRMED_BY_GEMINI') {
              toast.success('🔥 Gemini verified: Real fire detected!', { duration: 4000 });
            } else {
              toast.error('🚨 Detection: Fire/Smoke detected! Verifying with AI...', { duration: 4000 });
            }
          }
        }
        // --- End of new logic ---

        // Update the main alerts map for the CameraFeed components
        // Prioritize active alerts over rejected/cancelled ones
        const alertsByCamera = {};
        currentAlerts.forEach(alert => {
          const existing = alertsByCamera[alert.cameraId];
          if (!existing) {
            alertsByCamera[alert.cameraId] = alert;
          } else {
            // Priority: active statuses > rejected/cancelled
            const isActive = ["PENDING", "CONFIRMED_BY_GEMINI", "SENDING_NOTIFICATIONS", "NOTIFIED_COOLDOWN"].includes(alert.status);
            const existingIsActive = ["PENDING", "CONFIRMED_BY_GEMINI", "SENDING_NOTIFICATIONS", "NOTIFIED_COOLDOWN"].includes(existing.status);
            if (isActive && !existingIsActive) {
              alertsByCamera[alert.cameraId] = alert; // Replace with active alert
            }
            // Otherwise keep existing (either both active or existing is active)
          }
        });
        setAllActiveAlerts(alertsByCamera);

        // Also update the alerts array
        if (isMounted) {
          setAlerts(currentAlerts);
        }

      } catch (err) {
        console.error('Error polling alerts:', err);
      }
    };

    // Initial data fetch and start polling
    fetchAllData();
    // Run immediately then every 5s
    pollAlerts();
    pollingInterval = setInterval(pollAlerts, 2000); // 2s for fast Gemini badge updates

    // Cleanup function
    return () => {
      isMounted = false;
      clearInterval(pollingInterval);
      if (alertCountdownInterval.current) {
        clearInterval(alertCountdownInterval.current);
      }
    };
  }, [email]); // Only depend on email - user and activeAlert are accessed via closure in pollAlerts

  const startAlertCountdown = (alertData) => {
    // Use ref to avoid stale closure — activeAlert state captured in useEffect may be stale
    if (activeAlertRef.current) {
      console.log('[REACT_FRONTEND] startAlertCountdown: modal already showing, skip.');
      return;
    }

    setActiveAlert(alertData);
    setAlertCountdown(30);

    if (alertCountdownInterval.current) clearInterval(alertCountdownInterval.current);

    // Store alertData in a ref so we can access it when countdown expires
    const alertDataForExpiry = alertData;

    alertCountdownInterval.current = setInterval(() => {
      setAlertCountdown(prev => {
        if (prev <= 1) {
          // Clear the interval first
          clearInterval(alertCountdownInterval.current);

          // Use setTimeout to move side effects out of the setState callback
          // This prevents the "Cannot update a component while rendering" error
          setTimeout(() => {
            setActiveAlert(null);
            // Call the "Email Gatekeeper"
            fetch('/api/alerts/confirm-and-send', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ alertId: alertDataForExpiry.alertId })
            }).catch(err => console.error('[REACT_FRONTEND] Error confirming alert:', err));
            toast.success('Emergency services have been notified!');
          }, 0);

          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };
  // Cancel active alert
  const handleCancelAlert = async () => {
    if (!activeAlert) return;

    const alertIdToCancel = activeAlert.alertId;
    const userEmail = user?.email || email || "unknown.user@example.com";

    console.log(`[REACT_FRONTEND] 🚫 User clicked CANCEL for Alert: ${alertIdToCancel}`);

    // Stop the 30s timer
    if (alertCountdownInterval.current) {
      clearInterval(alertCountdownInterval.current);
    }

    // --- Optimistic UI Update ---
    // Close the modal and show toast *immediately*
    // Don't wait for the API call to finish
    setActiveAlert(null);
    setAlertCountdown(0);
    toast.success("Alert Cancelled.");

    // Set a "fake" cancelled state so the poll doesn't re-trigger the modal
    setAllActiveAlerts(prev => ({
      ...prev,
      [activeAlert.cameraId]: { ...activeAlert, status: "CANCELLED_BY_USER" }
    }));

    // Call the backend in the background
    try {
      await fetch('/api/alerts/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alertId: alertIdToCancel,
          userEmail: userEmail
        })
      });
      console.log(`[REACT_FRONTEND] 🚫 Alert ${alertIdToCancel} successfully cancelled on backend.`);

      // The 5s poll will eventually get the "final" state,
      // but the UI is already (and correctly) updated.

    } catch (err) {
      console.error(`[REACT_FRONTEND] ❌ Error cancelling alert:`, err);
      toast.error("Error cancelling alert. Please check console.");
    }
  };

  // Handle location selection from LocationPicker
  const handleLocationSelect = (locationData) => {
    setSelectedLocation({
      lat: locationData.latitude,
      lng: locationData.longitude
    });
    setShowLocationPicker(false);

    // Update form with coordinates
    setHouseForm({
      ...houseForm,
      latitude: locationData.latitude.toString(),
      longitude: locationData.longitude.toString()
    });

    toast.success('Location selected successfully!');
  };

  // Add new house
  const handleAddHouse = async (e) => {
    e.preventDefault();

    // Validate location is selected
    if (!selectedLocation) {
      toast.error('Please select a location on the map');
      return;
    }

    try {
      const response = await fetch('/api/houses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ownerEmail: email,
          address: houseForm.address,
          coords: {
            lat: selectedLocation.lat,
            lng: selectedLocation.lng
          },
          monitorPassword: houseForm.monitorPassword
        })
      });

      if (response.ok) {
        const newHouseData = await response.json();
        console.log('House created successfully:', newHouseData);

        // Re-fetch all houses to get the complete list from the database
        await fetchHouses();

        setModalState(null);
        setHouseForm({ address: '', latitude: '', longitude: '', monitorPassword: '' });
        setSelectedLocation(null);
        showToast('House added successfully!');
      } else {
        throw new Error('Failed to add house');
      }
    } catch (err) {
      setError(err.message);
    }
  };

  // Delete house
  const handleDeleteHouse = async (houseId, e) => {
    // Stop event propagation to prevent card click
    if (e) {
      e.stopPropagation();
    }

    // Confirmation prompt
    if (!window.confirm("Are you sure you want to delete this property? This will also delete all associated cameras and cannot be undone.")) {
      return;
    }

    try {
      const response = await fetch(`/api/houses/${houseId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.ok) {
        console.log('House deleted successfully:', houseId);

        // Re-fetch all houses to update the list
        await fetchHouses();

        showToast('Property deleted successfully!');
      } else {
        throw new Error('Failed to delete property');
      }
    } catch (err) {
      console.error('Error deleting house:', err);
      setError(err.message);
      showToast('Failed to delete property. Please try again.');
    }
  };

  // Open edit modal
  const handleOpenEditModal = (house, e) => {
    // Stop event propagation to prevent card click
    if (e) {
      e.stopPropagation();
    }

    setHouseToEdit(house);
    setIsEditModalOpen(true);
  };

  // Close edit modal
  const handleCloseEditModal = () => {
    setIsEditModalOpen(false);
    setHouseToEdit(null);
  };

  // Update house
  const handleUpdateHouse = async (event) => {
    event.preventDefault();

    if (!houseToEdit) return;

    try {
      const newAddress = event.target.address.value;

      const response = await fetch(`/api/houses/${houseToEdit.houseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: newAddress })
      });

      if (response.ok) {
        console.log('House updated successfully:', houseToEdit.houseId);

        // Re-fetch all houses to update the list
        await fetchHouses();

        // Close modal
        handleCloseEditModal();

        showToast('Property updated successfully!');
      } else {
        throw new Error('Failed to update property');
      }
    } catch (err) {
      console.error('Error updating house:', err);
      setError(err.message);
      showToast('Failed to update property. Please try again.');
    }
  };

  // Add new camera
  const handleAddCamera = async (e) => {
    e.preventDefault();
    if (!selectedHouse) return;

    try {
      // Get values from form
      const formData = new FormData(e.target);
      const cameraName = formData.get('cameraName');
      const deviceId = formData.get('deviceId');

      if (!deviceId) {
        showToast('Please select a camera device');
        return;
      }

      const response = await fetch('/api/cameras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          houseId: selectedHouse.houseId,
          label: cameraName,
          source: deviceId,
          streamType: 'webcam'
        })
      });

      if (response.ok) {
        const newCameraData = await response.json();
        showToast('Camera added successfully!');
        setModalState(null);
        setCameraForm({ cameraName: '', streamUrl: '' });

        // Re-fetch cameras to get the updated list
        await fetchCameras();
      } else {
        throw new Error('Failed to add camera');
      }
    } catch (err) {
      console.error('Error adding camera:', err);
      setError(err.message);
      showToast('Failed to add camera. Please try again.');
    }
  };

  // Demo: Use webcam - assign to first available camera for demo purposes
  const startWebcamDemo = () => {
    // Get first available camera to use its credentials
    const allCamerasList = Object.values(cameras).flat();
    if (allCamerasList.length === 0) {
      showToast('Please add a camera first to enable demo mode!');
      return;
    }

    const demoCamera = allCamerasList[0];
    console.log(`[DEMO] Using camera ${demoCamera.cameraId} (${demoCamera.label}) for webcam demo`);
    setDemoStream(`${process.env.NEXT_PUBLIC_PYTHON_SERVICE_URL}/webcam_feed/${demoCamera.cameraId}`);
    showToast(`Webcam demo started using camera: ${demoCamera.label}!`);
  };

  // Demo: Upload video - assign to first available camera for demo purposes
  const handleVideoUpload = async () => {
    if (!selectedFile) {
      setError('Please select a video file first!');
      return;
    }

    // Get first available camera to use its credentials
    const allCamerasList = Object.values(cameras).flat();
    if (allCamerasList.length === 0) {
      setError('Please add a camera first to enable demo mode!');
      return;
    }

    const demoCamera = allCamerasList[0];
    console.log(`[DEMO] Using camera ${demoCamera.cameraId} (${demoCamera.label}) for video demo`);

    setIsProcessing(true);
    const formData = new FormData();
    formData.append('video', selectedFile);

    try {
      // Use the camera-specific upload endpoint
      const response = await fetch(`${process.env.NEXT_PUBLIC_PYTHON_SERVICE_URL}/upload_video/${demoCamera.cameraId}`, {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        const data = await response.json();
        // Use the camera-specific video feed endpoint
        setDemoStream(`${process.env.NEXT_PUBLIC_PYTHON_SERVICE_URL}/video_feed/${demoCamera.cameraId}/${data.filename}`);
        showToast(`Video processing started using camera: ${demoCamera.label}!`);
      } else {
        throw new Error('Failed to upload video');
      }
    } catch (err) {
      setError(err.message);
      showToast('Failed to upload video. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Utility functions
  const showToast = (message) => {
    // Simple toast implementation
    const toast = document.createElement('div');
    toast.className = 'fixed top-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 opacity-0 transition-opacity duration-300';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.style.opacity = '1', 100);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => document.body.removeChild(toast), 300);
    }, 3000);
  };

  const togglePlayPause = () => {
    const video = document.getElementById('background-video');
    if (video) {
      if (isVideoPlaying) {
        video.pause();
      } else {
        video.play();
      }
      setIsVideoPlaying(!isVideoPlaying);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-16 h-16 border-4 border-orange-500 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden">
      <Toaster position="top-center" reverseOrder={false} />
      {/* Background Video */}
      <div className="fixed inset-0 z-0">
        <video
          id="background-video"
          key={currentVideoIndex}
          autoPlay
          loop
          muted={isVideoMuted}
          playsInline
          className="w-full h-full object-cover"
        >
          <source src={VIDEO_PLAYLIST[currentVideoIndex]} type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900/95 via-slate-800/90 to-slate-900/95 backdrop-blur-[1px]" />
      </div>

      {/* Alert Overlay */}
      <AnimatePresence>
        {activeAlert && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="fixed inset-0 z-50 bg-red-900/90 backdrop-blur-md flex items-center justify-center p-4"
          >
            <div className="bg-white/10 backdrop-blur-xl border border-red-500/50 rounded-3xl p-8 max-w-md w-full text-center">
              <motion.div
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
                className="w-24 h-24 bg-red-500 rounded-full flex items-center justify-center mx-auto mb-6"
              >
                <AlertTriangle className="w-12 h-12 text-white" />
              </motion.div>

              {/* Detection type headline */}
              <h2 className="text-3xl font-bold text-white mb-2">
                {activeAlert.className?.toLowerCase() === 'smoke'
                  ? '🌫️ SMOKE DETECTED!'
                  : '🔥 FIRE DETECTED!'}
              </h2>

              {/* Gemini verification status badge */}
              <div className="mb-3">
                {activeAlert.status === 'PENDING' && (
                  <div className="inline-flex items-center gap-2 px-4 py-2 bg-yellow-500/20 border border-yellow-400/40 rounded-full">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                      className="w-4 h-4 border-2 border-yellow-400 border-t-transparent rounded-full"
                    />
                    <span className="text-yellow-300 text-sm font-medium">Verifying with Gemini AI...</span>
                  </div>
                )}
                {activeAlert.status === 'CONFIRMED_BY_GEMINI' && (
                  <div className="space-y-2">
                    <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-500/20 border border-green-400/40 rounded-full">
                      <span className="text-green-300 text-sm font-medium">✅ Gemini Confirmed — Emergency</span>
                    </div>
                    {activeAlert.geminiCheck?.fire_type && (
                      <p className="text-orange-300 text-xs font-semibold uppercase tracking-wide">
                        Type: {activeAlert.geminiCheck.fire_type}
                      </p>
                    )}
                    {activeAlert.geminiCheck?.reason && (
                      <p className="text-white/80 text-sm italic px-2">
                        "{activeAlert.geminiCheck.reason}"
                      </p>
                    )}
                  </div>
                )}
                {activeAlert.status === 'SENDING_NOTIFICATIONS' && (
                  <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500/20 border border-blue-400/40 rounded-full">
                    <span className="text-blue-300 text-sm font-medium">📢 Notifying emergency services...</span>
                  </div>
                )}
              </div>

              <p className="text-red-200 mb-2 text-sm">
                Detected at{' '}
                <span className="font-semibold text-white">{activeAlert.location || 'your property'}</span>
              </p>
              {activeAlert.confidence && (
                <p className="text-red-300 text-xs mb-3">
                  YOLO Confidence: <span className="font-bold">{(activeAlert.confidence * 100).toFixed(1)}%</span>
                </p>
              )}

              <div className="text-7xl font-bold text-red-500 mb-4">
                {alertCountdown}
              </div>

              <div className="space-y-4">
                <button
                  onClick={handleCancelAlert}
                  className="w-full px-6 py-4 bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold transition-colors"
                >
                  Turn Off Alert
                </button>
                <p className="text-red-200 text-sm">
                  {activeAlert.status === 'PENDING'
                    ? 'Cancel now if this is a false alarm. Emergency services will be notified after AI verification.'
                    : 'Emergency services will be notified automatically if not cancelled'}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="relative z-10">
        {/* Header */}
        <header className="p-6 border-b border-white/10 bg-black/20 backdrop-blur-md">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-4">
              <motion.div
                whileHover={{ rotate: 360 }}
                transition={{ duration: 0.6 }}
                className="w-12 h-12 bg-gradient-to-r from-orange-400 to-red-500 rounded-xl flex items-center justify-center"
              >
                <Shield className="w-6 h-6 text-white" />
              </motion.div>
              <div>
                <h1 className="text-2xl font-bold text-white">AgniShakti Dashboard</h1>
                <p className="text-gray-400">Welcome back, {user?.name}</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {/* Alerts indicator */}
              <motion.button
                animate={alerts.length > 0 ? { scale: [1, 1.1, 1] } : {}}
                transition={{ duration: 2, repeat: Infinity }}
                onClick={() => setModalState('alerts')}
                className="relative p-2 hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
                title="View Alerts"
              >
                <Bell className="w-6 h-6 text-orange-400" />
                {alerts.length > 0 && (
                  <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-xs text-white">
                    {alerts.length}
                  </div>
                )}
              </motion.button>

              {/* Profile menu */}
              <motion.button
                whileHover={{ scale: 1.05 }}
                onClick={() => setModalState('profile')}
                className="p-3 bg-white/10 backdrop-blur-md border border-white/20 rounded-xl text-white hover:bg-white/20 transition-all duration-300"
              >
                <User className="w-5 h-5" />
              </motion.button>
            </div>
          </div>
        </header>

        {/* Main Dashboard */}
        <div className="p-6 max-w-7xl mx-auto">
          {!selectedHouse ? (
            // Houses Overview
            <div>
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-4xl font-bold text-white mb-2">My Properties</h2>
                  <p className="text-gray-400">Manage your protected properties</p>
                </div>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  onClick={() => setModalState('add-house')}
                  className="px-6 py-3 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-xl font-semibold hover:from-orange-600 hover:to-red-700 transition-all duration-300 flex items-center gap-2"
                >
                  <Plus className="w-5 h-5" />
                  Add Property
                </motion.button>
              </div>

              {houses.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-center py-16"
                >
                  <div className="w-24 h-24 bg-gradient-to-r from-gray-600 to-gray-700 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Home className="w-12 h-12 text-white" />
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-4">No Properties Added</h3>
                  <p className="text-gray-400 mb-8">Add your first property to start monitoring</p>
                  <button
                    onClick={() => setModalState('add-house')}
                    className="px-8 py-4 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-xl font-semibold hover:from-orange-600 hover:to-red-700 transition-all duration-300"
                  >
                    Add Your First Property
                  </button>
                </motion.div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {houses.map((house, index) => (
                    <motion.div
                      key={house.houseId || house.houseId}
                      initial={{ opacity: 0, y: 30 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                      whileHover={{ y: -5, scale: 1.02 }}
                      onClick={() => setSelectedHouse(house)}
                      className="cursor-pointer p-6 bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl hover:bg-white/10 hover:border-white/20 transition-all duration-300 shadow-2xl relative"
                    >
                      {/* Action buttons in top-right corner */}
                      <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
                        {/* Edit button */}
                        <motion.button
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          onClick={(e) => handleOpenEditModal(house, e)}
                          className="p-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-lg transition-colors"
                          title="Edit Property"
                        >
                          <FilePenLine className="w-4 h-4" />
                        </motion.button>

                        {/* Delete button */}
                        <motion.button
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          onClick={(e) => handleDeleteHouse(house.houseId, e)}
                          className="p-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors"
                          title="Delete Property"
                        >
                          <Trash2 className="w-4 h-4" />
                        </motion.button>
                      </div>

                      <div className="flex items-start justify-between mb-4">
                        <div className="w-14 h-14 bg-gradient-to-r from-blue-400 to-purple-500 rounded-2xl flex items-center justify-center">
                          <Home className="w-7 h-7 text-white" />
                        </div>
                        <div className="text-right pr-20">
                          <div className="flex items-center gap-1">
                            <Camera className="w-4 h-4 text-gray-400" />
                            <span className="text-sm text-gray-400">
                              {cameras[house.houseId]?.length || 0} cameras
                            </span>
                          </div>
                        </div>
                      </div>

                      <h3 className="text-xl font-bold text-white mb-2">Property</h3>
                      <p className="text-gray-400 text-sm mb-4 line-clamp-2">{house.address}</p>

                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-orange-400" />
                        <span className="text-sm text-gray-300">
                          {house.coords?.lat?.toFixed(4)}, {house.coords?.lng?.toFixed(4)}
                        </span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}

              {/* Demo Section */}
              <div className="mt-16">
                <div className="text-center mb-8">
                  <h2 className="text-3xl font-bold text-white mb-2">Live AI Demo</h2>
                  <p className="text-gray-400">Test the fire detection system in real-time</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Demo Controls */}
                  <div className="p-6 bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl">
                    <h3 className="text-xl font-bold text-white mb-6">Demo Controls</h3>

                    <div className="space-y-4 mb-6">
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        onClick={startWebcamDemo}
                        className="w-full px-6 py-4 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl font-semibold hover:from-blue-600 hover:to-purple-700 transition-all duration-300 flex items-center justify-center gap-3"
                      >
                        <Video className="w-5 h-5" />
                        Use Laptop Webcam
                      </motion.button>

                      <div className="space-y-3">
                        <input
                          type="file"
                          accept="video/*"
                          onChange={(e) => setSelectedFile(e.target.files[0])}
                          className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-orange-500 file:text-white file:cursor-pointer"
                        />
                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          onClick={handleVideoUpload}
                          disabled={!selectedFile || isProcessing}
                          className="w-full px-6 py-4 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-xl font-semibold hover:from-orange-600 hover:to-red-700 transition-all duration-300 disabled:opacity-50 flex items-center justify-center gap-3"
                        >
                          <Upload className="w-5 h-5" />
                          {isProcessing ? 'Processing...' : 'Upload Demo Video'}
                        </motion.button>
                      </div>
                    </div>
                  </div>

                  {/* Demo Stream */}
                  <div className="p-6 bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl">
                    <h3 className="text-xl font-bold text-white mb-6">Live AI Detection</h3>

                    <div className="aspect-video bg-black/50 rounded-xl flex items-center justify-center border border-white/10 overflow-hidden">
                      {demoStream ? (
                        <img
                          src={demoStream}
                          alt="Live AI Detection"
                          className="w-full h-full object-cover rounded-xl"
                          onError={(e) => {
                            console.error('[DEMO] Stream failed to load:', demoStream);
                            showToast('Failed to load video stream. Please try again.');
                            setDemoStream(null);
                          }}
                          onLoad={() => {
                            console.log('[DEMO] Stream loaded successfully:', demoStream);
                          }}
                        />
                      ) : (
                        <div className="text-center">
                          <Eye className="w-12 h-12 text-gray-500 mx-auto mb-3" />
                          <p className="text-gray-400">Select a demo option to start AI detection</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            // Camera Management View
            <div>
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    onClick={() => setSelectedHouse(null)}
                    className="p-3 bg-white/10 backdrop-blur-md border border-white/20 rounded-xl text-white hover:bg-white/20 transition-all duration-300"
                  >
                    <X className="w-5 h-5" />
                  </motion.button>
                  <div>
                    <h2 className="text-4xl font-bold text-white mb-2">Camera Management</h2>
                    <p className="text-gray-400">{selectedHouse.address}</p>
                  </div>
                </div>

                <motion.button
                  whileHover={{ scale: 1.05 }}
                  onClick={() => {
                    loadVideoDevices();
                    setModalState('add-camera');
                  }}
                  className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-semibold hover:from-green-600 hover:to-emerald-700 transition-all duration-300 flex items-center gap-2"
                >
                  <Plus className="w-5 h-5" />
                  Add Camera
                </motion.button>
              </div>

              {cameras[selectedHouse.houseId]?.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-center py-16"
                >
                  <div className="w-24 h-24 bg-gradient-to-r from-gray-600 to-gray-700 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Camera className="w-12 h-12 text-white" />
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-4">No Cameras Added</h3>
                  <p className="text-gray-400 mb-8">Add your first camera to start monitoring this property</p>
                  <button
                    onClick={() => {
                      loadVideoDevices();
                      setModalState('add-camera');
                    }}
                    className="px-8 py-4 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-semibold hover:from-green-600 hover:to-emerald-700 transition-all duration-300"
                  >
                    Add Your First Camera
                  </button>
                </motion.div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {cameras[selectedHouse.houseId]?.map((camera) => (
                    <CameraFeed
                      key={camera.cameraId}
                      camera={camera}
                      onCameraDeleted={fetchCameras}
                      onToggleMonitoring={fetchCameras}
                      activeAlert={allActiveAlerts[camera.cameraId]}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {modalState && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-40 flex items-center justify-center p-4"
            onClick={(e) => e.target === e.currentTarget && setModalState(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="w-full max-w-lg bg-white/10 backdrop-blur-2xl border border-white/20 rounded-3xl shadow-2xl overflow-hidden"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-6 border-b border-white/10">
                <h2 className="text-2xl font-bold text-white">
                  {modalState === 'add-house' && 'Add New Property'}
                  {modalState === 'add-house-prompt' && 'Complete Your Profile'}
                  {modalState === 'add-camera' && 'Add New Camera'}
                  {modalState === 'profile' && 'Your Profile'}
                  {modalState === 'alerts' && 'Alert History'}
                </h2>
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setModalState(null)}
                  className="p-2 hover:bg-white/10 rounded-xl transition-colors"
                >
                  <X className="w-5 h-5 text-gray-400" />
                </motion.button>
              </div>

              {/* Modal Content */}
              <div className="p-6">
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded-xl text-red-300 text-sm"
                  >
                    {error}
                  </motion.div>
                )}

                {(modalState === 'add-house' || modalState === 'add-house-prompt') && (
                  <form onSubmit={handleAddHouse} className="space-y-4">
                    {modalState === 'add-house-prompt' && (
                      <div className="text-center mb-6 p-4 bg-orange-500/10 border border-orange-500/20 rounded-xl">
                        <AlertTriangle className="w-12 h-12 text-orange-400 mx-auto mb-3" />
                        <p className="text-orange-300 text-sm">
                          Please add your property details to start monitoring your home for fire safety.
                        </p>
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Property Address
                      </label>
                      <input
                        type="text"
                        value={houseForm.address}
                        onChange={(e) => setHouseForm({ ...houseForm, address: e.target.value })}
                        required
                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all duration-300"
                        placeholder="123 Main Street, City, State"
                      />
                    </div>


                    <div className="space-y-3">
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Property Location
                      </label>

                      {selectedLocation ? (
                        <div className="p-4 bg-green-900/20 border border-green-500/30 rounded-xl">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <MapPin className="w-5 h-5 text-green-400" />
                              <span className="text-green-400 font-semibold">✅ Location Selected</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setShowLocationPicker(true)}
                              className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 text-sm transition-all"
                            >
                              Change
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-3 text-sm">
                            <div>
                              <p className="text-gray-400">Latitude</p>
                              <p className="text-white font-mono">{selectedLocation.lat.toFixed(6)}</p>
                            </div>
                            <div>
                              <p className="text-gray-400">Longitude</p>
                              <p className="text-white font-mono">{selectedLocation.lng.toFixed(6)}</p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setShowLocationPicker(true)}
                          className="w-full px-6 py-4 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-xl font-semibold hover:from-orange-600 hover:to-red-700 transition-all duration-300 flex items-center justify-center gap-2 shadow-lg"
                        >
                          <MapPin className="w-5 h-5" />
                          Select Location on Map
                        </button>
                      )}

                      <p className="text-gray-400 text-xs">
                        📍 GPS will auto-detect your location, or you can select manually on the map
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Monitor Password
                      </label>
                      <input
                        type="password"
                        value={houseForm.monitorPassword}
                        onChange={(e) => setHouseForm({ ...houseForm, monitorPassword: e.target.value })}
                        required
                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all duration-300"
                        placeholder="Secure password for monitoring"
                      />
                    </div>

                    <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                      <p className="text-blue-300 text-sm">
                        ℹ️ The nearest fire station will be automatically assigned based on your property's GPS coordinates.
                      </p>
                    </div>

                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      type="submit"
                      className="w-full px-6 py-4 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-xl font-semibold hover:from-orange-600 hover:to-red-700 transition-all duration-300 shadow-lg"
                    >
                      Add Property
                    </motion.button>
                  </form>
                )}

                {modalState === 'add-camera' && (
                  <form onSubmit={handleAddCamera} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Camera Name
                      </label>
                      <input
                        type="text"
                        name="cameraName"
                        value={cameraForm.cameraName}
                        onChange={(e) => setCameraForm({ ...cameraForm, cameraName: e.target.value })}
                        required
                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 transition-all duration-300"
                        placeholder="Front Door Camera"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Select Webcam
                      </label>
                      <select
                        name="deviceId"
                        required
                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-green-500 transition-all duration-300"
                      >
                        <option value="" className="bg-gray-800">Select a camera</option>
                        {videoDevices.map(device => (
                          <option
                            key={device.deviceId}
                            value={device.deviceId}
                            className="bg-gray-800"
                          >
                            {device.label || `Camera ${device.deviceId.substring(0, 8)}`}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                      <p className="text-blue-300 text-sm">
                        📹 Select your webcam from the dropdown above. The live feed will be displayed in real-time once added.
                      </p>
                    </div>

                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      type="submit"
                      className="w-full px-6 py-4 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-semibold hover:from-green-600 hover:to-emerald-700 transition-all duration-300 shadow-lg"
                    >
                      Add Camera
                    </motion.button>
                  </form>
                )}

                {modalState === 'profile' && (
                  <div className="space-y-6">
                    <div className="text-center">
                      <div className="w-24 h-24 bg-gradient-to-r from-orange-400 to-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                        <User className="w-12 h-12 text-white" />
                      </div>
                      <h3 className="text-2xl font-bold text-white mb-2">{user?.name}</h3>
                      <p className="text-gray-400 mb-4">{user?.email}</p>
                      <div className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500/20 border border-orange-500/30 rounded-full text-orange-300 text-sm">
                        <Shield className="w-4 h-4" />
                        Property Owner
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="p-4 bg-white/5 border border-white/10 rounded-xl">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="text-white font-semibold">Properties</h4>
                            <p className="text-gray-400 text-sm">{houses.length} properties monitored</p>
                          </div>
                          <Home className="w-6 h-6 text-gray-400" />
                        </div>
                      </div>

                      <div className="p-4 bg-white/5 border border-white/10 rounded-xl">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="text-white font-semibold">Cameras</h4>
                            <p className="text-gray-400 text-sm">
                              {Object.values(cameras).flat().length} cameras installed
                            </p>
                          </div>
                          <Camera className="w-6 h-6 text-gray-400" />
                        </div>
                      </div>

                      <div className="p-4 bg-white/5 border border-white/10 rounded-xl">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="text-white font-semibold">Alerts</h4>
                            <p className="text-gray-400 text-sm">{alerts.length} total alerts</p>
                          </div>
                          <Bell className="w-6 h-6 text-gray-400" />
                        </div>
                      </div>
                    </div>

                    {/* WhatsApp Alert Number */}
                    <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-xl">
                      <div className="flex items-center gap-2 mb-3">
                        <Phone className="w-5 h-5 text-green-400" />
                        <h4 className="text-white font-semibold">WhatsApp Alert Number</h4>
                      </div>
                      <p className="text-gray-400 text-xs mb-3">
                        Fire alerts will be sent to this WhatsApp number when a threat is detected at your property.
                      </p>
                      <div className="flex gap-2">
                        <input
                          type="tel"
                          value={whatsappInput}
                          onChange={(e) => setWhatsappInput(e.target.value)}
                          placeholder="+918757010589"
                          className="flex-1 px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-500 text-sm focus:outline-none focus:border-green-400"
                        />
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          disabled={whatsappSaving || !whatsappInput.trim()}
                          onClick={async () => {
                            if (!whatsappInput.trim()) return;
                            setWhatsappSaving(true);
                            try {
                              const res = await fetch('/api/auth/update-whatsapp', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ email, whatsappNumber: whatsappInput.trim() }),
                              });
                              const data = await res.json();
                              if (data.success) {
                                setUser(prev => ({ ...prev, whatsappNumber: data.whatsappNumber }));
                                toast.success('✅ WhatsApp number saved!');
                              } else {
                                toast.error('Failed to save number');
                              }
                            } catch (err) {
                              toast.error('Error saving number');
                            } finally {
                              setWhatsappSaving(false);
                            }
                          }}
                          className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors"
                        >
                          {whatsappSaving ? '...' : 'Save'}
                        </motion.button>
                      </div>
                      {user?.whatsappNumber && (
                        <p className="text-green-400 text-xs mt-2">
                          ✅ Saved: {user.whatsappNumber.replace('whatsapp:', '')}
                        </p>
                      )}
                    </div>

                      <SignOutButton />
                  </div>
                )}

                {modalState === 'alerts' && (
                  <div className="space-y-6">
                    <div className="text-center mb-6">
                      <div className="w-16 h-16 bg-gradient-to-r from-orange-400 to-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Bell className="w-8 h-8 text-white" />
                      </div>
                      <h3 className="text-2xl font-bold text-white">Alert History</h3>
                      <p className="text-gray-400">{alerts.length} total alerts</p>
                    </div>

                    {alerts.length === 0 ? (
                      <div className="text-center py-8">
                        <div className="w-16 h-16 bg-gray-700/50 rounded-full flex items-center justify-center mx-auto mb-4">
                          <Bell className="w-8 h-8 text-gray-500" />
                        </div>
                        <p className="text-gray-400">No alerts yet</p>
                        <p className="text-gray-500 text-sm mt-2">Fire detections will appear here</p>
                      </div>
                    ) : (
                      <div className="space-y-3 max-h-80 overflow-y-auto pr-2">
                        {alerts.map((alert, index) => (
                          <motion.div
                            key={alert.alertId || index}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.05 }}
                            className={`p-4 rounded-xl border ${alert.status === 'PENDING' || alert.status === 'CONFIRMED_BY_GEMINI'
                              ? 'bg-red-500/10 border-red-500/30'
                              : alert.status === 'REJECTED_BY_GEMINI' || alert.status === 'CANCELLED_BY_USER'
                                ? 'bg-gray-500/10 border-gray-500/30'
                                : 'bg-orange-500/10 border-orange-500/30'
                              }`}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex items-center gap-3">
                                <div className={`w-3 h-3 rounded-full ${alert.status === 'PENDING' ? 'bg-yellow-400 animate-pulse' :
                                  alert.status === 'CONFIRMED_BY_GEMINI' ? 'bg-red-500 animate-pulse' :
                                    alert.status === 'REJECTED_BY_GEMINI' ? 'bg-gray-500' :
                                      alert.status === 'CANCELLED_BY_USER' ? 'bg-gray-500' :
                                        alert.status === 'NOTIFIED_COOLDOWN' ? 'bg-green-500' :
                                          'bg-orange-400'
                                  }`} />
                                <div>
                                  <p className="text-white font-medium">
                                    {alert.status === 'PENDING' && 'Verifying...'}
                                    {alert.status === 'CONFIRMED_BY_GEMINI' && '🔥 Fire Confirmed'}
                                    {alert.status === 'REJECTED_BY_GEMINI' && '❌ False Alarm'}
                                    {alert.status === 'CANCELLED_BY_USER' && '🚫 Cancelled'}
                                    {alert.status === 'NOTIFIED_COOLDOWN' && '✅ Notified'}
                                    {alert.status === 'SENDING_NOTIFICATIONS' && '📤 Sending...'}
                                  </p>
                                  <p className="text-gray-400 text-sm">
                                    {alert.detection?.class || 'Fire'} - {Math.round((alert.detection?.confidence || 0) * 100)}% confidence
                                  </p>
                                </div>
                              </div>
                              <span className="text-gray-500 text-xs">
                                {alert.timestamp ? new Date(alert.timestamp).toLocaleTimeString() : 'N/A'}
                              </span>
                            </div>
                            {alert.geminiCheck?.reason && (
                              <p className="text-gray-400 text-sm mt-2 pl-6">
                                Reason: {alert.geminiCheck.reason}
                              </p>
                            )}
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Ambient Particles Effect */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-5">
        {[...Array(15)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 bg-orange-400/20 rounded-full"
            initial={{
              x: Math.random() * (typeof window !== 'undefined' ? window.innerWidth : 1920),
              y: (typeof window !== 'undefined' ? window.innerHeight : 1080) + 10,
            }}
            animate={{
              y: -10,
              x: Math.random() * (typeof window !== 'undefined' ? window.innerWidth : 1920),
            }}
            transition={{
              duration: Math.random() * 10 + 10,
              repeat: Infinity,
              ease: "linear",
              delay: Math.random() * 10,
            }}
          />
        ))}
      </div>

      {/* Floating Action Button for Video Controls (Mobile) */}
      <motion.div
        initial={{ opacity: 0, scale: 0 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 1 }}
        className="fixed bottom-6 right-6 z-30 md:hidden"
      >
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={togglePlayPause}
          className="p-4 bg-gradient-to-r from-orange-500 to-red-600 rounded-full text-white shadow-2xl hover:shadow-orange-500/25 transition-all duration-300"
        >
          {isVideoPlaying ? <Pause size={24} /> : <Play size={24} />}
        </motion.button>
      </motion.div>

      {/* Edit House Modal */}
      <AnimatePresence>
        {isEditModalOpen && houseToEdit && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={handleCloseEditModal}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg bg-white/10 backdrop-blur-2xl border border-white/20 rounded-3xl shadow-2xl overflow-hidden"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-6 border-b border-white/10">
                <h2 className="text-2xl font-bold text-white">Edit Property</h2>
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={handleCloseEditModal}
                  className="p-2 hover:bg-white/10 rounded-xl transition-colors"
                >
                  <X className="w-5 h-5 text-gray-400" />
                </motion.button>
              </div>

              {/* Modal Content */}
              <form onSubmit={handleUpdateHouse} className="p-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Property Address
                    </label>
                    <input
                      type="text"
                      name="address"
                      defaultValue={houseToEdit.address}
                      required
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-300"
                      placeholder="Enter property address"
                    />
                  </div>

                  <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                    <p className="text-blue-300 text-sm">
                      ℹ️ Note: You can only edit the address. GPS coordinates and other settings cannot be changed here.
                    </p>
                  </div>

                  <div className="flex gap-3 pt-4">
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      type="button"
                      onClick={handleCloseEditModal}
                      className="flex-1 px-6 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-xl font-semibold transition-all duration-300"
                    >
                      Cancel
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      type="submit"
                      className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-xl font-semibold transition-all duration-300 flex items-center justify-center gap-2"
                    >
                      <Save className="w-5 h-5" />
                      Save Changes
                    </motion.button>
                  </div>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* AgniShakti AI Assistant Chat */}
      <AgniShaktiChat />

      {/* Location Picker Modal */}
      {showLocationPicker && (
        <LocationPicker
          onLocationSelect={handleLocationSelect}
          onClose={() => setShowLocationPicker(false)}
          initialLocation={selectedLocation}
        />
      )}
    </div>
  );
};

export default OwnerDashboard;