// src/lib/apiClient.js
import axios from 'axios';

const apiClient = axios.create({
  baseURL: '/api', // Your Next.js API routes are located at /api
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // 10 second timeout
});

// Add response interceptor for better error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // Only log API errors that are JSON responses, not HTML 404 pages
    if (error.response?.status && error.response?.data) {
      // Check if response is HTML (404 page) or JSON
      const contentType = error.response.headers['content-type'];
      if (contentType && contentType.includes('application/json')) {
        console.error('API Error:', error.response.status, error.response.data);
      } else if (error.response.status === 404) {
        // Silently handle 404s - they're expected for unregistered users
        console.warn('API endpoint not found (404) - this may be expected behavior');
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;