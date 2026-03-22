/**
 * DEV ONLY: Delete ALL alerts from Firestore immediately.
 * POST /api/alerts/clear-all
 */
import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';

export async function POST() {
  try {
    const snap = await db.collection('alerts').get();

    if (snap.empty) {
      return NextResponse.json({ success: true, deleted: 0, message: 'No alerts to delete.' });
    }

    // Firestore batches are limited to 500 ops — chunk if needed
    const BATCH_SIZE = 400;
    const docs = snap.docs;
    let deleted = 0;

    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
      const batch = db.batch();
      docs.slice(i, i + BATCH_SIZE).forEach(doc => batch.delete(doc.ref));
      await batch.commit();
      deleted += Math.min(BATCH_SIZE, docs.length - i);
    }

    console.log(`[CLEAR_ALL] ✅ Deleted ${deleted} alerts.`);
    return NextResponse.json({ success: true, deleted, message: `Deleted ${deleted} alert(s).` });

  } catch (error) {
    console.error('[CLEAR_ALL] ❌ Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
