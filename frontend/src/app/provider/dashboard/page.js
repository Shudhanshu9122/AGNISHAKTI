// 'use client';

// import { useAuth } from '@/context/AuthContext';
// import { useRouter } from 'next/navigation';
// import { useEffect, useState } from 'react';
// import { Shield, Users, AlertTriangle, MapPin, Phone, Building } from 'lucide-react';

// export default function ProviderDashboardPage() {
//   const { currentUser, loading } = useAuth();
//   const router = useRouter();
//   const [user, setUser] = useState(null);
//   const [dashboardData, setDashboardData] = useState([]);
//   const [loadingData, setLoadingData] = useState(true);

//   useEffect(() => {
//     if (!loading && !currentUser) {
//       router.push('/');
//     }
//   }, [currentUser, loading, router]);

//   useEffect(() => {
//     if (currentUser) {
//       fetchUserAndDashboardData();
//     }
//   }, [currentUser]);

//   const fetchUserAndDashboardData = async () => {
//     try {
//       setLoadingData(true);

//       // Fetch user details
//       const userResponse = await fetch('/api/auth/login', {
//         method: 'POST',
//         headers: { 'Content-Type': 'application/json' },
//         body: JSON.stringify({ email: currentUser.email })
//       });

//       if (userResponse.ok) {
//         const userData = await userResponse.json();
//         setUser(userData.user);

//         // Fetch provider dashboard data
//         const dashboardResponse = await fetch(`/api/provider/dashboard?providerEmail=${currentUser.email}`);
//         if (dashboardResponse.ok) {
//           const dashboardData = await dashboardResponse.json();
//           setDashboardData(dashboardData.dashboard || []);
//         }
//       }
//     } catch (err) {
//       console.error('Error fetching provider data:', err);
//     } finally {
//       setLoadingData(false);
//     }
//   };

//   if (loading || loadingData) {
//     return (
//       <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center">
//         <div className="w-16 h-16 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
//       </div>
//     );
//   }

//   if (!currentUser) {
//     return null;
//   }

//   return (
//     <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800">
//       {/* Header */}
//       <header className="p-6 border-b border-white/10 bg-black/20 backdrop-blur-md">
//         <div className="max-w-7xl mx-auto flex items-center justify-between">
//           <div className="flex items-center gap-4">
//             <div className="w-12 h-12 bg-gradient-to-r from-orange-400 to-red-500 rounded-xl flex items-center justify-center">
//               <Shield className="w-6 h-6 text-white" />
//             </div>
//             <div>
//               <h1 className="text-2xl font-bold text-white">Emergency Services Dashboard</h1>
//               <p className="text-gray-400">Welcome, {user?.name || 'Provider'}</p>
//             </div>
//           </div>
//         </div>
//       </header>

//       {/* Main Content */}
//       <div className="p-6 max-w-7xl mx-auto">
//         <div className="mb-8">
//           <h2 className="text-4xl font-bold text-white mb-2">Fire Station Dashboard</h2>
//           <p className="text-gray-400">Monitor properties in your coverage area</p>
//         </div>

//         {dashboardData.length === 0 ? (
//           <div className="text-center py-16">
//             <div className="w-24 h-24 bg-gradient-to-r from-gray-600 to-gray-700 rounded-full flex items-center justify-center mx-auto mb-6">
//               <Building className="w-12 h-12 text-white" />
//             </div>
//             <h3 className="text-2xl font-bold text-white mb-4">No Properties Assigned</h3>
//             <p className="text-gray-400 mb-8">You haven't been assigned to any fire stations yet.</p>
//             <div className="p-6 bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl max-w-md mx-auto">
//               <h4 className="text-lg font-semibold text-white mb-4">Provider Information</h4>
//               <div className="space-y-3 text-left">
//                 <div className="flex items-center gap-3">
//                   <Users className="w-5 h-5 text-orange-400" />
//                   <span className="text-gray-300">Name: {user?.name || 'N/A'}</span>
//                 </div>
//                 <div className="flex items-center gap-3">
//                   <Shield className="w-5 h-5 text-orange-400" />
//                   <span className="text-gray-300">Role: {user?.role || 'N/A'}</span>
//                 </div>
//                 <div className="flex items-center gap-3">
//                   <AlertTriangle className="w-5 h-5 text-orange-400" />
//                   <span className="text-gray-300">Assigned Stations: {user?.assignedStations?.length || 0}</span>
//                 </div>
//               </div>
//             </div>
//           </div>
//         ) : (
//           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
//             {dashboardData.map((house, index) => (
//               <div
//                 key={house.houseId}
//                 className="p-6 bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl hover:bg-white/10 hover:border-white/20 transition-all duration-300 shadow-2xl"
//               >
//                 <div className="flex items-start justify-between mb-4">
//                   <div className="w-14 h-14 bg-gradient-to-r from-blue-400 to-purple-500 rounded-2xl flex items-center justify-center">
//                     <Building className="w-7 h-7 text-white" />
//                   </div>
//                   {house.activeAlerts?.length > 0 && (
//                     <div className="flex items-center gap-1 px-3 py-1 bg-red-500/20 border border-red-500/30 rounded-full">
//                       <AlertTriangle className="w-4 h-4 text-red-400" />
//                       <span className="text-sm text-red-400">{house.activeAlerts.length} alerts</span>
//                     </div>
//                   )}
//                 </div>

//                 <h3 className="text-xl font-bold text-white mb-2">Property</h3>
//                 <p className="text-gray-400 text-sm mb-4 line-clamp-2">{house.address}</p>

//                 <div className="space-y-2 mb-4">
//                   <div className="flex items-center gap-2">
//                     <MapPin className="w-4 h-4 text-orange-400" />
//                     <span className="text-sm text-gray-300">
//                       {house.coords?.lat?.toFixed(4)}, {house.coords?.lng?.toFixed(4)}
//                     </span>
//                   </div>
//                   <div className="flex items-center gap-2">
//                     <Users className="w-4 h-4 text-orange-400" />
//                     <span className="text-sm text-gray-300">Owner: {house.ownerEmail}</span>
//                   </div>
//                 </div>

//                 {house.activeAlerts?.length > 0 && (
//                   <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
//                     <h4 className="text-sm font-semibold text-red-400 mb-2">Active Alerts</h4>
//                     {house.activeAlerts.map((alert, alertIndex) => (
//                       <div key={alertIndex} className="text-xs text-red-300">
//                         Status: {alert.status} - {new Date(alert.timestamp?.toDate?.() || alert.timestamp).toLocaleString()}
//                       </div>
//                     ))}
//                   </div>
//                 )}
//               </div>
//             ))}
//           </div>
//         )}
//       </div>
//     </div>
//   );
// }
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Toaster, toast } from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import {
  Shield, AlertTriangle, MapPin, Phone, Building, Mail, User,
  Navigation, ChevronDown, ChevronUp, Clock, Zap,
  Flame, Eye, RefreshCw, ExternalLink, Home, Calendar,
  Activity, CheckCircle, Bell, XCircle, Loader, Camera, LogOut
} from 'lucide-react';
import ResponderLocationTracker from '@/components/ResponderLocationTracker';

// Constants
const VIDEO_URL = "/uploads/dashboard_bg.mp4";
const POLL_INTERVAL = 5000; // 5 seconds
const IMAGE_UPDATE_INTERVAL = 30000; // 30 seconds

// Status badge configurations
const STATUS_CONFIGS = {
  CONFIRMED_BY_GEMINI: {
    label: 'Fire Confirmed',
    color: 'bg-green-500/20 border-green-500/30 text-green-300',
    icon: CheckCircle,
    pulse: true
  },
  SENDING_NOTIFICATIONS: {
    label: 'Sending Alerts',
    color: 'bg-yellow-500/20 border-yellow-500/30 text-yellow-300',
    icon: Bell,
    pulse: true
  },
  NOTIFIED_COOLDOWN: {
    label: 'Alert Cooldown',
    color: 'bg-blue-500/20 border-blue-500/30 text-blue-300',
    icon: Clock,
    pulse: false
  },
  PENDING: {
    label: 'Pending Review',
    color: 'bg-orange-500/20 border-orange-500/30 text-orange-300',
    icon: AlertTriangle,
    pulse: false
  },
  DISPATCHED: {
    label: 'Dispatched',
    color: 'bg-red-500/20 border-red-500/30 text-red-300',
    icon: Flame,
    pulse: true
  }
};

const ProviderDashboard = () => {
  const { currentUser, loading: authLoading, signOutUser } = useAuth();
  const router = useRouter();

  // State Management
  const [dashboardData, setDashboardData] = useState([]);
  const [expandedAlerts, setExpandedAlerts] = useState(new Set());
  const [imageUpdateKey, setImageUpdateKey] = useState(Date.now());
  const [loading, setLoading] = useState(true);
  const [ownerDetailsCache, setOwnerDetailsCache] = useState({});
  const [houseDetailsCache, setHouseDetailsCache] = useState({});
  const [lastUpdateTime, setLastUpdateTime] = useState(new Date());
  const [isPolling, setIsPolling] = useState(true);

  // Convert Python service URL to Next.js API proxy URL
  const getPublicImageUrl = (imageUrl) => {
    if (!imageUrl) return null;

    // If it's already a Next.js API URL, return as-is
    if (imageUrl.includes('/api/snapshots/')) {
      // If it's already a full URL, return as-is
      if (imageUrl.startsWith('http')) {
        return imageUrl;
      }
      // If it's relative, return as-is (browser will resolve it)
      return imageUrl;
    }

    // Extract imageId from Python service URL (e.g., http://127.0.0.1:8000/snapshots/uuid.jpg)
    let imageId = null;
    if (imageUrl.includes('/snapshots/')) {
      imageId = imageUrl.split('/snapshots/')[1];
      // Remove query params if any
      imageId = imageId.split('?')[0];
    } else if (imageUrl.startsWith('http')) {
      // If it's a full URL but not our format, return as-is
      return imageUrl;
    } else {
      // If it's just an imageId/filename, use it directly
      imageId = imageUrl;
    }

    if (!imageId) return imageUrl; // Fallback to original URL

    // Construct Next.js API proxy URL (relative URL works fine in browser)
    return `/api/snapshots/${imageId}`;
  };

  // Refs
  const pollIntervalRef = useRef(null);
  const imageIntervalRef = useRef(null);

  // Redirect if not authenticated or not a provider
  useEffect(() => {
    if (!authLoading) {
      if (!currentUser) {
        router.push('/');
      } else if (currentUser.role && currentUser.role !== 'provider') {
        // Only providers should access this dashboard
        router.push('/');
      }
    }
  }, [currentUser, authLoading, router]);

  // Timestamp Utilities
  const getTimestamp = (timestamp) => {
    if (!timestamp) return null;

    try {
      if (timestamp.toDate) {
        const date = timestamp.toDate();
        return isNaN(date.getTime()) ? null : date;
      }
      if (timestamp instanceof Date) {
        return isNaN(timestamp.getTime()) ? null : timestamp;
      }
      if (typeof timestamp === 'object' && timestamp.seconds) {
        const date = new Date(timestamp.seconds * 1000);
        return isNaN(date.getTime()) ? null : date;
      }
      if (typeof timestamp === 'string' || typeof timestamp === 'number') {
        const date = new Date(timestamp);
        return isNaN(date.getTime()) ? null : date;
      }
    } catch (err) {
      console.error('Error parsing timestamp:', err, timestamp);
      return null;
    }

    return null;
  };

  const formatDate = (timestamp) => {
    try {
      const date = getTimestamp(timestamp);
      if (!date || isNaN(date.getTime())) return 'N/A';

      return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }).format(date);
    } catch (err) {
      console.error('Error formatting date:', err, timestamp);
      return 'N/A';
    }
  };

  const formatTimeAgo = (timestamp) => {
    try {
      const date = getTimestamp(timestamp);
      if (!date || isNaN(date.getTime())) return 'Unknown';

      const seconds = Math.floor((new Date() - date) / 1000);

      if (seconds < 0) return 'Just now'; // Handle future dates
      if (seconds < 60) return `${seconds}s ago`;
      if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
      if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
      return `${Math.floor(seconds / 86400)}d ago`;
    } catch (err) {
      console.error('Error formatting time ago:', err, timestamp);
      return 'Unknown';
    }
  };

  // Fetch Dashboard Data
  const fetchDashboardData = async (showToast = false) => {
    if (!currentUser?.email) return;

    try {
      const response = await fetch(`/api/provider/dashboard?providerEmail=${encodeURIComponent(currentUser.email)}`);

      if (!response.ok) {
        throw new Error(`Failed to fetch dashboard: ${response.status}`);
      }

      const data = await response.json();

      if (data.success && data.dashboard) {
        setDashboardData(data.dashboard);
        setLastUpdateTime(new Date());

        if (showToast) {
          toast.success('Dashboard updated', {
            duration: 2000,
            position: 'top-right'
          });
        }
      }
    } catch (err) {
      console.error('Error fetching dashboard:', err);
      if (showToast) {
        toast.error('Failed to update dashboard');
      }
    } finally {
      setLoading(false);
    }
  };

  // Fetch Owner Details
  const fetchOwnerDetails = async (ownerEmail) => {
    if (ownerDetailsCache[ownerEmail]) {
      return ownerDetailsCache[ownerEmail];
    }

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: ownerEmail })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.user) {
          setOwnerDetailsCache(prev => ({ ...prev, [ownerEmail]: data.user }));
          return data.user;
        } else if (data.user) {
          // Fallback for different response structure
          setOwnerDetailsCache(prev => ({ ...prev, [ownerEmail]: data.user }));
          return data.user;
        }
      }
    } catch (err) {
      console.error('Error fetching owner details:', err);
    }
    return null;
  };

  // Fetch House Details
  const fetchHouseDetails = async (houseId) => {
    if (houseDetailsCache[houseId]) {
      return houseDetailsCache[houseId];
    }

    try {
      const response = await fetch(`/api/houses/${houseId}`);

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.house) {
          setHouseDetailsCache(prev => ({ ...prev, [houseId]: data.house }));
          return data.house;
        } else if (data.house) {
          // Fallback for different response structure
          setHouseDetailsCache(prev => ({ ...prev, [houseId]: data.house }));
          return data.house;
        }
      }
    } catch (err) {
      console.error('Error fetching house details:', err);
    }
    return null;
  };

  // Toggle Alert Expansion
  const toggleAlert = async (alertId, ownerEmail, houseId) => {
    setExpandedAlerts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(alertId)) {
        newSet.delete(alertId);
      } else {
        newSet.add(alertId);
        // Prefetch owner and house details
        if (ownerEmail && !ownerDetailsCache[ownerEmail]) {
          fetchOwnerDetails(ownerEmail);
        }
        if (houseId && !houseDetailsCache[houseId]) {
          fetchHouseDetails(houseId);
        }
      }
      return newSet;
    });
  };

  // Navigate to Location
  const navigateToLocation = (coords, address) => {
    if (coords && coords.lat && coords.lng) {
      const mapsUrl = `https://www.google.com/maps?q=${coords.lat},${coords.lng}`;
      window.open(mapsUrl, '_blank');
      toast.success('Opening location in Google Maps');
    } else {
      toast.error('Location coordinates not available');
    }
  };

  // Manual Refresh
  const handleManualRefresh = () => {
    fetchDashboardData(true);
    setImageUpdateKey(Date.now());
  };

  // Mark Alert as Responded (Delete)
  const handleMarkAsResponded = async (alertId) => {
    try {
      const response = await fetch('/api/alerts/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alertId })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        toast.success('Alert marked as responded');

        // Remove the alert from local state immediately (optimistic update)
        setDashboardData(prev =>
          prev.map(house => ({
            ...house,
            activeAlerts: (house.activeAlerts || []).filter(alert => alert.alertId !== alertId)
          }))
        );

        // Remove from expanded alerts if it was expanded
        setExpandedAlerts(prev => {
          const newSet = new Set(prev);
          newSet.delete(alertId);
          return newSet;
        });

        // Refresh dashboard data to ensure consistency
        setTimeout(() => {
          fetchDashboardData(false);
        }, 500);
      } else {
        throw new Error(data.message || 'Failed to mark alert as responded');
      }
    } catch (err) {
      console.error('Error marking alert as responded:', err);
      toast.error(err.message || 'Failed to mark alert as responded');
    }
  };

  // Initial Load
  useEffect(() => {
    if (currentUser?.email) {
      fetchDashboardData();
    }
  }, [currentUser]);

  // Polling for Updates
  useEffect(() => {
    if (!currentUser?.email || !isPolling) return;

    pollIntervalRef.current = setInterval(() => {
      fetchDashboardData(false);
    }, POLL_INTERVAL);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [currentUser, isPolling]);

  // Image Update Interval - Trigger backend to update images every 30 seconds
  // Only fires when there are active, non-expired alerts to update
  useEffect(() => {
    const updateImages = async () => {
      // Only call backend if there are active non-expired alerts
      const activeAlerts = getAllAlerts();
      if (activeAlerts.length === 0) {
        console.log('[IMAGE_UPDATE] No active alerts — skipping image update.');
        return;
      }

      try {
        await fetch('/api/alerts/update-images', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        // Also update the frontend cache-busting key
        setImageUpdateKey(Date.now());
      } catch (err) {
        console.error('Error updating alert images:', err);
      }
    };

    // Call immediately on mount, then every 30 seconds
    updateImages();
    imageIntervalRef.current = setInterval(updateImages, IMAGE_UPDATE_INTERVAL);

    return () => {
      if (imageIntervalRef.current) {
        clearInterval(imageIntervalRef.current);
      }
    };
  }, [dashboardData]);

  // Flatten alerts from all houses
  const getAllAlerts = () => {
    const alerts = [];
    const activeStatuses = ['CONFIRMED_BY_GEMINI', 'SENDING_NOTIFICATIONS', 'NOTIFIED_COOLDOWN', 'DISPATCHED'];
    const now = Date.now();

    dashboardData.forEach(house => {
      if (house.activeAlerts && house.activeAlerts.length > 0) {
        house.activeAlerts.forEach(alert => {
          // Client-side filter as safety measure (backend should already filter)
          if (!activeStatuses.includes(alert.status)) return;

          // Skip NOTIFIED_COOLDOWN alerts whose cooldown has already expired
          if (alert.status === 'NOTIFIED_COOLDOWN' && alert.cooldownExpiresAt) {
            const expiresMs =
              alert.cooldownExpiresAt.seconds
                ? alert.cooldownExpiresAt.seconds * 1000
                : new Date(alert.cooldownExpiresAt).getTime();
            if (now >= expiresMs) return; // expired — don't show in UI
          }

          alerts.push({
            ...alert,
            houseData: house
          });
        });
      }
    });

    // Sort by most recent first
    return alerts.sort((a, b) => {
      try {
        const dateA = getTimestamp(a.updatedAt || a.createdAt);
        const dateB = getTimestamp(b.updatedAt || b.createdAt);
        if (!dateA || !dateB || isNaN(dateA.getTime()) || isNaN(dateB.getTime())) {
          // If either date is invalid, maintain order
          return 0;
        }
        return dateB.getTime() - dateA.getTime();
      } catch (err) {
        console.error('Error sorting alerts:', err);
        return 0;
      }
    });
  };

  const allAlerts = getAllAlerts();

  // Loading State
  if (authLoading || loading) {
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
    <div className="min-h-screen relative overflow-hidden bg-gradient-to-br from-slate-900 to-slate-800">
      <Toaster position="top-right" />

      {/* Background Video */}
      <div className="fixed inset-0 z-0">
        <video
          autoPlay
          loop
          muted
          playsInline
          className="w-full h-full object-cover"
        >
          <source src={VIDEO_URL} type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900/95 via-slate-800/90 to-slate-900/95 backdrop-blur-[1px]" />
      </div>

      {/* Main Content */}
      <div className="relative z-10 min-h-screen">
        {/* Header */}
        <header className="sticky top-0 z-20 p-6 border-b border-white/10 bg-black/20 backdrop-blur-md">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-4">
                <motion.div
                  whileHover={{ rotate: 360 }}
                  transition={{ duration: 0.6 }}
                  className="w-12 h-12 bg-gradient-to-r from-orange-400 to-red-500 rounded-xl flex items-center justify-center shadow-lg"
                >
                  <Shield className="w-6 h-6 text-white" />
                </motion.div>
                <div>
                  <h1 className="text-2xl font-bold text-white">Fire Station Dashboard</h1>
                  <p className="text-gray-400">Welcome back, {currentUser?.displayName || currentUser?.email}</p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                {/* Alert Counter */}
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  className="px-4 py-2 bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl"
                >
                  <div className="flex items-center gap-2">
                    <Activity className="w-5 h-5 text-orange-400" />
                    <span className="text-white font-semibold">{allAlerts.length}</span>
                    <span className="text-gray-400 text-sm">Active Alerts</span>
                  </div>
                </motion.div>

                {/* Manual Refresh Button */}
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleManualRefresh}
                  className="p-3 bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl hover:bg-white/10 transition-all duration-300"
                  title="Refresh Dashboard"
                >
                  <RefreshCw className="w-5 h-5 text-white" />
                </motion.button>

                {/* Sign Out Button */}
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={async () => {
                    try {
                      await signOutUser();
                      console.log('[PROVIDER_DASHBOARD] User signed out');
                      router.push('/');
                    } catch (error) {
                      console.error('[PROVIDER_DASHBOARD] Sign out error:', error);
                      toast.error('Failed to sign out');
                    }
                  }}
                  className="p-3 bg-red-500/20 backdrop-blur-xl border border-red-500/30 rounded-xl hover:bg-red-500/30 transition-all duration-300"
                  title="Sign Out"
                >
                  <LogOut className="w-5 h-5 text-red-400" />
                </motion.button>
              </div>
            </div>

            {/* Status Bar */}
            <div className="flex items-center justify-between text-sm mb-4">
              <div className="flex items-center gap-2 text-gray-400">
                <Clock className="w-4 h-4" />
                <span>Last updated: {formatTimeAgo(lastUpdateTime)}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${isPolling ? 'bg-green-400 animate-pulse' : 'bg-gray-400'}`} />
                <span className="text-gray-400">{isPolling ? 'Live' : 'Paused'}</span>
              </div>
            </div>

            {/* LIVE LOCATION TRACKER PANEL */}
            <div className="mb-6">
              <ResponderLocationTracker
                responderId={currentUser?.uid || currentUser?.id}
                responderEmail={currentUser?.email}
                onStatusChange={(status, msg) => {
                  console.log(`[DASHBOARD] Tracker Status: ${status} - ${msg}`);
                  if (status === 'ACTIVE') toast.success('You are now visible to dispatch');
                  if (status === 'OFFLINE') toast('Location tracking stopped');
                }}
              />
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="p-6 pb-20">
          <div className="max-w-7xl mx-auto">
            {allAlerts.length === 0 ? (
              // Empty State
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center justify-center py-20"
              >
                <motion.div
                  animate={{ rotate: [0, 10, -10, 0] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="w-32 h-32 bg-gradient-to-r from-green-400/20 to-emerald-400/20 rounded-full flex items-center justify-center mb-6"
                >
                  <CheckCircle className="w-16 h-16 text-green-400" />
                </motion.div>
                <h2 className="text-3xl font-bold text-white mb-3">All Clear!</h2>
                <p className="text-gray-400 text-center max-w-md">
                  No active fire alerts at the moment. The system is monitoring all properties.
                </p>
              </motion.div>
            ) : (
              // Alert Cards Grid
              <div className="space-y-4">
                <AnimatePresence mode="popLayout">
                  {allAlerts.map((alert, index) => (
                    <AlertCard
                      key={alert.alertId}
                      alert={alert}
                      index={index}
                      isExpanded={expandedAlerts.has(alert.alertId)}
                      onToggle={() => toggleAlert(alert.alertId, alert.houseData.ownerEmail, alert.houseData.houseId)}
                      ownerDetails={ownerDetailsCache[alert.houseData.ownerEmail]}
                      houseDetails={houseDetailsCache[alert.houseData.houseId]}
                      imageUpdateKey={imageUpdateKey}
                      onNavigate={navigateToLocation}
                      onMarkResponded={handleMarkAsResponded}
                      getPublicImageUrl={getPublicImageUrl}
                      formatDate={formatDate}
                      formatTimeAgo={formatTimeAgo}
                    />
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Ambient Particles */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-5">
        {[...Array(15)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 bg-orange-400/20 rounded-full"
            initial={{
              x: Math.random() * (typeof window !== 'undefined' ? window.innerWidth : 1920),
              y: typeof window !== 'undefined' ? window.innerHeight + 10 : 1080,
            }}
            animate={{
              y: -10,
              x: Math.random() * (typeof window !== 'undefined' ? window.innerWidth : 1920),
            }}
            transition={{
              duration: Math.random() * 15 + 15,
              repeat: Infinity,
              ease: "linear",
              delay: Math.random() * 10,
            }}
          />
        ))}
      </div>
    </div>
  );
};

// Alert Card Component
const AlertCard = ({
  alert,
  index,
  isExpanded,
  onToggle,
  ownerDetails,
  houseDetails,
  imageUpdateKey,
  onNavigate,
  onMarkResponded,
  getPublicImageUrl,
  formatDate,
  formatTimeAgo
}) => {
  const [imageLoading, setImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const statusConfig = STATUS_CONFIGS[alert.status] || STATUS_CONFIGS.PENDING;
  const StatusIcon = statusConfig.icon;

  // Reset image state when update key changes
  useEffect(() => {
    setImageLoading(true);
    setImageError(false);
  }, [imageUpdateKey]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      layout
      className="group"
    >
      <div className="p-6 bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl hover:bg-white/10 hover:border-white/20 transition-all duration-300 shadow-2xl">
        {/* Collapsed Header - Always Visible */}
        <div
          className="flex items-center justify-between cursor-pointer"
          onClick={onToggle}
        >
          <div className="flex items-center gap-4 flex-1">
            {/* Fire Icon */}
            <motion.div
              animate={statusConfig.pulse ? { scale: [1, 1.1, 1] } : {}}
              transition={{ duration: 2, repeat: Infinity }}
              className="w-14 h-14 bg-gradient-to-r from-orange-400 to-red-500 rounded-2xl flex items-center justify-center shadow-lg"
            >
              <Flame className="w-7 h-7 text-white" />
            </motion.div>

            {/* Alert Info */}
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h3 className="text-xl font-bold text-white">
                  Alert #{alert.alertId.slice(-6).toUpperCase()}
                </h3>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${statusConfig.color}`}>
                  <div className="flex items-center gap-1.5">
                    <StatusIcon className="w-3 h-3" />
                    {statusConfig.label}
                  </div>
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-sm">
                <div className="flex items-center gap-1.5 text-gray-300">
                  <MapPin className="w-4 h-4" />
                  <span>{alert.houseData.address}</span>
                </div>
                {ownerDetails && (
                  <div className="flex items-center gap-1.5 text-gray-400">
                    <User className="w-4 h-4" />
                    <span>{ownerDetails.name}</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5 text-gray-400">
                  <Clock className="w-4 h-4" />
                  <span>{formatTimeAgo(alert.createdAt)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Expand Button */}
          <motion.div
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.3 }}
            className="p-2 hover:bg-white/10 rounded-xl transition-colors"
          >
            <ChevronDown className="w-6 h-6 text-gray-400" />
          </motion.div>
        </div>

        {/* Expanded Content */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden"
            >
              <div className="mt-6 pt-6 border-t border-white/10 space-y-6">
                {/* Detection Image */}
                <div className="relative">
                  <h4 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                    <Camera className="w-5 h-5 text-orange-400" />
                    Live Detection Feed
                  </h4>
                  <div className="relative rounded-2xl overflow-hidden bg-black/30 border border-white/10">
                    {imageLoading && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm z-10">
                        <Loader className="w-8 h-8 text-orange-400 animate-spin" />
                      </div>
                    )}
                    {imageError || !alert.detectionImage ? (
                      <div className="aspect-video flex flex-col items-center justify-center text-gray-400">
                        <XCircle className="w-12 h-12 mb-2" />
                        <p>{alert.detectionImage ? 'Failed to load image' : 'Image not available'}</p>
                      </div>
                    ) : (
                      <img
                        src={`${getPublicImageUrl ? getPublicImageUrl(alert.detectionImage) : alert.detectionImage}?t=${imageUpdateKey}`}
                        alt="Fire detection snapshot"
                        className="w-full h-auto"
                        onLoad={() => setImageLoading(false)}
                        onError={() => {
                          setImageLoading(false);
                          setImageError(true);
                        }}
                      />
                    )}
                    {/* Detection Overlay */}
                    {alert.className && (
                      <div className="absolute top-4 left-4 flex gap-2">
                        <div className="px-3 py-1.5 bg-black/70 backdrop-blur-sm rounded-lg border border-white/20 text-white text-sm font-semibold">
                          {(alert.className || 'unknown').toUpperCase()}
                        </div>
                        {alert.confidence !== undefined && (
                          <div className="px-3 py-1.5 bg-black/70 backdrop-blur-sm rounded-lg border border-white/20 text-white text-sm">
                            {(alert.confidence * 100).toFixed(1)}% Confidence
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Two Column Layout */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Owner Details */}
                  <div className="p-5 bg-white/5 rounded-2xl border border-white/10">
                    <h4 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                      <User className="w-5 h-5 text-blue-400" />
                      Property Owner
                    </h4>
                    {ownerDetails ? (
                      <div className="space-y-3">
                        <div className="flex items-start gap-3">
                          <User className="w-4 h-4 text-gray-400 mt-1" />
                          <div>
                            <p className="text-xs text-gray-500 uppercase tracking-wide">Name</p>
                            <p className="text-white font-medium">{ownerDetails.name}</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-3">
                          <Mail className="w-4 h-4 text-gray-400 mt-1" />
                          <div>
                            <p className="text-xs text-gray-500 uppercase tracking-wide">Email</p>
                            <p className="text-white font-medium break-all">{ownerDetails.email}</p>
                          </div>
                        </div>
                        {ownerDetails.phone && (
                          <div className="flex items-start gap-3">
                            <Phone className="w-4 h-4 text-gray-400 mt-1" />
                            <div>
                              <p className="text-xs text-gray-500 uppercase tracking-wide">Phone</p>
                              <p className="text-white font-medium">{ownerDetails.phone}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center justify-center py-4">
                        <Loader className="w-5 h-5 text-gray-400 animate-spin" />
                      </div>
                    )}
                  </div>

                  {/* Property Details */}
                  <div className="p-5 bg-white/5 rounded-2xl border border-white/10">
                    <h4 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                      <Home className="w-5 h-5 text-green-400" />
                      Property Details
                    </h4>
                    <div className="space-y-3">
                      <div className="flex items-start gap-3">
                        <MapPin className="w-4 h-4 text-gray-400 mt-1" />
                        <div>
                          <p className="text-xs text-gray-500 uppercase tracking-wide">Address</p>
                          <p className="text-white font-medium">{alert.houseData.address}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <Navigation className="w-4 h-4 text-gray-400 mt-1" />
                        <div>
                          <p className="text-xs text-gray-500 uppercase tracking-wide">Coordinates</p>
                          <p className="text-white font-medium">
                            {alert.houseData.coords?.lat && alert.houseData.coords?.lng
                              ? `${alert.houseData.coords.lat.toFixed(6)}, ${alert.houseData.coords.lng.toFixed(6)}`
                              : 'Not available'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <Building className="w-4 h-4 text-gray-400 mt-1" />
                        <div>
                          <p className="text-xs text-gray-500 uppercase tracking-wide">Property ID</p>
                          <p className="text-white font-medium font-mono text-sm">{alert.houseData.houseId.slice(0, 12)}...</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Detection Details */}
                <div className="p-5 bg-white/5 rounded-2xl border border-white/10">
                  <h4 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <Eye className="w-5 h-5 text-purple-400" />
                    Detection Analysis
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Detection Class</p>
                      <p className="text-white font-semibold text-lg capitalize">{alert.className || 'Unknown'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Confidence Score</p>
                      <p className="text-white font-semibold text-lg">
                        {alert.confidence !== undefined ? `${(alert.confidence * 100).toFixed(2)}%` : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Detection Time</p>
                      <p className="text-white font-medium">{formatDate(alert.createdAt)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Last Update</p>
                      <p className="text-white font-medium">{formatDate(alert.updatedAt)}</p>
                    </div>
                  </div>
                </div>

                {/* Gemini Verification */}
                {alert.geminiCheck && (
                  <div className="p-5 bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-2xl border border-purple-500/20">
                    <h4 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                      <Zap className="w-5 h-5 text-purple-400" />
                      AI Verification (Gemini)
                    </h4>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-300">Fire Detected:</span>
                        <span className={`px-3 py-1 rounded-lg font-semibold ${alert.geminiCheck.isFire ? 'bg-red-500/20 text-red-300 border border-red-500/30' : 'bg-green-500/20 text-green-300 border border-green-500/30'}`}>
                          {alert.geminiCheck.isFire ? 'YES' : 'NO'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-300">Confidence Score:</span>
                        <span className="text-white font-semibold">{(alert.geminiCheck.score * 100).toFixed(1)}%</span>
                      </div>
                      {alert.geminiCheck.reason && (
                        <div>
                          <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Analysis Reasoning</p>
                          <p className="text-gray-300 leading-relaxed">{alert.geminiCheck.reason}</p>
                        </div>
                      )}
                      {alert.geminiCheck.fireIndicators && alert.geminiCheck.fireIndicators.length > 0 && (
                        <div>
                          <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Fire Indicators Detected</p>
                          <div className="flex flex-wrap gap-2">
                            {alert.geminiCheck.fireIndicators.map((indicator, idx) => (
                              <span key={idx} className="px-3 py-1 bg-red-500/20 border border-red-500/30 rounded-lg text-red-300 text-sm">
                                {indicator}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {alert.geminiCheck.falsePositiveReasons && alert.geminiCheck.falsePositiveReasons.length > 0 && (
                        <div>
                          <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">False Positive Considerations</p>
                          <div className="flex flex-wrap gap-2">
                            {alert.geminiCheck.falsePositiveReasons.map((reason, idx) => (
                              <span key={idx} className="px-3 py-1 bg-yellow-500/20 border border-yellow-500/30 rounded-lg text-yellow-300 text-sm">
                                {reason}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex flex-wrap gap-3">
                  <motion.button
                    whileHover={{ scale: 1.02, y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => onNavigate(alert.houseData.coords, alert.houseData.address)}
                    className="flex-1 min-w-[200px] px-6 py-4 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-xl font-semibold hover:from-orange-600 hover:to-red-700 transition-all duration-300 shadow-lg flex items-center justify-center gap-2"
                  >
                    <Navigation className="w-5 h-5" />
                    Navigate to Location
                    <ExternalLink className="w-4 h-4" />
                  </motion.button>

                  <motion.button
                    whileHover={{ scale: 1.02, y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => onMarkResponded(alert.alertId)}
                    className="flex-1 min-w-[200px] px-6 py-4 bg-white/10 backdrop-blur-md border border-white/20 text-white rounded-xl font-semibold hover:bg-white/20 transition-all duration-300 flex items-center justify-center gap-2"
                  >
                    <CheckCircle className="w-5 h-5" />
                    Mark as Responded
                  </motion.button>
                </div>

                {/* Email Status (if available) */}
                {alert.sentEmails && (
                  <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                    <h4 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                      <Bell className="w-4 h-4 text-blue-400" />
                      Notification Status
                    </h4>
                    <div className="flex gap-4 text-sm">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${alert.sentEmails.ownerSent ? 'bg-green-400' : 'bg-gray-400'}`} />
                        <span className="text-gray-300">Owner: {alert.sentEmails.ownerSent ? 'Notified' : 'Pending'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${alert.sentEmails.stationSent ? 'bg-green-400' : 'bg-gray-400'}`} />
                        <span className="text-gray-300">Station: {alert.sentEmails.stationSent ? 'Notified' : 'Pending'}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Camera and Alert IDs */}
                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/10">
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Alert ID</p>
                    <p className="text-white font-mono text-sm break-all">{alert.alertId}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Camera ID</p>
                    <p className="text-white font-mono text-sm break-all">{alert.cameraId}</p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default ProviderDashboard;