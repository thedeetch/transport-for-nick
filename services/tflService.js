
// IMPORTANT: You need to get your own App ID and Key from the TfL API portal.
// Replace the placeholder strings below.
const APP_ID = 'transport-for-nick';
const BASE_URL = 'https://api.tfl.gov.uk';

export const fetchNearbyStops = async (lat, lon, appKey) => {
  if (!appKey) throw new Error('TfL API Key is missing. Please add it in the settings below.');
  const radius = 300; // 300 meters to get a better chance of finding tubes
  const stopTypes = 'NaptanPublicBusCoachTram,NaptanMetroStation';
  const url = `${BASE_URL}/StopPoint?stopTypes=${stopTypes}&radius=${radius}&lat=${lat}&lon=${lon}&app_id=${APP_ID}&app_key=${appKey}`;

  const response = await fetch(url);
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || 'Failed to fetch nearby stops');
  }
  const data = await response.json();

  if (!data.stopPoints || data.stopPoints.length === 0) {
    return [];
  }

  const processedStopPoints = data.stopPoints.map(stop => {
    const props = stop.additionalProperties || [];
    const towardsProperty = props.find(prop => prop.key === 'Towards');
    const directionProperty = props.find(prop => prop.key === 'CompassPoint');
    
    const towards = towardsProperty ? towardsProperty.value : null;
    const direction = directionProperty ? directionProperty.value : null;

    return { ...stop, towards, direction };
  });

  // Take the closest 10 stops of any type
  return processedStopPoints.sort((a, b) => a.distance - b.distance).slice(0, 10);
};

export const fetchArrivalsForStop = async (stopId, appKey) => {
  if (!appKey) {
    console.warn(`API key missing for arrivals fetch for stop ${stopId}`);
    return [];
  }
  const url = `${BASE_URL}/StopPoint/${stopId}/Arrivals?app_id=${APP_ID}&app_key=${appKey}`;

  const response = await fetch(url);
  if (!response.ok) {
    // Don't throw a fatal error for a single stop failing, just return empty
    console.warn(`Failed to fetch arrivals for stop ${stopId}`);
    return [];
  }
  const data = await response.json();
  // Sort by arrival time
  return data.sort((a, b) => a.timeToStation - b.timeToStation);
};
