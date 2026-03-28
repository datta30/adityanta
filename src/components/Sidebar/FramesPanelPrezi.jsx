import { memo, useMemo, useState, useRef, useEffect } from 'react'
import { PREZI_FRAME_TEMPLATES } from '../../utils/templateData'

const MiniCanvasPreview = memo(({ frame }) => {
  const elements = frame?.elements || []

  return (
    <div className="relative w-full aspect-[16/9] overflow-hidden rounded-md bg-white border border-gray-200">
      <div
        className="absolute inset-0"
        style={{
          backgroundColor: frame?.backgroundColor || '#ffffff',
          backgroundImage: frame?.backgroundImage ? `url(${frame.backgroundImage})` : 'none',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />
      {elements.slice(0, 6).map((el) => {
        if (!el || el.isPlaceholder) return null
        return (
          <div
            key={el.id}
            className="absolute overflow-hidden"
            style={{
              left: `${(el.x / 1280) * 100}%`,
              top: `${(el.y / 720) * 100}%`,
              width: `${((el.width || 100) / 1280) * 100}%`,
              height: `${((el.height || 60) / 720) * 100}%`,
              background: el.type === 'text' ? 'transparent' : '#d1d5db',
              color: '#111827',
              fontSize: '8px',
              fontWeight: 700,
              borderRadius: '2px',
            }}
          >
            {el.type === 'text' ? (el.content || '').slice(0, 24) : null}
          </div>
        )
      })}
    </div>
  )
})

MiniCanvasPreview.displayName = 'MiniCanvasPreview'

const templatePreview = {
  title: (
    <div className="h-16 bg-white border border-gray-200 rounded-md flex flex-col items-center justify-center">
      <div className="text-[9px] font-bold text-gray-900">Your presentation title</div>
      <div className="text-[7px] text-gray-500 mt-1">Subtitle</div>
    </div>
  ),
  imageText: (
    <div className="h-16 bg-white border border-gray-200 rounded-md p-1.5 flex gap-1">
      <div className="w-3/5 text-[7px] text-gray-700">Heading + body</div>
      <div className="w-2/5 rounded bg-gray-300" />
    </div>
  ),
  boldStatement: (
    <div className="h-16 rounded-md bg-gray-900 border border-gray-700 p-1.5 flex items-end">
      <div className="text-[8px] text-white font-bold">Make a bold statement</div>
    </div>
  ),
  textInfo: (
    <div className="h-16 bg-white border border-gray-200 rounded-md p-1.5">
      <div className="text-[8px] font-semibold text-gray-900">Heading</div>
      <div className="text-[7px] text-gray-500 mt-1">Body paragraph text</div>
    </div>
  ),
  closing: (
    <div className="h-16 rounded-md bg-gray-900 border border-gray-700 p-1.5 flex items-center justify-center">
      <div className="text-[9px] text-white font-bold">THE END</div>
    </div>
  ),
}

const FramesPanelPrezi = ({
  frames,
  activeFrame,
  setActiveFrame,
  addNewFrame,
  deleteFrame,
  duplicateFrame,
  reorderFrames,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)
  const [dragOverIndex, setDragOverIndex] = useState(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const dragIndexRef = useRef(null)
  const templatePickerRef = useRef(null)

  // Close template picker on outside click
  useEffect(() => {
    const handler = (e) => {
      if (templatePickerRef.current && !templatePickerRef.current.contains(e.target)) {
        setShowTemplatePicker(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const activeIndex = useMemo(() => frames.findIndex((f) => f.id === activeFrame), [frames, activeFrame])

  const handleDragStart = (e, index) => {
    dragIndexRef.current = index
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(index))
  }

  const handleDragOver = (e, index) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (index !== dragIndexRef.current) setDragOverIndex(index)
  }

  const handleDrop = (e, toIndex) => {
    e.preventDefault()
    const fromIndex = dragIndexRef.current
    if (fromIndex !== null && fromIndex !== toIndex) {
      reorderFrames(fromIndex, toIndex)
    }
    dragIndexRef.current = null
    setDragOverIndex(null)
  }

  const handleDragEnd = () => {
    dragIndexRef.current = null
    setDragOverIndex(null)
  }

  const handleAddFrame = (templateId) => {
    addNewFrame(templateId)
    setShowTemplatePicker(false)
  }

  if (isCollapsed) {
    return (
      <aside className="relative w-6 bg-white border-r border-gray-200 transition-all duration-200">
        <button
          className="absolute top-1/2 -translate-y-1/2 right-0 w-6 h-14 rounded-r-xl border border-gray-200 bg-white text-gray-500 hover:text-gray-900 transition-all"
          onClick={() => setIsCollapsed(false)}
          title="Expand frames panel"
        >
          ›
        </button>
      </aside>
    )
  }

  return (
    <aside className="relative w-72 bg-white border-r border-gray-200 flex flex-col transition-all duration-200">
      <div className="p-3 border-b border-gray-100">
        <div className="relative" ref={templatePickerRef}>
          <button
            onClick={() => setShowTemplatePicker((v) => !v)}
            className="w-full h-11 bg-[#3dba4e] hover:bg-[#34a745] text-white rounded-md px-3 flex items-center justify-between font-semibold transition-all"
          >
            <span>+ Add frame</span>
            <span className="text-sm">▾</span>
          </button>

          {showTemplatePicker && (
            <div className="absolute left-0 right-0 mt-2 bg-white border border-gray-200 rounded-xl shadow-lg p-3 z-30">
              <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">Choose template</p>
              <div className="grid grid-cols-2 gap-2">
                {PREZI_FRAME_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.id}
                    onClick={() => handleAddFrame(tpl.id)}
                    className="text-left p-2 rounded-lg border border-gray-200 hover:border-[#3dba4e] hover:bg-green-50 transition-all"
                  >
                    {templatePreview[tpl.id]}
                    <div className="text-[11px] font-medium text-gray-700 mt-1">{tpl.label}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <button
          onClick={() => frames[0] && setActiveFrame(frames[0].id, 'overview')}
          className={`w-full text-left rounded-xl bg-gray-50 p-2 border-2 transition-all ${
            activeIndex === 0 ? 'border-[#3dba4e]' : 'border-transparent hover:border-gray-200'
          }`}
          style={activeIndex === 0 ? { borderWidth: '3px' } : undefined}
        >
          <MiniCanvasPreview frame={frames[0]} />
          <div className="mt-2 text-sm font-semibold text-gray-700 text-center">Overview</div>
        </button>

        {frames.map((frame, index) => {
          if (index === 0) return null
          const isActive = activeFrame === frame.id
          const isDragTarget = dragOverIndex === index
          return (
            <div
              key={frame.id}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
              onClick={() => setActiveFrame(frame.id, 'frame')}
              className={`group cursor-grab active:cursor-grabbing rounded-xl p-2 border-2 transition-all ${
                isActive ? 'border-[#3dba4e] bg-green-50/50' : 'border-gray-200 hover:border-gray-300'
              } ${isDragTarget ? 'ring-2 ring-[#3dba4e] ring-offset-1 scale-[0.98]' : ''}`}
              style={isActive ? { borderWidth: '3px' } : undefined}
            >
              <div className="flex items-start gap-2">
                <div className="flex flex-col items-center gap-1">
                  <div className="mt-1 w-6 h-6 rounded-full bg-gray-100 text-gray-700 text-xs font-bold flex items-center justify-center">
                    {index}
                  </div>
                  <div className="text-gray-300 text-[10px] leading-none select-none">⠿</div>
                </div>

                <div className="flex-1">
                  <div className="relative">
                    <MiniCanvasPreview frame={frame} />
                    <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-white/95 border border-gray-300 text-[11px] flex items-center justify-center">
                      📍
                    </div>
                  </div>

                  <div className="mt-1.5 flex items-center justify-between">
                    <p className="text-xs font-bold text-gray-700">Zoom to Frame</p>
                    <span className="text-gray-500 text-sm">»</span>
                  </div>
                </div>
              </div>

              {confirmDeleteId === frame.id ? (
                <div className="mt-1 flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                  <span className="text-[11px] text-gray-500">Delete frame?</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteFrame(frame.id) }}
                    className="text-[11px] px-2 py-1 rounded border border-red-300 bg-red-50 text-red-600 hover:bg-red-100 transition-all font-semibold"
                  >Yes</button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null) }}
                    className="text-[11px] px-2 py-1 rounded border border-gray-200 hover:bg-white transition-all"
                  >No</button>
                </div>
              ) : (
                <div className="mt-1 hidden group-hover:flex justify-end gap-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); duplicateFrame(frame.id) }}
                    className="text-[11px] px-2 py-1 rounded border border-gray-200 hover:bg-white transition-all"
                  >Duplicate</button>
                  {frames.length > 1 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(frame.id) }}
                      className="text-[11px] px-2 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50 transition-all"
                    >Delete</button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <button
        className="absolute top-1/2 -translate-y-1/2 -right-3 w-6 h-14 rounded-r-xl border border-gray-200 bg-white text-gray-500 hover:text-gray-900 transition-all"
        onClick={() => setIsCollapsed(true)}
        title="Collapse frames panel"
      >
        ‹
      </button>
    </aside>
  )
}

export default memo(FramesPanelPrezi)
