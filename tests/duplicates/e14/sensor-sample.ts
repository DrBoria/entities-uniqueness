// Telemetry sample as received from the field gateway. Property NAMES are
// identical to SensorCalibration, but every TYPE is genuinely different —
// this is a negative trap: same vocabulary, incompatible shapes.
export interface SensorSample {
	sensorId: string;
	temperature: number;
	humidity: number;
	recordedAt: string;
	batteryLevel: number;
	online: boolean;
	tags: string[];
	location: { lat: number; lng: number };
}
