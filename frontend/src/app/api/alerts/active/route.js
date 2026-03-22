// app/api/alerts/active/route.js

import { getActiveAlertsForOwner } from '@/app/backend';
import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const ownerEmail = searchParams.get('ownerEmail');

    if (!ownerEmail) {
      return NextResponse.json({ error: 'Missing ownerEmail query parameter' }, { status: 400 });
    }

    // Call your existing backend function
    const activeAlerts = await getActiveAlertsForOwner(ownerEmail);
    
    // Return the alerts in the required format
    return NextResponse.json({ success: true, alerts: activeAlerts });

  } catch (error) {
    console.error('Error in /api/alerts/active:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}