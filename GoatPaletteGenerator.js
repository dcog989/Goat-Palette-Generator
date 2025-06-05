/** Goat Palette Generator
 * @file GoatPaletteGenerator.js
 * @description A script to generate a palette of colors based on increments of HSL or OKLCH values,
 * with opacity support, which can then be exported in various formats.
 * @requires GoatColorToolbox.js for color conversions.
 * @license MIT
 * @author Chase McGoat
 * @createdAt 2025-04-25
 * @lastModified 2025-05-26
 * @version 250526.02
 */

// Global state variables
let activePickerMode = "hsl"; // Tracks whether "hsl" or "oklch" picker is active
let currentGoatColor = null; // Holds the GoatColor instance for the current base color
let debounceTimer; // Timer for debouncing input events
let generatedColors = []; // Array to store generated palette color data
let h1Chars = [];
let isProgrammaticUpdate = false; // Flag to prevent event loops during UI updates
let lastHslHue = 0; // Stores the last known meaningful HSL Hue (0-359)
let lastOklchHue = 0; // Stores the last known meaningful OKLCH Hue (0-359)

// Constants
const OKLCH_C_SLIDER_STATIC_MAX_ABSOLUTE = 0.4; // Reference max absolute chroma for OKLCH C slider
const SVG_COPY_ICON = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true" focusable="false">
    <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
</svg>`;
const SVG_COPIED_ICON = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true" focusable="false">
    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
</svg>`;

/**
 * Cache for frequently accessed DOM elements.
 * @type {Object<string, HTMLElement|NodeListOf<HTMLElement>>}
 */
const elements = {};

/**
 * Normalizes a hue value to be within the 0-359 range.
 * Converts NaN to 0.
 * @param {number|string} hue - The hue value to normalize.
 * @returns {number} The normalized hue value (0-359).
 */
function normalizeHueForDisplay(hue) {
    if (isNaN(hue)) return 0;
    let h = Math.round(parseFloat(hue)) % 360;
    if (h < 0) h += 360;
    if (h === 360) h = 0;
    return h;
}

/**
 * Gets a formatted color string from a GoatColor instance based on the specified format.
 * Handles opacity appropriately for each format.
 * @param {GoatColor} colorInstance - The GoatColor instance.
 * @param {string} format - The desired output format ("hsl", "rgb", "oklch", "hex").
 * @returns {string} The formatted color string, or "Invalid Color" if the instance is invalid.
 */
function getFormattedColorString(colorInstance, format) {
    if (!colorInstance || !colorInstance.isValid()) return "Invalid Color";
    const hasOpacity = colorInstance.a < 1;

    switch (format) {
        case "hsl":
            return hasOpacity ? colorInstance.toHslaString() : colorInstance.toHslString();
        case "rgb":
            return hasOpacity ? colorInstance.toRgbaString() : colorInstance.toRgbString();
        case "oklch":
            return hasOpacity ? colorInstance.toOklchaString() : colorInstance.toOklchString();
        case "hex":
        default:
            return hasOpacity ? colorInstance.toHexa() : colorInstance.toHex();
    }
}

/**
 * Creates a color swatch element and appends it to the given container.
 * The swatch displays the color, its formatted string representation, and a copy button.
 * @param {{hsl: {h: number, s: number, l: number}, o: number}} colorData - Object containing HSL values and opacity (o) for the swatch.
 * @param {HTMLElement} container - The DOM element to append the swatch to.
 */
function createSwatch(colorData, container) {
    const { hsl, o } = colorData;
    const originalHslaString = `hsla(${hsl.h}, ${hsl.s}%, ${hsl.l}%, ${o})`;
    const swatchGoatColor = GoatColor(originalHslaString);

    if (!swatchGoatColor.isValid()) {
        console.warn("Invalid color for swatch:", colorData);
        return;
    }

    const selectedExportFormat = document.querySelector('input[name="export-format"]:checked').value;

    // Create a temporary color instance for display string generation, ensuring alpha style hint is percent
    const tempSwatchColorForDisplay = GoatColor(originalHslaString);
    if (tempSwatchColorForDisplay.isValid() && tempSwatchColorForDisplay.a < 1) {
        tempSwatchColorForDisplay.setAlpha(tempSwatchColorForDisplay.a, GoatColor.ALPHA_STYLE_HINT_PERCENT);
    }
    const displayString = getFormattedColorString(tempSwatchColorForDisplay, selectedExportFormat);

    const swatchRgba = swatchGoatColor.toRgba();
    const colorItem = document.createElement("div");
    colorItem.classList.add("color-item");
    colorItem.draggable = true;
    colorItem.addEventListener('dragstart', (event) => {
        event.dataTransfer.setData('text/plain', originalHslaString); // Use original HSLA for drag data consistency
        event.dataTransfer.effectAllowed = 'copy';
    });

    const colorInputMainDiv = document.createElement("div");
    colorInputMainDiv.classList.add("color-input-main");

    const checkerboardDiv = document.createElement("div");
    checkerboardDiv.classList.add("checkerboard-element");
    checkerboardDiv.style.opacity = (1 - o).toFixed(2);

    const colorOverlayDiv = document.createElement("div");
    colorOverlayDiv.classList.add("color-overlay-element");
    colorOverlayDiv.style.backgroundColor = `rgba(${swatchRgba.r}, ${swatchRgba.g}, ${swatchRgba.b}, ${swatchRgba.a})`;

    const hoverTextDiv = document.createElement("div");
    hoverTextDiv.classList.add("swatch-hover-text");
    hoverTextDiv.textContent = displayString;

    const copyButton = document.createElement("button");
    copyButton.classList.add("swatch-copy-button");
    copyButton.innerHTML = SVG_COPY_ICON + `<span class="visually-hidden">Copy color</span>`;
    copyButton.title = `Copy ${displayString}`;

    copyButton.addEventListener("click", () => {
        navigator.clipboard.writeText(displayString).then(() => {
            copyButton.innerHTML = SVG_COPIED_ICON + `<span class="visually-hidden">Copied!</span>`;
            copyButton.title = "Copied!";
            setTimeout(() => {
                copyButton.innerHTML = SVG_COPY_ICON + `<span class="visually-hidden">Copy color</span>`;
                copyButton.title = `Copy ${displayString}`;
            }, 1500);
        }).catch(err => {
            console.error('Failed to copy text: ', err);
            copyButton.title = "Copy failed";
        });
    });

    colorInputMainDiv.appendChild(checkerboardDiv);
    colorInputMainDiv.appendChild(colorOverlayDiv);
    colorInputMainDiv.appendChild(hoverTextDiv);
    colorInputMainDiv.appendChild(copyButton);
    colorItem.appendChild(colorInputMainDiv);
    container.appendChild(colorItem);
}

/**
 * Generates a CSS linear gradient string for the OKLCH Hue slider track.
 * The gradient sweeps through hues at a given Lightness (l) and Chroma (c).
 * If Chroma is very low, a solid gray gradient is returned.
 * @param {number} l - The Lightness (0-100) at which to generate the hue sweep.
 * @param {number} c - The Chroma (absolute value) at which to generate the hue sweep.
 * @param {number} [steps=12] - The number of color stops in the gradient.
 * @returns {string} The CSS linear-gradient string.
 */
function generateOklchHueTrackGradientString(l, c, steps = 12) {
    if (c < 0.005) { // If chroma is negligible, track is gray
        const grayColor = GoatColor(`oklch(${l}% 0 0)`).toRgbString();
        return `linear-gradient(to right, ${grayColor}, ${grayColor})`;
    }
    let gradientStops = [];
    for (let i = 0; i <= steps; i++) {
        const hue = (i / steps) * 360;
        const hForString = (hue === 360) ? 0 : hue; // Normalize 360 to 0 for oklch string
        const color = GoatColor(`oklch(${l}% ${c.toFixed(4)} ${Math.round(hForString)})`);
        if (color.isValid()) {
            gradientStops.push(`${color.toRgbString()} ${(i / steps) * 100}%`);
        } else {
            // Fallback for out-of-gamut colors during track generation
            gradientStops.push(`rgb(128,128,128) ${(i / steps) * 100}%`);
        }
    }
    return `linear-gradient(to right, ${gradientStops.join(", ")})`;
}

/**
 * Triggers palette generation, debouncing if called rapidly from non-slider events.
 * @param {boolean} [isFromSlider=false] - True if the call originates from a slider's 'input' event.
 */
function generatePaletteDynamically(isFromSlider = false) {
    clearTimeout(debounceTimer);
    if (isFromSlider) {
        generatePalette(); // Generate immediately for slider input
    } else {
        // Debounce for other input types (e.g., number field typing)
        debounceTimer = setTimeout(() => {
            generatePalette();
        }, 250);
    }
}

/**
 * Retrieves and parses a numeric value from a UI element, with a fallback.
 * @param {HTMLElement} element - The input element.
 * @param {Function} defaultValueGetter - A function that returns the default value if parsing fails.
 * @param {Function} [parseFn=parseInt] - The parsing function (e.g., parseInt, parseFloat).
 * @returns {number} The parsed numeric value or the default.
 */
function getCurrentUiDefinedColorParameters() {
    let hslParams = { h: 0, s: 0, l: 0 };
    let oklchParams = { l: 0, cAbs: 0, h: 0, cPercent: 0 }; // h here will be user's direct H input for OKLCH
    let calculatedEffectiveHslHueForDisplayIfSIsZero;
    let effectiveOklchHueIfCAbsIsZero; // Hue to use if color becomes achromatic

    const masterHsl = currentGoatColor.toHsl();
    const masterOklch = currentGoatColor.toOklch();

    if (activePickerMode === "hsl") {
        let uiH = parseInt(elements.baseHueInputSlider.value, 10);
        let uiS = parseInt(elements.baseSaturationInputSlider.value, 10);
        let uiL = parseInt(elements.baseLightnessInputSlider.value, 10);

        hslParams.h = normalizeHueForDisplay(!isNaN(uiH) ? uiH : lastHslHue);
        hslParams.s = !isNaN(uiS) ? uiS : masterHsl.s;
        hslParams.l = !isNaN(uiL) ? uiL : masterHsl.l;

        if (hslParams.s === 0) {
            calculatedEffectiveHslHueForDisplayIfSIsZero = normalizeHueForDisplay(lastHslHue);
        } else {
            calculatedEffectiveHslHueForDisplayIfSIsZero = hslParams.h;
        }

        const hueForOklchDerivation = hslParams.s === 0 ? calculatedEffectiveHslHueForDisplayIfSIsZero : hslParams.h;
        const tempColorFromHslUi = GoatColor(`hsl(${hueForOklchDerivation}, ${hslParams.s}%, ${hslParams.l}%)`);
        const oklchDerived = tempColorFromHslUi.isValid() ? tempColorFromHslUi.toOklch() : masterOklch;

        oklchParams.l = Math.round(oklchDerived.l);
        oklchParams.cAbs = oklchDerived.c;
        // This oklchParams.h is what the *derived* OKLCH color has for H.
        oklchParams.h = normalizeHueForDisplay(oklchParams.cAbs < 0.001 ? lastOklchHue : Math.round(oklchDerived.h));
        effectiveOklchHueIfCAbsIsZero = oklchParams.h; // For HSL mode, this derived H is fine if C=0

        let maxCForDerivedOklch = GoatColor.getMaxSRGBChroma(oklchParams.l, oklchParams.h, OKLCH_C_SLIDER_STATIC_MAX_ABSOLUTE);
        if (maxCForDerivedOklch < 0.0001) maxCForDerivedOklch = OKLCH_C_SLIDER_STATIC_MAX_ABSOLUTE;
        oklchParams.cPercent = Math.round(oklchParams.cAbs > 0 ? (oklchParams.cAbs / maxCForDerivedOklch) * 100 : 0);

    } else { // activePickerMode === "oklch"
        let uiOklchL = parseInt(elements.oklchLInputSlider.value, 10);
        let uiOklchCPercent = parseFloat(elements.oklchCInputSlider.value);
        let uiOklchH = parseInt(elements.oklchHInputSlider.value, 10); // User's direct H input

        oklchParams.l = !isNaN(uiOklchL) ? uiOklchL : Math.round(masterOklch.l);
        // oklchParams.h should reflect the user's direct H input from the UI.
        oklchParams.h = normalizeHueForDisplay(!isNaN(uiOklchH) ? uiOklchH : lastOklchHue);

        if (isNaN(uiOklchCPercent)) {
            let maxCContext = GoatColor.getMaxSRGBChroma(oklchParams.l, oklchParams.h, OKLCH_C_SLIDER_STATIC_MAX_ABSOLUTE);
            if (maxCContext < 0.0001) maxCContext = OKLCH_C_SLIDER_STATIC_MAX_ABSOLUTE;
            uiOklchCPercent = masterOklch.c > 0 ? (masterOklch.c / maxCContext) * 100 : 0;
        }
        oklchParams.cPercent = Math.round(uiOklchCPercent);

        let maxCForCurrentLH = GoatColor.getMaxSRGBChroma(oklchParams.l, oklchParams.h, OKLCH_C_SLIDER_STATIC_MAX_ABSOLUTE);
        if (maxCForCurrentLH < 0.0001) maxCForCurrentLH = OKLCH_C_SLIDER_STATIC_MAX_ABSOLUTE;

        oklchParams.cAbs = (Math.max(0, Math.min(100, oklchParams.cPercent)) / 100) * maxCForCurrentLH;

        // Determine the effective hue IF the current cAbs makes the color achromatic
        if (oklchParams.cAbs < 0.001) {
            effectiveOklchHueIfCAbsIsZero = normalizeHueForDisplay(lastOklchHue);
            // Note: oklchParams.h still holds the user's direct H input value here.
            // syncAllUiFromMasterColor will decide which H to display based on cAbs.
        } else {
            effectiveOklchHueIfCAbsIsZero = oklchParams.h; // If chromatic, effective H is user's H
        }

        const tempColorFromOklchUi = GoatColor(`oklch(${oklchParams.l}% ${oklchParams.cAbs.toFixed(4)} ${oklchParams.cAbs < 0.001 ? effectiveOklchHueIfCAbsIsZero : oklchParams.h})`);
        const hslDerived = tempColorFromOklchUi.isValid() ? tempColorFromOklchUi.toHsl() : masterHsl;

        hslParams.h = normalizeHueForDisplay(hslDerived.s === 0 ? lastHslHue : Math.round(hslDerived.h));
        hslParams.s = Math.round(hslDerived.s);
        hslParams.l = Math.round(hslDerived.l);
        calculatedEffectiveHslHueForDisplayIfSIsZero = hslParams.s === 0 ? normalizeHueForDisplay(lastHslHue) : hslParams.h;
    }

    hslParams.h = normalizeHueForDisplay(hslParams.h);
    calculatedEffectiveHslHueForDisplayIfSIsZero = normalizeHueForDisplay(calculatedEffectiveHslHueForDisplayIfSIsZero);
    oklchParams.h = normalizeHueForDisplay(oklchParams.h); // This is user's H input from OKLCH panel

    hslParams.s = Math.round(Math.max(0, Math.min(100, isNaN(hslParams.s) ? 0 : hslParams.s)));
    hslParams.l = Math.round(Math.max(0, Math.min(100, isNaN(hslParams.l) ? 0 : hslParams.l)));
    oklchParams.l = Math.round(Math.max(0, Math.min(100, isNaN(oklchParams.l) ? 0 : oklchParams.l)));
    oklchParams.cPercent = Math.max(0, Math.min(100, isNaN(oklchParams.cPercent) ? 0 : oklchParams.cPercent));
    oklchParams.cAbs = Math.max(0, isNaN(oklchParams.cAbs) ? 0 : oklchParams.cAbs);

    return {
        hslDirectUi: hslParams,
        oklchDirectUi: oklchParams, // oklchDirectUi.h is H from OKLCH UI input
        opacityBase: currentGoatColor.a,
        effectiveHslHueForDisplayIfSIsZero: calculatedEffectiveHslHueForDisplayIfSIsZero,
        // Add effectiveOklchHueIfCAbsIsZero for clarity if needed by consumers,
        // though syncAllUiFromMasterColor will make this decision for display.
        // For now, oklchDirectUi.h holds the user's input H.
    };
}

/**
 * Generates a GoatColor instance for a palette swatch based on a varied parameter.
 * This function takes a specific parameter to vary (e.g., "hue", "oklch_l"), the new value for that parameter,
 * and base color information (HSL, OKLCH percentage-based components, and opacity).
 * It constructs the appropriate color string (HSLA or OKLCH) and returns a new GoatColor instance.
 * For OKLCH variations, it handles achromatic conditions by using a fallback hue (`lastOklchHueForGen`)
 * and ensures chroma calculations respect sRGB gamut limits.
 *
 * @param {string} varyParam - The color parameter to vary. Possible values:
 *   "hue", "saturation", "lightness" (for HSL variations),
 *   "oklch_l", "oklch_c", "oklch_h" (for OKLCH variations),
 *   "opacity" (applies to the active color model).
 * @param {number} value - The new value for the `varyParam`.
 *   For HSL hue/OKLCH hue: 0-359.
 *   For HSL saturation/lightness, OKLCH L, opacity: 0-100.
 *   For OKLCH C: an absolute chroma value (e.g., 0.0 to ~0.4).
 * @param {{h: number, s: number, l: number}} baseHsl - The base HSL components (h: 0-359, s: 0-100, l: 0-100).
 * @param {{l: number, c: number, h: number}} baseOklchPercent - The base OKLCH components
 *   (l: 0-100, c: 0-100 as percentage of max sRGB chroma for L/H, h: 0-359).
 * @param {number} baseOpacity - The base opacity (0.0 to 1.0).
 * @param {number} oklchStaticMaxAbsolute - The reference maximum absolute chroma (e.g., 0.4) used for
 *   OKLCH C percentage calculations and as a fallback for `getMaxSRGBChroma`.
 * @param {number} lastOklchHueForGen - The last known meaningful OKLCH hue (0-359), used as a fallback
 *   when generating achromatic OKLCH colors to preserve hue intent.
 * @returns {GoatColorInternal} A GoatColor instance representing the new variant color.
 *   May be invalid if the resulting color string is unparseable or out of gamut in a way
 *   that `GoatColor` flags as invalid.
 */
function getPaletteVariantColor(varyParam, value, baseHsl, baseOklchPercent, baseOpacity, oklchStaticMaxAbsolute, lastOklchHueForGen) {
    let tempGoatColor;
    let c_absolute_for_oklch_gen;

    if (varyParam === "oklch_c") {
        c_absolute_for_oklch_gen = value;
    } else {
        const maxCForBaseLH = GoatColor.getMaxSRGBChroma(baseOklchPercent.l, baseOklchPercent.h, oklchStaticMaxAbsolute);
        c_absolute_for_oklch_gen = (baseOklchPercent.c / 100) * (maxCForBaseLH > 0.0001 ? maxCForBaseLH : oklchStaticMaxAbsolute);
    }

    if (c_absolute_for_oklch_gen < 0.001 && varyParam !== "oklch_c") {
        c_absolute_for_oklch_gen = 0.0001;
    }

    let effectiveOklchH = baseOklchPercent.h;
    if (c_absolute_for_oklch_gen < 0.001 && varyParam !== "oklch_h" && varyParam !== "oklch_c") {
        effectiveOklchH = lastOklchHueForGen;
    }

    if (varyParam === "oklch_c" && value < 0.001) {
        effectiveOklchH = lastOklchHueForGen;
    }

    switch (varyParam) {
        case "hue":
            tempGoatColor = GoatColor(`hsla(${value}, ${baseHsl.s}%, ${baseHsl.l}%, ${baseOpacity})`);
            break;
        case "saturation":
            tempGoatColor = GoatColor(`hsla(${baseHsl.h}, ${value}%, ${baseHsl.l}%, ${baseOpacity})`);
            break;
        case "lightness":
            tempGoatColor = GoatColor(`hsla(${baseHsl.h}, ${baseHsl.s}%, ${value}%, ${baseOpacity})`);
            break;
        case "oklch_l":
            tempGoatColor = GoatColor(`oklch(${value}% ${c_absolute_for_oklch_gen.toFixed(4)} ${effectiveOklchH} / ${baseOpacity * 100}%)`);
            break;
        case "oklch_c":
            tempGoatColor = GoatColor(`oklch(${baseOklchPercent.l}% ${value.toFixed(4)} ${effectiveOklchH} / ${baseOpacity * 100}%)`);
            break;
        case "oklch_h":
            tempGoatColor = GoatColor(`oklch(${baseOklchPercent.l}% ${c_absolute_for_oklch_gen.toFixed(4)} ${value} / ${baseOpacity * 100}%)`);
            break;
        case "opacity":
            const currentOpacityVal = Math.max(0, Math.min(1, value / 100.0));
            tempGoatColor = GoatColor(`hsla(${baseHsl.h}, ${baseHsl.s}%, ${baseHsl.l}%, ${currentOpacityVal})`);
            break;
    }
    return tempGoatColor;
}

/**
 * Generates the color palette based on the current UI settings and selected variation parameter.
 * It clears and repopulates the palette container with new swatches.
 */
function generatePalette() {
    if (!currentGoatColor || !currentGoatColor.isValid()) {
        return;
    }

    const uiParams = getCurrentUiDefinedColorParameters();
    const baseHslForGeneration = {
        h: normalizeHueForDisplay(uiParams.hslDirectUi.h),
        s: uiParams.hslDirectUi.s,
        l: uiParams.hslDirectUi.l
    };
    const baseOklchPercentForGeneration = {
        l: uiParams.oklchDirectUi.l,
        c: uiParams.oklchDirectUi.cPercent,
        h: normalizeHueForDisplay(uiParams.oklchDirectUi.h)
    };
    const baseOpacityForGeneration = uiParams.opacityBase;

    let numTotalSwatchesInputEl;
    let varyParamRadioGroupSelector;

    if (activePickerMode === "hsl") {
        numTotalSwatchesInputEl = elements.incrementValueHsl;
        varyParamRadioGroupSelector = '#hslPickerPanel input[name="vary-param-hsl"]:checked';
    } else {
        numTotalSwatchesInputEl = elements.incrementValueOklch;
        varyParamRadioGroupSelector = '#oklchPickerPanel input[name="vary-param-oklch"]:checked';
    }

    let numTotalSwatches = parseInt(numTotalSwatchesInputEl.value, 10);
    const checkedRadio = document.querySelector(varyParamRadioGroupSelector);

    if (!checkedRadio) {
        console.warn("No vary parameter selected for active mode.");
        return;
    }
    let varyParam = checkedRadio.value;
    updateIncrementUI();

    elements.paletteContainer.innerHTML = "";
    generatedColors = [];

    if (isNaN(numTotalSwatches) || numTotalSwatches < 1) {
        numTotalSwatches = 1;
    }

    let baseValue;
    let maxValue;
    let isHueParam = false;

    if (varyParam === "hue") {
        baseValue = baseHslForGeneration.h; maxValue = 359; isHueParam = true;
    } else if (varyParam === "saturation") {
        baseValue = baseHslForGeneration.s; maxValue = 100;
    } else if (varyParam === "lightness") {
        baseValue = baseHslForGeneration.l; maxValue = 100;
    } else if (varyParam === "oklch_l") {
        baseValue = baseOklchPercentForGeneration.l; maxValue = 100;
    } else if (varyParam === "oklch_c") {
        const baseLForMaxC = baseOklchPercentForGeneration.l;
        let baseHForMaxC = baseOklchPercentForGeneration.h;
        const currentBaseChromaAbsolute = uiParams.oklchDirectUi.cAbs;

        if (currentBaseChromaAbsolute < 0.001) {
            baseHForMaxC = normalizeHueForDisplay(lastOklchHue);
        }

        maxValue = GoatColor.getMaxSRGBChroma(baseLForMaxC, baseHForMaxC, OKLCH_C_SLIDER_STATIC_MAX_ABSOLUTE);
        if (maxValue < 0.0001) maxValue = 0.0001;
        baseValue = Math.min(currentBaseChromaAbsolute, maxValue);

    } else if (varyParam === "oklch_h") {
        baseValue = baseOklchPercentForGeneration.h; maxValue = 359; isHueParam = true;
    } else if (varyParam === "opacity") {
        baseValue = baseOpacityForGeneration * 100; maxValue = 100;
    }

    baseValue = Math.round(baseValue * 10000) / 10000;
    if (varyParam !== "oklch_c") {
        maxValue = Math.round(maxValue);
    } else {
        maxValue = Math.round(maxValue * 10000) / 10000;
    }

    for (let i = 0; i < numTotalSwatches; i++) {
        let currentValue;
        if (numTotalSwatches === 1) {
            currentValue = baseValue;
        } else {
            const range = maxValue - baseValue;
            if (Math.abs(range) < 0.0001 && !isHueParam) {
                currentValue = baseValue;
            } else if (isHueParam && (Math.abs(range) < 1 || Math.abs(range - 360) < 1) && Math.round(baseValue) === Math.round(maxValue)) {
                currentValue = baseValue;
            } else if (isHueParam && ((maxValue > baseValue && maxValue - baseValue > 180) || (baseValue > maxValue && baseValue - maxValue < 180 && baseValue - maxValue > 0))) {
                const diff = (maxValue - baseValue + 360) % 360;
                const step = diff / (numTotalSwatches - 1);
                currentValue = (baseValue + step * i + 360) % 360;
            } else {
                currentValue = baseValue + (range / (numTotalSwatches - 1)) * i;
            }
        }

        let finalValueToUse;
        if (isHueParam) {
            finalValueToUse = normalizeHueForDisplay(currentValue);
        } else if (varyParam === "oklch_c") {
            finalValueToUse = parseFloat(currentValue.toFixed(4));
            finalValueToUse = Math.max(0, Math.min(maxValue, finalValueToUse));
        } else {
            finalValueToUse = Math.round(currentValue);
            finalValueToUse = Math.max(0, Math.min(100, finalValueToUse));
        }

        let tempGoatColor;
        tempGoatColor = getPaletteVariantColor(
            varyParam,
            finalValueToUse,
            baseHslForGeneration,
            baseOklchPercentForGeneration,
            baseOpacityForGeneration,
            OKLCH_C_SLIDER_STATIC_MAX_ABSOLUTE,
            lastOklchHue
        );

        if (tempGoatColor && tempGoatColor.isValid()) {
            generatedColors.push({ hsl: tempGoatColor.toHsl(), oklch: tempGoatColor.toOklch(), o: tempGoatColor.a });
        } else { // tempGoatColor is invalid
            console.warn("Generated color invalid for palette:", finalValueToUse, "for", varyParam, tempGoatColor ? tempGoatColor.error : "N/A");
            if (generatedColors.length < numTotalSwatches) { // Ensure we don't exceed desired count
                const fallbackBase = GoatColor(`hsla(${baseHslForGeneration.h}, ${baseHslForGeneration.s}%, ${baseHslForGeneration.l}%, ${baseOpacityForGeneration})`);
                if (fallbackBase.isValid()) {
                    generatedColors.push({ hsl: fallbackBase.toHsl(), oklch: fallbackBase.toOklch(), o: fallbackBase.a });
                } else {
                    console.error("Fallback base HSL color is also invalid. Base HSL input:", baseHslForGeneration, "Opacity:", baseOpacityForGeneration);
                }
            }
        }
    }

    if (generatedColors.length === 0 && currentGoatColor && currentGoatColor.isValid()) {
        generatedColors.push({ hsl: currentGoatColor.toHsl(), oklch: currentGoatColor.toOklch(), o: currentGoatColor.a });
    }

    for (const colorData of generatedColors) {
        createSwatch(colorData, elements.paletteContainer);
    }
}

/**
 * Updates the `currentGoatColor` based on HSL picker UI changes and regenerates the palette.
 * Manages `lastHslHue` and `lastOklchHue`.
 * @param {boolean} [isSliderEvent=false] - True if the call is from a slider's 'input' event.
 */
function updateFromHslPicker(isSliderEvent = false) {
    if (isProgrammaticUpdate) return;

    let h_ui_val = parseInt(elements.baseHueInputSlider.value, 10);
    let s_ui_val = parseInt(elements.baseSaturationInputSlider.value, 10);
    let l_ui_val = parseInt(elements.baseLightnessInputSlider.value, 10);
    const oPercent_ui = parseInt(elements.baseOpacityInputSliderHsl.value, 10);

    let h_for_color_creation, s_for_color_creation, l_for_color_creation;

    let h_input_normalized_hsl = isNaN(h_ui_val) ? NaN : normalizeHueForDisplay(h_ui_val);

    s_for_color_creation = !isNaN(s_ui_val) ? Math.max(0, Math.min(100, s_ui_val)) : currentGoatColor.toHsl().s;
    l_for_color_creation = !isNaN(l_ui_val) ? Math.max(0, Math.min(100, l_ui_val)) : currentGoatColor.toHsl().l;

    if (s_for_color_creation === 0) {
        if (!isNaN(h_input_normalized_hsl)) {
            lastHslHue = h_input_normalized_hsl;
        }
        h_for_color_creation = isNaN(lastHslHue) ? 0 : lastHslHue;
    } else {
        h_for_color_creation = !isNaN(h_input_normalized_hsl) ? h_input_normalized_hsl : (isNaN(lastHslHue) ? 0 : lastHslHue);
        lastHslHue = h_for_color_creation;
    }

    if (!isNaN(oPercent_ui)) {
        currentGoatColor = GoatColor(`hsla(${h_for_color_creation},${s_for_color_creation}%,${l_for_color_creation}%,${oPercent_ui / 100})`);

        if (currentGoatColor.isValid()) {
            const oklchEquiv = currentGoatColor.toOklch();
            if (oklchEquiv.c >= 0.001) {
                lastOklchHue = normalizeHueForDisplay(oklchEquiv.h);
            }
        }
        syncAllUiFromMasterColor();
        generatePaletteDynamically(isSliderEvent);
    } else {
        syncAllUiFromMasterColor();
        generatePaletteDynamically(isSliderEvent);
    }
}

/**
 * Updates `currentGoatColor` based on OKLCH picker UI changes and regenerates the palette.
 * Manages `lastOklchHue`.
 * @param {boolean} [isSliderEvent=false] - True if the call is from a slider's 'input' event.
 */
function updateFromOklchPicker(isSliderEvent = false) {
    if (isProgrammaticUpdate) return;

    let l_ui = parseInt(elements.oklchLInputSlider.value, 10);
    let c_percent_ui = parseFloat(elements.oklchCInputSlider.value);
    let h_input_value = parseInt(elements.oklchHInputSlider.value, 10);
    const o_percent_ui = parseInt(elements.baseOpacityInputSliderOklch.value, 10);

    if (isNaN(l_ui) || isNaN(c_percent_ui) || isNaN(h_input_value) || isNaN(o_percent_ui)) {
        syncAllUiFromMasterColor();
        generatePaletteDynamically(isSliderEvent);
        return;
    }

    let h_input_normalized = normalizeHueForDisplay(h_input_value); // User's H from input
    c_percent_ui = Math.max(0, Math.min(100, c_percent_ui));

    // Use h_input_normalized for calculating max_abs_c for THIS color creation attempt
    let max_abs_c_for_current_lc_and_h_input = GoatColor.getMaxSRGBChroma(l_ui, h_input_normalized, OKLCH_C_SLIDER_STATIC_MAX_ABSOLUTE);
    if (max_abs_c_for_current_lc_and_h_input < 0.0001) max_abs_c_for_current_lc_and_h_input = OKLCH_C_SLIDER_STATIC_MAX_ABSOLUTE;

    let c_absolute_for_creation = (c_percent_ui / 100) * max_abs_c_for_current_lc_and_h_input;
    let hue_for_color_creation;

    if (c_absolute_for_creation < 0.001) {
        // Color is achromatic based on L & C% inputs.
        // Create color using lastOklchHue (which should be the last chromatic H).
        // DO NOT update lastOklchHue with h_input_normalized here.
        hue_for_color_creation = lastOklchHue;
        c_absolute_for_creation = 0;
    } else {
        // Color is chromatic. Create color using user's H input.
        // THIS user's H input (h_input_normalized) becomes the new lastOklchHue.
        hue_for_color_creation = h_input_normalized;
        lastOklchHue = h_input_normalized;
    }
    hue_for_color_creation = normalizeHueForDisplay(hue_for_color_creation); // Should already be normalized

    const o_val_ui = o_percent_ui / 100.0;
    currentGoatColor = GoatColor(`oklch(${l_ui}% ${c_absolute_for_creation.toFixed(4)} ${hue_for_color_creation} / ${o_val_ui})`);

    if (!currentGoatColor.isValid()) {
        currentGoatColor = GoatColor(`oklch(50% 0.1 ${normalizeHueForDisplay(lastOklchHue)})`);
    }

    syncAllUiFromMasterColor();
    generatePaletteDynamically(isSliderEvent);
}

/**
 * Synchronizes all UI elements (sliders, inputs, previews) based on `currentGoatColor`.
 * It handles different logic for the active picker panel versus inactive ones,
 * and whether it's a full refresh (e.g., tab switch) or an update during interaction.
 * @param {boolean} [isInitialSync=false] - True if this is part of an initial setup or tab switch, forcing full refresh of the target panel.
 * @param {string|null} [targetPanelIdForFullUpdate=null] - The ID of the panel that should get a full update if `isInitialSync` is true.
 */
function syncAllUiFromMasterColor(isInitialSync = false, targetPanelIdForFullUpdate = null) {
    if (!currentGoatColor || !currentGoatColor.isValid()) {
        console.warn("syncAllUiFromMasterColor called with invalid currentGoatColor");
        return;
    }
    isProgrammaticUpdate = true;

    const masterHsl = currentGoatColor.toHsl();
    const masterOklch = currentGoatColor.toOklch();
    const currentAlphaPercent = Math.round(currentGoatColor.a * 100);

    // lastHue updates should primarily reflect the master color if it's chromatic,
    // serving as a fallback or for syncing the non-active panel.
    if (masterHsl.s > 0) {
        lastHslHue = normalizeHueForDisplay(masterHsl.h);
    } else if (isNaN(lastHslHue)) {
        lastHslHue = normalizeHueForDisplay(masterHsl.h); // Initialize if needed
    }

    if (masterOklch.c >= 0.001) {
        lastOklchHue = normalizeHueForDisplay(masterOklch.h);
    } else if (isNaN(lastOklchHue)) {
        lastOklchHue = normalizeHueForDisplay(masterOklch.h); // Initialize if needed
    }

    // HSL Panel Update Logic
    const forceFullHslUpdate = (targetPanelIdForFullUpdate === "hslPickerPanel" && isInitialSync) ||
        activePickerMode !== "hsl" ||
        elements.baseHueInputSlider.value === "" ||
        elements.baseSaturationInputSlider.value === "" ||
        elements.baseLightnessInputSlider.value === "";

    let hDisplayHsl, sDisplayHsl, lDisplayHsl;
    if (forceFullHslUpdate) {
        sDisplayHsl = Math.round(masterHsl.s);
        lDisplayHsl = Math.round(masterHsl.l);
        hDisplayHsl = normalizeHueForDisplay(sDisplayHsl === 0 ? lastHslHue : Math.round(masterHsl.h));
    } else {
        let currentUiH_hsl = parseInt(elements.baseHueInputSlider.value, 10);
        let currentUiS_hsl = parseInt(elements.baseSaturationInputSlider.value, 10);
        let currentUiL_hsl = parseInt(elements.baseLightnessInputSlider.value, 10);

        sDisplayHsl = !isNaN(currentUiS_hsl) ? currentUiS_hsl : Math.round(masterHsl.s);
        lDisplayHsl = !isNaN(currentUiL_hsl) ? currentUiL_hsl : Math.round(masterHsl.l);
        hDisplayHsl = normalizeHueForDisplay(sDisplayHsl === 0 ? lastHslHue : (!isNaN(currentUiH_hsl) ? currentUiH_hsl : lastHslHue));
    }
    hDisplayHsl = normalizeHueForDisplay(hDisplayHsl);
    sDisplayHsl = Math.max(0, Math.min(100, Math.round(isNaN(sDisplayHsl) ? 0 : sDisplayHsl)));
    lDisplayHsl = Math.max(0, Math.min(100, Math.round(isNaN(lDisplayHsl) ? 0 : lDisplayHsl)));

    updateUiElementValue(elements.baseHueSlider, hDisplayHsl);
    updateUiElementValue(elements.baseHueInputSlider, hDisplayHsl);
    updateUiElementValue(elements.baseSaturationSlider, sDisplayHsl);
    updateUiElementValue(elements.baseSaturationInputSlider, sDisplayHsl);
    updateUiElementValue(elements.baseLightnessSlider, lDisplayHsl);
    updateUiElementValue(elements.baseLightnessInputSlider, lDisplayHsl);

    // OKLCH Panel Update Logic
    const forceFullOklchUpdate = (targetPanelIdForFullUpdate === "oklchPickerPanel" && isInitialSync) ||
        activePickerMode !== "oklch" ||
        elements.oklchLInputSlider.value === "" ||
        elements.oklchCInputSlider.value === "" ||
        elements.oklchHInputSlider.value === "";

    let oklchLForDisplay, oklchCPercentForDisplay, oklchHueForUiDisplay;

    if (forceFullOklchUpdate) {
        oklchLForDisplay = Math.round(masterOklch.l);
        oklchHueForUiDisplay = normalizeHueForDisplay(masterOklch.c < 0.001 ? lastOklchHue : Math.round(masterOklch.h));

        let maxCForMaster = GoatColor.getMaxSRGBChroma(oklchLForDisplay, oklchHueForUiDisplay, OKLCH_C_SLIDER_STATIC_MAX_ABSOLUTE);
        if (maxCForMaster < 0.0001) maxCForMaster = OKLCH_C_SLIDER_STATIC_MAX_ABSOLUTE;
        oklchCPercentForDisplay = masterOklch.c > 0 ? (masterOklch.c / maxCForMaster) * 100 : 0;
    } else {
        // OKLCH is active, inputs are presumed filled by user or previous sync.
        // L, C%, H for display are taken DIRECTLY from their UI inputs.
        const currentUiL = parseInt(elements.oklchLInputSlider.value, 10);
        const currentUiCPercent = parseFloat(elements.oklchCInputSlider.value);
        const currentUiH = parseInt(elements.oklchHInputSlider.value, 10); // This is the user's H.

        oklchLForDisplay = !isNaN(currentUiL) ? currentUiL : Math.round(masterOklch.l);
        oklchCPercentForDisplay = !isNaN(currentUiCPercent) ? currentUiCPercent : 0;

        // HUE FOR UI DISPLAY IS ALWAYS THE CURRENT VALUE IN THE H INPUT FIELD for this branch.
        // If the H input is somehow NaN (e.g., user cleared it - though other logic should prevent this),
        // then fall back to lastOklchHue.
        oklchHueForUiDisplay = !isNaN(currentUiH) ? currentUiH : lastOklchHue;
    }

    // Normalize all determined display values before updating UI elements
    oklchLForDisplay = Math.round(oklchLForDisplay);
    oklchCPercentForDisplay = Math.max(0, Math.min(100, Math.round(oklchCPercentForDisplay)));
    if (isNaN(oklchCPercentForDisplay)) oklchCPercentForDisplay = 0;
    oklchHueForUiDisplay = normalizeHueForDisplay(oklchHueForUiDisplay);

    // Update UI elements with these determined display values
    updateUiElementValue(elements.oklchLSlider, oklchLForDisplay);
    updateUiElementValue(elements.oklchLInputSlider, oklchLForDisplay);
    updateUiElementValue(elements.oklchCSlider, oklchCPercentForDisplay);
    updateUiElementValue(elements.oklchCInputSlider, oklchCPercentForDisplay);
    updateUiElementValue(elements.oklchHSlider, oklchHueForUiDisplay);
    updateUiElementValue(elements.oklchHInputSlider, oklchHueForUiDisplay); // This sets the H input

    // updateOklchHueSliderState determines if H slider should be disabled
    // based on L, C%, and H that are *now set in the UI*.
    // It will use oklchHueForUiDisplay (which is from H input) to "freeze" if disabling.
    updateOklchHueSliderState(oklchCPercentForDisplay, oklchLForDisplay, oklchHueForUiDisplay);

    // Common UI updates
    updateUiElementValue(elements.baseOpacitySliderHsl, currentAlphaPercent);
    updateUiElementValue(elements.baseOpacityInputSliderHsl, currentAlphaPercent);
    updateUiElementValue(elements.baseOpacitySliderOklch, currentAlphaPercent);
    updateUiElementValue(elements.baseOpacityInputSliderOklch, currentAlphaPercent);

    const previewColorString = currentGoatColor.toRgbaString();
    [elements.colorPreviewBoxHsl_colorOverlay, elements.colorPreviewBoxOklch_colorOverlay].forEach((overlay) => {
        if (overlay && overlay.style.backgroundColor !== previewColorString) overlay.style.backgroundColor = previewColorString;
    });
    const checkerOpacity = (1 - currentGoatColor.a).toFixed(2);
    [elements.colorPreviewBoxHsl_checkerboard, elements.colorPreviewBoxOklch_checkerboard].forEach((checker) => {
        if (checker && checker.style.opacity !== checkerOpacity) checker.style.opacity = checkerOpacity;
    });

    updateAllSliderBackgrounds();
    updateH1CharacterStyles();
    updateDynamicSliderThumbStyles();
    isProgrammaticUpdate = false;
}

/**
 * Updates the background gradients of all color component sliders (HSL, OKLCH, Opacity).
 * The gradients reflect the current color state, providing visual cues for the available range or effect of each slider.
 * If the current base color is invalid, sliders default to neutral gray tracks.
 * For HSL sliders:
 * - Saturation track: Varies saturation from 0% to 100% at current HSL H and L.
 * - Lightness track: Varies lightness from 0% to 100% at current HSL H and S.
 * - Hue track (HSL): Fixed rainbow gradient.
 * For OKLCH sliders:
 * - L-track: Varies OKLCH L from 0% to 100% at current OKLCH C and H.
 * - C-track: Varies OKLCH C from 0 to max sRGB-achievable C at current OKLCH L and H.
 * - H-track (OKLCH): Sweeps hues at a fixed, representative L and C to show available hues.
 * For Opacity sliders:
 * - Shows a gradient from transparent to the current base color (opaque).
 */
function updateAllSliderBackgrounds() {
    if (!currentGoatColor || !currentGoatColor.isValid()) {
        // ... (neutral gray fallback, unchanged) ...
        const neutralGrayDirect = "linear-gradient(to right, #777 0%, #777 100%)";
        const neutralGrayVar = "linear-gradient(to right, #777, #777)";

        if (elements.baseSaturationSlider) {
            elements.baseSaturationSlider.style.setProperty("--background-image-slider-track-saturation", neutralGrayVar);
        }
        if (elements.baseLightnessSlider) {
            elements.baseLightnessSlider.style.setProperty("--background-image-slider-track-lightness", neutralGrayVar);
        }

        elements.oklchLSlider.style.setProperty("--background-image-slider-track-oklch-l", neutralGrayVar);
        elements.oklchCSlider.style.setProperty("--background-image-slider-track-oklch-c", neutralGrayVar);
        elements.oklchHSlider.style.setProperty("--background-image-slider-track-oklch-h", neutralGrayVar);

        const defaultOpacityGradient = `linear-gradient(to right, rgba(128,128,128,0) 0%, rgba(128,128,128,1) 100%)`;
        [elements.opacitySliderElementHsl, elements.opacitySliderElementOklch].forEach((el) => {
            if (el) el.style.setProperty("--background-image-slider-track-opacity", defaultOpacityGradient);
        });
        return;
    }

    const masterRgb = currentGoatColor.toRgb();
    const params = getCurrentUiDefinedColorParameters();

    // For HSL tracks:
    const hsl_s_for_tracks = params.hslDirectUi.s;
    const hsl_l_for_tracks = params.hslDirectUi.l;
    const hsl_h_for_tracks = normalizeHueForDisplay(hsl_s_for_tracks === 0 ? params.effectiveHslHueForDisplayIfSIsZero : params.hslDirectUi.h);

    // For OKLCH tracks:
    const oklch_l_for_track_calc = params.oklchDirectUi.l;
    const oklch_c_abs_for_track_calc = params.oklchDirectUi.cAbs;

    // CRITICAL FOR C-TRACK HUE: Always use the H value from the OKLCH H-input for track context.
    // params.oklchDirectUi.h should reflect this directly when OKLCH is active.
    const oklch_h_for_L_and_C_tracks = normalizeHueForDisplay(params.oklchDirectUi.h);


    const sat_track_gradient_str = `linear-gradient(to right, hsl(${hsl_h_for_tracks}, 0%, ${hsl_l_for_tracks}%) 0%, hsl(${hsl_h_for_tracks}, 100%, ${hsl_l_for_tracks}%) 100%)`;
    if (elements.baseSaturationSlider) {
        elements.baseSaturationSlider.style.setProperty("--background-image-slider-track-saturation", sat_track_gradient_str);
    }

    const lightness_track_gradient_str = `linear-gradient(to right, hsl(${hsl_h_for_tracks}, ${hsl_s_for_tracks}%, 0%) 0%, hsl(${hsl_h_for_tracks}, ${hsl_s_for_tracks}%, 50%) 50%, hsl(${hsl_h_for_tracks}, ${hsl_s_for_tracks}%, 100%) 100%)`;
    if (elements.baseLightnessSlider) {
        elements.baseLightnessSlider.style.setProperty("--background-image-slider-track-lightness", lightness_track_gradient_str);
    }

    const oklch_L_start_color_obj = GoatColor(`oklch(0% ${oklch_c_abs_for_track_calc.toFixed(4)} ${oklch_h_for_L_and_C_tracks})`);
    const oklch_L_mid_color_str = `oklch(50% ${oklch_c_abs_for_track_calc.toFixed(4)} ${oklch_h_for_L_and_C_tracks})`;
    const oklch_L_end_color_obj = GoatColor(`oklch(100% ${oklch_c_abs_for_track_calc.toFixed(4)} ${oklch_h_for_L_and_C_tracks})`);
    const oklch_L_start_rgb = oklch_L_start_color_obj.isValid() ? oklch_L_start_color_obj.toRgbString() : "rgb(0,0,0)";
    const oklch_L_end_rgb = oklch_L_end_color_obj.isValid() ? oklch_L_end_color_obj.toRgbString() : "rgb(255,255,255)";
    elements.oklchLSlider.style.setProperty("--background-image-slider-track-oklch-l",
        `linear-gradient(to right, ${oklch_L_start_rgb} 0%, ${oklch_L_mid_color_str} 50%, ${oklch_L_end_rgb} 100%)`
    );

    // Use oklch_h_for_L_and_C_tracks for C-track context
    const oklch_C_achromatic_start = `oklch(${oklch_l_for_track_calc}% 0 ${oklch_h_for_L_and_C_tracks})`;
    let maxAchievableC = OKLCH_C_SLIDER_STATIC_MAX_ABSOLUTE;
    if (typeof GoatColor.getMaxSRGBChroma === "function") {
        maxAchievableC = GoatColor.getMaxSRGBChroma(oklch_l_for_track_calc, oklch_h_for_L_and_C_tracks, OKLCH_C_SLIDER_STATIC_MAX_ABSOLUTE);
    }
    const oklch_C_gamut_end = `oklch(${oklch_l_for_track_calc}% ${maxAchievableC.toFixed(4)} ${oklch_h_for_L_and_C_tracks})`;
    elements.oklchCSlider.style.setProperty("--background-image-slider-track-oklch-c",
        `linear-gradient(to right, ${oklch_C_achromatic_start} 0%, ${oklch_C_gamut_end} 100%)`
    );

    const gradientLForHueTrack = 70;
    let gradientCForHueTrack;
    if (oklch_c_abs_for_track_calc < 0.01) {
        gradientCForHueTrack = 0;
    } else {
        gradientCForHueTrack = Math.min(oklch_c_abs_for_track_calc, 0.2);
    }
    const oklchHueTrackGradient = generateOklchHueTrackGradientString(gradientLForHueTrack, gradientCForHueTrack);
    elements.oklchHSlider.style.setProperty("--background-image-slider-track-oklch-h", oklchHueTrackGradient);

    const opacityColorGradient = `linear-gradient(to right, rgba(${masterRgb.r},${masterRgb.g},${masterRgb.b},0) 0%, rgba(${masterRgb.r},${masterRgb.g},${masterRgb.b},1) 100%)`;
    [elements.opacitySliderElementHsl, elements.opacitySliderElementOklch].forEach((el) => {
        if (el) el.style.setProperty("--background-image-slider-track-opacity", opacityColorGradient);
    });
}

/**
 * Updates the CSS custom variables for slider thumb background and border colors
 * based on the currentGoatColor, similar to GoatColorPicker's thumb styling.
 * The border will attempt to be a shade of the base hue.
 * @function updateDynamicSliderThumbStyles
 * @returns {void}
 */
function updateDynamicSliderThumbStyles() {
    const rootStyle = document.documentElement.style;

    if (!currentGoatColor || !currentGoatColor.isValid()) {
        rootStyle.removeProperty('--color-bg-slider-thumb');
        rootStyle.removeProperty('--color-border-slider-thumb');
        return;
    }

    // Ensure we are working with an opaque version for the thumb itself.
    const opaqueBaseColorForThumb = GoatColor(currentGoatColor.toHex());
    if (!opaqueBaseColorForThumb.isValid()) {
        rootStyle.removeProperty('--color-bg-slider-thumb');
        rootStyle.removeProperty('--color-border-slider-thumb');
        return;
    }

    const thumbBgColorString = opaqueBaseColorForThumb.toRgbaString();
    rootStyle.setProperty('--color-bg-slider-thumb', thumbBgColorString);

    // For border color, use the hue from the original currentGoatColor,
    // even if its saturation or lightness is extreme.
    const originalHsl = currentGoatColor.toHsl(); // Get HSL from the potentially (a)chromatic color
    const baseHueForBorder = Math.round(originalHsl.h); // This is the hue we want to maintain for the border

    // Determine saturation for the border. Aim for visible saturation unless original is truly gray.
    const borderSaturation = originalHsl.s < 5 ? 10 : Math.max(30, Math.min(originalHsl.s, 75));

    let chosenBorderColorString;
    const thumbBgHsl = opaqueBaseColorForThumb.toHsl(); // HSL of the thumb's actual background

    // Candidates for border lightness: one darker, one lighter than the thumb's background lightness
    // but using the baseHueForBorder and borderSaturation.
    const l_darker_border_val = Math.max(5, thumbBgHsl.l - 30);
    const l_lighter_border_val = Math.min(95, thumbBgHsl.l + 30);

    const darkBorderCandidate = GoatColor(`hsl(${baseHueForBorder}, ${borderSaturation}%, ${l_darker_border_val}%)`);
    const lightBorderCandidate = GoatColor(`hsl(${baseHueForBorder}, ${borderSaturation}%, ${l_lighter_border_val}%)`);

    const fallbackDarkGray = 'hsl(0, 0%, 25%)';
    const fallbackLightGray = 'hsl(0, 0%, 75%)';
    let fallbackBorder = thumbBgHsl.l > 50 ? fallbackDarkGray : fallbackLightGray;

    if (typeof GoatColor.getContrastRatio !== 'function') {
        chosenBorderColorString = fallbackBorder;
    } else {
        let primaryCandidate, secondaryCandidate;
        let primaryContrast = 0, secondaryContrast = 0;

        // Determine which candidate (darker or lighter border) is preferred based on thumb's background lightness
        if (thumbBgHsl.l >= 50) { // Light thumb background, prefer darker border
            primaryCandidate = darkBorderCandidate;
            secondaryCandidate = lightBorderCandidate;
        } else { // Dark thumb background, prefer lighter border
            primaryCandidate = lightBorderCandidate;
            secondaryCandidate = darkBorderCandidate;
        }

        if (primaryCandidate.isValid()) {
            primaryContrast = GoatColor.getContrastRatio(primaryCandidate, opaqueBaseColorForThumb);
        }
        if (secondaryCandidate.isValid()) {
            secondaryContrast = GoatColor.getContrastRatio(secondaryCandidate, opaqueBaseColorForThumb);
        }

        const CONTRAST_THRESHOLD_BORDER = 1.5; // Slightly lower threshold for chromatic border

        if (primaryCandidate.isValid() && primaryContrast >= CONTRAST_THRESHOLD_BORDER) {
            chosenBorderColorString = primaryCandidate.toRgbaString();
        } else if (secondaryCandidate.isValid() && secondaryContrast >= CONTRAST_THRESHOLD_BORDER) {
            chosenBorderColorString = secondaryCandidate.toRgbaString();
        } else {
            // Neither chromatic candidate met the threshold well.
            // Pick the better of the valid chromatic candidates, or use gray fallback.
            if (primaryCandidate.isValid() && secondaryCandidate.isValid()) {
                chosenBorderColorString = (primaryContrast >= secondaryContrast) ? primaryCandidate.toRgbaString() : secondaryCandidate.toRgbaString();
            } else if (primaryCandidate.isValid()) {
                chosenBorderColorString = primaryCandidate.toRgbaString();
            } else if (secondaryCandidate.isValid()) {
                chosenBorderColorString = secondaryCandidate.toRgbaString();
            } else { // Both chromatic candidates were invalid (should be rare)
                chosenBorderColorString = fallbackBorder;
            }
        }
    }
    rootStyle.setProperty('--color-border-slider-thumb', chosenBorderColorString);
}

/**
 * Updates the enabled/disabled state of the OKLCH Hue slider and its input field.
 * The Hue slider is disabled if the effective absolute chroma (calculated from the provided
 * OKLCH L, C%, and H display value) is below a small threshold (i.e., the color is achromatic).
 * When disabled, the slider and input are set to the `oklchH_displayValue` to visually "freeze"
 * the hue at its last meaningful or user-set value.
 * @param {number} oklchCPercent - The current OKLCH Chroma percentage (0-100) from the UI.
 * @param {number} oklchL - The current OKLCH Lightness (0-100) from the UI.
 * @param {number} oklchH_displayValue - The current OKLCH Hue (0-359) to display, which the slider
 *                                       should reflect even if being disabled.
 */
function updateOklchHueSliderState(oklchCPercent, oklchL, oklchH_displayValue) {
    let cAbsolute;
    let lForMaxChroma = parseFloat(oklchL); // L value currently in UI
    if (isNaN(lForMaxChroma) && currentGoatColor && currentGoatColor.isValid()) {
        lForMaxChroma = currentGoatColor.toOklch().l;
    } else if (isNaN(lForMaxChroma)) {
        lForMaxChroma = 50;
    }

    // H value currently in UI (passed as oklchH_displayValue)
    let hForMaxChroma = normalizeHueForDisplay(oklchH_displayValue);

    if (typeof GoatColor.getMaxSRGBChroma === "function") {
        const maxC = GoatColor.getMaxSRGBChroma(lForMaxChroma, hForMaxChroma, OKLCH_C_SLIDER_STATIC_MAX_ABSOLUTE);
        cAbsolute = (oklchCPercent / 100) * (maxC > 0.0001 ? maxC : OKLCH_C_SLIDER_STATIC_MAX_ABSOLUTE);
    } else {
        cAbsolute = (oklchCPercent / 100) * OKLCH_C_SLIDER_STATIC_MAX_ABSOLUTE;
    }

    const isDisabled = cAbsolute < 0.001;

    if (elements.oklchHSlider.disabled !== isDisabled) {
        elements.oklchHSlider.disabled = isDisabled;
        elements.oklchHInputSlider.disabled = isDisabled;
    }

    // Critical: Always set the H slider and input to oklchH_displayValue.
    // If disabled, this "freezes" it at the value it had when C went to 0 (which was user's H input).
    // If enabled, this just confirms its current value.
    updateUiElementValue(elements.oklchHSlider, oklchH_displayValue);
    updateUiElementValue(elements.oklchHInputSlider, oklchH_displayValue);
}

/**
 * Updates the value of a UI element (typically an input or range slider) only if it's different
 * from the new value. This helps prevent unnecessary UI redraws or event triggers.
 * @param {HTMLElement} element - The DOM element to update.
 * @param {string|number} value - The new value to set.
 */
function updateUiElementValue(element, value) {
    if (!element) return;
    const stringValue = String(value);
    if (element.value !== stringValue) {
        element.value = stringValue;
    }
}

/**
 * Sets up synchronized behavior between a range slider and a number input field.
 * Changes to one update the other. Handles clamping values to min/max attributes.
 * Also triggers an update callback and updates dependent UI like slider track backgrounds
 * or other control states (e.g., OKLCH Hue slider disable state).
 * @param {HTMLInputElement} slider - The range slider element.
 * @param {HTMLInputElement} input - The number input element.
 * @param {Function} updateCallback - A callback function to execute when the value changes,
 *                                    typically to update the main color or regenerate the palette.
 *                                    It's called with `true` for 'input' events (rapid updates)
 *                                    and `false` for 'change' events (finalized updates).
 */
function setupSliderInputPair(slider, input, updateCallback) {
    slider.addEventListener("input", () => {
        if (isProgrammaticUpdate) return;
        let value = Math.round(parseFloat(slider.value));
        isProgrammaticUpdate = true;
        input.value = value;
        isProgrammaticUpdate = false;
        updateCallback(true);
    });

    input.addEventListener("input", () => {
        if (isProgrammaticUpdate) return;

        let numericValue = parseFloat(input.value);
        const min = parseFloat(input.min);
        const max = parseFloat(input.max);

        if (!isNaN(numericValue)) {
            if (numericValue > max) {
                numericValue = max;
                input.value = max;
            } else if (numericValue < min && input.value.length >= String(min).length) {
                numericValue = min;
            }
            isProgrammaticUpdate = true;
            if (slider) slider.value = Math.max(min, Math.min(max, numericValue));
            isProgrammaticUpdate = false;
        }


        if (input.id.startsWith("oklch-c")) {
            const currentHInputValue = parseInt(elements.oklchHInputSlider.value, 10);
            const currentCInputValue = parseFloat(elements.oklchCInputSlider.value);
            const currentLInputValue = parseInt(elements.oklchLInputSlider.value, 10);
            updateOklchHueSliderState(currentCInputValue, currentLInputValue, isNaN(currentHInputValue) ? lastOklchHue : currentHInputValue);
        } else if (input.id.startsWith("oklch-l") || input.id.startsWith("oklch-h")) {
            const currentHInputValue = parseInt(elements.oklchHInputSlider.value, 10);
            const currentCInputValue = parseFloat(elements.oklchCInputSlider.value);
            const currentLInputValue = parseInt(elements.oklchLInputSlider.value, 10);
            if (!isNaN(currentCInputValue)) {
                updateOklchHueSliderState(currentCInputValue, currentLInputValue, isNaN(currentHInputValue) ? lastOklchHue : currentHInputValue);
            }
        }

        if (input.id.startsWith("oklch-") || input.id.startsWith("base-")) {
            updateAllSliderBackgrounds();
        }
    });

    input.addEventListener("change", () => {
        if (isProgrammaticUpdate) return;
        let numericValue = parseFloat(input.value);
        const min = parseFloat(input.min);
        const max = parseFloat(input.max);

        if (isNaN(numericValue) || numericValue < min) {
            numericValue = min;
        } else if (numericValue > max) {
            numericValue = max;
        }
        const finalValue = input.classList.contains('increment-value-inline') ? Math.round(numericValue) : parseFloat(numericValue.toFixed(input.step && input.step.includes('.') ? String(input.step).split('.')[1].length : 0));

        isProgrammaticUpdate = true;
        input.value = finalValue;
        if (slider) slider.value = finalValue;
        isProgrammaticUpdate = false;

        if (updateCallback) updateCallback(false);
    });
}

/**
 * Gets the currently active opacity input element based on the `activePickerMode`.
 * @returns {HTMLInputElement|null} The active opacity input element, or null if not found.
 */
function getActiveOpacityInput() {
    return activePickerMode === "hsl" ? elements.baseOpacityInputSliderHsl : elements.baseOpacityInputSliderOklch;
}

/**
 * Wraps each character of the main H1 title in a span for individual styling
 * and caches these spans. This function should be called once during initialization
 * to prepare the H1 element for dynamic styling of its characters.
 * If the H1 element or its text content is not found, the function will exit early.
 * Spaces within the H1 text are also wrapped but made transparent.
 * @function initializeH1Styles
 * @returns {void}
 */
function initializeH1Styles() {
    const h1 = document.querySelector('h1');
    if (!h1 || !h1.textContent) return;

    const text = h1.textContent;
    h1.innerHTML = '';
    h1Chars = [];

    for (let i = 0; i < text.length; i++) {
        const span = document.createElement('span');
        span.className = 'h1-char';
        span.textContent = text[i];
        if (text[i] === ' ') {
            span.style.backgroundColor = 'transparent';
        }
        h1.appendChild(span);
        h1Chars.push(span);
    }
}

/**
 * Finds a text color that contrasts sufficiently with a given background color,
 * while attempting to maintain a specified target hue for the text.
 * It iterates through lightness values for the text color (with a fixed saturation)
 * to find a candidate that meets a target contrast ratio (4.0).
 * If the target contrast cannot be met, it returns the color that achieved the highest
 * contrast found during the search, or a very light/dark fallback if no suitable
 * candidate was found.
 * @function findContrastingTextColor
 * @param {GoatColorInternal} bgColorInstance - The GoatColor instance representing the background color.
 * @param {number} targetHue - The desired hue (0-359) for the text color.
 * @returns {GoatColorInternal} A GoatColor instance for the text color that meets the contrast
 * requirements, or the best fallback found.
 */
function findContrastingTextColor(bgColorInstance, targetHue) {
    const TARGET_CONTRAST = 4.0;
    const TEXT_SATURATION = 70;

    if (!bgColorInstance || !bgColorInstance.isValid()) {
        return GoatColor(targetHue > 180 && targetHue < 300 ? "white" : "black");
    }

    const bgLuminance = bgColorInstance.getRelativeLuminance();
    let bestTextColor = null;
    let maxFoundContrast = 0;

    const iterateUp = bgLuminance < 0.4;

    const startL = iterateUp ? 50 : 49;
    const endL = iterateUp ? 100 : 0;
    const stepL = iterateUp ? 1 : -1;

    for (let l = startL; iterateUp ? l <= endL : l >= endL; l += stepL) {
        const textColorCandidate = GoatColor(`hsl(${targetHue}, ${TEXT_SATURATION}%, ${l}%)`);
        if (textColorCandidate.isValid()) {
            const currentContrast = GoatColor.getContrastRatio(textColorCandidate, bgColorInstance);
            if (currentContrast >= TARGET_CONTRAST) {
                return textColorCandidate;
            }
            if (currentContrast > maxFoundContrast) {
                maxFoundContrast = currentContrast;
                bestTextColor = textColorCandidate;
            }
        }
    }

    if (bestTextColor) return bestTextColor;

    return GoatColor(bgLuminance > 0.5 ? `hsl(${targetHue}, ${TEXT_SATURATION}%, 5%)` : `hsl(${targetHue}, ${TEXT_SATURATION}%, 95%)`);
}

/**
 * Updates the background and text colors of each character (span) in the main H1 title.
 * The background color for each character is determined by its position and the currently
 * selected "vary parameter" in the active color picker, creating a visual gradient
 * that reflects the selected parameter's range. The text color for each character uses
 * an appropriate hue (either the varying hue or the base hue) and is adjusted
 * by `findContrastingTextColor` to ensure a minimum contrast ratio for readability.
 * Spaces are ignored for hue calculation and styled transparently.
 * If `currentGoatColor` is invalid, it defaults to a static hue sweep for backgrounds.
 * This function relies on `h1Chars` having been populated by `initializeH1Styles`.
 * @function updateH1CharacterStyles
 * @returns {void}
 */
function updateH1CharacterStyles() {
    if (!h1Chars.length) return;

    const nonSpaceChars = h1Chars.filter(span => span.textContent.trim() !== '');
    const numLetters = nonSpaceChars.length;
    if (numLetters === 0) return;

    if (!currentGoatColor || !currentGoatColor.isValid()) {
        let letterVisualIndexFallback = 0;
        h1Chars.forEach(span => {
            if (span.textContent.trim() === '') {
                span.style.backgroundColor = 'transparent';
                span.style.color = 'inherit';
                return;
            }
            const fraction = numLetters <= 1 ? 0.5 : letterVisualIndexFallback / (numLetters - 1);
            const bgHueFallback = Math.round(fraction * 359);
            const bgColorInstanceFallback = GoatColor(`hsl(${bgHueFallback}, 100%, 50%)`);

            if (bgColorInstanceFallback.isValid()) {
                span.style.backgroundColor = bgColorInstanceFallback.toRgbString();
                const textColorInstanceFallback = findContrastingTextColor(bgColorInstanceFallback, bgHueFallback);
                if (textColorInstanceFallback.isValid()) {
                    span.style.color = textColorInstanceFallback.toRgbString();
                } else {
                    span.style.color = bgColorInstanceFallback.getRelativeLuminance() > 0.5 ? 'black' : 'white';
                }
            } else {
                span.style.backgroundColor = 'hsl(0 0% 50%)'; span.style.color = 'white';
            }
            letterVisualIndexFallback++;
        });
        return;
    }

    let varyParam;
    const activeRadioSelector = activePickerMode === "hsl" ?
        '#hslPickerPanel input[name="vary-param-hsl"]:checked' :
        '#oklchPickerPanel input[name="vary-param-oklch"]:checked';
    const checkedRadio = document.querySelector(activeRadioSelector);

    varyParam = checkedRadio ? checkedRadio.value : (activePickerMode === "hsl" ? "hue" : "oklch_h");

    const baseHsl = currentGoatColor.toHsl();
    const baseOklch = currentGoatColor.toOklch();

    let letterVisualIndex = 0;
    h1Chars.forEach(span => {
        if (span.textContent.trim() === '') {
            span.style.backgroundColor = 'transparent';
            span.style.color = 'inherit';
            return;
        }

        const fraction = numLetters <= 1 ? 0.5 : letterVisualIndex / (numLetters - 1);
        let bgColorInstance;
        let currentStepValue;
        let hueForTextColor;

        switch (varyParam) {
            case "hue":
                currentStepValue = Math.round(fraction * 359);
                bgColorInstance = GoatColor(`hsl(${currentStepValue}, ${Math.round(baseHsl.s)}%, ${Math.round(baseHsl.l)}%)`);
                hueForTextColor = currentStepValue;
                break;
            case "saturation":
                currentStepValue = Math.round(fraction * 100);
                bgColorInstance = GoatColor(`hsl(${Math.round(baseHsl.h)}, ${currentStepValue}%, ${Math.round(baseHsl.l)}%)`);
                hueForTextColor = Math.round(baseHsl.h);
                break;
            case "lightness":
                currentStepValue = Math.round(fraction * 100);
                bgColorInstance = GoatColor(`hsl(${Math.round(baseHsl.h)}, ${Math.round(baseHsl.s)}%, ${currentStepValue}%)`);
                hueForTextColor = Math.round(baseHsl.h);
                break;
            case "oklch_l":
                currentStepValue = Math.round(fraction * 100);
                const effectiveHForOklchLBg = (baseOklch.c < 0.005 && typeof lastOklchHue !== 'undefined') ? lastOklchHue : Math.round(baseOklch.h);
                bgColorInstance = GoatColor(`oklch(${currentStepValue}% ${baseOklch.c.toFixed(4)} ${effectiveHForOklchLBg})`);
                hueForTextColor = Math.round(baseOklch.h);
                break;
            case "oklch_c":
                currentStepValue = fraction * OKLCH_C_SLIDER_STATIC_MAX_ABSOLUTE;
                const effectiveHForOklchCBg = (currentStepValue < 0.005 && typeof lastOklchHue !== 'undefined') ? lastOklchHue : Math.round(baseOklch.h);
                bgColorInstance = GoatColor(`oklch(${Math.round(baseOklch.l)}% ${currentStepValue.toFixed(4)} ${effectiveHForOklchCBg})`);
                hueForTextColor = Math.round(baseOklch.h);
                break;
            case "oklch_h":
                currentStepValue = Math.round(fraction * 359);
                bgColorInstance = GoatColor(`oklch(${Math.round(baseOklch.l)}% ${baseOklch.c.toFixed(4)} ${currentStepValue})`);
                hueForTextColor = currentStepValue;
                break;
            case "opacity":
                let opaqueBaseColorStr;
                if (activePickerMode === "hsl") {
                    opaqueBaseColorStr = `hsl(${Math.round(baseHsl.h)}, ${Math.round(baseHsl.s)}%, ${Math.round(baseHsl.l)}%)`;
                    hueForTextColor = Math.round(baseHsl.h);
                } else {
                    opaqueBaseColorStr = `oklch(${Math.round(baseOklch.l)}% ${baseOklch.c.toFixed(4)} ${Math.round(baseOklch.h)})`;
                    hueForTextColor = Math.round(baseOklch.h);
                }
                const tempOpaqueColor = GoatColor(opaqueBaseColorStr);
                if (tempOpaqueColor.isValid()) {
                    tempOpaqueColor.setAlpha(fraction);
                    bgColorInstance = tempOpaqueColor.flatten("white");
                } else {
                    bgColorInstance = GoatColor("hsl(0 0% 50%)");
                    hueForTextColor = 0;
                }
                break;
            default:
                currentStepValue = Math.round(fraction * 359);
                bgColorInstance = GoatColor(`hsl(${currentStepValue}, 100%, 50%)`);
                hueForTextColor = currentStepValue;
        }

        if (bgColorInstance && bgColorInstance.isValid()) {
            span.style.backgroundColor = bgColorInstance.toRgbString();
            const textColorInstance = findContrastingTextColor(bgColorInstance, hueForTextColor);
            if (textColorInstance.isValid()) {
                span.style.color = textColorInstance.toRgbString();
            } else {
                span.style.color = bgColorInstance.getRelativeLuminance() > 0.5 ? 'black' : 'white';
            }
        } else {
            span.style.backgroundColor = 'hsl(0 0% 50%)';
            span.style.color = 'white';
        }
        letterVisualIndex++;
    });
}

/**
 * Generates a header comment string for exported palette files.
 * The comment includes information about the base color (in the format of the active picker mode),
 * the parameter that was varied, the number of swatches, and the export format.
 * @returns {string} The generated header comment.
 */
function generateExportHeaderComment() {
    if (!currentGoatColor || !currentGoatColor.isValid()) return "/* Base color invalid */\n\n";

    const numSwatchesInputEl = activePickerMode === "hsl" ? elements.incrementValueHsl : elements.incrementValueOklch;
    const numSwatches = parseInt(numSwatchesInputEl.value, 10) || 1;

    const varyParamRadioGroup = activePickerMode === "hsl" ? elements.varyParamRadiosHsl : elements.varyParamRadiosOklch;
    let varyParamDataName = "Parameter";
    varyParamRadioGroup.forEach(radio => {
        if (radio.checked) {
            varyParamDataName = radio.getAttribute('data-param-name') || "Parameter";
        }
    });

    let exportFormat = document.querySelector('input[name="export-format"]:checked').value;

    let baseColorStringForComment;
    const opacityForBaseComment = currentGoatColor.a;

    if (activePickerMode === "hsl") {
        const baseHsl = currentGoatColor.toHsl();
        if (Math.abs(opacityForBaseComment - 1) < 1e-9) {
            baseColorStringForComment = `hsl(${Math.round(baseHsl.h)}° ${Math.round(baseHsl.s)}% ${Math.round(baseHsl.l)}%)`;
        } else {
            baseColorStringForComment = `hsla(${Math.round(baseHsl.h)}° ${Math.round(baseHsl.s)}% ${Math.round(baseHsl.l)}% ${parseFloat(opacityForBaseComment.toFixed(2))})`;
        }
    } else {
        const baseOklch = currentGoatColor.toOklch();
        if (Math.abs(opacityForBaseComment - 1) < 1e-9) {
            baseColorStringForComment = `oklch(${Math.round(baseOklch.l)}% ${baseOklch.c.toFixed(3)} ${Math.round(baseOklch.h)})`;
        } else {
            baseColorStringForComment = `oklch(${Math.round(baseOklch.l)}% ${baseOklch.c.toFixed(3)} ${Math.round(baseOklch.h)} / ${parseFloat(opacityForBaseComment.toFixed(2))})`;
        }
    }

    return `/*\n * Palette based on ${baseColorStringForComment}\n * Varying: ${varyParamDataName}, Number of Swatches: ${numSwatches}\n * Export Format: ${exportFormat.toUpperCase()}\n */\n\n`;
}

/**
 * Generates a filename for exported palette files based on a base name,
 * the current date and time (YYMMDD-HHMM format), and the file extension.
 * @param {string} base - The base name for the file (e.g., "palette").
 * @param {string} extension - The file extension (e.g., "css", "xml").
 * @returns {string} The generated filename.
 */
function generateExportFilename(base, extension) {
    const now = new Date();
    const year = String(now.getFullYear()).slice(-2);
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');

    return `${base}-${year}${month}${day}-${hours}${minutes}.${extension}`;
}

/**
 * Triggers a browser download for the given content.
 * @param {string} content - The content to be downloaded.
 * @param {string} filename - The desired filename for the download.
 * @param {string} contentType - The MIME type of the content (e.g., "text/css", "application/xml").
 */
function downloadFile(content, filename, contentType) {
    const blob = new Blob([content], { type: contentType });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
    }, 100);
}

/**
 * Processes the array of `generatedColors` for export.
 * For each color, it creates a GoatColor instance, sets its alpha style hint,
 * formats it according to the selected export format, and then uses a callback
 * to generate the specific line item for the export file (e.g., a CSS variable or XML element).
 * @param {string} exportFormat - The target export format (e.g., "hsl", "hex").
 * @param {Function} individualColorFormatter - A callback function that takes
 *   `(colorInstance, index, formattedString, currentExportFormat)` and returns
 *   a string for that individual color line in the export.
 * @returns {string|null} A string containing all formatted color items joined together,
 *                        or null if no colors were generated.
 */
function processColorsForExport(exportFormat, individualColorFormatter) {
    if (generatedColors.length === 0) {
        alert("Generate a palette first!");
        return null;
    }

    const opacityInputForHint = getActiveOpacityInput();
    const opacityStyleHint = opacityInputForHint.value.includes("%") ? GoatColor.ALPHA_STYLE_HINT_PERCENT : GoatColor.ALPHA_STYLE_HINT_NUMBER;

    let outputItems = [];
    generatedColors.forEach((colorData, index) => {
        const hslaStringInput = `hsla(${colorData.hsl.h}, ${colorData.hsl.s}%, ${colorData.hsl.l}%, ${colorData.o})`;
        const colorInstance = GoatColor(hslaStringInput);
        if (!colorInstance.isValid()) {
            console.warn("Skipping invalid color during export:", colorData);
            return;
        }
        colorInstance.setAlpha(colorData.o, opacityStyleHint);
        const formattedColorString = getFormattedColorString(colorInstance, exportFormat);
        outputItems.push(individualColorFormatter(colorInstance, index, formattedColorString, exportFormat));
    });
    return outputItems.join('');
}

/**
 * Exports the currently generated palette as a CSS file containing CSS custom properties.
 * The file includes a header comment with palette details.
 */
function exportCssPalette() {
    const exportFormat = document.querySelector('input[name="export-format"]:checked').value;
    const comment = generateExportHeaderComment();

    const cssVarLines = processColorsForExport(exportFormat, (colorInstance, index, formattedString) => {
        const varName = `--color-${String(index + 1).padStart(3, "0")}`;
        return `  ${varName}: ${formattedString};\n`;
    });

    if (cssVarLines === null) return;

    const cssContent = comment + ":root {\n" + cssVarLines + "}";
    downloadFile(cssContent, generateExportFilename("palette", "css"), "text/css");
}

/**
 * Exports the currently generated palette as an XML file.
 * Each color is represented as a `<myColor>` element with attributes for its value and name.
 * The file includes a header comment with palette details.
 */
function exportXmlPalette() {
    const exportFormat = document.querySelector('input[name="export-format"]:checked').value;
    const comment = generateExportHeaderComment().replace(/\/\*/g, "<!--").replace(/\*\//g, "-->");

    const xmlColorLines = processColorsForExport(exportFormat, (colorInstance, index, formattedString, currentExportFormat) => {
        let attrName = currentExportFormat + (colorInstance.a < 1 ? "a" : "") + "Value";
        if (currentExportFormat === "hex" && colorInstance.a < 1) attrName = "hexaValue";
        else if (currentExportFormat === "hex") attrName = "hexValue";

        const name = `color${String(index + 1).padStart(3, "0")}`;

        const valueAttrEscaped = formattedString
            .replace(/&/g, "&" + "amp;")
            .replace(/</g, "&" + "lt;")
            .replace(/>/g, "&" + "gt;")
            .replace(/"/g, "&" + "quot;")
            .replace(/'/g, "&" + "apos;");

        return `    <myColor ${attrName}="${valueAttrEscaped}" name="${name}" />\n`;
    });

    if (xmlColorLines === null) return;

    const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>\n${comment}<Palette>\n\n${xmlColorLines}\n</Palette>`;
    downloadFile(xmlContent, generateExportFilename("palette", "xml"), "application/xml");
}

/**
 * Handles the 'drop' event on color preview boxes.
 * Attempts to parse the dropped text data as a color string. If valid,
 * updates the `currentGoatColor`, relevant `lastHue` values, syncs the UI,
 * and regenerates the palette.
 * @param {DragEvent} event - The drag event object.
 */
function handleDropOnPicker(event) {
    event.preventDefault();
    elements.colorPreviewBoxHsl.classList.remove('drag-over');
    elements.colorPreviewBoxOklch.classList.remove('drag-over');

    const colorString = event.dataTransfer.getData('text/plain');
    if (colorString) {
        const newColor = GoatColor(colorString);
        if (newColor.isValid()) {
            currentGoatColor = newColor;
            const newHsl = newColor.toHsl();
            const newOklch = newColor.toOklch();

            if (newHsl.s > 0) {
                lastHslHue = normalizeHueForDisplay(newHsl.h);
            } else {
                if (isNaN(lastHslHue)) lastHslHue = normalizeHueForDisplay(newHsl.h);
            }

            if (newOklch.c >= 0.001) {
                lastOklchHue = normalizeHueForDisplay(newOklch.h);
            } else {
                if (isNaN(lastOklchHue)) lastOklchHue = normalizeHueForDisplay(newOklch.h);
            }

            const targetPanelId = activePickerMode === "hsl" ? "hslPickerPanel" : "oklchPickerPanel";
            syncAllUiFromMasterColor(true, targetPanelId);
            generatePaletteDynamically(false);
        } else {
            console.warn("Dropped color string is invalid:", colorString, newColor.error);
        }
    }
}

/**
 * Shows or hides the OKLCH info panel based on whether the OKLCH picker is active.
 */
function updateInfoPanel() {
    if (!elements.oklchInfoPanel) return;

    if (activePickerMode === "oklch") {
        elements.oklchInfoPanel.classList.add('visible');
    } else {
        elements.oklchInfoPanel.classList.remove('visible');
    }
}

/**
 * Updates the UI related to palette increment controls.
 * This includes:
 * - Highlighting the slider group corresponding to the selected "vary parameter".
 * - Updating the dynamic label suffix to reflect the selected parameter.
 * - Showing/hiding the increment input field for the active picker mode (HSL or OKLCH).
 */
function updateIncrementUI() {
    let labelSuffixElement;
    let selectedRadio = null;
    let paramName = "Parameter";

    document.querySelectorAll('.slider-group').forEach(sg => {
        sg.classList.remove('selected-for-increment');
    });

    if (activePickerMode === "hsl") {
        labelSuffixElement = elements.dynamicIncrementLabelHsl_suffix;
        selectedRadio = document.querySelector('#hslPickerPanel input[name="vary-param-hsl"]:checked');
    } else {
        labelSuffixElement = elements.dynamicIncrementLabelOklch_suffix;
        selectedRadio = document.querySelector('#oklchPickerPanel input[name="vary-param-oklch"]:checked');
    }

    if (selectedRadio) {
        paramName = selectedRadio.getAttribute('data-param-name') || paramName;
        const parentSliderGroup = selectedRadio.closest('.slider-group');
        if (parentSliderGroup) {
            parentSliderGroup.classList.add('selected-for-increment');
        }
    }

    if (labelSuffixElement) {
        labelSuffixElement.textContent = ` swatches of ${paramName}.`;
    }

    if (elements.incrementValueHsl && elements.incrementValueOklch) {
        if (activePickerMode === "hsl") {
            elements.incrementValueHsl.closest('.increment-control-group-inline').style.display = 'flex';
            elements.incrementValueOklch.closest('.increment-control-group-inline').style.display = 'none';
        } else {
            elements.incrementValueHsl.closest('.increment-control-group-inline').style.display = 'none';
            elements.incrementValueOklch.closest('.increment-control-group-inline').style.display = 'flex';
        }
    }
}

/**
 * Initializes the application after the DOM is fully loaded.
 * - Caches DOM elements.
 * - Sets up initial color values and UI states.
 * - Attaches all necessary event listeners for sliders, inputs, buttons, tabs, etc.
 * - Performs an initial UI sync and palette generation.
 */
function initializeApp() {
    if (typeof GoatColor === "undefined" || typeof GoatColor.getMaxSRGBChroma === "undefined") {
        setTimeout(initializeApp, 50);
        return;
    }

    const elementIdMap = {
        baseHueInputSlider: "base-hue-input-slider",
        baseSaturationInputSlider: "base-saturation-input-slider",
        baseLightnessInputSlider: "base-lightness-input-slider",
        baseOpacityInputSliderHsl: "base-opacity-input-slider-hsl",
        baseHueSlider: "base-hue-slider",
        baseSaturationSlider: "base-saturation-slider",
        baseLightnessSlider: "base-lightness-slider",
        baseOpacitySliderHsl: "base-opacity-slider-hsl",
        oklchLInputSlider: "oklch-l-input-slider",
        oklchCInputSlider: "oklch-c-input-slider",
        oklchHInputSlider: "oklch-h-input-slider",
        baseOpacityInputSliderOklch: "base-opacity-input-slider-oklch",
        oklchLSlider: "oklch-l-slider",
        oklchCSlider: "oklch-c-slider",
        oklchHSlider: "oklch-h-slider",
        baseOpacitySliderOklch: "base-opacity-slider-oklch",
        paletteContainer: "palette-container",
        exportButton: "export-button",
        exportXmlButton: "export-xml-button",
        colorPreviewBoxHsl: "colorPreviewBoxHsl",
        colorPreviewBoxOklch: "colorPreviewBoxOklch",
        oklchInfoPanel: "oklchInfoPanel",
        incrementValueHsl: "increment-value-hsl",
        incrementValueOklch: "increment-value-oklch",
        dynamicIncrementLabelHsl_suffix: "dynamicIncrementLabelHsl_suffix",
        dynamicIncrementLabelOklch_suffix: "dynamicIncrementLabelOklch_suffix",
    };

    for (const key in elementIdMap) {
        elements[key] = document.getElementById(elementIdMap[key]);
    }

    elements.varyParamRadiosHsl = document.querySelectorAll('#hslPickerPanel input[name="vary-param-hsl"]');
    elements.varyParamRadiosOklch = document.querySelectorAll('#oklchPickerPanel input[name="vary-param-oklch"]');
    elements.exportFormatRadios = document.querySelectorAll('input[name="export-format"]');
    elements.tabLinks = document.querySelectorAll(".tabs .tab-link");
    elements.tabContents = document.querySelectorAll(".picker-column .tab-content");

    if (elements.colorPreviewBoxHsl) {
        elements.colorPreviewBoxHsl_checkerboard = elements.colorPreviewBoxHsl.querySelector(".checkerboard-element");
        elements.colorPreviewBoxHsl_colorOverlay = elements.colorPreviewBoxHsl.querySelector(".color-overlay-element");
    }
    if (elements.colorPreviewBoxOklch) {
        elements.colorPreviewBoxOklch_checkerboard = elements.colorPreviewBoxOklch.querySelector(".checkerboard-element");
        elements.colorPreviewBoxOklch_colorOverlay = elements.colorPreviewBoxOklch.querySelector(".color-overlay-element");
    }

    elements.opacitySliderElementHsl = elements.baseOpacitySliderHsl;
    elements.opacitySliderElementOklch = elements.baseOpacitySliderOklch;


    const criticalElementIds = [
        "baseHueInputSlider", "baseSaturationInputSlider", "baseLightnessInputSlider", "baseOpacityInputSliderHsl",
        "baseHueSlider", "baseSaturationSlider", "baseLightnessSlider", "baseOpacitySliderHsl",
        "oklchLInputSlider", "oklchCInputSlider", "oklchHInputSlider", "baseOpacityInputSliderOklch",
        "oklchLSlider", "oklchCSlider", "oklchHSlider", "baseOpacitySliderOklch",
        "paletteContainer", "exportButton", "exportXmlButton",
        "colorPreviewBoxHsl", "colorPreviewBoxOklch",
        "opacitySliderElementHsl", "opacitySliderElementOklch",
        "oklchInfoPanel", "incrementValueHsl", "incrementValueOklch",
        "dynamicIncrementLabelHsl_suffix",
        "dynamicIncrementLabelOklch_suffix"
    ];

    let initFailed = false;
    criticalElementIds.forEach(id => {
        if (!elements[id]) {
            console.error(`Missing critical element: ${id}`);
            initFailed = true;
        }
    });
    if (!elements.colorPreviewBoxHsl_checkerboard || !elements.colorPreviewBoxHsl_colorOverlay ||
        !elements.colorPreviewBoxOklch_checkerboard || !elements.colorPreviewBoxOklch_colorOverlay ||
        (elements.varyParamRadiosHsl && elements.varyParamRadiosHsl.length !== 4) ||
        (elements.varyParamRadiosOklch && elements.varyParamRadiosOklch.length !== 4) ||
        (elements.exportFormatRadios && elements.exportFormatRadios.length !== 4) ||
        (elements.tabLinks && elements.tabLinks.length !== 2) ||
        (elements.tabContents && elements.tabContents.length !== 2)
    ) {
        if (!initFailed) console.error("Critical DOM elements missing or incorrect count. Halting initialization.", elements);
        initFailed = true;
    }


    if (initFailed) {
        if (elements.paletteContainer) elements.paletteContainer.innerHTML = "<p>Error: App Init Failed. Check console.</p>";
        return;
    }

    const lastActiveTabIdStored = localStorage.getItem('goatPaletteGenerator_activeTab');
    let initialTabIdToActivate = 'hslPickerPanel';

    if (lastActiveTabIdStored && document.querySelector(`.tabs .tab-link[data-tab="${lastActiveTabIdStored}"]`)) {
        initialTabIdToActivate = lastActiveTabIdStored;
    }

    elements.oklchCSlider.min = 0; elements.oklchCSlider.max = 100; elements.oklchCSlider.step = 1;
    elements.oklchCInputSlider.min = 0; elements.oklchCInputSlider.max = 100; elements.oklchCInputSlider.step = 1;

    const minHue = 4;
    const maxHue = 245;
    const initialH = Math.floor(Math.random() * (maxHue - minHue + 1)) + minHue;
    const initialS = 76;
    const initialL = 36;
    const initialO = 100;
    const initialNumSwatches = 6;

    currentGoatColor = GoatColor(`hsla(${initialH}, ${initialS}%, ${initialL}%, ${initialO / 100})`);
    if (currentGoatColor.isValid()) {
        const initialMasterHsl = currentGoatColor.toHsl();
        const initialOklch = currentGoatColor.toOklch();

        if (initialMasterHsl.s > 0) {
            lastHslHue = normalizeHueForDisplay(initialMasterHsl.h);
        } else {
            lastHslHue = normalizeHueForDisplay(initialH);
        }

        if (initialOklch.c >= 0.001) {
            lastOklchHue = normalizeHueForDisplay(initialOklch.h);
        } else {
            lastOklchHue = normalizeHueForDisplay(initialMasterHsl.h);
        }
    } else {
        currentGoatColor = GoatColor(`hsla(0, 75%, 50%, 1)`);
        lastOklchHue = 0;
        lastHslHue = 0;
        console.error("Failed to initialize with specified random color, using default red.");
    }


    elements.baseHueInputSlider.value = initialH;
    elements.baseSaturationInputSlider.value = initialS;
    elements.baseLightnessInputSlider.value = initialL;
    elements.baseOpacityInputSliderHsl.value = initialO;

    elements.baseHueSlider.value = elements.baseHueInputSlider.value;
    elements.baseSaturationSlider.value = elements.baseSaturationInputSlider.value;
    elements.baseLightnessSlider.value = elements.baseLightnessInputSlider.value;
    elements.baseOpacitySliderHsl.value = elements.baseOpacityInputSliderHsl.value;

    elements.baseOpacityInputSliderOklch.value = initialO;
    elements.baseOpacitySliderOklch.value = elements.baseOpacityInputSliderOklch.value;

    elements.incrementValueHsl.value = initialNumSwatches;
    elements.incrementValueOklch.value = initialNumSwatches;

    const defaultExportFormatRadio = document.getElementById("format-hsl");
    if (defaultExportFormatRadio) defaultExportFormatRadio.checked = true;


    elements.exportButton.addEventListener("click", exportCssPalette);
    elements.exportXmlButton.addEventListener("click", exportXmlPalette);

    setupSliderInputPair(elements.baseHueSlider, elements.baseHueInputSlider, updateFromHslPicker);
    setupSliderInputPair(elements.baseSaturationSlider, elements.baseSaturationInputSlider, updateFromHslPicker);
    setupSliderInputPair(elements.baseLightnessSlider, elements.baseLightnessInputSlider, updateFromHslPicker);
    setupSliderInputPair(elements.baseOpacitySliderHsl, elements.baseOpacityInputSliderHsl, updateFromHslPicker);

    setupSliderInputPair(elements.oklchLSlider, elements.oklchLInputSlider, updateFromOklchPicker);
    setupSliderInputPair(elements.oklchCSlider, elements.oklchCInputSlider, updateFromOklchPicker);
    setupSliderInputPair(elements.oklchHSlider, elements.oklchHInputSlider, updateFromOklchPicker);
    setupSliderInputPair(elements.baseOpacitySliderOklch, elements.baseOpacityInputSliderOklch, updateFromOklchPicker);

    [elements.incrementValueHsl, elements.incrementValueOklch].forEach(inputEl => {
        if (inputEl) {
            const maxVal = parseInt(inputEl.max, 10);
            const minVal = parseInt(inputEl.min, 10);

            inputEl.addEventListener("input", () => {
                let value = parseInt(inputEl.value, 10);
                if (!isNaN(value)) {
                    if (value > maxVal) {
                        inputEl.value = maxVal;
                    }
                } else if (inputEl.value !== "" && inputEl.value !== "-") {
                }
                updateIncrementUI();
                generatePaletteDynamically(false);
            });

            inputEl.addEventListener("change", () => {
                let value = parseInt(inputEl.value, 10);
                if (isNaN(value) || value < minVal) {
                    inputEl.value = minVal;
                } else if (value > maxVal) {
                    inputEl.value = maxVal;
                }
                updateIncrementUI();
                generatePalette();
            });
        }
    });

    elements.varyParamRadiosHsl.forEach((radio) => {
        radio.addEventListener("change", () => {
            updateIncrementUI();
            generatePalette();
            updateH1CharacterStyles();
        });
    });
    elements.varyParamRadiosOklch.forEach((radio) => {
        radio.addEventListener("change", () => {
            updateIncrementUI();
            generatePalette();
            updateH1CharacterStyles();
        });
    });

    elements.exportFormatRadios.forEach((radio) => {
        radio.addEventListener("change", () => {
            if (generatedColors.length > 0) {
                elements.paletteContainer.innerHTML = "";
                for (const color of generatedColors) {
                    createSwatch(color, elements.paletteContainer);
                }
            }
        });
    });

    if (elements.tabLinks && elements.tabLinks.length > 0) {
        elements.tabLinks.forEach((link) => {
            link.addEventListener("click", (e) => {
                e.preventDefault();
                const clickedTabId = link.getAttribute("data-tab");
                localStorage.setItem('goatPaletteGenerator_activeTab', clickedTabId);

                const newActivePickerMode = clickedTabId === "oklchPickerPanel" ? "oklch" : "hsl";
                let previousVaryParamValue = null;

                if (activePickerMode === "hsl") {
                    const checkedHslRadio = document.querySelector('#hslPickerPanel input[name="vary-param-hsl"]:checked');
                    if (checkedHslRadio) previousVaryParamValue = checkedHslRadio.value;
                } else {
                    const checkedOklchRadio = document.querySelector('#oklchPickerPanel input[name="vary-param-oklch"]:checked');
                    if (checkedOklchRadio) previousVaryParamValue = checkedOklchRadio.value;
                }

                activePickerMode = newActivePickerMode;

                elements.tabLinks.forEach((l) => l.classList.remove("active"));
                elements.tabContents.forEach((c) => c.classList.remove("active"));
                link.classList.add("active");
                document.getElementById(clickedTabId).classList.add("active");

                let targetRadioId = null;
                if (previousVaryParamValue) {
                    if (activePickerMode === "oklch") {
                        switch (previousVaryParamValue) {
                            case "hue": targetRadioId = "vary-h-oklch"; break;
                            case "saturation": targetRadioId = "vary-c-oklch"; break;
                            case "lightness": targetRadioId = "vary-l-oklch"; break;
                            case "opacity": targetRadioId = "vary-opacity-oklch"; break;
                        }
                    } else {
                        switch (previousVaryParamValue) {
                            case "oklch_h": targetRadioId = "vary-hue-hsl"; break;
                            case "oklch_c": targetRadioId = "vary-saturation-hsl"; break;
                            case "oklch_l": targetRadioId = "vary-lightness-hsl"; break;
                            case "opacity": targetRadioId = "vary-opacity-hsl"; break;
                        }
                    }
                }

                let newActiveRadioFound = false;
                if (targetRadioId) {
                    const targetRadio = document.getElementById(targetRadioId);
                    if (targetRadio) {
                        targetRadio.checked = true;
                        newActiveRadioFound = true;
                    }
                }

                if (!newActiveRadioFound) {
                    if (activePickerMode === "hsl") {
                        const defaultHslVaryRadio = document.getElementById("vary-saturation-hsl");
                        if (defaultHslVaryRadio) defaultHslVaryRadio.checked = true;
                    } else {
                        const defaultOklchVaryRadio = document.getElementById("vary-l-oklch");
                        if (defaultOklchVaryRadio) defaultOklchVaryRadio.checked = true;
                    }
                }

                updateIncrementUI();
                updateInfoPanel();
                syncAllUiFromMasterColor(true, clickedTabId);
                generatePaletteDynamically(false);
                updateH1CharacterStyles();
            });
        });

        elements.tabLinks.forEach(link => {
            const tabId = link.getAttribute('data-tab');
            if (tabId === initialTabIdToActivate) {
                link.classList.add('active');
                if (document.getElementById(tabId)) document.getElementById(tabId).classList.add('active');
                activePickerMode = tabId === "oklchPickerPanel" ? "oklch" : "hsl";
            } else {
                link.classList.remove('active');
                if (document.getElementById(tabId)) document.getElementById(tabId).classList.remove('active');
            }
        });
    }


    if (activePickerMode === "hsl") {
        if (!document.querySelector('#hslPickerPanel input[name="vary-param-hsl"]:checked')) {
            const defaultHslVary = document.getElementById("vary-saturation-hsl");
            if (defaultHslVary) defaultHslVary.checked = true;
        }
    } else {
        if (!document.querySelector('#oklchPickerPanel input[name="vary-param-oklch"]:checked')) {
            const defaultOklchVary = document.getElementById("vary-l-oklch");
            if (defaultOklchVary) defaultOklchVary.checked = true;
        }
    }


    [elements.colorPreviewBoxHsl, elements.colorPreviewBoxOklch].forEach(pickerBox => {
        if (pickerBox) {
            pickerBox.addEventListener('dragover', (event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'copy';
                pickerBox.classList.add('drag-over');
            });
            pickerBox.addEventListener('dragleave', () => {
                pickerBox.classList.remove('drag-over');
            });
            pickerBox.addEventListener('drop', (event) => {
                handleDropOnPicker(event);
            });
        }
    });

    const MQL = window.matchMedia("(prefers-color-scheme: dark)");
    function handleThemeChange(e) {
        updateAllSliderBackgrounds();
        updateDynamicSliderThumbStyles(); // Ensure thumbs also update with theme
        if (generatedColors.length > 0) {
            elements.paletteContainer.innerHTML = "";
            for (const color of generatedColors) {
                createSwatch(color, elements.paletteContainer);
            }
        }
    }

    if (MQL.addEventListener) {
        MQL.addEventListener("change", handleThemeChange);
    } else {
        console.warn("MQL.addEventListener for '(prefers-color-scheme: dark)' not supported.");
    }

    initializeH1Styles(); // Initialize H1 spans

    updateIncrementUI();
    updateInfoPanel();
    syncAllUiFromMasterColor(true, initialTabIdToActivate); // This will call updateDynamicSliderThumbStyles & updateH1CharacterStyles
    try {
        generatePalette();
    } catch (e) {
        console.error("Error during initial generatePalette():", e);
    }
}

document.addEventListener("DOMContentLoaded", initializeApp);