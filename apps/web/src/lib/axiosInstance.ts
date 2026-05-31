import axios from "axios"

// In dev the Vite proxy intercepts /api/* → http://localhost:3001.
// In production set VITE_API_BASE_URL=https://api.yourdomain.com
const baseURL = import.meta.env.VITE_API_BASE_URL
  ? `${import.meta.env.VITE_API_BASE_URL}/api`
  : "/api"

export const api = axios.create({
  baseURL,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
})

// Extract backend error message — never show raw Axios "Request failed with status 4xx"
api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    const axiosErr = error as { response?: { data?: { error?: { message?: string } } } }
    const backendMessage = axiosErr?.response?.data?.error?.message
    if (backendMessage) {
      const wrapped = new Error(backendMessage) as Error & { original: unknown }
      wrapped.original = error
      return Promise.reject(wrapped)
    }
    return Promise.reject(error)
  }
)
