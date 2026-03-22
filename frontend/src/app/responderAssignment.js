/**
 * Intelligent Responder Assignment System
 * Automatically assigns nearest fire station to properties
 * Uses Haversine formula for accurate distance calculation
 */

import admin from 'firebase-admin';

/**
 * Haversine formula to calculate distance between two coordinates
 * Returns distance in kilometers
 */
export function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in kilometers
    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return distance;
}

function toRadians(degrees) {
    return degrees * (Math.PI / 180);
}

/**
 * Find nearest available fire station for a property
 * @param {Object} propertyLocation - { lat, lng }
 * @param {Object} db - Firestore database instance
 * @returns {Object} - Nearest station with distance
 */
export async function findNearestResponder(propertyLocation, db) {
    console.log('[RESPONDER_ASSIGNMENT] Finding nearest responder for location:', propertyLocation);

    try {
        // Get all registered fire stations
        const stationsSnapshot = await db.collection('fireStations').get();

        if (stationsSnapshot.empty) {
            console.warn('[RESPONDER_ASSIGNMENT] ⚠️ No fire stations registered in system');
            return {
                station: null,
                distance: null,
                error: 'No fire stations available'
            };
        }

        let nearestStation = null;
        let minDistance = Infinity;
        const allStations = [];

        // Calculate distance to each station
        stationsSnapshot.forEach((doc) => {
            const station = doc.data();

            // Skip if station doesn't have coordinates
            if (!station.coords || !station.coords.lat || !station.coords.lng) {
                console.warn(`[RESPONDER_ASSIGNMENT] Station ${station.stationId} missing coordinates`);
                return;
            }

            const distance = calculateDistance(
                propertyLocation.lat,
                propertyLocation.lng,
                station.coords.lat,
                station.coords.lng
            );

            allStations.push({
                ...station,
                distance: distance,
                distanceKm: distance.toFixed(2),
                distanceMiles: (distance * 0.621371).toFixed(2)
            });

            // Check if this is the nearest station
            if (distance < minDistance) {
                minDistance = distance;
                nearestStation = {
                    ...station,
                    distance: distance,
                    distanceKm: distance.toFixed(2),
                    distanceMiles: (distance * 0.621371).toFixed(2)
                };
            }
        });

        // Sort all stations by distance for logging
        allStations.sort((a, b) => a.distance - b.distance);

        console.log('[RESPONDER_ASSIGNMENT] ✅ Found nearest responder:');
        console.log(`  Station: ${nearestStation.name}`);
        console.log(`  Distance: ${nearestStation.distanceKm} km (${nearestStation.distanceMiles} miles)`);
        console.log(`  Total stations evaluated: ${allStations.length}`);

        // Log top 3 nearest stations
        console.log('[RESPONDER_ASSIGNMENT] Top 3 nearest stations:');
        allStations.slice(0, 3).forEach((station, idx) => {
            console.log(`  ${idx + 1}. ${station.name} - ${station.distanceKm} km`);
        });

        return {
            station: nearestStation,
            distance: minDistance,
            allNearbyStations: allStations.slice(0, 5), // Return top 5 for reference
            totalStationsEvaluated: allStations.length
        };

    } catch (error) {
        console.error('[RESPONDER_ASSIGNMENT] ❌ Error finding nearest responder:', error);
        return {
            station: null,
            distance: null,
            error: error.message
        };
    }
}

/**
 * Assign responder to property and update database
 * @param {string} houseId - Property ID
 * @param {Object} location - { lat, lng }
 * @param {Object} db - Firestore database instance
 */
export async function assignResponderToProperty(houseId, location, db) {
    console.log(`[RESPONDER_ASSIGNMENT] Assigning responder to property ${houseId}`);

    try {
        // Find nearest responder
        const result = await findNearestResponder(location, db);

        if (!result.station) {
            console.error('[RESPONDER_ASSIGNMENT] ❌ No responder found');
            throw new Error(result.error || 'No fire stations available');
        }

        // Update property with assigned responder
        await db.collection('houses').doc(houseId).set({
            nearestFireStationId: result.station.stationId,
            nearestFireStationName: result.station.name,
            distanceToStation: result.distance,
            distanceToStationKm: result.station.distanceKm,
            responderAssignedAt: admin.firestore.FieldValue.serverTimestamp(),
            responderAssignmentMethod: 'automatic_nearest'
        }, { merge: true });

        console.log(`[RESPONDER_ASSIGNMENT] ✅ Successfully assigned ${result.station.name} to property ${houseId}`);
        console.log(`[RESPONDER_ASSIGNMENT] Distance: ${result.station.distanceKm} km`);

        return {
            success: true,
            assignedStation: result.station,
            distance: result.distance,
            alternativeStations: result.allNearbyStations
        };

    } catch (error) {
        console.error('[RESPONDER_ASSIGNMENT] ❌ Error assigning responder:', error);
        throw error;
    }
}

/**
 * Get emergency routing information for an active alert
 * @param {string} houseId - Property ID
 * @param {Object} db - Firestore database instance
 */
export async function getEmergencyRouting(houseId, db) {
    console.log(`[EMERGENCY_ROUTING] Getting routing info for property ${houseId}`);

    try {
        // Get property details
        const houseDoc = await db.collection('houses').doc(houseId).get();

        if (!houseDoc.exists) {
            throw new Error('Property not found');
        }

        const house = houseDoc.data();

        // Get assigned fire station
        if (!house.nearestFireStationId) {
            console.warn('[EMERGENCY_ROUTING] ⚠️ No responder assigned, finding nearest...');
            const assignment = await assignResponderToProperty(houseId, house.coords, db);
            house.nearestFireStationId = assignment.assignedStation.stationId;
        }

        const stationDoc = await db.collection('fireStations').doc(house.nearestFireStationId).get();

        if (!stationDoc.exists) {
            throw new Error('Assigned fire station not found');
        }

        const station = stationDoc.data();

        // Generate Google Maps navigation link
        const navigationUrl = `https://www.google.com/maps/dir/?api=1&origin=${station.coords.lat},${station.coords.lng}&destination=${house.coords.lat},${house.coords.lng}&travelmode=driving`;

        // Calculate estimated response time (assuming average speed of 60 km/h)
        const distanceKm = house.distanceToStation || calculateDistance(
            station.coords.lat,
            station.coords.lng,
            house.coords.lat,
            house.coords.lng
        );
        const estimatedMinutes = Math.ceil((distanceKm / 60) * 60); // Convert to minutes

        const routingInfo = {
            property: {
                id: houseId,
                address: house.address,
                coordinates: house.coords,
                location: `${house.coords.lat}, ${house.coords.lng}`
            },
            responder: {
                id: station.stationId,
                name: station.name,
                phone: station.phone,
                email: station.email,
                coordinates: station.coords,
                location: `${station.coords.lat}, ${station.coords.lng}`
            },
            routing: {
                distance: distanceKm,
                distanceKm: distanceKm.toFixed(2),
                distanceMiles: (distanceKm * 0.621371).toFixed(2),
                estimatedResponseTime: estimatedMinutes,
                navigationUrl: navigationUrl,
                mapUrl: `https://www.google.com/maps?q=${house.coords.lat},${house.coords.lng}`
            }
        };

        console.log('[EMERGENCY_ROUTING] ✅ Routing info generated:');
        console.log(`  From: ${station.name}`);
        console.log(`  To: ${house.address}`);
        console.log(`  Distance: ${routingInfo.routing.distanceKm} km`);
        console.log(`  ETA: ~${estimatedMinutes} minutes`);

        return routingInfo;

    } catch (error) {
        console.error('[EMERGENCY_ROUTING] ❌ Error getting routing info:', error);
        throw error;
    }
}

/**
 * Reassign responder if needed (e.g., station becomes unavailable)
 * @param {string} houseId - Property ID
 * @param {Object} db - Firestore database instance
 */
export async function reassignResponder(houseId, db) {
    console.log(`[RESPONDER_ASSIGNMENT] Reassigning responder for property ${houseId}`);

    try {
        const houseDoc = await db.collection('houses').doc(houseId).get();

        if (!houseDoc.exists) {
            throw new Error('Property not found');
        }

        const house = houseDoc.data();

        // Find new nearest responder
        const result = await assignResponderToProperty(houseId, house.coords, db);

        console.log(`[RESPONDER_ASSIGNMENT] ✅ Reassigned to ${result.assignedStation.name}`);

        return result;

    } catch (error) {
        console.error('[RESPONDER_ASSIGNMENT] ❌ Error reassigning responder:', error);
        throw error;
    }
}

/**
 * Get all properties assigned to a specific fire station
 * @param {string} stationId - Fire station ID
 * @param {Object} db - Firestore database instance
 */
export async function getStationCoverage(stationId, db) {
    console.log(`[RESPONDER_ASSIGNMENT] Getting coverage for station ${stationId}`);

    try {
        const propertiesSnapshot = await db.collection('houses')
            .where('nearestFireStationId', '==', stationId)
            .get();

        const properties = [];
        propertiesSnapshot.forEach((doc) => {
            properties.push({
                id: doc.id,
                ...doc.data()
            });
        });

        console.log(`[RESPONDER_ASSIGNMENT] Station ${stationId} covers ${properties.length} properties`);

        return {
            stationId: stationId,
            totalProperties: properties.length,
            properties: properties
        };

    } catch (error) {
        console.error('[RESPONDER_ASSIGNMENT] ❌ Error getting station coverage:', error);
        throw error;
    }
}

export default {
    calculateDistance,
    findNearestResponder,
    assignResponderToProperty,
    getEmergencyRouting,
    reassignResponder,
    getStationCoverage
};
