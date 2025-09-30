# MXW01 Simple Printer

Interface minimaliste pour imprimante thermique MXW01 (384px).

## 📋 Fichiers

- `index.html` - Interface utilisateur
- `style.css` - Styles
- `app.js` - Logique application
- `printer.js` - Protocole MXW01
- `image_worker.js` - Traitement d'images (Web Worker)

## 🚀 Utilisation

### 1. Lancer l'application

Ouvrez `index.html` dans un navigateur moderne (Chrome, Edge, Opera) qui
supporte Web Bluetooth.

**Important :** Pour que Web Bluetooth fonctionne, vous devez :

- Utiliser HTTPS (ou localhost)
- Avoir un navigateur compatible (Chrome/Edge/Opera recommandés)

#### Option A : Serveur local simple

```bash
# Avec Python 3
python -m http.server 8000

# Avec Node.js (npx)
npx http-server -p 8000

# Avec PHP
php -S localhost:8000
```

Puis ouvrez : `http://localhost:8000`

#### Option B : Double-clic sur index.html

Vous pouvez aussi ouvrir directement `index.html` dans votre navigateur, mais
certaines fonctionnalités (comme charger une image depuis une URL) peuvent ne
pas fonctionner à cause des restrictions CORS.

### 2. Connecter l'imprimante

1. Allumez votre imprimante MXW01
2. Cliquez sur "Connect Printer"
3. Sélectionnez votre imprimante dans la liste Bluetooth
4. Attendez la confirmation de connexion

### 3. Imprimer du texte

1. Écrivez votre texte dans la zone de texte
2. Ajustez l'intensité si nécessaire (0-255)
3. Cliquez sur "Print Text"

Le texte sera automatiquement converti en image et imprimé.

### 4. Imprimer une image

1. **Option A :** Cliquez sur "From File" et sélectionnez une image
2. **Option B :** Entrez l'URL d'une image dans "Or URL"
3. Choisissez l'algorithme de dithering :
   - **Floyd-Steinberg** (recommandé) : Rendu naturel pour photos
   - **Bayer** : Motif régulier
   - **Atkinson** : Style vintage Mac
   - **Pattern** : Motif halftone
   - **None** : Simple seuillage (pour logos/texte)
4. Ajustez l'intensité
5. Cliquez sur "Print Image"

L'image sera automatiquement :

- Redimensionnée à 384px de large
- Convertie en noir/blanc avec l'algorithme choisi
- Tournée de 180° (requis par le protocole MXW01)
- Envoyée à l'imprimante

## ⚙️ Paramètres

### Intensité (Intensity)

Contrôle la force de chauffe de l'imprimante :

- **48** : Impression claire (économie d'énergie)
- **93** : Intensité moyenne (par défaut)
- **144** : Impression foncée
- **0-255** : Plage complète disponible

## 🎨 Algorithmes de Dithering

### Floyd-Steinberg (recommandé)

- Meilleur pour les photos
- Diffusion d'erreur naturelle
- Rendu granuleux réaliste

### Bayer

- Motif de points organisés
- Bon pour les images avec beaucoup de détails
- Aspect "journal"

### Atkinson

- Style classique Mac/Apple
- Plus léger que Floyd-Steinberg
- Aspect artistique

### Pattern (Halftone)

- Motif circulaire
- Style vintage/rétro
- Bon pour les illustrations

### None (Threshold)

- Simple seuillage noir/blanc
- Idéal pour logos et texte
- Pas de traitement

## 🔧 Architecture Technique

### Flux d'impression

```
1. Texte/Image → Canvas HTML5
2. Canvas → ImageData (RGBA)
3. ImageData → Web Worker (dithering)
4. Worker → Boolean[][] (noir/blanc)
5. Rotation 180° (requis MXW01)
6. Boolean[][] → Bytes (1-bit encoding)
7. Padding à 4320 bytes minimum
8. Envoi par chunks de 48 bytes (1 ligne)
9. Imprimante MXW01 → Papier
```

### Protocole MXW01

Le protocole suit cette séquence :

1. `setIntensity()` - Définir l'intensité
2. `requestStatus()` - Vérifier l'état
3. `printRequest()` - Demander l'impression
4. `sendDataChunks()` - Envoyer les données
5. `flushData()` - Terminer l'envoi
6. `waitForPrintComplete()` - Attendre la fin

## 📱 Compatibilité

### Navigateurs supportés

- ✅ Chrome/Chromium 56+
- ✅ Edge 79+
- ✅ Opera 43+
- ❌ Firefox (Web Bluetooth non supporté)
- ❌ Safari (Web Bluetooth non supporté)

### Systèmes d'exploitation

- ✅ Windows 10/11
- ✅ macOS
- ✅ Linux
- ✅ Android (Chrome)
- ❌ iOS (pas de Web Bluetooth)

## 🐛 Dépannage

### L'imprimante n'apparaît pas

- Vérifiez que l'imprimante est allumée
- Assurez-vous que Bluetooth est activé sur votre ordinateur
- Essayez de redémarrer l'imprimante
- Vérifiez que vous utilisez un navigateur compatible

### Erreur "Bluetooth not available"

- Vérifiez que vous utilisez HTTPS ou localhost
- Utilisez Chrome/Edge/Opera
- Activez Bluetooth dans les paramètres système

### L'impression est trop claire/foncée

- Ajustez le curseur d'intensité
- Valeurs recommandées : 48 (clair), 93 (moyen), 144 (foncé)

### L'image est mal orientée

- Le code applique automatiquement une rotation de 180°
- Si l'orientation est incorrecte, vérifiez que vous utilisez la bonne
  imprimante (MXW01)

### Timeout d'impression

- L'imprimante peut avoir un problème (papier coincé, surchauffe)
- Vérifiez le statut de l'imprimante
- Éteignez et rallumez l'imprimante

## 📄 Licence

Ce code est fourni tel quel, sans garantie. Libre d'utilisation et de
modification.

## 🔗 Ressources

- [Web Bluetooth API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API)
- [Canvas API](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)
- [Web Workers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API)
