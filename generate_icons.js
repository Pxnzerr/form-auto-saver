const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    if (c & 1) {
      c = 0xedb88320 ^ (c >>> 1);
    } else {
      c = c >>> 1;
    }
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createChunk(type, data) {
  const length = data.length;
  const chunk = Buffer.alloc(8 + length + 4);
  chunk.writeUInt32BE(length, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  const typeAndData = chunk.subarray(4, 8 + length);
  const crc = crc32(typeAndData);
  chunk.writeUInt32BE(crc, 8 + length);
  return chunk;
}

function createPng(width, height, pixelFn) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const ihdrChunk = createChunk('IHDR', ihdr);

  const rawScanlines = Buffer.alloc(height * (1 + width * 4));
  let offset = 0;

  for (let y = 0; y < height; y++) {
    rawScanlines[offset++] = 0;
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixelFn(x, y, width, height);
      rawScanlines[offset++] = r;
      rawScanlines[offset++] = g;
      rawScanlines[offset++] = b;
      rawScanlines[offset++] = a;
    }
  }

  const compressed = zlib.deflateSync(rawScanlines);
  const idatChunk = createChunk('IDAT', compressed);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function drawMonochromeIconPixel(x, y, w, h) {
  const cx = w / 2;
  const cy = h / 2;
  const cornerRadius = w * 0.22;

  const dx = Math.max(0, Math.abs(x + 0.5 - cx) - (cx - cornerRadius));
  const dy = Math.max(0, Math.abs(y + 0.5 - cy) - (cy - cornerRadius));
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist > cornerRadius) {
    return [0, 0, 0, 0];
  }

  const bgR = 15;
  const bgG = 15;
  const bgB = 18;

  const nx = (x + 0.5) / w;
  const ny = (y + 0.5) / h;

  if (dist >= cornerRadius - 1.2 || x <= 1 || x >= w - 2 || y <= 1 || y >= h - 2) {
    return [60, 60, 65, 255];
  }

  if (nx >= 0.22 && nx <= 0.78 && ny >= 0.22 && ny <= 0.78) {
    if (nx > 0.65 && ny < 0.35 && (nx - 0.65) + (0.35 - ny) > 0.12) {
      return [bgR, bgG, bgB, 255];
    }

    if (nx >= 0.34 && nx <= 0.66 && ny >= 0.28 && ny <= 0.46) {
      if (nx >= 0.50 && nx <= 0.58 && ny >= 0.31 && ny <= 0.43) {
        return [15, 15, 18, 255];
      }
      return [200, 200, 205, 255];
    }

    if (nx >= 0.30 && nx <= 0.70 && ny >= 0.54 && ny <= 0.74) {
      if (ny >= 0.58 && ny <= 0.61 && nx >= 0.35 && nx <= 0.65) {
        return [20, 20, 24, 255];
      }
      if (ny >= 0.65 && ny <= 0.68 && nx >= 0.35 && nx <= 0.55) {
        return [90, 90, 95, 255];
      }
      return [255, 255, 255, 255];
    }

    return [255, 255, 255, 255];
  }

  return [bgR, bgG, bgB, 255];
}

const iconsDir = path.join(__dirname, 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

const sizes = [16, 32, 48, 128];
for (const size of sizes) {
  const pngBuffer = createPng(size, size, drawMonochromeIconPixel);
  const filePath = path.join(iconsDir, `icon${size}.png`);
  fs.writeFileSync(filePath, pngBuffer);
}
