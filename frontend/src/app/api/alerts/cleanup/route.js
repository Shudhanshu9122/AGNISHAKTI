/**
 * Cleanup Old Alerts API
 * Removes stale alerts from the database to prevent them from showing on dashboard
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import admin from 'firebase-admin';

export async function POST(req) {
    try {
        console.log('[CLEANUP_API] Starting alert cleanup...');

        // Delete alerts older than 1 hour that are not in cooldown
        const oneHourAgo = admin.firestore.Timestamp.fromMillis(Date.now() - 60 * 60 * 1000);

        // Get old PENDING alerts
        const oldPendingAlerts = await db.collection('alerts')
            .where('status', '==', 'PENDING')
            .where('createdAt', '<', oneHourAgo)
            .get();

        // Get old CONFIRMED alerts
        const oldConfirmedAlerts = await db.collection('alerts')
            .where('status', '==', 'CONFIRMED_BY_GEMINI')
            .where('createdAt', '<', oneHourAgo)
            .get();

        // Get old REJECTED alerts
        const oldRejectedAlerts = await db.collection('alerts')
            .where('status', '==', 'REJECTED_BY_GEMINI')
            .where('createdAt', '<', oneHourAgo)
            .get();

        // Get old CANCELLED alerts
        const oldCancelledAlerts = await db.collection('alerts')
            .where('status', '==', 'CANCELLED_BY_USER')
            .where('createdAt', '<', oneHourAgo)
            .get();

        const allOldAlerts = [
            ...oldPendingAlerts.docs,
            ...oldConfirmedAlerts.docs,
            ...oldRejectedAlerts.docs,
            ...oldCancelledAlerts.docs
        ];

        if (allOldAlerts.length === 0) {
            console.log('[CLEANUP_API] No old alerts to clean up');
            return NextResponse.json({
                success: true,
                message: 'No old alerts found',
                deleted: 0
            });
        }

        // Delete all old alerts
        const batch = db.batch();
        allOldAlerts.forEach(doc => {
            batch.delete(doc.ref);
        });

        await batch.commit();

        console.log(`[CLEANUP_API] ✅ Deleted ${allOldAlerts.length} old alerts`);

        return NextResponse.json({
            success: true,
            message: `Deleted ${allOldAlerts.length} old alerts`,
            deleted: allOldAlerts.length,
            details: {
                pending: oldPendingAlerts.size,
                confirmed: oldConfirmedAlerts.size,
                rejected: oldRejectedAlerts.size,
                cancelled: oldCancelledAlerts.size
            }
        });

    } catch (error) {
        console.error('[CLEANUP_API] Error:', error);
        return NextResponse.json(
            { error: error.message },
            { status: 500 }
        );
    }
}

// GET endpoint to check how many old alerts exist
export async function GET(req) {
    try {
        const oneHourAgo = admin.firestore.Timestamp.fromMillis(Date.now() - 60 * 60 * 1000);

        const oldPendingAlerts = await db.collection('alerts')
            .where('status', '==', 'PENDING')
            .where('createdAt', '<', oneHourAgo)
            .get();

        const oldConfirmedAlerts = await db.collection('alerts')
            .where('status', '==', 'CONFIRMED_BY_GEMINI')
            .where('createdAt', '<', oneHourAgo)
            .get();

        const oldRejectedAlerts = await db.collection('alerts')
            .where('status', '==', 'REJECTED_BY_GEMINI')
            .where('createdAt', '<', oneHourAgo)
            .get();

        const oldCancelledAlerts = await db.collection('alerts')
            .where('status', '==', 'CANCELLED_BY_USER')
            .where('createdAt', '<', oneHourAgo)
            .get();

        const total = oldPendingAlerts.size + oldConfirmedAlerts.size +
            oldRejectedAlerts.size + oldCancelledAlerts.size;

        return NextResponse.json({
            success: true,
            totalOldAlerts: total,
            details: {
                pending: oldPendingAlerts.size,
                confirmed: oldConfirmedAlerts.size,
                rejected: oldRejectedAlerts.size,
                cancelled: oldCancelledAlerts.size
            }
        });

    } catch (error) {
        console.error('[CLEANUP_API] Error:', error);
        return NextResponse.json(
            { error: error.message },
            { status: 500 }
        );
    }
}
