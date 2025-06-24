const FLEETX_LOGIN_URL = "https://api.fleetx.io/api/v1/login";
const FLEETX_LIVE_URL = "https://api.fleetx.io/api/v1/analytics/live";

const loginToFleetx = async () => {
    const username = process.env.FLEETX_USERNAME;
    const password = process.env.FLEETX_PASSWORD;

    if (!username || !password) {
        throw new Error("FLEETX credentials are not configured.");
    }

    const response = await fetch(FLEETX_LOGIN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Basic ZmxlZXR4OnNlY3JldA==" },
        body: JSON.stringify({
            username,
            password,
            grant_type: "password",
        }),
    });

    if (!response.ok) {
        const body = await response.text();
        throw new Error(
            `Fleetx login failed: ${response.status} ${response.statusText} - ${body}`
        );
    }

    const data = await response.json();
    return data.access_token || data.token || data?.data?.access_token;
};

const fetchLiveAnalytics = async (token) => {
    const response = await fetch(FLEETX_LIVE_URL, {
        headers: { Authorization: `bearer 5d6a3fba-6506-4d73-b37f-b5576aed87eb` },
        // headers: { Authorization: `bearer ${token}` },
    });

    if (!response.ok) {
        throw new Error(`Fleetx analytics fetch failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
};

const getFleetxVehicleData = async (vehicleNo) => {
    // const token = await loginToFleetx();
    const analytics = await fetchLiveAnalytics();

    console.log(analytics)

    const vehicle = analytics.vehicles?.find((v) => v.vehicleNumber === vehicleNo);
    if (!vehicle) {
        return null;
    }
    return {
        totalOdometer: vehicle.totalOdometer,
        totalFuelConsumption: vehicle.totalFuelConsumption,
        status: vehicle.status,
        latitude: vehicle.latitude,
        longitude: vehicle.longitude,
        fuel: vehicle.otherAttributes?.fuel,
        address: vehicle.address
    };
};

module.exports = { getFleetxVehicleData };