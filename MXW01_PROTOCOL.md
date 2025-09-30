# Documentation du Protocole MXW01

Documentation complète du protocole d'impression pour l'imprimante thermique
MXW01.

## Table des matières

- [Vue d'ensemble](#vue-densemble)
- [Constantes](#constantes)
- [Commandes](#commandes)
- [Classe MXW01Printer](#classe-mxw01printer)
  - [Constructeur](#constructeur)
  - [Méthodes](#méthodes)
- [Fonctions utilitaires](#fonctions-utilitaires)
- [Exemple d'utilisation complète](#exemple-dutilisation-complète)

---

## Vue d'ensemble

Le protocole MXW01 utilise Bluetooth LE pour communiquer avec l'imprimante
thermique. Chaque commande suit le format :

```
0x22 0x21 [CMD] 0x00 [LEN_L] [LEN_H] [PAYLOAD...] [CRC8] 0xFF
```

- **0x22 0x21** : En-tête de commande
- **CMD** : Code de la commande
- **0x00** : Réservé
- **LEN_L, LEN_H** : Longueur du payload (little-endian)
- **PAYLOAD** : Données de la commande
- **CRC8** : Checksum du payload
- **0xFF** : Fin de commande

---

## Constantes

### PRINTER_WIDTH

```typescript
export const PRINTER_WIDTH = 384;
```

**Description** : Largeur de l'imprimante en pixels.

### PRINTER_WIDTH_BYTES

```typescript
export const PRINTER_WIDTH_BYTES = PRINTER_WIDTH / 8; // 48 bytes
```

**Description** : Largeur de l'imprimante en bytes (48 bytes par ligne).

### MIN_DATA_BYTES

```typescript
export const MIN_DATA_BYTES = 90 * PRINTER_WIDTH_BYTES; // 4320 bytes
```

**Description** : Taille minimale de données à envoyer (90 lignes minimum).

---

## Commandes

### Enum Command

```typescript
export enum Command {
  GetStatus = 0xa1, // Demander le statut de l'imprimante
  SetIntensity = 0xa2, // Définir l'intensité d'impression
  PrintRequest = 0xa9, // Requête d'impression
  FlushData = 0xad, // Flush des données
  PrintComplete = 0xaa, // Notification de fin d'impression
}
```

---

## Classe MXW01Printer

### Constructeur

```typescript
constructor(
  public controlWrite: (command: Uint8Array) => Promise<void>,
  public dataWrite: (data: Uint8Array) => Promise<void>,
  public dry_run?: boolean,
)
```

**Paramètres** :

- `controlWrite` : Fonction pour écrire des commandes sur la caractéristique de
  contrôle
- `dataWrite` : Fonction pour écrire des données sur la caractéristique de
  données
- `dry_run` : (Optionnel) Mode test sans impression réelle

**Exemple** :

```typescript
const printer = new MXW01Printer(
  controlChar.writeValueWithoutResponse.bind(controlChar),
  dataChar.writeValueWithoutResponse.bind(dataChar),
  false,
);
```

---

### Méthodes

#### setIntensity()

```typescript
async setIntensity(intensity: number = 0x5d): Promise<void>
```

**Description** : Définit l'intensité d'impression (obscurité).

**Paramètres** :

- `intensity` : Valeur d'intensité (0x00 à 0xFF, défaut : 0x5D = 93)
  - Valeurs basses = impression claire
  - Valeurs hautes = impression foncée

**Exemple** :

```typescript
await printer.setIntensity(0x5d); // Intensité moyenne
await printer.setIntensity(0x80); // Intensité élevée
```

---

#### requestStatus()

```typescript
async requestStatus(): Promise<Uint8Array>
```

**Description** : Demande le statut de l'imprimante et attend la réponse.

**Retour** :

- `Uint8Array` : Payload de la réponse contenant l'état de l'imprimante

**Exemple** :

```typescript
const statusPayload = await printer.requestStatus();

// Vérifier les erreurs
if (statusPayload.length >= 13 && statusPayload[12] !== 0) {
  const errCode = statusPayload[13];
  console.error(`Erreur imprimante: ${errCode}`);
}

// Accéder à l'état via printer.state
console.log("État:", printer.state);
// {
//   printing: false,
//   paper_jam: false,
//   out_of_paper: false,
//   cover_open: false,
//   battery_low: false,
//   overheat: false
// }
```

---

#### printRequest()

```typescript
async printRequest(lines: number, mode: number = 0): Promise<Uint8Array>
```

**Description** : Envoie une requête d'impression avec le nombre de lignes à
imprimer.

**Paramètres** :

- `lines` : Nombre de lignes à imprimer
- `mode` : Mode d'impression (défaut : 0)

**Retour** :

- `Uint8Array` : Payload de l'ACK (acknowledgment)
  - `[0]` devrait être 0 si accepté

**Exemple** :

```typescript
const height = 200; // 200 lignes
const printAck = await printer.printRequest(height, 0);

if (!printAck || printAck[0] !== 0) {
  throw new Error("Requête d'impression rejetée");
}
```

---

#### flushData()

```typescript
async flushData(): Promise<void>
```

**Description** : Envoie la commande de flush pour indiquer la fin du transfert
de données.

**Exemple** :

```typescript
await printer.flushData();
```

---

#### sendDataChunks()

```typescript
async sendDataChunks(
  data: Uint8Array,
  chunkSize: number = PRINTER_WIDTH_BYTES
): Promise<void>
```

**Description** : Envoie les données d'impression par chunks.

**Paramètres** :

- `data` : Buffer de données d'image à imprimer
- `chunkSize` : Taille des chunks (défaut : 48 bytes = 1 ligne)

**Exemple** :

```typescript
// Envoyer l'image
await printer.sendDataChunks(imageBuffer);

// Ou avec une taille de chunk personnalisée
await printer.sendDataChunks(imageBuffer, 96); // 2 lignes à la fois
```

---

#### waitForPrintComplete()

```typescript
async waitForPrintComplete(timeoutMs: number = 20000): Promise<void>
```

**Description** : Attend la notification de fin d'impression (0xAA).

**Paramètres** :

- `timeoutMs` : Timeout en millisecondes (défaut : 20000 = 20 secondes)

**Erreur** : Lance une erreur si le timeout est atteint.

**Exemple** :

```typescript
try {
  await printer.waitForPrintComplete(30000); // 30 secondes max
  console.log("Impression terminée !");
} catch (error) {
  console.error("Timeout:", error);
}
```

---

#### notify()

```typescript
notify(message: Uint8Array): void
```

**Description** : Gestionnaire de notifications Bluetooth. À appeler dans
l'event listener.

**Paramètres** :

- `message` : Message de notification reçu

**Exemple** :

```typescript
const notifier = (event: Event) => {
  const data = event.target.value;
  const message = new Uint8Array(data.buffer);
  printer.notify(message);
};

notifyChar.addEventListener("characteristicvaluechanged", notifier);
```

---

#### makeCommand()

```typescript
makeCommand(command: Command, payload: Uint8Array): Uint8Array
```

**Description** : Crée une commande formatée pour l'imprimante.

**Paramètres** :

- `command` : Code de commande (enum Command)
- `payload` : Données de la commande

**Retour** :

- `Uint8Array` : Commande complète formatée

**Exemple** :

```typescript
// Créer une commande de statut
const cmd = printer.makeCommand(
  Command.GetStatus,
  Uint8Array.of(0x00),
);
// Résultat: [0x22, 0x21, 0xa1, 0x00, 0x01, 0x00, 0x00, CRC, 0xff]
```

---

## Fonctions utilitaires

### encode1bppRow()

```typescript
export function encode1bppRow(rowBool: boolean[]): Uint8Array;
```

**Description** : Encode une ligne de pixels booléens en bytes (format 1-bit).

**Paramètres** :

- `rowBool` : Tableau de 384 booléens (true = noir, false = blanc)

**Retour** :

- `Uint8Array` : 48 bytes représentant la ligne

**Erreur** : Lance une erreur si la longueur n'est pas 384.

**Exemple** :

```typescript
// Créer une ligne noire
const blackRow = new Array(PRINTER_WIDTH).fill(true);
const encodedRow = encode1bppRow(blackRow);
// encodedRow.length === 48

// Créer une ligne blanche
const whiteRow = new Array(PRINTER_WIDTH).fill(false);
const encodedRow2 = encode1bppRow(whiteRow);
```

---

### prepareImageDataBuffer()

```typescript
export function prepareImageDataBuffer(imageRowsBool: boolean[][]): Uint8Array;
```

**Description** : Prépare le buffer complet d'image avec padding minimum.

**Paramètres** :

- `imageRowsBool` : Tableau 2D de booléens [ligne][colonne]

**Retour** :

- `Uint8Array` : Buffer d'image avec padding (minimum 4320 bytes)

**Exemple** :

```typescript
// Créer une image de 100 lignes
const rows = [];
for (let y = 0; y < 100; y++) {
  const row = new Array(PRINTER_WIDTH).fill(false);
  // Dessiner quelque chose...
  rows.push(row);
}

const imageBuffer = prepareImageDataBuffer(rows);
console.log(`Buffer size: ${imageBuffer.length} bytes`);
// Buffer size: 4800 bytes (100 * 48, avec padding à 4320 minimum)
```

---

## Exemple d'utilisation complète

```typescript
import {
  MXW01Printer,
  prepareImageDataBuffer,
  PRINTER_WIDTH,
} from "./mxw01-protocol.ts";

async function printImage() {
  // 1. Connexion Bluetooth
  const device = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: ["0000ae30-0000-1000-8000-00805f9b34fb"],
  });

  const server = await device.gatt.connect();
  const service = await server.getPrimaryService(
    "0000ae30-0000-1000-8000-00805f9b34fb",
  );

  // 2. Obtenir les caractéristiques
  const [controlChar, notifyChar, dataChar] = await Promise.all([
    service.getCharacteristic("0000ae01-0000-1000-8000-00805f9b34fb"),
    service.getCharacteristic("0000ae02-0000-1000-8000-00805f9b34fb"),
    service.getCharacteristic("0000ae03-0000-1000-8000-00805f9b34fb"),
  ]);

  // 3. Créer l'instance du printer
  const printer = new MXW01Printer(
    controlChar.writeValueWithoutResponse.bind(controlChar),
    dataChar.writeValueWithoutResponse.bind(dataChar),
  );

  // 4. Configurer les notifications
  const notifier = (event) => {
    const data = event.target.value;
    printer.notify(new Uint8Array(data.buffer));
  };

  await notifyChar.startNotifications();
  notifyChar.addEventListener("characteristicvaluechanged", notifier);

  // 5. Préparer l'image (exemple : damier)
  const rows = [];
  for (let y = 0; y < 200; y++) {
    const row = new Array(PRINTER_WIDTH).fill(false);
    for (let x = 0; x < PRINTER_WIDTH; x++) {
      // Damier 10x10
      row[x] = (Math.floor(x / 10) + Math.floor(y / 10)) % 2 === 0;
    }
    rows.push(row);
  }

  // Rotation 180° (inverse lignes et colonnes)
  const rotatedRows = rows.reverse().map((row) => row.slice().reverse());
  const imageBuffer = prepareImageDataBuffer(rotatedRows);

  // 6. Workflow d'impression
  try {
    // a) Définir l'intensité
    await printer.setIntensity(0x5d);

    // b) Vérifier le statut
    const status = await printer.requestStatus();
    if (status.length >= 13 && status[12] !== 0) {
      throw new Error(`Erreur imprimante: ${status[13]}`);
    }

    // c) Requête d'impression
    const ack = await printer.printRequest(rows.length, 0);
    if (!ack || ack[0] !== 0) {
      throw new Error("Requête rejetée");
    }

    // d) Envoyer les données
    await printer.sendDataChunks(imageBuffer);

    // e) Flush
    await printer.flushData();

    // f) Attendre la fin
    await printer.waitForPrintComplete();

    console.log("✓ Impression réussie !");
  } finally {
    await notifyChar.stopNotifications();
    server.disconnect();
  }
}

// Lancer l'impression
printImage().catch(console.error);
```

---

## Notes importantes

1. **Rotation 180°** : Les images doivent être tournées à 180° avant
   l'impression (inverse lignes ET colonnes)
2. **Padding minimum** : Toujours envoyer au moins 4320 bytes (90 lignes)
3. **Chunks de 48 bytes** : Envoyer les données ligne par ligne (48 bytes = 1
   ligne)
4. **Délai entre chunks** : 15ms recommandé pour éviter le débordement de buffer
5. **Attendre les ACK** : Toujours attendre la réponse après chaque commande
   critique
6. **Gestion d'erreurs** : Vérifier le statut de l'imprimante avant d'imprimer

---

## Exemples pratiques

### Exemple 1 : Imprimer du texte

```typescript
import {
  MXW01Printer,
  prepareImageDataBuffer,
  PRINTER_WIDTH,
} from "./mxw01-protocol.ts";

async function printText(text: string, fontSize: number = 24) {
  // 1. Connexion Bluetooth
  const device = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: ["0000ae30-0000-1000-8000-00805f9b34fb"],
  });

  const server = await device.gatt.connect();
  const service = await server.getPrimaryService(
    "0000ae30-0000-1000-8000-00805f9b34fb",
  );

  const [controlChar, notifyChar, dataChar] = await Promise.all([
    service.getCharacteristic("0000ae01-0000-1000-8000-00805f9b34fb"),
    service.getCharacteristic("0000ae02-0000-1000-8000-00805f9b34fb"),
    service.getCharacteristic("0000ae03-0000-1000-8000-00805f9b34fb"),
  ]);

  const printer = new MXW01Printer(
    controlChar.writeValueWithoutResponse.bind(controlChar),
    dataChar.writeValueWithoutResponse.bind(dataChar),
  );

  // 2. Configurer les notifications
  const notifier = (event) => {
    const data = event.target.value;
    printer.notify(new Uint8Array(data.buffer));
  };

  await notifyChar.startNotifications();
  notifyChar.addEventListener("characteristicvaluechanged", notifier);

  try {
    // 3. Créer un canvas pour dessiner le texte
    const canvas = document.createElement("canvas");
    canvas.width = PRINTER_WIDTH;
    canvas.height = 800; // Hauteur temporaire

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Cannot get canvas context");

    // 4. Dessiner le texte sur le canvas
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "black";
    ctx.font = `${fontSize}px Arial`;
    ctx.textAlign = "center";

    // Découper le texte en lignes si nécessaire
    const words = text.split(" ");
    const lines: string[] = [];
    let currentLine = "";

    for (const word of words) {
      const testLine = currentLine + (currentLine ? " " : "") + word;
      const metrics = ctx.measureText(testLine);
      if (metrics.width > PRINTER_WIDTH - 20 && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);

    // Dessiner chaque ligne
    let y = fontSize + 10;
    for (const line of lines) {
      ctx.fillText(line, PRINTER_WIDTH / 2, y);
      y += fontSize + 5;
    }

    // Ajuster la hauteur du canvas
    const actualHeight = Math.min(y + 20, canvas.height);
    const imageData = ctx.getImageData(0, 0, PRINTER_WIDTH, actualHeight);

    // 5. Convertir en booléens (noir/blanc)
    const rows: boolean[][] = [];
    for (let y = 0; y < actualHeight; y++) {
      const row = new Array(PRINTER_WIDTH).fill(false);
      for (let x = 0; x < PRINTER_WIDTH; x++) {
        const idx = (y * PRINTER_WIDTH + x) * 4;
        const r = imageData.data[idx];
        const g = imageData.data[idx + 1];
        const b = imageData.data[idx + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        row[x] = lum < 128; // true = noir
      }
      rows.push(row);
    }

    // 6. Rotation 180°
    const rotatedRows = rows.reverse().map((row) => row.slice().reverse());
    const imageBuffer = prepareImageDataBuffer(rotatedRows);

    // 7. Workflow d'impression
    await printer.setIntensity(0x5d);

    const status = await printer.requestStatus();
    if (status.length >= 13 && status[12] !== 0) {
      throw new Error(`Erreur imprimante: ${status[13]}`);
    }

    const ack = await printer.printRequest(rotatedRows.length, 0);
    if (!ack || ack[0] !== 0) {
      throw new Error("Requête d'impression rejetée");
    }

    await printer.sendDataChunks(imageBuffer);
    await printer.flushData();
    await printer.waitForPrintComplete();

    console.log("✓ Texte imprimé avec succès !");
  } finally {
    await notifyChar.stopNotifications();
    server.disconnect();
  }
}

// Utilisation
printText("Bonjour le monde!\nCeci est un test d'impression.", 32);
```

### Exemple 2 : Imprimer une image

```typescript
import {
  MXW01Printer,
  prepareImageDataBuffer,
  PRINTER_WIDTH,
} from "./mxw01-protocol.ts";

async function printImageFromUrl(imageUrl: string) {
  // 1. Connexion Bluetooth
  const device = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: ["0000ae30-0000-1000-8000-00805f9b34fb"],
  });

  const server = await device.gatt.connect();
  const service = await server.getPrimaryService(
    "0000ae30-0000-1000-8000-00805f9b34fb",
  );

  const [controlChar, notifyChar, dataChar] = await Promise.all([
    service.getCharacteristic("0000ae01-0000-1000-8000-00805f9b34fb"),
    service.getCharacteristic("0000ae02-0000-1000-8000-00805f9b34fb"),
    service.getCharacteristic("0000ae03-0000-1000-8000-00805f9b34fb"),
  ]);

  const printer = new MXW01Printer(
    controlChar.writeValueWithoutResponse.bind(controlChar),
    dataChar.writeValueWithoutResponse.bind(dataChar),
  );

  // 2. Configurer les notifications
  const notifier = (event) => {
    const data = event.target.value;
    printer.notify(new Uint8Array(data.buffer));
  };

  await notifyChar.startNotifications();
  notifyChar.addEventListener("characteristicvaluechanged", notifier);

  try {
    // 3. Charger l'image
    const img = new Image();
    img.crossOrigin = "anonymous"; // Pour éviter les erreurs CORS si nécessaire

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
      img.src = imageUrl;
    });

    // 4. Créer un canvas et redimensionner l'image à 384px de largeur
    const canvas = document.createElement("canvas");
    const aspectRatio = img.height / img.width;
    canvas.width = PRINTER_WIDTH;
    canvas.height = Math.floor(PRINTER_WIDTH * aspectRatio);

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Cannot get canvas context");

    // Dessiner l'image redimensionnée
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // 5. Convertir en niveaux de gris puis en noir/blanc avec dithering
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const grayscale = new Uint8ClampedArray(canvas.width * canvas.height);

    // Convertir en niveaux de gris
    for (let i = 0; i < imageData.data.length; i += 4) {
      const r = imageData.data[i];
      const g = imageData.data[i + 1];
      const b = imageData.data[i + 2];
      grayscale[i / 4] = Math.floor(0.299 * r + 0.587 * g + 0.114 * b);
    }

    // Appliquer Floyd-Steinberg dithering
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const idx = y * canvas.width + x;
        const oldPixel = grayscale[idx];
        const newPixel = oldPixel < 128 ? 0 : 255;
        grayscale[idx] = newPixel;

        const error = oldPixel - newPixel;

        // Distribuer l'erreur aux pixels voisins
        if (x + 1 < canvas.width) {
          grayscale[idx + 1] += (error * 7) / 16;
        }
        if (y + 1 < canvas.height) {
          if (x > 0) {
            grayscale[idx + canvas.width - 1] += (error * 3) / 16;
          }
          grayscale[idx + canvas.width] += (error * 5) / 16;
          if (x + 1 < canvas.width) {
            grayscale[idx + canvas.width + 1] += (error * 1) / 16;
          }
        }
      }
    }

    // 6. Convertir en booléens
    const rows: boolean[][] = [];
    for (let y = 0; y < canvas.height; y++) {
      const row = new Array(PRINTER_WIDTH).fill(false);
      for (let x = 0; x < PRINTER_WIDTH; x++) {
        const idx = y * canvas.width + x;
        row[x] = grayscale[idx] < 128; // true = noir
      }
      rows.push(row);
    }

    // 7. Rotation 180°
    const rotatedRows = rows.reverse().map((row) => row.slice().reverse());
    const imageBuffer = prepareImageDataBuffer(rotatedRows);

    // 8. Workflow d'impression
    await printer.setIntensity(0x5d);

    const status = await printer.requestStatus();
    if (status.length >= 13 && status[12] !== 0) {
      throw new Error(`Erreur imprimante: ${status[13]}`);
    }

    const ack = await printer.printRequest(rotatedRows.length, 0);
    if (!ack || ack[0] !== 0) {
      throw new Error("Requête d'impression rejetée");
    }

    await printer.sendDataChunks(imageBuffer);
    await printer.flushData();
    await printer.waitForPrintComplete();

    console.log("✓ Image imprimée avec succès !");
  } finally {
    await notifyChar.stopNotifications();
    server.disconnect();
  }
}

// Utilisation avec une URL d'image
printImageFromUrl("https://example.com/image.jpg");

// Ou avec une image locale
const fileInput = document.querySelector<HTMLInputElement>("#imageInput");
fileInput?.addEventListener("change", (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) {
    const url = URL.createObjectURL(file);
    printImageFromUrl(url).finally(() => URL.revokeObjectURL(url));
  }
});
```

---

## Ressources

- [Référence originale](https://github.com/dropalltables/catprinter)
- Code source : `common/mxw01-protocol.ts`
- Exemple d'utilisation : `components/Preview.tsx`
