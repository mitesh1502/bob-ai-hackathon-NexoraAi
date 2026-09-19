/**
 * NEXORA AI — Weather Service Adapter
 *
 * Uses OpenWeatherMap if WEATHER_API_KEY is set; returns realistic mock data otherwise.
 * To enable production: set WEATHER_API_KEY and WEATHER_API_BASE_URL in .env
 */

import axios from 'axios';
import { config } from '../config/env';
import { logger } from '../utils/logger';
import { query } from '../database/db';
import { v4 as uuidv4 } from 'uuid';

export interface WeatherData {
  temperature_c: number;
  rainfall_mm: number;
  wind_speed_kmh: number;
  humidity_pct: number;
  lightning_risk: boolean;
  flood_alert: boolean;
  storm_alert: boolean;
  heatwave_alert: boolean;
  extreme_weather_alert: boolean;
  alert_description?: string;
  source: string;
}

function mockWeather(districtId?: string): WeatherData {
  // Realistic mock — cycles through different conditions for demo
  const mockScenarios: WeatherData[] = [
    {
      temperature_c: 28, rainfall_mm: 5, wind_speed_kmh: 15, humidity_pct: 65,
      lightning_risk: false, flood_alert: false, storm_alert: false,
      heatwave_alert: false, extreme_weather_alert: false,
      source: 'mock',
    },
    {
      temperature_c: 42, rainfall_mm: 0, wind_speed_kmh: 20, humidity_pct: 40,
      lightning_risk: false, flood_alert: false, storm_alert: false,
      heatwave_alert: true, extreme_weather_alert: false,
      alert_description: '[MOCK] Heatwave alert: temperature exceeding 40°C',
      source: 'mock',
    },
    {
      temperature_c: 22, rainfall_mm: 120, wind_speed_kmh: 65, humidity_pct: 95,
      lightning_risk: true, flood_alert: true, storm_alert: true,
      heatwave_alert: false, extreme_weather_alert: true,
      alert_description: '[MOCK] Severe cyclonic storm — heavy rain, flooding risk',
      source: 'mock',
    },
    {
      temperature_c: 30, rainfall_mm: 15, wind_speed_kmh: 30, humidity_pct: 75,
      lightning_risk: true, flood_alert: false, storm_alert: false,
      heatwave_alert: false, extreme_weather_alert: false,
      alert_description: '[MOCK] Thunderstorm warning — lightning risk',
      source: 'mock',
    },
  ];
  // Deterministic rotation based on districtId hash for demo consistency
  const idx = districtId
    ? districtId.charCodeAt(0) % mockScenarios.length
    : 0;
  return mockScenarios[idx];
}

export const weatherService = {
  async fetchForDistrict(
    districtId: string,
    lat?: number,
    lng?: number
  ): Promise<WeatherData> {
    if (!config.WEATHER_API_KEY) {
      return mockWeather(districtId);
    }

    try {
      const params: Record<string, string> = {
        appid: config.WEATHER_API_KEY,
        units: 'metric',
      };
      if (lat != null && lng != null) {
        params.lat = lat.toString();
        params.lon = lng.toString();
      }

      const [currentRes, alertRes] = await Promise.all([
        axios.get(`${config.WEATHER_API_BASE_URL}/weather`, { params }),
        axios.get(`${config.WEATHER_API_BASE_URL}/onecall`, {
          params: { ...params, exclude: 'minutely,hourly,daily' },
        }).catch(() => null),
      ]);

      const w = currentRes.data;
      const alerts = alertRes?.data?.alerts ?? [];
      const hasFlood = alerts.some((a: any) =>
        a.event?.toLowerCase().includes('flood')
      );
      const hasStorm = alerts.some((a: any) =>
        a.event?.toLowerCase().includes('storm') || a.event?.toLowerCase().includes('cyclone')
      );
      const hasExtreme = alerts.some((a: any) =>
        a.event?.toLowerCase().includes('extreme')
      );

      return {
        temperature_c: w.main.temp,
        rainfall_mm: w.rain?.['1h'] ?? 0,
        wind_speed_kmh: w.wind.speed * 3.6,
        humidity_pct: w.main.humidity,
        lightning_risk: w.weather?.[0]?.id >= 200 && w.weather?.[0]?.id < 300,
        flood_alert: hasFlood,
        storm_alert: hasStorm,
        heatwave_alert: w.main.temp > 42,
        extreme_weather_alert: hasExtreme,
        alert_description: alerts[0]?.description,
        source: 'openweathermap',
      };
    } catch (err) {
      logger.warn('[WeatherService] API call failed, using mock data:', err);
      return mockWeather(districtId);
    }
  },

  async ingestAndStore(districtId: string, lat?: number, lng?: number): Promise<WeatherData> {
    const data = await this.fetchForDistrict(districtId, lat, lng);

    // Skip insert if an identical record already exists within the last 6 hours
    const recent = await query<any>(
      `SELECT id FROM weather_records
       WHERE district_id = $1
         AND ABS(temperature_c - $2) < 0.5
         AND storm_alert = $3
         AND flood_alert = $4
         AND extreme_weather_alert = $5
         AND recorded_at > NOW() - INTERVAL '6 hours'
       LIMIT 1`,
      [districtId, data.temperature_c, data.storm_alert, data.flood_alert, data.extreme_weather_alert]
    );

    if (recent.length > 0) {
      logger.info(`[WeatherService] District ${districtId}: identical record within 6h, skipping insert`);
      return data;
    }

    await query(
      `INSERT INTO weather_records
         (id, district_id, location_lat, location_lng,
          temperature_c, rainfall_mm, wind_speed_kmh,
          humidity_pct, lightning_risk, flood_alert, storm_alert, heatwave_alert,
          extreme_weather_alert, alert_description, recorded_at, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW(),$15)`,
      [
        uuidv4(),
        districtId,
        lat ?? null,
        lng ?? null,
        data.temperature_c,
        data.rainfall_mm,
        data.wind_speed_kmh,
        data.humidity_pct,
        data.lightning_risk,
        data.flood_alert,
        data.storm_alert,
        data.heatwave_alert,
        data.extreme_weather_alert,
        data.alert_description ?? null,
        data.source,
      ]
    );
    return data;
  },
};
