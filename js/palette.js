window.GPG = window.GPG || {};

(function (GPG) {
    'use strict';

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

    function generatePalette() {
        if (!GPG.state.currentGoatColor || !GPG.state.currentGoatColor.isValid()) {
            return;
        }

        const uiParams = GPG.utils.getCurrentUiDefinedColorParameters();
        const baseHslForGeneration = {
            h: GPG.utils.normalizeHueForDisplay(uiParams.hslDirectUi.h),
            s: uiParams.hslDirectUi.s,
            l: uiParams.hslDirectUi.l
        };
        const baseOklchPercentForGeneration = {
            l: uiParams.oklchDirectUi.l,
            c: uiParams.oklchDirectUi.cPercent,
            h: GPG.utils.normalizeHueForDisplay(uiParams.oklchDirectUi.h)
        };
        const baseOpacityForGeneration = uiParams.opacityBase;

        let numTotalSwatchesInputEl;
        let varyParamRadioGroupSelector;

        if (GPG.state.activePickerMode === "hsl") {
            numTotalSwatchesInputEl = GPG.elements.incrementValueHsl;
            varyParamRadioGroupSelector = '#hslPickerPanel input[name="vary-param-hsl"]:checked';
        } else {
            numTotalSwatchesInputEl = GPG.elements.incrementValueOklch;
            varyParamRadioGroupSelector = '#oklchPickerPanel input[name="vary-param-oklch"]:checked';
        }

        let numTotalSwatches = parseInt(numTotalSwatchesInputEl.value, 10);
        const checkedRadio = document.querySelector(varyParamRadioGroupSelector);

        if (!checkedRadio) {
            console.warn("No vary parameter selected for active mode.");
            return;
        }
        let varyParam = checkedRadio.value;
        GPG.ui.updateIncrementUI();

        GPG.elements.paletteContainer.innerHTML = "";
        GPG.state.generatedColors = [];

        if (isNaN(numTotalSwatches) || numTotalSwatches < 1) {
            numTotalSwatches = 1;
        }

        let baseValue;
        let maxValue;
        let isHueParam = false;

        if (varyParam === "hue") {
            baseValue = baseHslForGeneration.h;
            maxValue = 359;
            isHueParam = true;
        } else if (varyParam === "saturation") {
            baseValue = baseHslForGeneration.s;
            maxValue = 100;
        } else if (varyParam === "lightness") {
            baseValue = baseHslForGeneration.l;
            maxValue = 100;
        } else if (varyParam === "oklch_l") {
            baseValue = baseOklchPercentForGeneration.l;
            maxValue = 100;
        } else if (varyParam === "oklch_c") {
            const baseLForMaxC = baseOklchPercentForGeneration.l;
            let baseHForMaxC = baseOklchPercentForGeneration.h;
            const currentBaseChromaAbsolute = uiParams.oklchDirectUi.cAbs;

            if (currentBaseChromaAbsolute < 0.001) {
                baseHForMaxC = GPG.utils.normalizeHueForDisplay(GPG.state.lastOklchHue);
            }

            maxValue = GoatColor.getMaxSRGBChroma(baseLForMaxC, baseHForMaxC, GPG.OKLCH_C_SLIDER_STATIC_MAX_ABSOLUTE);
            if (maxValue < 0.0001) maxValue = 0.0001;
            baseValue = Math.min(currentBaseChromaAbsolute, maxValue);

        } else if (varyParam === "oklch_h") {
            baseValue = baseOklchPercentForGeneration.h;
            maxValue = 359;
            isHueParam = true;
        } else if (varyParam === "opacity") {
            baseValue = baseOpacityForGeneration * 100;
            maxValue = 100;
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
                finalValueToUse = GPG.utils.normalizeHueForDisplay(currentValue);
            } else if (varyParam === "oklch_c") {
                finalValueToUse = parseFloat(currentValue.toFixed(4));
                finalValueToUse = Math.max(0, Math.min(maxValue, finalValueToUse));
            } else {
                finalValueToUse = Math.round(currentValue);
                finalValueToUse = Math.max(0, Math.min(100, finalValueToUse));
            }

            let tempGoatColor = getPaletteVariantColor(
                varyParam,
                finalValueToUse,
                baseHslForGeneration,
                baseOklchPercentForGeneration,
                baseOpacityForGeneration,
                GPG.OKLCH_C_SLIDER_STATIC_MAX_ABSOLUTE,
                GPG.state.lastOklchHue
            );

            if (tempGoatColor && tempGoatColor.isValid()) {
                GPG.state.generatedColors.push({ hsl: tempGoatColor.toHsl(), oklch: tempGoatColor.toOklch(), o: tempGoatColor.a });
            } else {
                console.warn("Generated color invalid for palette:", finalValueToUse, "for", varyParam, tempGoatColor ? tempGoatColor.error : "N/A");
                if (GPG.state.generatedColors.length < numTotalSwatches) {
                    const fallbackBase = GoatColor(`hsla(${baseHslForGeneration.h}, ${baseHslForGeneration.s}%, ${baseHslForGeneration.l}%, ${baseOpacityForGeneration})`);
                    if (fallbackBase.isValid()) {
                        GPG.state.generatedColors.push({ hsl: fallbackBase.toHsl(), oklch: fallbackBase.toOklch(), o: fallbackBase.a });
                    } else {
                        console.error("Fallback base HSL color is also invalid. Base HSL input:", baseHslForGeneration, "Opacity:", baseOpacityForGeneration);
                    }
                }
            }
        }

        if (GPG.state.generatedColors.length === 0 && GPG.state.currentGoatColor && GPG.state.currentGoatColor.isValid()) {
            GPG.state.generatedColors.push({ hsl: GPG.state.currentGoatColor.toHsl(), oklch: GPG.state.currentGoatColor.toOklch(), o: GPG.state.currentGoatColor.a });
        }

        for (const colorData of GPG.state.generatedColors) {
            GPG.ui.createSwatch(colorData, GPG.elements.paletteContainer);
        }
    }

    GPG.palette = {
        generatePaletteDynamically: function (isFromSlider = false) {
            clearTimeout(GPG.state.debounceTimer);
            if (isFromSlider) {
                generatePalette();
            } else {
                GPG.state.debounceTimer = setTimeout(() => {
                    generatePalette();
                }, 250);
            }
        },
        generate: generatePalette
    };
}(window.GPG));