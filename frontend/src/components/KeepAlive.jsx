'use client';

import { useEffect } from 'react';

/**
 * KeepAlive Component
 * 
 * Pings the Python AI backend every 5 minutes to prevent 
 * Render (free tier) from spinning down into sleep mode.
 */
export default function KeepAlive() {
  useEffect(() => {
    const backendUrl = process.env.NEXT_PUBLIC_PYTHON_SERVICE_URL || 'http://localhost:8000';
    
    const pingBackend = async () => {
      try {
        console.log('[KeepAlive] Pinging backend to stay awake...');
        // We use the /health endpoint we created earlier
        await fetch(`${backendUrl}/health`, { mode: 'no-cors' });
      } catch (err) {
        console.warn('[KeepAlive] Failed to ping backend:', err.message);
      }
    };

    // Initial ping on load
    pingBackend();

    // Set interval for every 5 minutes (300,000 ms)
    const interval = setInterval(pingBackend, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  return null; // This component doesn't render anything
}
