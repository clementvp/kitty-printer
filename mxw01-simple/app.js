// MXW01 Simple Printer App
// Main application logic

const PRINTER_WIDTH = 384;
const imageWorker = new Worker("image_worker.js");
let printer = null;
let notifyChar = null;
let isConnected = false;

// Update status display
function updateStatus(message, isError = false) {
  const statusEl = document.getElementById("status");
  statusEl.textContent = message;
  statusEl.className = isError ? "error" : "";
  console.log(message);
}

// Connect to MXW01 printer
async function connectPrinter() {
  try {
    updateStatus("Connecting to printer...");

    const device = await navigator.bluetooth.requestDevice({
      filters: [
        { services: ["0000ae30-0000-1000-8000-00805f9b34fb"] },
        { services: ["0000af30-0000-1000-8000-00805f9b34fb"] },
      ],
      optionalServices: ["0000ae30-0000-1000-8000-00805f9b34fb"],
    });

    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(
      "0000ae30-0000-1000-8000-00805f9b34fb",
    );

    const [controlChar, notify, dataChar] = await Promise.all([
      service.getCharacteristic("0000ae01-0000-1000-8000-00805f9b34fb"),
      service.getCharacteristic("0000ae02-0000-1000-8000-00805f9b34fb"),
      service.getCharacteristic("0000ae03-0000-1000-8000-00805f9b34fb"),
    ]);

    notifyChar = notify;

    printer = new MXW01Printer(
      controlChar.writeValueWithoutResponse.bind(controlChar),
      dataChar.writeValueWithoutResponse.bind(dataChar),
    );

    const notifier = (event) => {
      const data = event.target.value;
      printer.notify(new Uint8Array(data.buffer));
    };

    await notifyChar.startNotifications();
    notifyChar.addEventListener("characteristicvaluechanged", notifier);

    isConnected = true;
    updateStatus("✓ Connected to printer");
    document.getElementById("connectBtn").textContent = "Connected";
    document.getElementById("connectBtn").disabled = true;
  } catch (error) {
    updateStatus("Error: " + error.message, true);
    throw error;
  }
}

// Print text
async function printText() {
  if (!isConnected) {
    updateStatus("Please connect to printer first", true);
    return;
  }

  const text = document.getElementById("textInput").value.trim();
  if (!text) {
    updateStatus("Please enter some text", true);
    return;
  }

  try {
    updateStatus("Processing text...");

    // Create canvas for text
    const canvas = document.createElement("canvas");
    canvas.width = PRINTER_WIDTH;
    const ctx = canvas.getContext("2d");

    // Set text style
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, 800);
    ctx.fillStyle = "black";
    ctx.font = "24px Arial";
    ctx.textAlign = "left";

    // Split text into lines
    const lines = text.split("\n");
    const lineHeight = 32;
    canvas.height = lines.length * lineHeight + 20;

    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "black";
    ctx.font = "24px Arial";

    // Draw each line
    let y = 30;
    for (const line of lines) {
      ctx.fillText(line, 10, y);
      y += lineHeight;
    }

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // Process with worker
    await processAndPrint(imageData, canvas.width, canvas.height, "text");
  } catch (error) {
    updateStatus("Print error: " + error.message, true);
  }
}

// Load and print image
async function printImage() {
  if (!isConnected) {
    updateStatus("Please connect to printer first", true);
    return;
  }

  const fileInput = document.getElementById("imageFile");
  const urlInput = document.getElementById("imageUrl").value.trim();
  const dither = document.getElementById("ditherSelect").value;

  let imageUrl = null;

  if (fileInput.files.length > 0) {
    imageUrl = URL.createObjectURL(fileInput.files[0]);
  } else if (urlInput) {
    imageUrl = urlInput;
  } else {
    updateStatus("Please select an image file or enter URL", true);
    return;
  }

  try {
    updateStatus("Loading image...");

    // Load image
    const img = new Image();
    img.crossOrigin = "anonymous";

    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = imageUrl;
    });

    // Resize to fit printer width
    const canvas = document.createElement("canvas");
    const aspectRatio = img.height / img.width;
    canvas.width = PRINTER_WIDTH;
    canvas.height = Math.floor(PRINTER_WIDTH * aspectRatio);

    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // Clean up object URL if created
    if (fileInput.files.length > 0) {
      URL.revokeObjectURL(imageUrl);
    }

    // Process with worker
    await processAndPrint(imageData, canvas.width, canvas.height, dither);
  } catch (error) {
    updateStatus("Print error: " + error.message, true);
  }
}

// Process image with worker and print
async function processAndPrint(imageData, width, height, dither) {
  updateStatus("Processing image...");

  const intensity = parseInt(document.getElementById("intensitySlider").value);

  // Send to worker for processing
  const processId = Date.now();
  imageWorker.postMessage({
    id: processId,
    dither: dither,
    rotate: 0,
    flip: "none",
    brightness: 128,
    data: new Uint32Array(imageData.data.buffer).buffer,
    width: width,
    height: height,
  });

  // Wait for worker result
  const processed = await new Promise((resolve) => {
    const handler = (event) => {
      if (event.data.id === processId) {
        imageWorker.removeEventListener("message", handler);
        resolve(event.data);
      }
    };
    imageWorker.addEventListener("message", handler);
  });

  updateStatus("Converting to printer format...");

  // Convert processed image to boolean rows
  const processedData = new Uint32Array(processed.data);
  const rows = [];

  for (let y = 0; y < processed.height; y++) {
    const row = [];
    for (let x = 0; x < processed.width; x++) {
      const idx = y * processed.width + x;
      const lum = processedData[idx] & 0xff;
      row.push(lum < 128); // true = black
    }
    rows.push(row);
  }

  // Rotate 180° (required for MXW01)
  updateStatus("Rotating image...");
  const rotatedRows = rows.reverse().map((row) => row.slice().reverse());

  // Prepare buffer
  updateStatus("Preparing data...");
  const imageBuffer = prepareImageDataBuffer(rotatedRows);

  // Print
  updateStatus("Printing...");

  await printer.setIntensity(intensity);

  const status = await printer.requestStatus();
  if (status.length >= 13 && status[12] !== 0) {
    throw new Error(`Printer error: ${status[13]}`);
  }

  const ack = await printer.printRequest(rotatedRows.length, 0);
  if (!ack || ack[0] !== 0) {
    throw new Error("Print request rejected");
  }

  await printer.sendDataChunks(imageBuffer);
  await printer.flushData();
  await printer.waitForPrintComplete();

  updateStatus("✓ Print complete!");
}

// Update intensity display
function updateIntensityDisplay() {
  const value = document.getElementById("intensitySlider").value;
  document.getElementById("intensityValue").textContent = value;
}

// Event listeners
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("connectBtn").addEventListener(
    "click",
    connectPrinter,
  );
  document.getElementById("printTextBtn").addEventListener("click", printText);
  document.getElementById("printImageBtn").addEventListener(
    "click",
    printImage,
  );
  document.getElementById("intensitySlider").addEventListener(
    "input",
    updateIntensityDisplay,
  );

  updateIntensityDisplay();
  updateStatus("Ready. Click 'Connect Printer' to start.");
});
