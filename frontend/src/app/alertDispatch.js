/**
 * Intelligent Alert Dispatch System
 * Routes verified fire alerts to nearest active responder based on real-time location
 */

import admin from 'firebase-admin';
import { calculateDistance } from './responderAssignment';

/**
 * Find nearest ACTIVE responder based on real-time location
 * @param {Object} fireLocation - { lat, lng }
 * @param {Object} db - Firestore database instance
 * @returns {Object} - Nearest active responder with distance
 */
export async function findNearestActiveResponder(fireLocation, db) {
    console.log('[ALERT_DISPATCH] Finding nearest ACTIVE responder for fire at:', fireLocation);

    try {
        // Get all ACTIVE responders with recent location updates
        const now = Date.now();
        const fiveMinutesAgo = new Date(now - 5 * 60 * 1000); // 5 minutes ago

        const respondersSnapshot = await db.collection('responderLocations')
            .where('status', '==', 'ACTIVE')
            .get();

        if (respondersSnapshot.empty) {
            console.warn('[ALERT_DISPATCH] ⚠️ No active responders found');
            return {
                responder: null,
                distance: null,
                error: 'No active responders available'
            };
        }

        let nearestResponder = null;
        let minDistance = Infinity;
        const allActiveResponders = [];

        // Calculate distance to each active responder
        respondersSnapshot.forEach((doc) => {
            const responder = doc.data();

            // Check if location exists
            if (!responder.currentLocation ||
                !responder.currentLocation.latitude ||
                !responder.currentLocation.longitude) {
                console.warn(`[ALERT_DISPATCH] Responder ${responder.responderId} has no location`);
                return;
            }

            // Check if location is recent (within last 5 minutes)
            const lastUpdate = responder.lastLocationUpdate?.toDate?.() || new Date(responder.lastLocationUpdate);
            if (lastUpdate < fiveMinutesAgo) {
                console.warn(`[ALERT_DISPATCH] Responder ${responder.responderId} location is stale (${Math.round((now - lastUpdate.getTime()) / 60000)} min old)`);
                return;
            }

            // Calculate distance
            const distance = calculateDistance(
                fireLocation.lat,
                fireLocation.lng,
                responder.currentLocation.latitude,
                responder.currentLocation.longitude
            );

            allActiveResponders.push({
                ...responder,
                distance: distance,
                distanceKm: distance.toFixed(2),
                distanceMiles: (distance * 0.621371).toFixed(2),
                lastUpdateMinutesAgo: Math.round((now - lastUpdate.getTime()) / 60000)
            });

            // Check if this is the nearest responder
            if (distance < minDistance) {
                minDistance = distance;
                nearestResponder = {
                    ...responder,
                    distance: distance,
                    distanceKm: distance.toFixed(2),
                    distanceMiles: (distance * 0.621371).toFixed(2),
                    lastUpdateMinutesAgo: Math.round((now - lastUpdate.getTime()) / 60000)
                };
            }
        });

        if (!nearestResponder) {
            console.warn('[ALERT_DISPATCH] ⚠️ No responders with recent location found');
            return {
                responder: null,
                distance: null,
                error: 'No responders with recent location updates'
            };
        }

        // Sort all responders by distance
        allActiveResponders.sort((a, b) => a.distance - b.distance);

        console.log('[ALERT_DISPATCH] ✅ Found nearest active responder:');
        console.log(`  Responder: ${nearestResponder.responderEmail}`);
        console.log(`  Distance: ${nearestResponder.distanceKm} km (${nearestResponder.distanceMiles} miles)`);
        console.log(`  Location updated: ${nearestResponder.lastUpdateMinutesAgo} min ago`);
        console.log(`  Total active responders evaluated: ${allActiveResponders.length}`);

        // Log top 3 nearest responders
        console.log('[ALERT_DISPATCH] Top 3 nearest active responders:');
        allActiveResponders.slice(0, 3).forEach((resp, idx) => {
            console.log(`  ${idx + 1}. ${resp.responderEmail} - ${resp.distanceKm} km (updated ${resp.lastUpdateMinutesAgo}m ago)`);
        });

        return {
            responder: nearestResponder,
            distance: minDistance,
            allActiveResponders: allActiveResponders.slice(0, 5),
            totalActiveResponders: allActiveResponders.length
        };

    } catch (error) {
        console.error('[ALERT_DISPATCH] ❌ Error finding nearest active responder:', error);
        return {
            responder: null,
            distance: null,
            error: error.message
        };
    }
}

/**
 * Dispatch alert to nearest active responder
 * @param {string} alertId - Alert ID
 * @param {Object} fireLocation - { lat, lng }
 * @param {Object} alertData - Alert details
 * @param {Object} db - Firestore database instance
 */
export async function dispatchAlertToNearestResponder(alertId, fireLocation, alertData, db) {
    console.log(`[ALERT_DISPATCH] Dispatching alert ${alertId} to nearest active responder`);

    try {
        // Find nearest active responder
        const result = await findNearestActiveResponder(fireLocation, db);

        if (!result.responder) {
            console.error('[ALERT_DISPATCH] ❌ No active responder found for dispatch');

            // Fallback: Try to find nearest fire station (even if offline)
            console.log('[ALERT_DISPATCH] Falling back to nearest fire station...');
            const { findNearestResponder } = require('./responderAssignment');
            const stationResult = await findNearestResponder(fireLocation, db);

            if (stationResult.station) {
                console.log(`[ALERT_DISPATCH] ⚠️ Using offline station: ${stationResult.station.name}`);
                return {
                    success: true,
                    dispatchedTo: stationResult.station,
                    method: 'fallback_station',
                    warning: 'No active responders - dispatched to nearest station'
                };
            }

            throw new Error(result.error || 'No responders available');
        }

        // Create alert dispatch record
        const dispatchData = {
            alertId: alertId,
            responderId: result.responder.responderId,
            responderEmail: result.responder.responderEmail,
            dispatchedAt: admin.firestore.FieldValue.serverTimestamp(),
            fireLocation: fireLocation,
            responderLocation: result.responder.currentLocation,
            distance: result.distance,
            distanceKm: result.responder.distanceKm,
            estimatedResponseTime: Math.ceil((result.distance / 60) * 60), // minutes at 60 km/h
            status: 'DISPATCHED',
            alertData: alertData
        };

        // Save dispatch record
        await db.collection('alertDispatches').doc(alertId).set(dispatchData);

        // Update alert with dispatch info
        await db.collection('alerts').doc(alertId).set({
            dispatchedTo: result.responder.responderId,
            dispatchedToEmail: result.responder.responderEmail,
            dispatchedAt: admin.firestore.FieldValue.serverTimestamp(),
            dispatchDistance: result.distance,
            dispatchMethod: 'real_time_location'
        }, { merge: true });

        console.log(`[ALERT_DISPATCH] ✅ Alert ${alertId} dispatched to ${result.responder.responderEmail}`);
        console.log(`[ALERT_DISPATCH] Distance: ${result.responder.distanceKm} km, ETA: ~${dispatchData.estimatedResponseTime} min`);

        return {
            success: true,
            dispatchedTo: result.responder,
            distance: result.distance,
            estimatedResponseTime: dispatchData.estimatedResponseTime,
            alternativeResponders: result.allActiveResponders
        };

    } catch (error) {
        console.error('[ALERT_DISPATCH] ❌ Error dispatching alert:', error);
        throw error;
    }
}

/**
 * Get active responders in a specific radius
 * @param {Object} centerLocation - { lat, lng }
 * @param {number} radiusKm - Radius in kilometers
 * @param {Object} db - Firestore database instance
 */
export async function getActiveRespondersInRadius(centerLocation, radiusKm, db) {
    console.log(`[ALERT_DISPATCH] Finding active responders within ${radiusKm} km of ${centerLocation.lat}, ${centerLocation.lng}`);

    try {
        const respondersSnapshot = await db.collection('responderLocations')
            .where('status', '==', 'ACTIVE')
            .get();

        const respondersInRadius = [];

        respondersSnapshot.forEach((doc) => {
            const responder = doc.data();

            if (!responder.currentLocation?.latitude || !responder.currentLocation?.longitude) {
                return;
            }

            const distance = calculateDistance(
                centerLocation.lat,
                centerLocation.lng,
                responder.currentLocation.latitude,
                responder.currentLocation.longitude
            );

            if (distance <= radiusKm) {
                respondersInRadius.push({
                    ...responder,
                    distance: distance,
                    distanceKm: distance.toFixed(2)
                });
            }
        });

        respondersInRadius.sort((a, b) => a.distance - b.distance);

        console.log(`[ALERT_DISPATCH] Found ${respondersInRadius.length} active responders within ${radiusKm} km`);

        return {
            responders: respondersInRadius,
            totalFound: respondersInRadius.length,
            radiusKm: radiusKm
        };

    } catch (error) {
        console.error('[ALERT_DISPATCH] Error finding responders in radius:', error);
        throw error;
    }
}

/**
 * Get all currently active responders
 * @param {Object} db - Firestore database instance
 */
export async function getAllActiveResponders(db) {
    console.log('[ALERT_DISPATCH] Getting all active responders');

    try {
        const snapshot = await db.collection('responderLocations')
            .where('status', '==', 'ACTIVE')
            .get();

        const activeResponders = [];
        const now = Date.now();

        snapshot.forEach((doc) => {
            const responder = doc.data();
            const lastUpdate = responder.lastLocationUpdate?.toDate?.() || new Date(responder.lastLocationUpdate);
            const minutesAgo = Math.round((now - lastUpdate.getTime()) / 60000);

            activeResponders.push({
                ...responder,
                lastUpdateMinutesAgo: minutesAgo,
                hasRecentLocation: minutesAgo < 5 // Location updated within last 5 minutes
            });
        });

        const recentCount = activeResponders.filter(r => r.hasRecentLocation).length;

        console.log(`[ALERT_DISPATCH] Total active: ${activeResponders.length}, Recent location: ${recentCount}`);

        return {
            responders: activeResponders,
            totalActive: activeResponders.length,
            withRecentLocation: recentCount
        };

    } catch (error) {
        console.error('[ALERT_DISPATCH] Error getting active responders:', error);
        throw error;
    }
}

export default {
    findNearestActiveResponder,
    dispatchAlertToNearestResponder,
    getActiveRespondersInRadius,
    getAllActiveResponders
};
