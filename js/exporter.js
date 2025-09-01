window.GPG = window.GPG || {};

(function (GPG) {
    'use strict';

    function generateExportHeaderComment() {
        if (!GPG.state.currentGoatColor || !GPG.state.currentGoatColor.isValid()) return "/* Base color invalid */\n\n";

        const numSwatchesInputEl = GPG.state.activePickerMode === "hsl" ? GPG.elements.incrementValueHsl : GPG.elements.incrementValueOklch;
        const numSwatches = parseInt(numSwatchesInputEl.value, 10) || 1;

        const varyParamRadioGroup = GPG.state.activePickerMode === "hsl" ? GPG.elements.varyParamRadiosHsl : GPG.elements.varyParamRadiosOklch;
        let varyParamDataName = "Parameter";
        varyParamRadioGroup.forEach(radio => {
            if (radio.checked) {
                varyParamDataName = radio.getAttribute('data-param-name') || "Parameter";
            }
        });

        let exportFormat = document.querySelector('input[name="export-format"]:checked').value;

        let baseColorStringForComment;
        const opacityForBaseComment = GPG.state.currentGoatColor.a;

        if (GPG.state.activePickerMode === "hsl") {
            const baseHsl = GPG.state.currentGoatColor.toHsl();
            if (Math.abs(opacityForBaseComment - 1) < 1e-9) {
                baseColorStringForComment = `hsl(${Math.round(baseHsl.h)}° ${Math.round(baseHsl.s)}% ${Math.round(baseHsl.l)}%)`;
            } else {
                baseColorStringForComment = `hsla(${Math.round(baseHsl.h)}° ${Math.round(baseHsl.s)}% ${Math.round(baseHsl.l)}% ${parseFloat(opacityForBaseComment.toFixed(2))})`;
            }
        } else {
            const baseOklch = GPG.state.currentGoatColor.toOklch();
            if (Math.abs(opacityForBaseComment - 1) < 1e-9) {
                baseColorStringForComment = `oklch(${Math.round(baseOklch.l)}% ${baseOklch.c.toFixed(3)} ${Math.round(baseOklch.h)})`;
            } else {
                baseColorStringForComment = `oklch(${Math.round(baseOklch.l)}% ${baseOklch.c.toFixed(3)} ${Math.round(baseOklch.h)} / ${parseFloat(opacityForBaseComment.toFixed(2))})`;
            }
        }

        return `/*\n * Palette based on ${baseColorStringForComment}\n * Varying: ${varyParamDataName}, Number of Swatches: ${numSwatches}\n * Export Format: ${exportFormat.toUpperCase()}\n */\n\n`;
    }

    function generateExportFilename(base, extension) {
        const now = new Date();
        const year = String(now.getFullYear()).slice(-2);
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');

        return `${base}-${year}${month}${day}-${hours}${minutes}.${extension}`;
    }

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

    function processColorsForExport(exportFormat, individualColorFormatter) {
        if (GPG.state.generatedColors.length === 0) {
            alert("Generate a palette first!");
            return null;
        }

        const opacityInputForHint = GPG.utils.getActiveOpacityInput();
        const opacityStyleHint = opacityInputForHint.value.includes("%") ? GoatColor.ALPHA_STYLE_HINT_PERCENT : GoatColor.ALPHA_STYLE_HINT_NUMBER;

        let outputItems = [];
        GPG.state.generatedColors.forEach((colorData, index) => {
            const hslaStringInput = `hsla(${colorData.hsl.h}, ${colorData.hsl.s}%, ${colorData.hsl.l}%, ${colorData.o})`;
            const colorInstance = GoatColor(hslaStringInput);
            if (!colorInstance.isValid()) {
                console.warn("Skipping invalid color during export:", colorData);
                return;
            }
            colorInstance.setAlpha(colorData.o, opacityStyleHint);
            const formattedColorString = GPG.utils.getFormattedColorString(colorInstance, exportFormat);
            outputItems.push(individualColorFormatter(colorInstance, index, formattedColorString, exportFormat));
        });
        return outputItems.join('');
    }

    GPG.exporter = {
        exportCssPalette: function () {
            const exportFormat = document.querySelector('input[name="export-format"]:checked').value;
            const comment = generateExportHeaderComment();

            const cssVarLines = processColorsForExport(exportFormat, (colorInstance, index, formattedString) => {
                const varName = `--color-${String(index + 1).padStart(3, "0")}`;
                return `  ${varName}: ${formattedString};\n`;
            });

            if (cssVarLines === null) return;

            const cssContent = comment + ":root {\n" + cssVarLines + "}";
            downloadFile(cssContent, generateExportFilename("palette", "css"), "text/css");
        },

        exportXmlPalette: function () {
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
    };
}(window.GPG));