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
          const city = address.city || address.district || address.subregion || '';
          const region = address.region || address.country || '';
          
          if (city && region) {
            return {
              text: `${city}, ${region}`,
              latitude,
              longitude,
            };
          } else if (city || region) {
            return {
              text: city || region,
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
