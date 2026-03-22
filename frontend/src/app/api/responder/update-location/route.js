/**
 * Responder Location Update API
 * Handles real-time responder location updates and status management
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import admin from 'firebase-admin';

export async function POST(req) {
    try {
        const body = await req.json();
        const { responderId, responderEmail, location, status } = body;

        if (!responderId && !responderEmail) {
            return NextResponse.json(
                { error: 'Responder ID or email required' },
                { status: 400 }
            );
        }

        console.log('[RESPONDER_LOCATION_API] Updating location for:', responderId || responderEmail);

        // Use email as document ID if responderId not provided
        const docId = responderId || responderEmail;

        // Prepare update data
        const updateData = {
            responderId: responderId || responderEmail,
            responderEmail: responderEmail,
            status: status || 'ACTIVE',
            lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        // Add location if provided
        if (location && location.latitude && location.longitude) {
            updateData.currentLocation = {
                latitude: location.latitude,
                longitude: location.longitude,
                accuracy: location.accuracy || null,
                coords: new admin.firestore.GeoPoint(location.latitude, location.longitude)
            };
            updateData.lastLocationUpdate = admin.firestore.FieldValue.serverTimestamp();
        }

        // Update or create responder location document
        await db.collection('responderLocations').doc(docId).set(updateData, { merge: true });

        console.log(`[RESPONDER_LOCATION_API] ✅ Updated: ${status} at ${location ? `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}` : 'status only'}`);

        return NextResponse.json({
            success: true,
            message: 'Location updated successfully',
            responderId: docId,
            status: status
        });

    } catch (error) {
        console.error('[RESPONDER_LOCATION_API] Error:', error);
        return NextResponse.json(
            { error: error.message },
            { status: 500 }
        );
    }
}

// GET endpoint to retrieve responder location
export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url);
        const responderId = searchParams.get('responderId');
        const responderEmail = searchParams.get('responderEmail');

        if (!responderId && !responderEmail) {
            return NextResponse.json(
                { error: 'Responder ID or email required' },
                { status: 400 }
            );
        }

        const docId = responderId || responderEmail;
        const doc = await db.collection('responderLocations').doc(docId).get();

        if (!doc.exists) {
            return NextResponse.json(
                { error: 'Responder location not found' },
                { status: 404 }
            );
        }

        const data = doc.data();

        return NextResponse.json({
            success: true,
            responder: {
                id: docId,
                email: data.responderEmail,
                status: data.status,
                location: data.currentLocation,
                lastUpdated: data.lastUpdated?.toDate?.() || data.lastUpdated
            }
        });

    } catch (error) {
        console.error('[RESPONDER_LOCATION_API] Error:', error);
        return NextResponse.json(
            { error: error.message },
            { status: 500 }
        );
    }
}
