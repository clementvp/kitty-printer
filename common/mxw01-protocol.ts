// No rights reserved to this file
// MXW01 Thermal Printer Protocol Implementation
// Based on working implementation from dropalltables/catprinter

const crc8_table = [
  0x00,
  0x07,
  0x0e,
  0x09,
  0x1c,
  0x1b,
  0x12,
  0x15,
  0x38,
  0x3f,
  0x36,
  0x31,
  0x24,
  0x23,
  0x2a,
  0x2d,
  0x70,
  0x77,
  0x7e,
  0x79,
  0x6c,
  0x6b,
  0x62,
  0x65,
  0x48,
  0x4f,
  0x46,
  0x41,
  0x54,
  0x53,
  0x5a,
  0x5d,
  0xe0,
  0xe7,
  0xee,
  0xe9,
  0xfc,
  0xfb,
  0xf2,
  0xf5,
  0xd8,
  0xdf,
  0xd6,
  0xd1,
  0xc4,
  0xc3,
  0xca,
  0xcd,
  0x90,
  0x97,
  0x9e,
  0x99,
  0x8c,
  0x8b,
  0x82,
  0x85,
  0xa8,
  0xaf,
  0xa6,
  0xa1,
  0xb4,
  0xb3,
  0xba,
  0xbd,
  0xc7,
  0xc0,
  0xc9,
  0xce,
  0xdb,
  0xdc,
  0xd5,
  0xd2,
  0xff,
  0xf8,
  0xf1,
  0xf6,
  0xe3,
  0xe4,
  0xed,
  0xea,
  0xb7,
  0xb0,
  0xb9,
  0xbe,
  0xab,
  0xac,
  0xa5,
  0xa2,
  0x8f,
  0x88,
  0x81,
  0x86,
  0x93,
  0x94,
  0x9d,
  0x9a,
  0x27,
  0x20,
  0x29,
  0x2e,
  0x3b,
  0x3c,
  0x35,
  0x32,
  0x1f,
  0x18,
  0x11,
  0x16,
  0x03,
  0x04,
  0x0d,
  0x0a,
  0x57,
  0x50,
  0x59,
  0x5e,
  0x4b,
  0x4c,
  0x45,
  0x42,
  0x6f,
  0x68,
  0x61,
  0x66,
  0x73,
  0x74,
  0x7d,
  0x7a,
  0x89,
  0x8e,
  0x87,
  0x80,
  0x95,
  0x92,
  0x9b,
  0x9c,
  0xb1,
  0xb6,
  0xbf,
  0xb8,
  0xad,
  0xaa,
  0xa3,
  0xa4,
  0xf9,
  0xfe,
  0xf7,
  0xf0,
  0xe5,
  0xe2,
  0xeb,
  0xec,
  0xc1,
  0xc6,
  0xcf,
  0xc8,
  0xdd,
  0xda,
  0xd3,
  0xd4,
  0x69,
  0x6e,
  0x67,
  0x60,
  0x75,
  0x72,
  0x7b,
  0x7c,
  0x51,
  0x56,
  0x5f,
  0x58,
  0x4d,
  0x4a,
  0x43,
  0x44,
  0x19,
  0x1e,
  0x17,
  0x10,
  0x05,
  0x02,
  0x0b,
  0x0c,
  0x21,
  0x26,
  0x2f,
  0x28,
  0x3d,
  0x3a,
  0x33,
  0x34,
  0x4e,
  0x49,
  0x40,
  0x47,
  0x52,
  0x55,
  0x5c,
  0x5b,
  0x76,
  0x71,
  0x78,
  0x7f,
  0x6a,
  0x6d,
  0x64,
  0x63,
  0x3e,
  0x39,
  0x30,
  0x37,
  0x22,
  0x25,
  0x2c,
  0x2b,
  0x06,
  0x01,
  0x08,
  0x0f,
  0x1a,
  0x1d,
  0x14,
  0x13,
  0xae,
  0xa9,
  0xa0,
  0xa7,
  0xb2,
  0xb5,
  0xbc,
  0xbb,
  0x96,
  0x91,
  0x98,
  0x9f,
  0x8a,
  0x8d,
  0x84,
  0x83,
  0xde,
  0xd9,
  0xd0,
  0xd7,
  0xc2,
  0xc5,
  0xcc,
  0xcb,
  0xe6,
  0xe1,
  0xe8,
  0xef,
  0xfa,
  0xfd,
  0xf4,
  0xf3,
];

function crc8(data: Uint8Array) {
  let crc = 0;
  for (const byte of data) {
    crc = crc8_table[(crc ^ byte) & 0xff];
  }
  return crc & 0xff;
}

function delay(msecs: number) {
  return new Promise<void>((resolve) => setTimeout(() => resolve(), msecs));
}

export const PRINTER_WIDTH = 384;
export const PRINTER_WIDTH_BYTES = PRINTER_WIDTH / 8; // 48 bytes
export const MIN_DATA_BYTES = 90 * PRINTER_WIDTH_BYTES; // 4320 bytes minimum

export enum Command {
  GetStatus = 0xa1,
  SetIntensity = 0xa2,
  PrintRequest = 0xa9,
  FlushData = 0xad,
  PrintComplete = 0xaa,
}

export interface PrinterState {
  printing: boolean;
  paper_jam: boolean;
  out_of_paper: boolean;
  cover_open: boolean;
  battery_low: boolean;
  overheat: boolean;
}

export class MXW01Printer {
  state: PrinterState;
  printComplete: boolean = false;
  pendingResolvers: Map<number, (payload: Uint8Array) => void> = new Map();

  constructor(
    public controlWrite: (command: Uint8Array) => Promise<void>,
    public dataWrite: (data: Uint8Array) => Promise<void>,
    public dry_run?: boolean,
  ) {
    this.state = {
      printing: false,
      paper_jam: false,
      out_of_paper: false,
      cover_open: false,
      battery_low: false,
      overheat: false,
    };
  }

  notify = (message: Uint8Array) => {
    if (message[0] !== 0x22 || message[1] !== 0x21) {
      console.warn("Ignoring unexpected notification format");
      return;
    }

    const cmdId = message[2];
    const len = message[4] | (message[5] << 8);
    const payload = message.slice(6, 6 + len);

    // Check for print complete notification
    if (cmdId === Command.PrintComplete) {
      this.printComplete = true;
    }

    // Parse printer state from status response
    if (cmdId === Command.GetStatus && payload.length >= 7) {
      const statusByte = payload[6];
      this.state = {
        printing: (statusByte & 0x01) !== 0,
        paper_jam: (statusByte & 0x02) !== 0,
        out_of_paper: (statusByte & 0x04) !== 0,
        cover_open: (statusByte & 0x08) !== 0,
        battery_low: (statusByte & 0x10) !== 0,
        overheat: (statusByte & 0x20) !== 0,
      };
    }

    // Resolve any pending promise for this command
    const resolver = this.pendingResolvers.get(cmdId);
    if (resolver) {
      resolver(payload);
      this.pendingResolvers.delete(cmdId);
    }
  };

  makeCommand(command: Command, payload: Uint8Array) {
    const len = payload.length;
    const header = new Uint8Array([
      0x22,
      0x21,
      command,
      0x00,
      len & 0xff,
      (len >> 8) & 0xff,
    ]);

    // Concatenate header and payload
    const cmdWithPayload = new Uint8Array(header.length + payload.length);
    cmdWithPayload.set(header);
    cmdWithPayload.set(payload, header.length);

    // Calculate CRC on payload only
    const crcValue = crc8(payload);

    // Final command: header + payload + CRC + 0xFF
    const result = new Uint8Array(cmdWithPayload.length + 2);
    result.set(cmdWithPayload);
    result[result.length - 2] = crcValue;
    result[result.length - 1] = 0xff;

    return result;
  }

  waitForNotification(cmdId: number, timeoutMs: number = 10000) {
    return new Promise<Uint8Array>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingResolvers.delete(cmdId);
        reject(
          new Error(`Timeout waiting for notification 0x${cmdId.toString(16)}`),
        );
      }, timeoutMs);

      this.pendingResolvers.set(cmdId, (payload: Uint8Array) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });
  }

  async setIntensity(intensity: number = 0x5d) {
    // Send 1 byte only for intensity
    const command = this.makeCommand(
      Command.SetIntensity,
      Uint8Array.of(intensity),
    );
    await this.controlWrite(command);
    await delay(50);
  }

  async requestStatus() {
    const command = this.makeCommand(
      Command.GetStatus,
      Uint8Array.of(0x00),
    );
    await this.controlWrite(command);
    return this.waitForNotification(Command.GetStatus, 5000);
  }

  async printRequest(lines: number, mode: number = 0) {
    // Send 4 bytes: lines_low, lines_high, 0x30, mode
    const payload = new Uint8Array(4);
    payload[0] = lines & 0xff;
    payload[1] = (lines >> 8) & 0xff;
    payload[2] = 0x30;
    payload[3] = mode;

    const command = this.makeCommand(Command.PrintRequest, payload);
    await this.controlWrite(command);
    return this.waitForNotification(Command.PrintRequest, 5000);
  }

  async flushData() {
    const command = this.makeCommand(Command.FlushData, Uint8Array.of(0x00));
    await this.controlWrite(command);
    await delay(50);
  }

  async sendDataChunks(
    data: Uint8Array,
    chunkSize: number = PRINTER_WIDTH_BYTES,
  ) {
    // Send data in chunks (48 bytes per chunk = 1 line)
    let pos = 0;
    while (pos < data.length) {
      const chunk = data.slice(pos, Math.min(pos + chunkSize, data.length));
      await this.dataWrite(chunk);
      pos += chunk.length;
      // Small delay to prevent buffer overrun
      await delay(15);
    }
  }

  async waitForPrintComplete(timeoutMs: number = 20000) {
    this.printComplete = false;
    const startTime = Date.now();

    while (!this.printComplete && (Date.now() - startTime) < timeoutMs) {
      await delay(100);
    }

    if (!this.printComplete) {
      throw new Error("Print timeout: Did not receive completion notification");
    }
  }
}

// Helper function to encode a row of boolean pixels
export function encode1bppRow(rowBool: boolean[]): Uint8Array {
  if (rowBool.length !== PRINTER_WIDTH) {
    throw new Error(
      `Row length must be ${PRINTER_WIDTH}, got ${rowBool.length}`,
    );
  }

  const rowBytes = new Uint8Array(PRINTER_WIDTH_BYTES);
  for (let byteIndex = 0; byteIndex < PRINTER_WIDTH_BYTES; byteIndex++) {
    let byteVal = 0;
    for (let bit = 0; bit < 8; bit++) {
      if (rowBool[byteIndex * 8 + bit]) {
        byteVal |= 1 << bit;
      }
    }
    rowBytes[byteIndex] = byteVal;
  }

  return rowBytes;
}

// Prepare image data buffer with padding
export function prepareImageDataBuffer(imageRowsBool: boolean[][]): Uint8Array {
  const height = imageRowsBool.length;
  let buffer = new Uint8Array(0);

  for (let y = 0; y < height; y++) {
    const rowBytes = encode1bppRow(imageRowsBool[y]);
    const newBuf = new Uint8Array(buffer.length + rowBytes.length);
    newBuf.set(buffer);
    newBuf.set(rowBytes, buffer.length);
    buffer = newBuf;
  }

  // Pad to minimum size if needed
  if (buffer.length < MIN_DATA_BYTES) {
    const pad = new Uint8Array(MIN_DATA_BYTES - buffer.length);
    const newBuf = new Uint8Array(buffer.length + pad.length);
    newBuf.set(buffer);
    newBuf.set(pad, buffer.length);
    buffer = newBuf;
  }

  return buffer;
}
