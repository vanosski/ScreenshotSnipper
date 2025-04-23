
const canvas = document.getElementById('snippingCanvas');
const ctx = canvas.getContext('2d');
const annotationToolbar = document.getElementById('annotationToolbar');
const actionToolbar = document.getElementById('actionToolbar');
const textInput = document.getElementById('textInput');
const colorPicker = document.getElementById('colorPicker');
const colorButton = document.getElementById('colorButton');
const colorIndicator = document.getElementById('colorIndicator');
const saveButton = document.getElementById('saveButton');
const copyButton = document.getElementById('copyButton');
const cancelButton = document.getElementById('cancelButton');


const SEMI_TRANSPARENT_COLOR = 'rgba(0, 0, 0, 0.4)'; 
const SELECTION_BORDER_COLOR = 'rgba(255, 255, 255, 0.9)';
const SELECTION_BORDER_WIDTH = 2;
const HANDLE_SIZE = 10;
const MIN_SELECTION_SIZE = 20;
const HIGHLIGHTER_COLOR = 'rgba(255, 255, 0, 0.4)'; 


let screenWidth = window.innerWidth;
let screenHeight = window.innerHeight;
let backgroundImage = null; 
let isSelecting = false;
let isDragging = false;
let isResizing = false;
let isDrawing = false;
let startPoint = { x: 0, y: 0 };
let endPoint = { x: 0, y: 0 };
let selectionRect = null; 
let dragOffset = { x: 0, y: 0 };
let resizeHandle = null; 
let annotations = []; 
let currentTool = null; 
let currentColor = '#ff0000'; 
let currentPath = null; 
let tempShape = null; 
let textInputActive = false;
let currentTextInputData = null; 


async function initialize() {
    
    canvas.width = screenWidth;
    canvas.height = screenHeight;

    
    colorPicker.value = currentColor;
    updateColorIndicator(currentColor);

    
    const sourceId = await window.electronAPI.getScreenSourceId();
    if (!sourceId) {
        alert("Error: Could not get screen source ID.");
        window.close(); 
        return;
    }

    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
                mandatory: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: sourceId,
                    minWidth: screenWidth,
                    minHeight: screenHeight,
                    maxWidth: screenWidth,
                    maxHeight: screenHeight,
                }
            }
        });

        const video = document.createElement('video');
        video.style.position = 'fixed'; 
        video.style.top = '-9999px';
        video.style.left = '-9999px';

        video.onloadedmetadata = () => {
            video.play();
            
            setTimeout(() => {
                const bgCanvas = document.createElement('canvas');
                bgCanvas.width = screenWidth;
                bgCanvas.height = screenHeight;
                const bgCtx = bgCanvas.getContext('2d');
                bgCtx.drawImage(video, 0, 0, screenWidth, screenHeight);

                backgroundImage = new Image();
                backgroundImage.onload = () => {
                    console.log("Background image loaded");
                    
                    stream.getTracks().forEach(track => track.stop());
                    document.body.removeChild(video); 
                    requestAnimationFrame(drawOverlay); 
                };
                backgroundImage.onerror = () => {
                    console.error("Failed to load image from canvas data URL");
                    alert("Error capturing screen.");
                    stream.getTracks().forEach(track => track.stop());
                    document.body.removeChild(video);
                    window.close();
                };
                backgroundImage.src = bgCanvas.toDataURL('image/png');

            }, 150); 
        };
        video.srcObject = stream;
        document.body.appendChild(video); 

    } catch (err) {
        console.error("Error accessing screen media:", err);
        alert(`Error capturing screen: ${err.name} - ${err.message}\nMake sure screen recording permissions are granted.`);
        window.close();
    }

    
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('keydown', handleKeyDown);

    
    annotationToolbar.addEventListener('click', handleAnnotationToolbarClick);
    actionToolbar.addEventListener('click', handleActionToolbarClick);
    colorPicker.addEventListener('input', handleColorChange); 

    
    textInput.addEventListener('blur', handleTextInputBlur);
    textInput.addEventListener('keydown', handleTextInputKeyDown);

}


function drawOverlay() {
    
    ctx.clearRect(0, 0, screenWidth, screenHeight);

    
    if (backgroundImage) {
        ctx.drawImage(backgroundImage, 0, 0, screenWidth, screenHeight);
    } else {
        
         ctx.fillStyle = '#cccccc'; 
         ctx.fillRect(0, 0, screenWidth, screenHeight);
         ctx.fillStyle = 'black';
         ctx.font = '20px sans-serif';
         ctx.textAlign = 'center';
         ctx.fillText('Loading screenshot...', screenWidth / 2, screenHeight / 2);
         requestAnimationFrame(drawOverlay); 
         return; 
    }

    
    ctx.fillStyle = SEMI_TRANSPARENT_COLOR;
    ctx.fillRect(0, 0, screenWidth, screenHeight);

    
    if (selectionRect && selectionRect.w > 0 && selectionRect.h > 0) {
        
        ctx.clearRect(selectionRect.x, selectionRect.y, selectionRect.w, selectionRect.h);

        
        ctx.save();
        
        ctx.beginPath();
        ctx.rect(selectionRect.x, selectionRect.y, selectionRect.w, selectionRect.h);
        ctx.clip();
        
        ctx.translate(selectionRect.x, selectionRect.y);

        
        annotations.forEach(drawSingleAnnotation); 

        
        if (isDrawing && (currentPath || tempShape)) {
             if (currentPath) drawSingleAnnotation(currentPath);
             if (tempShape) drawSingleAnnotation(tempShape);
        }

        ctx.restore(); 

        
        ctx.strokeStyle = SELECTION_BORDER_COLOR;
        ctx.lineWidth = SELECTION_BORDER_WIDTH;
        ctx.setLineDash([6, 4]); 
        ctx.strokeRect(selectionRect.x, selectionRect.y, selectionRect.w, selectionRect.h);
        ctx.setLineDash([]); 

        
        drawResizeHandles();

        
        drawDimensions();
    }

    
    requestAnimationFrame(drawOverlay);
}


function drawSingleAnnotation(annotation) {
    if (!annotation) return;
    drawSingleAnnotationOnContext(ctx, annotation); 
}


function drawSingleAnnotationOnContext(targetCtx, annotation) {
    if (!annotation) return;

    const type = annotation.type;
    
    
    const color = type === 'highlighter' ? annotation.color : (annotation.color || currentColor);
    const width = annotation.width || 2; 

    targetCtx.strokeStyle = color;
    targetCtx.fillStyle = color; 
    targetCtx.lineWidth = width;
    targetCtx.lineCap = 'round';
    targetCtx.lineJoin = 'round';
    targetCtx.globalAlpha = 1.0; 

    if (type === 'pencil' && annotation.points && annotation.points.length > 1) {
        targetCtx.beginPath();
        targetCtx.moveTo(annotation.points[0].x, annotation.points[0].y);
        for (let i = 1; i < annotation.points.length; i++) {
            targetCtx.lineTo(annotation.points[i].x, annotation.points[i].y);
        }
        targetCtx.stroke();
    } else if (type === 'rectangle' && annotation.rect) {
        targetCtx.strokeRect(annotation.rect.x, annotation.rect.y, annotation.rect.w, annotation.rect.h);
    } else if (type === 'circle' && annotation.rect) {
        const rect = annotation.rect;
        const cx = rect.x + rect.w / 2;
        const cy = rect.y + rect.h / 2;
        const rx = Math.abs(rect.w / 2);
        const ry = Math.abs(rect.h / 2);
        if (rx > 0 && ry > 0) {
             targetCtx.beginPath();
             targetCtx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
             targetCtx.stroke();
        }
    } else if (type === 'arrow' && annotation.start && annotation.end) {
        const start = annotation.start;
        const end = annotation.end;
        const angle = Math.atan2(end.y - start.y, end.x - start.x);
        const headlen = Math.max(8, width * 3.5); 
        const headangle = Math.PI / 7; 

        
        targetCtx.beginPath();
        targetCtx.moveTo(start.x, start.y);
        targetCtx.lineTo(end.x, end.y);
        targetCtx.stroke();

        
        targetCtx.fillStyle = color; 
        targetCtx.beginPath();
        targetCtx.moveTo(end.x, end.y);
        targetCtx.lineTo(end.x - headlen * Math.cos(angle - headangle), end.y - headlen * Math.sin(angle - headangle));
        targetCtx.lineTo(end.x - headlen * Math.cos(angle + headangle), end.y - headlen * Math.sin(angle + headangle));
        targetCtx.closePath();
        targetCtx.fill();

    } else if (type === 'highlighter' && annotation.rect) {
        
        targetCtx.fillStyle = annotation.color; 
        targetCtx.fillRect(annotation.rect.x, annotation.rect.y, annotation.rect.w, annotation.rect.h);

    } else if (type === 'text' && annotation.text && annotation.rect) {
        const font = annotation.font || '16px sans-serif';
        targetCtx.font = font;
        targetCtx.textAlign = 'left';
        targetCtx.textBaseline = 'top';
        targetCtx.fillText(annotation.text, annotation.rect.x + 2, annotation.rect.y + 2);
    } else if (type === 'temp_rect_preview' && annotation.rect) {
        
        targetCtx.strokeStyle = 'rgba(150, 150, 150, 0.7)';
        targetCtx.lineWidth = 1;
        targetCtx.setLineDash([3, 3]);
        targetCtx.strokeRect(annotation.rect.x, annotation.rect.y, annotation.rect.w, annotation.rect.h);
        targetCtx.setLineDash([]);
    }
}


function getResizeHandles() {
    if (!selectionRect) return {};

    const { x, y, w, h } = selectionRect;
    const hs = HANDLE_SIZE;
    const hs_half = hs / 2;
    const cx = x + w / 2;
    const cy = y + h / 2;

    return {
        top_left:     { x: x - hs_half,    y: y - hs_half,    w: hs, h: hs },
        top_mid:      { x: cx - hs_half,   y: y - hs_half,    w: hs, h: hs },
        top_right:    { x: x + w - hs_half, y: y - hs_half,    w: hs, h: hs },
        mid_left:     { x: x - hs_half,    y: cy - hs_half,   w: hs, h: hs },
        mid_right:    { x: x + w - hs_half, y: cy - hs_half,   w: hs, h: hs },
        bottom_left:  { x: x - hs_half,    y: y + h - hs_half, w: hs, h: hs },
        bottom_mid:   { x: cx - hs_half,   y: y + h - hs_half, w: hs, h: hs },
        bottom_right: { x: x + w - hs_half, y: y + h - hs_half, w: hs, h: hs },
    };
}

function drawResizeHandles() {
    const handles = getResizeHandles();
    ctx.fillStyle = SELECTION_BORDER_COLOR;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.lineWidth = 1;
    for (const handleName in handles) {
        const h = handles[handleName];
        ctx.fillRect(h.x, h.y, h.w, h.h);
        ctx.strokeRect(h.x, h.y, h.w, h.h);
    }
}

function drawDimensions() {
    if (!selectionRect) return;
    const text = `${selectionRect.w} x ${selectionRect.h}`;
    const fontSize = 11;
    ctx.font = `bold ${fontSize}px sans-serif`;

    const metrics = ctx.measureText(text);
    const textWidth = metrics.width;
    const textHeight = fontSize;

    let textX = selectionRect.x + selectionRect.w / 2 - textWidth / 2;
    let textY = selectionRect.y - textHeight - 7;

    if (textY < 10) {
        textY = selectionRect.y + selectionRect.h + 5;
    }

    const padding = 3;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(textX - padding, textY - padding, textWidth + padding * 2, textHeight + padding * 2);

    ctx.fillStyle = SELECTION_BORDER_COLOR;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(text, textX, textY);
}



function handleMouseDown(event) {
    if (event.button !== 0) return;

    const pos = { x: event.clientX, y: event.clientY };

    if (event.target !== canvas) {
        if (annotationToolbar.contains(event.target) || actionToolbar.contains(event.target) || event.target === textInput) {
            console.log("Click on UI element, ignoring canvas mousedown.");
            return;
        }
     }
    if (textInputActive && event.target !== textInput) {
        finalizeTextInput();
        return;
    }

    
    resizeHandle = getHandleAtPosition(pos);
    if (resizeHandle) {
        isResizing = true;
        isSelecting = false;
        isDragging = false;
        isDrawing = false;
        startPoint = pos; 
        console.log("Start resize:", resizeHandle);
        updateCursor(pos);
        return;
    }

    
    if (currentTool && selectionRect && isPointInRect(pos, selectionRect)) {
        isDrawing = true;
        isResizing = false;
        isDragging = false;
        isSelecting = false;
        startPoint = { x: pos.x - selectionRect.x, y: pos.y - selectionRect.y }; 

        currentPath = null; 
        tempShape = null;

        if (currentTool === 'pencil') {
            currentPath = { type: 'pencil', color: currentColor, width: 2, points: [startPoint] };
        } else if (currentTool === 'rectangle') {
            tempShape = { type: 'rectangle', color: currentColor, width: 2, rect: { x: startPoint.x, y: startPoint.y, w: 0, h: 0 } };
        } else if (currentTool === 'circle') {
            tempShape = { type: 'circle', color: currentColor, width: 2, rect: { x: startPoint.x, y: startPoint.y, w: 0, h: 0 } };
        } else if (currentTool === 'arrow') {
            tempShape = { type: 'arrow', color: currentColor, width: 2, start: startPoint, end: startPoint };
        } else if (currentTool === 'highlighter') {
            
             tempShape = { type: 'highlighter', color: HIGHLIGHTER_COLOR, width: 15, rect: { x: startPoint.x, y: startPoint.y, w: 0, h: 0 } }; 
        } else if (currentTool === 'text') {
             tempShape = { type: 'temp_rect_preview', rect: { x: startPoint.x, y: startPoint.y, w: 0, h: 0 } };
        }

        console.log("Start drawing:", currentTool);
        updateCursor(pos);
        return;
    }

    
    if (selectionRect && isPointInRect(pos, selectionRect)) {
        
        if (!currentTool) {
            isDragging = true;
            isResizing = false;
            isSelecting = false;
            isDrawing = false;
            dragOffset = { x: pos.x - selectionRect.x, y: pos.y - selectionRect.y };
            console.log("Start drag");
            updateCursor(pos);
            return;
        } else {
            
            
             console.log("Click inside with tool selected, but not drawing/resizing.");
             return;
        }
    }

    
    console.log("Start selection");
    resetSelectionAndAnnotations();
    isSelecting = true;
    isDragging = false;
    isResizing = false;
    isDrawing = false;
    startPoint = pos;
    endPoint = pos;
    selectionRect = null;
    hideToolbars();
    updateCursor(pos);
}

function handleMouseMove(event) {
    const pos = { x: event.clientX, y: event.clientY };

    if (isSelecting) {
        endPoint = pos;
        selectionRect = normalizeRect({
            x: Math.min(startPoint.x, endPoint.x),
            y: Math.min(startPoint.y, endPoint.y),
            w: Math.abs(startPoint.x - endPoint.x),
            h: Math.abs(startPoint.y - endPoint.y)
        });
    } else if (isDragging && selectionRect) {
        let newX = pos.x - dragOffset.x;
        let newY = pos.y - dragOffset.y;
        newX = Math.max(0, Math.min(newX, screenWidth - selectionRect.w));
        newY = Math.max(0, Math.min(newY, screenHeight - selectionRect.h));
        selectionRect.x = newX;
        selectionRect.y = newY;
        updateToolbarPositions();
    } else if (isResizing && selectionRect && resizeHandle) {
        performResize(pos);
        updateToolbarPositions();
    } else if (isDrawing) {
        const currentPointRelative = { x: pos.x - selectionRect.x, y: pos.y - selectionRect.y };

        if (currentTool === 'pencil' && currentPath) {
            currentPath.points.push(currentPointRelative);
        } else if (tempShape) { 
             if (currentTool === 'rectangle' || currentTool === 'circle' || currentTool === 'highlighter' || currentTool === 'text') {
                
                tempShape.rect = normalizeRect({
                    x: Math.min(startPoint.x, currentPointRelative.x),
                    y: Math.min(startPoint.y, currentPointRelative.y),
                    w: Math.abs(startPoint.x - currentPointRelative.x),
                    h: Math.abs(startPoint.y - currentPointRelative.y)
                });
             } else if (currentTool === 'arrow') {
                 
                 tempShape.end = currentPointRelative;
             }
        }
    } else {
        
        if (!textInputActive) {
             updateCursor(pos);
        }
    }
}

function handleMouseUp(event) {
    if (event.button !== 0) return;

    const pos = { x: event.clientX, y: event.clientY };

    if (isSelecting) {
        isSelecting = false;
        if (!selectionRect || selectionRect.w < MIN_SELECTION_SIZE || selectionRect.h < MIN_SELECTION_SIZE) {
            resetSelectionAndAnnotations();
            document.body.style.cursor = 'crosshair'; 
        } else {
            console.log("Selection finished:", selectionRect);
            showToolbars();
            updateCursor(pos);
        }
    } else if (isDragging) {
        isDragging = false;
        console.log("Drag finished");
        updateCursor(pos);
    } else if (isResizing) {
        isResizing = false;
        resizeHandle = null;
        console.log("Resize finished");
        updateCursor(pos);
    } else if (isDrawing) {
        isDrawing = false;
        console.log("Drawing finished for tool:", currentTool);

        let isValidShape = false;
        let createdAnnotation = null;

        if (currentTool === 'pencil' && currentPath && currentPath.points.length > 1) {
            isValidShape = true;
            createdAnnotation = currentPath;
        } else if (tempShape) {
            if ((currentTool === 'rectangle' || currentTool === 'circle' || currentTool === 'highlighter') && tempShape.rect && tempShape.rect.w > 1 && tempShape.rect.h > 1) {
                 isValidShape = true;
                 
                 if (currentTool === 'highlighter') {
                      tempShape.color = HIGHLIGHTER_COLOR; 
                      tempShape.width = tempShape.width || 15; 
                 }
                 createdAnnotation = tempShape;
            } else if (currentTool === 'arrow' && tempShape.start && tempShape.end) {
                const dist = Math.sqrt(Math.pow(tempShape.end.x - tempShape.start.x, 2) + Math.pow(tempShape.end.y - tempShape.start.y, 2));
                if (dist > 5) {
                     isValidShape = true;
                     createdAnnotation = tempShape;
                }
            } else if (currentTool === 'text' && tempShape.rect && tempShape.rect.w > 5 && tempShape.rect.h > 5) {
                createTextInput(tempShape.rect); 
                
            }
        }

        if (isValidShape && createdAnnotation) {
            annotations.push(createdAnnotation);
            console.log("Annotation added:", createdAnnotation);
        } else if (currentTool !== 'text'){
            console.log("Drawing finished but shape was not valid/created.");
        }

        
        currentPath = null;
        tempShape = null;
        updateCursor(pos); 
    }
}


function handleKeyDown(event) {
    if (event.key === 'Escape') {
        console.log("Escape pressed");
        if (textInputActive) {
            cancelTextInput();
        } else {
            cancelCapture();
        }
    }
}

function handleAnnotationToolbarClick(event) {
    const button = event.target.closest('button');
    if (!button) return;

    if (button.id === 'colorButton') {
        colorPicker.click();
    } else {
        const tool = button.dataset.tool;
        if (tool) {
            if (textInputActive) {
                finalizeTextInput();
            }

            if (currentTool === tool) {
                currentTool = null;
                button.classList.remove('selected');
            } else {
                const previousButton = annotationToolbar.querySelector('button.selected');
                if (previousButton) {
                    previousButton.classList.remove('selected');
                }
                currentTool = tool;
                button.classList.add('selected');
            }
            console.log("Tool selected:", currentTool);
            updateCursor(canvas.getBoundingClientRect()); 
        }
    }
}

function handleActionToolbarClick(event) {
    const button = event.target.closest('button');
    if (!button) return;

     if (textInputActive) {
        finalizeTextInput();
        setTimeout(() => { 
             if (button.id === 'saveButton') saveCapture();
             else if (button.id === 'copyButton') copyCapture();
             else if (button.id === 'cancelButton') cancelCapture();
        }, 50);
     } else {
         if (button.id === 'saveButton') saveCapture();
         else if (button.id === 'copyButton') copyCapture();
         else if (button.id === 'cancelButton') cancelCapture();
     }
}

function handleColorChange(event) {
    currentColor = event.target.value;
    updateColorIndicator(currentColor);
    console.log("Color changed:", currentColor);
     if (textInputActive) {
         textInput.style.borderColor = currentColor;
     }
}




function isPointInRect(point, rect) {
    if (!rect) return false;
    return point.x >= rect.x && point.x <= rect.x + rect.w &&
           point.y >= rect.y && point.y <= rect.y + rect.h;
}

function getHandleAtPosition(pos) {
    const handles = getResizeHandles();
    const hs = HANDLE_SIZE;
    for (const name in handles) {
        
        const handleRect = {
             x: handles[name].x - hs/4, y: handles[name].y - hs/4,
             w: handles[name].w + hs/2, h: handles[name].h + hs/2,
        };
        if (isPointInRect(pos, handleRect)) {
            return name;
        }
    }
    return null;
}

function normalizeRect(rect) {
    const newRect = { ...rect };
    if (newRect.w < 0) {
        newRect.x += newRect.w;
        newRect.w *= -1;
    }
    if (newRect.h < 0) {
        newRect.y += newRect.h;
        newRect.h *= -1;
    }
    
    newRect.x = Math.max(0, newRect.x);
    newRect.y = Math.max(0, newRect.y);
    newRect.w = Math.min(screenWidth - newRect.x, newRect.w);
    newRect.h = Math.min(screenHeight - newRect.y, newRect.h);
    return newRect;
}

function performResize(pos) {
    if (!selectionRect || !resizeHandle) return;

    let { x, y, w, h } = selectionRect;
    const originalRight = x + w;
    const originalBottom = y + h;
    let newX = x, newY = y, newW = w, newH = h;

    const currentX = Math.max(0, Math.min(pos.x, screenWidth));
    const currentY = Math.max(0, Math.min(pos.y, screenHeight));

    if (resizeHandle.includes('left')) {
        newX = Math.min(currentX, originalRight - MIN_SELECTION_SIZE);
        newW = originalRight - newX;
    }
    if (resizeHandle.includes('right')) {
        newW = Math.max(MIN_SELECTION_SIZE, currentX - x);
    }
    if (resizeHandle.includes('top')) {
        newY = Math.min(currentY, originalBottom - MIN_SELECTION_SIZE);
        newH = originalBottom - newY;
    }
    if (resizeHandle.includes('bottom')) {
        newH = Math.max(MIN_SELECTION_SIZE, currentY - y);
    }

     if (resizeHandle === 'top_mid') { newX = x; newW = w; }
     if (resizeHandle === 'bottom_mid') { newX = x; newW = w; }
     if (resizeHandle === 'mid_left') { newY = y; newH = h; }
     if (resizeHandle === 'mid_right') { newY = y; newH = h; }

     selectionRect = normalizeRect({ x: newX, y: newY, w: newW, h: newH });
}

function updateCursor(pos) {
    let cursor = 'crosshair'; 

    if (textInputActive) {
        cursor = 'text';
    } else if (isResizing) {
        if (resizeHandle.includes('top') || resizeHandle.includes('bottom')) cursor = 'ns-resize';
        if (resizeHandle.includes('left') || resizeHandle.includes('right')) cursor = 'ew-resize';
        if ((resizeHandle.includes('top') && resizeHandle.includes('left')) || (resizeHandle.includes('bottom') && resizeHandle.includes('right'))) cursor = 'nwse-resize';
        if ((resizeHandle.includes('top') && resizeHandle.includes('right')) || (resizeHandle.includes('bottom') && resizeHandle.includes('left'))) cursor = 'nesw-resize';
    } else if (isDragging) {
        cursor = 'move';
    } else if (isDrawing) {
        cursor = 'crosshair'; 
    } else if (selectionRect) {
        const handle = getHandleAtPosition(pos);
        if (handle) {
            if (handle.includes('top') || handle.includes('bottom')) cursor = 'ns-resize';
            if (handle.includes('left') || handle.includes('right')) cursor = 'ew-resize';
            if ((handle.includes('top') && handle.includes('left')) || (handle.includes('bottom') && handle.includes('right'))) cursor = 'nwse-resize';
            if ((handle.includes('top') && handle.includes('right')) || (handle.includes('bottom') && handle.includes('left'))) cursor = 'nesw-resize';
        } else if (isPointInRect(pos, selectionRect)) {
            cursor = currentTool ? 'crosshair' : 'move'; 
        }
    }
    document.body.style.cursor = cursor;
}




function showToolbars() {
    if (!selectionRect) return;
    updateToolbarPositions();
    annotationToolbar.style.display = 'flex';
    actionToolbar.style.display = 'flex';
}

function hideToolbars() {
    annotationToolbar.style.display = 'none';
    actionToolbar.style.display = 'none';
}

function updateToolbarPositions() {
    if (!selectionRect) return;

    const margin = 8;
    const annoToolbarWidth = annotationToolbar.offsetWidth;
    const annoToolbarHeight = annotationToolbar.offsetHeight;
    let annoX = selectionRect.x + selectionRect.w + margin;
    let annoY = selectionRect.y;

    if (annoX + annoToolbarWidth > screenWidth - margin) {
        annoX = selectionRect.x - annoToolbarWidth - margin;
    }
    annoX = Math.max(margin, annoX);
    annoY = Math.max(margin, Math.min(annoY, screenHeight - annoToolbarHeight - margin));

    annotationToolbar.style.left = `${annoX}px`;
    annotationToolbar.style.top = `${annoY}px`;

    const actToolbarWidth = actionToolbar.offsetWidth;
    const actToolbarHeight = actionToolbar.offsetHeight;
    let actX = selectionRect.x + (selectionRect.w / 2) - (actToolbarWidth / 2);
    let actY = selectionRect.y + selectionRect.h + margin;

    if (actY + actToolbarHeight > screenHeight - margin) {
        actY = selectionRect.y - actToolbarHeight - margin;
    }
    actY = Math.max(margin, actY);
    actX = Math.max(margin, Math.min(actX, screenWidth - actToolbarWidth - margin));

    actionToolbar.style.left = `${actX}px`;
    actionToolbar.style.top = `${actY}px`;
}

function updateColorIndicator(color) {
    colorIndicator.style.backgroundColor = color;
     const rgb = hexToRgb(color);
     const brightness = rgb ? (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000 : 0;
     colorIndicator.style.borderColor = brightness > 128 ? 'black' : 'white';
}

function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : null;
 }


function createTextInput(relativeRect) {
    if (textInputActive) {
        finalizeTextInput();
    }

    const minInputW = 50;
    const minInputH = 25;
    const inputW = Math.max(minInputW, relativeRect.w);
    const inputH = Math.max(minInputH, relativeRect.h);
    const absX = selectionRect.x + relativeRect.x;
    const absY = selectionRect.y + relativeRect.y;
    const fontSize = Math.max(10, Math.min(24, Math.round(inputH * 0.6)));
    const font = `${fontSize}px sans-serif`;

    currentTextInputData = {
        relativeRect: { x: relativeRect.x, y: relativeRect.y, w: inputW, h: inputH },
        font: font
    };

    textInput.style.left = `${absX}px`;
    textInput.style.top = `${absY}px`;
    textInput.style.width = `${inputW}px`;
    textInput.style.height = `${inputH}px`;
    textInput.style.font = font;
    textInput.style.borderColor = currentColor;
    textInput.value = '';
    textInput.style.display = 'block';
    textInput.focus();
    textInputActive = true;
    document.body.style.cursor = 'text';
}

function finalizeTextInput() {
    if (!textInputActive || !currentTextInputData) return;

    const text = textInput.value.trim();

    if (text) {
        annotations.push({
            type: 'text',
            text: text,
            rect: currentTextInputData.relativeRect,
            color: currentColor,
            font: currentTextInputData.font
        });
        console.log("Text annotation added:", annotations[annotations.length - 1]);
    }

    textInput.style.display = 'none';
    textInput.value = '';
    textInputActive = false;
    currentTextInputData = null;
    
    updateCursor({ x: parseInt(textInput.style.left || '0'), y: parseInt(textInput.style.top || '0') });
}


function cancelTextInput() {
     if (!textInputActive) return;
     textInput.style.display = 'none';
     textInput.value = '';
     textInputActive = false;
     currentTextInputData = null;
     console.log("Text input cancelled");
     updateCursor({ x: parseInt(textInput.style.left || '0'), y: parseInt(textInput.style.top || '0') });
}

function handleTextInputBlur(event) {
    const relatedTarget = event.relatedTarget;
    if (!relatedTarget || (!annotationToolbar.contains(relatedTarget) && !actionToolbar.contains(relatedTarget))) {
        
        if (textInputActive) { 
             console.log("Text input blur, finalizing.");
             finalizeTextInput();
        }
    } else {
         console.log("Text input blur, but focus moved to toolbar, not finalizing yet.");
         
         
    }
}

function handleTextInputKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        finalizeTextInput();
    }
    
}




function getFinalCaptureDataURL() {
     if (!selectionRect || !backgroundImage) {
         console.error("Cannot get final capture: Invalid selection or background.");
         return null;
     }
     if (textInputActive) {
         finalizeTextInput(); 
     }

     const outputCanvas = document.createElement('canvas');
     outputCanvas.width = selectionRect.w;
     outputCanvas.height = selectionRect.h;
     const outputCtx = outputCanvas.getContext('2d');

     
     outputCtx.drawImage(
         backgroundImage,
         selectionRect.x, selectionRect.y, selectionRect.w, selectionRect.h,
         0, 0, selectionRect.w, selectionRect.h
     );

     
     outputCtx.save();
     annotations.forEach(anno => drawSingleAnnotationOnContext(outputCtx, anno));
     outputCtx.restore();

     return outputCanvas.toDataURL('image/png');
}


async function saveCapture() {
    const dataURL = getFinalCaptureDataURL();
    if (!dataURL) {
        alert("Error creating capture image.");
        return;
    }

    const timestamp = new Date().toISOString().replace(/[:\-T.]/g, '').slice(0, 15);
    const defaultFilename = `screenshot_${timestamp}.png`;

    console.log("Requesting save dialog...");
    try {
        const result = await window.electronAPI.saveCapture(dataURL, defaultFilename);
        if (result.success) {
            console.log(`Screenshot saved to ${result.path}`);
            window.close();
        } else if (result.cancelled) {
            console.log("Save cancelled by user.");
        } else {
            console.error("Save failed:", result.error);
            alert(`Error saving file: ${result.error}`);
        }
    } catch (error) {
         console.error("IPC saveCapture error:", error);
         alert(`IPC Error saving file: ${error.message}`);
    }
}

async function copyCapture() {
     const dataURL = getFinalCaptureDataURL();
     if (!dataURL) {
         alert("Error creating capture image for copy.");
         return;
     }

    
    try {
        const blob = await (await fetch(dataURL)).blob();
        await navigator.clipboard.write([ new ClipboardItem({ [blob.type]: blob }) ]);
        console.log("Screenshot copied to clipboard using Clipboard API.");
        window.close();
        return;
    } catch (err) {
        console.warn("Clipboard API write failed, falling back to main process:", err);
    }

    
    try {
        const result = await window.electronAPI.copyCapture(dataURL);
        if (result.success) {
            console.log("Screenshot copied to clipboard via main process.");
            window.close();
        } else {
             console.error("Copy via main process failed:", result.error);
             alert(`Error copying to clipboard: ${result.error}`);
        }
    } catch (error) {
        console.error("IPC copyCapture error:", error);
        alert(`IPC Error copying to clipboard: ${error.message}`);
    }
}

function cancelCapture() {
    console.log("Capture cancelled.");
    window.close();
}

function resetSelectionAndAnnotations() {
    selectionRect = null;
    annotations = [];
    currentTool = null;
    const selectedButton = annotationToolbar.querySelector('button.selected');
     if (selectedButton) {
        selectedButton.classList.remove('selected');
    }
    hideToolbars();
    cancelTextInput(); 
    
}



initialize();