const SVG_NS = 'http://www.w3.org/2000/svg'
export const SLIDE_WIDTH = 1280
export const SLIDE_HEIGHT = 720

const toPx = (value) => `${Math.max(0, Number(value) || 0)}px`
const getTextAlign = (value) => value || 'left'
const getJustify = (align) => align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start'
const getIconGlyph = (iconType = '') => {
  const map = {
    star: '?', heart: '?', check: '?', x: '×', arrowRight: '?', arrowLeft: '?', arrowUp: '?', arrowDown: '?',
    bookmark: '??', lock: '??', trophy: '??', gift: '??', bell: '??', info: 'i', alertCircle: '!', helpCircle: '?',
    checkCircle: '?', xCircle: '×', plusCircle: '+', minusCircle: '-', share: '?', clipboard: '??', dollar: '$',
    percent: '%', at: '@', hash: '#', infinity: '8', sun: '?', moon: '?', cloud: '?', lightning: '?', fire: '??',
    droplet: '??', leaf: '??', rocket: '??', anchor: '?', compass: '??', umbrella: '?', lightbulb: '??', key: '??',
    crown: '?', gem: '?', flag: '?', thumbsUp: '??', thumbsDown: '??', smile: '?', frown: '?', meh: '??', plane: '?',
    car: '??', bike: '??', battery: '??', bluetooth: '?', tree: '??', flower: '?', mountain: '?'
  }
  return map[iconType] || '•'
}

const applyBaseStyles = (node, element, scaleX, scaleY) => {
  node.style.position = 'absolute'
  node.style.left = toPx((element.x || 0) * scaleX)
  node.style.top = toPx((element.y || 0) * scaleY)
  node.style.width = toPx((element.width || 0) * scaleX)
  node.style.height = toPx((element.height || 0) * scaleY)
  node.style.boxSizing = 'border-box'
  node.style.opacity = `${((element.opacity ?? 100) / 100)}`
  node.style.transform = element.rotation ? `rotate(${element.rotation}deg)` : ''
  node.style.transformOrigin = 'center center'
  node.style.overflow = 'hidden'
}

const createTextNode = (element, scaleX, scaleY, extra = {}) => {
  const align = getTextAlign(element.textAlign)
  const node = document.createElement('div')
  node.style.width = '100%'
  node.style.height = '100%'
  node.style.display = 'flex'
  node.style.alignItems = 'center'
  node.style.justifyContent = getJustify(align)
  node.style.whiteSpace = 'pre-wrap'
  node.style.wordBreak = 'break-word'
  node.style.overflow = 'hidden'
  node.style.padding = toPx(8 * Math.min(scaleX, scaleY))
  node.style.fontSize = toPx((element.fontSize || 16) * Math.min(scaleX, scaleY))
  node.style.fontWeight = element.fontWeight || 'normal'
  node.style.fontFamily = element.fontFamily || 'Arial, sans-serif'
  node.style.fontStyle = element.fontStyle || 'normal'
  node.style.textDecoration = element.textDecoration || 'none'
  node.style.textAlign = align
  node.style.lineHeight = extra.lineHeight || '1.4'
  node.style.color = extra.color || element.color || '#111827'
  node.style.backgroundColor = element.backgroundColor && element.backgroundColor !== 'transparent' ? element.backgroundColor : 'transparent'
  if (element.borderWidth) {
    node.style.border = `${Math.max(1, element.borderWidth * Math.min(scaleX, scaleY))}px solid ${element.borderColor || '#333333'}`
  }
  if (element.borderRadius) {
    node.style.borderRadius = toPx(element.borderRadius * Math.min(scaleX, scaleY))
  }
  node.textContent = element.content || ''
  return node
}

const createShapeGraphic = (element) => {
  const type = element.shapeType || 'rectangle'
  if (type === 'circle' || type === 'rectangle') {
    const div = document.createElement('div')
    div.style.width = '100%'
    div.style.height = '100%'
    div.style.backgroundColor = element.fill || '#4CAF50'
    div.style.borderRadius = type === 'circle' ? '50%' : `${element.borderRadius || 8}px`
    if (element.strokeWidth) {
      div.style.border = `${element.strokeWidth}px solid ${element.strokeColor || '#333333'}`
    }
    return div
  }

  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 100 100')
  svg.setAttribute('preserveAspectRatio', 'none')
  svg.style.width = '100%'
  svg.style.height = '100%'

  const shape = document.createElementNS(SVG_NS, type === 'line' || type === 'arrow' ? 'path' : 'polygon')
  const fill = element.fill || '#4CAF50'
  const stroke = element.strokeColor || fill
  const strokeWidth = `${element.strokeWidth || (type === 'line' || type === 'arrow' ? 3 : 1)}`

  if (type === 'triangle') shape.setAttribute('points', '50,4 4,96 96,96')
  if (type === 'star') shape.setAttribute('points', '50,4 61,37 96,37 67,58 78,94 50,72 22,94 33,58 4,37 39,37')
  if (type === 'hexagon') shape.setAttribute('points', '25,4 75,4 96,50 75,96 25,96 4,50')
  if (type === 'diamond') shape.setAttribute('points', '50,2 98,50 50,98 2,50')
  if (type === 'line') {
    shape.setAttribute('d', 'M 4 50 L 96 50')
    shape.setAttribute('fill', 'none')
    shape.setAttribute('stroke-linecap', 'round')
  }
  if (type === 'arrow') {
    shape.setAttribute('d', 'M 4 50 L 78 50 M 62 30 L 96 50 L 62 70')
    shape.setAttribute('fill', 'none')
    shape.setAttribute('stroke-linecap', 'round')
    shape.setAttribute('stroke-linejoin', 'round')
  }

  shape.setAttribute('fill', type === 'line' || type === 'arrow' ? 'none' : fill)
  shape.setAttribute('stroke', stroke)
  shape.setAttribute('stroke-width', strokeWidth)
  svg.appendChild(shape)
  return svg
}

const createImageNode = (element, scaleX, scaleY) => {
  const wrapper = document.createElement('div')
  wrapper.style.width = '100%'
  wrapper.style.height = '100%'
  wrapper.style.display = 'flex'
  wrapper.style.flexDirection = element.caption && element.showCaption ? 'column' : 'row'
  wrapper.style.gap = element.caption && element.showCaption ? toPx(4 * Math.min(scaleX, scaleY)) : '0'

  const img = document.createElement('img')
  img.src = element.src || ''
  img.alt = element.caption || 'slide'
  img.crossOrigin = 'anonymous'
  img.style.width = '100%'
  img.style.height = element.caption && element.showCaption ? 'calc(100% - 28px)' : '100%'
  img.style.objectFit = element.objectFit || 'cover'
  img.style.borderRadius = toPx((element.borderRadius || 6) * Math.min(scaleX, scaleY))
  wrapper.appendChild(img)

  if (element.caption && element.showCaption) {
    const caption = document.createElement('div')
    caption.textContent = element.caption
    caption.style.fontSize = toPx((element.captionFontSize || 14) * Math.min(scaleX, scaleY))
    caption.style.fontFamily = element.captionFontFamily || 'Arial, sans-serif'
    caption.style.color = element.captionColor || '#374151'
    caption.style.textAlign = 'center'
    caption.style.backgroundColor = '#f3f4f6'
    caption.style.borderRadius = toPx(6 * Math.min(scaleX, scaleY))
    caption.style.padding = toPx(4 * Math.min(scaleX, scaleY))
    wrapper.appendChild(caption)
  }

  return wrapper
}

const createIconNode = (element, scaleX, scaleY) => {
  const wrapper = document.createElement('div')
  wrapper.style.width = '100%'
  wrapper.style.height = '100%'
  wrapper.style.display = 'flex'
  wrapper.style.flexDirection = element.content && element.showLabel ? 'column' : 'row'
  wrapper.style.alignItems = 'center'
  wrapper.style.justifyContent = 'center'
  wrapper.style.gap = toPx(6 * Math.min(scaleX, scaleY))

  const iconBubble = document.createElement('div')
  iconBubble.textContent = getIconGlyph(element.iconType)
  iconBubble.style.width = element.content && element.showLabel ? '68%' : '78%'
  iconBubble.style.height = element.content && element.showLabel ? '62%' : '78%'
  iconBubble.style.display = 'flex'
  iconBubble.style.alignItems = 'center'
  iconBubble.style.justifyContent = 'center'
  iconBubble.style.backgroundColor = element.color || element.fill || '#2E7D32'
  iconBubble.style.color = '#ffffff'
  iconBubble.style.borderRadius = '9999px'
  iconBubble.style.fontSize = toPx(Math.max(18, ((element.fontSize || 28) * Math.min(scaleX, scaleY)) * 1.15))
  iconBubble.style.fontFamily = element.fontFamily || 'Arial, sans-serif'
  wrapper.appendChild(iconBubble)

  if (element.content && element.showLabel) {
    const label = document.createElement('div')
    label.textContent = element.content
    label.style.maxWidth = '100%'
    label.style.fontSize = toPx((element.fontSize || 14) * Math.min(scaleX, scaleY))
    label.style.fontFamily = element.fontFamily || 'Arial, sans-serif'
    label.style.fontWeight = element.fontWeight || 'normal'
    label.style.color = element.textColor || element.color || '#1f2937'
    label.style.textAlign = 'center'
    label.style.whiteSpace = 'nowrap'
    label.style.overflow = 'hidden'
    label.style.textOverflow = 'ellipsis'
    wrapper.appendChild(label)
  }

  return wrapper
}

const createTableNode = (element, scaleX, scaleY) => {
  const table = document.createElement('table')
  table.style.width = '100%'
  table.style.height = '100%'
  table.style.borderCollapse = 'collapse'
  table.style.tableLayout = 'fixed'
  table.style.backgroundColor = '#ffffff'

  const rows = Math.max(1, element.rows || element.data?.length || 1)
  const cols = Math.max(1, element.cols || element.data?.[0]?.length || 1)
  for (let r = 0; r < rows; r++) {
    const tr = document.createElement('tr')
    for (let c = 0; c < cols; c++) {
      const td = document.createElement('td')
      td.textContent = element.data?.[r]?.[c] || ''
      td.style.border = '1px solid #9CA3AF'
      td.style.padding = toPx(6 * Math.min(scaleX, scaleY))
      td.style.fontSize = toPx(12 * Math.min(scaleX, scaleY))
      td.style.color = '#111827'
      td.style.verticalAlign = 'middle'
      tr.appendChild(td)
    }
    table.appendChild(tr)
  }
  return table
}

const createMediaPlaceholder = (element, scaleX, scaleY) => {
  const wrapper = document.createElement('div')
  wrapper.style.width = '100%'
  wrapper.style.height = '100%'
  wrapper.style.display = 'flex'
  wrapper.style.alignItems = 'center'
  wrapper.style.justifyContent = 'center'
  wrapper.style.flexDirection = 'column'
  wrapper.style.gap = toPx(10 * Math.min(scaleX, scaleY))
  wrapper.style.background = element.type === 'video' ? '#111827' : '#f3f4f6'
  wrapper.style.color = element.type === 'video' ? '#ffffff' : '#111827'
  wrapper.style.borderRadius = toPx(10 * Math.min(scaleX, scaleY))
  wrapper.style.padding = toPx(12 * Math.min(scaleX, scaleY))

  const icon = document.createElement('div')
  icon.textContent = element.type === 'video' ? '?' : '?'
  icon.style.width = toPx(54 * Math.min(scaleX, scaleY))
  icon.style.height = toPx(54 * Math.min(scaleX, scaleY))
  icon.style.borderRadius = '9999px'
  icon.style.display = 'flex'
  icon.style.alignItems = 'center'
  icon.style.justifyContent = 'center'
  icon.style.background = element.type === 'video' ? 'rgba(255,255,255,0.12)' : '#10b981'
  icon.style.color = '#ffffff'
  icon.style.fontSize = toPx(24 * Math.min(scaleX, scaleY))
  wrapper.appendChild(icon)

  const label = document.createElement('div')
  label.textContent = element.title || (element.isYouTube ? 'Embedded video' : element.type === 'video' ? 'Video clip' : 'Audio clip')
  label.style.fontSize = toPx(16 * Math.min(scaleX, scaleY))
  label.style.fontWeight = '600'
  label.style.maxWidth = '100%'
  label.style.whiteSpace = 'nowrap'
  label.style.overflow = 'hidden'
  label.style.textOverflow = 'ellipsis'
  wrapper.appendChild(label)

  return wrapper
}

const createDrawingNode = (element) => {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', `0 0 ${SLIDE_WIDTH} ${SLIDE_HEIGHT}`)
  svg.style.width = '100%'
  svg.style.height = '100%'
  ;(element.paths || []).forEach((pathData) => {
    if (!pathData?.points?.length) return
    const path = document.createElementNS(SVG_NS, 'path')
    path.setAttribute('d', `M ${pathData.points.map((point) => `${point.x} ${point.y}`).join(' L ')}`)
    path.setAttribute('stroke', pathData.color || '#111827')
    path.setAttribute('stroke-width', `${pathData.size || 2}`)
    path.setAttribute('fill', 'none')
    path.setAttribute('stroke-linecap', 'round')
    path.setAttribute('stroke-linejoin', 'round')
    svg.appendChild(path)
  })
  return svg
}

const createElementNode = (element, scaleX, scaleY) => {
  const node = document.createElement('div')
  applyBaseStyles(node, element, scaleX, scaleY)
  switch (element.type) {
    case 'text':
      node.appendChild(createTextNode(element, scaleX, scaleY))
      break
    case 'shape': {
      node.style.display = 'flex'
      node.style.alignItems = 'stretch'
      node.style.justifyContent = 'stretch'
      node.appendChild(createShapeGraphic(element))
      if (element.content) {
        const overlay = createTextNode({ ...element, backgroundColor: 'transparent', borderWidth: 0, borderRadius: 0, textAlign: element.textAlign || 'center' }, scaleX, scaleY, { lineHeight: '1.25' })
        overlay.style.position = 'absolute'
        overlay.style.inset = '0'
        overlay.style.padding = toPx(10 * Math.min(scaleX, scaleY))
        node.appendChild(overlay)
      }
      break
    }
    case 'image':
      node.appendChild(createImageNode(element, scaleX, scaleY))
      break
    case 'icon':
      node.appendChild(createIconNode(element, scaleX, scaleY))
      break
    case 'table':
      node.appendChild(createTableNode(element, scaleX, scaleY))
      break
    case 'video':
    case 'audio':
      node.appendChild(createMediaPlaceholder(element, scaleX, scaleY))
      break
    case 'drawing':
      node.appendChild(createDrawingNode(element))
      break
    default:
      node.style.backgroundColor = element.fill || element.backgroundColor || '#d1d5db'
      if (element.borderRadius) node.style.borderRadius = toPx(element.borderRadius * Math.min(scaleX, scaleY))
      break
  }
  return node
}

export const buildSlideRenderNode = (frame, { width = SLIDE_WIDTH, height = SLIDE_HEIGHT } = {}) => {
  const root = document.createElement('div')
  root.style.position = 'relative'
  root.style.width = toPx(width)
  root.style.height = toPx(height)
  root.style.overflow = 'hidden'
  root.style.backgroundColor = frame?.backgroundColor || '#ffffff'
  root.style.backgroundImage = frame?.backgroundImage ? `url(${frame.backgroundImage})` : 'none'
  root.style.backgroundSize = 'cover'
  root.style.backgroundPosition = 'center'
  root.style.backgroundRepeat = 'no-repeat'
  root.style.fontFamily = 'Arial, sans-serif'

  const scaleX = width / SLIDE_WIDTH
  const scaleY = height / SLIDE_HEIGHT
  ;(frame?.elements || []).forEach((element) => {
    if (!element || element.isPlaceholder) return
    root.appendChild(createElementNode(element, scaleX, scaleY))
  })
  return root
}
