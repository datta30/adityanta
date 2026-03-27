import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useEditor } from '../../context/EditorContext'

const SLIDE_WIDTH = 1280
const SLIDE_HEIGHT = 720

const PresentationPageV2 = () => {
  const navigate = useNavigate()
  const { templateId } = useParams()
  const { frames } = useEditor()

  const [currentSlideIndex, setCurrentSlideIndex] = useState(0)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showQR, setShowQR] = useState(false)
  const slideViewportRef = useRef(null)
  const [slideScale, setSlideScale] = useState(1)

  const getAnimationClass = (animation) => {
    switch (animation) {
      case 'fade': return 'animate-fade-in'
      case 'slide-up': return 'animate-slide-up-content'
      case 'slide-right': return 'animate-slide-right-content'
      case 'zoom': return 'animate-zoom-in'
      case 'bounce': return 'animate-bounce-in'
      default: return ''
    }
  }

  const renderElement = (element, slideKey) => {
    const animClass = getAnimationClass(element.animation)
    const animStyle = element.animation && element.animation !== 'none' ? {
      '--anim-duration': `${element.animationSpeed || 500}ms`,
      '--anim-delay': `${element.animationDelay || 0}ms`,
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

      case 'shape': {
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
              style={{ ...baseStyle, opacity: shapeOpacity }}
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
              style={{ ...baseStyle, opacity: shapeOpacity }}
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
              style={{ ...baseStyle, opacity: shapeOpacity }}
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
              style={{ ...baseStyle, opacity: shapeOpacity }}
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
              style={{ ...baseStyle, opacity: shapeOpacity }}
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
              style={{ ...baseStyle, opacity: shapeOpacity }}
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
      }

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

      case 'icon': {
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
      }

      case 'table':
        return (
          <div key={`${element.id}-${slideKey}`} className={animClass} style={baseStyle}>
            <table style={{ width: '100%', height: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {Array(element.rows).fill(null).map((_, rowIdx) => (
                  <tr key={rowIdx}>
                    {Array(element.cols).fill(null).map((_, colIdx) => (
                      <td
                        key={`${rowIdx}-${colIdx}`}
                        style={{ border: '1px solid #9ca3af', padding: '8px', fontSize: '14px', textAlign: 'center' }}
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

      case 'video': {
        const isYouTube = element.src?.includes('youtube.com') || element.src?.includes('youtu.be')
        if (!element.src) return null
        return (
          <div
            key={`${element.id}-${slideKey}`}
            className={animClass}
            style={{ ...baseStyle, overflow: 'hidden', borderRadius: '8px' }}
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
              <video src={element.src} controls style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            )}
          </div>
        )
      }

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

  const currentFrame = useMemo(() => frames[currentSlideIndex] || frames[0], [frames, currentSlideIndex])

  useEffect(() => {
    if (frames.length === 0) return
    setCurrentSlideIndex((prev) => Math.max(0, Math.min(prev, frames.length - 1)))
  }, [frames.length])

  useEffect(() => {
    const updateScale = () => {
      if (!slideViewportRef.current) return
      const rect = slideViewportRef.current.getBoundingClientRect()
      const nextScale = Math.min(rect.width / SLIDE_WIDTH, rect.height / SLIDE_HEIGHT)
      setSlideScale(Math.max(0.2, nextScale || 1))
    }

    updateScale()

    const observer = new ResizeObserver(updateScale)
    if (slideViewportRef.current) observer.observe(slideViewportRef.current)

    window.addEventListener('resize', updateScale)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateScale)
    }
  }, [])

  const goToEditor = () => {
    navigate(templateId ? `/editor/${templateId}` : '/editor')
  }

  const goToPrev = () => {
    setCurrentSlideIndex((prev) => Math.max(0, prev - 1))
  }

  const goToNext = () => {
    setCurrentSlideIndex((prev) => Math.min(frames.length - 1, prev + 1))
  }

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {})
      setIsFullscreen(true)
    } else {
      if (document.exitFullscreen) document.exitFullscreen()
      setIsFullscreen(false)
    }
  }

  const exitPresentation = () => {
    if (document.fullscreenElement) document.exitFullscreen()
    goToEditor()
  }

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [])

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        goToNext()
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        goToPrev()
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        exitPresentation()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [frames.length, templateId])

  const shareUrl = typeof window !== 'undefined' ? window.location.href : ''

  return (
    <div className="fixed inset-0 bg-[#0b1220] flex flex-col overflow-hidden">
      <div className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 md:px-8">
        <h1 className="text-xl font-semibold text-gray-700 truncate">{currentFrame?.title || 'Untitled presentation'}</h1>
        <button
          onClick={goToEditor}
          className="px-3 py-1.5 rounded-md bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium flex items-center gap-1"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
          Edit
        </button>
      </div>

      <div className="relative flex-1 flex items-center justify-center px-8 md:px-14 py-6">
        <button
          onClick={goToNext}
          disabled={currentSlideIndex === frames.length - 1}
          className="absolute top-2 left-1/2 -translate-x-1/2 text-gray-300 disabled:opacity-20"
          title="Next"
        >
          <svg width="56" height="56" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5z" /></svg>
        </button>

        <div ref={slideViewportRef} className="w-full h-full flex items-center justify-center">
          <div
            className="relative bg-[#efefef] shadow-2xl overflow-hidden"
            style={{
              width: `${SLIDE_WIDTH * slideScale}px`,
              height: `${SLIDE_HEIGHT * slideScale}px`,
              maxWidth: '100%',
              maxHeight: '100%',
            }}
          >
            <div
              className="absolute left-0 top-0"
              style={{
                width: SLIDE_WIDTH,
                height: SLIDE_HEIGHT,
                transform: `scale(${slideScale})`,
                transformOrigin: 'top left',
                background: currentFrame?.backgroundImage
                  ? `url("${currentFrame.backgroundImage}") center/cover no-repeat`
                  : (currentFrame?.backgroundColor || '#efefef'),
              }}
            >
              {(currentFrame?.elements || []).map((el) => renderElement(el, currentSlideIndex))}
            </div>
          </div>
        </div>

        <div className="absolute left-5 bottom-4 z-20">
          <div className="bg-[#1f2937] text-white rounded-md overflow-hidden shadow-xl w-48 border border-gray-600">
            <div className="p-2 bg-gray-100">
              <div className="relative rounded overflow-hidden border border-gray-300 bg-white" style={{ aspectRatio: '16 / 9' }}>
                <div className="absolute inset-0 scale-[0.24] origin-top-left" style={{ width: 1280, height: 720 }}>
                  {(currentFrame?.elements || []).slice(0, 3).map((el) => renderElement(el, `thumb-${currentSlideIndex}`))}
                </div>
              </div>
            </div>
            <div className="px-3 py-1 text-center text-lg font-medium">{currentSlideIndex + 1}/{frames.length || 1}</div>
          </div>
        </div>

        {showQR && (
          <div className="absolute right-5 bottom-20 z-30 bg-white rounded-lg shadow-xl border border-gray-200 p-3">
            <img
              src={`https://quickchart.io/qr?text=${encodeURIComponent(shareUrl)}&size=180`}
              alt="Presentation QR"
              width={180}
              height={180}
            />
          </div>
        )}
      </div>

      <div className="h-16 bg-[#0f172a] border-t border-slate-700 flex items-center gap-3 px-3 md:px-5 text-white">
        <button
          onClick={goToPrev}
          disabled={currentSlideIndex === 0}
          className="p-2 rounded hover:bg-white/10 disabled:opacity-40"
          title="Previous"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
        </button>

        <button
          onClick={goToNext}
          disabled={currentSlideIndex === frames.length - 1}
          className="p-2 rounded hover:bg-white/10 disabled:opacity-40"
          title="Next"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
        </button>

        <div className="flex-1 px-2">
          <input
            type="range"
            min={0}
            max={Math.max(0, frames.length - 1)}
            value={currentSlideIndex}
            onChange={(e) => setCurrentSlideIndex(Number(e.target.value))}
            className="w-full accent-blue-500"
          />
        </div>

        <button onClick={() => setShowQR((prev) => !prev)} className="px-3 py-2 rounded hover:bg-white/10 text-sm">Show QR code</button>

        <button onClick={toggleFullscreen} className="p-2 rounded hover:bg-white/10" title="Fullscreen">
          {isFullscreen ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" /></svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" /></svg>
          )}
        </button>

        <button onClick={exitPresentation} className="p-2 rounded hover:bg-red-500/20 text-red-300" title="Close">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>
      </div>
    </div>
  )
}

export default PresentationPageV2
