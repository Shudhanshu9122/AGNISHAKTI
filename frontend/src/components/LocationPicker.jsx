/**
 * LocationPicker Component
 * Automated GPS-based location selection with interactive map fallback
 * Zero manual coordinate entry required
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Navigation, Loader, CheckCircle, AlertCircle, X } from 'lucide-react';
import toast from 'react-hot-toast';

const LocationPicker = ({ onLocationSelect, onClose, initialLocation = null }) => {
    const [location, setLocation] = useState(initialLocation || null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [mapLoaded, setMapLoaded] = useState(false);
    const [accuracy, setAccuracy] = useState(null);
    const mapRef = useRef(null);
    const markerRef = useRef(null);
    const mapInstanceRef = useRef(null);

    // Initialize map
    useEffect(() => {
        if (!window.google) {
            loadGoogleMapsScript();
        } else {
            initializeMap();
        }
    }, []);

    // Auto-detect location on mount
    useEffect(() => {
        if (!initialLocation) {
            getCurrentLocation();
        }
    }, [initialLocation]);

    const loadGoogleMapsScript = () => {
        const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

        // Check if API key is valid
        if (!apiKey || apiKey === 'YOUR_GOOGLE_MAPS_API_KEY_HERE') {
            setError('Google Maps API key not configured. Please add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to .env.local');
            setLoading(false);
            toast.error('Google Maps not configured. Using manual coordinates instead.');
            return;
        }

        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
        script.async = true;
        script.defer = true;
        script.onload = () => initializeMap();
        script.onerror = () => {
            setError('Failed to load Google Maps. Please check your API key.');
            setLoading(false);
        };
        document.head.appendChild(script);
    };

    const initializeMap = () => {
        if (!mapRef.current || !window.google) return;

        const defaultCenter = initialLocation || { lat: 28.6139, lng: 77.2090 }; // Delhi default

        const map = new window.google.maps.Map(mapRef.current, {
            center: defaultCenter,
            zoom: 15,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
            styles: [
                {
                    featureType: 'poi',
                    elementType: 'labels',
                    stylers: [{ visibility: 'off' }]
                }
            ]
        });

        const marker = new window.google.maps.Marker({
            position: defaultCenter,
            map: map,
            draggable: false, // STRICT RULE: No manual dragging
            animation: window.google.maps.Animation.DROP,
            icon: {
                path: window.google.maps.SymbolPath.CIRCLE,
                scale: 10,
                fillColor: '#FF6B35',
                fillOpacity: 1,
                strokeColor: '#FFFFFF',
                strokeWeight: 2,
            }
        });

        // STRICT RULE: No manual map interactions allowed for location setting
        // We removed the dragend and click listeners completely.

        mapInstanceRef.current = map;
        markerRef.current = marker;
        setMapLoaded(true);
    };

    const getCurrentLocation = () => {
        setLoading(true);
        setError(null);

        if (!navigator.geolocation) {
            setError('Geolocation is not supported by your browser');
            setLoading(false);
            toast.error('GPS not available. Please select location on map.');
            return;
        }

        // Request high-accuracy GPS location
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const newLocation = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };

                setLocation(newLocation);
                setAccuracy(position.coords.accuracy);
                setLoading(false);

                // Update map and marker
                if (mapInstanceRef.current && markerRef.current) {
                    mapInstanceRef.current.setCenter(newLocation);
                    mapInstanceRef.current.setZoom(17);
                    markerRef.current.setPosition(newLocation);
                    markerRef.current.setAnimation(window.google.maps.Animation.BOUNCE);
                    setTimeout(() => {
                        markerRef.current.setAnimation(null);
                    }, 2000);
                }

                toast.success(`Location detected! Accuracy: ${Math.round(position.coords.accuracy)}m`);
            },
            (error) => {
                console.error('Geolocation error:', error);
                let errorMessage = 'Unable to get your location';

                switch (error.code) {
                    case error.PERMISSION_DENIED:
                        errorMessage = 'Location permission denied. Please select on map.';
                        break;
                    case error.POSITION_UNAVAILABLE:
                        errorMessage = 'Location unavailable. Please select on map.';
                        break;
                    case error.TIMEOUT:
                        errorMessage = 'Location request timeout. Please select on map.';
                        break;
                }

                setError(errorMessage);
                setLoading(false);
                toast.error(errorMessage);
            },
            {
                enableHighAccuracy: true, // Request GPS
                timeout: 10000,
                maximumAge: 0
            }
        );
    };

    const handleConfirm = () => {
        if (!location) {
            toast.error('Please select a location');
            return;
        }

        onLocationSelect({
            latitude: location.lat,
            longitude: location.lng,
            accuracy: accuracy,
            method: accuracy === 'manual' ? 'map_selection' : 'gps'
        });
    };

    const getAccuracyColor = () => {
        if (accuracy === 'manual') return 'text-blue-400';
        if (accuracy < 10) return 'text-green-400';
        if (accuracy < 50) return 'text-yellow-400';
        return 'text-orange-400';
    };

    const getAccuracyText = () => {
        if (accuracy === 'manual') return 'Manual Selection';
        if (accuracy < 10) return `High Accuracy (${Math.round(accuracy)}m)`;
        if (accuracy < 50) return `Good Accuracy (${Math.round(accuracy)}m)`;
        return `Moderate Accuracy (${Math.round(accuracy)}m)`;
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                className="w-full max-w-4xl bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl shadow-2xl overflow-hidden border border-orange-500/20"
            >
                {/* Header */}
                <div className="p-6 border-b border-white/10 bg-gradient-to-r from-orange-500/10 to-red-500/10">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-gradient-to-r from-orange-500 to-red-600 rounded-xl flex items-center justify-center">
                                <MapPin className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold text-white">Select Property Location</h2>
                                <p className="text-gray-400 text-sm">GPS auto-detection or manual selection</p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-white/10 rounded-xl transition-colors"
                        >
                            <X className="w-6 h-6 text-gray-400" />
                        </button>
                    </div>
                </div>

                {/* Map Container */}
                <div className="relative">
                    <div
                        ref={mapRef}
                        className="w-full h-[500px] bg-slate-800"
                    />

                    {/* Loading Overlay */}
                    {loading && (
                        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center">
                            <div className="text-center">
                                <Loader className="w-12 h-12 text-orange-500 animate-spin mx-auto mb-4" />
                                <p className="text-white font-semibold">Detecting your location...</p>
                                <p className="text-gray-400 text-sm">Using GPS for high accuracy</p>
                            </div>
                        </div>
                    )}

                    {/* Location Info Card */}
                    {location && !loading && (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="absolute top-4 left-4 right-4 bg-slate-900/95 backdrop-blur-xl border border-white/20 rounded-2xl p-4 shadow-2xl"
                        >
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-2">
                                        <CheckCircle className="w-5 h-5 text-green-400" />
                                        <span className="text-white font-semibold">Location Selected</span>
                                    </div>
                                    <div className="space-y-1 text-sm">
                                        <div className="flex items-center gap-2">
                                            <span className="text-gray-400">Latitude:</span>
                                            <span className="text-white font-mono">{location.lat.toFixed(6)}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-gray-400">Longitude:</span>
                                            <span className="text-white font-mono">{location.lng.toFixed(6)}</span>
                                        </div>
                                        {accuracy && (
                                            <div className="flex items-center gap-2">
                                                <span className="text-gray-400">Accuracy:</span>
                                                <span className={`font-semibold ${getAccuracyColor()}`}>
                                                    {getAccuracyText()}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <button
                                    onClick={getCurrentLocation}
                                    disabled={loading}
                                    className="px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl font-semibold hover:from-blue-600 hover:to-blue-700 transition-all duration-300 flex items-center gap-2 disabled:opacity-50"
                                >
                                    <Navigation className="w-4 h-4" />
                                    Re-detect
                                </button>
                            </div>
                        </motion.div>
                    )}

                    {/* Error Message */}
                    {error && (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="absolute top-4 left-4 right-4 bg-red-900/95 backdrop-blur-xl border border-red-500/50 rounded-2xl p-4 shadow-2xl"
                        >
                            <div className="flex items-center gap-3">
                                <AlertCircle className="w-5 h-5 text-red-400" />
                                <div>
                                    <p className="text-white font-semibold">Location Error</p>
                                    <p className="text-red-200 text-sm">{error}</p>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </div>

                {/* Instructions */}
                <div className="p-6 bg-slate-900/50 border-t border-white/10">
                    <div className="grid grid-cols-1 gap-4 mb-6">
                        <div className="flex items-start gap-3">
                            <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                                <Navigation className="w-4 h-4 text-blue-400" />
                            </div>
                            <div>
                                <p className="text-white font-semibold text-sm">GPS Auto-Discovery</p>
                                <p className="text-gray-400 text-xs">System automatically detects high-accuracy coordinates.</p>
                            </div>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="flex-1 px-6 py-3 bg-white/10 text-white rounded-xl font-semibold hover:bg-white/20 transition-all duration-300"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleConfirm}
                            disabled={!location}
                            className="flex-1 px-6 py-3 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-xl font-semibold hover:from-orange-600 hover:to-red-700 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            <CheckCircle className="w-5 h-5" />
                            Confirm Location
                        </button>
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
};

export default LocationPicker;
