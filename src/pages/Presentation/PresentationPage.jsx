import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useEditor } from '../../context/EditorContext'

const WORLD_PADDING = 220
const PREZI_LAYOUT_PRESETS = [
  { x: 820, y: 220, width: 1280, height: 720 },
  { x: 60, y: 120, width: 640, height: 360 },
  { x: 60, y: 580, width: 640, height: 360 },
  { x: 2260, y: 300, width: 640, height: 360 },
  { x: 2260, y: 790, width: 640, height: 360 },
]
const PREZI_FLOW_ORDER = [1, 2, 0, 3, 4]

const buildInterFrameConnectors = (layout) => {
  if (!Array.isArray(layout) || layout.length < 2) return []
  const order = (layout.length >= 5
    ? PREZI_FLOW_ORDER.filter((idx) => idx < layout.length)
    : layout.map((_, idx) => idx))

  const connectors = []
  for (let i = 0; i < order.length - 1; i += 1) {
    const from = layout[order[i]]
    const to = layout[order[i + 1]]
    if (!from || !to) continue

    const fromCx = from.x + (from.width / 2)
    const fromCy = from.y + (from.height / 2)
    const toCx = to.x + (to.width / 2)
    const toCy = to.y + (to.height / 2)

    const dx = toCx - fromCx
    const dy = toCy - fromCy
    const distance = Math.max(1, Math.hypot(dx, dy))
    const ux = dx / distance
    const uy = dy / distance

    const fromExtent = ((from.width / 2) * Math.abs(ux)) + ((from.height / 2) * Math.abs(uy))
    const toExtent = ((to.width / 2) * Math.abs(ux)) + ((to.height / 2) * Math.abs(uy))
    const margin = 34

    const startX = fromCx + (ux * (fromExtent + margin))
    const startY = fromCy + (uy * (fromExtent + margin))
    const endX = toCx - (ux * (toExtent + margin))
    const endY = toCy - (uy * (toExtent + margin))

    const arrowX = (startX + endX) / 2
    const arrowY = (startY + endY) / 2

    const horizontal = Math.abs(dx) >= Math.abs(dy)
    const symbol = horizontal
      ? (dx >= 0 ? '»»' : '««')
      : (dy >= 0 ? '⌄⌄' : '⌃⌃')

    connectors.push({
      id: `${from.id}-${to.id}`,
      x: arrowX,
      y: arrowY,
      symbol,
      horizontal,
    })
  }

  return connectors
}

const PresentationPage = () => {
  const navigate = useNavigate()
    const { frames, editorBackground } = useEditor()
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0)
  const [hasStarted, setHasStarted] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const containerRef = useRef(null)
  const controlsTimeoutRef = useRef(null)

  const [camera, setCamera] = useState({ zoom: 1, panX: 0, panY: 0 })

  const getAnimationClass = (animation) => {
    switch (animation) {
      case 'fade': return 'anim-fadeIn'
      case 'slide-up': return 'anim-slideInUp'
      case 'slide-right': return 'anim-slideInRight'
      case 'zoom': return 'anim-zoomIn'
      case 'bounce': return 'anim-bounceIn'
      default: return ''
    }
  }

  const renderElement = (element, slideKey, elementIndex = 0) => {
    const animClass = getAnimationClass(element.animation)
    const animStyle = element.animation && element.animation !== 'none' ? {
      '--anim-duration': `${Math.round((element.animationSpeed || 500) * 1.35)}ms`,
      '--anim-delay': `${(element.animationDelay || 0) + (elementIndex * 140)}ms`,
    } : {}

    const baseStyle = {
      position: 'absolute',
      left: element.x,
      top: element.y,
      width: element.width,
      height: element.height,
      ...animStyle,
    }

    switch (element.type) {
      case 'text':
        return (
          <div
            key={`${element.id}-${slideKey}`}
            className={animClass}
            style={{
              ...baseStyle,
              fontSize: element.fontSize,
              fontWeight: element.fontWeight,
              fontFamily: element.fontFamily || 'Inter',
              fontStyle: element.fontStyle || 'normal',
              textDecoration: element.textDecoration || 'none',
              textAlign: element.textAlign || 'center',
              color: element.color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: element.textAlign === 'left' ? 'flex-start' : element.textAlign === 'right' ? 'flex-end' : 'center',
              whiteSpace: 'pre-wrap',
              lineHeight: 1.5,
              padding: '8px',
            }}
          >
            {element.content}
          </div>
        )

      case 'shape':
        const shapeOpacity = (element.opacity || 100) / 100
        if (element.shapeType === 'circle') {
          return (
            <div
              key={`${element.id}-${slideKey}`}
              className={animClass}
              style={{
                ...baseStyle,
                backgroundColor: element.fill,
                borderRadius: '50%',
                opacity: shapeOpacity,
                border: element.strokeWidth ? `${element.strokeWidth}px solid ${element.strokeColor}` : 'none',
                transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
              }}
            />
          )
        }
        if (element.shapeType === 'triangle') {
          return (
            <svg
              key={`${element.id}-${slideKey}`}
              className={animClass}
              style={{...baseStyle, opacity: shapeOpacity}}
              viewBox="0 0 200 150"
              preserveAspectRatio="none"
            >
              <polygon points="100,0 0,150 200,150" fill={element.fill} stroke={element.strokeColor} strokeWidth={element.strokeWidth || 0} />
            </svg>
          )
        }
        if (element.shapeType === 'star') {
          return (
            <svg
              key={`${element.id}-${slideKey}`}
              className={animClass}
              style={{...baseStyle, opacity: shapeOpacity}}
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              <polygon points="50,5 61,35 95,35 68,57 79,91 50,70 21,91 32,57 5,35 39,35" fill={element.fill} stroke={element.strokeColor} strokeWidth={element.strokeWidth || 0} />
            </svg>
          )
        }
        if (element.shapeType === 'line') {
          return (
            <svg
              key={`${element.id}-${slideKey}`}
              className={animClass}
              style={{...baseStyle, opacity: shapeOpacity}}
              viewBox="0 0 200 10"
              preserveAspectRatio="none"
            >
              <line x1="0" y1="5" x2="200" y2="5" stroke={element.fill} strokeWidth={element.strokeWidth || 2} strokeLinecap="round" />
            </svg>
          )
        }
        if (element.shapeType === 'arrow') {
          return (
            <svg
              key={`${element.id}-${slideKey}`}
              className={animClass}
              style={{...baseStyle, opacity: shapeOpacity}}
              viewBox="0 0 200 30"
              preserveAspectRatio="none"
            >
              <line x1="0" y1="15" x2="170" y2="15" stroke={element.fill} strokeWidth={element.strokeWidth || 2} strokeLinecap="round" />
              <polygon points="170,5 200,15 170,25" fill={element.fill} />
            </svg>
          )
        }
        if (element.shapeType === 'hexagon') {
          return (
            <svg
              key={`${element.id}-${slideKey}`}
              className={animClass}
              style={{...baseStyle, opacity: shapeOpacity}}
              viewBox="0 0 120 100"
              preserveAspectRatio="none"
            >
              <polygon points="30,0 90,0 120,50 90,100 30,100 0,50" fill={element.fill} stroke={element.strokeColor} strokeWidth={element.strokeWidth || 0} />
            </svg>
          )
        }
        if (element.shapeType === 'diamond') {
          return (
            <svg
              key={`${element.id}-${slideKey}`}
              className={animClass}
              style={{...baseStyle, opacity: shapeOpacity}}
              viewBox="0 0 100 140"
              preserveAspectRatio="none"
            >
              <polygon points="50,0 100,70 50,140 0,70" fill={element.fill} stroke={element.strokeColor} strokeWidth={element.strokeWidth || 0} />
            </svg>
          )
        }
        return (
          <div
            key={`${element.id}-${slideKey}`}
            className={animClass}
            style={{
              ...baseStyle,
              backgroundColor: element.fill,
              borderRadius: '4px',
              opacity: shapeOpacity,
              border: element.strokeWidth ? `${element.strokeWidth}px solid ${element.strokeColor}` : 'none',
              transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
            }}
          />
        )

      case 'image':
        return (
          <img
            key={`${element.id}-${slideKey}`}
            className={animClass}
            src={element.src || ''}
            alt="slide content"
            style={{
              ...baseStyle,
              objectFit: 'cover',
              borderRadius: '4px',
              display: element.src ? 'block' : 'none',
            }}
            onError={(e) => { e.target.style.display = 'none' }}
          />
        )

      case 'icon':
        const iconSize = Math.min(element.width, element.height) * 0.8
        const iconColor = element.color || '#2E7D32'
        return (
          <div
            key={`${element.id}-${slideKey}`}
            className={animClass}
            style={{
              ...baseStyle,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
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
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
            {element.iconType === 'lightning' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill={iconColor} stroke="none">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
            )}
            {element.iconType === 'thumbsUp' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill={iconColor} stroke="none">
                <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
              </svg>
            )}
          </div>
        )

      case 'table':
        return (
          <div
            key={`${element.id}-${slideKey}`}
            className={animClass}
            style={baseStyle}
          >
            <table
              style={{
                width: '100%',
                height: '100%',
                borderCollapse: 'collapse',
              }}
            >
              <tbody>
                {Array(element.rows).fill(null).map((_, rowIdx) => (
                  <tr key={rowIdx}>
                    {Array(element.cols).fill(null).map((_, colIdx) => (
                      <td
                        key={`${rowIdx}-${colIdx}`}
                        style={{
                          border: '1px solid #9ca3af',
                          padding: '8px',
                          fontSize: '14px',
                          textAlign: 'center',
                        }}
                      >
                        {element.data?.[rowIdx]?.[colIdx] || ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )

      case 'video':
        const isYouTube = element.src?.includes('youtube.com') || element.src?.includes('youtu.be')
        if (!element.src) return null
        return (
          <div
            key={`${element.id}-${slideKey}`}
            className={animClass}
            style={{...baseStyle, overflow: 'hidden', borderRadius: '8px'}}
          >
            {isYouTube ? (
              <iframe
                width="100%"
                height="100%"
                src={element.src}
                style={{ border: 'none' }}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <video
                src={element.src}
                controls
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            )}
          </div>
        )

      case 'audio':
        if (!element.src) return null
        return (
          <div
            key={`${element.id}-${slideKey}`}
            className={`${animClass} bg-gray-100 rounded-lg p-4 flex items-center gap-3`}
            style={baseStyle}
          >
            <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center text-white">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M9 18V5l12-2v13" />
                <circle cx="6" cy="18" r="3" />
                <circle cx="18" cy="16" r="3" />
              </svg>
            </div>
            <audio controls src={element.src} style={{ flex: 1 }} />
          </div>
        )

      default:
        return null
    }
  }

    const frameMapLayout = useMemo(() => {
    const presets = PREZI_LAYOUT_PRESETS

    let rightMost = 0
    return frames.map((frame, index) => {
      if (frame.layout) return { id: frame.id, ...frame.layout }
      const p = presets[index]
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

    const interFrameConnectors = useMemo(() => buildInterFrameConnectors(frameMapLayout), [frameMapLayout])

    const updateCameraToBox = useCallback((box, zoomScale = 0.8) => {
    if (!window.innerWidth || !box) return
    const viewportW = window.innerWidth
    const viewportH = window.innerHeight

    const targetZoom = Math.max(0.1, Math.min(3, Math.min((viewportW / box.width) * zoomScale, (viewportH / box.height) * zoomScale)))
    const worldCenterX = box.x + box.width / 2
    const worldCenterY = box.y + box.height / 2
    const originX = worldBounds.width / 2
    const originY = worldBounds.height / 2
    const viewportCenterX = viewportW / 2
    const viewportCenterY = viewportH / 2

    const panX = originX + (viewportCenterX - originX) / targetZoom - worldCenterX
    const panY = originY + (viewportCenterY - originY) / targetZoom - worldCenterY

    setCamera({ zoom: targetZoom, panX, panY })
  }, [worldBounds.width, worldBounds.height])

  const focusOverview = useCallback(() => {
    const width = Math.max(1, worldBounds.maxX - worldBounds.minX)
    const height = Math.max(1, worldBounds.maxY - worldBounds.minY)
    updateCameraToBox({ x: worldBounds.minX, y: worldBounds.minY, width, height }, 0.85)
  }, [worldBounds.maxX, worldBounds.maxY, worldBounds.minX, worldBounds.minY, updateCameraToBox])

  const focusSlide = useCallback((index) => {
    if (index === -1) {
      focusOverview()
    } else {
      const target = frameMapLayout[index]
      if (target) updateCameraToBox(target, 0.9)
    }
  }, [frameMapLayout, focusOverview, updateCameraToBox])

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!hasStarted) {
        focusOverview()
        return
      }
      focusSlide(currentSlideIndex)
    }, 50)
    return () => clearTimeout(timeout)
  }, [currentSlideIndex, hasStarted, focusOverview, focusSlide])

  const startPresentation = () => {
    setHasStarted(true)
    setCurrentSlideIndex((prev) => Math.max(0, Math.min(frames.length - 1, prev)))
  }

  const handleMouseMove = () => {
    setShowControls(true)
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current)
    }
    controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3000)
  }

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.error("Error fullscreen:", err)
      })
      setIsFullscreen(true)
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen()
      }
      setIsFullscreen(false)
    }
  }

  const exitPresentation = () => {
    if (document.fullscreenElement) document.exitFullscreen()
    navigate('/editor')
  }

  const goToPrev = () => {
    setCurrentSlideIndex(prev => Math.max(0, prev - 1))
  }
  const goToNext = () => {
    setCurrentSlideIndex(prev => Math.min(frames.length - 1, prev + 1))
  }

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        exitPresentation()
        return
      }
      if (!hasStarted && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault()
        startPresentation()
        return
      }
      if (!hasStarted) return
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') goToNext()
      if (e.key === 'ArrowLeft') goToPrev()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [frames.length, hasStarted])

  return (
    <div
        className="fixed inset-0 flex items-center justify-center overflow-hidden"
        style={{
          backgroundColor: '#f5f5f2',
          backgroundImage: editorBackground
            ? `linear-gradient(rgba(255, 255, 255, 0.38), rgba(255, 255, 255, 0.38)), url("${editorBackground}")`
            : 'radial-gradient(circle, #c8c8c4 1px, transparent 1px)',
          backgroundSize: editorBackground ? 'cover' : '28px 28px',
          backgroundPosition: 'center',
          backgroundAttachment: 'fixed'
        }}
      onMouseMove={handleMouseMove}
      ref={containerRef}
    >
      <div
        className="absolute left-0 top-0"
        style={{
          width: `${worldBounds.width}px`,
          height: `${worldBounds.height}px`,
          transform: `scale(${camera.zoom}) translate(${camera.panX}px, ${camera.panY}px)`,
          transformOrigin: 'center center',
          transition: 'transform 1.15s cubic-bezier(0.22, 1, 0.36, 1)',
          willChange: 'transform',
        }}
      >
        {interFrameConnectors.map((connector) => (
          <div
            key={connector.id}
            className="absolute select-none"
            style={{
              left: connector.x,
              top: connector.y,
              transform: 'translate(-50%, -50%)',
              fontSize: connector.horizontal ? '72px' : '70px',
              fontWeight: 800,
              lineHeight: 1,
              color: '#4b5563',
              opacity: 0.92,
              letterSpacing: '0.02em',
              textShadow: '0 2px 8px rgba(255,255,255,0.55)',
              pointerEvents: 'none',
              zIndex: 1,
            }}
          >
            {connector.symbol}
          </div>
        ))}
        {frameMapLayout.map((frameBox, frameIdx) => {
          const frameData = frames.find(f => f.id === frameBox.id) || frames[frameIdx];
          const isActive = currentSlideIndex === frameIdx;
          return (
            <div
              key={frameBox.id}
              className={`absolute overflow-hidden shadow-xl ${isActive ? 'opacity-100 ring-4 ring-primary' : 'opacity-80'}`}
              style={{
                left: frameBox.x,
                top: frameBox.y,
                width: frameBox.width,
                height: frameBox.height,
                background: frameData?.backgroundImage
                  ? `url("${frameData.backgroundImage}") center/cover no-repeat`
                  : ((frameData?.backgroundColor && frameData.backgroundColor !== 'transparent')
                    ? frameData.backgroundColor
                    : (frameData?.bg && frameData.bg !== 'transparent' ? frameData.bg : '#ffffff')),
                borderRadius: '8px',
                transition: 'opacity 0.65s ease, transform 0.65s ease',
              }}
              onClick={(e) => {
                  e.stopPropagation()
                  setCurrentSlideIndex(frameIdx)
              }}
            >
              <div 
                className="relative w-full h-full"
                style={{ 
                  transform: `scale(${frameBox.width / 1280})`, 
                  transformOrigin: 'top left' 
                }}
              >
                {frameData?.elements?.map((el, elementIndex) => {
                    const slideKey = isActive ? currentSlideIndex : frameBox.id;
                    return renderElement(el, slideKey, elementIndex)
                })}
              </div>
            </div>
          )
        })}
      </div>

      {showControls && (
        <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 flex items-center gap-4 bg-gray-800/80 backdrop-blur px-6 py-3 rounded-2xl animate-fade-in shadow-2xl z-50 transition-opacity duration-300">
          {!hasStarted && (
            <button onClick={startPresentation} className="px-4 py-2 rounded-lg bg-white text-gray-900 font-semibold hover:bg-gray-100 transition-colors">
              Start Presentation
            </button>
          )}

          {hasStarted && (
            <>
          <button onClick={goToPrev} disabled={currentSlideIndex === 0} className="p-2 text-white hover:bg-white/20 rounded-full transition-colors disabled:opacity-50">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          
          <div className="text-gray-200 font-medium min-w-[100px] text-center">
            {`${currentSlideIndex + 1} / ${frames.length}`}
          </div>

          <button onClick={goToNext} disabled={currentSlideIndex === frames.length - 1} className="p-2 text-white hover:bg-white/20 rounded-full transition-colors disabled:opacity-50">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 5l7 7-7 7" />
            </svg>
          </button>

          <div className="w-px h-6 bg-white/20 mx-2" />
          
          

          <button onClick={toggleFullscreen} className="p-2 text-white hover:bg-white/20 rounded-full transition-colors">
            {isFullscreen ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
              </svg>
            )}
          </button>
            </>
          )}

          <button onClick={exitPresentation} className="p-2 text-red-400 hover:bg-red-400/20 rounded-full transition-colors ml-2">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}

export default PresentationPage
