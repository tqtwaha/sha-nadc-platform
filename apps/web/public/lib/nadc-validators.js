/* lib/nadc-validators.js — ES5 IIFE, no build step
   Kenya mobile validation + normalisation.
   Extend for additional African country codes as needed. */
(function(global){
  'use strict';

  /* Kenya mobile: +254 prefix + 9-digit national number starting with 7 or 1.
     Accepted input formats:
       +254712345678  (international with plus)
        254712345678  (international without plus)
         0712345678   (local with leading zero)
     Normalised output: +254XXXXXXXXX */
  var KENYA_RE = /^(?:\+254|254|0)((?:7|1)\d{8})$/;

  function validateKenyaMobile(input) {
    if (typeof input !== 'string') {
      return { valid: false, normalised: null };
    }
    var trimmed = input.replace(/[\s\-()]/g, '');
    var m = KENYA_RE.exec(trimmed);
    if (!m) {
      return { valid: false, normalised: null };
    }
    return { valid: true, normalised: '+254' + m[1] };
  }

  /* Wire any <input data-tel-ke> elements on the page:
     - Shows inline error feedback
     - Stores normalised value in input.dataset.normalised on valid blur */
  function wireKenyaTelInputs(root) {
    root = root || document;
    var inputs = root.querySelectorAll('input[data-tel-ke]');
    for (var i = 0; i < inputs.length; i++) {
      (function(inp) {
        inp.addEventListener('blur', function() {
          var result = validateKenyaMobile(inp.value);
          if (inp.value === '') {
            inp.style.borderColor = '';
            inp.dataset.normalised = '';
            inp.title = '';
            return;
          }
          if (result.valid) {
            inp.style.borderColor = 'rgba(80,192,32,0.6)';
            inp.dataset.normalised = result.normalised;
            inp.title = 'Normalised: ' + result.normalised;
          } else {
            inp.style.borderColor = 'rgba(255,59,48,0.7)';
            inp.dataset.normalised = '';
            inp.title = 'Invalid Kenya number. Use +254XXXXXXXXX, 0XXXXXXXXX or 254XXXXXXXXX';
          }
        });
        inp.addEventListener('focus', function() {
          inp.style.borderColor = '';
        });
      })(inputs[i]);
    }
  }

  global.NACDValidators = {
    validateKenyaMobile: validateKenyaMobile,
    wireKenyaTelInputs:  wireKenyaTelInputs
  };

})(typeof window !== 'undefined' ? window : this);
