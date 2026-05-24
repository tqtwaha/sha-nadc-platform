// lib/nadc-routing.js — Traffic-aware routing for SHA NADC
// Hybrid: Google Maps Directions API (via /api/directions proxy) for traffic data,
// Mapbox Directions as fallback when Google key is not configured or unavailable.
// Renders on Mapbox GL JS — best of both worlds.
//
// Usage:
//   NACDRouting.fetchRoute(lng1, lat1, lng2, lat2, function(result) {
//     // result.geometry      — GeoJSON LineString {type,coordinates}
//     // result.duration      — normal drive time (seconds)
//     // result.durationInTraffic — traffic-adjusted time (seconds)
//     // result.distance      — route distance (metres)
//     // result.trafficColor  — CSS colour reflecting congestion level
//     // result.delaySecs     — extra seconds due to traffic (0 if none)
//   });

(function (global) {
  'use strict';

  var _cache   = {};
  var _pending = {};

  // Mapbox public token — only used as fallback when Google key absent
  var _MBXTOKEN = '';

  // ── Google encoded polyline decoder ──────────────────────────────────────
  // Returns [[lng, lat], ...] (Mapbox order — longitude first)
  function decodePolyline(encoded) {
    var coords = [];
    var idx = 0, len = encoded.length;
    var lat = 0, lng = 0;
    while (idx < len) {
      var b, shift = 0, result = 0;
      do {
        b = encoded.charCodeAt(idx++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      var dlat = (result & 1) ? ~(result >> 1) : (result >> 1);
      lat += dlat;

      shift = 0; result = 0;
      do {
        b = encoded.charCodeAt(idx++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      var dlng = (result & 1) ? ~(result >> 1) : (result >> 1);
      lng += dlng;

      coords.push([lng / 1e5, lat / 1e5]); // [longitude, latitude] for Mapbox
    }
    return coords;
  }

  // ── Traffic colour based on delay ratio ──────────────────────────────────
  // < 8% delay  → green (SHA green / clear)
  // 8–25% delay → amber (P3 yellow / moderate)
  // > 25% delay → red   (P1 red / heavy)
  function trafficColor(durSecs, durTrafficSecs) {
    if (!durSecs || !durTrafficSecs) return '#50C020';
    var ratio = durTrafficSecs / durSecs;
    if (ratio < 1.08) return '#50C020';  // clear
    if (ratio < 1.25) return '#F5B100';  // moderate
    return '#FF3B30';                    // heavy
  }

  function trafficDelaySecs(durSecs, durTrafficSecs) {
    return Math.max(0, (durTrafficSecs || durSecs) - (durSecs || 0));
  }

  // ── Cache key ─────────────────────────────────────────────────────────────
  function _cacheKey(lng1, lat1, lng2, lat2) {
    function r(v) { return Math.round(v * 1000) / 1000; }
    return r(lng1) + ',' + r(lat1) + '>' + r(lng2) + ',' + r(lat2);
  }

  // ── Mapbox fallback ───────────────────────────────────────────────────────
  function _mapboxFallback(lng1, lat1, lng2, lat2, key, callback) {
    var url = 'https://api.mapbox.com/directions/v5/mapbox/driving/' +
      lng1 + ',' + lat1 + ';' + lng2 + ',' + lat2 +
      '?geometries=geojson&overview=full&access_token=' + _MBXTOKEN;
    fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (d) {
        delete _pending[key];
        if (d.routes && d.routes[0]) {
          var dur = d.routes[0].duration || 0;
          var result = {
            geometry:          d.routes[0].geometry,
            duration:          dur,
            durationInTraffic: dur,
            distance:          d.routes[0].distance || 0,
            trafficColor:      '#50C020',
            delaySecs:         0,
            source:            'mapbox'
          };
          _cache[key] = result;
          callback(result);
        }
      })
      .catch(function () { delete _pending[key]; });
  }

  // ── Primary fetch (Google → Mapbox fallback) ──────────────────────────────
  function fetchRoute(lng1, lat1, lng2, lat2, callback) {
    var key = _cacheKey(lng1, lat1, lng2, lat2);
    if (_cache[key]) { callback(_cache[key]); return; }
    if (_pending[key]) return;
    _pending[key] = true;

    var origin      = lat1 + ',' + lng1;   // Google wants lat,lng (opposite of Mapbox)
    var destination = lat2 + ',' + lng2;

    fetch('/api/directions?origin=' + encodeURIComponent(origin) +
                          '&destination=' + encodeURIComponent(destination))
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.status === 'OK' && d.polyline) {
          delete _pending[key];
          var coords = decodePolyline(d.polyline);
          var dur    = d.durationSecs || 0;
          var durT   = d.durationInTrafficSecs || dur;
          var result = {
            geometry:          { type: 'LineString', coordinates: coords },
            duration:          dur,
            durationInTraffic: durT,
            distance:          d.distanceM || 0,
            trafficColor:      trafficColor(dur, durT),
            delaySecs:         trafficDelaySecs(dur, durT),
            source:            'google'
          };
          _cache[key] = result;
          callback(result);
        } else {
          // NO_KEY or no results — fall back to Mapbox
          _mapboxFallback(lng1, lat1, lng2, lat2, key, callback);
        }
      })
      .catch(function () {
        delete _pending[key];
        _mapboxFallback(lng1, lat1, lng2, lat2, key, callback);
      });
  }

  // ── Public API ────────────────────────────────────────────────────────────
  global.NACDRouting = {
    fetchRoute:        fetchRoute,
    decodePolyline:    decodePolyline,
    trafficColor:      trafficColor,
    trafficDelaySecs:  trafficDelaySecs
  };

}(window));
