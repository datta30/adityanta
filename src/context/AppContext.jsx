import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import { useAuth } from './AuthContext'
import { API_CONFIG, AUTH_CONFIG } from '../config'
import { fetchWithRateLimit } from '../services/api'
import { safeJSONParse, setToStorage } from '../utils/imageUtils'
import { safeSetItem, safeGetItem } from '../utils/safeStorage'
import logger from '../utils/logger'

const AppContext = createContext(null)

export const useApp = () => {
  const context = useContext(AppContext)
  if (!context) {
    throw new Error('useApp must be used within an AppProvider')
  }
  return context
}

export const AppProvider = ({ children }) => {
  const { token } = useAuth()
  const [favorites, setFavorites] = useState([])
  const [userFiles, setUserFiles] = useState([])
  const [isUserFilesLoaded, setIsUserFilesLoaded] = useState(false)
  const [trashedItems, setTrashedItems] = useState([])
  const [templates, setTemplates] = useState([])
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false)
  const [isLoadingFavorites, setIsLoadingFavorites] = useState(false)
  const [serverStatus, setServerStatus] = useState('online')
  const templatesFetchRef = useRef({ inFlight: null, lastFetchedAt: 0, lastKey: null })
  const favoritesFetchRef = useRef({ inFlight: null, lastFetchedAt: 0, lastToken: null })
  const [config, setConfig] = useState({
    pricing: {
      monthly: { amount: 29900, duration: 30, currency: 'INR' },
      quarterly: { amount: 79900, duration: 90, currency: 'INR' },
      yearly: { amount: 299900, duration: 365, currency: 'INR' }
    },
    free_downloads_limit: 5
  })

  const getHeaders = useCallback(() => ({
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }), [token])

  // Default gradients for templates that don't have one
  const defaultGradients = [
    'from-cyan-400 to-blue-400',
    'from-sky-300 to-cyan-400',
    'from-yellow-100 to-yellow-200',
    'from-blue-200 to-sky-300',
    'from-teal-300 to-cyan-400',
    'from-green-200 to-green-300',
    'from-emerald-300 to-teal-400',
    'from-amber-200 to-orange-300',
    'from-pink-200 to-rose-300',
    'from-violet-200 to-purple-300',
  ]

  // Fetch config (pricing and free downloads limit)
  const fetchConfig = useCallback(async (retryCount = 0) => {
    // Skip if config was fetched recently in this session
    const cacheKey = 'adityanta_config_cache'
    const cacheTimeKey = 'adityanta_config_cache_ts'
    const cooldownKey = 'adityanta_config_cooldown'
    const now = Date.now()

    // If we were rate limited recently, skip entirely for 60s
    const cooldownUntil = Number(sessionStorage.getItem(cooldownKey) || 0)
    if (now < cooldownUntil) return

    const cachedTs = Number(sessionStorage.getItem(cacheTimeKey) || 0)
    if (now - cachedTs < 300000) { // 5 min cache
      try {
        const cached = JSON.parse(sessionStorage.getItem(cacheKey))
        if (cached && cached.pricing) {
          setConfig(cached)
          return
        }
      } catch { /* use default */ }
    }

    try {
      const response = await fetch(`${API_CONFIG.baseURL}/templates/config`)

      // Handle rate limiting — do NOT retry, just use defaults and cooldown
      if (response.status === 429) {
        logger.warn('Config rate limited (429). Using default config, cooling down 60s.')
        sessionStorage.setItem(cooldownKey, String(now + 60000))
        return
      }

      if (!response.ok) {
        throw new Error(`Config fetch failed: ${response.status}`)
      }

      const data = await validateJSONResponse(response)
      if (data.success && data.pricing) {
        const newConfig = {
          pricing: data.pricing,
          free_downloads_limit: data.free_downloads_limit || 5
        }
        setConfig(newConfig)
        sessionStorage.setItem(cacheKey, JSON.stringify(newConfig))
        sessionStorage.setItem(cacheTimeKey, String(Date.now()))
      }
    } catch (error) {
      logger.error('Fetch config error:', error)
      // Keep default config on error - graceful fallback
    }
  }, [])

  // Fetch config on mount
  useEffect(() => {
    fetchConfig()
  }, [fetchConfig])

  // Normalize template data from API to match frontend format
  const normalizeTemplate = useCallback((template, index) => {
    // Normalize frames count safely
    const count = parseInt(template.frames, 10)
    const normalizedFrames = isNaN(count)
      ? 5
      : Math.max(4, Math.min(count, 5))
    const rawPreview = `${template.preview || ''}`.trim()
    const isUrlLikePreview = /^(https?:\/\/|www\.)/i.test(rawPreview)
    const normalizedPreview = (!rawPreview || isUrlLikePreview)
      ? (template.title?.split(' ').slice(0, 2).join(' ').toUpperCase() || 'TEMPLATE')
      : rawPreview
    const normalizedPreviewImage = rawPreview
      ? (/^www\./i.test(rawPreview) ? `https://${rawPreview}` : rawPreview.replace(/^http:\/\//i, 'https://'))
      : ''

    return {
      ...template,
      id: template.id || template.template_id || template.templateId || index + 1,
      template_id: template.template_id || template.templateId || template.id,
      title: template.title || 'Untitled Template',
      topic: template.topic || 'General',
      frames: normalizedFrames,
      downloads: Math.max(0, parseInt(template.downloads, 10) || 0),
      license: template.license || 'FREE',
      gradient: template.gradient || defaultGradients[index % defaultGradients.length],
      preview: normalizedPreview,
      thumbnail_url: template.thumbnail_url || template.thumbnailUrl || (isUrlLikePreview ? normalizedPreviewImage : null),
      description: template.description || `A beautiful ${template.topic || 'educational'} template with slides.`,
      is_favourite: template.is_favourite || template.isFavourite || false,
      s3_file_url: template.s3_file_url || template.s3FileUrl || null,
      created_at: template.created_at || template.createdAt || new Date().toISOString(),
    }
  }, [])

  // Helper to validate JSON response
  const validateJSONResponse = async (response) => {
    const contentType = response.headers.get('content-type')
    if (!contentType || !contentType.includes('application/json')) {
      throw new Error('Invalid server response - expected JSON')
    }
    return response.json()
  }

  // Templates API - Fetch all in one call
  // Robust template fetcher with multiple retry strategies
  const fetchTemplates = useCallback(async (filters = {}, retryAttempt = 0) => {
    const params = new URLSearchParams()
    if (filters.topic && filters.topic !== 'All') params.append('topic', filters.topic)
    if (filters.license && filters.license !== 'All') params.append('license', filters.license.toUpperCase())
    if (filters.sort) params.append('sort', filters.sort === 'New → Old' ? 'new' : 'old')
    params.append('limit', '50')

    const requestKey = `${token || 'anonymous'}::${params.toString()}`
    const now = Date.now()

    if (templatesFetchRef.current.inFlight && templatesFetchRef.current.lastKey === requestKey) {
      return templatesFetchRef.current.inFlight
    }

    if (
      retryAttempt === 0 &&
      templatesFetchRef.current.lastKey === requestKey &&
      now - templatesFetchRef.current.lastFetchedAt < 8000 &&
      Array.isArray(templates) &&
      templates.length > 0
    ) {
      return templates
    }

    setIsLoadingTemplates(true)
    const requestPromise = (async () => {
      try {

        const url = `${API_CONFIG.baseURL}/templates?${params.toString()}`
        console.log('[Templates] Fetching from:', url)

        let response
        try {
          response = await fetchWithRateLimit(url, {
            headers: token ? getHeaders() : {}
          })
        } catch (networkError) {
          console.error('[Templates] Network error on primary URL:', networkError.message)
          const directUrl = `${window.location.origin}/api/v1/templates?${params.toString()}`
          console.log('[Templates] Trying origin fallback URL:', directUrl)
          response = await fetch(directUrl, {
            headers: token ? getHeaders() : {}
          })
        }

        console.log('[Templates] Response status:', response.status)

      if (response.status === 401) { localStorage.removeItem('adityanta_token'); localStorage.removeItem('adityanta_google_token'); localStorage.removeItem('user_profile'); if (window.location.pathname !== '/') window.location.href = '/'; throw new Error('Session expired'); }
        if (!response.ok) {
          console.error('[Templates] Response not OK:', response.status, response.statusText)
          // On any non-OK response, retry without params
          if (retryAttempt < 2) {
            console.log('[Templates] Retrying without params, attempt:', retryAttempt + 1)
            const fallbackUrl = `${API_CONFIG.baseURL}/templates`
            const fallbackRes = await fetch(fallbackUrl, {
              headers: token ? getHeaders() : {}
            })
            if (fallbackRes.ok) {
              const text = await fallbackRes.text()
              try {
                const fallbackData = JSON.parse(text)
                if (fallbackData.success && Array.isArray(fallbackData.templates)) {
                  console.log('[Templates] Fallback succeeded, count:', fallbackData.templates.length)
                  const normalizedTemplates = fallbackData.templates.map((t, i) => normalizeTemplate(t, i))
                  setTemplates(normalizedTemplates)
                  return normalizedTemplates
                }
              } catch (parseErr) {
                console.error('[Templates] Fallback parse error:', parseErr.message)
              }
            }
          }
          throw new Error(`Templates fetch failed: ${response.status}`)
        }

        // Parse response safely — don't rely on content-type header
        const text = await response.text()
        let data
        try {
          data = JSON.parse(text)
        } catch (parseError) {
          console.error('[Templates] JSON parse error:', parseError.message, 'Response:', text.substring(0, 200))
          throw new Error('Invalid JSON response from server')
        }

        if (data.success && Array.isArray(data.templates)) {
          console.log('[Templates] Success! Loaded', data.templates.length, 'templates')
          const normalizedTemplates = data.templates.map((t, i) => normalizeTemplate(t, i))
          setServerStatus('online')
          setTemplates(normalizedTemplates)
          return normalizedTemplates
        } else {
          console.warn('[Templates] API returned unexpected data:', { success: data.success, hasTemplates: !!data.templates })
          setServerStatus('online')
          return []
        }
      } catch (error) {
        console.error('[Templates] Fetch error:', error.message)
        // Auto-retry once after 2 seconds on any error
        if (retryAttempt < 1) {
          console.log('[Templates] Auto-retrying in 2 seconds...')
          await new Promise(r => setTimeout(r, 2000))
          return fetchTemplates(filters, retryAttempt + 1)
        }
        setServerStatus('offline')
        return []
      } finally {
        setIsLoadingTemplates(false)
        templatesFetchRef.current.inFlight = null
        templatesFetchRef.current.lastFetchedAt = Date.now()
        templatesFetchRef.current.lastKey = requestKey
      }
    })()

    templatesFetchRef.current.inFlight = requestPromise
    templatesFetchRef.current.lastKey = requestKey
    return requestPromise
  }, [token, getHeaders, normalizeTemplate, templates])

  const downloadTemplate = useCallback(async (templateId) => {
    if (!token) {
      logger.warn('Download attempted without auth token')
      return { success: false, error: 'Not authenticated' }
    }
    try {
      const url = `${API_CONFIG.baseURL}/templates/${templateId}`
      logger.info('Downloading template from:', url)

      // Get template with all slides in one call
      const response = await fetch(url, {
        headers: getHeaders()
      })

      logger.info('Download response status:', response.status)

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error')
        logger.error(`Download template HTTP error: ${response.status} ${response.statusText}`, errorText)
        return { success: false, error: `Server error: ${response.status}` }
      }

      const data = await response.json()
      logger.info('Download response data:', data)

      // Check for download limit exceeded error
      if (!data.success && data.error_code === 'DOWNLOAD_LIMIT_EXCEEDED') {
        return {
          success: false,
          error: data.message || 'Download limit exceeded. Upgrade to premium.',
          error_code: 'DOWNLOAD_LIMIT_EXCEEDED',
          total_downloads: data.total_downloads
        }
      }

      return data
    } catch (error) {
      logger.error('Download template error:', error)
      return { success: false, error: error.message || 'Network error' }
    }
  }, [token, getHeaders])

  const uploadTemplate = useCallback(async (formData) => {
    if (!token) return { success: false, error: 'Not authenticated' }
    try {
      const response = await fetch(`${API_CONFIG.baseURL}/templates`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      })

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status}`)
      }

      const data = await response.json()
      return data
    } catch (error) {
      logger.error('Upload template error:', error)
      return { success: false, error: error.message }
    }
  }, [token])

  // Favorites API
  const fetchFavorites = useCallback(async () => {
    if (!token) return []

    const now = Date.now()
    if (favoritesFetchRef.current.inFlight && favoritesFetchRef.current.lastToken === token) {
      return favoritesFetchRef.current.inFlight
    }

    if (
      favoritesFetchRef.current.lastToken === token &&
      now - favoritesFetchRef.current.lastFetchedAt < 8000 &&
      Array.isArray(favorites) &&
      favorites.length > 0
    ) {
      return favorites
    }

    setIsLoadingFavorites(true)
    const requestPromise = (async () => {
      try {
        const response = await fetchWithRateLimit(`${API_CONFIG.baseURL}/user/favourites`, {
          headers: getHeaders()
        })

        if (!response.ok) {
          throw new Error(`Favorites fetch failed: ${response.status}`)
        }

        const data = await response.json()
        if (data.success && data.templates) {
          // Normalize favorites to have all required fields
          const normalizedFavorites = data.templates.map((t, i) => normalizeTemplate(t, i))
          setFavorites(normalizedFavorites)
          return normalizedFavorites
        }
        return []
      } catch (error) {
        logger.error('Fetch favorites error:', error)
        return []
      } finally {
        setIsLoadingFavorites(false)
        favoritesFetchRef.current.inFlight = null
        favoritesFetchRef.current.lastFetchedAt = Date.now()
        favoritesFetchRef.current.lastToken = token
      }
    })()

    favoritesFetchRef.current.inFlight = requestPromise
    favoritesFetchRef.current.lastToken = token
    return requestPromise
  }, [token, getHeaders, normalizeTemplate, favorites])

  const addFavorite = useCallback(async (templateId) => {
    if (!token) return { success: false, error: 'Not authenticated' }
    try {
      const response = await fetchWithRateLimit(`${API_CONFIG.baseURL}/templates/${templateId}/favourite`, {
        method: 'POST',
        headers: getHeaders()
      })

      if (!response.ok) {
        throw new Error(`Add favorite failed: ${response.status}`)
      }

      const data = await response.json()
      if (data.success) {
        // Immediately add to local favorites state
        const template = templates.find(t => t.template_id === templateId || t.id === templateId)
        if (template && !favorites.some(f => f.template_id === templateId || f.id === templateId)) {
          setFavorites(prev => [template, ...prev])
        }
      }
      return data
    } catch (error) {
      logger.error('Add favorite error:', error)
      return { success: false, error: error.message }
    }
  }, [token, getHeaders, templates, favorites])

  const removeFavorite = useCallback(async (templateId) => {
    if (!token) return { success: false, error: 'Not authenticated' }
    try {
      const response = await fetchWithRateLimit(`${API_CONFIG.baseURL}/templates/${templateId}/favourite`, {
        method: 'DELETE',
        headers: getHeaders()
      })

      if (!response.ok) {
        throw new Error(`Remove favorite failed: ${response.status}`)
      }

      const data = await response.json()
      if (data.success) {
        // Immediately remove from local favorites state
        setFavorites(prev => prev.filter(t => t.template_id !== templateId && t.id !== templateId))
      }
      return data
    } catch (error) {
      logger.error('Remove favorite error:', error)
      return { success: false, error: error.message }
    }
  }, [token, getHeaders])

  // Check if template is favorited
  const isFavorite = useCallback((templateId) => {
    return favorites.some(t => t.template_id === templateId || t.id === templateId)
  }, [favorites])

  // User Projects/Files API with localStorage persistence
  const USER_FILES_KEY = 'adityanta_user_files'
  const TRASH_KEY = 'adityanta_trash'

  // Track if initial load is complete to avoid overwriting with empty array
  const initialLoadComplete = useRef(false)

  // Load from localStorage on init
  useEffect(() => {
    const savedFiles = safeGetItem(USER_FILES_KEY, [])
    logger.info('AppContext: Loading user files from localStorage:', savedFiles)

    if (Array.isArray(savedFiles)) {
      setUserFiles(savedFiles)
      logger.info('AppContext: Set userFiles state with', savedFiles.length, 'files')
    }

    const savedTrash = safeGetItem(TRASH_KEY, [])
    if (Array.isArray(savedTrash)) {
      // Convert deletedAt strings back to Date and filter out expired items
      const now = new Date()
      const validTrash = savedTrash
        .map(item => ({ ...item, deletedAt: new Date(item.deletedAt) }))
        .filter(item => {
          const daysSinceDelete = (now - item.deletedAt) / (1000 * 60 * 60 * 24)
          return daysSinceDelete < 15 // Keep items less than 15 days old
        })
      setTrashedItems(validTrash)
      // Update localStorage with cleaned trash
      setToStorage(TRASH_KEY, validTrash)
    }

    // Mark initial load as complete
    initialLoadComplete.current = true
    setIsUserFilesLoaded(true)
  }, [])

  // Save to localStorage whenever userFiles changes (including empty array)
  useEffect(() => {
    // Only save after initial load is complete to prevent race condition
    if (initialLoadComplete.current) {
      logger.info('AppContext: Saving userFiles to localStorage:', userFiles.length, 'files')
      setToStorage(USER_FILES_KEY, userFiles)
    }
  }, [userFiles])

  // Save to localStorage whenever trashedItems changes
  useEffect(() => {
    if (initialLoadComplete.current) {
      setToStorage(TRASH_KEY, trashedItems)
    }
  }, [trashedItems])

  // Auto-cleanup expired trash items every minute
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      const now = new Date()
      setTrashedItems(prev => {
        const validItems = prev.filter(item => {
          const deletedAt = item.deletedAt instanceof Date ? item.deletedAt : new Date(item.deletedAt)
          const daysSinceDelete = (now - deletedAt) / (1000 * 60 * 60 * 24)
          return daysSinceDelete < 15
        })
        return validItems
      })
    }, 60000) // Check every minute
    return () => clearInterval(cleanupInterval)
  }, [])

  // Save project (create new or update existing)
  const saveProject = useCallback((projectData) => {
    const existingIndex = userFiles.findIndex(f => f.id === projectData.id)
    const now = new Date()
    const fileData = {
      ...projectData,
      id: projectData.id || Date.now(),
      // Save full frames data, and frameCount for display
      frames: projectData.frames, // Keep the full frames array
      frameCount: Array.isArray(projectData.frames) ? projectData.frames.length : (projectData.frames || 1),
      thumbnail: projectData.thumbnail || 'from-blue-400 to-purple-600',
      updatedAt: now.toISOString(),
      created: projectData.created || now.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
    }

    if (existingIndex >= 0) {
      // Update existing
      setUserFiles(prev => prev.map((f, i) => i === existingIndex ? fileData : f))
    } else {
      // Add new
      setUserFiles(prev => [fileData, ...prev])
    }
    return fileData
  }, [userFiles])

  // Get project by ID
  const getProject = useCallback((projectId) => {
    return userFiles.find(f => f.id === projectId || f.id === parseInt(projectId))
  }, [userFiles])

  const addUserFile = useCallback((file) => {
    const now = new Date()
    const newFile = {
      ...file,
      id: Date.now(),
      created: now.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
      updatedAt: now.toISOString()
    }
    setUserFiles(prev => [newFile, ...prev])
    return newFile
  }, [])

  const deleteUserFile = useCallback((fileId) => {
    const file = userFiles.find(f => f.id === fileId)
    if (file) {
      setUserFiles(prev => prev.filter(f => f.id !== fileId))
      setTrashedItems(prev => [{ ...file, deletedAt: new Date() }, ...prev])
      // Also remove from localStorage
      const updatedFiles = userFiles.filter(f => f.id !== fileId)
      safeSetItem(USER_FILES_KEY, updatedFiles)
    }
  }, [userFiles])

  const restoreUserFile = useCallback((fileId) => {
    const file = trashedItems.find(f => f.id === fileId)
    if (file) {
      setTrashedItems(prev => prev.filter(f => f.id !== fileId))
      const { deletedAt, ...restoredFile } = file
      setUserFiles(prev => [restoredFile, ...prev])
    }
  }, [trashedItems])

  const permanentlyDeleteFile = useCallback((fileId) => {
    setTrashedItems(prev => prev.filter(f => f.id !== fileId))
  }, [])

  // Membership API
  const buyMembership = useCallback(async (plan, successUrl = null) => {
    if (!token) return { success: false, error: 'Not authenticated' }
    try {
      const payload = { plan: plan.toUpperCase() } // Backend expects MONTHLY, QUARTERLY, YEARLY
      if (successUrl) {
        payload.success_url = successUrl
      }

      const response = await fetchWithRateLimit(`${API_CONFIG.baseURL}/user/membership/buy`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(payload)
      })

      // Check response status before parsing
      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: 'Server error' }))
        logger.error('Buy membership error:', { status: response.status, data })
        throw new Error(data.message || data.error || `Server error: ${response.status}`)
      }

      const data = await response.json()
      return data
    } catch (error) {
      logger.error('Buy membership error:', error)
      return { success: false, error: error.message || 'Payment initiation failed' }
    }
  }, [token, getHeaders])

  const verifyPayment = useCallback(async (paymentData) => {
    if (!token) return { success: false, error: 'Not authenticated' }
    try {
      const response = await fetch(`${API_CONFIG.baseURL}/user/membership/verify`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          payment_id: paymentData.razorpay_payment_id || paymentData.payment_id,
          razorpay_order_id: paymentData.razorpay_order_id,
          razorpay_signature: paymentData.razorpay_signature
        })
      })

      if (!response.ok) {
        throw new Error(`Payment verification failed: ${response.status}`)
      }

      const data = await response.json()
      return data
    } catch (error) {
      logger.error('Verify payment error:', error)
      return { success: false, error: error.message }
    }
  }, [token, getHeaders])

  const value = {
    // Config
    config,
    fetchConfig,
    // Templates
    templates,
    isLoadingTemplates,
    serverStatus,
    fetchTemplates,
    downloadTemplate,
    uploadTemplate,
    // Favorites
    favorites,
    isLoadingFavorites,
    fetchFavorites,
    addFavorite,
    removeFavorite,
    isFavorite,
    // User Files/Projects
    userFiles,
    isUserFilesLoaded,
    trashedItems,
    addUserFile,
    saveProject,
    getProject,
    deleteUserFile,
    restoreUserFile,
    permanentlyDeleteFile,
    // Membership
    buyMembership,
    verifyPayment
  }

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  )
}

export default AppContext
