import * as Location from 'expo-location';

export const locationService = {
  async getCityLocation(): Promise<{ text: string; latitude: number; longitude: number } | null> {
    try {
      // 1. Request foreground permission
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        throw new Error('Location permission denied. Location lens cannot be used.');
      }

      // 2. Get current location
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const { latitude, longitude } = location.coords;

      try {
        // 3. Try reverse geocode
        const geocode = await Location.reverseGeocodeAsync({ latitude, longitude });
        if (geocode && geocode.length > 0) {
          const address = geocode[0];
          console.log('[DEBUG_LOCATION] Reverse geocode result:', address);
          
          const parts: string[] = [];
          
          // 1. Name of building, mall, or landmark
          if (address.name && address.name !== address.streetNumber && address.name !== address.street) {
            parts.push(address.name);
          }
          
          // 2. Street name
          if (address.street) {
            let streetStr = address.street;
            if (address.streetNumber) {
              streetStr = `${address.streetNumber} ${streetStr}`;
            }
            parts.push(streetStr);
          }
          
          // 3. District / Neighborhood / Village
          if (address.district) {
            parts.push(address.district);
          }
          
          // 4. City
          if (address.city) {
            parts.push(address.city);
          } else if (address.subregion) {
            parts.push(address.subregion);
          }
          
          // 5. Region/Country fallback if too short
          if (parts.length < 2 && address.region) {
            parts.push(address.region);
          }

          const locationText = parts.length > 0 ? parts.join(', ') : '';
          if (locationText) {
            return {
              text: `📍 ${locationText}`,
              latitude,
              longitude,
            };
          }
        }
      } catch (geocodeError) {
        console.warn('Reverse geocoding failed, falling back to coordinates:', geocodeError);
      }

      // Fallback to coordinates
      return {
        text: `Lat: ${latitude.toFixed(4)}, Long: ${longitude.toFixed(4)}`,
        latitude,
        longitude,
      };
    } catch (error: any) {
      console.error('Location service error:', error);
      throw error;
    }
  },
};

export default locationService;
