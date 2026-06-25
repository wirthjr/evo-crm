/** Centralized API configuration for the dashboard frontend. */

export const API_PORT = import.meta.env.VITE_API_PORT || '8081';

export const API_BASE_URL = import.meta.env.DEV
  ? `http://localhost:${API_PORT}`
  : '';
