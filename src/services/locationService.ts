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
        console.warn('Expo reverse geocoding failed, trying web fallback:', geocodeError);
      }

      // Fallback: Web-based OpenStreetMap Nominatim reverse geocoding (no auth required)
      try {
        console.log('[DEBUG_LOCATION] Fetching address from Nominatim for lat/lon:', latitude, longitude);
        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`,
          {
            headers: {
              'User-Agent': 'TeleVaultApp/2.0',
              'Accept-Language': 'en'
            }
          }
        );
        if (response.ok) {
          const json = await response.json();
          if (json && json.address) {
            const addr = json.address;
            const parts: string[] = [];

            // 1. Landmark / Mall / Building / Shop
            const landmark = addr.amenity || addr.mall || addr.shop || addr.tourism || addr.building || addr.leisure || addr.historic;
            if (landmark) {
              parts.push(landmark);
            }

            // 2. Street
            if (addr.road) {
              let roadStr = addr.road;
              if (addr.house_number) {
                roadStr = `${addr.house_number} ${roadStr}`;
              }
              parts.push(roadStr);
            }

            // 3. District / Neighborhood / Village
            const neighborhood = addr.suburb || addr.village || addr.neighbourhood || addr.hamlet || addr.quarter;
            if (neighborhood) {
              parts.push(neighborhood);
            }

            // 4. City / Town
            const city = addr.city || addr.town || addr.municipality || addr.city_district;
            if (city) {
              parts.push(city);
            }

            // 5. State / Region fallback
            if (parts.length < 2 && addr.state) {
              parts.push(addr.state);
            }

            const locationText = parts.length > 0 ? parts.join(', ') : '';
            if (locationText) {
              console.log('[DEBUG_LOCATION] Nominatim resolved address:', locationText);
              return {
                text: `📍 ${locationText}`,
                latitude,
                longitude,
              };
            }
          }
        }
      } catch (nominatimError) {
        console.warn('Nominatim geocoding failed:', nominatimError);
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
