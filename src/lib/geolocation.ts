export interface GpsResult {
  lat: number;
  lng: number;
  address: string;
}

export function detectGps(): Promise<GpsResult> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported by your browser."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        let address = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        try {
          address = await reverseGeocode(lat, lng);
        } catch {
          // fallback to raw coords
        }

        resolve({ lat, lng, address });
      },
      (error) => {
        switch (error.code) {
          case error.PERMISSION_DENIED:
            reject(new Error("PERMISSION_DENIED"));
            break;
          case error.POSITION_UNAVAILABLE:
            reject(new Error("Location information is unavailable."));
            break;
          case error.TIMEOUT:
            reject(new Error("The request to get your location timed out."));
            break;
          default:
            reject(new Error("An unknown error occurred."));
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  });
}

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1`,
    {
      headers: { "Accept-Language": "en" },
    }
  );
  const data = await res.json();

  if (data.address) {
    const parts = [
      data.address.suburb || data.address.neighbourhood || data.address.village,
      data.address.city || data.address.town || data.address.state_district,
      data.address.state || data.address.region,
    ].filter(Boolean);
    return parts.join(", ") || data.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }

  return data.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}
