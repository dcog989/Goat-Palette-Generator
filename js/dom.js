window.GPG = window.GPG || {};

(function (GPG) {
    'use strict';

    GPG.elements = {};

    GPG.cacheElements = function () {
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
            colorStringInputHsl: "color-string-input-hsl",
            colorStringInputOklch: "color-string-input-oklch",
        };

        for (const key in elementIdMap) {
            GPG.elements[key] = document.getElementById(elementIdMap[key]);
        }

        GPG.elements.varyParamRadiosHsl = document.querySelectorAll('#hslPickerPanel input[name="vary-param-hsl"]');
        GPG.elements.varyParamRadiosOklch = document.querySelectorAll('#oklchPickerPanel input[name="vary-param-oklch"]');
        GPG.elements.exportFormatRadios = document.querySelectorAll('input[name="export-format"]');
        GPG.elements.tabLinks = document.querySelectorAll(".tabs .tab-link");
        GPG.elements.tabContents = document.querySelectorAll(".picker-column .tab-content");

        if (GPG.elements.colorPreviewBoxHsl) {
            GPG.elements.colorPreviewBoxHsl_checkerboard = GPG.elements.colorPreviewBoxHsl.querySelector(".checkerboard-element");
            GPG.elements.colorPreviewBoxHsl_colorOverlay = GPG.elements.colorPreviewBoxHsl.querySelector(".color-overlay-element");
        }
        if (GPG.elements.colorPreviewBoxOklch) {
            GPG.elements.colorPreviewBoxOklch_checkerboard = GPG.elements.colorPreviewBoxOklch.querySelector(".checkerboard-element");
            GPG.elements.colorPreviewBoxOklch_colorOverlay = GPG.elements.colorPreviewBoxOklch.querySelector(".color-overlay-element");
        }

        GPG.elements.opacitySliderElementHsl = GPG.elements.baseOpacitySliderHsl;
        GPG.elements.opacitySliderElementOklch = GPG.elements.baseOpacitySliderOklch;
    };

    GPG.validateCachedElements = function () {
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
            "dynamicIncrementLabelOklch_suffix",
            "colorStringInputHsl", "colorStringInputOklch"
        ];

        let initFailed = false;
        criticalElementIds.forEach(id => {
            if (!GPG.elements[id]) {
                console.error(`Missing critical element: ${id}`);
                initFailed = true;
            }
        });
        if (!GPG.elements.colorPreviewBoxHsl_checkerboard || !GPG.elements.colorPreviewBoxHsl_colorOverlay ||
            !GPG.elements.colorPreviewBoxOklch_checkerboard || !GPG.elements.colorPreviewBoxOklch_colorOverlay ||
            (GPG.elements.varyParamRadiosHsl && GPG.elements.varyParamRadiosHsl.length !== 4) ||
            (GPG.elements.varyParamRadiosOklch && GPG.elements.varyParamRadiosOklch.length !== 4) ||
            (GPG.elements.exportFormatRadios && GPG.elements.exportFormatRadios.length !== 4) ||
            (GPG.elements.tabLinks && GPG.elements.tabLinks.length !== 2) ||
            (GPG.elements.tabContents && GPG.elements.tabContents.length !== 2)
        ) {
            if (!initFailed) console.error("Critical DOM elements missing or incorrect count. Halting initialization.", GPG.elements);
            initFailed = true;
        }

        return !initFailed;
    };
}(window.GPG));