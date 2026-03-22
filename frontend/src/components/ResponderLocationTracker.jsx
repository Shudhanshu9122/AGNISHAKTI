/**
 * Real-Time Responder Location Tracker
 * Continuously tracks responder GPS location and updates Firestore
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Navigation, MapPin, Wifi, WifiOff, CheckCircle, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';

const ResponderLocationTracker = ({ responderId, responderEmail, onStatusChange }) => {
    const [isTracking, setIsTracking] = useState(false);
    const [currentLocation, setCurrentLocation] = useState(null);
    const [accuracy, setAccuracy] = useState(null);
    const [lastUpdate, setLastUpdate] = useState(null);
    const [error, setError] = useState(null);
    const watchIdRef = useRef(null);
    const updateIntervalRef = useRef(null);

    useEffect(() => {
        // Start tracking on mount
        startTracking();

        // Cleanup on unmount
        return () => {
            stopTracking();
        };
    }, [responderId]);

    const startTracking = () => {
        if (!navigator.geolocation) {
            setError('GPS not supported by your device');
            toast.error('GPS not available. Please use a device with GPS.');
            onStatusChange?.('INACTIVE', 'GPS not supported');
            return;
        }

        console.log('[RESPONDER_TRACKER] Starting GPS tracking...');

        // Request continuous location updates
        watchIdRef.current = navigator.geolocation.watchPosition(
            (position) => {
                const location = {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                    accuracy: position.coords.accuracy,
                    timestamp: new Date(position.timestamp)
                };

                setCurrentLocation(location);
                setAccuracy(position.coords.accuracy);
                setLastUpdate(new Date());
                setIsTracking(true);
                setError(null);

                // Update Firestore immediately on first location
                if (!isTracking) {
                    updateLocationInFirestore(location);
                    toast.success('GPS tracking active');
                }

                console.log('[RESPONDER_TRACKER] Location updated:', {
                    lat: location.latitude.toFixed(6),
                    lng: location.longitude.toFixed(6),
                    accuracy: Math.round(location.accuracy) + 'm'
                });
            },
            (error) => {
                console.error('[RESPONDER_TRACKER] GPS error:', error);
                handleLocationError(error);
            },
            {
                enableHighAccuracy: true, // Use GPS
                timeout: 10000,
                maximumAge: 0 // Always get fresh location
            }
        );

        // Set up periodic Firestore updates (every 10 seconds)
        updateIntervalRef.current = setInterval(() => {
            if (currentLocation) {
                updateLocationInFirestore(currentLocation);
            }
        }, 10000); // 10 seconds

        onStatusChange?.('ACTIVE', 'GPS tracking started');
    };

    const stopTracking = () => {
        if (watchIdRef.current) {
            navigator.geolocation.clearWatch(watchIdRef.current);
            watchIdRef.current = null;
        }

        if (updateIntervalRef.current) {
            clearInterval(updateIntervalRef.current);
            updateIntervalRef.current = null;
        }

        setIsTracking(false);
        onStatusChange?.('OFFLINE', 'GPS tracking stopped');

        // Mark responder as offline in Firestore
        updateResponderStatus('OFFLINE');

        console.log('[RESPONDER_TRACKER] GPS tracking stopped');
    };

    const updateLocationInFirestore = async (location) => {
        try {
            const response = await fetch('/api/responder/heartbeat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    responderId: responderId,
                    responderEmail: responderEmail,
                    location: {
                        latitude: location.latitude,
                        longitude: location.longitude,
                        accuracy: location.accuracy
                    },
                    status: 'ONLINE' // Explicitly set ONLINE during heartbeat
                })
            });

            if (!response.ok) {
                throw new Error('Failed to update location');
            }

            console.log('[RESPONDER_TRACKER] Heartbeat sent');
        } catch (error) {
            console.error('[RESPONDER_TRACKER] Failed to send heartbeat:', error);
        }
    };

    const updateResponderStatus = async (status) => {
        try {
            await fetch('/api/responder/heartbeat', { // Reuse heartbeat endpoint for status updates
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    responderId: responderId,
                    responderEmail: responderEmail,
                    status: status // e.g., OFFLINE
                })
            });
        } catch (error) {
            console.error('[RESPONDER_TRACKER] Failed to update status:', error);
        }
    };

    const handleLocationError = (error) => {
        let errorMessage = 'Unable to get your location';

        switch (error.code) {
            case error.PERMISSION_DENIED:
                errorMessage = 'GPS permission denied. Please enable location access.';
                onStatusChange?.('INACTIVE', 'GPS permission denied');
                break;
            case error.POSITION_UNAVAILABLE:
                errorMessage = 'Location unavailable. Please check GPS settings.';
                onStatusChange?.('INACTIVE', 'GPS unavailable');
                break;
            case error.TIMEOUT:
                errorMessage = 'Location request timeout. Retrying...';
                // Don't mark as inactive on timeout, just retry
                break;
        }

        setError(errorMessage);
        setIsTracking(false);

        if (error.code !== error.TIMEOUT) {
            toast.error(errorMessage);
            updateResponderStatus('INACTIVE');
        }
    };

    const getAccuracyColor = () => {
        if (!accuracy) return 'text-gray-400';
        if (accuracy < 10) return 'text-green-400';
        if (accuracy < 50) return 'text-yellow-400';
        return 'text-orange-400';
    };

    const getStatusColor = () => {
        if (error) return 'from-red-500 to-red-600';
        if (isTracking) return 'from-green-500 to-green-600';
        return 'from-gray-500 to-gray-600';
    };

    const getStatusIcon = () => {
        if (error) return <WifiOff className="w-4 h-4" />;
        if (isTracking) return <Wifi className="w-4 h-4 animate-pulse" />;
        return <WifiOff className="w-4 h-4" />;
    };

    const getStatusText = () => {
        if (error) return 'GPS Inactive';
        if (isTracking) return 'GPS Active';
        return 'GPS Offline';
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-br from-slate-900 to-slate-800 border border-white/10 rounded-2xl p-4 shadow-xl"
        >
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 bg-gradient-to-r ${getStatusColor()} rounded-xl flex items-center justify-center`}>
                        <Navigation className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h3 className="text-white font-bold">Live Location Tracking</h3>
                        <div className="flex items-center gap-2">
                            {getStatusIcon()}
                            <span className={`text-sm font-semibold ${isTracking ? 'text-green-400' : 'text-gray-400'}`}>
                                {getStatusText()}
                            </span>
                        </div>
                    </div>
                </div>

                <button
                    onClick={isTracking ? stopTracking : startTracking}
                    className={`px-4 py-2 rounded-xl font-semibold transition-all duration-300 ${isTracking
                        ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                        : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                        }`}
                >
                    {isTracking ? 'Stop' : 'Start'}
                </button>
            </div>

            {error && (
                <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="mb-3 p-3 bg-red-900/20 border border-red-500/30 rounded-xl"
                >
                    <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-red-400" />
                        <p className="text-red-300 text-sm">{error}</p>
                    </div>
                </motion.div>
            )}

            {currentLocation && isTracking && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="space-y-2"
                >
                    <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 bg-white/5 rounded-xl">
                            <p className="text-gray-400 text-xs mb-1">Latitude</p>
                            <p className="text-white font-mono text-sm">{currentLocation.latitude.toFixed(6)}</p>
                        </div>
                        <div className="p-3 bg-white/5 rounded-xl">
                            <p className="text-gray-400 text-xs mb-1">Longitude</p>
                            <p className="text-white font-mono text-sm">{currentLocation.longitude.toFixed(6)}</p>
                        </div>
                    </div>

                    <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl">
                        <div>
                            <p className="text-gray-400 text-xs">GPS Accuracy</p>
                            <p className={`font-semibold ${getAccuracyColor()}`}>
                                {accuracy ? `±${Math.round(accuracy)}m` : 'Unknown'}
                            </p>
                        </div>
                        <div className="text-right">
                            <p className="text-gray-400 text-xs">Last Update</p>
                            <p className="text-white text-sm">
                                {lastUpdate ? lastUpdate.toLocaleTimeString() : 'Never'}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 p-3 bg-green-900/20 border border-green-500/30 rounded-xl">
                        <CheckCircle className="w-4 h-4 text-green-400" />
                        <p className="text-green-300 text-sm">
                            You are visible to emergency dispatch system
                        </p>
                    </div>
                </motion.div>
            )}

            {!isTracking && !error && (
                <div className="p-4 bg-yellow-900/20 border border-yellow-500/30 rounded-xl">
                    <div className="flex items-center gap-2 mb-2">
                        <AlertCircle className="w-4 h-4 text-yellow-400" />
                        <p className="text-yellow-300 font-semibold text-sm">GPS Tracking Disabled</p>
                    </div>
                    <p className="text-yellow-200 text-xs">
                        Enable GPS tracking to receive emergency fire alerts in your area.
                    </p>
                </div>
            )}
        </motion.div>
    );
};

export default ResponderLocationTracker;
