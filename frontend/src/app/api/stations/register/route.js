import { NextResponse } from 'next/server';
import { registerFireStation } from '@/app/backend'; // Use your actual path to backend.js

export async function POST(request) {
    try {
        console.log('=== Fire Station Registration Endpoint Hit ===');
        
        // Providers must supply the secret key to register
        const providerSecret = request.headers.get('x-provider-secret');
        console.log('Provider secret received:', !!providerSecret);
        console.log('Provider secret value:', providerSecret);
        console.log('Expected provider secret exists:', !!process.env.PROVIDER_SECRET);
        
        // If no PROVIDER_SECRET is set in env, skip this check for development
        if (process.env.PROVIDER_SECRET && providerSecret !== process.env.PROVIDER_SECRET) {
            console.error('Provider secret mismatch!');
            return NextResponse.json({ 
                error: 'Invalid provider secret',
                hint: 'Make sure x-provider-secret header matches PROVIDER_SECRET in .env.local'
            }, { status: 403 });
        }

        const body = await request.json();
        const { email, name, stationName, stationAddress, stationPhone, coords } = body;
        console.log('Station register request received:', { 
            email, 
            name, 
            stationName, 
            stationAddress, 
            stationPhone, 
            coords 
        });

        // Validate that all required fields are present
        if (!email || !name || !stationName || !stationAddress || !stationPhone || !coords || !coords.lat || !coords.lng) {
            const missingFields = {
                email: !!email, 
                name: !!name, 
                stationName: !!stationName, 
                stationAddress: !!stationAddress, 
                stationPhone: !!stationPhone, 
                coords: !!coords,
                coordsLat: !!(coords && coords.lat),
                coordsLng: !!(coords && coords.lng)
            };
            console.error('Missing required fields:', missingFields);
            return NextResponse.json({ 
                error: 'Missing required fields for station registration',
                missingFields 
            }, { status: 400 });
        }

        console.log('All validations passed, calling registerFireStation...');
        const result = await registerFireStation(body);
        console.log('Fire station registered successfully:', result);
        
        return NextResponse.json({
            success: true,
            ...result,
            message: 'Fire station and provider registered successfully'
        });

    } catch (error) {
        console.error("Failed to register fire station - Full error:", error);
        console.error("Error message:", error.message);
        console.error("Error stack:", error.stack);
        return NextResponse.json({ 
            error: 'Internal Server Error',
            message: error.message,
            details: error.stack
        }, { status: 500 });
    }
}
