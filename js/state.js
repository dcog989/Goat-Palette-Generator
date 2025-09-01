window.GPG = window.GPG || {};

(function (GPG) {
    'use strict';

    GPG.state = {
        activePickerMode: "hsl",
        currentGoatColor: null,
        debounceTimer: null,
        generatedColors: [],
        h1Chars: [],
        isProgrammaticUpdate: false,
        lastHslHue: 0,
        lastOklchHue: 0,
    };

}(window.GPG));