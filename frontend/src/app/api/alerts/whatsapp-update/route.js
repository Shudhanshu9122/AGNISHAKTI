/**
 * POST /api/alerts/whatsapp-update
 *
 * Called every 30 seconds by the dashboard while a threat is active.
 * 1. Verifies the alert is still active in Firestore
 * 2. Captures a fresh snapshot from the Python AI service
 * 3. Uploads it to Firebase Storage (public URL)
 * 4. Sends a refreshed WhatsApp message to all recipients
 * 5. Updates the alert doc with the new Firebase image URL
 *
 * Body: { alertId: string, cameraId: string }
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { sendWhatsAppAlertToAll, buildAlertMessage } from '@/lib/whatsapp';
import { uploadSnapshotToFirebaseStorage } from '@/app/backend';

const ACTIVE_STATUSES = [
  'CONFIRMED_BY_GEMINI',
  'SENDING_NOTIFICATIONS',
  'NOTIFIED_COOLDOWN',
  'DISPATCHED',
];

export async function POST(req) {
  console.log('[API] POST /api/alerts/whatsapp-update HIT');

  try {
    const body = await req.json();
    const { alertId, cameraId } = body;

    if (!alertId || !cameraId) {
      return NextResponse.json(
        { success: false, message: 'alertId and cameraId are required' },
        { status: 400 }
      );
    }

    // 1. Verify alert is still active
    const alertRef = db.collection('alerts').doc(alertId);
    const alertSnap = await alertRef.get();

    if (!alertSnap.exists) {
      console.log(`[API] [WhatsApp Update] Alert ${alertId} not found. Stopping updates.`);
      return NextResponse.json({ success: false, message: 'Alert not found', stop: true });
    }

    const alertData = alertSnap.data();

    if (!ACTIVE_STATUSES.includes(alertData.status)) {
      console.log(`[API] [WhatsApp Update] Alert ${alertId} status is "${alertData.status}". Stopping updates.`);
      return NextResponse.json({
        success: false,
        message: `Alert is no longer active (status: ${alertData.status})`,
        stop: true,
      });
    }

    // 2. Capture a fresh snapshot from the Python AI service
    const pythonUrl = process.env.PYTHON_SERVICE_URL || 'http://127.0.0.1:8000';
    let newImageId = null;

    try {
      const captureRes = await fetch(`${pythonUrl}/capture_frame/${cameraId}`, {
        method: 'POST',
        signal: AbortSignal.timeout(8000), // 8 second timeout
      });

      if (captureRes.ok) {
        const captureData = await captureRes.json();
        newImageId = captureData.imageId;
        console.log(`[API] [WhatsApp Update] New snapshot captured: ${newImageId}`);
      } else {
        console.warn(`[API] [WhatsApp Update] Failed to capture frame: ${captureRes.status}`);
      }
    } catch (captureErr) {
      console.warn(`[API] [WhatsApp Update] Capture frame error: ${captureErr.message}`);
    }

    // Fall back to the existing image if capture failed
    const imageIdToUpload = newImageId || alertData.imageId;

    if (!imageIdToUpload) {
      console.warn('[API] [WhatsApp Update] No image available to upload. Skipping WhatsApp update.');
      return NextResponse.json({ success: false, message: 'No image available' });
    }

    // 3. Upload to Firebase Storage
    let firebaseImageUrl = null;
    try {
      firebaseImageUrl = await uploadSnapshotToFirebaseStorage(imageIdToUpload, alertId);
      console.log(`[API] [WhatsApp Update] Firebase URL: ${firebaseImageUrl}`);
    } catch (uploadErr) {
      console.error('[API] [WhatsApp Update] Firebase upload failed:', uploadErr.message);
      // Use previous Firebase URL if available
      firebaseImageUrl = alertData.firebaseImageUrl || null;
    }

    // 4. Send refreshed WhatsApp message
    const message = buildAlertMessage({
      className: alertData.className,
      confidence: alertData.confidence,
      alertId,
      isUpdate: true,
    });

    const { sent, failed } = await sendWhatsAppAlertToAll({
      message,
      mediaUrl: firebaseImageUrl || undefined,
    });

    // 5. Update Firestore with the new image URL and timestamp
    const updatePayload = {
      updatedAt: new Date(),
      whatsappUpdateCount: (alertData.whatsappUpdateCount || 0) + 1,
      lastWhatsappUpdate: new Date(),
    };
    if (firebaseImageUrl) updatePayload.firebaseImageUrl = firebaseImageUrl;

    await alertRef.set(updatePayload, { merge: true });

    return NextResponse.json({
      success: true,
      sent,
      failed,
      newImageId: imageIdToUpload,
      firebaseImageUrl,
    });
  } catch (error) {
    console.error('[API] [WhatsApp Update] Unexpected error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
