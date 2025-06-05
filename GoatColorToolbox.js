/** Goat Color Toolbox
 * @file GoatColorToolbox.js
 * @description A compact, performant color conversion library for Hex, RGB, HSL, and OKLCH.
 * Includes validation, contrast checking, color theory palette generation.
 * Supports modern CSS Color Level 4 features - https://www.w3.org/TR/css-color-4/.
 * Oklab conversion matrices derived from https://bottosson.github.io/posts/oklab/
 * @license MIT
 * @author Chase McGoat
 * @createdAt 2025-04-20
 * @lastModified 2025-06-03
 * @version 1.3.1
 */

(function (global, factory) {
    typeof exports === "object" && typeof module !== "undefined" ? (module.exports = factory()) : typeof define === "function" && define.amd ? define(factory) : ((global = typeof globalThis !== "undefined" ? globalThis : global || self), (global.GoatColor = factory()));
})(this, function () {
    "use strict";
    const SRGB_TO_XYZ_MATRIX = [
        [0.4123907993, 0.3575843394, 0.1804807884],
        [0.2126390059, 0.7151686788, 0.0721923154],
        [0.0193308187, 0.1191947798, 0.9505321522],
    ];
    const XYZ_TO_SRGB_MATRIX = [
        [3.240969942, -1.5373831776, -0.4986107603],
        [-0.9692436363, 1.8759675015, 0.0415550574],
        [0.0556300797, -0.2039769589, 1.0569715142],
    ];
    const OKLAB_XYZ_TO_LMS_MATRIX = [
        [0.8189330101, 0.3618667424, -0.1288597137],
        [0.0329845436, 0.9293118715, 0.0361456387],
        [0.0482003018, 0.2643662691, 0.633851707],
    ];
    const OKLAB_LMS_P_TO_LAB_MATRIX = [
        [0.2104542553, 0.793617785, -0.0040720468],
        [1.9779984951, -2.428592205, 0.4505937099],
        [0.0259040371, 0.7827717662, -0.808675766],
    ];
    const OKLAB_LAB_TO_LMS_P_MATRIX = [
        [0.99999999845051981432, 0.39633777736240243769, 0.21580375730249306069],
        [1.00000000838056630002, -0.10556134579289659905, -0.06385417279300911922],
        [1.00000005467234261899, -0.08948417752909546082, -1.2914855480408174125],
    ];
    const OKLAB_LMS_CUBED_TO_XYZ_MATRIX = [
        [1.226879878071479, -0.5578149965684922, 0.2813910501598616],
        [-0.04057575003935402, 1.112286829376436, -0.07171107933708207],
        [-0.07637293665230801, -0.4214933235444953, 1.586161639400282],
    ];

    const ALPHA_STYLE_HINT_PERCENT = "percent";
    const ALPHA_STYLE_HINT_NUMBER = "number";

    /**
     * Clamps a value between a minimum and maximum.
     * @param {number} value The value to clamp.
     * @param {number} min The minimum value.
     * @param {number} max The maximum value.
     * @returns {number} The clamped value.
     */
    const clamp = (value, min, max) => Math.max(min, Math.min(value, max));

    /**
     * Rounds a number to a specified number of decimal places.
     * @param {number|string} value The number to round.
     * @param {number} [decimals=0] The number of decimal places.
     * @returns {number|string} The rounded number, or the original value if not a parsable number.
     */
    const round = (value, decimals = 0) => {
        const num = parseFloat(value);
        if (isNaN(num)) return value;
        return Number(Math.round(num + "e" + decimals) + "e-" + decimals);
    };

    const isPercentage = (str) => typeof str === "string" && str.endsWith("%");

    /**
     * Parses a CSS number value, potentially a percentage.
     * @param {string|number} value The value to parse.
     * @param {number} [maxIfPercent=255] The maximum value if the input is a percentage (e.g., 255 for RGB, 100 for HSL).
     * @returns {number} The parsed and clamped number.
     */
    function parseCssNumber(value, maxIfPercent = 255) {
        const strValue = String(value);
        if (isPercentage(strValue)) {
            return clamp((parseFloat(strValue) / 100) * maxIfPercent, 0, maxIfPercent);
        }
        return clamp(parseFloat(strValue), 0, maxIfPercent);
    }

    /**
     * Parses a CSS hue value, handling various units (deg, rad, grad, turn, unitless as deg).
     * @param {string|number} value The hue value to parse.
     * @returns {number} The hue normalized to degrees (0-360, -0 is normalized to 0).
     */
    function parseHue(value) {
        const strValue = String(value).toLowerCase().trim();
        const numValue = parseFloat(strValue);
        if (isNaN(numValue)) return 0;

        const unitsPart = strValue.replace(/[\d.+\-eE]/g, "").trim().toLowerCase();
        let degreesValue;

        if (unitsPart === "deg" || unitsPart === "°" || unitsPart === "") { // "" for unitless
            degreesValue = numValue;
        } else if (unitsPart === "rad") {
            degreesValue = (numValue * 180) / Math.PI;
        } else if (unitsPart === "grad") {
            degreesValue = numValue * 0.9;
        } else if (unitsPart === "turn") {
            degreesValue = numValue * 360;
        } else {
            return 0; // Or throw an error for unrecognised unit if strictness is desired
        }
        let normalizedHue = degreesValue % 360;
        if (normalizedHue < 0) normalizedHue += 360;
        return Object.is(normalizedHue, -0) ? 0 : normalizedHue; // Normalize -0 to 0
    }

    /**
     * Parses an HSL saturation or lightness percentage value.
     * @param {string|number} value The percentage value (e.g., "50%").
     * @returns {number} The parsed percentage (0-100).
     * @throws {Error} If the value is not a valid percentage.
     */
    function parseHslPercentage(value) {
        const strValue = String(value).trim();
        if (!isPercentage(strValue)) throw new Error("Invalid HSL saturation/lightness value: '%' unit is required.");
        const percValue = parseFloat(strValue);
        if (isNaN(percValue)) throw new Error("Invalid HSL saturation/lightness percentage value: Not a number before '%'.");
        return clamp(percValue, 0, 100);
    }

    /**
     * Parses an alpha value (number 0-1 or percentage 0-100%).
     * @param {string|number|null|undefined} value The alpha value to parse.
     * @returns {{value: number, styleHint: string|null}} The parsed alpha (0-1) and a hint for its original format.
     */
    function parseAlpha(value) {
        if (value == null) return { value: 1, styleHint: null };
        const strValue = String(value).trim();
        if (strValue === "") return { value: 1, styleHint: null }; // Treat empty string as fully opaque
        if (isPercentage(strValue)) {
            return { value: clamp(parseFloat(strValue), 0, 100) / 100, styleHint: ALPHA_STYLE_HINT_PERCENT };
        }
        return { value: clamp(parseFloat(strValue), 0, 1), styleHint: ALPHA_STYLE_HINT_NUMBER };
    }

    function toHexPart(value) {
        return Math.round(clamp(value, 0, 255)).toString(16).padStart(2, "0");
    }
    function srgbToLinear(c) {
        const cn = c / 255;
        return cn <= 0.04045 ? cn / 12.92 : Math.pow((cn + 0.055) / 1.055, 2.4);
    }
    function linearToSrgb(clin) {
        const cs = clin <= 0.0031308 ? 12.92 * clin : 1.055 * Math.pow(clin, 1 / 2.4) - 0.055;
        return Math.round(clamp(cs, 0, 1) * 255);
    }
    function multiplyMatrix(matrix, vector) {
        return [matrix[0][0] * vector[0] + matrix[0][1] * vector[1] + matrix[0][2] * vector[2], matrix[1][0] * vector[0] + matrix[1][1] * vector[1] + matrix[1][2] * vector[2], matrix[2][0] * vector[0] + matrix[2][1] * vector[1] + matrix[2][2] * vector[2]];
    }
    function hslToRgb(h, s, l) {
        h = (((h % 360) + 360) % 360) / 360; // Normalize hue to 0-1
        s = clamp(s, 0, 100) / 100;
        l = clamp(l, 0, 100) / 100;
        if (s === 0) {
            const gray = Math.round(l * 255);
            return { r: gray, g: gray, b: gray };
        }
        const hueToRgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        return { r: Math.round(hueToRgb(p, q, h + 1 / 3) * 255), g: Math.round(hueToRgb(p, q, h) * 255), b: Math.round(hueToRgb(p, q, h - 1 / 3) * 255) };
    }

    const CSS_RGB_REGEX = /^rgba?\(\s*([+\-\d.%]+)\s+([+\-\d.%]+)\s+([+\-\d.%]+)\s*(?:[\/\s]\s*([+\-\d.%]+)\s*)?\)$/i;
    const CSS_RGB_LEGACY_REGEX = /^rgba?\(\s*([+\-\d.%]+)\s*,\s*([+\-\d.%]+)\s*,\s*([+\-\d.%]+)\s*(?:,\s*([+\-\d.%]+)\s*)?\)$/i;
    const CSS_HSL_REGEX = /^hsla?\(\s*([+\-\d.%a-z°]+)\s+([+\-\d.%]+)\s+([+\-\d.%]+)\s*(?:[\/\s]\s*([+\-\d.%]+)\s*)?\)$/i;
    const CSS_HSL_LEGACY_REGEX = /^hsla?\(\s*([+\-\d.%a-z°]+)\s*,\s*([+\-\d.%]+)\s*,\s*([+\-\d.%]+)\s*(?:,\s*([+\-\d.%]+)\s*)?\)$/i;
    const CSS_HEX_REGEX = /^#?([a-f\d]{1})([a-f\d]{1})([a-f\d]{1})([a-f\d]{1})?$|^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})?$/i;
    const CSS_HEX_LEGACY_NUM_REGEX = /^0x(?:([a-f\d]{2}))?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i; // 0xAARRGGBB or 0xRRGGBB
    const CSS_OKLCH_REGEX = /^oklch\(\s*([+\-\d.%]+)\s+([+\-\d.%]+)\s+([+\-\d.%a-z°]+)\s*(?:[\/\s]\s*([+\-\d.%]+)\s*)?\)$/i;

    const CSS_NAMED_COLORS = {
        aliceblue: "#f0f8ff", antiquewhite: "#faebd7", aqua: "#00ffff", aquamarine: "#7fffd4", azure: "#f0ffff", beige: "#f5f5dc", bisque: "#ffe4c4", black: "#000000", blanchedalmond: "#ffebcd", blue: "#0000ff", blueviolet: "#8a2be2", brown: "#a52a2a", burlywood: "#deb887", cadetblue: "#5f9ea0", chartreuse: "#7fff00", chocolate: "#d2691e", coral: "#ff7f50", cornflowerblue: "#6495ed", cornsilk: "#fff8dc", crimson: "#dc143c", cyan: "#00ffff", darkblue: "#00008b", darkcyan: "#008b8b", darkgoldenrod: "#b8860b", darkgray: "#a9a9a9", darkgreen: "#006400", darkgrey: "#a9a9a9", darkkhaki: "#bdb76b", darkmagenta: "#8b008b", darkolivegreen: "#556b2f", darkorange: "#ff8c00", darkorchid: "#9932cc", darkred: "#8b0000", darksalmon: "#e9967a", darkseagreen: "#8fbc8f", darkslateblue: "#483d8b", darkslategray: "#2f4f4f", darkslategrey: "#2f4f4f", darkturquoise: "#00ced1", darkviolet: "#9400d3", deeppink: "#ff1493", deepskyblue: "#00bfff", dimgray: "#696969", dimgrey: "#696969", dodgerblue: "#1e90ff", firebrick: "#b22222", floralwhite: "#fffaf0", forestgreen: "#228b22", fuchsia: "#ff00ff", gainsboro: "#dcdcdc", ghostwhite: "#f8f8ff", gold: "#ffd700", goldenrod: "#daa520", gray: "#808080", green: "#008000", greenyellow: "#adff2f", grey: "#808080", honeydew: "#f0fff0", hotpink: "#ff69b4", indianred: "#cd5c5c", indigo: "#4b0082", ivory: "#fffff0", khaki: "#f0e68c", lavender: "#e6e6fa", lavenderblush: "#fff0f5", lawngreen: "#7cfc00", lemonchiffon: "#fffacd", lightblue: "#add8e6", lightcoral: "#f08080", lightcyan: "#e0ffff", lightgoldenrodyellow: "#fafad2", lightgray: "#d3d3d3", lightgreen: "#90ee90", lightgrey: "#d3d3d3", lightpink: "#ffb6c1", lightsalmon: "#ffa07a", lightseagreen: "#20b2aa", lightskyblue: "#87cefa", lightslategray: "#778899", lightslategrey: "#778899", lightsteelblue: "#b0c4de", lightyellow: "#ffffe0", lime: "#00ff00", limegreen: "#32cd32", linen: "#faf0e6", magenta: "#ff00ff", maroon: "#800000", mediumaquamarine: "#66cdaa", mediumblue: "#0000cd", mediumorchid: "#ba55d3", mediumpurple: "#9370db", mediumseagreen: "#3cb371", mediumslateblue: "#7b68ee", mediumspringgreen: "#00fa9a", mediumturquoise: "#48d1cc", mediumvioletred: "#c71585", midnightblue: "#191970", mintcream: "#f5fffa", mistyrose: "#ffe4e1", moccasin: "#ffe4b5", navajowhite: "#ffdead", navy: "#000080", oldlace: "#fdf5e6", olive: "#808000", olivedrab: "#6b8e23", orange: "#ffa500", orangered: "#ff4500", orchid: "#da70d6", palegoldenrod: "#eee8aa", palegreen: "#98fb98", paleturquoise: "#afeeee", palevioletred: "#db7093", papayawhip: "#ffefd5", peachpuff: "#ffdab9", peru: "#cd853f", pink: "#ffc0cb", plum: "#dda0dd", powderblue: "#b0e0e6", purple: "#800080", rebeccapurple: "#663399", red: "#ff0000", rosybrown: "#bc8f8f", royalblue: "#4169e1", saddlebrown: "#8b4513", salmon: "#fa8072", sandybrown: "#f4a460", seagreen: "#2e8b57", seashell: "#fff5ee", sienna: "#a0522d", silver: "#c0c0c0", skyblue: "#87ceeb", slateblue: "#6a5acd", slategray: "#708090", slategrey: "#708090", snow: "#fffafa", springgreen: "#00ff7f", steelblue: "#4682b4", tan: "#d2b48c", teal: "#008080", thistle: "#d8bfd8", tomato: "#ff6347", transparent: "#00000000", turquoise: "#40e0d0", violet: "#ee82ee", wheat: "#f5deb3", white: "#ffffff", whitesmoke: "#f5f5f5", yellow: "#ffff00", yellowgreen: "#9acd32"
    };

    /**
     * Represents a color and provides methods for conversion and manipulation.
     * This class is intended for internal use by the GoatColor factory.
     * The `input` property stores the original color string passed to the constructor.
     * @hideconstructor
     */
    class GoatColorInternal {
        constructor(colorInput) {
            this.r = 0;
            this.g = 0;
            this.b = 0;
            this.a = 1;
            this.input = colorInput;
            this.valid = false;
            this.error = null; // Store parsing error message
            this._alphaInputStyleHint = null; // 'percent' or 'number'
            this._parse(colorInput);
        }

        _parse(rawInput) {
            this.valid = false; // Reset validity and error
            this.error = null;

            if (rawInput == null) {
                this.error = "Input color is null or undefined.";
                return;
            }
            if (typeof rawInput !== "string") {
                this.error = `Invalid input type: Expected string, got ${typeof rawInput}.`;
                return;
            }

            let str = rawInput.trim();
            if (str === "") {
                this.error = "Input color string is empty.";
                return;
            }

            const lowerStr = str.toLowerCase();
            if (CSS_NAMED_COLORS.hasOwnProperty(lowerStr)) {
                str = CSS_NAMED_COLORS[lowerStr];
            }

            let match;
            let alphaInfo;

            // Try Hex
            match = str.match(CSS_HEX_REGEX);
            if (match) {
                try {
                    if (match[5] !== undefined) { // #RRGGBB or #RRGGBBAA
                        this.r = parseInt(match[5], 16);
                        this.g = parseInt(match[6], 16);
                        this.b = parseInt(match[7], 16);
                        if (match[8]) {
                            this.a = parseInt(match[8], 16) / 255;
                            this._alphaInputStyleHint = ALPHA_STYLE_HINT_NUMBER;
                        } else {
                            this.a = 1;
                        }
                    } else { // #RGB or #RGBA
                        this.r = parseInt(match[1] + match[1], 16);
                        this.g = parseInt(match[2] + match[2], 16);
                        this.b = parseInt(match[3] + match[3], 16);
                        if (match[4]) {
                            this.a = parseInt(match[4] + match[4], 16) / 255;
                            this._alphaInputStyleHint = ALPHA_STYLE_HINT_NUMBER;
                        } else {
                            this.a = 1;
                        }
                    }
                    if (isNaN(this.r) || isNaN(this.g) || isNaN(this.b)) throw new Error("Invalid character in hex string.");
                    this.valid = true;
                    return;
                } catch (e) {
                    this.error = `Invalid Hex format: ${e.message || 'Parsing failed'}`;
                    this.valid = false; // Ensure valid is false if parsing fails
                    return;
                }
            }

            // Try 0x Hex (legacy numeric)
            match = str.match(CSS_HEX_LEGACY_NUM_REGEX);
            if (match) {
                try {
                    if (match[1] !== undefined) { // 0xAARRGGBB
                        this.a = parseInt(match[1], 16) / 255;
                        this.r = parseInt(match[2], 16);
                        this.g = parseInt(match[3], 16);
                        this.b = parseInt(match[4], 16);
                        this._alphaInputStyleHint = ALPHA_STYLE_HINT_NUMBER;
                    } else { // 0xRRGGBB
                        this.r = parseInt(match[2], 16);
                        this.g = parseInt(match[3], 16);
                        this.b = parseInt(match[4], 16);
                        this.a = 1;
                    }
                    if (isNaN(this.r) || isNaN(this.g) || isNaN(this.b) || isNaN(this.a)) throw new Error("Invalid character in 0x hex string.");
                    this.valid = true;
                    return;
                } catch (e) {
                    this.error = `Invalid 0x Hex format: ${e.message || 'Parsing failed'}`;
                    this.valid = false;
                    return;
                }
            }

            // Try OKLCH
            match = str.match(CSS_OKLCH_REGEX);
            if (match) {
                try {
                    const parseOklchLightness = (v) => {
                        const n = parseFloat(v);
                        if (isNaN(n)) throw new Error("Invalid OKLCH Lightness value.");
                        return isPercentage(v) ? clamp(n, 0, 100) : clamp(n * 100, 0, 100);
                    };
                    const parseOklchChroma = (v) => {
                        const n = parseFloat(v);
                        if (isNaN(n)) throw new Error("Invalid OKLCH Chroma value.");
                        if (isPercentage(v)) {
                            return clamp((parseFloat(v) / 100) * 0.4, 0, Infinity);
                        }
                        return clamp(n, 0, Infinity);
                    };

                    const l_val = parseOklchLightness(match[1]);
                    const c_val = parseOklchChroma(match[2]);
                    const h_val = parseHue(match[3]);
                    alphaInfo = parseAlpha(match[4]);
                    this.a = alphaInfo.value;
                    this._alphaInputStyleHint = alphaInfo.styleHint;

                    const L_oklab_norm = l_val / 100.0;
                    const C_oklch_val = c_val;
                    const H_rad = (h_val * Math.PI) / 180.0;

                    const a_oklab_comp = C_oklch_val * Math.cos(H_rad);
                    const b_oklab_comp = C_oklch_val * Math.sin(H_rad);

                    const [l_p, m_p, s_p] = multiplyMatrix(OKLAB_LAB_TO_LMS_P_MATRIX, [L_oklab_norm, a_oklab_comp, b_oklab_comp]);
                    const [x, y, z] = multiplyMatrix(OKLAB_LMS_CUBED_TO_XYZ_MATRIX, [Math.pow(l_p, 3), Math.pow(m_p, 3), Math.pow(s_p, 3)]);
                    const [r_lin, g_lin, b_lin] = multiplyMatrix(XYZ_TO_SRGB_MATRIX, [x, y, z]);

                    this.r = linearToSrgb(r_lin);
                    this.g = linearToSrgb(g_lin);
                    this.b = linearToSrgb(b_lin);

                    if (isNaN(this.r) || isNaN(this.g) || isNaN(this.b) || isNaN(this.a)) {
                        throw new Error("OKLCH to RGB conversion resulted in non-finite component values.");
                    }
                    this.valid = true;
                    return;
                } catch (e) {
                    this.error = `Invalid OKLCH format: ${e.message || 'Parsing failed'}`;
                    this.valid = false;
                    return;
                }
            }

            // Try HSL
            match = str.match(CSS_HSL_REGEX) || str.match(CSS_HSL_LEGACY_REGEX);
            if (match) {
                try {
                    const { r, g, b } = hslToRgb(parseHue(match[1]), parseHslPercentage(match[2]), parseHslPercentage(match[3]));
                    this.r = r;
                    this.g = g;
                    this.b = b;
                    alphaInfo = parseAlpha(match[4]);
                    this.a = alphaInfo.value;
                    this._alphaInputStyleHint = alphaInfo.styleHint;

                    if (isNaN(this.r) || isNaN(this.g) || isNaN(this.b) || isNaN(this.a)) {
                        throw new Error("HSL to RGB conversion resulted in non-finite component values.");
                    }
                    this.valid = true;
                    return;
                } catch (e) {
                    this.error = `Invalid HSL format: ${e.message || 'Parsing failed'}`;
                    this.valid = false;
                    return;
                }
            }

            // Try RGB
            match = str.match(CSS_RGB_REGEX) || str.match(CSS_RGB_LEGACY_REGEX);
            if (match) {
                try {
                    this.r = parseCssNumber(match[1]);
                    this.g = parseCssNumber(match[2]);
                    this.b = parseCssNumber(match[3]);
                    alphaInfo = parseAlpha(match[4]);
                    this.a = alphaInfo.value;
                    this._alphaInputStyleHint = alphaInfo.styleHint;
                    if (isNaN(this.r) || isNaN(this.g) || isNaN(this.b) || isNaN(this.a)) {
                        throw new Error("One or more RGB(A) components are not valid numbers.");
                    }
                    this.valid = true;
                    return;
                } catch (e) {
                    this.error = `Invalid RGB format: ${e.message || 'Parsing failed'}`;
                    this.valid = false;
                    return;
                }
            }

            if (!this.valid) {
                this.error = this.error || `Unrecognized color format: "${rawInput}"`;
            }
        }

        /**
         * Checks if the parsed color is valid.
         * @returns {boolean} True if the color is valid, false otherwise.
         */
        isValid() {
            return this.valid;
        }

        /**
         * Sets the alpha value of the color.
         * This method mutates the current color instance.
         * @param {number} alphaValue - The alpha value (0-1).
         * @param {string} [styleHint="percent"] - The preferred style for outputting alpha ("percent" or "number").
         * @returns {void}
         */
        setAlpha(alphaValue, styleHint = ALPHA_STYLE_HINT_PERCENT) {
            this.a = clamp(alphaValue, 0, 1);
            this._alphaInputStyleHint = (styleHint === ALPHA_STYLE_HINT_NUMBER || styleHint === ALPHA_STYLE_HINT_PERCENT) ? styleHint : ALPHA_STYLE_HINT_PERCENT;
            this.valid = !(isNaN(this.r) || isNaN(this.g) || isNaN(this.b));
            if (!this.valid) {
                this.error = this.error || "Color became invalid after setting alpha (underlying RGB might be corrupt).";
            }
        }

        _getAlphaString() {
            const alpha = this.a;
            const epsilon = 1e-9;

            if (Math.abs(alpha - 1) < epsilon) return "1";
            if (Math.abs(alpha - 0) < epsilon) return "0";

            if (this._alphaInputStyleHint === ALPHA_STYLE_HINT_NUMBER) {
                let numStr = round(alpha, 3).toString();
                if (numStr.startsWith("0.")) {
                    numStr = numStr.substring(1);
                }
                return numStr;
            }
            return `${round(alpha * 100, 0)}%`;
        }


        /**
         * Gets the color as an RGB object.
         * @returns {{r: number, g: number, b: number}} RGB object, or {r:0, g:0, b:0} if invalid.
         */
        toRgb() {
            if (!this.valid) return { r: 0, g: 0, b: 0 };
            return { r: Math.round(this.r), g: Math.round(this.g), b: Math.round(this.b) };
        }

        /**
         * Gets the color as an RGBA object.
         * @returns {{r: number, g: number, b: number, a: number}} RGBA object, or {r:0, g:0, b:0, a:1} if invalid.
         */
        toRgba() {
            if (!this.valid) return { r: 0, g: 0, b: 0, a: 1 };
            return { r: Math.round(this.r), g: Math.round(this.g), b: Math.round(this.b), a: this.a };
        }

        /**
         * Converts the color to its RGB string representation.
         * @param {boolean} [legacy=false] - If true, outputs legacy comma-separated format.
         * @returns {string} The RGB string or "Invalid" if the color is not valid.
         */
        toRgbString(legacy = false) {
            if (!this.valid) return this.error || "Invalid Color";
            const { r, g, b } = this.toRgb();
            return legacy ? `rgb(${r}, ${g}, ${b})` : `rgb(${r} ${g} ${b})`;
        }

        /**
         * Converts the color to its RGBA string representation.
         * For UI display (non-legacy), opacity values < 1 will not have a leading zero if alpha hint is 'number'.
         * @param {boolean} [legacy=false] - If true, outputs legacy comma-separated format.
         * @returns {string} The RGBA string or "Invalid" if the color is not valid.
         */
        toRgbaString(legacy = false) {
            if (!this.valid) return this.error || "Invalid Color";
            const { r, g, b } = this.toRgb();
            if (legacy) {
                let legacyA = round(this.a, 2).toString();
                if (legacyA === "0.00") legacyA = "0";
                else if (legacyA === "1.00") legacyA = "1";
                else if (legacyA.startsWith("0.")) legacyA = legacyA.substring(1);
                return `rgba(${r}, ${g}, ${b}, ${legacyA})`;
            }
            // Modern space-separated syntax
            if (this.a === 1) return `rgb(${r} ${g} ${b})`;
            const aStr = this._getAlphaString();
            return `rgb(${r} ${g} ${b} / ${aStr})`;
        }

        /**
         * Converts the color to its Hex string representation (e.g., #RRGGBB).
         * @returns {string} The Hex string or "Invalid" if the color is not valid.
         */
        toHex() {
            if (!this.valid) return this.error || "Invalid Color";
            return `#${toHexPart(this.r)}${toHexPart(this.g)}${toHexPart(this.b)}`;
        }

        /**
         * Converts the color to its HexA string representation (e.g., #RRGGBBAA or #RRGGBB if alpha is 1).
         * @returns {string} The HexA string or "Invalid" if the color is not valid.
         */
        toHexa() {
            if (!this.valid) return this.error || "Invalid Color";
            return `#${toHexPart(this.r)}${toHexPart(this.g)}${toHexPart(this.b)}${this.a === 1 ? "" : toHexPart(this.a * 255)}`;
        }

        /**
         * Converts the color to its short Hex string representation (e.g., #RGB) if possible.
         * Returns null if not valid, alpha is not 1, or cannot be shortened.
         * @returns {string|null} The short Hex string, or null.
         */
        toHexShort() {
            if (!this.valid || this.a < 1) return null;
            const rH = toHexPart(this.r), gH = toHexPart(this.g), bH = toHexPart(this.b);
            if (rH[0] === rH[1] && gH[0] === gH[1] && bH[0] === bH[1]) {
                return `#${rH[0]}${gH[0]}${bH[0]}`;
            }
            return null;
        }

        /**
         * Converts the color to its short HexA string representation (e.g., #RGBA or #RGB if alpha is 1) if possible.
         * Returns null if not valid or cannot be shortened.
         * @returns {string|null} The short HexA string, or null.
         */
        toHexaShort() {
            if (!this.valid) return null;
            const rH = toHexPart(this.r), gH = toHexPart(this.g), bH = toHexPart(this.b), aH = toHexPart(this.a * 255);
            if (rH[0] === rH[1] && gH[0] === gH[1] && bH[0] === bH[1] && aH[0] === aH[1]) {
                return this.a === 1 ? `#${rH[0]}${gH[0]}${bH[0]}` : `#${rH[0]}${gH[0]}${bH[0]}${aH[0]}`;
            }
            return null;
        }

        /**
         * Gets the color as an HSL object.
         * @returns {{h: number, s: number, l: number}} HSL object, or {h:0, s:0, l:0} if invalid.
         */
        toHsl() {
            if (!this.valid) return { h: 0, s: 0, l: 0 };
            const rN = this.r / 255, gN = this.g / 255, bN = this.b / 255;
            const max = Math.max(rN, gN, bN), min = Math.min(rN, gN, bN);
            let h = 0, s, l = (max + min) / 2;

            if (max === min) {
                s = 0;
            } else {
                const d = max - min;
                s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
                switch (max) {
                    case rN: h = (gN - bN) / d + (gN < bN ? 6 : 0); break;
                    case gN: h = (bN - rN) / d + 2; break;
                    case bN: h = (rN - gN) / d + 4; break;
                }
                h /= 6;
            }
            let finalH = h * 360;
            finalH = Object.is(finalH, -0) ? 0 : finalH;
            return { h: finalH, s: s * 100, l: l * 100 };
        }

        /**
         * Gets the color as an HSLA object.
         * @returns {{h: number, s: number, l: number, a: number}} HSLA object, or {h:0, s:0, l:0, a:1} if invalid.
         */
        toHsla() {
            if (!this.valid) return { h: 0, s: 0, l: 0, a: 1 };
            const { h, s, l } = this.toHsl();
            return { h, s, l, a: this.a };
        }

        /**
         * Converts the color to its HSL string representation.
         * @param {boolean} [legacy=false] - If true, outputs legacy comma-separated format.
         * @returns {string} The HSL string or "Invalid" if the color is not valid.
         */
        toHslString(legacy = false) {
            if (!this.valid) return this.error || "Invalid Color";
            const { h, s, l } = this.toHsl();
            const hS = round(h, 0), sS = round(s, 0), lS = round(l, 0);
            return legacy ? `hsl(${hS}, ${sS}%, ${lS}%)` : `hsl(${hS} ${sS}% ${lS}%)`;
        }

        /**
         * Converts the color to its HSLA string representation.
         * For UI display (non-legacy), opacity values < 1 will not have a leading zero if alpha hint is 'number'.
         * @param {boolean} [legacy=false] - If true, outputs legacy comma-separated format.
         * @returns {string} The HSLA string or "Invalid" if the color is not valid.
         */
        toHslaString(legacy = false) {
            if (!this.valid) return this.error || "Invalid Color";
            const { h, s, l } = this.toHsl();
            const hS = round(h, 0), sS = round(s, 0), lS = round(l, 0);
            if (legacy) {
                let legacyA = round(this.a, 2).toString();
                if (legacyA === "0.00") legacyA = "0";
                else if (legacyA === "1.00") legacyA = "1";
                else if (legacyA.startsWith("0.")) legacyA = legacyA.substring(1);
                return `hsla(${hS}, ${sS}%, ${lS}%, ${legacyA})`;
            }
            // Modern space-separated syntax
            if (this.a === 1) return `hsl(${hS} ${sS}% ${lS}%)`;
            const aStr = this._getAlphaString();
            return `hsl(${hS} ${sS}% ${lS}% / ${aStr})`;
        }

        /**
         * Gets the color as an OKLCH object (L as 0-100).
         * @returns {{l: number, c: number, h: number}} OKLCH object, or {l:0, c:0, h:0} if invalid.
         */
        toOklch() {
            if (!this.valid) return { l: 0, c: 0, h: 0 };
            const rL = srgbToLinear(this.r), gL = srgbToLinear(this.g), bL = srgbToLinear(this.b);
            const [x, y, z] = multiplyMatrix(SRGB_TO_XYZ_MATRIX, [rL, gL, bL]);
            const [lC, mC, sC] = multiplyMatrix(OKLAB_XYZ_TO_LMS_MATRIX, [x, y, z]);
            const lP = Math.cbrt(lC), mP = Math.cbrt(mC), sP = Math.cbrt(sC);
            const [L, a_ok, b_ok] = multiplyMatrix(OKLAB_LMS_P_TO_LAB_MATRIX, [lP, mP, sP]);
            const C = Math.sqrt(a_ok * a_ok + b_ok * b_ok);
            let H = (Math.atan2(b_ok, a_ok) * 180) / Math.PI;
            if (H < 0) H += 360;
            let finalH = Object.is(H, -0) ? 0 : H;
            return { l: L * 100, c: C, h: finalH };
        }

        /**
         * Gets the color as an OKLCHA object (L as 0-100).
         * @returns {{l: number, c: number, h: number, a: number}} OKLCHA object, or {l:0, c:0, h:0, a:1} if invalid.
         */
        toOklcha() {
            if (!this.valid) return { l: 0, c: 0, h: 0, a: 1 };
            const { l, c, h } = this.toOklch();
            return { l, c, h, a: this.a };
        }

        /**
         * Converts the color to its OKLCH string representation.
         * L is percentage, C is number, H is degrees.
         * @returns {string} The OKLCH string or "Invalid" if the color is not valid.
         */
        toOklchString() {
            if (!this.valid) return this.error || "Invalid Color";
            const { l, c, h } = this.toOklch();
            return `oklch(${round(l, 0)}% ${round(c, 3)} ${round(h, 0)})`;
        }

        /**
         * Converts the color to its OKLCHA string representation.
         * For UI display, opacity values < 1 will not have a leading zero if alpha hint is 'number'.
         * @returns {string} The OKLCHA string or "Invalid" if the color is not valid.
         */
        toOklchaString() {
            if (!this.valid) return this.error || "Invalid Color";
            const { l, c, h } = this.toOklch();
            if (this.a === 1) return `oklch(${round(l, 0)}% ${round(c, 3)} ${round(h, 0)})`;
            const aStr = this._getAlphaString();
            return `oklch(${round(l, 0)}% ${round(c, 3)} ${round(h, 0)} / ${aStr})`;
        }

        /**
         * Converts the color to a string representation, attempting to use the most common or shortest form.
         * @param {string} [format="auto"] - The desired format ("auto", "hex", "hexa", "rgb", "rgba", "hsl", "hsla", "oklch", "oklcha", or legacy variants).
         * When `format` is 'auto', the method attempts to use the original color model family (e.g., HSL input might produce HSL/HSLA output) if the original input string is available and recognized, otherwise it falls back to Hex/HexA or RGB/RGBA.
         * @returns {string} The color string. If invalid, returns the original input string or "Invalid Color".
         */
        toString(format = "auto") {
            if (!this.valid) return this.input == null ? (this.error || "Invalid Color") : String(this.input);

            const hexS = this.toHexShort(), hexaS = this.toHexaShort();

            switch (format.toLowerCase()) {
                case "hex": return this.toHex();
                case "hexa": return this.toHexa();
                case "hexshort": return hexS || this.toHex();
                case "hexashort": return hexaS || this.toHexa();
                case "rgb": return this.toRgbString();
                case "rgba": return this.toRgbaString();
                case "rgblegacy": return this.toRgbString(true);
                case "rgbalegacy": return this.toRgbaString(true);
                case "hsl": return this.toHslString();
                case "hsla": return this.toHslaString();
                case "hsllegacy": return this.toHslString(true);
                case "hslalegacy": return this.toHslaString(true);
                case "oklch": return this.toOklchString();
                case "oklcha": return this.toOklchaString();
                case "auto":
                default:
                    if (this.a < 1) {
                        if (hexaS) return hexaS;
                        const alphaStr = this._getAlphaString();
                        if (alphaStr.includes('%') || (this._alphaInputStyleHint === ALPHA_STYLE_HINT_NUMBER && this.a !== round(this.a, 0))) {
                            if (this.input && typeof this.input === 'string' && this.input.toLowerCase().startsWith("oklch")) return this.toOklchaString();
                            if (this.input && typeof this.input === 'string' && (this.input.toLowerCase().startsWith("hsl") || this.input.toLowerCase().startsWith("hsla"))) return this.toHslaString();
                            if (this.input && typeof this.input === 'string' && (this.input.toLowerCase().startsWith("rgb") || this.input.toLowerCase().startsWith("rgba"))) return this.toRgbaString();
                        }
                        return this.toRgbaString();
                    }
                    if (hexS) return hexS;
                    if (this.input && typeof this.input === 'string' && this.input.toLowerCase().startsWith("oklch")) return this.toOklchString();
                    if (this.input && typeof this.input === 'string' && this.input.toLowerCase().startsWith("hsl")) return this.toHslString();
                    if (this.input && typeof this.input === 'string' && this.input.toLowerCase().startsWith("rgb")) return this.toRgbString();
                    return this.toHex();
            }
        }

        /**
         * Calculates the W3C relative luminance of the color.
         * Uses sRGB linear components and standard coefficients.
         * @returns {number} The relative luminance (0-1), or 0 if invalid.
         */
        getRelativeLuminance() {
            if (!this.valid) return 0;
            const r_lin = srgbToLinear(this.r);
            const g_lin = srgbToLinear(this.g);
            const b_lin = srgbToLinear(this.b);
            return SRGB_TO_XYZ_MATRIX[1][0] * r_lin + SRGB_TO_XYZ_MATRIX[1][1] * g_lin + SRGB_TO_XYZ_MATRIX[1][2] * b_lin;
        }

        _normalizeHue(hue) {
            let h = hue % 360;
            return h < 0 ? h + 360 : h;
        }

        static _fromRgba(r, g, b, a, alphaStyleHint = null) {
            const i = new GoatColorInternal(null);
            i.r = Math.round(clamp(r, 0, 255));
            i.g = Math.round(clamp(g, 0, 255));
            i.b = Math.round(clamp(b, 0, 255));
            i.a = clamp(a, 0, 1);
            i._alphaInputStyleHint = alphaStyleHint;
            i.valid = true;

            const tempAlphaFormatter = new GoatColorInternal(null);
            tempAlphaFormatter.a = i.a;
            tempAlphaFormatter._alphaInputStyleHint = i._alphaInputStyleHint;
            const alphaStrForInput = tempAlphaFormatter._getAlphaString();

            if (i.a === 1) {
                i.input = `rgb(${i.r} ${i.g} ${i.b})`;
            } else {
                i.input = `rgb(${i.r} ${i.g} ${i.b} / ${alphaStrForInput})`;
            }
            return i;
        }

        _cloneWithNewHsl(h, s, l, a = this.a) {
            const { r, g, b } = hslToRgb(this._normalizeHue(h), clamp(s, 0, 100), clamp(l, 0, 100));
            return GoatColorInternal._fromRgba(r, g, b, clamp(a, 0, 1), this._alphaInputStyleHint);
        }

        /**
         * Generates a monochromatic palette.
         * @param {number} [count=5] - The number of colors in the palette (including the base color).
         * @returns {GoatColorInternal[]} An array of GoatColorInternal instances.
         */
        getMonochromaticPalette(count = 5) {
            if (!this.valid || count < 1) return [this];
            if (count === 1) return [this];

            // Factor for how much to lighten; values closer to 1.0 lighten more per step.
            const LIGHTEN_FACTOR_MONO = 0.8;
            // Factor for how much to darken (applied to remaining lightness); values closer to 1.0 darken more per step.
            const DARKEN_FACTOR_MONO = 0.85;

            const { h, s, l: baseL } = this.toHsl();
            const p = [this];

            if (count === 2) {
                p.push(this._cloneWithNewHsl(h, s, clamp(baseL > 50 ? baseL - 20 : baseL + 20, 0, 100)));
                return p.sort((c1, c2) => c1.toHsl().l - c2.toHsl().l);
            }

            const lighterColorsCount = Math.ceil((count - 1) / 2);
            const darkerColorsCount = Math.floor((count - 1) / 2);

            for (let i = 1; i <= lighterColorsCount; i++) {
                const lightness = clamp(baseL + (100 - baseL) * (i / (lighterColorsCount + 1)) * LIGHTEN_FACTOR_MONO, 0, 100);
                p.push(this._cloneWithNewHsl(h, s, lightness));
            }
            for (let i = 1; i <= darkerColorsCount; i++) {
                const lightness = clamp(baseL * (1 - (i / (darkerColorsCount + 1)) * DARKEN_FACTOR_MONO), 0, 100);
                p.push(this._cloneWithNewHsl(h, s, lightness));
            }
            return p.sort((c1, c2) => c1.toHsl().l - c2.toHsl().l);
        }

        /**
         * Generates an analogous palette.
         * @param {number} [angle=30] - The angle (in degrees) to shift the hue for analogous colors.
         * @returns {GoatColorInternal[]} An array of three GoatColorInternal instances.
         */
        getAnalogousPalette(angle = 30) {
            if (!this.valid) return [this];
            const { h, s, l } = this.toHsl();
            return [
                this._cloneWithNewHsl(h - angle, s, l),
                this,
                this._cloneWithNewHsl(h + angle, s, l)
            ].sort((a, b) => this._normalizeHue(a.toHsl().h) - this._normalizeHue(b.toHsl().h));
        }

        /**
         * Generates a complementary palette (base color and its complement).
         * @returns {GoatColorInternal[]} An array of two GoatColorInternal instances.
         */
        getComplementaryPalette() {
            if (!this.valid) return [this];
            const { h, s, l } = this.toHsl();
            return [this, this._cloneWithNewHsl(h + 180, s, l)];
        }

        /**
         * Generates a split-complementary palette.
         * @param {number} [angle=30] - The angle (in degrees) to offset from the direct complement.
         * @returns {GoatColorInternal[]} An array of three GoatColorInternal instances.
         */
        getSplitComplementaryPalette(angle = 30) {
            if (!this.valid) return [this];
            const { h, s, l } = this.toHsl();
            const complementaryHue = this._normalizeHue(h + 180);
            return [
                this,
                this._cloneWithNewHsl(complementaryHue - angle, s, l),
                this._cloneWithNewHsl(complementaryHue + angle, s, l)
            ].sort((a, b) => this._normalizeHue(a.toHsl().h) - this._normalizeHue(b.toHsl().h));
        }

        /**
         * Generates a triadic palette.
         * @returns {GoatColorInternal[]} An array of three GoatColorInternal instances.
         */
        getTriadicPalette() {
            if (!this.valid) return [this];
            const { h, s, l } = this.toHsl();
            return [
                this,
                this._cloneWithNewHsl(h + 120, s, l),
                this._cloneWithNewHsl(h + 240, s, l)
            ].sort((a, b) => this._normalizeHue(a.toHsl().h) - this._normalizeHue(b.toHsl().h));
        }

        /**
         * Generates a tetradic (rectangular) palette.
         * @param {number} [offsetAngle=60] - The angle (in degrees) for the second color, determining the rectangle shape.
         * @returns {GoatColorInternal[]} An array of four GoatColorInternal instances.
         */
        getTetradicPalette(offsetAngle = 60) {
            if (!this.valid) return [this];
            const { h, s, l } = this.toHsl();
            return [
                this,
                this._cloneWithNewHsl(h + offsetAngle, s, l),
                this._cloneWithNewHsl(h + 180, s, l),
                this._cloneWithNewHsl(h + 180 + offsetAngle, s, l)
            ].sort((a, b) => this._normalizeHue(a.toHsl().h) - this._normalizeHue(b.toHsl().h));
        }

        /**
         * Flattens the color against a background color, removing transparency.
         * @param {string|GoatColorInternal} [backgroundInput="white"] - The background color.
         * @returns {GoatColorInternal} A new GoatColorInternal instance representing the flattened color (alpha will be 1).
         * If the current color is invalid, returns a new invalid color instance.
         */
        flatten(backgroundInput = "white") {
            if (!this.valid) {
                const invalidColor = new GoatColorInternal(null);
                invalidColor.error = this.error || "Cannot flatten an invalid color.";
                return invalidColor;
            }
            if (this.a === 1) {
                return GoatColorInternal._fromRgba(this.r, this.g, this.b, 1, this._alphaInputStyleHint);
            }

            let bgInstance = backgroundInput instanceof GoatColorInternal ? backgroundInput : new GoatColorInternal(backgroundInput);
            if (!bgInstance.isValid()) {
                bgInstance = new GoatColorInternal("white");
            }

            if (bgInstance.a < 1) {
                bgInstance = bgInstance.flatten("white");
            }

            const finalR = this.r * this.a + bgInstance.r * (1 - this.a);
            const finalG = this.g * this.a + bgInstance.g * (1 - this.a);
            const finalB = this.b * this.a + bgInstance.b * (1 - this.a);

            return GoatColorInternal._fromRgba(finalR, finalG, finalB, 1, this._alphaInputStyleHint);
        }
    }

    /**
     * Factory function to create a GoatColor instance.
     * Supported input formats include Hex (#RRGGBB, #RGB, #RRGGBBAA, #RGBA, 0xRRGGBB, 0xAARRGGBB),
     * RGB(A) (e.g., `rgb(255 0 0)`, `rgba(0,0,255,.5)`), HSL(A) (e.g., `hsl(120 100% 50%)`, `hsla(0 100% 50% / 0.8)`),
     * OKLCH(A) (e.g., `oklch(50% 0.25 200)`), and CSS named colors (e.g., 'red', 'transparent').
     * Both modern space-separated and legacy comma-separated syntaxes are supported for RGB/HSL.
     * Users should call this factory function `GoatColor(...)` to create instances, rather than using `new GoatColor.goatColor(...)` directly.
     * @param {string | null | undefined} colorInput - The color string to parse.
     * @returns {GoatColorInternal} A GoatColor instance.
     */
    function GoatColorFactory(colorInput) {
        return new GoatColorInternal(colorInput);
    }

    /**
     * The internal GoatColor class. Exposed for type checking (e.g., `instanceof GoatColor.goatColor`) if needed,
     * but direct instantiation is discouraged; use the factory function `GoatColor()`.
     * @type {typeof GoatColorInternal}
     */
    GoatColorFactory.goatColor = GoatColorInternal;
    GoatColorFactory.ALPHA_STYLE_HINT_PERCENT = ALPHA_STYLE_HINT_PERCENT;
    GoatColorFactory.ALPHA_STYLE_HINT_NUMBER = ALPHA_STYLE_HINT_NUMBER;

    /**
     * An object containing CSS named colors and their hex values.
     * @type {Object<string, string>}
     */
    GoatColorFactory.cssNamedColors = CSS_NAMED_COLORS;

    /**
     * Checks if a given string is a valid color string that can be parsed by GoatColor.
     * @param {string} str - The color string to test.
     * @returns {boolean} True if the string is a valid color format, false otherwise.
     */
    GoatColorFactory.isValidColorString = (str) => {
        return new GoatColorInternal(str).isValid();
    };

    /**
     * Calculates the contrast ratio between two colors, as per WCAG guidelines.
     * Colors with alpha will be flattened against appropriate backgrounds before calculation.
     * @param {string|GoatColorInternal} colorInput1 - The first color (typically foreground).
     * @param {string|GoatColorInternal} colorInput2 - The second color (typically background).
     * @returns {number} The contrast ratio (1 to 21). Returns 1 if either color is invalid.
     */
    GoatColorFactory.getContrastRatio = (colorInput1, colorInput2) => {
        const c1Instance = colorInput1 instanceof GoatColorInternal ? colorInput1 : new GoatColorInternal(colorInput1);
        const c2Instance = colorInput2 instanceof GoatColorInternal ? colorInput2 : new GoatColorInternal(colorInput2);

        if (!c1Instance.isValid() || !c2Instance.isValid()) {
            return 1;
        }

        const effectiveBackground = c2Instance.flatten("white");
        if (!effectiveBackground.isValid()) return 1;

        const effectiveForeground = c1Instance.flatten(effectiveBackground);
        if (!effectiveForeground.isValid()) return 1;

        const lumFg = effectiveForeground.getRelativeLuminance();
        const lumBg = effectiveBackground.getRelativeLuminance();

        const lighter = Math.max(lumFg, lumBg);
        const darker = Math.min(lumFg, lumBg);

        return round((lighter + 0.05) / (darker + 0.05), 2);
    };

    /**
     * Finds the maximum sRGB-representable chroma for a given OKLCH Lightness and Hue.
     * This is primarily for UI color pickers that need to find the maximum sRGB-representable chroma
     * for a given OKLCH Lightness and Hue, constrained by a `chromaSliderMax`.
     * @param {number} lOklch - Lightness (0-100).
     * @param {number} hOklch - Hue (0-360).
     * @param {number} chromaSliderMax - The maximum chroma value to search up to, often corresponding to the maximum value of a UI slider or a practical limit (e.g., 0.4 is a common upper bound for sRGB gamut).
     * @param {number} [precision=0.0005] - The desired precision for the found chroma.
     * @param {number} [iterations=20] - Max iterations for binary search.
     * @returns {number} The maximum chroma representable in sRGB for the given L and H, up to chromaSliderMax.
     */
    GoatColorFactory.getMaxSRGBChroma = function (lOklch, hOklch, chromaSliderMax, precision = 0.0005, iterations = 20) {
        lOklch = Math.max(0, Math.min(100, lOklch));
        hOklch = ((hOklch % 360) + 360) % 360;

        if (lOklch < 0.001 || lOklch > 99.999) {
            return 0;
        }
        if (isNaN(hOklch)) {
            return 0;
        }
        chromaSliderMax = Math.max(0, chromaSliderMax);

        let low = 0;
        let high = chromaSliderMax;
        let maxAchievableC = 0;

        for (let i = 0; i < iterations; i++) {
            const midC = (low + high) / 2;

            if (midC < precision / 2) {
                const zeroChromaColor = new GoatColorInternal(`oklch(${lOklch}% 0 ${hOklch})`);
                if (zeroChromaColor.isValid()) maxAchievableC = 0;
                break;
            }

            const testColor = new GoatColorInternal(`oklch(${lOklch}% ${midC.toFixed(4)} ${hOklch})`);

            if (!testColor.isValid()) {
                high = midC;
                continue;
            }

            const rgb = testColor.toRgb();
            const roundTrippedColor = new GoatColorInternal(`rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`);
            if (!roundTrippedColor.isValid()) {
                high = midC;
                continue;
            }
            const roundTrippedOklch = roundTrippedColor.toOklch();

            const chromaSignificantlyReduced = roundTrippedOklch.c < (midC - precision * 5);

            const lShift = Math.abs(roundTrippedOklch.l - lOklch);
            // L* changed by more than 1.5 (on a 0-100 scale), indicating out-of-gamut or severe distortion
            const lShiftedTooMuch = lShift > 1.5;

            let hNormalizedOriginal = hOklch;
            let hNormalizedRoundTripped = roundTrippedOklch.h;
            let hDiff = Math.abs(hNormalizedRoundTripped - hNormalizedOriginal);
            if (hDiff > 180) hDiff = 360 - hDiff;
            // Hue shifted by more than 5 degrees (ignored for very low chroma as hue is unstable near achromatic)
            const hShiftedTooMuch = hDiff > 5.0 && midC > 0.02;

            if (chromaSignificantlyReduced || lShiftedTooMuch || hShiftedTooMuch) {
                high = midC;
            } else {
                maxAchievableC = midC;
                low = midC;
            }

            if ((high - low) < precision) {
                break;
            }
        }
        return Math.max(0, maxAchievableC);
    };

    return GoatColorFactory;
});