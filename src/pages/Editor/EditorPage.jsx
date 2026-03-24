import { useState, useRef, useEffect, useCallback, useMemo, startTransition } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useEditor, ANIMATION_PRESETS, SLIDE_TRANSITIONS } from '../../context/EditorContext'
import { useApp } from '../../context/AppContext'
import { useToast } from '../../context/ToastContext'
import { parsePPTX } from '../../utils/pptxImport'
import logger from '../../utils/logger'
import EditorToolbar from '../../components/Toolbar/EditorToolbar'
import FramesPanel from '../../components/Sidebar/FramesPanelPrezi'
import TextToolbar from '../../components/Toolbar/TextToolbar'
import RightClickMenu from '../../components/ContextMenu/RightClickMenu'
import ShareDropdown from '../../components/Toolbar/ShareDropdown'
import KeyboardShortcutsModal from '../../components/Modal/KeyboardShortcutsModal'
import UpgradePlanModal from '../../components/Modal/UpgradePlanModal'
import { templates as mockTemplates, topicBackgrounds } from '../../utils/templateData'
import backgroundData from '../../utils/backgroundData.json'

const SLIDE_WIDTH = 1280
const SLIDE_HEIGHT = 720
const WORLD_PADDING = 220
const templateRuntimeCache = new Map()

const EditorPage = () => {
  const navigate = useNavigate()
  const { templateId } = useParams()
  const canvasRef = useRef(null)
  const toast = useToast()

  // Get editor context
  const {
    projectTitle,
    setProjectTitle,
    frames,
    activeFrame,
    activeFrameId,
    setActiveFrameId,
    addFrame,
    deleteFrame,
    duplicateFrame,
    reorderFrames,
    updateFrameTitle,
    updateFrameBackgroundImage,
    updateFrameNotes,
    updateFrameBackground,
    updateFrameTransition,
    updateFrameLayout,
    elements,
    selectedElement,
    selectedElementId,
    setSelectedElementId,
    updateElement,
    deleteElement,
    duplicateElement,
    moveElement,
    resizeElement,
    copyElement,
    pasteElement,
    bringToFront,
    sendToBack,
    undo,
    redo,
    commitHistory,
    canUndo,
    canRedo,
    zoom,
    setZoom,
    addTextElement,
    addShapeElement,
    addImageElement,
    addIconElement,
    addTableElement,
    addVideoElement,
    addAudioElement,
    addDrawingElement,
    updateElementAnimation,
    loadTemplate,
    createNewProject,
    exportProject,
    // Version History
    versionHistory,
    saveVersion,
    loadVersion,
    deleteVersion,
    // Slide Master
    slideMaster,
    updateSlideMaster,
    applyMasterToAllSlides,
    applyMasterToCurrentSlide,
    // Drawing Mode
    isDrawingMode,
    setIsDrawingMode,
    drawingTool,
    setDrawingTool,
    drawingColor,
    setDrawingColor,
    drawingSize,
    setDrawingSize,
    // Speaker Notes
    showSpeakerNotes,
    setShowSpeakerNotes,
    // Auto-save
    lastSaved,
  } = useEditor()

  const { templates: apiTemplates, saveProject: saveToUserFiles, getProject, userFiles, isUserFilesLoaded, downloadTemplate } = useApp()

  const allTemplates = useMemo(() => {
    return [...(apiTemplates || []), ...mockTemplates]
  }, [apiTemplates])

  const projectTopic = useMemo(() => {
    const tpl = allTemplates.find(t => t.template_id === templateId)
    if (tpl?.topic) return tpl.topic
    const proj = isUserFilesLoaded ? getProject(templateId) : null
    return proj?.topic || null
  }, [templateId, allTemplates, isUserFilesLoaded, getProject])

  const editorBgImage = projectTopic && topicBackgrounds[projectTopic] ? topicBackgrounds[projectTopic][1] : null

  // Local UI state
  const [showMediaDropdown, setShowMediaDropdown] = useState(false)
  const [showShareDropdown, setShowShareDropdown] = useState(false)
  const [showTextToolbar, setShowTextToolbar] = useState(false)
  const [contextMenu, setContextMenu] = useState(null)
  const [showShapeOptions, setShowShapeOptions] = useState(false)
  const [showIconOptions, setShowIconOptions] = useState(false)
  const [showTableOptions, setShowTableOptions] = useState(false)
  const [tableGridHover, setTableGridHover] = useState({ rows: 0, cols: 0 })
  const [templateGradient, setTemplateGradient] = useState(null)
  const [templateThumbnailUrl, setTemplateThumbnailUrl] = useState(null)
  const [editingTextId, setEditingTextId] = useState(null)
  const [showShortcutsModal, setShowShortcutsModal] = useState(false)
  const [showVersionHistory, setShowVersionHistory] = useState(false)
  const [showSlideMaster, setShowSlideMaster] = useState(false)
  const [showAnimationPanel, setShowAnimationPanel] = useState(false)
  const [showVideoModal, setShowVideoModal] = useState(false)
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)
  const [videoUrl, setVideoUrl] = useState('')
  const [rightPanelTab, setRightPanelTab] = useState('properties') // properties, design, notes
  const [bgSearchFilter, setBgSearchFilter] = useState('')
  const [isAnimationPreview, setIsAnimationPreview] = useState(false)
  const [animationKey, setAnimationKey] = useState(0) // Used to restart animations
  const [isSaving, setIsSaving] = useState(false)
  const [lastSavedTime, setLastSavedTime] = useState(null)
  const [currentProjectId, setCurrentProjectId] = useState(null)
  const [fitZoom, setFitZoom] = useState(100)
  const [camera, setCamera] = useState({ zoom: 0.75, panX: 0, panY: 0 })
  const inFlightTemplateRef = useRef({ id: null, promise: null })
  const hasInitializedCameraRef = useRef(false)

  // Drawing state
  const drawingCanvasRef = useRef(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [currentPath, setCurrentPath] = useState([])
  const [drawingPaths, setDrawingPaths] = useState([])

  // Track if template has been loaded to prevent re-loading
  // Using state instead of ref so it resets properly with React StrictMode
  const [templateLoaded, setTemplateLoaded] = useState(false)
  const [isTemplateLoading, setIsTemplateLoading] = useState(false)

  // Drag-drop for images
  const [isDragOver, setIsDragOver] = useState(false)

  // Drag state
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [elementStart, setElementStart] = useState({ x: 0, y: 0 })

  // Pan (grab) state
  const [isPanning, setIsPanning] = useState(false)
  const [isDraggingPan, setIsDraggingPan] = useState(false)
  const [panStart, setPanStart] = useState({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 })

  // Resize state
  const [isResizing, setIsResizing] = useState(false)
  const [resizeHandle, setResizeHandle] = useState(null)
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0, elemX: 0, elemY: 0 })

  const [draggingFrameId, setDraggingFrameId] = useState(null)
  const [frameDragStart, setFrameDragStart] = useState({ x: 0, y: 0, frameX: 0, frameY: 0 })

  const frameMapLayout = useMemo(() => {
    const presets = [
      { x: 0, y: 0, width: 1280, height: 720 },
      { x: 1400, y: -100, width: 640, height: 360 },
      { x: 1400, y: 300, width: 640, height: 360 },
      { x: 2100, y: 100, width: 640, height: 360 },
      { x: -700, y: 300, width: 640, height: 360 },
    ]

    let rightMost = 0
    return frames.map((frame, index) => {
      // Prefer stored layout from frame.layout, then preset, then default
      const stored = frame.layout
      const p = stored || presets[index]
      let next
      if (p) {
        next = { ...p }
      } else {
        next = { width: 640, height: 360, x: rightMost + 60, y: 0 }
      }
      rightMost = Math.max(rightMost, next.x + next.width)
      return {
        id: frame.id,
        ...next,
      }
    })
  }, [frames])

  const worldBounds = useMemo(() => {
    if (!frameMapLayout.length) {
      return { width: 1800, height: 1100, minX: 0, minY: 0, maxX: 1800, maxY: 1100 }
    }
    const minX = Math.min(...frameMapLayout.map(f => f.x))
    const minY = Math.min(...frameMapLayout.map(f => f.y))
    const maxX = Math.max(...frameMapLayout.map(f => f.x + f.width))
    const maxY = Math.max(...frameMapLayout.map(f => f.y + f.height))
    return {
      minX,
      minY,
      maxX,
      maxY,
      width: Math.max(1800, maxX + WORLD_PADDING),
      height: Math.max(1100, maxY + WORLD_PADDING),
    }
  }, [frameMapLayout])

  const activeFrameLayout = frameMapLayout.find((f) => f.id === activeFrameId) || { x: 400, y: 200, width: 640, height: 400 }

  // Ensure frames are always initialized - safety fallback
  useEffect(() => {
    if (frames.length === 0 && templateId !== 'new' && !templateLoaded) {
      logger.warn('EditorPage: Frames are empty, initializing with blank frame')
      // Pick a random background from the project topic
      const _blanktopic = projectTopic || 'Generic'
      const _blankBgs = backgroundData[_blanktopic] || backgroundData['Generic'] || []
      const _blankRandomBg = _blankBgs.length > 0 ? _blankBgs[Math.floor(Math.random() * _blankBgs.length)] : null
      // Create a blank frame as fallback
      const blankFrame = {
        id: 1,
        title: 'Slide 1',
        preview: 'Slide 1',
        backgroundColor: '#ffffff',
        backgroundImage: _blankRandomBg,
        notes: '',
        transition: 'fade',
        elements: [
          {
            id: 1001,
            type: 'text',
            content: 'Click to add title',
            x: 50,
            y: 100,
            width: 700,
            height: 70,
            fontSize: 40,
            fontWeight: 'bold',
            fontFamily: 'Inter',
            fontStyle: 'normal',
            textDecoration: 'none',
            textAlign: 'center',
            color: '#333333',
            isPlaceholder: true,
            borderWidth: 0,
            borderColor: '#333333',
            borderRadius: 0,
            backgroundColor: 'transparent',
          },
          {
            id: 1002,
            type: 'text',
            content: 'Click to add content',
            x: 50,
            y: 200,
            width: 700,
            height: 300,
            fontSize: 20,
            fontWeight: 'normal',
            fontFamily: 'Inter',
            fontStyle: 'normal',
            textDecoration: 'none',
            textAlign: 'center',
            color: '#666666',
            isPlaceholder: true,
            borderWidth: 0,
            borderColor: '#333333',
            borderRadius: 0,
            backgroundColor: 'transparent',
          }
        ]
      }
      loadTemplate({ title: 'Presentation', frames: [blankFrame] })
      logger.info('EditorPage: Blank frame initialized')
    }
  }, [frames.length])

  // Keep slide fully visible in viewport area (no canvas scrolling)
  useEffect(() => {
    const updateFitZoom = () => {
      if (!canvasRef.current) return
      const rect = canvasRef.current.getBoundingClientRect()
      // Keep the full 16:9 slide visible between the side panels without adding scrollbars.
      const availableWidth = Math.max(360, rect.width - 12)
      const availableHeight = Math.max(260, rect.height - 60)
      const nextFit = Math.min(
        175,
        (availableWidth / SLIDE_WIDTH) * 100,
        (availableHeight / SLIDE_HEIGHT) * 100
      )
      setFitZoom(Math.max(50, Math.floor(nextFit)))
    }

    updateFitZoom()
    const observer = new ResizeObserver(updateFitZoom)
    if (canvasRef.current) observer.observe(canvasRef.current)
    window.addEventListener('resize', updateFitZoom)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateFitZoom)
    }
  }, [])

  // Auto-fit: always match fitZoom so slide fills available space without scrollbar
  useEffect(() => {
    setZoom(fitZoom)
  }, [fitZoom, setZoom])

  // Load template or user file on mount if templateId exists
  useEffect(() => {
    // Skip if already loaded
    if (templateLoaded) return
    if (!templateId || templateId === 'new') return

    if (templateId === 'prezi-demo') {
      import('../../utils/templateData').then(({ PREZI_DEMO_FRAMES }) => {
        loadTemplate({ title: 'Prezi Drag & Drop Demo', frames: PREZI_DEMO_FRAMES })
        setProjectTitle('Prezi Drag & Drop Demo')
        setTemplateLoaded(true)
        setIsTemplateLoading(false)
      })
      return
    }

    if (!isUserFilesLoaded) return
    if (inFlightTemplateRef.current.id === templateId && inFlightTemplateRef.current.promise) return

    let cancelled = false
    setIsTemplateLoading(true)

    // First, check if this is a saved user file (user file IDs are numeric timestamps)
    const userFile = getProject(templateId)

    logger.info('EditorPage: Loading templateId:', templateId, 'userFile:', !!userFile)

    if (userFile && Array.isArray(userFile.frames) && userFile.frames.length > 0) {
      setTemplateLoaded(true)
      setIsTemplateLoading(false)
      loadTemplate({ title: userFile.title, frames: userFile.frames })
      setProjectTitle(userFile.title)
      setTemplateGradient(userFile.thumbnail || null)
      setTemplateThumbnailUrl(userFile.thumbnailUrl || null)
      setCurrentProjectId(userFile.id)
      localStorage.setItem('adityanta_autosave', JSON.stringify({
        title: userFile.title,
        frames: userFile.frames,
        savedAt: new Date().toISOString()
      }))
      return
    }

    // Not a user file → load template from backend
    // Clear autosave to prevent stale data
    localStorage.removeItem('adityanta_autosave')

    const loadFromBackend = async () => {
      try {
        console.log('[TEMPLATE] Step 1: Calling downloadTemplate for:', templateId)
        const result = await downloadTemplate(templateId)

        if (cancelled) return

        console.log('[TEMPLATE] Step 2: downloadTemplate response:', {
          success: result?.success,
          hasS3Url: !!result?.s3_file_url,
          templateTitle: result?.template?.title,
          error: result?.error
        })

        if (!result?.success) {
          console.error('[TEMPLATE] Download failed:', result?.error)
          if (result?.error_code === 'DOWNLOAD_LIMIT_EXCEEDED') {
            toast.error('Download limit exceeded. Upgrade to premium for unlimited downloads.')
          }
          return null
        }

        // Backend returns s3_file_url → fetch PPTX from S3 and parse it
        if (result.s3_file_url) {
          console.log('[TEMPLATE] Step 3: Fetching PPTX from S3...')
          const pptxResponse = await fetch(result.s3_file_url)

          if (cancelled) return

          if (!pptxResponse.ok) {
            console.error('[TEMPLATE] S3 fetch failed:', pptxResponse.status)
            return null
          }

          const pptxBlob = await pptxResponse.blob()
          console.log('[TEMPLATE] Step 4: PPTX blob size:', pptxBlob.size)

          if (pptxBlob.size === 0) {
            console.error('[TEMPLATE] Empty PPTX blob!')
            return null
          }

          // Use the real template title from backend for the filename so parsePPTX gets a meaningful fallback
          const realTitle = result.template?.title || 'Presentation'
          const pptxFile = new File([pptxBlob], `${realTitle}.pptx`, {
            type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
          })

          console.log('[TEMPLATE] Step 5: Parsing PPTX...')
          const parsed = await parsePPTX(pptxFile)
          console.log('[TEMPLATE] Step 6: Parsed! Title:', parsed.title, 'Slides:', parsed.frames?.length)

          if (cancelled) return

          if (parsed.frames && parsed.frames.length > 0) {
            // Prefer backend title over PPTX metadata title (which is often generic)
            return {
              title: result.template?.title || parsed.title || 'Presentation',
              frames: parsed.frames,
              gradient: null,
              thumbnailUrl: result.template?.thumbnail_url || null
            }
          }
        }

        return null
      } catch (error) {
        console.error('[TEMPLATE] Error loading template:', error)
        return null
      }
    }

    const requestPromise = loadFromBackend().then((templateData) => {
      if (cancelled) return

      setTemplateLoaded(true)
      setIsTemplateLoading(false)

      if (templateData) {
        // Successfully loaded template from backend
        console.log('[TEMPLATE] SUCCESS - Loading', templateData.frames.length, 'slides')
        templateRuntimeCache.set(templateId, templateData)
        loadTemplate({ title: templateData.title, frames: templateData.frames })
        setProjectTitle(templateData.title)
        setTemplateGradient(templateData.gradient)
        setTemplateThumbnailUrl(templateData.thumbnailUrl)
      } else {
        // Failed to load from backend → create fallback slides
        console.warn('[TEMPLATE] FALLBACK - Creating placeholder slides')
        toast.info('Loading template with default layout. Edit to customize!')

        // Find template title from API templates if available
        const apiTemplate = allTemplates.find(t => t.template_id === templateId)
        const fallbackTitle = apiTemplate?.title || 'Presentation'
        const slideCount = (typeof apiTemplate?.frames === 'number' && apiTemplate.frames > 0) ? apiTemplate.frames : 3
        const projectTopic = apiTemplate?.topic || 'Generic'
        const topicBgs = backgroundData[projectTopic] || backgroundData['Generic'] || []
        const randomBg = topicBgs.length > 0 ? topicBgs[Math.floor(Math.random() * topicBgs.length)] : null

        const fallbackFrames = Array.from({ length: slideCount }, (_, i) => {
          const frameBg = topicBgs.length > 0 ? topicBgs[Math.floor(Math.random() * topicBgs.length)] : null
          return {
          id: i + 1,
          title: i === 0 ? fallbackTitle : `Slide ${i + 1}`,
          preview: i === 0 ? fallbackTitle : `Slide ${i + 1}`,
          backgroundColor: '#ffffff',
          backgroundImage: frameBg,
          notes: '',
          transition: 'fade',
          elements: [
            {
              id: (i + 1) * 1000 + 1,
              type: 'text',
              content: i === 0 ? fallbackTitle : 'Click to add title',
              x: 50, y: 100, width: 700, height: 70,
              fontSize: 40, fontWeight: 'bold', fontFamily: 'Inter',
              fontStyle: 'normal', textDecoration: 'none',
              color: i === 0 ? '#1a1a1a' : '#333333',
              textAlign: 'center', isPlaceholder: i > 0,
              borderWidth: 0, borderColor: '#333333', borderRadius: 0, backgroundColor: 'transparent',
            },
            {
              id: (i + 1) * 1000 + 2,
              type: 'text',
              content: i === 0 ? 'Click to edit subtitle' : 'Click to add content',
              x: 50, y: 200, width: 700, height: 300,
              fontSize: 20, fontWeight: 'normal', fontFamily: 'Inter',
              fontStyle: 'normal', textDecoration: 'none',
              color: '#666666', textAlign: 'center', isPlaceholder: true,
              borderWidth: 0, borderColor: '#333333', borderRadius: 0, backgroundColor: 'transparent',
            }
          ]
        }})

        loadTemplate({ title: fallbackTitle, frames: fallbackFrames })
        setProjectTitle(fallbackTitle)
        setTemplateGradient(null)
        setTemplateThumbnailUrl(apiTemplate?.thumbnail_url || null)
      }
    })
    inFlightTemplateRef.current = { id: templateId, promise: requestPromise }

    return () => {
      cancelled = true
      if (inFlightTemplateRef.current.id === templateId) {
        inFlightTemplateRef.current = { id: null, promise: null }
      }
    }
  }, [templateId, templateLoaded, isUserFilesLoaded, getProject, loadTemplate, downloadTemplate, apiTemplates, toast, setProjectTitle])

  // Keyboard shortcuts - PowerPoint-like
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't trigger shortcuts when editing text (except Escape)
      if (editingTextId && e.key !== 'Escape') return

      // Undo/Redo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault()
        if (e.shiftKey) {
          redo()
          toast.info('Redo')
        } else {
          undo()
          toast.info('Undo')
        }
      }

      // Redo alternative (Ctrl+Y)
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault()
        redo()
        toast.info('Redo')
      }

      // Copy
      if ((e.ctrlKey || e.metaKey) && e.key === 'c' && selectedElementId) {
        e.preventDefault()
        copyElement(selectedElementId)
        toast.info('Copied to clipboard')
      }

      // Paste
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        e.preventDefault()
        pasteElement()
      }

      // Cut (Copy + Delete)
      if ((e.ctrlKey || e.metaKey) && e.key === 'x' && selectedElementId) {
        e.preventDefault()
        copyElement(selectedElementId)
        deleteElement(selectedElementId)
        toast.info('Cut to clipboard')
      }

      // Duplicate (Ctrl+D)
      if ((e.ctrlKey || e.metaKey) && e.key === 'd' && selectedElementId) {
        e.preventDefault()
        duplicateElement(selectedElementId)
        toast.success('Element duplicated')
      }

      // Select All (Ctrl+A) - future: select all elements
      if ((e.ctrlKey || e.metaKey) && e.key === 'a' && !editingTextId) {
        e.preventDefault()
        // Could implement multi-select here
      }

      // Delete/Backspace
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedElementId && !editingTextId) {
        e.preventDefault()
        deleteElement(selectedElementId)
      }

      // Escape - deselect
      if (e.key === 'Escape') {
        if (editingTextId) {
          setEditingTextId(null)
        } else if (selectedElementId) {
          setSelectedElementId(null)
          setShowTextToolbar(false)
        }
      }

      // Enter - start editing text
      if (e.key === 'Enter' && selectedElement?.type === 'text' && !editingTextId) {
        e.preventDefault()
        if (selectedElement.isPlaceholder) {
          updateElement(selectedElement.id, { content: '', isPlaceholder: false, textAlign: 'left' })
        }
        setEditingTextId(selectedElement.id)
      }

      // Arrow keys - nudge element
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && selectedElementId && !editingTextId) {
        e.preventDefault()
        const nudgeAmount = e.shiftKey ? 10 : 1 // Hold Shift for larger nudge
        const element = elements.find(el => el.id === selectedElementId)
        if (element) {
          let newX = element.x
          let newY = element.y
          if (e.key === 'ArrowUp') newY -= nudgeAmount
          if (e.key === 'ArrowDown') newY += nudgeAmount
          if (e.key === 'ArrowLeft') newX -= nudgeAmount
          if (e.key === 'ArrowRight') newX += nudgeAmount
          moveElement(selectedElementId, Math.max(0, newX), Math.max(0, newY))
        }
      }

      // Bring to Front (Ctrl+Shift+])
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === ']' && selectedElementId) {
        e.preventDefault()
        bringToFront(selectedElementId)
        toast.info('Brought to front')
      }

      // Send to Back (Ctrl+Shift+[)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === '[' && selectedElementId) {
        e.preventDefault()
        sendToBack(selectedElementId)
        toast.info('Sent to back')
      }

      // New Slide (Ctrl+M like PowerPoint)
      if ((e.ctrlKey || e.metaKey) && e.key === 'm') {
        e.preventDefault()
        addFrame()
        toast.success('New slide added')
      }

      // Present (F5)
      if (e.key === 'F5') {
        e.preventDefault()
        navigate(`/present/${templateId || 'new'}`)
      }

      // Show shortcuts modal
      if (e.key === '?' || e.key === 'F1') {
        e.preventDefault()
        setShowShortcutsModal(true)
      }

      // Space to pan
      if (e.code === 'Space' && !editingTextId) {
        e.preventDefault()
        setIsPanning(true)
      }
    }

    const handleKeyUp = (e) => {
      if (e.code === 'Space' && !editingTextId) {
        setIsPanning(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('keyup', handleKeyUp)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('keyup', handleKeyUp)
    }
  }, [selectedElementId, selectedElement, editingTextId, elements, undo, redo, copyElement, pasteElement, deleteElement, duplicateElement, setSelectedElementId, moveElement, bringToFront, sendToBack, addFrame, updateElement, setEditingTextId, navigate, templateId, toast])

  const handleContextMenu = (e) => {
    e.preventDefault()
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
    })
  }

  // Close context menu on click outside
  useEffect(() => {
    const handleClick = () => setContextMenu(null)
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [])

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (showShapeOptions || showIconOptions || showTableOptions) {
        const dropdown = document.querySelector('.dropdown-options')
        if (dropdown && !dropdown.contains(e.target)) {
          setShowShapeOptions(false)
          setShowIconOptions(false)
          setShowTableOptions(false)
        }
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showShapeOptions, showIconOptions, showTableOptions])

  // Save project to Your Files
  const handleSaveProject = useCallback(() => {
    setIsSaving(true)
    try {
      const projectData = {
        id: currentProjectId,
        title: projectTitle || 'Untitled Presentation',
        frames: frames,
        templateId: templateId,
        thumbnail: templateGradient || 'from-blue-400 to-purple-600',
      }
      const savedFile = saveToUserFiles(projectData)
      setCurrentProjectId(savedFile.id)
      setLastSavedTime(new Date())
      toast.success('Project saved to Your Files!')
    } catch (error) {
      logger.error('Save error:', error)
      toast.error('Failed to save project')
    } finally {
      setIsSaving(false)
    }
  }, [currentProjectId, projectTitle, frames, templateId, templateGradient, saveToUserFiles, toast])

  // Auto-save shortcut (Ctrl+S)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        handleSaveProject()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleSaveProject])

  const handlePresent = () => {
    navigate(`/present/${templateId || 'new'}`)
  }

  // Pan / Wheel State
  const isTransitioningRef = useRef(false);
  const transitionTimeoutRef = useRef(null);
  const [isNavigating, setIsNavigating] = useState(false); // Used to disable CSS transition

  const handlePanStart = (e) => {
    // middle click (button 1) or isPanning (hand tool)
    if (e.button === 1 || isPanning) {
      e.preventDefault()
      setIsDraggingPan(true)
      setIsNavigating(true)
      setPanStart({
        x: e.clientX,
        y: e.clientY,
        cameraPanX: camera.panX,
        cameraPanY: camera.panY,
      })
    }
  }

  const handleWheel = (e) => {
    if (showVersionHistory || showShortcutsModal || showSlideMaster || showAnimationPanel) return;

    // Disable transition
    setIsNavigating(true);
    if (transitionTimeoutRef.current) clearTimeout(transitionTimeoutRef.current);
    transitionTimeoutRef.current = setTimeout(() => setIsNavigating(false), 300);

    setCamera(prev => {
      if (e.ctrlKey || e.metaKey) {
        // Zoom
        const zoomSensitivity = 0.005;
        const delta = -e.deltaY * zoomSensitivity;
        let newZoom = Math.min(Math.max(0.05, prev.zoom * (1 + delta)), 5);

        // Attempt zoom toward center (proper cursor zoom is math heavy, centering for now)
        return { ...prev, zoom: newZoom };
      } else {
        // Pan
        return {
          ...prev,
          panX: prev.panX - e.deltaX / prev.zoom,
          panY: prev.panY - e.deltaY / prev.zoom,
        };
      }
    });
  }

  useEffect(() => {
    const handlePanMove = (e) => {
      if (!isDraggingPan) return
      const dx = (e.clientX - panStart.x) / camera.zoom
      const dy = (e.clientY - panStart.y) / camera.zoom

      setCamera(prev => ({
        ...prev,
        panX: panStart.cameraPanX + dx,
        panY: panStart.cameraPanY + dy
      }))
    }

    const handlePanEnd = (e) => {
      if (e.button !== 1 && !isPanning) return; // only end on middle/left depending
      if (isDraggingPan) {
        setIsDraggingPan(false)
        setIsNavigating(false)
      }
    }

    window.addEventListener('mousemove', handlePanMove)
    window.addEventListener('mouseup', handlePanEnd)
    return () => {
      window.removeEventListener('mousemove', handlePanMove)
      window.removeEventListener('mouseup', handlePanEnd)
    }
  }, [isDraggingPan, panStart, camera.zoom, isPanning])

  // Handle placeholder click - clear placeholder text when editing starts
  const handlePlaceholderEdit = useCallback((element) => {
    if (element.isPlaceholder) {
      // Clear content, remove placeholder flag, and change alignment to left for typing
      updateElement(element.id, { content: '', isPlaceholder: false, textAlign: 'left' })
    }
    setEditingTextId(element.id)
  }, [updateElement])

  const handleElementClick = (element, e) => {
    e.stopPropagation()
    setSelectedElementId(element.id)
    if (element.type === 'text') {
      setShowTextToolbar(true)
      // If it's a placeholder, start editing immediately on single click
      if (element.isPlaceholder) {
        handlePlaceholderEdit(element)
      }
    } else {
      setShowTextToolbar(false)
    }
  }

  const handleElementDoubleClick = (element, e) => {
    e.stopPropagation()
    if (element.type === 'text') {
      handlePlaceholderEdit(element)
    } else if (element.type === 'shape' || element.type === 'icon') {
      // Enable text editing for shapes and icons (PowerPoint-style)
      setEditingTextId(element.id)
      setSelectedElementId(element.id)
    } else if (element.type === 'image' && element.showCaption) {
      // Enable caption editing for images
      setEditingTextId(element.id)
      setSelectedElementId(element.id)
    }
  }

  const handleCanvasClick = (e) => {
    if (e.target.closest('.canvas-area')) {
      setSelectedElementId(null)
      setShowTextToolbar(false)
      setEditingTextId(null)
    }
  }

  // Drag handlers

  const handleFrameDragStart = (e, frameBox) => {
    e.stopPropagation()
    e.preventDefault()
    setDraggingFrameId(frameBox.id)
    setFrameDragStart({
      x: e.clientX,
      y: e.clientY,
      frameX: frameBox.x,
      frameY: frameBox.y
    })
  }

  const handleFrameDragMove = useCallback((e) => {
    if (!draggingFrameId) return
    const deltaX = (e.clientX - frameDragStart.x) / camera.zoom
    const deltaY = (e.clientY - frameDragStart.y) / camera.zoom
    updateFrameLayout(draggingFrameId, {
      x: frameDragStart.frameX + deltaX,
      y: frameDragStart.frameY + deltaY
    })
  }, [draggingFrameId, frameDragStart, camera.zoom, updateFrameLayout])

  const handleFrameDragEnd = useCallback(() => {
    setDraggingFrameId(null)
  }, [])


  const handleDragStart = (e, element) => {
    if (editingTextId === element.id) return
    e.stopPropagation()
    setIsDragging(true)
    setDragStart({ x: e.clientX, y: e.clientY })
    setElementStart({ x: element.x, y: element.y })
  }

  const handleDragMove = useCallback((e) => {
    if (!isDragging || !selectedElementId) return

    const scaleFactor = camera.zoom * (activeFrameLayout.width / SLIDE_WIDTH);
    const deltaX = (e.clientX - dragStart.x) / scaleFactor;
    const deltaY = (e.clientY - dragStart.y) / scaleFactor;

    moveElement(selectedElementId,
      Math.max(0, elementStart.x + deltaX),
      Math.max(0, elementStart.y + deltaY)
    )
  }, [isDragging, selectedElementId, dragStart, elementStart, camera.zoom, activeFrameLayout.width, moveElement])

  const handleDragEnd = useCallback(() => {
    setIsDragging(false)
  }, [])

  // Resize handlers
  const handleResizeStart = (e, handle, element) => {
    e.stopPropagation()
    e.preventDefault()
    setIsResizing(true)
    setResizeHandle(handle)
    setResizeStart({
      x: e.clientX,
      y: e.clientY,
      width: element.width,
      height: element.height,
      elemX: element.x,
      elemY: element.y
    })
  }

  const handleResizeMove = useCallback((e) => {
    if (!isResizing || !selectedElementId || !resizeHandle) return

    const scaleFactor = camera.zoom * (activeFrameLayout.width / SLIDE_WIDTH);
    const deltaX = (e.clientX - resizeStart.x) / scaleFactor;
    const deltaY = (e.clientY - resizeStart.y) / scaleFactor;

    let newWidth = resizeStart.width
    let newHeight = resizeStart.height
    let newX = resizeStart.elemX
    let newY = resizeStart.elemY

    if (resizeHandle.includes('e')) {
      newWidth = Math.max(50, resizeStart.width + deltaX)
    }
    if (resizeHandle.includes('w')) {
      newWidth = Math.max(50, resizeStart.width - deltaX)
      newX = resizeStart.elemX + deltaX
    }
    if (resizeHandle.includes('s')) {
      newHeight = Math.max(30, resizeStart.height + deltaY)
    }
    if (resizeHandle.includes('n')) {
      newHeight = Math.max(30, resizeStart.height - deltaY)
      newY = resizeStart.elemY + deltaY
    }

    resizeElement(selectedElementId, newWidth, newHeight, newX, newY)
  }, [isResizing, selectedElementId, resizeHandle, resizeStart, camera.zoom, activeFrameLayout.width, resizeElement])

  const handleResizeEnd = useCallback(() => {
    setIsResizing(false)
    setResizeHandle(null)
  }, [])

  // Mouse move/up for drag and resize
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (isDragging) {
        handleDragMove(e)
      }
      if (isResizing) {
        handleResizeMove(e)
      }
      if (draggingFrameId) {
        handleFrameDragMove(e)
      }
    }

    const handleMouseUp = () => {
      if (isDragging) {
        handleDragEnd()
        commitHistory() // Commit drag to history
      }
      if (isResizing) {
        handleResizeEnd()
      }
      if (draggingFrameId) {
        handleFrameDragEnd()
        commitHistory() // Commit resize to history
      }
    }

    if (isDragging || isResizing || draggingFrameId) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isDragging, isResizing, handleDragMove, handleDragEnd, handleResizeMove, handleResizeEnd, handleFrameDragMove, handleFrameDragEnd, draggingFrameId])

  // Handle text content change
  const handleTextChange = (elementId, newContent) => {
    const currentElement = elements.find((el) => el.id === elementId)
    if (!currentElement || currentElement.type !== 'text') {
      updateElement(elementId, { content: newContent })
      return
    }
    const fontSize = Number(currentElement.fontSize) || 16
    const usableWidth = Math.max(40, (Number(currentElement.width) || 120) - 12)
    const avgCharWidth = Math.max(4, fontSize * 0.55)
    const maxCharsPerLine = Math.max(8, Math.floor(usableWidth / avgCharWidth))
    const lineCount = String(newContent || '')
      .split('\n')
      .reduce((sum, line) => sum + Math.max(1, Math.ceil((line.length || 1) / maxCharsPerLine)), 0)
    const neededHeight = Math.ceil(lineCount * fontSize * 1.35 + 12)

    updateElement(elementId, {
      content: newContent,
      height: Math.max(Number(currentElement.height) || 50, neededHeight),
    })
  }

  // Add image handler
  const handleAddImage = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = (e) => {
      const file = e.target.files[0]
      if (file) {
        const reader = new FileReader()
        reader.onload = (event) => {
          addImageElement(event.target.result)
        }
        reader.readAsDataURL(file)
      }
    }
    input.click()
  }

  // Drag and drop for images
  const handleDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)

    const files = Array.from(e.dataTransfer.files)
    files.forEach(file => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader()
        reader.onload = (event) => {
          addImageElement(event.target.result)
        }
        reader.readAsDataURL(file)
      } else if (file.type.startsWith('video/')) {
        const url = URL.createObjectURL(file)
        addVideoElement(url, false)
        toast.success('Video added')
      } else if (file.type.startsWith('audio/')) {
        const url = URL.createObjectURL(file)
        addAudioElement(url, file.name)
        toast.success('Audio added')
      }
    })
  }

  // Add video handler
  const handleAddVideo = () => {
    setShowVideoModal(true)
  }

  const handleVideoSubmit = () => {
    if (videoUrl.trim()) {
      const isYouTube = videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be')
      addVideoElement(videoUrl, isYouTube)
      setVideoUrl('')
      setShowVideoModal(false)
      toast.success('Video added')
    }
  }

  // Add audio handler
  const handleAddAudio = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'audio/*'
    input.onchange = (e) => {
      const file = e.target.files[0]
      if (file) {
        const url = URL.createObjectURL(file)
        addAudioElement(url, file.name)
        toast.success('Audio added')
      }
    }
    input.click()
  }

  // Drawing handlers
  const handleDrawingStart = (e) => {
    if (!isDrawingMode) return
    const rect = drawingCanvasRef.current?.getBoundingClientRect()
    if (!rect) return
    setIsDrawing(true)
    const x = (e.clientX - rect.left) / (zoom / 100)
    const y = (e.clientY - rect.top) / (zoom / 100)
    setCurrentPath([{ x, y }])
  }

  const handleDrawingMove = (e) => {
    if (!isDrawing || !isDrawingMode) return
    const rect = drawingCanvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = (e.clientX - rect.left) / (zoom / 100)
    const y = (e.clientY - rect.top) / (zoom / 100)
    setCurrentPath(prev => [...prev, { x, y }])
  }

  const handleDrawingEnd = () => {
    if (!isDrawing) return
    setIsDrawing(false)
    if (currentPath.length > 1) {
      const newPath = {
        points: currentPath,
        color: drawingTool === 'highlighter' ? drawingColor + '80' : drawingColor,
        size: drawingTool === 'highlighter' ? drawingSize * 3 : drawingSize,
        tool: drawingTool,
      }
      setDrawingPaths(prev => [...prev, newPath])
    }
    setCurrentPath([])
  }

  const clearDrawings = () => {
    setDrawingPaths([])
  }

  const saveDrawingAsElement = () => {
    if (drawingPaths.length > 0) {
      addDrawingElement(drawingPaths)
      setDrawingPaths([])
      setIsDrawingMode(false)
      toast.success('Drawing saved')
    }
  }

  // Context menu actions
  const handleContextMenuAction = (action, data) => {
    switch (action) {
      case 'paste':
        pasteElement()
        break
      case 'text':
        addTextElement()
        break
      case 'image':
        handleAddImage()
        break
      case 'shape':
        setShowShapeOptions(true)
        break
      case 'table':
        addTableElement()
        break
      case 'icon':
        setShowIconOptions(true)
        break
      case 'previewBackground':
        updateFrameBackground(activeFrameId, data)
        break
      case 'setBackground':
        // Apply and finalize background color
        updateFrameBackground(activeFrameId, data)
        commitHistory()
        toast.success('Background color changed')
        break
      case 'background':
        // This opens the color picker in the right-click menu
        break
      case 'color':
        // Color picker handled in context menu; no immediate apply
        break
      case 'previewElementColor':
        if (selectedElement) {
          if (selectedElement.type === 'shape') {
            updateElement(selectedElementId, { fill: data })
          } else if (selectedElement.type === 'text') {
            updateElement(selectedElementId, { color: data })
          } else if (selectedElement.type === 'icon') {
            updateElement(selectedElementId, { color: data })
          }
        }
        break
      case 'setElementColor':
        if (selectedElement) {
          if (selectedElement.type === 'shape') {
            updateElement(selectedElementId, { fill: data })
          } else if (selectedElement.type === 'text') {
            updateElement(selectedElementId, { color: data })
          } else if (selectedElement.type === 'icon') {
            updateElement(selectedElementId, { color: data })
          }
          commitHistory()
          toast.success('Color changed')
        } else {
          toast.info('Select an element to change its color')
        }
        break
      case 'video':
        handleAddVideo()
        break
      case 'audio':
        handleAddAudio()
        break
      case 'duplicate':
        if (selectedElementId) {
          duplicateElement(selectedElementId)
          toast.success('Element duplicated')
        }
        break
      case 'delete':
        if (selectedElementId) {
          deleteElement(selectedElementId)
        }
        break
      case 'copy':
        if (selectedElementId) {
          copyElement(selectedElementId)
          toast.info('Copied to clipboard')
        }
        break
      case 'bringToFront':
        if (selectedElementId) {
          bringToFront(selectedElementId)
        }
        break
      case 'sendToBack':
        if (selectedElementId) {
          sendToBack(selectedElementId)
        }
        break
      default:
      // Unknown action - safely ignore
    }
    setContextMenu(null)
  }

  // Helper for roman numerals
  const getRoman = (num) => {
    if (num <= 0) return ''
    const lookup = { M: 1000, CM: 900, D: 500, CD: 400, C: 100, XC: 90, L: 50, XL: 40, X: 10, IX: 9, V: 5, IV: 4, I: 1 }
    let roman = '', i
    for (i in lookup) {
      while (num >= lookup[i]) {
        roman += i
        num -= lookup[i]
      }
    }
    return roman
  }

  // Render text with list formatting
  const renderTextContent = (element) => {
    const content = element.content || ''
    const listType = element.listType || 'none'

    if (listType === 'none' || !content) {
      return content
    }

    const lines = content.split('\n')
    let itemIndex = 0
    return lines.map((line, index) => {
      if (!line.trim()) return <div key={index}>&nbsp;</div>

      itemIndex++
      let prefix = ''

      switch (listType) {
        case 'bullet': prefix = '•'; break
        case 'bullet-hollow': prefix = '○'; break
        case 'bullet-square': prefix = '■'; break
        case 'bullet-dash': prefix = '-'; break
        case 'bullet-arrow': prefix = '➔'; break
        case 'bullet-check': prefix = '✓'; break
        case 'bullet-star': prefix = '★'; break
        case 'numbered': prefix = `${itemIndex}.`; break
        case 'numbered-paren': prefix = `${itemIndex})`; break
        case 'alpha': prefix = `${String.fromCharCode(65 + ((itemIndex - 1) % 26))}.`; break
        case 'alpha-lower': prefix = `${String.fromCharCode(97 + ((itemIndex - 1) % 26))}.`; break
        case 'roman': prefix = `${getRoman(itemIndex)}.`; break
        default: prefix = '•'
      }

      return (
        <div key={index} className="flex">
          <span className="flex-shrink-0 w-8">{prefix}</span>
          <span>{line}</span>
        </div>
      )
    })
  }

  // Get animation class for an element
  const getAnimationClass = (element) => {
    if (!isAnimationPreview || !element.animation || element.animation === 'none') return ''

    const animMap = {
      'fadeIn': 'anim-fadeIn',
      'fadeOut': 'anim-fadeOut',
      'slideInLeft': 'anim-slideInLeft',
      'slideInRight': 'anim-slideInRight',
      'slideInUp': 'anim-slideInUp',
      'slideInDown': 'anim-slideInDown',
      'zoomIn': 'anim-zoomIn',
      'zoomOut': 'anim-zoomOut',
      'bounceIn': 'anim-bounceIn',
      'rotateIn': 'anim-rotateIn',
      'flipInX': 'anim-flipInX',
      'flipInY': 'anim-flipInY',
      'lightSpeedIn': 'anim-lightSpeedIn',
      'rollIn': 'anim-rollIn',
      'slideOutLeft': 'anim-slideOutLeft',
      'slideOutRight': 'anim-slideOutRight',
      'pulse': 'anim-pulse',
      'shake': 'anim-shake',
      'swing': 'anim-swing',
      'tada': 'anim-tada',
      'wobble': 'anim-wobble',
      'heartBeat': 'anim-heartBeat',
      'rubberBand': 'anim-rubberBand',
    }

    return animMap[element.animation] || ''
  }

  // Get animation style variables
  const getAnimationStyle = (element) => {
    if (!isAnimationPreview || !element.animation || element.animation === 'none') return {}

    return {
      '--anim-duration': `${element.animationSpeed || 500}ms`,
      '--anim-delay': `${element.animationDelay || 0}ms`,
    }
  }

  // Preview animations function
  const previewAnimations = () => {
    setIsAnimationPreview(false)
    setAnimationKey(prev => prev + 1)
    setTimeout(() => {
      setIsAnimationPreview(true)
    }, 50)
  }

  // Render element content
  const renderElement = (element) => {
    switch (element.type) {
      case 'text':
        if (editingTextId === element.id) {
          return (
            <textarea
              className="w-full h-full bg-transparent border-none outline-none resize-none whitespace-pre-wrap p-2 text-editable relative z-20"
              style={{
                fontSize: element.fontSize,
                fontWeight: element.fontWeight,
                fontFamily: element.fontFamily || 'Inter',
                fontStyle: element.fontStyle || 'normal',
                textDecoration: element.textDecoration || 'none',
                textAlign: element.textAlign || 'left',
                color: element.color,
                lineHeight: 1.5,
                border: element.borderWidth ? `${element.borderWidth}px solid ${element.borderColor || '#333333'}` : 'none',
                borderRadius: element.borderRadius ? `${element.borderRadius}px` : 0,
                backgroundColor: element.backgroundColor || 'transparent',
                caretColor: '#0078d7',
              }}
              value={element.content}
              onChange={(e) => handleTextChange(element.id, e.target.value)}
              onBlur={() => {
                setEditingTextId(null)
                commitHistory() // Commit text edit to history
              }}
              onKeyDown={(e) => {
                // Escape to finish editing
                if (e.key === 'Escape') {
                  e.preventDefault()
                  setEditingTextId(null)
                  setSelectedElementId(null)
                  commitHistory()
                }
                // Tab to move to next element or create new one
                if (e.key === 'Tab') {
                  e.preventDefault()
                  setEditingTextId(null)
                  commitHistory()
                }
              }}
              autoFocus
              placeholder={element.isPlaceholder ? element.content : 'Type here...'}
            />
          )
        }
        return (
          <div
            className={`w-full h-full whitespace-pre-wrap p-2 overflow-hidden transition-colors duration-150 ${element.isPlaceholder
              ? 'text-placeholder cursor-text hover:bg-blue-50/50'
              : ''
              }`}
            style={{
              fontSize: element.fontSize,
              fontWeight: element.fontWeight,
              fontFamily: element.fontFamily || 'Inter',
              fontStyle: element.isPlaceholder ? 'italic' : (element.fontStyle || 'normal'),
              textDecoration: element.textDecoration || 'none',
              textAlign: element.textAlign || 'left',
              color: element.isPlaceholder ? '#9ca3af' : element.color,
              lineHeight: 1.5,
              border: element.borderWidth ? `${element.borderWidth}px solid ${element.borderColor || '#333333'}` : 'none',
              borderRadius: element.borderRadius ? `${element.borderRadius}px` : 0,
              backgroundColor: element.backgroundColor || 'transparent',
            }}
          >
            {renderTextContent(element)}
          </div>
        )

      case 'shape':
        const shapeStyle = {
          opacity: (element.opacity || 100) / 100,
          transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
        }

        // Shape rendering with text overlay support
        let shapeContent
        if (element.shapeType === 'circle') {
          shapeContent = (
            <div
              className="w-full h-full rounded-full"
              style={{ backgroundColor: element.fill, border: element.strokeWidth ? `${element.strokeWidth}px solid ${element.strokeColor}` : 'none', ...shapeStyle }}
            />
          )
        } else if (element.shapeType === 'triangle') {
          shapeContent = (
            <svg className="w-full h-full" viewBox="0 0 200 150" preserveAspectRatio="none" style={shapeStyle}>
              <polygon points="100,0 0,150 200,150" fill={element.fill} stroke={element.strokeColor} strokeWidth={element.strokeWidth || 0} />
            </svg>
          )
        } else if (element.shapeType === 'line') {
          shapeContent = (
            <svg className="w-full h-full" viewBox="0 0 200 10" preserveAspectRatio="none" style={shapeStyle}>
              <line x1="0" y1="5" x2="200" y2="5" stroke={element.fill} strokeWidth={element.strokeWidth || 2} strokeLinecap="round" />
            </svg>
          )
        } else if (element.shapeType === 'arrow') {
          shapeContent = (
            <svg className="w-full h-full" viewBox="0 0 200 30" preserveAspectRatio="none" style={shapeStyle}>
              <line x1="0" y1="15" x2="170" y2="15" stroke={element.fill} strokeWidth={element.strokeWidth || 2} strokeLinecap="round" />
              <polygon points="170,5 200,15 170,25" fill={element.fill} />
            </svg>
          )
        } else if (element.shapeType === 'star') {
          shapeContent = (
            <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none" style={shapeStyle}>
              <polygon points="50,5 61,35 95,35 68,57 79,91 50,70 21,91 32,57 5,35 39,35" fill={element.fill} stroke={element.strokeColor} strokeWidth={element.strokeWidth || 0} />
            </svg>
          )
        } else if (element.shapeType === 'hexagon') {
          shapeContent = (
            <svg className="w-full h-full" viewBox="0 0 120 100" preserveAspectRatio="none" style={shapeStyle}>
              <polygon points="30,0 90,0 120,50 90,100 30,100 0,50" fill={element.fill} stroke={element.strokeColor} strokeWidth={element.strokeWidth || 0} />
            </svg>
          )
        } else if (element.shapeType === 'diamond') {
          shapeContent = (
            <svg className="w-full h-full" viewBox="0 0 100 140" preserveAspectRatio="none" style={shapeStyle}>
              <polygon points="50,0 100,70 50,140 0,70" fill={element.fill} stroke={element.strokeColor} strokeWidth={element.strokeWidth || 0} />
            </svg>
          )
        } else {
          // Default rectangle
          shapeContent = (
            <div
              className="w-full h-full rounded"
              style={{ backgroundColor: element.fill, border: element.strokeWidth ? `${element.strokeWidth}px solid ${element.strokeColor}` : 'none', ...shapeStyle }}
            />
          )
        }

        // Wrap shape with text overlay
        return (
          <div className="relative w-full h-full">
            {shapeContent}
            {editingTextId === element.id ? (
              <textarea
                className="absolute inset-0 bg-transparent border-none outline-none resize-none p-2 text-center flex items-center justify-center"
                style={{
                  fontSize: `${element.fontSize}px`,
                  fontWeight: element.fontWeight,
                  fontFamily: element.fontFamily,
                  fontStyle: element.fontStyle,
                  textDecoration: element.textDecoration,
                  textAlign: element.textAlign,
                  color: element.color,
                  caretColor: '#0078d7',
                }}
                value={element.content || ''}
                onChange={(e) => handleTextChange(element.id, e.target.value)}
                onBlur={() => setEditingTextId(null)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault()
                    setEditingTextId(null)
                    setSelectedElementId(null)
                  }
                }}
                autoFocus
                placeholder="Type text..."
              />
            ) : element.content ? (
              <div
                className="absolute inset-0 flex items-center justify-center pointer-events-none"
                style={{
                  fontSize: `${element.fontSize}px`,
                  fontWeight: element.fontWeight,
                  fontFamily: element.fontFamily,
                  fontStyle: element.fontStyle,
                  textDecoration: element.textDecoration,
                  textAlign: element.textAlign,
                  color: element.color,
                  padding: '8px',
                  overflow: 'hidden',
                  wordWrap: 'break-word',
                }}
              >
                {element.content}
              </div>
            ) : null}
          </div>
        )

      case 'image':
        return (
          <div className={`w-full h-full flex flex-col ${element.caption && element.showCaption ? 'gap-1' : ''}`}>
            <img
              src={element.src}
              alt={element.caption || "canvas"}
              className={`${element.caption && element.showCaption ? 'flex-1' : 'w-full h-full'} object-cover rounded`}
              draggable={false}
            />
            {/* Image caption support */}
            {element.caption && element.showCaption && (
              editingTextId === element.id ? (
                <input
                  type="text"
                  className="w-full bg-gray-100 border-none outline-none text-center px-2 py-1 rounded"
                  style={{
                    fontSize: `${element.captionFontSize}px`,
                    color: element.captionColor,
                    fontFamily: element.captionFontFamily,
                    caretColor: '#0078d7',
                  }}
                  value={element.caption || ''}
                  onChange={(e) => updateElement(element.id, { caption: e.target.value })}
                  onBlur={() => setEditingTextId(null)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.preventDefault()
                      setEditingTextId(null)
                      setSelectedElementId(null)
                    }
                  }}
                  autoFocus
                  placeholder="Add caption..."
                />
              ) : (
                <div
                  className="w-full text-center px-2 py-1 bg-gray-100 rounded overflow-hidden text-ellipsis"
                  style={{
                    fontSize: `${element.captionFontSize}px`,
                    color: element.captionColor,
                    fontFamily: element.captionFontFamily,
                  }}
                >
                  {element.caption}
                </div>
              )
            )}
          </div>
        )

      case 'icon':
        const iconSize = Math.min(element.width, element.height) * (element.content && element.showLabel ? 0.6 : 0.8)
        const iconColor = element.color || '#2E7D32'
        return (
          <div className={`w-full h-full flex items-center justify-center ${element.content && element.showLabel ? 'flex-col gap-1' : ''}`}>
            {element.iconType === 'star' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill={iconColor} stroke="none">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            )}
            {element.iconType === 'heart' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill={iconColor} stroke="none">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            )}
            {element.iconType === 'check' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
            {element.iconType === 'x' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            )}
            {element.iconType === 'arrowRight' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
              </svg>
            )}
            {element.iconType === 'arrowUp' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" />
              </svg>
            )}
            {element.iconType === 'lightning' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill={iconColor} stroke="none">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
            )}
            {element.iconType === 'sun' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill={iconColor} stroke={iconColor} strokeWidth="1">
                <circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            )}
            {element.iconType === 'moon' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill={iconColor} stroke="none">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
            {element.iconType === 'cloud' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill={iconColor} stroke="none">
                <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
              </svg>
            )}
            {element.iconType === 'thumbsUp' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill={iconColor} stroke="none">
                <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
              </svg>
            )}
            {element.iconType === 'thumbsDown' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill={iconColor} stroke="none">
                <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />
              </svg>
            )}
            {element.iconType === 'flag' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill={iconColor} stroke={iconColor} strokeWidth="1">
                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" />
              </svg>
            )}
            {element.iconType === 'bell' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill={iconColor} stroke={iconColor} strokeWidth="1">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            )}
            {element.iconType === 'bookmark' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill={iconColor} stroke="none">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
              </svg>
            )}
            {element.iconType === 'lock' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            )}
            {element.iconType === 'trophy' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill={iconColor} stroke={iconColor} strokeWidth="1">
                <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M10 22V8a6 6 0 0 0-6-6v1a5 5 0 0 0 5 5h6a5 5 0 0 0 5-5V2a6 6 0 0 0-6 6v14" />
              </svg>
            )}
            {element.iconType === 'gift' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <polyline points="20 12 20 22 4 22 4 12" /><rect x="2" y="7" width="20" height="5" /><line x1="12" y1="22" x2="12" y2="7" /><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" /><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
              </svg>
            )}
            {element.iconType === 'arrowDown' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" />
              </svg>
            )}
            {element.iconType === 'arrowLeft' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
              </svg>
            )}
            {element.iconType === 'unlock' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 9.9-1" />
              </svg>
            )}
            {element.iconType === 'home' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
              </svg>
            )}
            {element.iconType === 'user' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
              </svg>
            )}
            {element.iconType === 'users' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            )}
            {element.iconType === 'settings' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            )}
            {element.iconType === 'search' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            )}
            {element.iconType === 'mail' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" />
              </svg>
            )}
            {element.iconType === 'phone' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
            )}
            {element.iconType === 'calendar' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            )}
            {element.iconType === 'clock' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
              </svg>
            )}
            {element.iconType === 'camera' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" />
              </svg>
            )}
            {element.iconType === 'image' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
              </svg>
            )}
            {element.iconType === 'video' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
              </svg>
            )}
            {element.iconType === 'music' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
              </svg>
            )}
            {element.iconType === 'headphones' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <path d="M3 18v-6a9 9 0 0 1 18 0v6" /><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
              </svg>
            )}
            {element.iconType === 'mic' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            )}
            {element.iconType === 'wifi' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <path d="M5 12.55a11 11 0 0 1 14.08 0" /><path d="M1.42 9a16 16 0 0 1 21.16 0" /><path d="M8.53 16.11a6 6 0 0 1 6.95 0" /><line x1="12" y1="20" x2="12.01" y2="20" />
              </svg>
            )}
            {element.iconType === 'download' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            )}
            {element.iconType === 'upload' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            )}
            {element.iconType === 'share' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
            )}
            {element.iconType === 'link' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
            )}
            {element.iconType === 'pin' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill={iconColor} stroke="none">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" fill="white" />
              </svg>
            )}
            {element.iconType === 'globe' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
            )}
            {element.iconType === 'coffee' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <path d="M18 8h1a4 4 0 0 1 0 8h-1" /><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" /><line x1="6" y1="1" x2="6" y2="4" /><line x1="10" y1="1" x2="10" y2="4" /><line x1="14" y1="1" x2="14" y2="4" />
              </svg>
            )}
            {element.iconType === 'briefcase' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
              </svg>
            )}
            {element.iconType === 'folder' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
            )}
            {element.iconType === 'file' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><polyline points="13 2 13 9 20 9" />
              </svg>
            )}
            {element.iconType === 'clipboard' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
              </svg>
            )}
            {element.iconType === 'edit' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            )}
            {element.iconType === 'trash' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            )}
            {element.iconType === 'plus' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            )}
            {element.iconType === 'minus' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            )}
            {element.iconType === 'refresh' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
            )}
            {element.iconType === 'power' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <path d="M18.36 6.64a9 9 0 1 1-12.73 0" /><line x1="12" y1="2" x2="12" y2="12" />
              </svg>
            )}
            {element.iconType === 'zap' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill={iconColor} stroke="none">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
            )}
            {element.iconType === 'target' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />
              </svg>
            )}
            {element.iconType === 'award' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <circle cx="12" cy="8" r="7" /><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" />
              </svg>
            )}
            {element.iconType === 'shield' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            )}
            {element.iconType === 'eye' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
              </svg>
            )}
            {element.iconType === 'eyeOff' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            )}
            {element.iconType === 'smile' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" />
              </svg>
            )}
            {element.iconType === 'frown' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><path d="M16 16s-1.5-2-4-2-4 2-4 2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" />
              </svg>
            )}
            {element.iconType === 'meh' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><line x1="8" y1="15" x2="16" y2="15" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" />
              </svg>
            )}
            {element.iconType === 'fire' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill={iconColor} stroke="none">
                <path d="M12 23c-3.9 0-7-3.1-7-7 0-2.1.9-4.1 2.5-5.5L12 6l4.5 4.5c1.6 1.4 2.5 3.4 2.5 5.5 0 3.9-3.1 7-7 7z" />
              </svg>
            )}
            {element.iconType === 'droplet' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill={iconColor} stroke="none">
                <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
              </svg>
            )}
            {element.iconType === 'leaf' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill={iconColor} stroke="none">
                <path d="M17 8C8 10 5.9 16.17 3.82 21.34l1.89.66.95-2.3c.48.17.98.3 1.34.3C19 20 22 3 22 3c-1 2-8 2.25-13 3.25S2 11.5 2 13.5s1.75 3.75 1.75 3.75C7 8 17 8 17 8z" />
              </svg>
            )}
            {element.iconType === 'rocket' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" /><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" /><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" /><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
              </svg>
            )}
            {element.iconType === 'anchor' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <circle cx="12" cy="5" r="3" /><line x1="12" y1="22" x2="12" y2="8" /><path d="M5 12H2a10 10 0 0 0 20 0h-3" />
              </svg>
            )}
            {element.iconType === 'compass' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
              </svg>
            )}
            {element.iconType === 'umbrella' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <path d="M23 12a11.05 11.05 0 0 0-22 0zm-5 7a3 3 0 0 1-6 0v-7" />
              </svg>
            )}
            {element.iconType === 'lightbulb' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <line x1="9" y1="18" x2="15" y2="18" /><line x1="10" y1="22" x2="14" y2="22" /><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
              </svg>
            )}
            {element.iconType === 'key' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
              </svg>
            )}
            {element.iconType === 'crown' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill={iconColor} stroke="none">
                <path d="M2 16l4-10 6 6 6-6 4 10z" />
              </svg>
            )}
            {element.iconType === 'gem' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <polygon points="12 2 2 7 12 22 22 7 12 2" /><polyline points="2 7 12 12 22 7" /><line x1="12" y1="12" x2="12" y2="22" />
              </svg>
            )}
            {element.iconType === 'dollar' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            )}
            {element.iconType === 'percent' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <line x1="19" y1="5" x2="5" y2="19" /><circle cx="6.5" cy="6.5" r="2.5" /><circle cx="17.5" cy="17.5" r="2.5" />
              </svg>
            )}
            {element.iconType === 'hash' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <line x1="4" y1="9" x2="20" y2="9" /><line x1="4" y1="15" x2="20" y2="15" /><line x1="10" y1="3" x2="8" y2="21" /><line x1="16" y1="3" x2="14" y2="21" />
              </svg>
            )}
            {element.iconType === 'at' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <circle cx="12" cy="12" r="4" /><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94" />
              </svg>
            )}
            {element.iconType === 'infinity' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <path d="M18.178 8c5.096 0 5.096 8 0 8-5.095 0-7.133-8-12.739-8-4.585 0-4.585 8 0 8 5.606 0 7.644-8 12.74-8z" />
              </svg>
            )}
            {element.iconType === 'info' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
            )}
            {element.iconType === 'alertCircle' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            )}
            {element.iconType === 'helpCircle' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            )}
            {element.iconType === 'checkCircle' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            )}
            {element.iconType === 'xCircle' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            )}
            {element.iconType === 'minusCircle' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><line x1="8" y1="12" x2="16" y2="12" />
              </svg>
            )}
            {element.iconType === 'plusCircle' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" />
              </svg>
            )}
            {/* Additional icons - flower, tree, mountain, plane, car, bike, battery, bluetooth */}
            {element.iconType === 'flower' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill={iconColor} stroke="none">
                <circle cx="12" cy="12" r="3" /><path d="M12 2a3 3 0 0 1 0 6 3 3 0 0 1 0-6zM12 16a3 3 0 0 1 0 6 3 3 0 0 1 0-6zM4.93 4.93a3 3 0 0 1 4.24 4.24 3 3 0 0 1-4.24-4.24zM14.83 14.83a3 3 0 0 1 4.24 4.24 3 3 0 0 1-4.24-4.24zM2 12a3 3 0 0 1 6 0 3 3 0 0 1-6 0zM16 12a3 3 0 0 1 6 0 3 3 0 0 1-6 0zM4.93 19.07a3 3 0 0 1 4.24-4.24 3 3 0 0 1-4.24 4.24zM14.83 9.17a3 3 0 0 1 4.24-4.24 3 3 0 0 1-4.24 4.24z" />
              </svg>
            )}
            {element.iconType === 'tree' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill={iconColor} stroke="none">
                <path d="M12 2L4 12h4l-3 5h4l-3 5h12l-3-5h4l-3-5h4L12 2z" />
              </svg>
            )}
            {element.iconType === 'mountain' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <path d="M8 21l6-9 4 5h4L12 3 2 21h6z" />
              </svg>
            )}
            {element.iconType === 'plane' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 1 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
              </svg>
            )}
            {element.iconType === 'car' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <path d="M16 8l2 4h2a2 2 0 0 1 2 2v3a1 1 0 0 1-1 1h-1.09a3 3 0 0 1-5.82 0H9.91a3 3 0 0 1-5.82 0H3a1 1 0 0 1-1-1v-5a2 2 0 0 1 2-2h10z" /><circle cx="7" cy="17" r="2" /><circle cx="17" cy="17" r="2" />
              </svg>
            )}
            {element.iconType === 'bike' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <circle cx="5.5" cy="17.5" r="3.5" /><circle cx="18.5" cy="17.5" r="3.5" /><path d="M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm-3 11.5V14l-3-3 4-3 2 3h3" />
              </svg>
            )}
            {element.iconType === 'battery' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <rect x="1" y="6" width="18" height="12" rx="2" ry="2" /><line x1="23" y1="13" x2="23" y2="11" />
              </svg>
            )}
            {element.iconType === 'bluetooth' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <polyline points="6.5 6.5 17.5 17.5 12 23 12 1 17.5 6.5 6.5 17.5" />
              </svg>
            )}
            {/* Icon label support */}
            {element.content && element.showLabel && (
              editingTextId === element.id ? (
                <input
                  type="text"
                  className="w-full bg-transparent border-none outline-none text-center px-1"
                  style={{
                    fontSize: `${element.fontSize}px`,
                    fontWeight: element.fontWeight,
                    fontFamily: element.fontFamily,
                    color: element.textColor,
                    caretColor: '#0078d7',
                  }}
                  value={element.content || ''}
                  onChange={(e) => handleTextChange(element.id, e.target.value)}
                  onBlur={() => setEditingTextId(null)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.preventDefault()
                      setEditingTextId(null)
                      setSelectedElementId(null)
                    }
                  }}
                  autoFocus
                  placeholder="Label"
                />
              ) : (
                <div
                  className="w-full text-center px-1 overflow-hidden text-ellipsis whitespace-nowrap"
                  style={{
                    fontSize: `${element.fontSize}px`,
                    fontWeight: element.fontWeight,
                    fontFamily: element.fontFamily,
                    color: element.textColor,
                  }}
                >
                  {element.content}
                </div>
              )
            )}
          </div>
        )

      case 'table':
        return (
          <table className="w-full h-full border-collapse border border-gray-400">
            <tbody>
              {Array(element.rows).fill(null).map((_, rowIdx) => (
                <tr key={rowIdx}>
                  {Array(element.cols).fill(null).map((_, colIdx) => (
                    <td
                      key={`${rowIdx}-${colIdx}`}
                      className="border border-gray-400 p-2 text-xs"
                      contentEditable
                      suppressContentEditableWarning
                    >
                      {element.data?.[rowIdx]?.[colIdx] || ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )

      case 'video':
        return element.isYouTube ? (
          <iframe
            src={element.src}
            className="w-full h-full rounded"
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <video
            src={element.src}
            className="w-full h-full rounded bg-black"
            controls
            muted={element.muted}
            loop={element.loop}
          />
        )

      case 'audio':
        return (
          <div className="w-full h-full bg-gray-100 rounded-lg flex items-center gap-3 px-4">
            <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center flex-shrink-0">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{element.title}</p>
              <audio src={element.src} controls className="w-full h-8 mt-1" />
            </div>
          </div>
        )

      case 'drawing':
        return (
          <svg className="w-full h-full" viewBox={`0 0 ${SLIDE_WIDTH} ${SLIDE_HEIGHT}`}>
            {element.paths?.map((path, pathIdx) => (
              <path
                key={pathIdx}
                d={`M ${path.points.map(p => `${p.x} ${p.y}`).join(' L ')}`}
                stroke={path.color}
                strokeWidth={path.size}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </svg>
        )

      default:
        return null
    }
  }


  const resolveFrameKind = useCallback((frame, index) => {
    const textNodes = (frame?.elements || []).filter(el => el?.type === 'text' && !el?.isPlaceholder)
    const imageNodes = (frame?.elements || []).filter(el => el?.type === 'image')
    const headline = (textNodes[0]?.content || frame?.title || '').toLowerCase()
    if (index === 0 || /presentation|title|untitled/.test(headline)) return 'title'
    if (/closing|end/.test(headline)) return 'closing'
    if (/bold|statement/.test(headline) || ((frame?.backgroundColor || '').toLowerCase() !== '#ffffff' && imageNodes.length > 0)) return 'bold'
    if (imageNodes.length > 0) return 'content'
    return 'text'
  }, [])



  const updateCameraToBox = useCallback((box, zoomScale = 0.8) => {
    if (!canvasRef.current || !box) return
    const rect = canvasRef.current.getBoundingClientRect()
    const viewportW = Math.max(360, rect.width)
    const viewportH = Math.max(280, rect.height)

    const targetZoom = Math.max(0.25, Math.min(2.2, Math.min((viewportW / box.width) * zoomScale, (viewportH / box.height) * zoomScale)))

    const worldCenterX = box.x + box.width / 2
    const worldCenterY = box.y + box.height / 2
    const originX = worldBounds.width / 2
    const originY = worldBounds.height / 2
    const viewportCenterX = viewportW / 2
    const viewportCenterY = viewportH / 2

    const panX = originX + (viewportCenterX - originX) / targetZoom - worldCenterX
    const panY = originY + (viewportCenterY - originY) / targetZoom - worldCenterY

    setCamera({ zoom: targetZoom, panX, panY })
    setZoom(Math.round(targetZoom * 100))
  }, [worldBounds.height, worldBounds.width, setZoom])

  const focusOverview = useCallback(() => {
    const width = Math.max(1, worldBounds.maxX - worldBounds.minX)
    const height = Math.max(1, worldBounds.maxY - worldBounds.minY)
    updateCameraToBox({ x: worldBounds.minX, y: worldBounds.minY, width, height }, 0.85)
  }, [worldBounds.maxX, worldBounds.maxY, worldBounds.minX, worldBounds.minY, updateCameraToBox])

  const focusFrameById = useCallback((frameId) => {
    const target = frameMapLayout.find(f => f.id === frameId)
    if (target) updateCameraToBox(target, 0.8)
  }, [frameMapLayout, updateCameraToBox])

  useEffect(() => {
    if (!hasInitializedCameraRef.current && frameMapLayout.length > 0) {
      hasInitializedCameraRef.current = true
      focusOverview()
    }
  }, [focusOverview, frameMapLayout.length])

  const handleFrameFocus = useCallback((frameId, mode = 'frame') => {
    setIsNavigating(false); // Make sure transition is enabled for focus
    setActiveFrameId(frameId)
    if (mode === 'overview') {
      focusOverview()
      return
    }
    focusFrameById(frameId)
  }, [focusFrameById, focusOverview, setActiveFrameId])

  return (
    <div className="h-screen flex flex-col bg-gray-100 relative">
      {/* Template Loading Overlay */}
      {isTemplateLoading && (
        <div className="absolute inset-0 z-[100] bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center">
          <div className="w-16 h-16 border-4 border-primary/30 border-t-primary rounded-full animate-spin mb-4"></div>
          <h3 className="text-xl font-semibold text-gray-800">Loading Template...</h3>
          <p className="text-gray-500 mt-2 text-sm">Please wait while we set up your workspace</p>
        </div>
      )}

      {/* Left side faint orange tint */}
      <div
        className="fixed left-0 top-0 h-full pointer-events-none z-0"
        style={{
          width: '150px',
          background: 'linear-gradient(to right, rgba(255, 237, 213, 0.3) 0%, rgba(255, 245, 235, 0.15) 50%, transparent 100%)',
        }}
      />
      {/* Top Header Bar */}
      <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-3 sm:px-4 relative z-10">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-gray-100 rounded-md transition-all text-gray-600"
            title="Back"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>

          <input
            type="text"
            value={projectTitle || 'Untitled presentation'}
            onChange={(e) => setProjectTitle(e.target.value)}
            className="text-base font-semibold text-gray-800 bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-primary/20 rounded px-1 py-1 min-w-[170px]"
            placeholder="Untitled presentation"
          />

          <button className="h-8 px-3 rounded-md bg-[#3dba4e] text-white text-sm font-semibold flex items-center gap-1 hover:bg-[#33a845] transition-all">
            Public
            <span className="text-xs">▾</span>
          </button>
        </div>

        <EditorToolbar
          showMediaDropdown={showMediaDropdown}
          setShowMediaDropdown={setShowMediaDropdown}
          onSave={handleSaveProject}
          onAddText={() => addTextElement()}
          onAddShape={() => setShowShapeOptions(!showShapeOptions)}
          onAddImage={handleAddImage}
          onAddVideo={handleAddVideo}
          onAddAudio={handleAddAudio}
          onAddIcon={() => setShowIconOptions(!showIconOptions)}
          onAddTable={() => setShowTableOptions(!showTableOptions)}
          onUndo={undo}
          onRedo={redo}
          canUndo={canUndo}
          canRedo={canRedo}
        />

        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden lg:block text-xs text-gray-500">
            {isSaving ? 'Saving...' : (lastSavedTime || lastSaved) ? 'Saved' : ''}
          </div>

          <button className="p-2 rounded-md hover:bg-gray-100 text-gray-600 transition-all" title="Bookmark">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
          </button>

          <div className="flex items-center gap-1 text-gray-700 text-sm font-semibold">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M8 12h8" />
              <path d="M12 8v8" />
            </svg>
            1000
          </div>

          <div className="w-8 h-8 rounded-full bg-cyan-400 text-white text-xs font-bold flex items-center justify-center">DM</div>

          <button
            onClick={handlePresent}
            className="h-9 px-3 rounded-md bg-[#2f7df6] hover:bg-[#226de1] text-white text-sm font-semibold flex items-center gap-1.5 transition-all"
          >
            <span>▶</span>
            <span>Present</span>
            <span className="text-xs">▾</span>
          </button>

          <div className="relative">
            <button
              onClick={() => setShowShareDropdown(!showShareDropdown)}
              className="h-9 px-3 rounded-md border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 text-sm font-semibold flex items-center gap-1.5 transition-all"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
              <span>Share</span>
            </button>
            {showShareDropdown && (
              <ShareDropdown
                onClose={() => setShowShareDropdown(false)}
                onUpgrade={() => setShowUpgradeModal(true)}
                onExport={() => {
                  exportProject()
                  toast.success('Project exported')
                }}
              />
            )}
          </div>
        </div>
      </header>

      {/* Text Toolbar (shown when text is selected) */}
      {showTextToolbar && selectedElement?.type === 'text' && (
        <TextToolbar
          element={selectedElement}
          onUpdate={(updates) => {
            updateElement(selectedElementId, updates)
          }}
          onAnimationChange={(animation) => {
            updateElementAnimation(selectedElementId, animation)
          }}
        />
      )}

      {/* Shape Options Dropdown */}
      {showShapeOptions && (
        <div className="dropdown-options absolute top-24 left-1/2 transform -translate-x-1/2 bg-white border border-gray-200 rounded-xl shadow-lg p-4 z-30 max-w-4xl max-h-[600px] overflow-y-auto">
          <p className="text-sm font-semibold text-gray-900 mb-3">Add Shape (50+ Options)</p>
          <div className="grid grid-cols-8 gap-3">
            <button
              onClick={() => { addShapeElement('rectangle'); setShowShapeOptions(false); }}
              className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all"
            >
              <div className="w-10 h-8 bg-green-500 rounded" />
              <span className="text-xs text-gray-600">Rectangle</span>
            </button>
            <button
              onClick={() => { addShapeElement('circle'); setShowShapeOptions(false); }}
              className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all"
            >
              <div className="w-10 h-10 bg-blue-500 rounded-full" />
              <span className="text-xs text-gray-600">Circle</span>
            </button>
            <button
              onClick={() => { addShapeElement('triangle'); setShowShapeOptions(false); }}
              className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all"
            >
              <svg width="24" height="24" viewBox="0 0 24 24"><polygon points="12,4 2,20 22,20" fill="#FF5722" /></svg>
              <span className="text-xs text-gray-600">Triangle</span>
            </button>
            <button
              onClick={() => { addShapeElement('line'); setShowShapeOptions(false); }}
              className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all"
            >
              <svg width="24" height="8" viewBox="0 0 24 8"><line x1="0" y1="4" x2="24" y2="4" stroke="#333" strokeWidth="3" /></svg>
              <span className="text-xs text-gray-600">Line</span>
            </button>
            <button
              onClick={() => { addShapeElement('arrow'); setShowShapeOptions(false); }}
              className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all"
            >
              <svg width="24" height="12" viewBox="0 0 24 12"><line x1="0" y1="6" x2="18" y2="6" stroke="#333" strokeWidth="2" /><polygon points="18,2 24,6 18,10" fill="#333" /></svg>
              <span className="text-xs text-gray-600">Arrow</span>
            </button>
            <button
              onClick={() => { addShapeElement('star'); setShowShapeOptions(false); }}
              className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all"
            >
              <svg width="24" height="24" viewBox="0 0 24 24"><polygon points="12,2 15,9 22,9 16,14 18,21 12,17 6,21 8,14 2,9 9,9" fill="#FFD700" /></svg>
              <span className="text-xs text-gray-600">Star</span>
            </button>
            <button
              onClick={() => { addShapeElement('hexagon'); setShowShapeOptions(false); }}
              className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all"
            >
              <svg width="24" height="24" viewBox="0 0 24 24"><polygon points="6,2 18,2 24,12 18,22 6,22 0,12" fill="#9C27B0" /></svg>
              <span className="text-xs text-gray-600">Hexagon</span>
            </button>
            <button
              onClick={() => { addShapeElement('diamond'); setShowShapeOptions(false); }}
              className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all"
            >
              <svg width="24" height="24" viewBox="0 0 24 24"><polygon points="12,2 22,12 12,22 2,12" fill="#00BCD4" /></svg>
              <span className="text-xs text-gray-600">Diamond</span>
            </button>
            {/* Additional 42 shapes */}
            <button onClick={() => { addShapeElement('rectangle'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <div className="w-10 h-8 bg-red-500 rounded" />
              <span className="text-xs text-gray-600">Red Rect</span>
            </button>
            <button onClick={() => { addShapeElement('circle'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <div className="w-10 h-10 bg-purple-500 rounded-full" />
              <span className="text-xs text-gray-600">Purple Circle</span>
            </button>
            <button onClick={() => { addShapeElement('rectangle'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <div className="w-10 h-6 bg-yellow-500 rounded-full" />
              <span className="text-xs text-gray-600">Oval</span>
            </button>
            <button onClick={() => { addShapeElement('triangle'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="24" height="24" viewBox="0 0 24 24"><polygon points="12,4 2,20 22,20" fill="#4CAF50" /></svg>
              <span className="text-xs text-gray-600">Green Triangle</span>
            </button>
            <button onClick={() => { addShapeElement('rectangle'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <div className="w-10 h-8 bg-orange-500 rounded-lg" />
              <span className="text-xs text-gray-600">Rounded Rect</span>
            </button>
            <button onClick={() => { addShapeElement('circle'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <div className="w-10 h-10 bg-teal-500 rounded-full" />
              <span className="text-xs text-gray-600">Teal Circle</span>
            </button>
            <button onClick={() => { addShapeElement('line'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="24" height="8" viewBox="0 0 24 8"><line x1="0" y1="4" x2="24" y2="4" stroke="#E91E63" strokeWidth="3" /></svg>
              <span className="text-xs text-gray-600">Pink Line</span>
            </button>
            <button onClick={() => { addShapeElement('arrow'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="24" height="12" viewBox="0 0 24 12"><line x1="0" y1="6" x2="18" y2="6" stroke="#2196F3" strokeWidth="2" /><polygon points="18,2 24,6 18,10" fill="#2196F3" /></svg>
              <span className="text-xs text-gray-600">Blue Arrow</span>
            </button>
            <button onClick={() => { addShapeElement('rectangle'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <div className="w-10 h-8 bg-indigo-500" />
              <span className="text-xs text-gray-600">Square</span>
            </button>
            <button onClick={() => { addShapeElement('rectangle'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <div className="w-10 h-12 bg-cyan-500 rounded" />
              <span className="text-xs text-gray-600">Tall Rect</span>
            </button>
            <button onClick={() => { addShapeElement('circle'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <div className="w-10 h-10 bg-lime-500 rounded-full" />
              <span className="text-xs text-gray-600">Lime Circle</span>
            </button>
            <button onClick={() => { addShapeElement('triangle'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="24" height="24" viewBox="0 0 24 24"><polygon points="12,4 2,20 22,20" fill="#9C27B0" /></svg>
              <span className="text-xs text-gray-600">Purple Triangle</span>
            </button>
            <button onClick={() => { addShapeElement('star'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="24" height="24" viewBox="0 0 24 24"><polygon points="12,2 15,9 22,9 16,14 18,21 12,17 6,21 8,14 2,9 9,9" fill="#F44336" /></svg>
              <span className="text-xs text-gray-600">Red Star</span>
            </button>
            <button onClick={() => { addShapeElement('hexagon'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="24" height="24" viewBox="0 0 24 24"><polygon points="6,2 18,2 24,12 18,22 6,22 0,12" fill="#3F51B5" /></svg>
              <span className="text-xs text-gray-600">Blue Hexagon</span>
            </button>
            <button onClick={() => { addShapeElement('diamond'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="24" height="24" viewBox="0 0 24 24"><polygon points="12,2 22,12 12,22 2,12" fill="#FF9800" /></svg>
              <span className="text-xs text-gray-600">Orange Diamond</span>
            </button>
            <button onClick={() => { addShapeElement('rectangle'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <div className="w-10 h-2 bg-gray-700" />
              <span className="text-xs text-gray-600">Thin Bar</span>
            </button>
            <button onClick={() => { addShapeElement('circle'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <div className="w-6 h-6 bg-pink-500 rounded-full" />
              <span className="text-xs text-gray-600">Small Circle</span>
            </button>
            {/* More varied shapes using SVG for proper rendering */}
            <button onClick={() => { addShapeElement('rectangle'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="32" height="24" viewBox="0 0 32 24"><rect x="1" y="1" width="30" height="22" fill="none" stroke="#3B82F6" strokeWidth="2" rx="2" /></svg>
              <span className="text-xs text-gray-600">Blue Rect</span>
            </button>
            <button onClick={() => { addShapeElement('circle'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="28" height="28" viewBox="0 0 28 28"><circle cx="14" cy="14" r="12" fill="none" stroke="#10B981" strokeWidth="2" /></svg>
              <span className="text-xs text-gray-600">Green Circle</span>
            </button>
            <button onClick={() => { addShapeElement('triangle'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="28" height="24" viewBox="0 0 28 24"><polygon points="14,2 26,22 2,22" fill="none" stroke="#EF4444" strokeWidth="2" /></svg>
              <span className="text-xs text-gray-600">Red Triangle</span>
            </button>
            <button onClick={() => { addShapeElement('diamond'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="24" height="28" viewBox="0 0 24 28"><polygon points="12,2 22,14 12,26 2,14" fill="none" stroke="#8B5CF6" strokeWidth="2" /></svg>
              <span className="text-xs text-gray-600">Purple Diamond</span>
            </button>
            <button onClick={() => { addShapeElement('star'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="28" height="28" viewBox="0 0 28 28"><polygon points="14,2 17,10 26,10 19,16 21,25 14,20 7,25 9,16 2,10 11,10" fill="none" stroke="#F59E0B" strokeWidth="2" /></svg>
              <span className="text-xs text-gray-600">Yellow Star</span>
            </button>
            <button onClick={() => { addShapeElement('hexagon'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="28" height="28" viewBox="0 0 28 28"><polygon points="14,2 25,8 25,20 14,26 3,20 3,8" fill="none" stroke="#06B6D4" strokeWidth="2" /></svg>
              <span className="text-xs text-gray-600">Cyan Hexagon</span>
            </button>
            <button onClick={() => { addShapeElement('arrow'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="32" height="16" viewBox="0 0 32 16"><line x1="2" y1="8" x2="24" y2="8" stroke="#374151" strokeWidth="2" /><polygon points="24,4 30,8 24,12" fill="#374151" /></svg>
              <span className="text-xs text-gray-600">Arrow</span>
            </button>
            <button onClick={() => { addShapeElement('line'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="32" height="8" viewBox="0 0 32 8"><line x1="2" y1="4" x2="30" y2="4" stroke="#EC4899" strokeWidth="3" /></svg>
              <span className="text-xs text-gray-600">Pink Line</span>
            </button>
            <button onClick={() => { addShapeElement('rectangle'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="24" height="24" viewBox="0 0 24 24"><rect x="1" y="1" width="22" height="22" fill="none" stroke="#1F2937" strokeWidth="2" /></svg>
              <span className="text-xs text-gray-600">Square</span>
            </button>
            <button onClick={() => { addShapeElement('circle'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="32" height="20" viewBox="0 0 32 20"><ellipse cx="16" cy="10" rx="14" ry="8" fill="none" stroke="#7C3AED" strokeWidth="2" /></svg>
              <span className="text-xs text-gray-600">Oval</span>
            </button>
            <button onClick={() => { addShapeElement('triangle'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="28" height="24" viewBox="0 0 28 24"><polygon points="2,22 26,22 14,2" fill="none" stroke="#F97316" strokeWidth="2" /></svg>
              <span className="text-xs text-gray-600">Inverted Tri</span>
            </button>
            <button onClick={() => { addShapeElement('star'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="28" height="28" viewBox="0 0 28 28"><polygon points="14,4 16,11 24,11 18,15 20,23 14,19 8,23 10,15 4,11 12,11" fill="none" stroke="#DC2626" strokeWidth="2" /></svg>
              <span className="text-xs text-gray-600">Red Star</span>
            </button>
            <button onClick={() => { addShapeElement('hexagon'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="28" height="26" viewBox="0 0 28 26"><polygon points="7,2 21,2 27,13 21,24 7,24 1,13" fill="none" stroke="#4F46E5" strokeWidth="2" /></svg>
              <span className="text-xs text-gray-600">Wide Hexagon</span>
            </button>
            <button onClick={() => { addShapeElement('diamond'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="24" height="24" viewBox="0 0 24 24"><polygon points="12,1 23,12 12,23 1,12" fill="none" stroke="#0EA5E9" strokeWidth="2" /></svg>
              <span className="text-xs text-gray-600">Diamond</span>
            </button>
            <button onClick={() => { addShapeElement('rectangle'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="32" height="18" viewBox="0 0 32 18"><rect x="1" y="1" width="30" height="16" rx="8" fill="none" stroke="#059669" strokeWidth="2" /></svg>
              <span className="text-xs text-gray-600">Capsule</span>
            </button>
            <button onClick={() => { addShapeElement('star'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="28" height="28" viewBox="0 0 28 28"><polygon points="14,1 17,9 26,9 19,15 22,24 14,19 6,24 9,15 2,9 11,9" fill="none" stroke="#BE185D" strokeWidth="2" /></svg>
              <span className="text-xs text-gray-600">Pink Star</span>
            </button>
            <button onClick={() => { addShapeElement('arrow'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="16" height="32" viewBox="0 0 16 32"><line x1="8" y1="28" x2="8" y2="6" stroke="#374151" strokeWidth="2" /><polygon points="4,6 8,1 12,6" fill="#374151" /></svg>
              <span className="text-xs text-gray-600">Up Arrow</span>
            </button>
            <button onClick={() => { addShapeElement('arrow'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="16" height="32" viewBox="0 0 16 32"><line x1="8" y1="4" x2="8" y2="26" stroke="#374151" strokeWidth="2" /><polygon points="4,26 8,31 12,26" fill="#374151" /></svg>
              <span className="text-xs text-gray-600">Down Arrow</span>
            </button>
            <button onClick={() => { addShapeElement('arrow'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="32" height="16" viewBox="0 0 32 16"><line x1="28" y1="8" x2="6" y2="8" stroke="#374151" strokeWidth="2" /><polygon points="6,4 1,8 6,12" fill="#374151" /></svg>
              <span className="text-xs text-gray-600">Left Arrow</span>
            </button>
            <button onClick={() => { addShapeElement('rectangle'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="32" height="20" viewBox="0 0 32 20"><rect x="1" y="1" width="30" height="18" rx="3" fill="none" stroke="#6366F1" strokeWidth="2" /></svg>
              <span className="text-xs text-gray-600">Rounded Rect</span>
            </button>
            <button onClick={() => { addShapeElement('triangle'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="24" height="24" viewBox="0 0 24 24"><polygon points="2,12 22,2 22,22" fill="none" stroke="#0D9488" strokeWidth="2" /></svg>
              <span className="text-xs text-gray-600">Right Triangle</span>
            </button>
            <button onClick={() => { addShapeElement('hexagon'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="28" height="24" viewBox="0 0 28 24"><polygon points="6,2 22,2 26,12 22,22 6,22 2,12" fill="none" stroke="#7C3AED" strokeWidth="2" /></svg>
              <span className="text-xs text-gray-600">Octagon</span>
            </button>
            <button onClick={() => { addShapeElement('star'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="28" height="28" viewBox="0 0 28 28"><polygon points="14,2 16,12 26,14 16,16 14,26 12,16 2,14 12,12" fill="none" stroke="#F59E0B" strokeWidth="2" /></svg>
              <span className="text-xs text-gray-600">4-Point Star</span>
            </button>
            <button onClick={() => { addShapeElement('diamond'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="28" height="24" viewBox="0 0 28 24"><polygon points="14,2 26,10 22,22 6,22 2,10" fill="none" stroke="#8B5CF6" strokeWidth="2" /></svg>
              <span className="text-xs text-gray-600">Pentagon</span>
            </button>
            <button onClick={() => { addShapeElement('line'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="28" height="28" viewBox="0 0 28 28"><line x1="4" y1="24" x2="24" y2="4" stroke="#EF4444" strokeWidth="2" /></svg>
              <span className="text-xs text-gray-600">Diagonal Line</span>
            </button>
            <button onClick={() => { addShapeElement('line'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="28" height="28" viewBox="0 0 28 28"><line x1="4" y1="4" x2="24" y2="24" stroke="#10B981" strokeWidth="2" /></svg>
              <span className="text-xs text-gray-600">Diagonal Line 2</span>
            </button>
            <button onClick={() => { addShapeElement('circle'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="28" height="28" viewBox="0 0 28 28"><circle cx="14" cy="14" r="12" fill="none" stroke="#3B82F6" strokeWidth="2" strokeDasharray="4 2" /></svg>
              <span className="text-xs text-gray-600">Dashed Circle</span>
            </button>
            <button onClick={() => { addShapeElement('rectangle'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="28" height="22" viewBox="0 0 28 22"><rect x="2" y="2" width="24" height="18" fill="none" stroke="#1F2937" strokeWidth="2" strokeDasharray="4 2" /></svg>
              <span className="text-xs text-gray-600">Dashed Rect</span>
            </button>
            <button onClick={() => { addShapeElement('star'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="28" height="28" viewBox="0 0 28 28"><polygon points="14,1 16.5,8 24,8 18,13 20,21 14,17 8,21 10,13 4,8 11.5,8" fill="none" stroke="#4ADE80" strokeWidth="2" /></svg>
              <span className="text-xs text-gray-600">Green Star</span>
            </button>
            <button onClick={() => { addShapeElement('triangle'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="28" height="24" viewBox="0 0 28 24"><polygon points="14,22 2,4 26,4" fill="none" stroke="#6366F1" strokeWidth="2" /></svg>
              <span className="text-xs text-gray-600">Flip Triangle</span>
            </button>
            <button onClick={() => { addShapeElement('hexagon'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="28" height="28" viewBox="0 0 28 28"><polygon points="14,2 26,7 26,21 14,26 2,21 2,7" fill="none" stroke="#F472B6" strokeWidth="2" /></svg>
              <span className="text-xs text-gray-600">Tall Hexagon</span>
            </button>
            <button onClick={() => { addShapeElement('diamond'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="32" height="20" viewBox="0 0 32 20"><polygon points="16,2 30,10 16,18 2,10" fill="none" stroke="#0EA5E9" strokeWidth="2" /></svg>
              <span className="text-xs text-gray-600">Wide Diamond</span>
            </button>
            <button onClick={() => { addShapeElement('rectangle'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="24" height="32" viewBox="0 0 24 32"><rect x="2" y="2" width="20" height="28" fill="none" stroke="#DC2626" strokeWidth="2" /></svg>
              <span className="text-xs text-gray-600">Tall Rect</span>
            </button>
            <button onClick={() => { addShapeElement('circle'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="28" height="18" viewBox="0 0 28 18"><ellipse cx="14" cy="9" rx="12" ry="7" fill="none" stroke="#0D9488" strokeWidth="2" /></svg>
              <span className="text-xs text-gray-600">Flat Oval</span>
            </button>
            <button onClick={() => { addShapeElement('arrow'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="32" height="20" viewBox="0 0 32 20"><polygon points="1,10 12,2 12,7 20,7 20,2 31,10 20,18 20,13 12,13 12,18" fill="none" stroke="#374151" strokeWidth="2" /></svg>
              <span className="text-xs text-gray-600">Double Arrow</span>
            </button>
            <button onClick={() => { addShapeElement('hexagon'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="28" height="28" viewBox="0 0 28 28"><polygon points="5,5 23,5 23,23 5,23" fill="none" stroke="#7C3AED" strokeWidth="2" transform="rotate(45 14 14)" /></svg>
              <span className="text-xs text-gray-600">Rotated Square</span>
            </button>
          </div>
        </div>
      )}

      {/* Icon Options Dropdown - 100+ Icons */}
      {showIconOptions && (
        <div className="dropdown-options absolute top-24 left-1/2 transform -translate-x-1/2 bg-white border border-gray-200 rounded-xl shadow-lg p-4 z-30 max-w-3xl max-h-[500px] overflow-y-auto">
          <p className="text-sm font-semibold text-gray-900 mb-3">Add Icon (100+ Options)</p>
          <div className="grid grid-cols-10 gap-2">
            {/* Basic Icons */}
            <button onClick={() => { addIconElement('star'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Star">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#FFD700" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
            </button>
            <button onClick={() => { addIconElement('heart'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Heart">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#e53e3e" stroke="none"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
            </button>
            <button onClick={() => { addIconElement('check'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Check">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
            </button>
            <button onClick={() => { addIconElement('x'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="X">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
            <button onClick={() => { addIconElement('arrowRight'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Arrow Right">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
            </button>
            <button onClick={() => { addIconElement('arrowUp'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Arrow Up">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></svg>
            </button>
            <button onClick={() => { addIconElement('arrowDown'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Arrow Down">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" /></svg>
            </button>
            <button onClick={() => { addIconElement('arrowLeft'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Arrow Left">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
            </button>
            <button onClick={() => { addIconElement('lightning'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Lightning">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#f59e0b" stroke="none"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
            </button>
            <button onClick={() => { addIconElement('sun'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Sun">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#fbbf24" stroke="#fbbf24" strokeWidth="1"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /></svg>
            </button>
            <button onClick={() => { addIconElement('moon'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Moon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#6366f1" stroke="none"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
            </button>
            <button onClick={() => { addIconElement('cloud'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Cloud">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#60a5fa" stroke="none"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" /></svg>
            </button>
            <button onClick={() => { addIconElement('thumbsUp'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Thumbs Up">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#22c55e" stroke="none"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" /></svg>
            </button>
            <button onClick={() => { addIconElement('thumbsDown'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Thumbs Down">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#ef4444" stroke="none"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" /></svg>
            </button>
            <button onClick={() => { addIconElement('flag'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Flag">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#ef4444" stroke="#ef4444" strokeWidth="1"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" /></svg>
            </button>
            <button onClick={() => { addIconElement('bell'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Bell">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#f59e0b" stroke="#f59e0b" strokeWidth="1"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
            </button>
            <button onClick={() => { addIconElement('bookmark'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Bookmark">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#3b82f6" stroke="none"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>
            </button>
            <button onClick={() => { addIconElement('lock'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Lock">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
            </button>
            <button onClick={() => { addIconElement('unlock'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Unlock">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 9.9-1" /></svg>
            </button>
            <button onClick={() => { addIconElement('trophy'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Trophy">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#f59e0b" stroke="#f59e0b" strokeWidth="1"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22h10c0-2-1-3.25-2.03-3.79-.5-.23-.97-.66-.97-1.21v-2.34" /><path d="M8 2c0 4 4 6 4 6s4-2 4-6H8Z" /></svg>
            </button>
            {/* More icons */}
            <button onClick={() => { addIconElement('gift'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Gift">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ec4899" strokeWidth="2"><polyline points="20 12 20 22 4 22 4 12" /><rect x="2" y="7" width="20" height="5" /><line x1="12" y1="22" x2="12" y2="7" /><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" /><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" /></svg>
            </button>
            <button onClick={() => { addIconElement('home'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Home">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
            </button>
            <button onClick={() => { addIconElement('user'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="User">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
            </button>
            <button onClick={() => { addIconElement('users'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Users">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
            </button>
            <button onClick={() => { addIconElement('settings'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Settings">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
            </button>
            <button onClick={() => { addIconElement('search'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Search">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
            </button>
            <button onClick={() => { addIconElement('mail'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Mail">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>
            </button>
            <button onClick={() => { addIconElement('phone'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Phone">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
            </button>
            <button onClick={() => { addIconElement('calendar'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Calendar">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
            </button>
            <button onClick={() => { addIconElement('clock'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Clock">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
            </button>
            <button onClick={() => { addIconElement('camera'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Camera">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
            </button>
            <button onClick={() => { addIconElement('image'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Image">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
            </button>
            <button onClick={() => { addIconElement('video'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Video">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></svg>
            </button>
            <button onClick={() => { addIconElement('music'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Music">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
            </button>
            <button onClick={() => { addIconElement('headphones'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Headphones">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><path d="M3 18v-6a9 9 0 0 1 18 0v6" /><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" /></svg>
            </button>
            <button onClick={() => { addIconElement('mic'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Microphone">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>
            </button>
            <button onClick={() => { addIconElement('wifi'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="WiFi">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2"><path d="M5 12.55a11 11 0 0 1 14.08 0" /><path d="M1.42 9a16 16 0 0 1 21.16 0" /><path d="M8.53 16.11a6 6 0 0 1 6.95 0" /><line x1="12" y1="20" x2="12.01" y2="20" /></svg>
            </button>
            <button onClick={() => { addIconElement('battery'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Battery">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2"><rect x="1" y="6" width="18" height="12" rx="2" ry="2" /><line x1="23" y1="13" x2="23" y2="11" /></svg>
            </button>
            <button onClick={() => { addIconElement('bluetooth'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Bluetooth">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2"><polyline points="6.5 6.5 17.5 17.5 12 23 12 1 17.5 6.5 6.5 17.5" /></svg>
            </button>
            <button onClick={() => { addIconElement('download'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Download">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
            </button>
            <button onClick={() => { addIconElement('upload'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Upload">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
            </button>
            <button onClick={() => { addIconElement('share'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Share">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" /></svg>
            </button>
            <button onClick={() => { addIconElement('link'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Link">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
            </button>
            <button onClick={() => { addIconElement('pin'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Map Pin">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#ef4444" stroke="#ef4444" strokeWidth="1"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" fill="white" /></svg>
            </button>
            <button onClick={() => { addIconElement('globe'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Globe">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
            </button>
            <button onClick={() => { addIconElement('coffee'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Coffee">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#78350f" strokeWidth="2"><path d="M18 8h1a4 4 0 0 1 0 8h-1" /><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" /><line x1="6" y1="1" x2="6" y2="4" /><line x1="10" y1="1" x2="10" y2="4" /><line x1="14" y1="1" x2="14" y2="4" /></svg>
            </button>
            <button onClick={() => { addIconElement('briefcase'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Briefcase">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>
            </button>
            <button onClick={() => { addIconElement('folder'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Folder">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#fbbf24" stroke="#fbbf24" strokeWidth="1"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
            </button>
            <button onClick={() => { addIconElement('file'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="File">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
            </button>
            <button onClick={() => { addIconElement('clipboard'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Clipboard">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><rect x="8" y="2" width="8" height="4" rx="1" ry="1" /></svg>
            </button>
            <button onClick={() => { addIconElement('edit'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Edit">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
            </button>
            <button onClick={() => { addIconElement('trash'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Trash">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
            </button>
            <button onClick={() => { addIconElement('plus'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Plus">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            </button>
            <button onClick={() => { addIconElement('minus'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Minus">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12" /></svg>
            </button>
            <button onClick={() => { addIconElement('refresh'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Refresh">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
            </button>
            <button onClick={() => { addIconElement('power'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Power">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><path d="M18.36 6.64a9 9 0 1 1-12.73 0" /><line x1="12" y1="2" x2="12" y2="12" /></svg>
            </button>
            <button onClick={() => { addIconElement('zap'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Zap">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#f59e0b" stroke="none"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
            </button>
            <button onClick={() => { addIconElement('target'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Target">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></svg>
            </button>
            <button onClick={() => { addIconElement('award'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Award">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2"><circle cx="12" cy="8" r="7" /><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" /></svg>
            </button>
            <button onClick={() => { addIconElement('shield'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Shield">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
            </button>
            <button onClick={() => { addIconElement('eye'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Eye">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
            </button>
            <button onClick={() => { addIconElement('eyeOff'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Eye Off">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
            </button>
            <button onClick={() => { addIconElement('smile'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Smile">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#fbbf24" stroke="#fbbf24" strokeWidth="1"><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" stroke="#000" strokeWidth="2" fill="none" /><line x1="9" y1="9" x2="9.01" y2="9" stroke="#000" strokeWidth="3" /><line x1="15" y1="9" x2="15.01" y2="9" stroke="#000" strokeWidth="3" /></svg>
            </button>
            <button onClick={() => { addIconElement('frown'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Frown">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#60a5fa" stroke="#60a5fa" strokeWidth="1"><circle cx="12" cy="12" r="10" /><path d="M16 16s-1.5-2-4-2-4 2-4 2" stroke="#000" strokeWidth="2" fill="none" /><line x1="9" y1="9" x2="9.01" y2="9" stroke="#000" strokeWidth="3" /><line x1="15" y1="9" x2="15.01" y2="9" stroke="#000" strokeWidth="3" /></svg>
            </button>
            <button onClick={() => { addIconElement('meh'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Meh">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#fbbf24" stroke="#fbbf24" strokeWidth="1"><circle cx="12" cy="12" r="10" /><line x1="8" y1="15" x2="16" y2="15" stroke="#000" strokeWidth="2" /><line x1="9" y1="9" x2="9.01" y2="9" stroke="#000" strokeWidth="3" /><line x1="15" y1="9" x2="15.01" y2="9" stroke="#000" strokeWidth="3" /></svg>
            </button>
            <button onClick={() => { addIconElement('fire'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Fire">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#f97316" stroke="#f97316" strokeWidth="1"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" /></svg>
            </button>
            <button onClick={() => { addIconElement('droplet'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Droplet">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#3b82f6" stroke="#3b82f6" strokeWidth="1"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" /></svg>
            </button>
            <button onClick={() => { addIconElement('leaf'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Leaf">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#22c55e" stroke="#22c55e" strokeWidth="1"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" /><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" fill="none" stroke="#166534" strokeWidth="2" /></svg>
            </button>
            <button onClick={() => { addIconElement('flower'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Flower">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#ec4899" stroke="#ec4899" strokeWidth="1"><path d="M12 7.5a4.5 4.5 0 1 1 4.5 4.5M12 7.5A4.5 4.5 0 1 0 7.5 12M12 7.5V9m-4.5 3a4.5 4.5 0 1 0 4.5 4.5M7.5 12H9m7.5 0a4.5 4.5 0 1 1-4.5 4.5m4.5-4.5H15m-3 4.5V15" /><circle cx="12" cy="12" r="3" fill="#fbbf24" /></svg>
            </button>
            <button onClick={() => { addIconElement('tree'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Tree">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2"><path d="M10 21h4m-2-8v8m6-5-6-8-6 8h12zm-2-5-4-5-4 5h8z" /></svg>
            </button>
            <button onClick={() => { addIconElement('mountain'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Mountain">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><path d="m8 3 4 8 5-5 5 15H2L8 3z" /></svg>
            </button>
            <button onClick={() => { addIconElement('plane'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Plane">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2"><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" /></svg>
            </button>
            <button onClick={() => { addIconElement('car'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Car">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><path d="M14 16H9m10 0h3v-3.15a1 1 0 0 0-.84-.99L16 11l-2.7-3.6a1 1 0 0 0-.8-.4H5.24a2 2 0 0 0-1.8 1.1l-.8 1.63A6 6 0 0 0 2 12.42V16h2" /><circle cx="6.5" cy="16.5" r="2.5" /><circle cx="16.5" cy="16.5" r="2.5" /></svg>
            </button>
            <button onClick={() => { addIconElement('bike'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Bike">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><circle cx="18.5" cy="17.5" r="3.5" /><circle cx="5.5" cy="17.5" r="3.5" /><circle cx="15" cy="5" r="1" /><path d="M12 17.5V14l-3-3 4-3 2 3h2" /></svg>
            </button>
            <button onClick={() => { addIconElement('rocket'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Rocket">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" /><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" /><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" /><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" /></svg>
            </button>
            <button onClick={() => { addIconElement('anchor'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Anchor">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><circle cx="12" cy="5" r="3" /><line x1="12" y1="22" x2="12" y2="8" /><path d="M5 12H2a10 10 0 0 0 20 0h-3" /></svg>
            </button>
            <button onClick={() => { addIconElement('compass'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Compass">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" fill="#ef4444" /></svg>
            </button>
            <button onClick={() => { addIconElement('umbrella'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Umbrella">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ec4899" strokeWidth="2"><path d="M23 12a11.05 11.05 0 0 0-22 0zm-5 7a3 3 0 0 1-6 0v-7" /></svg>
            </button>
            <button onClick={() => { addIconElement('lightbulb'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Lightbulb">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#fbbf24" stroke="#fbbf24" strokeWidth="1"><path d="M9 18h6M10 22h4M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" /></svg>
            </button>
            <button onClick={() => { addIconElement('key'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Key">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2"><path d="m21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4" /></svg>
            </button>
            <button onClick={() => { addIconElement('crown'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Crown">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#fbbf24" stroke="#fbbf24" strokeWidth="1"><path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14" /></svg>
            </button>
            <button onClick={() => { addIconElement('gem'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Gem">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2"><polygon points="6 3 18 3 22 9 12 22 2 9" /><path d="M12 22 6 9l6 13 6-13" /><line x1="2" y1="9" x2="22" y2="9" /></svg>
            </button>
            <button onClick={() => { addIconElement('dollar'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Dollar">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
            </button>
            <button onClick={() => { addIconElement('percent'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Percent">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><line x1="19" y1="5" x2="5" y2="19" /><circle cx="6.5" cy="6.5" r="2.5" /><circle cx="17.5" cy="17.5" r="2.5" /></svg>
            </button>
            <button onClick={() => { addIconElement('hash'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Hash">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><line x1="4" y1="9" x2="20" y2="9" /><line x1="4" y1="15" x2="20" y2="15" /><line x1="10" y1="3" x2="8" y2="21" /><line x1="16" y1="3" x2="14" y2="21" /></svg>
            </button>
            <button onClick={() => { addIconElement('at'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="At">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><circle cx="12" cy="12" r="4" /><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94" /></svg>
            </button>
            <button onClick={() => { addIconElement('infinity'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Infinity">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><path d="M18.178 8c5.096 0 5.096 8 0 8-5.095 0-7.133-8-12.739-8-4.585 0-4.585 8 0 8 5.606 0 7.644-8 12.74-8z" /></svg>
            </button>
            <button onClick={() => { addIconElement('info'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Info">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#3b82f6" stroke="white" strokeWidth="2"><circle cx="12" cy="12" r="10" fill="#3b82f6" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
            </button>
            <button onClick={() => { addIconElement('alertCircle'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Alert">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#ef4444" stroke="white" strokeWidth="2"><circle cx="12" cy="12" r="10" fill="#ef4444" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
            </button>
            <button onClick={() => { addIconElement('helpCircle'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Help">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#6366f1" stroke="white" strokeWidth="2"><circle cx="12" cy="12" r="10" fill="#6366f1" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
            </button>
            <button onClick={() => { addIconElement('checkCircle'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Check Circle">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#22c55e" stroke="white" strokeWidth="2"><circle cx="12" cy="12" r="10" fill="#22c55e" /><polyline points="9 12 11 14 15 10" /></svg>
            </button>
            <button onClick={() => { addIconElement('xCircle'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="X Circle">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#ef4444" stroke="white" strokeWidth="2"><circle cx="12" cy="12" r="10" fill="#ef4444" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
            </button>
            <button onClick={() => { addIconElement('minusCircle'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Minus Circle">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#f59e0b" stroke="white" strokeWidth="2"><circle cx="12" cy="12" r="10" fill="#f59e0b" /><line x1="8" y1="12" x2="16" y2="12" /></svg>
            </button>
            <button onClick={() => { addIconElement('plusCircle'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Plus Circle">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#22c55e" stroke="white" strokeWidth="2"><circle cx="12" cy="12" r="10" fill="#22c55e" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" /></svg>
            </button>
          </div>
        </div>
      )}

      {/* Table Options Dropdown - Grid Picker */}
      {showTableOptions && (
        <div className="dropdown-options absolute top-24 left-1/2 transform -translate-x-1/2 bg-white border border-gray-200 rounded-xl shadow-lg p-4 z-30 w-64">
          <p className="text-sm font-semibold text-gray-900 mb-3">Insert Table</p>

          {/* Grid Preview */}
          <div className="mb-4">
            <p className="text-xs text-gray-500 mb-2">
              {tableGridHover.rows > 0 && tableGridHover.cols > 0
                ? `${tableGridHover.rows} × ${tableGridHover.cols} Table`
                : 'Hover to select size'}
            </p>
            <div className="grid grid-cols-5 gap-1">
              {Array.from({ length: 5 }, (_, row) =>
                Array.from({ length: 5 }, (_, col) => (
                  <button
                    key={`${row}-${col}`}
                    onMouseEnter={() => setTableGridHover({ rows: row + 1, cols: col + 1 })}
                    onMouseLeave={() => setTableGridHover({ rows: 0, cols: 0 })}
                    onClick={() => {
                      addTableElement(row + 1, col + 1)
                      setShowTableOptions(false)
                      setTableGridHover({ rows: 0, cols: 0 })
                    }}
                    className={`w-8 h-8 border rounded transition-all ${row < tableGridHover.rows && col < tableGridHover.cols
                      ? 'bg-primary/30 border-primary'
                      : 'bg-gray-100 border-gray-200 hover:bg-gray-200'
                      }`}
                  />
                ))
              ).flat()}
            </div>
          </div>

          {/* Preset Sizes */}
          <div className="border-t border-gray-100 pt-3">
            <p className="text-xs text-gray-500 mb-2">Quick Presets</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { rows: 2, cols: 2, label: '2×2' },
                { rows: 2, cols: 3, label: '2×3' },
                { rows: 3, cols: 2, label: '3×2' },
                { rows: 3, cols: 3, label: '3×3' },
                { rows: 3, cols: 4, label: '3×4' },
                { rows: 4, cols: 3, label: '4×3' },
                { rows: 4, cols: 4, label: '4×4' },
                { rows: 4, cols: 5, label: '4×5' },
                { rows: 5, cols: 4, label: '5×4' },
              ].map(({ rows, cols, label }) => (
                <button
                  key={label}
                  onClick={() => {
                    addTableElement(rows, cols)
                    setShowTableOptions(false)
                  }}
                  className="px-3 py-2 text-xs font-medium bg-gray-50 hover:bg-gray-100 rounded-lg transition-all border border-gray-200"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden relative z-0">
        {/* Left Panel - Frames */}
        <FramesPanel
          frames={frames}
          activeFrame={activeFrameId}
          setActiveFrame={handleFrameFocus}
          addNewFrame={addFrame}
          deleteFrame={deleteFrame}
          duplicateFrame={duplicateFrame}
          reorderFrames={reorderFrames}
          projectTitle={projectTitle}
          templateGradient={templateGradient}
          templateThumbnailUrl={templateThumbnailUrl}
        />

        {/* Canvas Area - keep slide fully visible, centered horizontally, toolbar separated below */}
        <div
          ref={canvasRef}
          className={`flex-1 flex flex-col canvas-area relative ${isDragOver ? 'bg-primary/10' : ''} ${isPanning ? (isDraggingPan ? 'cursor-grabbing' : 'cursor-grab') : ''}`}
          style={{
            backgroundColor: '#f5f5f2',
            backgroundImage: editorBgImage ? `linear-gradient(rgba(255, 255, 255, 0.4), rgba(255, 255, 255, 0.4)), url(${editorBgImage})` : 'radial-gradient(circle, #c8c8c4 1px, transparent 1px)',
            backgroundSize: editorBgImage ? 'cover' : '28px 28px',
            backgroundPosition: 'center',
              backgroundAttachment: 'fixed',
            minHeight: 0,
            overflow: 'hidden',
            transition: 'all 0.2s ease',
          }}
          onClick={handleCanvasClick}
          onContextMenu={handleContextMenu}
          onMouseDown={handlePanStart}
          onWheel={handleWheel}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* Drag-drop indicator */}
          {isDragOver && (
            <div className="absolute inset-0 flex items-center justify-center bg-primary/10 border-2 border-dashed border-primary z-50 pointer-events-none">
              <div className="text-center">
                <svg className="w-16 h-16 mx-auto text-primary mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p className="text-lg font-medium text-primary">Drop images, videos, or audio files here</p>
              </div>
            </div>
          )}
          {/* Infinite canvas viewport */}
          <div className="flex-1 min-h-0 relative overflow-hidden">
            <div
              className="absolute left-0 top-0"
              style={{
                width: `${worldBounds.width}px`,
                height: `${worldBounds.height}px`,
                transform: `scale(${camera.zoom}) translate(${camera.panX}px, ${camera.panY}px)`,
                transformOrigin: 'center center',
                transition: isNavigating ? 'none' : 'transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
                willChange: 'transform',
              }}
            >
              {frameMapLayout.map((frameBox, frameIdx) => {
                const selected = frameBox.id === activeFrameId
                const frameData = frames.find(f => f.id === frameBox.id)
                const frameElements = selected ? elements : (frameData?.elements || [])
                const isOverviewFrame = frameData?.preview === 'Overview'
                return (
                  <div
                    key={frameBox.id}
                    onClick={() => handleFrameFocus(frameBox.id, 'frame')} onMouseDown={(e) => handleFrameDragStart(e, frameBox)}
                    className="absolute cursor-pointer"
                    style={{
                      left: frameBox.x,
                      top: frameBox.y,
                      width: frameBox.width,
                      height: frameBox.height,
                      border: isOverviewFrame
                        ? 'none'
                        : (selected ? '2px solid #1a73e8' : '1px solid #e5e7eb'),
                      borderRadius: isOverviewFrame ? '20px' : '16px',
                      background: isOverviewFrame ? 'transparent' : (frameData?.backgroundImage ? `url("${frameData.backgroundImage}") center/cover no-repeat` : (frameData?.backgroundColor || '#ffffff')),
                      boxShadow: isOverviewFrame
                        ? 'none'
                        : (selected ? '0 14px 40px rgba(15, 23, 42, 0.18)' : '0 8px 24px rgba(15, 23, 42, 0.12)'),
                      overflow: 'hidden',
                      transition: 'all 0.2s ease',
                    }}
                    title={`Frame ${frameIdx + 1}`}
                  >
                    <div style={{
                      width: SLIDE_WIDTH,
                      height: SLIDE_HEIGHT,
                      transform: `scale(${frameBox.width / SLIDE_WIDTH})`,
                      transformOrigin: 'top left',
                      pointerEvents: selected ? 'auto' : 'none'
                    }}>
                      {/* Canvas Elements */}
                      {frameElements.map((element) => (
                        <div
                          key={`${element.id}-${selected ? animationKey : 'static'}`}
                          onClick={(e) => handleElementClick(element, e)}
                          onDoubleClick={(e) => handleElementDoubleClick(element, e)}
                          onMouseDown={(e) => {
                            if (!isResizing && editingTextId !== element.id && !element.isPlaceholder) {
                              handleDragStart(e, element)
                            }
                          }}
                          className={`absolute transition-shadow duration-150 ${isDragging && selectedElementId === element.id ? 'is-dragging opacity-90 shadow-lg' : ''
                            } ${editingTextId === element.id ? 'cursor-text is-editing' : (element.isPlaceholder ? 'cursor-text' : 'cursor-move')
                            } ${selectedElementId === element.id
                              ? 'ring-2 ring-[#0078d7] ring-offset-1 z-50'
                              : 'hover:ring-2 hover:ring-[#0078d7]/30'
                            } ${getAnimationClass(element)}`}
                          style={{
                            left: element.x,
                            top: element.y,
                            width: element.width,
                            height: element.height,
                            ...getAnimationStyle(element),
                          }}
                        >
                          {renderElement(element)}

                          {/* Resize Handles - PowerPoint Style */}
                          {selectedElementId === element.id && !editingTextId && (
                            <>
                              <div className="resize-handle corner-nw absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-[#0078d7] rounded-full cursor-nw-resize hover:bg-[#0078d7] hover:scale-125 transition-all" onMouseDown={(e) => handleResizeStart(e, 'nw', element)} />
                              <div className="resize-handle corner-ne absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-[#0078d7] rounded-full cursor-ne-resize hover:bg-[#0078d7] hover:scale-125 transition-all" onMouseDown={(e) => handleResizeStart(e, 'ne', element)} />
                              <div className="resize-handle corner-sw absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-[#0078d7] rounded-full cursor-sw-resize hover:bg-[#0078d7] hover:scale-125 transition-all" onMouseDown={(e) => handleResizeStart(e, 'sw', element)} />
                              <div className="resize-handle corner-se absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-[#0078d7] rounded-full cursor-se-resize hover:bg-[#0078d7] hover:scale-125 transition-all" onMouseDown={(e) => handleResizeStart(e, 'se', element)} />
                              <div className="resize-handle edge-n absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-white border-2 border-[#0078d7] rounded-full cursor-n-resize hover:bg-[#0078d7] hover:scale-125 transition-all" onMouseDown={(e) => handleResizeStart(e, 'n', element)} />
                              <div className="resize-handle edge-s absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-white border-2 border-[#0078d7] rounded-full cursor-s-resize hover:bg-[#0078d7] hover:scale-125 transition-all" onMouseDown={(e) => handleResizeStart(e, 's', element)} />
                              <div className="resize-handle edge-w absolute top-1/2 -left-1 -translate-y-1/2 w-2 h-2 bg-white border-2 border-[#0078d7] rounded-full cursor-w-resize hover:bg-[#0078d7] hover:scale-125 transition-all" onMouseDown={(e) => handleResizeStart(e, 'w', element)} />
                              <div className="resize-handle edge-e absolute top-1/2 -right-1 -translate-y-1/2 w-2 h-2 bg-white border-2 border-[#0078d7] rounded-full cursor-e-resize hover:bg-[#0078d7] hover:scale-125 transition-all" onMouseDown={(e) => handleResizeStart(e, 'e', element)} />

                              <div className="absolute -top-10 right-0 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" style={{ opacity: 1 }}>
                                <button onClick={(e) => { e.stopPropagation(); copyElement(element.id); toast.info('Copied to clipboard'); }} className="p-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded transition-all" title="Copy (Ctrl+C)">
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><rect x="8" y="2" width="8" height="4" rx="1" ry="1" /></svg>
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); duplicateElement(element.id); toast.success('Duplicated'); }} className="p-1.5 bg-primary hover:bg-primary-dark text-white rounded transition-all" title="Duplicate (creates copy here)">
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /><path d="M14 11v6M11 14h6" /></svg>
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); deleteElement(element.id); }} className="p-1.5 bg-red-500 hover:bg-red-600 text-white rounded transition-all" title="Delete (Del)">
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}

              {/* Text edit hint - PowerPoint style */}
              {selectedElement?.type === 'text' && !editingTextId && (
                <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-gray-900/90 text-white text-xs px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 backdrop-blur-sm">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  <span>{selectedElement.isPlaceholder ? 'Click to start typing' : 'Double-click to edit'}</span>
                  <span className="kbd">Enter</span>
                </div>
              )}
            </div>
          </div>

          {/* Description / context hint — shown when slide has no elements selected */}
          {!selectedElementId && !editingTextId && elements.length === 0 && (
            <div className="flex items-center justify-center py-3 flex-shrink-0">
              <div className="text-center">
                <p className="text-sm font-medium text-gray-500">Use the toolbar above to add text, shapes, or images to your slide.</p>
                <p className="text-xs text-gray-400 mt-0.5">Click on the slide to start editing · Double-click a text block to type</p>
              </div>
            </div>
          )}

          {/* Bottom Floating Navigation */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20">
            <div className="h-10 px-3 rounded-xl bg-white border border-gray-200 shadow-md flex items-center gap-3 text-gray-700">
              <button
                onClick={() => {
                  setSelectedElementId(null)
                  setIsPanning(prev => !prev)
                }}
                className="text-base hover:text-gray-900 transition-all"
                title="Hand tool"
              >
                ✋
              </button>

              <button className="text-sm font-semibold hover:text-gray-900 transition-all" title="Current frame">
                {Math.max(1, frames.findIndex(f => f.id === activeFrameId) + 1)}
              </button>

              <button
                onClick={() => {
                  const currentIndex = frames.findIndex(f => f.id === activeFrameId)
                  if (currentIndex > 0) handleFrameFocus(frames[currentIndex - 1].id, 'frame')
                }}
                className="text-lg hover:text-gray-900 transition-all"
                title="Back"
              >
                ←
              </button>

              <button
                onClick={() => {
                  const currentIndex = frames.findIndex(f => f.id === activeFrameId)
                  if (currentIndex < frames.length - 1) handleFrameFocus(frames[currentIndex + 1].id, 'frame')
                }}
                className="text-lg hover:text-gray-900 transition-all"
                title="Forward"
              >
                →
              </button>

              <button
                onClick={() => frames[0] && handleFrameFocus(frames[0].id, 'overview')}
                className="text-sm hover:text-gray-900 transition-all"
                title="Overview"
              >
                🏠
              </button>

              <button
                onClick={() => {
                  const next = Math.max(0.25, camera.zoom - 0.1)
                  setCamera(prev => ({ ...prev, zoom: next }))
                  setZoom(Math.round(next * 100))
                }}
                className="text-lg hover:text-gray-900 transition-all"
                title="Zoom out"
              >
                −
              </button>

              <button
                onClick={focusOverview}
                className="text-sm font-semibold hover:text-gray-900 transition-all"
                title="Reset zoom"
              >
                98%
              </button>

              <button
                onClick={() => {
                  const next = Math.min(2.2, camera.zoom + 0.1)
                  setCamera(prev => ({ ...prev, zoom: next }))
                  setZoom(Math.round(next * 100))
                }}
                className="text-lg hover:text-gray-900 transition-all"
                title="Zoom in"
              >
                +
              </button>
            </div>
          </div>
        </div>

        {/* Right Panel - Properties/Notes */}
        <div className="w-56 lg:w-60 xl:w-64 bg-white border-l border-gray-200 flex flex-col overflow-hidden">
          {/* Tab Header */}
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setRightPanelTab('properties')}
              className={`flex-1 px-2 py-2 text-xs font-medium transition-all ${rightPanelTab === 'properties' ? 'text-primary border-b-2 border-primary' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Properties
            </button>
            <button
              onClick={() => setRightPanelTab('design')}
              className={`flex-1 px-2 py-2 text-xs font-medium transition-all ${rightPanelTab === 'design' ? 'text-primary border-b-2 border-primary' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Design
            </button>
            <button
              onClick={() => setRightPanelTab('notes')}
              className={`flex-1 px-2 py-2 text-xs font-medium transition-all ${rightPanelTab === 'notes' ? 'text-primary border-b-2 border-primary' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Notes
            </button>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {/* Properties Tab */}
            {rightPanelTab === 'properties' && selectedElement && (
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-gray-500 uppercase tracking-wider">Type</label>
                  <p className="text-sm text-gray-900 capitalize">{selectedElement.type}</p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-500">X</label>
                    <input
                      type="number"
                      value={Math.round(selectedElement.x)}
                      onChange={(e) => updateElement(selectedElementId, { x: parseInt(e.target.value) || 0 })}
                      className="w-full px-2 py-1 text-sm border border-gray-200 rounded"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Y</label>
                    <input
                      type="number"
                      value={Math.round(selectedElement.y)}
                      onChange={(e) => updateElement(selectedElementId, { y: parseInt(e.target.value) || 0 })}
                      className="w-full px-2 py-1 text-sm border border-gray-200 rounded"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-500">Width</label>
                    <input
                      type="number"
                      value={Math.round(selectedElement.width)}
                      onChange={(e) => updateElement(selectedElementId, { width: Math.max(50, parseInt(e.target.value) || 50) })}
                      className="w-full px-2 py-1 text-sm border border-gray-200 rounded"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Height</label>
                    <input
                      type="number"
                      value={Math.round(selectedElement.height)}
                      onChange={(e) => updateElement(selectedElementId, { height: Math.max(30, parseInt(e.target.value) || 30) })}
                      className="w-full px-2 py-1 text-sm border border-gray-200 rounded"
                    />
                  </div>
                </div>

                {/* Shape Properties - Full controls */}
                {selectedElement.type === 'shape' && (
                  <>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Fill Color</label>
                      <input
                        type="color"
                        value={selectedElement.fill || '#2E7D32'}
                        onChange={(e) => updateElement(selectedElementId, { fill: e.target.value })}
                        className="w-full h-8 cursor-pointer rounded border border-gray-200"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Opacity ({selectedElement.opacity || 100}%)</label>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={selectedElement.opacity || 100}
                        onChange={(e) => updateElement(selectedElementId, { opacity: parseInt(e.target.value) })}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Rotation ({selectedElement.rotation || 0}°)</label>
                      <input
                        type="range"
                        min="0"
                        max="360"
                        value={selectedElement.rotation || 0}
                        onChange={(e) => updateElement(selectedElementId, { rotation: parseInt(e.target.value) })}
                        className="w-full"
                      />
                    </div>
                  </>
                )}

                {/* Icon Properties - Simplified */}
                {selectedElement.type === 'icon' && (
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Icon Color</label>
                    <input
                      type="color"
                      value={selectedElement.color || '#333333'}
                      onChange={(e) => updateElement(selectedElementId, { color: e.target.value })}
                      className="w-full h-8 cursor-pointer rounded border border-gray-200"
                    />
                  </div>
                )}

                {/* Animation Controls */}
                <div className="pt-3 border-t border-gray-100">
                  <label className="text-xs text-gray-500 block mb-2">Animation</label>
                  <select
                    value={selectedElement.animation || 'none'}
                    onChange={(e) => updateElementAnimation(selectedElementId, e.target.value)}
                    className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded mb-2"
                  >
                    {Object.entries(ANIMATION_PRESETS).map(([key, preset]) => (
                      <option key={key} value={key}>{preset.name}</option>
                    ))}
                  </select>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-gray-400">Speed (ms)</label>
                      <input
                        type="number"
                        min="100"
                        max="2000"
                        step="50"
                        value={selectedElement.animationSpeed || 300}
                        onChange={(e) => updateElement(selectedElementId, { animationSpeed: parseInt(e.target.value) || 300 })}
                        className="w-full px-2 py-1 text-sm border border-gray-200 rounded"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400">Delay (ms)</label>
                      <input
                        type="number"
                        min="0"
                        step="100"
                        value={selectedElement.animationDelay || 0}
                        onChange={(e) => updateElement(selectedElementId, { animationDelay: parseInt(e.target.value) || 0 })}
                        className="w-full px-2 py-1 text-sm border border-gray-200 rounded"
                      />
                    </div>
                  </div>
                  <button
                    onClick={previewAnimations}
                    className="w-full mt-2 px-3 py-2 text-sm bg-primary/10 hover:bg-primary/20 text-primary rounded-lg transition-all flex items-center justify-center gap-2"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                    Preview All Animations
                  </button>
                </div>

                {/* Layer controls */}
                <div className="pt-3 border-t border-gray-100">
                  <label className="text-xs text-gray-500 block mb-2">Layer Order</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => bringToFront(selectedElementId)}
                      className="flex-1 px-2 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 rounded transition-all"
                    >
                      Bring to Front
                    </button>
                    <button
                      onClick={() => sendToBack(selectedElementId)}
                      className="flex-1 px-2 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 rounded transition-all"
                    >
                      Send to Back
                    </button>
                  </div>
                </div>

                <div className="pt-3 border-t border-gray-100">
                  <div className="flex gap-2">
                    <button
                      onClick={() => duplicateElement(selectedElementId)}
                      className="flex-1 px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-all"
                    >
                      Duplicate
                    </button>
                    <button
                      onClick={() => deleteElement(selectedElementId)}
                      className="flex-1 px-3 py-2 text-sm bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-all"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            )}

            {rightPanelTab === 'properties' && !selectedElement && (
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-gray-500 uppercase tracking-wider">Frame title</label>
                  <input
                    type="text"
                    value={activeFrame?.title || ''}
                    onChange={(e) => updateFrameTitle(activeFrameId, e.target.value)}
                    className="w-full mt-1 px-3 py-2 text-sm border border-gray-200 rounded-lg"
                    placeholder="Frame title"
                  />
                </div>

                <div>
                  <label className="text-xs text-gray-500 uppercase tracking-wider">Next frame preview</label>
                  <div className="mt-2 rounded-xl border border-gray-200 p-2 bg-gray-50">
                    <div className="aspect-[16/9] rounded-md border border-gray-200 bg-white flex items-center justify-center text-xs text-gray-500">
                      {(() => {
                        const currentIndex = frames.findIndex((f) => f.id === activeFrameId)
                        const next = currentIndex >= 0 ? frames[currentIndex + 1] : null
                        return next ? (next.title || `Frame ${currentIndex + 2}`) : 'No next frame'
                      })()}
                    </div>
                    <div className="text-center text-gray-400 text-xs mt-1">˅˅</div>
                  </div>
                </div>

                <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-2">
                  Frame size on canvas: {Math.round(activeFrameLayout.width)} × {Math.round(activeFrameLayout.height)}
                </div>
              </div>
            )}

            {/* Design Tab (Background Images) */}
            {rightPanelTab === 'design' && (
              <div className="space-y-3">
                <p className="text-xs text-gray-500 font-medium">Slide Background</p>

                {/* Remove background button */}
                <button
                  onClick={() => updateFrameBackgroundImage(activeFrameId, null)}
                  className={`w-full px-3 py-2 text-xs rounded-lg transition-all flex items-center gap-2 ${
                    !activeFrame?.backgroundImage
                      ? 'bg-primary/10 text-primary border border-primary/30'
                      : 'bg-gray-50 hover:bg-gray-100 text-gray-600 border border-gray-200'
                  }`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                  No Background
                </button>

                {/* Search filter */}
                <input
                  type="text"
                  value={bgSearchFilter}
                  onChange={(e) => setBgSearchFilter(e.target.value)}
                  placeholder="Search backgrounds..."
                  className="w-full px-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20"
                />

                {/* Background images grouped by topic */}
                {Object.entries(backgroundData)
                  .filter(([topic]) => !bgSearchFilter || topic.toLowerCase().includes(bgSearchFilter.toLowerCase()))
                  .map(([topic, images]) => (
                  <div key={topic}>
                    <p className="text-xs font-semibold text-gray-700 mb-1.5 mt-2">{topic}</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {images.map((imgPath, idx) => (
                        <button
                          key={imgPath}
                          onClick={() => updateFrameBackgroundImage(activeFrameId, imgPath)}
                          className={`relative aspect-[16/9] rounded-md overflow-hidden border-2 transition-all hover:scale-105 hover:shadow-md ${
                            activeFrame?.backgroundImage === imgPath
                              ? 'border-primary ring-2 ring-primary/30 shadow-md'
                              : 'border-gray-200 hover:border-gray-400'
                          }`}
                          title={`${topic} ${idx + 1}`}
                        >
                          <img
                            src={imgPath}
                            alt={`${topic} ${idx + 1}`}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                          {activeFrame?.backgroundImage === imgPath && (
                            <div className="absolute inset-0 bg-primary/10 flex items-center justify-center">
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Notes Tab (Speaker Notes) */}
            {rightPanelTab === 'notes' && (
              <div className="space-y-3">
                <p className="text-xs text-gray-500">Speaker notes for this slide (visible only to presenter)</p>
                <textarea
                  value={activeFrame?.notes || ''}
                  onChange={(e) => updateFrameNotes(activeFrameId, e.target.value)}
                  placeholder="Add speaker notes for this slide..."
                  className="w-full h-64 px-3 py-2 text-sm border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <div>
                  <label className="text-xs text-gray-500 block mb-2">Slide Transition</label>
                  <select
                    value={activeFrame?.transition || 'fade'}
                    onChange={(e) => updateFrameTransition(activeFrameId, e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg"
                  >
                    {Object.entries(SLIDE_TRANSITIONS).map(([key, name]) => (
                      <option key={key} value={key}>{name}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right Click Context Menu */}
      {contextMenu && (
        <RightClickMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onAction={handleContextMenuAction}
          hasSelection={!!selectedElementId}
          currentBackground={activeFrame?.backgroundColor || '#ffffff'}
          currentColor={selectedElement?.fill || selectedElement?.color || '#2E7D32'}
        />
      )}

      {/* Keyboard Shortcuts Modal */}
      <KeyboardShortcutsModal
        isOpen={showShortcutsModal}
        onClose={() => setShowShortcutsModal(false)}
        mode="editor"
      />

      {/* Video URL Modal */}
      {showVideoModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
            <h3 className="text-lg font-semibold mb-4">Add Video</h3>
            <p className="text-sm text-gray-600 mb-4">Enter a YouTube URL or paste a video link</p>
            <input
              type="url"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="https://youtube.com/watch?v=... or video URL"
              className="w-full px-4 py-3 border border-gray-200 rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-primary/20"
              autoFocus
            />
            <div className="flex gap-3">
              <button
                onClick={() => { setShowVideoModal(false); setVideoUrl(''); }}
                className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleVideoSubmit}
                disabled={!videoUrl.trim()}
                className="flex-1 px-4 py-2 bg-primary hover:bg-primary-dark text-white rounded-lg transition-all disabled:opacity-50"
              >
                Add Video
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-3 text-center">Or drag & drop a video file onto the canvas</p>
          </div>
        </div>
      )}

      {/* Version History Panel */}
      {showVersionHistory && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg shadow-xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Version History</h3>
              <button onClick={() => setShowVersionHistory(false)} className="p-1 hover:bg-gray-100 rounded">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <button
              onClick={() => { saveVersion(); toast.success('Version saved'); }}
              className="w-full px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-all mb-4"
            >
              Save Current Version
            </button>
            <div className="flex-1 overflow-y-auto space-y-2">
              {versionHistory.length === 0 ? (
                <p className="text-center text-gray-400 py-8">No versions saved yet</p>
              ) : (
                versionHistory.slice().reverse().map((version) => (
                  <div key={version.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium">{version.name}</p>
                      <p className="text-xs text-gray-500">{new Date(version.timestamp).toLocaleString()}</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { loadVersion(version.id); setShowVersionHistory(false); toast.success('Version restored'); }}
                        className="px-3 py-1 text-xs bg-primary text-white rounded hover:bg-primary-dark transition-all"
                      >
                        Restore
                      </button>
                      <button
                        onClick={() => deleteVersion(version.id)}
                        className="px-3 py-1 text-xs bg-red-100 text-red-600 rounded hover:bg-red-200 transition-all"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Upgrade Plan Modal */}
      {showUpgradeModal && (
        <UpgradePlanModal onClose={() => setShowUpgradeModal(false)} />
      )}

    </div>
  )
}

export default EditorPage


