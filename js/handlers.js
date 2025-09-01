window.GPG = window.GPG || {};

(function (GPG) {
    'use strict';

    GPG.handlers = {
        updateFromHslPicker: function (isSliderEvent = false) {
            if (GPG.state.isProgrammaticUpdate) return;

            let h_ui_val = parseInt(GPG.elements.baseHueInputSlider.value, 10);
            let s_ui_val = parseInt(GPG.elements.baseSaturationInputSlider.value, 10);
            let l_ui_val = parseInt(GPG.elements.baseLightnessInputSlider.value, 10);
            const oPercent_ui = parseInt(GPG.elements.baseOpacityInputSliderHsl.value, 10);

            let h_for_color_creation, s_for_color_creation, l_for_color_creation;

            let h_input_normalized_hsl = isNaN(h_ui_val) ? NaN : GPG.utils.normalizeHueForDisplay(h_ui_val);

            s_for_color_creation = !isNaN(s_ui_val) ? Math.max(0, Math.min(100, s_ui_val)) : GPG.state.currentGoatColor.toHsl().s;
            l_for_color_creation = !isNaN(l_ui_val) ? Math.max(0, Math.min(100, l_ui_val)) : GPG.state.currentGoatColor.toHsl().l;

            if (s_for_color_creation === 0) {
                if (!isNaN(h_input_normalized_hsl)) {
                    GPG.state.lastHslHue = h_input_normalized_hsl;
                }
                h_for_color_creation = isNaN(GPG.state.lastHslHue) ? 0 : GPG.state.lastHslHue;
            } else {
                h_for_color_creation = !isNaN(h_input_normalized_hsl) ? h_input_normalized_hsl : (isNaN(GPG.state.lastHslHue) ? 0 : GPG.state.lastHslHue);
                GPG.state.lastHslHue = h_for_color_creation;
            }

            if (!isNaN(oPercent_ui)) {
                GPG.state.currentGoatColor = GoatColor(`hsla(${h_for_color_creation},${s_for_color_creation}%,${l_for_color_creation}%,${oPercent_ui / 100})`);

                if (GPG.state.currentGoatColor.isValid()) {
                    const oklchEquiv = GPG.state.currentGoatColor.toOklch();
                    if (oklchEquiv.c >= 0.001) {
                        GPG.state.lastOklchHue = GPG.utils.normalizeHueForDisplay(oklchEquiv.h);
                    }
                }
                GPG.ui.syncAllUiFromMasterColor();
                GPG.palette.generatePaletteDynamically(isSliderEvent);
            } else {
                GPG.ui.syncAllUiFromMasterColor();
                GPG.palette.generatePaletteDynamically(isSliderEvent);
            }
        },

        updateFromOklchPicker: function (isSliderEvent = false) {
            if (GPG.state.isProgrammaticUpdate) return;

            let l_ui = parseInt(GPG.elements.oklchLInputSlider.value, 10);
            let c_percent_ui = parseFloat(GPG.elements.oklchCInputSlider.value);
            let h_input_value = parseInt(GPG.elements.oklchHInputSlider.value, 10);
            const o_percent_ui = parseInt(GPG.elements.baseOpacityInputSliderOklch.value, 10);

            if (isNaN(l_ui) || isNaN(c_percent_ui) || isNaN(h_input_value) || isNaN(o_percent_ui)) {
                GPG.ui.syncAllUiFromMasterColor();
                GPG.palette.generatePaletteDynamically(isSliderEvent);
                return;
            }

            let h_input_normalized = GPG.utils.normalizeHueForDisplay(h_input_value);
            c_percent_ui = Math.max(0, Math.min(100, c_percent_ui));

            let max_abs_c_for_current_lc_and_h_input = GoatColor.getMaxSRGBChroma(l_ui, h_input_normalized, GPG.OKLCH_C_SLIDER_STATIC_MAX_ABSOLUTE);
            if (max_abs_c_for_current_lc_and_h_input < 0.0001) max_abs_c_for_current_lc_and_h_input = GPG.OKLCH_C_SLIDER_STATIC_MAX_ABSOLUTE;

            let c_absolute_for_creation = (c_percent_ui / 100) * max_abs_c_for_current_lc_and_h_input;
            let hue_for_color_creation;

            if (c_absolute_for_creation < 0.001) {
                hue_for_color_creation = GPG.state.lastOklchHue;
                c_absolute_for_creation = 0;
            } else {
                hue_for_color_creation = h_input_normalized;
                GPG.state.lastOklchHue = h_input_normalized;
            }
            hue_for_color_creation = GPG.utils.normalizeHueForDisplay(hue_for_color_creation);

            const o_val_ui = o_percent_ui / 100.0;
            GPG.state.currentGoatColor = GoatColor(`oklch(${l_ui}% ${c_absolute_for_creation.toFixed(4)} ${hue_for_color_creation} / ${o_val_ui})`);

            if (!GPG.state.currentGoatColor.isValid()) {
                GPG.state.currentGoatColor = GoatColor(`oklch(50% 0.1 ${GPG.utils.normalizeHueForDisplay(GPG.state.lastOklchHue)})`);
            }

            GPG.ui.syncAllUiFromMasterColor();
            GPG.palette.generatePaletteDynamically(isSliderEvent);
        },

        handleDropOnPicker: function (event) {
            event.preventDefault();
            GPG.elements.colorPreviewBoxHsl.classList.remove('drag-over');
            GPG.elements.colorPreviewBoxOklch.classList.remove('drag-over');

            const colorString = event.dataTransfer.getData('text/plain');
            if (colorString) {
                const newColor = GoatColor(colorString);
                if (newColor.isValid()) {
                    GPG.state.currentGoatColor = newColor;
                    const newHsl = newColor.toHsl();
                    const newOklch = newColor.toOklch();

                    if (newHsl.s > 0) {
                        GPG.state.lastHslHue = GPG.utils.normalizeHueForDisplay(newHsl.h);
                    } else {
                        if (isNaN(GPG.state.lastHslHue)) GPG.state.lastHslHue = GPG.utils.normalizeHueForDisplay(newHsl.h);
                    }

                    if (newOklch.c >= 0.001) {
                        GPG.state.lastOklchHue = GPG.utils.normalizeHueForDisplay(newOklch.h);
                    } else {
                        if (isNaN(GPG.state.lastOklchHue)) GPG.state.lastOklchHue = GPG.utils.normalizeHueForDisplay(newOklch.h);
                    }

                    const targetPanelId = GPG.state.activePickerMode === "hsl" ? "hslPickerPanel" : "oklchPickerPanel";
                    GPG.ui.syncAllUiFromMasterColor(true, targetPanelId);
                    GPG.palette.generatePaletteDynamically(false);
                } else {
                    console.warn("Dropped color string is invalid:", colorString, newColor.error);
                }
            }
        },

        handleColorStringInputChange: function (event) {
            const inputElement = event.target;
            const colorString = inputElement.value;

            if (colorString.trim() === "") {
                inputElement.classList.remove('invalid');
                return;
            }

            const newColor = GoatColor(colorString);

            if (newColor.isValid()) {
                inputElement.classList.remove('invalid');
                GPG.state.currentGoatColor = newColor;

                const newHsl = newColor.toHsl();
                if (newHsl.s > 0) {
                    GPG.state.lastHslHue = GPG.utils.normalizeHueForDisplay(newHsl.h);
                }

                const newOklch = newColor.toOklch();
                if (newOklch.c >= 0.001) {
                    GPG.state.lastOklchHue = GPG.utils.normalizeHueForDisplay(newOklch.h);
                }

                const targetPanelId = GPG.state.activePickerMode === "hsl" ? "hslPickerPanel" : "oklchPickerPanel";
                GPG.ui.syncAllUiFromMasterColor(true, targetPanelId);
                GPG.palette.generatePaletteDynamically(false);
            } else {
                inputElement.classList.add('invalid');
            }
        }
    };
}(window.GPG));