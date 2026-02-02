// API endpoint - Railway backend
const API_URL = 'https://web-production-7ec35.up.railway.app';

// Canvas setup
const canvas = document.getElementById('drawCanvas');
const ctx = canvas.getContext('2d');
const clearBtn = document.getElementById('clearBtn');
const canvasOverlay = document.getElementById('canvasOverlay');
const predictedDigit = document.getElementById('predictedDigit');
const confidence = document.getElementById('confidence');
const probBars = document.getElementById('probBars');

let isDrawing = false;
let lastX = 0;
let lastY = 0;
let hasDrawn = false;

// Initialize canvas
function initCanvas() {
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 15;  // Thinner stroke to better match MNIST
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
}

// Initialize probability bars
function initProbBars() {
    probBars.innerHTML = '';
    for (let i = 0; i < 10; i++) {
        const barContainer = document.createElement('div');
        barContainer.className = 'prob-bar-container';
        barContainer.innerHTML = `
            <span class="prob-label">${i}</span>
            <div class="prob-bar-bg">
                <div class="prob-bar" id="prob-${i}"></div>
            </div>
            <span class="prob-value" id="prob-value-${i}">0%</span>
        `;
        probBars.appendChild(barContainer);
    }
}

// Get position from event (mouse or touch)
function getPosition(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    if (e.touches) {
        return {
            x: (e.touches[0].clientX - rect.left) * scaleX,
            y: (e.touches[0].clientY - rect.top) * scaleY
        };
    }
    return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
    };
}

// Drawing functions
function startDrawing(e) {
    e.preventDefault();
    isDrawing = true;
    const pos = getPosition(e);
    lastX = pos.x;
    lastY = pos.y;

    // Hide overlay on first draw
    if (!hasDrawn) {
        canvasOverlay.style.opacity = '0';
        hasDrawn = true;
    }
}

function draw(e) {
    if (!isDrawing) return;
    e.preventDefault();

    const pos = getPosition(e);

    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();

    lastX = pos.x;
    lastY = pos.y;
}

function stopDrawing(e) {
    if (isDrawing) {
        isDrawing = false;
        predict();
    }
}

// Get pixel data from canvas - with proper MNIST preprocessing
function getPixelData() {
    // First, get the image data from the main canvas
    const mainImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const mainPixels = mainImageData.data;

    // Find bounding box of the drawing
    let minX = canvas.width, minY = canvas.height, maxX = 0, maxY = 0;

    for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
            const i = (y * canvas.width + x) * 4;
            const gray = (mainPixels[i] + mainPixels[i + 1] + mainPixels[i + 2]) / 3;
            // If pixel is dark (part of the stroke)
            if (gray < 250) {
                minX = Math.min(minX, x);
                minY = Math.min(minY, y);
                maxX = Math.max(maxX, x);
                maxY = Math.max(maxY, y);
            }
        }
    }

    // Add padding
    const padding = 20;
    minX = Math.max(0, minX - padding);
    minY = Math.max(0, minY - padding);
    maxX = Math.min(canvas.width, maxX + padding);
    maxY = Math.min(canvas.height, maxY + padding);

    const boxWidth = maxX - minX;
    const boxHeight = maxY - minY;

    if (boxWidth <= 0 || boxHeight <= 0) {
        return new Array(784).fill(0);
    }

    // Create offscreen canvas for the cropped digit
    const cropCanvas = document.createElement('canvas');
    const cropSize = Math.max(boxWidth, boxHeight);
    cropCanvas.width = cropSize;
    cropCanvas.height = cropSize;
    const cropCtx = cropCanvas.getContext('2d');

    // Fill with white (MNIST background after inversion will be black)
    cropCtx.fillStyle = 'white';
    cropCtx.fillRect(0, 0, cropSize, cropSize);

    // Center the digit in the square canvas
    const offsetX = (cropSize - boxWidth) / 2;
    const offsetY = (cropSize - boxHeight) / 2;
    cropCtx.drawImage(canvas, minX, minY, boxWidth, boxHeight, offsetX, offsetY, boxWidth, boxHeight);

    // Now scale to 20x20 (MNIST digits are typically 20x20 centered in 28x28)
    const scaleCanvas = document.createElement('canvas');
    scaleCanvas.width = 20;
    scaleCanvas.height = 20;
    const scaleCtx = scaleCanvas.getContext('2d');
    scaleCtx.drawImage(cropCanvas, 0, 0, 20, 20);

    // Create final 28x28 canvas with digit centered
    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = 28;
    finalCanvas.height = 28;
    const finalCtx = finalCanvas.getContext('2d');

    // Fill with white
    finalCtx.fillStyle = 'white';
    finalCtx.fillRect(0, 0, 28, 28);

    // Draw 20x20 digit centered (4 pixel margin on each side)
    finalCtx.drawImage(scaleCanvas, 4, 4);

    // Get pixel data
    const imageData = finalCtx.getImageData(0, 0, 28, 28);
    let pixels = [];

    // Convert to grayscale and invert (MNIST is white digit on black background)
    for (let i = 0; i < imageData.data.length; i += 4) {
        const r = imageData.data[i];
        const g = imageData.data[i + 1];
        const b = imageData.data[i + 2];
        const gray = (r + g + b) / 3;
        // Invert: white canvas (255) -> 0, black stroke (0) -> 255
        pixels.push(255 - gray);
    }

    // Apply simple blur to smooth edges (MNIST has anti-aliased digits)
    pixels = applyBlur(pixels, 28, 28);

    return pixels;
}

// Simple 3x3 gaussian blur to smooth edges
function applyBlur(pixels, width, height) {
    const kernel = [
        [1, 2, 1],
        [2, 4, 2],
        [1, 2, 1]
    ];
    const kernelSum = 16;
    const result = new Array(pixels.length).fill(0);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let sum = 0;
            for (let ky = -1; ky <= 1; ky++) {
                for (let kx = -1; kx <= 1; kx++) {
                    const px = Math.min(Math.max(x + kx, 0), width - 1);
                    const py = Math.min(Math.max(y + ky, 0), height - 1);
                    sum += pixels[py * width + px] * kernel[ky + 1][kx + 1];
                }
            }
            result[y * width + x] = sum / kernelSum;
        }
    }

    return result;
}

// Send prediction request
async function predict() {
    const pixels = getPixelData();

    // Check if canvas is mostly empty
    const sum = pixels.reduce((a, b) => a + b, 0);
    if (sum < 1000) {
        // Canvas is too empty, don't predict
        return;
    }

    try {
        const response = await fetch(`${API_URL}/predict`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ pixels }),
        });

        if (!response.ok) {
            throw new Error('Prediction failed');
        }

        const result = await response.json();
        updateDisplay(result);
    } catch (error) {
        console.error('Prediction error:', error);
        predictedDigit.textContent = '?';
        confidence.textContent = 'Error connecting to server';
    }
}

// Update display with prediction results
function updateDisplay(result) {
    const digit = result.predicted_digit;
    const conf = result.confidence;
    const probs = result.probabilities;

    // Update main prediction
    predictedDigit.textContent = digit;
    predictedDigit.className = 'prediction-digit animate';
    setTimeout(() => predictedDigit.classList.remove('animate'), 200);

    confidence.textContent = `${(conf * 100).toFixed(1)}% confident`;

    // Update probability bars
    for (let i = 0; i < 10; i++) {
        const bar = document.getElementById(`prob-${i}`);
        const value = document.getElementById(`prob-value-${i}`);
        const prob = probs[i];

        bar.style.width = `${prob * 100}%`;
        value.textContent = `${(prob * 100).toFixed(1)}%`;

        // Highlight predicted digit
        bar.parentElement.parentElement.classList.toggle('predicted', i === digit);
    }
}

// Clear canvas
function clearCanvas() {
    initCanvas();
    predictedDigit.textContent = '-';
    confidence.textContent = '';

    // Reset probability bars
    for (let i = 0; i < 10; i++) {
        const bar = document.getElementById(`prob-${i}`);
        const value = document.getElementById(`prob-value-${i}`);
        if (bar) {
            bar.style.width = '0%';
            bar.parentElement.parentElement.classList.remove('predicted');
        }
        if (value) {
            value.textContent = '0%';
        }
    }

    // Show overlay again
    canvasOverlay.style.opacity = '1';
    hasDrawn = false;
}

// Event listeners
canvas.addEventListener('mousedown', startDrawing);
canvas.addEventListener('mousemove', draw);
canvas.addEventListener('mouseup', stopDrawing);
canvas.addEventListener('mouseout', stopDrawing);

canvas.addEventListener('touchstart', startDrawing, { passive: false });
canvas.addEventListener('touchmove', draw, { passive: false });
canvas.addEventListener('touchend', stopDrawing);

clearBtn.addEventListener('click', clearCanvas);

// Initialize
initCanvas();
initProbBars();

// Test API connection
fetch(`${API_URL}/health`)
    .then(r => r.json())
    .then(data => console.log('API connected:', data))
    .catch(err => console.error('API connection failed:', err));
