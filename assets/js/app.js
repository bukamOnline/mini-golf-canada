(function () {
  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, function (char) {
      return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[char];
    });
  }

  function distanceKm(lat1, lng1, lat2, lng2) {
    var radius = 6371;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLng = (lng2 - lng1) * Math.PI / 180;
    var a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return 2 * radius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function trackEvent(name, params) {
    if (typeof window.gtag === "function") {
      window.gtag("event", name, params || {});
    }
  }

  var currentLocation = null;

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function relativeToRoot(path) {
    var current = location.pathname.replace(/\\/g, "/");
    var local = current.includes("/site/") ? current.split("/site/")[1] : current.replace(/^\/+/, "");
    if (!local || local.endsWith("/")) local += "index.html";
    if (!/\.html?$/.test(local)) local += "/index.html";
    var depth = (local.match(/\//g) || []).length;
    return "../".repeat(depth) + path;
  }

  function fallbackImageSrc() {
    return relativeToRoot("assets/images/mini-golf-canada-hero-scenic.webp");
  }

  function attachImageFallbacks(root) {
    (root || document).querySelectorAll("img[data-image-fallback='true']").forEach(function (img) {
      if (img.dataset.fallbackAttached) return;
      img.dataset.fallbackAttached = "true";
      img.addEventListener("error", function () {
        if (img.dataset.fallbackUsed) return;
        img.dataset.fallbackUsed = "true";
        img.src = fallbackImageSrc();
      });
    });
  }

  function activeFilters(form) {
    return Array.from(form.querySelectorAll("[name=feature]:checked")).map(function (input) {
      return input.value;
    });
  }

  function normalizeSearchText(value) {
    var text = String(value || "").toLowerCase();
    return text.normalize ? text.normalize("NFD").replace(/[\u0300-\u036f]/g, "") : text;
  }

  function searchableText(item) {
    item = item || {};
    return normalizeSearchText([
      item.search || "",
      item.name || "",
      item.city || "",
      item.province || "",
      item.price || "",
      (item.tags || []).join(" "),
    ].join(" "));
  }

  function itemMatchesFilter(item, filter) {
    var text = searchableText(item);
    if (filter === "price") return !!item.hasPrice;
    if (filter === "rating") return Number(item.rating || 0) >= 4;
    if (filter === "indoor") return text.indexOf("indoor") > -1;
    if (filter === "outdoor") return text.indexOf("outdoor") > -1;
    if (filter === "glow") return text.indexOf("glow") > -1;
    if (filter === "birthday") return text.indexOf("birthday") > -1 || text.indexOf("party") > -1;
    if (filter === "arcade") return text.indexOf("arcade") > -1;
    if (filter === "food") return text.indexOf("food") > -1 || text.indexOf("drinks") > -1;
    if (filter === "accessible") return text.indexOf("accessible") > -1 || text.indexOf("wheelchair") > -1;
    return true;
  }

  function renderMap(items) {
    var map = document.querySelector(".js-results-map");
    if (!map) return;
    var withCoords = (items || []).filter(function (item) {
      return typeof item.lat === "number" && typeof item.lng === "number";
    }).slice(0, 40);
    map.innerHTML = "";
    if (!withCoords.length) {
      map.innerHTML = '<p class="map-empty">No mapped listings are available for this result set.</p>';
      return;
    }
    var bounds = {minLat: 41, maxLat: 83, minLng: -141, maxLng: -52};
    withCoords.forEach(function (item) {
      var x = clamp(((item.lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * 100, 4, 96);
      var y = clamp((1 - ((item.lat - bounds.minLat) / (bounds.maxLat - bounds.minLat))) * 100, 6, 92);
      var point = document.createElement("a");
      point.className = "map-point";
      point.href = relativeToRoot(item.path);
      point.style.left = x.toFixed(2) + "%";
      point.style.top = y.toFixed(2) + "%";
      point.title = item.name + " in " + item.city + ", " + item.province;
      point.setAttribute("aria-label", point.title);
      point.innerHTML = "<span>" + escapeHtml(item.name) + "</span>";
      map.appendChild(point);
    });
  }

  function initGallerySliders(root) {
    (root || document).querySelectorAll(".js-gallery").forEach(function (gallery) {
      if (gallery.dataset.galleryReady) return;
      gallery.dataset.galleryReady = "true";

      var viewport = gallery.querySelector(".gallery-viewport");
      var slides = Array.from(gallery.querySelectorAll("[data-gallery-slide]"));
      var dots = Array.from(gallery.querySelectorAll("[data-gallery-dot]"));
      var previous = gallery.querySelector("[data-gallery-prev]");
      var next = gallery.querySelector("[data-gallery-next]");
      var controls = gallery.querySelector(".gallery-controls");
      var scrollTimer = null;

      if (!viewport || slides.length < 2) {
        if (controls) controls.hidden = true;
        return;
      }

      function currentIndex() {
        var viewportCenter = viewport.scrollLeft + viewport.clientWidth / 2;
        var bestIndex = 0;
        var bestDistance = Infinity;
        slides.forEach(function (slide, index) {
          var slideCenter = slide.offsetLeft + slide.offsetWidth / 2;
          var distance = Math.abs(slideCenter - viewportCenter);
          if (distance < bestDistance) {
            bestDistance = distance;
            bestIndex = index;
          }
        });
        return bestIndex;
      }

      function setActive(index) {
        var safeIndex = clamp(index, 0, slides.length - 1);
        dots.forEach(function (dot, dotIndex) {
          var active = dotIndex === safeIndex;
          dot.classList.toggle("is-active", active);
          dot.setAttribute("aria-current", active ? "true" : "false");
        });
        if (previous) previous.disabled = safeIndex === 0;
        if (next) next.disabled = safeIndex === slides.length - 1;
        gallery.dataset.galleryIndex = String(safeIndex + 1);
      }

      function goTo(index) {
        var safeIndex = clamp(index, 0, slides.length - 1);
        var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        viewport.scrollTo({
          left: slides[safeIndex].offsetLeft - viewport.offsetLeft,
          behavior: reduceMotion ? "auto" : "smooth",
        });
        setActive(safeIndex);
        trackEvent("gallery_slide", {photo_index: safeIndex + 1, page_path: location.pathname});
      }

      if (previous) {
        previous.addEventListener("click", function () {
          goTo(currentIndex() - 1);
        });
      }
      if (next) {
        next.addEventListener("click", function () {
          goTo(currentIndex() + 1);
        });
      }
      dots.forEach(function (dot, index) {
        dot.addEventListener("click", function () {
          goTo(index);
        });
      });
      viewport.addEventListener("scroll", function () {
        window.clearTimeout(scrollTimer);
        scrollTimer = window.setTimeout(function () {
          setActive(currentIndex());
        }, 80);
      }, {passive:true});
      viewport.addEventListener("keydown", function (event) {
        if (event.key === "ArrowRight") {
          event.preventDefault();
          goTo(currentIndex() + 1);
        } else if (event.key === "ArrowLeft") {
          event.preventDefault();
          goTo(currentIndex() - 1);
        }
      });

      setActive(0);
    });
  }

  function courseCard(item) {
    var article = document.createElement("article");
    article.className = "course-card";
    var hasDistance = typeof item.distance === "number" && isFinite(item.distance);
    var sideNote = hasDistance ? "<span>" + item.distance.toFixed(1) + " km away</span>" : "<span>" + escapeHtml(item.price || "Check prices") + "</span>";
    article.innerHTML =
      '<a class="course-image" href="' + escapeHtml(relativeToRoot(item.path)) + '">' +
      '<img src="' + escapeHtml(item.image) + '" alt="' + escapeHtml(item.name) + ' mini golf in ' + escapeHtml(item.city) + ', ' + escapeHtml(item.province) + '" loading="lazy" decoding="async" width="800" height="500" data-image-fallback="true"></a>' +
      '<div class="course-body"><div class="course-meta">' +
      (item.rating ? escapeHtml(item.rating.toFixed(1) + " rating") : "No rating yet") +
      (item.reviews ? " · " + escapeHtml(String(item.reviews)) + " reviews" : "") +
      '</div><h3><a href="' + escapeHtml(relativeToRoot(item.path)) + '">' + escapeHtml(item.name) + '</a></h3>' +
      '<p class="course-location">' + escapeHtml(item.city) + ", " + escapeHtml(item.province) + '</p>' +
      '<div class="tag-row">' + (item.tags || []).slice(0, 4).map(function (tag) { return '<span class="tag">' + escapeHtml(tag) + '</span>'; }).join("") + '</div>' +
      '<div class="course-actions"><a class="text-link" href="' + escapeHtml(relativeToRoot(item.path)) + '">View course</a>' + sideNote + '</div></div>';
    attachImageFallbacks(article);
    return article;
  }

  function searchTokens(query) {
    var stop = {near:1, me:1, in:1, the:1, and:1, canada:1, course:1, courses:1, find:1};
    return normalizeSearchText(query).split(/[^a-z0-9]+/).filter(function (token) {
      return token && !stop[token];
    });
  }

  function itemMatchesQuery(item, tokens) {
    if (!tokens.length) return true;
    var text = searchableText(item);
    return tokens.every(function (token) { return text.indexOf(token) > -1; });
  }

  function searchScore(item, tokens) {
    if (!tokens.length) return 0;
    var text = searchableText(item);
    var name = normalizeSearchText(item && item.name);
    var city = normalizeSearchText(item && item.city);
    var score = 0;
    tokens.forEach(function (token) {
      if (name === token || city === token) score += 12;
      if (name.indexOf(token) === 0) score += 8;
      if (city.indexOf(token) === 0) score += 6;
      if (text.indexOf(token) > -1) score += 1;
    });
    return score + Math.min(Number((item && item.rating) || 0), 5) / 10;
  }

  function searchContext(form) {
    var queryInput = form.querySelector("[name=q]");
    var provinceInput = form.querySelector("[name=province]");
    return {
      queryInput: queryInput,
      provinceInput: provinceInput,
      tokens: searchTokens(queryInput && queryInput.value),
      province: (provinceInput && provinceInput.value || "").trim(),
      filters: activeFilters(form),
    };
  }

  function relevantListings(context) {
    return (window.MGC_LISTINGS || []).filter(function (item) {
      return itemMatchesQuery(item, context.tokens) &&
        (!context.province || item.province === context.province) &&
        (!context.filters.length || context.filters.every(function (filter) { return itemMatchesFilter(item, filter); }));
    });
  }

  function hasCoordinates(item) {
    return typeof item.lat === "number" && typeof item.lng === "number";
  }

  function withDistance(item, locationPoint) {
    return Object.assign({}, item, {distance: distanceKm(locationPoint.lat, locationPoint.lng, item.lat, item.lng)});
  }

  function sortByRelevance(matches, tokens) {
    if (tokens.length) {
      matches.sort(function (a, b) { return searchScore(b, tokens) - searchScore(a, tokens); });
    }
    return matches;
  }

  function sortByDistance(matches, tokens, locationPoint) {
    return matches.filter(hasCoordinates).map(function (item) {
      return withDistance(item, locationPoint);
    }).sort(function (a, b) {
      var distanceDelta = a.distance - b.distance;
      if (Math.abs(distanceDelta) > 0.05) return distanceDelta;
      return searchScore(b, tokens) - searchScore(a, tokens);
    });
  }

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function scrollToSearchResults() {
    var section = document.querySelector(".search-results-section");
    if (!section) return;
    var desktopOffset = window.matchMedia && window.matchMedia("(min-width: 760px)").matches ? 84 : 0;
    var targetY = section.getBoundingClientRect().top + window.pageYOffset + desktopOffset;
    window.scrollTo({top: Math.max(0, targetY), behavior: prefersReducedMotion() ? "auto" : "smooth"});
  }

  function updateSearchUrl(form) {
    if (!location.pathname.includes("/search/") || !history.replaceState) return;
    var queryInput = form.querySelector("[name=q]");
    var provinceInput = form.querySelector("[name=province]");
    var params = new URLSearchParams(location.search);
    var query = queryInput ? queryInput.value.trim() : "";
    var province = provinceInput ? provinceInput.value.trim() : "";
    if (query) params.set("q", query); else params.delete("q");
    if (province) params.set("province", province); else params.delete("province");
    var next = params.toString();
    history.replaceState(null, "", next ? "?" + next : location.pathname);
  }

  function runSearch(form, options) {
    options = options || {};
    var context = searchContext(form);
    var results = document.querySelector(".js-search-results");
    var status = document.querySelector(".js-search-status");
    if (!results) return [];

    var locationPoint = options.location || (form.dataset.locationActive === "true" ? currentLocation : null);
    var usingLocation = !!locationPoint;
    var matches = relevantListings(context);
    matches = usingLocation
      ? sortByDistance(matches, context.tokens, locationPoint).slice(0, 18)
      : sortByRelevance(matches, context.tokens).slice(0, 24);

    results.innerHTML = "";
    matches.forEach(function (item) { results.appendChild(courseCard(item)); });
    renderMap(matches);
    if (status) {
      if (usingLocation) {
        var refined = context.tokens.length || context.province || context.filters.length;
        status.textContent = matches.length
          ? "Showing the " + matches.length + " closest relevant mini golf listing" + (matches.length === 1 ? "" : "s") + (refined ? " for your current search." : " near your current location.")
          : "No nearby listings matched the current search. Try fewer filters or search by city or province.";
      } else {
        status.textContent = matches.length
          ? "Showing " + matches.length + " matching mini golf listing" + (matches.length === 1 ? "." : "s.")
          : "No matching courses found. Try a nearby city, province, mini putt, glow golf, indoor, or outdoor.";
      }
    }
    if (options.track) {
      trackEvent("directory_search", {
        search_term: context.queryInput ? context.queryInput.value.trim() : "",
        province: context.province || "all",
        filters: context.filters.join(",") || "none",
        results_count: matches.length,
        location_sorted: usingLocation ? "true" : "false",
      });
    }
    return matches;
  }

  function applyQueryParams(form) {
    var params = new URLSearchParams(location.search);
    var q = params.get("q");
    var province = params.get("province");
    if (q && form.querySelector("[name=q]")) form.querySelector("[name=q]").value = q;
    if (province && form.querySelector("[name=province]")) form.querySelector("[name=province]").value = province;
    if (q || province || location.pathname.includes("/search/")) runSearch(form);
  }

  function isLocalHost() {
    return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  }

  function setStatus(status, message) {
    if (status) status.textContent = message;
  }

  function locationErrorMessage(error) {
    if (!error) return "Location could not be checked. Search by city or province instead.";
    if (error.code === 1) return "Location permission was denied. Enable location for this site or search by city.";
    if (error.code === 2) return "Your location could not be determined. Search by city or province instead.";
    if (error.code === 3) return "Location lookup timed out. Try again or search by city.";
    return "Location could not be checked. Search by city or province instead.";
  }

  document.addEventListener("DOMContentLoaded", function () {
    attachImageFallbacks(document);
    initGallerySliders(document);
    renderMap((window.MGC_LISTINGS || []).slice(0, 24));

    document.querySelectorAll(".js-directory-search").forEach(function (form) {
      applyQueryParams(form);
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        runSearch(form, {track:true});
        updateSearchUrl(form);
        scrollToSearchResults();
      });
      form.addEventListener("input", function () { runSearch(form); });
      form.addEventListener("change", function (event) {
        runSearch(form);
        if (event.target && event.target.name === "feature") {
          trackEvent("directory_filter_change", {filter: event.target.value, checked: event.target.checked});
        }
      });
    });

    document.querySelectorAll(".js-use-location").forEach(function (button) {
      button.addEventListener("click", function () {
        var results = document.querySelector(".js-search-results");
        var status = document.querySelector(".js-search-status");
        trackEvent("use_location_click", {page_path: location.pathname});
        if (!results) {
          setStatus(status, "Search results are not available on this page.");
          return;
        }
        if (!window.isSecureContext && !isLocalHost()) {
          setStatus(status, "Location sorting needs a secure connection. Search by city for now and try location again once HTTPS is available.");
          return;
        }
        if (!navigator.geolocation) {
          setStatus(status, "Location is not available in this browser. Search by city or province instead.");
          return;
        }
        var previousLabel = button.textContent;
        button.disabled = true;
        button.textContent = "Checking location...";
        setStatus(status, "Checking your location...");
        navigator.geolocation.getCurrentPosition(function (position) {
          var form = button.closest(".js-directory-search") || document.querySelector(".js-directory-search");
          currentLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          if (form) form.dataset.locationActive = "true";
          var closest = form ? runSearch(form, {location: currentLocation}) : [];
          scrollToSearchResults();
          trackEvent("location_search_success", {results_count: closest.length, relevant_only: "true"});
          button.disabled = false;
          button.textContent = previousLabel;
        }, function (error) {
          setStatus(status, locationErrorMessage(error));
          trackEvent("location_search_error", {error_code: error && error.code ? error.code : 0});
          button.disabled = false;
          button.textContent = previousLabel;
        }, {enableHighAccuracy:false, timeout:8000, maximumAge:300000});
      });
    });

    document.addEventListener("click", function (event) {
      var link = event.target.closest && event.target.closest("a");
      if (!link) return;
      var href = link.getAttribute("href") || "";
      if (href.indexOf("tel:") === 0) {
        trackEvent("phone_click", {link_url: href, page_path: location.pathname});
      } else if (href.indexOf("mailto:") === 0) {
        trackEvent("email_click", {page_path: location.pathname});
      } else if (link.classList.contains("map-point")) {
        trackEvent("map_result_click", {link_url: link.href, page_path: location.pathname});
      } else if (link.target === "_blank") {
        trackEvent("outbound_click", {link_url: link.href, link_text: link.textContent.trim().slice(0, 80)});
      }
    });
  });
})();
