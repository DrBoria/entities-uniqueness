// Calibration record for the same sensors. Identical property names to
// SensorSample, but every property has a different type (string vs number,
// boolean vs number, array vs map, object vs string). Must NOT be flagged
// as a duplicate of SensorSample.
export interface SensorCalibration {
	sensorId: number;
	temperature: string;
	humidity: boolean;
	recordedAt: number;
	batteryLevel: string;
	online: number;
	tags: Record<string, string>;
	location: string;
}
