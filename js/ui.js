window.GPG = window.GPG || {};

(function (GPG) {
    'use strict';

    GPG.ui = {
        createSwatch: function (colorData, container) {
            const { hsl, o } = colorData;
            const originalHslaString = `hsla(${hsl.h}, ${hsl.s}%, ${hsl.l}%, ${o})`;
            const swatchGoatColor = GoatColor(originalHslaString);

            if (!swatchGoatColor.isValid()) {
                console.warn("Invalid color for swatch:", colorData);
                return;
            }

            const selectedExportFormat = document.querySelector('input[name="export-format"]:checked').value;

            const tempSwatchColorForDisplay = GoatColor(originalHslaString);
            if (tempSwatchColorForDisplay.isValid() && tempSwatchColorForDisplay.a < 1) {
                tempSwatchColorForDisplay.setAlpha(tempSwatchColorForDisplay.a, GoatColor.ALPHA_STYLE_HINT_PERCENT);
            }
            const displayString = GPG.utils.getFormattedColorString(tempSwatchColorForDisplay, selectedExportFormat);

            const swatchRgba = swatchGoatColor.toRgba();
            const colorItem = document.createElement("div");
            colorItem.classList.add("color-item");
            colorItem.draggable = true;
            colorItem.addEventListener('dragstart', (event) => {
                event.dataTransfer.setData('text/plain', originalHslaString);
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
            copyButton.innerHTML = GPG.SVG_COPY_ICON + `<span class="visually-hidden">Copy color</span>`;
            copyButton.title = `Copy ${displayString}`;

            copyButton.addEventListener("click", () => {
                navigator.clipboard.writeText(displayString).then(() => {
                    copyButton.innerHTML = GPG.SVG_COPIED_ICON + `<span class="visually-hidden">Copied!</span>`;
                    copyButton.title = "Copied!";
                    setTimeout(() => {
                        copyButton.innerHTML = GPG.SVG_COPY_ICON + `<span class="visually-hidden">Copy color</span>`;
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
        },

        generateOklchHueTrackGradientString: function (l, c, steps = 12) {
            if (c < 0.005) {
                const grayColor = GoatColor(`oklch(${l}% 0 0)`).toRgbString();
                return `linear-gradient(to right, ${grayColor}, ${grayColor})`;
            }
            let gradientStops = [];
            for (let i = 0; i <= steps; i++) {
                const hue = (i / steps) * 360;
                const hForString = (hue === 360) ? 0 : hue;
                const color = GoatColor(`oklch(${l}% ${c.toFixed(4)} ${Math.round(hForString)})`);
                if (color.isValid()) {
                    gradientStops.push(`${color.toRgbString()} ${(i / steps) * 100}%`);
                } else {
                    gradientStops.push(`rgb(128,128,128) ${(i / steps) * 100}%`);
                }
            }
            return `linear-gradient(to right, ${gradientStops.join(", ")})`;
        },

        syncAllUiFromMasterColor: function (isInitialSync = false, targetPanelIdForFullUpdate = null) {
            if (!GPG.state.currentGoatColor || !GPG.state.currentGoatColor.isValid()) {
                console.warn("syncAllUiFromMasterColor called with invalid currentGoatColor");
                return;
            }
            GPG.state.isProgrammaticUpdate = true;

            const masterHsl = GPG.state.currentGoatColor.toHsl();
            const masterOklch = GPG.state.currentGoatColor.toOklch();
            const currentAlphaPercent = Math.round(GPG.state.currentGoatColor.a * 100);

            if (masterHsl.s > 0) {
                GPG.state.lastHslHue = GPG.utils.normalizeHueForDisplay(masterHsl.h);
            } else if (isNaN(GPG.state.lastHslHue)) {
                GPG.state.lastHslHue = GPG.utils.normalizeHueForDisplay(masterHsl.h);
            }

            if (masterOklch.c >= 0.001) {
                GPG.state.lastOklchHue = GPG.utils.normalizeHueForDisplay(masterOklch.h);
            } else if (isNaN(GPG.state.lastOklchHue)) {
                GPG.state.lastOklchHue = GPG.utils.normalizeHueForDisplay(masterOklch.h);
            }

            let sDisplayHsl = Math.round(masterHsl.s);
            let lDisplayHsl = Math.round(masterHsl.l);
            let hDisplayHsl = GPG.utils.normalizeHueForDisplay(sDisplayHsl === 0 ? GPG.state.lastHslHue : Math.round(masterHsl.h));

            this.updateUiElementValue(GPG.elements.baseHueSlider, hDisplayHsl);
            this.updateUiElementValue(GPG.elements.baseHueInputSlider, hDisplayHsl);
            this.updateUiElementValue(GPG.elements.baseSaturationSlider, sDisplayHsl);
            this.updateUiElementValue(GPG.elements.baseSaturationInputSlider, sDisplayHsl);
            this.updateUiElementValue(GPG.elements.baseLightnessSlider, lDisplayHsl);
            this.updateUiElementValue(GPG.elements.baseLightnessInputSlider, lDisplayHsl);

            let oklchLForDisplay = Math.round(masterOklch.l);
            let oklchHueForUiDisplay = GPG.utils.normalizeHueForDisplay(masterOklch.c < 0.001 ? GPG.state.lastOklchHue : Math.round(masterOklch.h));
            let maxCForMaster = GoatColor.getMaxSRGBChroma(oklchLForDisplay, oklchHueForUiDisplay, GPG.OKLCH_C_SLIDER_STATIC_MAX_ABSOLUTE);
            if (maxCForMaster < 0.0001) maxCForMaster = GPG.OKLCH_C_SLIDER_STATIC_MAX_ABSOLUTE;
            let oklchCPercentForDisplay = masterOklch.c > 0 ? (masterOklch.c / maxCForMaster) * 100 : 0;
            oklchCPercentForDisplay = Math.max(0, Math.min(100, Math.round(oklchCPercentForDisplay)));
            if (isNaN(oklchCPercentForDisplay)) oklchCPercentForDisplay = 0;


            this.updateUiElementValue(GPG.elements.oklchLSlider, oklchLForDisplay);
            this.updateUiElementValue(GPG.elements.oklchLInputSlider, oklchLForDisplay);
            this.updateUiElementValue(GPG.elements.oklchCSlider, oklchCPercentForDisplay);
            this.updateUiElementValue(GPG.elements.oklchCInputSlider, oklchCPercentForDisplay);
            this.updateUiElementValue(GPG.elements.oklchHSlider, oklchHueForUiDisplay);
            this.updateUiElementValue(GPG.elements.oklchHInputSlider, oklchHueForUiDisplay);

            this.updateOklchHueSliderState(oklchCPercentForDisplay, oklchLForDisplay, oklchHueForUiDisplay);

            this.updateUiElementValue(GPG.elements.baseOpacitySliderHsl, currentAlphaPercent);
            this.updateUiElementValue(GPG.elements.baseOpacityInputSliderHsl, currentAlphaPercent);
            this.updateUiElementValue(GPG.elements.baseOpacitySliderOklch, currentAlphaPercent);
            this.updateUiElementValue(GPG.elements.baseOpacityInputSliderOklch, currentAlphaPercent);

            const hslStringForDisplay = GPG.utils.getFormattedColorString(GPG.state.currentGoatColor, 'hsl');
            this.updateUiElementValue(GPG.elements.colorStringInputHsl, hslStringForDisplay);
            GPG.elements.colorStringInputHsl.classList.remove('invalid');

            const oklchStringForDisplay = GPG.utils.getFormattedColorString(GPG.state.currentGoatColor, 'oklch');
            this.updateUiElementValue(GPG.elements.colorStringInputOklch, oklchStringForDisplay);
            GPG.elements.colorStringInputOklch.classList.remove('invalid');

            const previewColorString = GPG.state.currentGoatColor.toRgbaString();
            [GPG.elements.colorPreviewBoxHsl_colorOverlay, GPG.elements.colorPreviewBoxOklch_colorOverlay].forEach((overlay) => {
                if (overlay && overlay.style.backgroundColor !== previewColorString) overlay.style.backgroundColor = previewColorString;
            });
            const checkerOpacity = (1 - GPG.state.currentGoatColor.a).toFixed(2);
            [GPG.elements.colorPreviewBoxHsl_checkerboard, GPG.elements.colorPreviewBoxOklch_checkerboard].forEach((checker) => {
                if (checker && checker.style.opacity !== checkerOpacity) checker.style.opacity = checkerOpacity;
            });

            this.updateAllSliderBackgrounds();
            this.updateH1CharacterStyles();
            this.updateDynamicSliderThumbStyles();
            GPG.state.isProgrammaticUpdate = false;
        },

        updateAllSliderBackgrounds: function () {
            if (!GPG.state.currentGoatColor || !GPG.state.currentGoatColor.isValid()) {
                const neutralGrayVar = "linear-gradient(to right, #777, #777)";

                if (GPG.elements.baseSaturationSlider) {
                    GPG.elements.baseSaturationSlider.style.setProperty("--background-image-slider-track-saturation", neutralGrayVar);
                }
                if (GPG.elements.baseLightnessSlider) {
                    GPG.elements.baseLightnessSlider.style.setProperty("--background-image-slider-track-lightness", neutralGrayVar);
                }

                GPG.elements.oklchLSlider.style.setProperty("--background-image-slider-track-oklch-l", neutralGrayVar);
                GPG.elements.oklchCSlider.style.setProperty("--background-image-slider-track-oklch-c", neutralGrayVar);
                GPG.elements.oklchHSlider.style.setProperty("--background-image-slider-track-oklch-h", neutralGrayVar);

                const defaultOpacityGradient = `linear-gradient(to right, rgba(128,128,128,0) 0%, rgba(128,128,128,1) 100%)`;
                [GPG.elements.opacitySliderElementHsl, GPG.elements.opacitySliderElementOklch].forEach((el) => {
                    if (el) el.style.setProperty("--background-image-slider-track-opacity", defaultOpacityGradient);
                });
                return;
            }

            const masterRgb = GPG.state.currentGoatColor.toRgb();
            const params = GPG.utils.getCurrentUiDefinedColorParameters();

            const hsl_s_for_tracks = params.hslDirectUi.s;
            const hsl_l_for_tracks = params.hslDirectUi.l;
            const hsl_h_for_tracks = GPG.utils.normalizeHueForDisplay(hsl_s_for_tracks === 0 ? params.effectiveHslHueForDisplayIfSIsZero : params.hslDirectUi.h);

            const oklch_l_for_track_calc = params.oklchDirectUi.l;
            const oklch_c_abs_for_track_calc = params.oklchDirectUi.cAbs;
            const oklch_h_for_L_and_C_tracks = GPG.utils.normalizeHueForDisplay(params.oklchDirectUi.h);

            const sat_track_gradient_str = `linear-gradient(to right, hsl(${hsl_h_for_tracks}, 0%, ${hsl_l_for_tracks}%) 0%, hsl(${hsl_h_for_tracks}, 100%, ${hsl_l_for_tracks}%) 100%)`;
            if (GPG.elements.baseSaturationSlider) {
                GPG.elements.baseSaturationSlider.style.setProperty("--background-image-slider-track-saturation", sat_track_gradient_str);
            }

            const lightness_track_gradient_str = `linear-gradient(to right, hsl(${hsl_h_for_tracks}, ${hsl_s_for_tracks}%, 0%) 0%, hsl(${hsl_h_for_tracks}, ${hsl_s_for_tracks}%, 50%) 50%, hsl(${hsl_h_for_tracks}, ${hsl_s_for_tracks}%, 100%) 100%)`;
            if (GPG.elements.baseLightnessSlider) {
                GPG.elements.baseLightnessSlider.style.setProperty("--background-image-slider-track-lightness", lightness_track_gradient_str);
            }

            const oklch_L_start_color_obj = GoatColor(`oklch(0% ${oklch_c_abs_for_track_calc.toFixed(4)} ${oklch_h_for_L_and_C_tracks})`);
            const oklch_L_mid_color_str = `oklch(50% ${oklch_c_abs_for_track_calc.toFixed(4)} ${oklch_h_for_L_and_C_tracks})`;
            const oklch_L_end_color_obj = GoatColor(`oklch(100% ${oklch_c_abs_for_track_calc.toFixed(4)} ${oklch_h_for_L_and_C_tracks})`);
            const oklch_L_start_rgb = oklch_L_start_color_obj.isValid() ? oklch_L_start_color_obj.toRgbString() : "rgb(0,0,0)";
            const oklch_L_end_rgb = oklch_L_end_color_obj.isValid() ? oklch_L_end_color_obj.toRgbString() : "rgb(255,255,255)";
            GPG.elements.oklchLSlider.style.setProperty("--background-image-slider-track-oklch-l",
                `linear-gradient(to right, ${oklch_L_start_rgb} 0%, ${oklch_L_mid_color_str} 50%, ${oklch_L_end_rgb} 100%)`
            );

            const oklch_C_achromatic_start = `oklch(${oklch_l_for_track_calc}% 0 ${oklch_h_for_L_and_C_tracks})`;
            let maxAchievableC = GPG.OKLCH_C_SLIDER_STATIC_MAX_ABSOLUTE;
            if (typeof GoatColor.getMaxSRGBChroma === "function") {
                maxAchievableC = GoatColor.getMaxSRGBChroma(oklch_l_for_track_calc, oklch_h_for_L_and_C_tracks, GPG.OKLCH_C_SLIDER_STATIC_MAX_ABSOLUTE);
            }
            const oklch_C_gamut_end = `oklch(${oklch_l_for_track_calc}% ${maxAchievableC.toFixed(4)} ${oklch_h_for_L_and_C_tracks})`;
            GPG.elements.oklchCSlider.style.setProperty("--background-image-slider-track-oklch-c",
                `linear-gradient(to right, ${oklch_C_achromatic_start} 0%, ${oklch_C_gamut_end} 100%)`
            );

            const gradientLForHueTrack = 70;
            let gradientCForHueTrack;
            if (oklch_c_abs_for_track_calc < 0.01) {
                gradientCForHueTrack = 0;
            } else {
                gradientCForHueTrack = Math.min(oklch_c_abs_for_track_calc, 0.2);
            }
            const oklchHueTrackGradient = this.generateOklchHueTrackGradientString(gradientLForHueTrack, gradientCForHueTrack);
            GPG.elements.oklchHSlider.style.setProperty("--background-image-slider-track-oklch-h", oklchHueTrackGradient);

            const opacityColorGradient = `linear-gradient(to right, rgba(${masterRgb.r},${masterRgb.g},${masterRgb.b},0) 0%, rgba(${masterRgb.r},${masterRgb.g},${masterRgb.b},1) 100%)`;
            [GPG.elements.opacitySliderElementHsl, GPG.elements.opacitySliderElementOklch].forEach((el) => {
                if (el) el.style.setProperty("--background-image-slider-track-opacity", opacityColorGradient);
            });
        },

        updateDynamicSliderThumbStyles: function () {
            const rootStyle = document.documentElement.style;

            if (!GPG.state.currentGoatColor || !GPG.state.currentGoatColor.isValid()) {
                rootStyle.removeProperty('--color-bg-slider-thumb');
                rootStyle.removeProperty('--color-border-slider-thumb');
                return;
            }

            const opaqueBaseColorForThumb = GoatColor(GPG.state.currentGoatColor.toHex());
            if (!opaqueBaseColorForThumb.isValid()) {
                rootStyle.removeProperty('--color-bg-slider-thumb');
                rootStyle.removeProperty('--color-border-slider-thumb');
                return;
            }

            const thumbBgColorString = opaqueBaseColorForThumb.toRgbaString();
            rootStyle.setProperty('--color-bg-slider-thumb', thumbBgColorString);

            const originalHsl = GPG.state.currentGoatColor.toHsl();
            const baseHueForBorder = Math.round(originalHsl.h);
            const borderSaturation = originalHsl.s < 5 ? 10 : Math.max(30, Math.min(originalHsl.s, 75));
            let chosenBorderColorString;
            const thumbBgHsl = opaqueBaseColorForThumb.toHsl();
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
                let primaryContrast = 0,
                    secondaryContrast = 0;

                if (thumbBgHsl.l >= 50) {
                    primaryCandidate = darkBorderCandidate;
                    secondaryCandidate = lightBorderCandidate;
                } else {
                    primaryCandidate = lightBorderCandidate;
                    secondaryCandidate = darkBorderCandidate;
                }

                if (primaryCandidate.isValid()) {
                    primaryContrast = GoatColor.getContrastRatio(primaryCandidate, opaqueBaseColorForThumb);
                }
                if (secondaryCandidate.isValid()) {
                    secondaryContrast = GoatColor.getContrastRatio(secondaryCandidate, opaqueBaseColorForThumb);
                }

                const CONTRAST_THRESHOLD_BORDER = 1.5;

                if (primaryCandidate.isValid() && primaryContrast >= CONTRAST_THRESHOLD_BORDER) {
                    chosenBorderColorString = primaryCandidate.toRgbaString();
                } else if (secondaryCandidate.isValid() && secondaryContrast >= CONTRAST_THRESHOLD_BORDER) {
                    chosenBorderColorString = secondaryCandidate.toRgbaString();
                } else {
                    if (primaryCandidate.isValid() && secondaryCandidate.isValid()) {
                        chosenBorderColorString = (primaryContrast >= secondaryContrast) ? primaryCandidate.toRgbaString() : secondaryCandidate.toRgbaString();
                    } else if (primaryCandidate.isValid()) {
                        chosenBorderColorString = primaryCandidate.toRgbaString();
                    } else if (secondaryCandidate.isValid()) {
                        chosenBorderColorString = secondaryCandidate.toRgbaString();
                    } else {
                        chosenBorderColorString = fallbackBorder;
                    }
                }
            }
            rootStyle.setProperty('--color-border-slider-thumb', chosenBorderColorString);
        },

        updateOklchHueSliderState: function (oklchCPercent, oklchL, oklchH_displayValue) {
            let cAbsolute;
            let lForMaxChroma = parseFloat(oklchL);
            if (isNaN(lForMaxChroma) && GPG.state.currentGoatColor && GPG.state.currentGoatColor.isValid()) {
                lForMaxChroma = GPG.state.currentGoatColor.toOklch().l;
            } else if (isNaN(lForMaxChroma)) {
                lForMaxChroma = 50;
            }

            let hForMaxChroma = GPG.utils.normalizeHueForDisplay(oklchH_displayValue);

            if (typeof GoatColor.getMaxSRGBChroma === "function") {
                const maxC = GoatColor.getMaxSRGBChroma(lForMaxChroma, hForMaxChroma, GPG.OKLCH_C_SLIDER_STATIC_MAX_ABSOLUTE);
                cAbsolute = (oklchCPercent / 100) * (maxC > 0.0001 ? maxC : GPG.OKLCH_C_SLIDER_STATIC_MAX_ABSOLUTE);
            } else {
                cAbsolute = (oklchCPercent / 100) * GPG.OKLCH_C_SLIDER_STATIC_MAX_ABSOLUTE;
            }

            const isDisabled = cAbsolute < 0.001;

            if (GPG.elements.oklchHSlider.disabled !== isDisabled) {
                GPG.elements.oklchHSlider.disabled = isDisabled;
                GPG.elements.oklchHInputSlider.disabled = isDisabled;
            }

            this.updateUiElementValue(GPG.elements.oklchHSlider, oklchH_displayValue);
            this.updateUiElementValue(GPG.elements.oklchHInputSlider, oklchH_displayValue);
        },

        updateUiElementValue: function (element, value) {
            if (!element) return;
            const stringValue = String(value);
            if (element.value !== stringValue) {
                element.value = stringValue;
            }
        },

        initializeH1Styles: function () {
            const h1 = document.querySelector('h1');
            if (!h1 || !h1.textContent) return;

            const text = h1.textContent;
            h1.innerHTML = '';
            GPG.state.h1Chars = [];

            for (let i = 0; i < text.length; i++) {
                const span = document.createElement('span');
                span.className = 'h1-char';
                span.textContent = text[i];
                if (text[i] === ' ') {
                    span.style.backgroundColor = 'transparent';
                }
                h1.appendChild(span);
                GPG.state.h1Chars.push(span);
            }
        },

        updateH1CharacterStyles: function () {
            if (!GPG.state.h1Chars.length) return;

            const nonSpaceChars = GPG.state.h1Chars.filter(span => span.textContent.trim() !== '');
            const numLetters = nonSpaceChars.length;
            if (numLetters === 0) return;

            if (!GPG.state.currentGoatColor || !GPG.state.currentGoatColor.isValid()) {
                let letterVisualIndexFallback = 0;
                GPG.state.h1Chars.forEach(span => {
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
                        const textColorInstanceFallback = GPG.utils.findContrastingTextColor(bgColorInstanceFallback, bgHueFallback);
                        if (textColorInstanceFallback.isValid()) {
                            span.style.color = textColorInstanceFallback.toRgbString();
                        } else {
                            span.style.color = bgColorInstanceFallback.getRelativeLuminance() > 0.5 ? 'black' : 'white';
                        }
                    } else {
                        span.style.backgroundColor = 'hsl(0 0% 50%)';
                        span.style.color = 'white';
                    }
                    letterVisualIndexFallback++;
                });
                return;
            }

            let varyParam;
            const activeRadioSelector = GPG.state.activePickerMode === "hsl" ?
                '#hslPickerPanel input[name="vary-param-hsl"]:checked' :
                '#oklchPickerPanel input[name="vary-param-oklch"]:checked';
            const checkedRadio = document.querySelector(activeRadioSelector);

            varyParam = checkedRadio ? checkedRadio.value : (GPG.state.activePickerMode === "hsl" ? "hue" : "oklch_h");

            const baseHsl = GPG.state.currentGoatColor.toHsl();
            const baseOklch = GPG.state.currentGoatColor.toOklch();

            let letterVisualIndex = 0;
            GPG.state.h1Chars.forEach(span => {
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
                        const effectiveHForOklchLBg = (baseOklch.c < 0.005 && typeof GPG.state.lastOklchHue !== 'undefined') ? GPG.state.lastOklchHue : Math.round(baseOklch.h);
                        bgColorInstance = GoatColor(`oklch(${currentStepValue}% ${baseOklch.c.toFixed(4)} ${effectiveHForOklchLBg})`);
                        hueForTextColor = Math.round(baseOklch.h);
                        break;
                    case "oklch_c":
                        currentStepValue = fraction * GPG.OKLCH_C_SLIDER_STATIC_MAX_ABSOLUTE;
                        const effectiveHForOklchCBg = (currentStepValue < 0.005 && typeof GPG.state.lastOklchHue !== 'undefined') ? GPG.state.lastOklchHue : Math.round(baseOklch.h);
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
                        if (GPG.state.activePickerMode === "hsl") {
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
                    const textColorInstance = GPG.utils.findContrastingTextColor(bgColorInstance, hueForTextColor);
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
        },

        updateInfoPanel: function () {
            if (!GPG.elements.oklchInfoPanel) return;

            if (GPG.state.activePickerMode === "oklch") {
                GPG.elements.oklchInfoPanel.classList.add('visible');
            } else {
                GPG.elements.oklchInfoPanel.classList.remove('visible');
            }
        },

        updateIncrementUI: function () {
            let labelSuffixElement;
            let selectedRadio = null;
            let paramName = "Parameter";

            document.querySelectorAll('.slider-group').forEach(sg => {
                sg.classList.remove('selected-for-increment');
            });

            if (GPG.state.activePickerMode === "hsl") {
                labelSuffixElement = GPG.elements.dynamicIncrementLabelHsl_suffix;
                selectedRadio = document.querySelector('#hslPickerPanel input[name="vary-param-hsl"]:checked');
            } else {
                labelSuffixElement = GPG.elements.dynamicIncrementLabelOklch_suffix;
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

            if (GPG.elements.incrementValueHsl && GPG.elements.incrementValueOklch) {
                if (GPG.state.activePickerMode === "hsl") {
                    GPG.elements.incrementValueHsl.closest('.increment-control-group-inline').style.display = 'flex';
                    GPG.elements.incrementValueOklch.closest('.increment-control-group-inline').style.display = 'none';
                } else {
                    GPG.elements.incrementValueHsl.closest('.increment-control-group-inline').style.display = 'none';
                    GPG.elements.incrementValueOklch.closest('.increment-control-group-inline').style.display = 'flex';
                }
            }
        }
    };
}(window.GPG));