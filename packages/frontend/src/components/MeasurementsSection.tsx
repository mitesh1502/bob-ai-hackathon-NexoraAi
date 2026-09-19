/**
 * MeasurementsSection — inline measurement entry with real-time out-of-range warnings.
 * Used inside WorkerAlertPage.
 */
import React, { useState } from 'react';
import { useMutation, useQueryClient } from 'react-query';
import api from '../lib/api';

// ── Normal ranges per measurement type ───────────────────────
const NORMAL_RANGES: Record<string, { min: number; max: number; unit: string; safetyNote?: string }> = {
  voltage:       { min: 10.5,  max: 11.5,  unit: 'kV',    safetyNote: 'Voltage outside safe range — risk of equipment damage or shock.' },
  current:       { min: 0,     max: 500,   unit: 'A',     safetyNote: 'Abnormal current detected — check for overload or fault.' },
  temperature:   { min: 10,    max: 85,    unit: '°C',    safetyNote: 'Temperature outside safe range — overheating risk.' },
  load:          { min: 0,     max: 100,   unit: '%',     safetyNote: 'Load exceeds rated capacity — risk of overload failure.' },
  vibration:     { min: 0,     max: 5,     unit: 'mm/s',  safetyNote: 'Excessive vibration — mechanical failure risk.' },
  humidity:      { min: 20,    max: 85,    unit: '%RH',   safetyNote: 'Humidity out of range — corrosion or insulation degradation risk.' },
  earthing_value:{ min: 0,     max: 2,     unit: 'Ω',    safetyNote: 'Poor earthing — serious electrocution risk.' },
  oil_temperature:{ min: 10,   max: 85,    unit: '°C',   safetyNote: 'Oil temperature outside safe range.' },
  oil_level:     { min: 70,    max: 100,   unit: '%',     safetyNote: 'Low oil level — transformer damage risk.' },
  power_quality: { min: 95,    max: 105,   unit: '%THD',  safetyNote: 'Power quality issue detected.' },
  water_level:   { min: 0,     max: 50,    unit: 'cm',   safetyNote: 'High water level — flooding risk.' },
  structural:    { min: 0,     max: 5,     unit: 'mm',   safetyNote: 'Structural deformation detected.' },
};

const MEASUREMENT_TYPES = [
  { value: 'voltage',        label: 'Voltage' },
  { value: 'current',        label: 'Current' },
  { value: 'temperature',    label: 'Temperature' },
  { value: 'load',           label: 'Load' },
  { value: 'vibration',      label: 'Vibration' },
  { value: 'humidity',       label: 'Humidity' },
  { value: 'earthing_value', label: 'Earthing Value' },
  { value: 'oil_temperature',label: 'Oil Temperature' },
  { value: 'oil_level',      label: 'Oil Level' },
  { value: 'power_quality',  label: 'Power Quality' },
  { value: 'fault_code',     label: 'Fault Code' },
  { value: 'water_level',    label: 'Water Level' },
  { value: 'structural',     label: 'Structural Measurement' },
  { value: 'other',          label: 'Other' },
];

export interface MeasurementEntry {
  id: string;
  measurementType: string;
  name: string;
  value: string;
  unit: string;
  normalRangeMin: string;
  normalRangeMax: string;
  instrumentUsed: string;
  calibrationStatus: string;
  confidence: number;
  gpsLat?: number | null;
  gpsLng?: number | null;
  isOutOfRange: boolean;
  outOfRangeDirection: string;
}

interface Props {
  alertId: string;
  workerId?: string;
  assetId?: string | null;
  reportId?: string | null;
  onMeasurementsChange?: (measurements: MeasurementEntry[]) => void;
}

function newEntry(type = 'temperature'): MeasurementEntry {
  const range = NORMAL_RANGES[type];
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2),
    measurementType: type,
    name: MEASUREMENT_TYPES.find(t => t.value === type)?.label ?? type,
    value: '',
    unit: range?.unit ?? '',
    normalRangeMin: range ? String(range.min) : '',
    normalRangeMax: range ? String(range.max) : '',
    instrumentUsed: '',
    calibrationStatus: 'unknown',
    confidence: 1.0,
    gpsLat: null,
    gpsLng: null,
    isOutOfRange: false,
    outOfRangeDirection: '',
  };
}

export default function MeasurementsSection({ alertId, assetId, reportId, onMeasurementsChange }: Props) {
  const qc = useQueryClient();
  const [entries, setEntries] = useState<MeasurementEntry[]>([newEntry()]);
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [saved, setSaved] = useState(false);

  const inp = 'w-full border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400';

  const captureGps = () => {
    navigator.geolocation?.getCurrentPosition(pos => {
      setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      setEntries(es => es.map(e => ({ ...e, gpsLat: pos.coords.latitude, gpsLng: pos.coords.longitude })));
    });
  };

  const updateEntry = (id: string, key: keyof MeasurementEntry, val: any) => {
    setEntries(es => es.map(e => {
      if (e.id !== id) return e;
      const updated = { ...e, [key]: val };
      // Re-check out-of-range whenever value changes
      if (key === 'value' || key === 'normalRangeMin' || key === 'normalRangeMax') {
        const v = parseFloat(updated.value);
        const min = parseFloat(updated.normalRangeMin);
        const max = parseFloat(updated.normalRangeMax);
        if (!isNaN(v) && !isNaN(min) && !isNaN(max)) {
          if (v < min) { updated.isOutOfRange = true; updated.outOfRangeDirection = 'below'; }
          else if (v > max) { updated.isOutOfRange = true; updated.outOfRangeDirection = 'above'; }
          else { updated.isOutOfRange = false; updated.outOfRangeDirection = ''; }
        }
      }
      // When type changes, pre-fill unit & range
      if (key === 'measurementType') {
        const range = NORMAL_RANGES[val as string];
        if (range) {
          updated.unit = range.unit;
          updated.normalRangeMin = String(range.min);
          updated.normalRangeMax = String(range.max);
          updated.name = MEASUREMENT_TYPES.find(t => t.value === val)?.label ?? String(val);
        }
        updated.isOutOfRange = false;
        updated.outOfRangeDirection = '';
      }
      return updated;
    }));
    onMeasurementsChange?.(entries);
  };

  const saveMutation = useMutation(
    async () => {
      for (const m of entries) {
        if (!m.value) continue;
        await api.post('/measurements', {
          alertId,
          reportId: reportId ?? null,
          assetId: assetId ?? null,
          measurementType: m.measurementType,
          name: m.name,
          value: parseFloat(m.value),
          unit: m.unit,
          normalRangeMin: m.normalRangeMin ? parseFloat(m.normalRangeMin) : null,
          normalRangeMax: m.normalRangeMax ? parseFloat(m.normalRangeMax) : null,
          isOutOfRange: m.isOutOfRange,
          outOfRangeDirection: m.outOfRangeDirection || null,
          instrumentUsed: m.instrumentUsed || null,
          calibrationStatus: m.calibrationStatus,
          gpsLat: m.gpsLat ?? null,
          gpsLng: m.gpsLng ?? null,
          confidence: m.confidence,
        });
      }
    },
    {
      onSuccess: () => {
        setSaved(true);
        qc.invalidateQueries(['worker-alert', alertId]);
        setTimeout(() => setSaved(false), 3000);
      },
    }
  );

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-700">📏 Measurements</h3>
        <button onClick={captureGps} className="text-xs text-blue-600 hover:underline">
          📡 {gps ? `GPS: ${gps.lat.toFixed(4)}, ${gps.lng.toFixed(4)}` : 'Capture GPS'}
        </button>
      </div>

      <div className="space-y-4">
        {entries.map((entry, i) => {
          const rangeInfo = NORMAL_RANGES[entry.measurementType];
          return (
            <div key={entry.id} className={`p-3 rounded-xl border ${entry.isOutOfRange ? 'border-red-400 bg-red-50' : 'border-gray-200 bg-gray-50'}`}>
              {/* Out-of-range warning */}
              {entry.isOutOfRange && (
                <div className="mb-2 p-2 bg-red-100 border border-red-300 rounded text-xs text-red-800 font-medium">
                  ⚠ OUT OF RANGE ({entry.outOfRangeDirection} limit)
                  {rangeInfo?.safetyNote && <p className="font-normal mt-0.5">{rangeInfo.safetyNote}</p>}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-500">Type</label>
                  <select className={inp + ' mt-0.5'} value={entry.measurementType}
                    onChange={e => updateEntry(entry.id, 'measurementType', e.target.value)}>
                    {MEASUREMENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500">Name / Label</label>
                  <input className={inp + ' mt-0.5'} value={entry.name}
                    onChange={e => updateEntry(entry.id, 'name', e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-gray-500">
                    Value {rangeInfo && <span className="text-gray-400">(normal: {rangeInfo.min}–{rangeInfo.max} {rangeInfo.unit})</span>}
                  </label>
                  <div className="flex gap-1 mt-0.5">
                    <input className={`flex-1 ${inp} ${entry.isOutOfRange ? 'border-red-400' : ''}`}
                      type="number" step="any" value={entry.value}
                      onChange={e => updateEntry(entry.id, 'value', e.target.value)}
                      placeholder="0.00" />
                    <input className={`w-16 ${inp}`} value={entry.unit}
                      onChange={e => updateEntry(entry.id, 'unit', e.target.value)}
                      placeholder="unit" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500">Instrument Used</label>
                  <input className={inp + ' mt-0.5'} value={entry.instrumentUsed}
                    onChange={e => updateEntry(entry.id, 'instrumentUsed', e.target.value)}
                    placeholder="e.g. Fluke 87V" />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Calibration</label>
                  <select className={inp + ' mt-0.5'} value={entry.calibrationStatus}
                    onChange={e => updateEntry(entry.id, 'calibrationStatus', e.target.value)}>
                    <option value="calibrated">Calibrated</option>
                    <option value="uncalibrated">Uncalibrated</option>
                    <option value="unknown">Unknown</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500">Confidence</label>
                  <select className={inp + ' mt-0.5'} value={String(entry.confidence)}
                    onChange={e => updateEntry(entry.id, 'confidence', parseFloat(e.target.value))}>
                    <option value="1.0">High</option>
                    <option value="0.7">Medium</option>
                    <option value="0.5">Low</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-between items-center mt-2">
                <span className="text-xs text-gray-400">
                  {gps ? `📍 GPS attached` : 'No GPS'}
                </span>
                {entries.length > 1 && (
                  <button onClick={() => setEntries(es => es.filter(e => e.id !== entry.id))}
                    className="text-xs text-red-500 hover:text-red-700">Remove</button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex gap-2">
        <button onClick={() => setEntries(es => [...es, newEntry()])}
          className="flex-1 text-xs border border-blue-300 text-blue-600 rounded-lg py-1.5 hover:bg-blue-50">
          + Add Measurement
        </button>
        <button onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isLoading || entries.every(e => !e.value)}
          className="flex-1 btn-primary text-xs disabled:opacity-40">
          {saveMutation.isLoading ? 'Saving…' : saved ? '✓ Saved!' : '💾 Save Measurements'}
        </button>
      </div>
    </div>
  );
}
