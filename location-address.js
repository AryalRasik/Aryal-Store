/* Shared "use current location" helper for address forms. */
(function () {
  function normalize(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/province|pradesh|district|municipality|rural municipality|metropolitan city|sub-metropolitan city/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function findMatch(candidates, options) {
    var normalizedCandidates = candidates.map(normalize).filter(Boolean);
    for (var i = 0; i < normalizedCandidates.length; i++) {
      var candidate = normalizedCandidates[i];
      for (var j = 0; j < options.length; j++) {
        var option = normalize(options[j]);
        if (!option) continue;
        if (candidate === option || candidate.indexOf(option) !== -1 || option.indexOf(candidate) !== -1) {
          return options[j];
        }
      }
    }
    return '';
  }

  function matchNepalLocation(address) {
    var data = window.NEPAL_LOCATIONS;
    if (!data || !data.provinces) return { province: '', district: '', municipality: '', ward: '' };
    address = address || {};
    var provinceNames = data.provinces.map(function (p) { return p.name; });
    var provinceName = findMatch([address.state, address.province], provinceNames);
    var province = data.provinces.find(function (p) { return p.name === provinceName; });
    var districtNames = province ? province.districts.map(function (d) { return d.name; }) : [];
    var districtName = findMatch([address.district, address.county], districtNames);
    var district = province ? province.districts.find(function (d) { return d.name === districtName; }) : null;
    var municipalityNames = district ? (district.municipalities || district.municipality || []).map(function (m) {
      return typeof m === 'string' ? m : m.name;
    }) : [];
    var municipalityName = findMatch(
      [address.municipality, address.city, address.town, address.village, address.neighbourhood],
      municipalityNames
    );
    return {
      province: provinceName,
      district: districtName,
      municipality: municipalityName,
      ward: address.ward || address.house_number || '',
      street: address.road || '',
      tole: address.neighbourhood || address.city || ''
    };
  }

  function mapUrl(lat, lng) {
    return 'https://www.google.com/maps?q=' + encodeURIComponent(lat) + ',' + encodeURIComponent(lng);
  }

  function resolveElement(selector) {
    if (!selector) return null;
    if (typeof selector !== 'string') return selector;
    if (/^[#.\[]/.test(selector)) return document.querySelector(selector);
    return document.getElementById(selector) || document.querySelector(selector);
  }

  function fillInput(selector, value) {
    var el = resolveElement(selector);
    if (!el || value === undefined || value === null || value === '') return false;
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function fillSelect(selector, value) {
    var el = resolveElement(selector);
    if (!el || !value) return false;
    var wanted = normalize(value);
    for (var i = 0; i < el.options.length; i++) {
      var option = normalize(el.options[i].value || el.options[i].textContent);
      if (option && (option === wanted || option.indexOf(wanted) !== -1 || wanted.indexOf(option) !== -1)) {
        el.selectedIndex = i;
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
    }
    return false;
  }

  function formatDisplayAddress(address) {
    var parts = [
      address.house_number,
      address.road,
      address.neighbourhood,
      address.city || address.municipality,
      address.district,
      address.state,
      address.postcode
    ].filter(Boolean);
    return parts.length ? parts.join(', ') : '';
  }

  function setStatus(el, text, tone) {
    if (!el) return;
    el.textContent = text;
    el.style.color = tone === 'error' ? '#b23a2e' : tone === 'success' ? '#2f7d4f' : '#666666';
  }

  function init(options) {
    options = options || {};
    var button = resolveElement(options.button);
    if (!button || button.dataset.locationReady === '1') return;
    button.dataset.locationReady = '1';
    var status = resolveElement(options.status);
    var mapLink = resolveElement(options.mapLink);
    var latInput = resolveElement(options.latInput);
    var lngInput = resolveElement(options.lngInput);
    var accuracyInput = resolveElement(options.accuracyInput);
    var originalText = button.innerHTML;

    function setCoordinates(lat, lng, accuracy) {
      if (latInput) latInput.value = lat;
      if (lngInput) lngInput.value = lng;
      if (accuracyInput) accuracyInput.value = accuracy || '';
      if (mapLink) {
        mapLink.href = mapUrl(lat, lng);
        mapLink.style.display = 'inline-flex';
      }
    }

    button.addEventListener('click', function (event) {
      event.preventDefault();
      if (!navigator.geolocation) {
        setStatus(status, 'Location is not supported by this browser. Please enter your address manually.', 'error');
        return;
      }
      button.disabled = true;
      button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Locating...';
      setStatus(status, 'Getting your GPS location...', '');
      navigator.geolocation.getCurrentPosition(function (position) {
        var lat = position.coords.latitude;
        var lng = position.coords.longitude;
        var accuracy = Math.round(position.coords.accuracy || 0);
        setCoordinates(lat, lng, accuracy);
        if (typeof options.onCoords === 'function') options.onCoords({ latitude: lat, longitude: lng, accuracy: accuracy });
        setStatus(status, 'Location captured. Looking up your address...', '');

        fetch('/api/geocode/reverse?lat=' + encodeURIComponent(lat) + '&lng=' + encodeURIComponent(lng))
          .then(function (response) { return response.json().then(function (data) { return { ok: response.ok, data: data }; }); })
          .then(function (result) {
            if (!result.ok || !result.data || !result.data.success) throw new Error((result.data && result.data.error) || 'Address lookup failed');
            var data = result.data;
            if (typeof options.onAddress === 'function') options.onAddress(data, { latitude: lat, longitude: lng, accuracy: accuracy });
            setStatus(status, 'Location saved. Please check the address details below.', 'success');
          })
          .catch(function () {
            setStatus(status, 'Location pinned. Address lookup failed, so please type your address below.', 'error');
          })
          .then(function () {
            button.disabled = false;
            button.innerHTML = '<i class="fas fa-crosshairs"></i> Use My Current Location';
            if (typeof options.onDone === 'function') options.onDone();
          });
      }, function (error) {
        var message = 'Could not get your location. Please allow location access or enter the address manually.';
        if (error && error.code === 1) message = 'Location permission was denied. Please allow it in your browser settings or enter the address manually.';
        if (error && error.code === 3) message = 'Location request timed out. Please try again or enter the address manually.';
        setStatus(status, message, 'error');
        button.disabled = false;
        button.innerHTML = originalText;
      }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
    });
  }

  window.AryalLocation = {
    init: init,
    matchNepalLocation: matchNepalLocation,
    mapUrl: mapUrl,
    fillInput: fillInput,
    fillSelect: fillSelect,
    formatDisplayAddress: formatDisplayAddress,
    normalize: normalize
  };
})();
