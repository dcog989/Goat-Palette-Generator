window.GPG = window.GPG || {};

(function (GPG) {
    'use strict';

    function setupSliderInputPair(slider, input, updateCallback) {
        slider.addEventListener("input", () => {
            if (GPG.state.isProgrammaticUpdate) return;
            let value = Math.round(parseFloat(slider.value));
            GPG.state.isProgrammaticUpdate = true;
            input.value = value;
            GPG.state.isProgrammaticUpdate = false;
            updateCallback(true);
        });

        input.addEventListener("input", () => {
            if (GPG.state.isProgrammaticUpdate) return;

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
                GPG.state.isProgrammaticUpdate = true;
                if (slider) slider.value = Math.max(min, Math.min(max, numericValue));
                GPG.state.isProgrammaticUpdate = false;
            }

            if (input.id.startsWith("oklch-c")) {
                const currentHInputValue = parseInt(GPG.elements.oklchHInputSlider.value, 10);
                const currentCInputValue = parseFloat(GPG.elements.oklchCInputSlider.value);
                const currentLInputValue = parseInt(GPG.elements.oklchLInputSlider.value, 10);
                GPG.ui.updateOklchHueSliderState(currentCInputValue, currentLInputValue, isNaN(currentHInputValue) ? GPG.state.lastOklchHue : currentHInputValue);
            } else if (input.id.startsWith("oklch-l") || input.id.startsWith("oklch-h")) {
                const currentHInputValue = parseInt(GPG.elements.oklchHInputSlider.value, 10);
                const currentCInputValue = parseFloat(GPG.elements.oklchCInputSlider.value);
                const currentLInputValue = parseInt(GPG.elements.oklchLInputSlider.value, 10);
                if (!isNaN(currentCInputValue)) {
                    GPG.ui.updateOklchHueSliderState(currentCInputValue, currentLInputValue, isNaN(currentHInputValue) ? GPG.state.lastOklchHue : currentHInputValue);
                }
            }

            if (input.id.startsWith("oklch-") || input.id.startsWith("base-")) {
                GPG.ui.updateAllSliderBackgrounds();
            }
        });

        input.addEventListener("change", () => {
            if (GPG.state.isProgrammaticUpdate) return;
            let numericValue = parseFloat(input.value);
            const min = parseFloat(input.min);
            const max = parseFloat(input.max);

            if (isNaN(numericValue) || numericValue < min) {
                numericValue = min;
            } else if (numericValue > max) {
                numericValue = max;
            }
            const finalValue = input.classList.contains('increment-value-inline') ? Math.round(numericValue) : parseFloat(numericValue.toFixed(input.step && input.step.includes('.') ? String(input.step).split('.')[1].length : 0));

            GPG.state.isProgrammaticUpdate = true;
            input.value = finalValue;
            if (slider) slider.value = finalValue;
            GPG.state.isProgrammaticUpdate = false;

            if (updateCallback) updateCallback(false);
        });
    }

    function initializeApp() {
        if (typeof GoatColor === "undefined" || typeof GoatColor.getMaxSRGBChroma === "undefined") {
            setTimeout(initializeApp, 50);
            return;
        }

        GPG.cacheElements();

        if (!GPG.validateCachedElements()) {
            if (GPG.elements.paletteContainer) GPG.elements.paletteContainer.innerHTML = "<p>Error: App Init Failed. Check console.</p>";
            return;
        }

        const lastActiveTabIdStored = localStorage.getItem('goatPaletteGenerator_activeTab');
        let initialTabIdToActivate = 'hslPickerPanel';

        if (lastActiveTabIdStored && document.querySelector(`.tabs .tab-link[data-tab="${lastActiveTabIdStored}"]`)) {
            initialTabIdToActivate = lastActiveTabIdStored;
        }

        GPG.elements.oklchCSlider.min = 0;
        GPG.elements.oklchCSlider.max = 100;
        GPG.elements.oklchCSlider.step = 1;
        GPG.elements.oklchCInputSlider.min = 0;
        GPG.elements.oklchCInputSlider.max = 100;
        GPG.elements.oklchCInputSlider.step = 1;

        const minHue = 4;
        const maxHue = 245;
        const initialH = Math.floor(Math.random() * (maxHue - minHue + 1)) + minHue;
        const initialS = 76;
        const initialL = 36;
        const initialO = 100;
        const initialNumSwatches = 6;

        GPG.state.currentGoatColor = GoatColor(`hsla(${initialH}, ${initialS}%, ${initialL}%, ${initialO / 100})`);
        if (GPG.state.currentGoatColor.isValid()) {
            const initialMasterHsl = GPG.state.currentGoatColor.toHsl();
            const initialOklch = GPG.state.currentGoatColor.toOklch();

            if (initialMasterHsl.s > 0) {
                GPG.state.lastHslHue = GPG.utils.normalizeHueForDisplay(initialMasterHsl.h);
            } else {
                GPG.state.lastHslHue = GPG.utils.normalizeHueForDisplay(initialH);
            }

            if (initialOklch.c >= 0.001) {
                GPG.state.lastOklchHue = GPG.utils.normalizeHueForDisplay(initialOklch.h);
            } else {
                GPG.state.lastOklchHue = GPG.utils.normalizeHueForDisplay(initialMasterHsl.h);
            }
        } else {
            GPG.state.currentGoatColor = GoatColor(`hsla(0, 75%, 50%, 1)`);
            GPG.state.lastOklchHue = 0;
            GPG.state.lastHslHue = 0;
            console.error("Failed to initialize with specified random color, using default red.");
        }

        GPG.elements.baseHueInputSlider.value = initialH;
        GPG.elements.baseSaturationInputSlider.value = initialS;
        GPG.elements.baseLightnessInputSlider.value = initialL;
        GPG.elements.baseOpacityInputSliderHsl.value = initialO;
        GPG.elements.baseHueSlider.value = GPG.elements.baseHueInputSlider.value;
        GPG.elements.baseSaturationSlider.value = GPG.elements.baseSaturationInputSlider.value;
        GPG.elements.baseLightnessSlider.value = GPG.elements.baseLightnessInputSlider.value;
        GPG.elements.baseOpacitySliderHsl.value = GPG.elements.baseOpacityInputSliderHsl.value;
        GPG.elements.baseOpacityInputSliderOklch.value = initialO;
        GPG.elements.baseOpacitySliderOklch.value = GPG.elements.baseOpacityInputSliderOklch.value;
        GPG.elements.incrementValueHsl.value = initialNumSwatches;
        GPG.elements.incrementValueOklch.value = initialNumSwatches;

        const defaultExportFormatRadio = document.getElementById("format-hsl");
        if (defaultExportFormatRadio) defaultExportFormatRadio.checked = true;

        GPG.elements.exportButton.addEventListener("click", GPG.exporter.exportCssPalette);
        GPG.elements.exportXmlButton.addEventListener("click", GPG.exporter.exportXmlPalette);

        setupSliderInputPair(GPG.elements.baseHueSlider, GPG.elements.baseHueInputSlider, GPG.handlers.updateFromHslPicker);
        setupSliderInputPair(GPG.elements.baseSaturationSlider, GPG.elements.baseSaturationInputSlider, GPG.handlers.updateFromHslPicker);
        setupSliderInputPair(GPG.elements.baseLightnessSlider, GPG.elements.baseLightnessInputSlider, GPG.handlers.updateFromHslPicker);
        setupSliderInputPair(GPG.elements.baseOpacitySliderHsl, GPG.elements.baseOpacityInputSliderHsl, GPG.handlers.updateFromHslPicker);

        setupSliderInputPair(GPG.elements.oklchLSlider, GPG.elements.oklchLInputSlider, GPG.handlers.updateFromOklchPicker);
        setupSliderInputPair(GPG.elements.oklchCSlider, GPG.elements.oklchCInputSlider, GPG.handlers.updateFromOklchPicker);
        setupSliderInputPair(GPG.elements.oklchHSlider, GPG.elements.oklchHInputSlider, GPG.handlers.updateFromOklchPicker);
        setupSliderInputPair(GPG.elements.baseOpacitySliderOklch, GPG.elements.baseOpacityInputSliderOklch, GPG.handlers.updateFromOklchPicker);

        [GPG.elements.colorStringInputHsl, GPG.elements.colorStringInputOklch].forEach(input => {
            if (input) {
                input.addEventListener('change', GPG.handlers.handleColorStringInputChange);
                input.addEventListener('input', () => {
                    input.classList.remove('invalid');
                });
            }
        });

        [GPG.elements.incrementValueHsl, GPG.elements.incrementValueOklch].forEach(inputEl => {
            if (inputEl) {
                const maxVal = parseInt(inputEl.max, 10);
                const minVal = parseInt(inputEl.min, 10);

                inputEl.addEventListener("input", () => {
                    let value = parseInt(inputEl.value, 10);
                    if (!isNaN(value) && value > maxVal) {
                        inputEl.value = maxVal;
                    }
                    GPG.ui.updateIncrementUI();
                    GPG.palette.generatePaletteDynamically(false);
                });

                inputEl.addEventListener("change", () => {
                    let value = parseInt(inputEl.value, 10);
                    if (isNaN(value) || value < minVal) {
                        inputEl.value = minVal;
                    } else if (value > maxVal) {
                        inputEl.value = maxVal;
                    }
                    GPG.ui.updateIncrementUI();
                    GPG.palette.generate();
                });
            }
        });

        GPG.elements.varyParamRadiosHsl.forEach((radio) => {
            radio.addEventListener("change", () => {
                GPG.ui.updateIncrementUI();
                GPG.palette.generate();
                GPG.ui.updateH1CharacterStyles();
            });
        });
        GPG.elements.varyParamRadiosOklch.forEach((radio) => {
            radio.addEventListener("change", () => {
                GPG.ui.updateIncrementUI();
                GPG.palette.generate();
                GPG.ui.updateH1CharacterStyles();
            });
        });

        GPG.elements.exportFormatRadios.forEach((radio) => {
            radio.addEventListener("change", () => {
                if (GPG.state.generatedColors.length > 0) {
                    GPG.elements.paletteContainer.innerHTML = "";
                    for (const color of GPG.state.generatedColors) {
                        GPG.ui.createSwatch(color, GPG.elements.paletteContainer);
                    }
                }
            });
        });

        if (GPG.elements.tabLinks && GPG.elements.tabLinks.length > 0) {
            GPG.elements.tabLinks.forEach((link) => {
                link.addEventListener("click", (e) => {
                    e.preventDefault();
                    const clickedTabId = link.getAttribute("data-tab");
                    localStorage.setItem('goatPaletteGenerator_activeTab', clickedTabId);

                    const newActivePickerMode = clickedTabId === "oklchPickerPanel" ? "oklch" : "hsl";
                    let previousVaryParamValue = null;

                    if (GPG.state.activePickerMode === "hsl") {
                        const checkedHslRadio = document.querySelector('#hslPickerPanel input[name="vary-param-hsl"]:checked');
                        if (checkedHslRadio) previousVaryParamValue = checkedHslRadio.value;
                    } else {
                        const checkedOklchRadio = document.querySelector('#oklchPickerPanel input[name="vary-param-oklch"]:checked');
                        if (checkedOklchRadio) previousVaryParamValue = checkedOklchRadio.value;
                    }

                    GPG.state.activePickerMode = newActivePickerMode;

                    GPG.elements.tabLinks.forEach((l) => l.classList.remove("active"));
                    GPG.elements.tabContents.forEach((c) => c.classList.remove("active"));
                    link.classList.add("active");
                    document.getElementById(clickedTabId).classList.add("active");

                    let targetRadioId = null;
                    if (previousVaryParamValue) {
                        if (GPG.state.activePickerMode === "oklch") {
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

                    if (targetRadioId) {
                        const targetRadio = document.getElementById(targetRadioId);
                        if (targetRadio) {
                            targetRadio.checked = true;
                        }
                    }

                    GPG.ui.updateIncrementUI();
                    GPG.ui.updateInfoPanel();
                    GPG.ui.syncAllUiFromMasterColor(true, clickedTabId);
                    GPG.palette.generatePaletteDynamically(false);
                    GPG.ui.updateH1CharacterStyles();
                });
            });

            GPG.elements.tabLinks.forEach(link => {
                const tabId = link.getAttribute('data-tab');
                if (tabId === initialTabIdToActivate) {
                    link.classList.add('active');
                    if (document.getElementById(tabId)) document.getElementById(tabId).classList.add('active');
                    GPG.state.activePickerMode = tabId === "oklchPickerPanel" ? "oklch" : "hsl";
                } else {
                    link.classList.remove('active');
                    if (document.getElementById(tabId)) document.getElementById(tabId).classList.remove('active');
                }
            });
        }

        if (GPG.state.activePickerMode === "hsl") {
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

        [GPG.elements.colorPreviewBoxHsl, GPG.elements.colorPreviewBoxOklch].forEach(pickerBox => {
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
                    GPG.handlers.handleDropOnPicker(event);
                });
            }
        });

        const MQL = window.matchMedia("(prefers-color-scheme: dark)");
        MQL.addEventListener("change", () => {
            GPG.ui.updateAllSliderBackgrounds();
            GPG.ui.updateDynamicSliderThumbStyles();
            if (GPG.state.generatedColors.length > 0) {
                GPG.elements.paletteContainer.innerHTML = "";
                for (const color of GPG.state.generatedColors) {
                    GPG.ui.createSwatch(color, GPG.elements.paletteContainer);
                }
            }
        });

        GPG.ui.initializeH1Styles();
        GPG.ui.updateIncrementUI();
        GPG.ui.updateInfoPanel();
        GPG.ui.syncAllUiFromMasterColor(true, initialTabIdToActivate);
        try {
            GPG.palette.generate();
        } catch (e) {
            console.error("Error during initial generatePalette():", e);
        }
    }

    document.addEventListener("DOMContentLoaded", initializeApp);

}(window.GPG));