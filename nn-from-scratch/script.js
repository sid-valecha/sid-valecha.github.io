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
    ctx.lineWidth = 20;
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

// Get pixel data from canvas
function getPixelData() {
    // Create offscreen canvas at 28x28
    const offscreen = document.createElement('canvas');
    offscreen.width = 28;
    offscreen.height = 28;
    const offCtx = offscreen.getContext('2d');

    // Draw scaled down version
    offCtx.drawImage(canvas, 0, 0, 28, 28);

    // Get pixel data
    const imageData = offCtx.getImageData(0, 0, 28, 28);
    const pixels = [];

    // Convert to grayscale and invert (MNIST is white digit on black background)
    for (let i = 0; i < imageData.data.length; i += 4) {
        const r = imageData.data[i];
        const g = imageData.data[i + 1];
        const b = imageData.data[i + 2];
        const gray = (r + g + b) / 3;
        // Invert: white canvas (255) -> 0, black stroke (0) -> 255
        pixels.push(255 - gray);
    }

    return pixels;
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
