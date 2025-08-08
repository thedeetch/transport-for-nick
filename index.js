
import { fetchNearbyStops, fetchArrivalsForStop } from './services/tflService.js';

// --- DOM Elements ---
const contentContainer = document.getElementById('content-container');
const testLocationCheckbox = document.getElementById('test-location-checkbox');

// --- State ---
const state = {
  stopsWithArrivals: [],
  isRefreshing: true,
  loadingMessage: 'Waiting for location permission...',
  error: null,
};

// --- Helper Functions ---
const slugify = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/ & /g, '-and-');

// --- Render Functions (Pico.css Compliant HTML) ---

const createLoadingSpinnerHTML = (message) => `
    <article aria-busy="true" style="text-align: center; background: transparent; border: none; box-shadow: none; margin-top: 5rem;">
        ${message}
    </article>
`;

const createErrorDisplayHTML = (message) => `
    <article class="error-display" style="text-align: center;">
      <hgroup>
        <h2 style="color: var(--pico-color-red-500); margin:0;">An Error Occurred</h2>
        <p>${message}</p>
      </hgroup>
    </article>
`;

const createStopCardsHTML = (stops) => {
  if (stops.length === 0) return '';
  return stops
    .sort((a, b) => a.distance - b.distance) // Sort all stops by distance
    .map(stop => {
      const disruptionIcon = stop.status === false ? `<svg class="warning-icon" role="img" aria-label="Disruption warning"><use href="#icon-warning"></use></svg>` : '';

      // --- TUBE STATION CARD ---
      if (stop.stopType === 'NaptanMetroStation') {
        // Group arrivals by their platformName
        const arrivalsByPlatform = (stop.arrivals || []).reduce((acc, arrival) => {
          const platform = arrival.platformName || 'Unknown Platform';
          if (!acc[platform]) {
            acc[platform] = [];
          }
          acc[platform].push(arrival);
          return acc;
        }, {});

        // Sort platforms alphabetically/numerically
        const sortedPlatforms = Object.keys(arrivalsByPlatform).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

        const arrivalsHtml = sortedPlatforms.length > 0
          ? sortedPlatforms.map(platform => {
            const arrivals = arrivalsByPlatform[platform];
            const platformTitle = platform;

            const arrivalsList = arrivals
              .slice(0, 5) // Take top 5 arrivals for this platform
              .map(arrival => {
                const minutesAway = Math.floor(arrival.timeToStation / 60);
                const towardsText = arrival.towards ? arrival.towards : 'Unknown Destination';
                return `
                                <li class="arrival-item">
                                    <div class="arrival-details">
                                        <span class="line-pill line-${slugify(arrival.lineId)}">${arrival.lineName}</span>
                                        <span class="truncate" title="${towardsText}">${towardsText}</span>
                                    </div>
                                    <span class="arrival-time">
                                        ${minutesAway > 0 ? `${minutesAway} min` : 'Due'}
                                    </span>
                                </li>
                            `;
              }).join('');

            return `
                        <div class="tube-destination-group">
                            <h4 class="tube-destination-header">${platformTitle}</h4>
                            <ul class="arrivals-list">${arrivalsList}</ul>
                        </div>
                    `;
          }).join('')
          : '<footer class="no-arrivals-msg"><p>No live arrivals available.</p></footer>';

        return `
                    <article class="stop-card">
                      <header>
                        <hgroup>
                          <h3 style="margin:0; display:flex; align-items:center;">${stop.commonName}${disruptionIcon}</h3>
                        </hgroup>
                        <p style="margin:0;"><small>${Math.round(stop.distance)}m away</small></p>
                      </header>
                      ${arrivalsHtml}
                    </article>
                `;
      }

      // --- BUS STOP CARD (default) ---
      const arrivalsHtml = stop.arrivals && stop.arrivals.length > 0
        ? '<ul class="arrivals-list">' + stop.arrivals.slice(0, 5).map(arrival => {
          const minutesAway = Math.floor(arrival.timeToStation / 60);
          return `
                        <li class="arrival-item">
                          <div class="arrival-details">
                            <span class="bus-route">${arrival.lineName}</span>
                            <span class="truncate" title="${arrival.destinationName}">${arrival.destinationName}</span>
                          </div>
                          <span class="arrival-time">
                            ${minutesAway > 0 ? `${minutesAway} min` : 'Due'}
                          </span>
                        </li>
                    `;
        }).join('') + '</ul>'
        : '<footer class="no-arrivals-msg"><p>No buses due in the next 30 minutes.</p></footer>';

      const towardsText = stop.towards ? `<p style="margin:0;"><small>Towards ${stop.towards}</small></p>` : '';
      const directionIndicator = stop.direction ? `<span class="direction-badge">${stop.direction}</span>` : '';
      const stopLetterIndicator = stop.stopLetter ? `<span class="stop-letter-badge">${stop.stopLetter}</span>` : '';

      return `
                <article class="stop-card">
                  <header>
                    <hgroup>
                      <h3 style="margin:0; display:flex; align-items:center;">${stop.commonName}${stopLetterIndicator}${directionIndicator}${disruptionIcon}</h3>
                      ${towardsText}
                    </hgroup>
                    <p style="margin:0;"><small>${Math.round(stop.distance)}m away</small></p>
                  </header>
                  ${arrivalsHtml}
                </article>
            `;
    })
    .join('');
};

// --- Main Render Function ---
const render = () => {
  let html = '';

  if (state.stopsWithArrivals.length === 0) {
    if (state.isRefreshing) {
      html = createLoadingSpinnerHTML(state.loadingMessage);
    } else if (state.error) {
      html = createErrorDisplayHTML(state.error);
    } else {
      html = `<article style="text-align: center;">Could not find any bus stops or Tube stations nearby.</article>`;
    }
  } else {
    if (state.error) {
      html += createErrorDisplayHTML(state.error);
    }
    html += createStopCardsHTML(state.stopsWithArrivals);
  }

  contentContainer.innerHTML = html;
};

// --- Data Fetching and Logic ---

const getLocation = () => {
  return new Promise((resolve, reject) => {
    // Prioritize checkbox for test location
    if (testLocationCheckbox.checked) {
      console.log('Using test location from checkbox.');
      return resolve({
        latitude: 51.5181627156178, 
        longitude: -0.1786709008541014
      });
    }

    const urlParams = new URLSearchParams(window.location.search);
    const lat = urlParams.get('lat');
    const lon = urlParams.get('lon');

    if (lat && lon) {
      console.log(`Using test location from URL: lat=${lat}, lon=${lon}`);
      return resolve({ latitude: parseFloat(lat), longitude: parseFloat(lon) });
    }

    if (!navigator.geolocation) {
      return reject(new Error('Geolocation is not supported by your browser.'));
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve(position.coords),
      (geoError) => reject(new Error(`Error getting location: ${geoError.message}. Please enable location services.`)),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  });
};

const fetchTransportData = async () => {
  state.isRefreshing = true;
  if (state.stopsWithArrivals.length > 0) {
    state.error = null;
  }
  render();

  try {
    state.loadingMessage = 'Getting your location...';
    if (state.stopsWithArrivals.length === 0) render();

    const location = await getLocation();

    state.loadingMessage = 'Finding nearby bus stops & Tube stations...';
    if (state.stopsWithArrivals.length === 0) render();

    const nearbyStops = await fetchNearbyStops(location.latitude, location.longitude);

    if (nearbyStops.length === 0) {
      if (state.stopsWithArrivals.length === 0) {
        state.stopsWithArrivals = [];
      }
    } else {
      state.loadingMessage = 'Fetching live data...';
      if (state.stopsWithArrivals.length === 0) render();

      const stopsWithData = await Promise.all(
        nearbyStops.map(async (stop) => {
          try {
            const arrivals = await fetchArrivalsForStop(stop.id);
            return { ...stop, arrivals };
          } catch (e) {
            console.warn(`Could not fetch arrivals for stop ${stop.id}`, e);
            return { ...stop, arrivals: [] }; // Return stop with empty arrivals on error
          }
        })
      );

      state.error = null;
      state.stopsWithArrivals = stopsWithData;
    }
  } catch (err) {
    console.error(err);
    state.error = err instanceof Error ? err.message : 'An unknown error occurred.';
  } finally {
    state.isRefreshing = false;
    render();
  }
};

// --- Initialization ---
const init = () => {
  testLocationCheckbox.addEventListener('change', fetchTransportData);
  fetchTransportData(); // Initial fetch
  setInterval(fetchTransportData, 30000); // Auto-refresh every 30 seconds
};

init();
