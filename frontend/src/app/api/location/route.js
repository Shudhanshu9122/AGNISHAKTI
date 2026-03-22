/**
 * Location and Responder Assignment API
 * Handles automated location detection and responder assignment
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import {
    findNearestResponder,
    assignResponderToProperty,
    getEmergencyRouting,
    reassignResponder
} from '@/app/responderAssignment';

export async function POST(req) {
    try {
        const body = await req.json();
        const { action, houseId, location } = body;

        console.log(`[LOCATION_API] Action: ${action}`);

        switch (action) {
            case 'find_nearest':
                return await handleFindNearest(location);

            case 'assign_responder':
                return await handleAssignResponder(houseId, location);

            case 'get_routing':
                return await handleGetRouting(houseId);

            case 'reassign':
                return await handleReassign(houseId);

            default:
                return NextResponse.json(
                    { error: 'Invalid action' },
                    { status: 400 }
                );
        }

    } catch (error) {
        console.error('[LOCATION_API] Error:', error);
        return NextResponse.json(
            { error: error.message },
            { status: 500 }
        );
    }
}

async function handleFindNearest(location) {
    if (!location || !location.lat || !location.lng) {
        return NextResponse.json(
            { error: 'Location coordinates required' },
            { status: 400 }
        );
    }

    const result = await findNearestResponder(location, db);

    if (!result.station) {
        return NextResponse.json(
            {
                success: false,
                error: result.error,
                message: 'No fire stations available. Please contact support.'
            },
            { status: 404 }
        );
    }

    return NextResponse.json({
        success: true,
        nearestStation: result.station,
        distance: result.distance,
        distanceKm: result.station.distanceKm,
        distanceMiles: result.station.distanceMiles,
        alternativeStations: result.allNearbyStations,
        totalStationsEvaluated: result.totalStationsEvaluated
    });
}

async function handleAssignResponder(houseId, location) {
    if (!houseId) {
        return NextResponse.json(
            { error: 'House ID required' },
            { status: 400 }
        );
    }

    if (!location || !location.lat || !location.lng) {
        return NextResponse.json(
            { error: 'Location coordinates required' },
            { status: 400 }
        );
    }

    const result = await assignResponderToProperty(houseId, location, db);

    return NextResponse.json({
        success: true,
        message: `Assigned ${result.assignedStation.name} as emergency responder`,
        assignedStation: result.assignedStation,
        distance: result.distance,
        distanceKm: result.assignedStation.distanceKm,
        alternativeStations: result.alternativeStations
    });
}

async function handleGetRouting(houseId) {
    if (!houseId) {
        return NextResponse.json(
            { error: 'House ID required' },
            { status: 400 }
        );
    }

    const routingInfo = await getEmergencyRouting(houseId, db);

    return NextResponse.json({
        success: true,
        routing: routingInfo
    });
}

async function handleReassign(houseId) {
    if (!houseId) {
        return NextResponse.json(
            { error: 'House ID required' },
            { status: 400 }
        );
    }

    const result = await reassignResponder(houseId, db);

    return NextResponse.json({
        success: true,
        message: `Reassigned to ${result.assignedStation.name}`,
        assignedStation: result.assignedStation,
        distance: result.distance
    });
}
