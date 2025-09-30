export const DEF_CANVAS_WIDTH = 384;
export const DEF_CANVAS_HEIGHT = DEF_CANVAS_WIDTH;
export const INL_ICON_SIZE = 24;
export const MXW01_PRINT_SRV = "0000ae30-0000-1000-8000-00805f9b34fb";
export const MXW01_CONTROL_CHAR = "0000ae01-0000-1000-8000-00805f9b34fb";
export const MXW01_NOTIFY_CHAR = "0000ae02-0000-1000-8000-00805f9b34fb";
export const MXW01_DATA_CHAR = "0000ae03-0000-1000-8000-00805f9b34fb";

export const IN_TO_CM = 2.54;
export const DEF_DPI = 384 / (4.8 / IN_TO_CM);
export const DEF_INTENSITY = 0x5D; // 93 - Intensité moyenne pour MXW01 (0x00 à 0xFF)
export const INTENSITY_RANGE = {
  "strength^low": 0x30, // 48 - Impression claire
  "strength^medium": 0x5D, // 93 - Intensité moyenne
  "strength^high": 0x90, // 144 - Impression foncée
};

export const STATICDIR = "static";
export const LANGDIR = "lang";
export const LANGDB = "languages.json";
export const DEF_LANG = "en-US";
export const STUFF_STOREKEY = "stuffs";
export const INL_ICON_COLOR = "currentColor";
export const DEF_PIC_URL = "kitty.svg";
export const STUFF_PAINT_INIT_URL =
  'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"></svg>';
export const JSLICENSE_MAIN_URL = "https://www.gnu.org/licenses/agpl-3.0.html";
export const JSLICENSE_MAIN_NAME = "AGPL-3.0";
export const JSLICENSE_MAIN_REPO = "https://github.com/NaitLee/kitty-printer";
