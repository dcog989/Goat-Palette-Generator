window.GPG = window.GPG || {};

(function (GPG) {
    'use strict';

    GPG.utils = {
        normalizeHueForDisplay: function (hue) {
            if (isNaN(hue)) return 0;
            let h = Math.round(parseFloat(hue)) % 360;
            if (h < 0) h += 360;
            if (h === 360) h = 0;
            return h;
        },

        getFormattedColorString: function (colorInstance, format) {
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
        },

        getCurrentUiDefinedColorParameters: function () {
            let hslParams = { h: 0, s: 0, l: 0 };
            let oklchParams = { l: 0, cAbs: 0, h: 0, cPercent: 0 };
            let calculatedEffectiveHslHueForDisplayIfSIsZero;
            let effectiveOklchHueIfCAbsIsZero;

            const masterHsl = GPG.state.currentGoatColor.toHsl();
            const masterOklch = GPG.state.currentGoatColor.toOklch();

            if (GPG.state.activePickerMode === "hsl") {
                let uiH = parseInt(GPG.elements.baseHueInputSlider.value, 10);
                let uiS = parseInt(GPG.elements.baseSaturationInputSlider.value, 10);
                let uiL = parseInt(GPG.elements.baseLightnessInputSlider.value, 10);

                hslParams.h = this.normalizeHueForDisplay(!isNaN(uiH) ? uiH : GPG.state.lastHslHue);
                hslParams.s = !isNaN(uiS) ? uiS : masterHsl.s;
                hslParams.l = !isNaN(uiL) ? uiL : masterHsl.l;

                if (hslParams.s === 0) {
                    calculatedEffectiveHslHueForDisplayIfSIsZero = this.normalizeHueForDisplay(GPG.state.lastHslHue);
                } else {
                    calculatedEffectiveHslHueForDisplayIfSIsZero = hslParams.h;
                }

                const hueForOklchDerivation = hslParams.s === 0 ? calculatedEffectiveHslHueForDisplayIfSIsZero : hslParams.h;
                const tempColorFromHslUi = GoatColor(`hsl(${hueForOklchDerivation}, ${hslParams.s}%, ${hslParams.l}%)`);
                const oklchDerived = tempColorFromHslUi.isValid() ? tempColorFromHslUi.toOklch() : masterOklch;

                oklchParams.l = Math.round(oklchDerived.l);
                oklchParams.cAbs = oklchDerived.c;
                oklchParams.h = this.normalizeHueForDisplay(oklchParams.cAbs < 0.001 ? GPG.state.lastOklchHue : Math.round(oklchDerived.h));
                effectiveOklchHueIfCAbsIsZero = oklchParams.h;

                let maxCForDerivedOklch = GoatColor.getMaxSRGBChroma(oklchParams.l, oklchParams.h, GPG.OKLCH_C_SLIDER_STATIC_MAX_ABSOLUTE);
                if (maxCForDerivedOklch < 0.0001) maxCForDerivedOklch = GPG.OKLCH_C_SLIDER_STATIC_MAX_ABSOLUTE;
                oklchParams.cPercent = Math.round(oklchParams.cAbs > 0 ? (oklchParams.cAbs / maxCForDerivedOklch) * 100 : 0);

            } else {
                let uiOklchL = parseInt(GPG.elements.oklchLInputSlider.value, 10);
                let uiOklchCPercent = parseFloat(GPG.elements.oklchCInputSlider.value);
                let uiOklchH = parseInt(GPG.elements.oklchHInputSlider.value, 10);

                oklchParams.l = !isNaN(uiOklchL) ? uiOklchL : Math.round(masterOklch.l);
                oklchParams.h = this.normalizeHueForDisplay(!isNaN(uiOklchH) ? uiOklchH : GPG.state.lastOklchHue);

                if (isNaN(uiOklchCPercent)) {
                    let maxCContext = GoatColor.getMaxSRGBChroma(oklchParams.l, oklchParams.h, GPG.OKLCH_C_SLIDER_STATIC_MAX_ABSOLUTE);
                    if (maxCContext < 0.0001) maxCContext = GPG.OKLCH_C_SLIDER_STATIC_MAX_ABSOLUTE;
                    uiOklchCPercent = masterOklch.c > 0 ? (masterOklch.c / maxCContext) * 100 : 0;
                }
                oklchParams.cPercent = Math.round(uiOklchCPercent);

                let maxCForCurrentLH = GoatColor.getMaxSRGBChroma(oklchParams.l, oklchParams.h, GPG.OKLCH_C_SLIDER_STATIC_MAX_ABSOLUTE);
                if (maxCForCurrentLH < 0.0001) maxCForCurrentLH = GPG.OKLCH_C_SLIDER_STATIC_MAX_ABSOLUTE;

                oklchParams.cAbs = (Math.max(0, Math.min(100, oklchParams.cPercent)) / 100) * maxCForCurrentLH;

                if (oklchParams.cAbs < 0.001) {
                    effectiveOklchHueIfCAbsIsZero = this.normalizeHueForDisplay(GPG.state.lastOklchHue);
                } else {
                    effectiveOklchHueIfCAbsIsZero = oklchParams.h;
                }

                const tempColorFromOklchUi = GoatColor(`oklch(${oklchParams.l}% ${oklchParams.cAbs.toFixed(4)} ${oklchParams.cAbs < 0.001 ? effectiveOklchHueIfCAbsIsZero : oklchParams.h})`);
                const hslDerived = tempColorFromOklchUi.isValid() ? tempColorFromOklchUi.toHsl() : masterHsl;

                hslParams.h = this.normalizeHueForDisplay(hslDerived.s === 0 ? GPG.state.lastHslHue : Math.round(hslDerived.h));
                hslParams.s = Math.round(hslDerived.s);
                hslParams.l = Math.round(hslDerived.l);
                calculatedEffectiveHslHueForDisplayIfSIsZero = hslParams.s === 0 ? this.normalizeHueForDisplay(GPG.state.lastHslHue) : hslParams.h;
            }

            hslParams.h = this.normalizeHueForDisplay(hslParams.h);
            calculatedEffectiveHslHueForDisplayIfSIsZero = this.normalizeHueForDisplay(calculatedEffectiveHslHueForDisplayIfSIsZero);
            oklchParams.h = this.normalizeHueForDisplay(oklchParams.h);

            hslParams.s = Math.round(Math.max(0, Math.min(100, isNaN(hslParams.s) ? 0 : hslParams.s)));
            hslParams.l = Math.round(Math.max(0, Math.min(100, isNaN(hslParams.l) ? 0 : hslParams.l)));
            oklchParams.l = Math.round(Math.max(0, Math.min(100, isNaN(oklchParams.l) ? 0 : oklchParams.l)));
            oklchParams.cPercent = Math.max(0, Math.min(100, isNaN(oklchParams.cPercent) ? 0 : oklchParams.cPercent));
            oklchParams.cAbs = Math.max(0, isNaN(oklchParams.cAbs) ? 0 : oklchParams.cAbs);

            return {
                hslDirectUi: hslParams,
                oklchDirectUi: oklchParams,
                opacityBase: GPG.state.currentGoatColor.a,
                effectiveHslHueForDisplayIfSIsZero: calculatedEffectiveHslHueForDisplayIfSIsZero,
            };
        },

        getActiveOpacityInput: function () {
            return GPG.state.activePickerMode === "hsl" ? GPG.elements.baseOpacityInputSliderHsl : GPG.elements.baseOpacityInputSliderOklch;
        },

        findContrastingTextColor: function (bgColorInstance, targetHue) {
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
    };
}(window.GPG));