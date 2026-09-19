import React, { useEffect, useRef, useState } from 'react';
import AdminLayout from '../../components/AdminLayout';
import api from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useQuery } from 'react-query';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet default icon issue with webpack/vite
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const RISK_COLORS: Record<string, string> = {
  low: '#22c55e', moderate: '#eab308', high: '#f97316', critical: '#ef4444',
};

// Approximate bounding boxes for each state (for auto-zoom)
// Key = state name (as returned by /citizens/states), value = [south, west, north, east]
const STATE_BOUNDS: Record<string, [number, number, number, number]> = {
  'Andhra Pradesh': [12.6, 76.7, 19.9, 84.8],
  'Arunachal Pradesh': [26.6, 91.5, 29.5, 97.4],
  'Assam': [24.1, 89.7, 27.9, 96.0],
  'Bihar': [24.3, 83.3, 27.5, 88.3],
  'Chhattisgarh': [17.8, 80.2, 24.1, 84.4],
  'Goa': [14.9, 73.7, 15.8, 74.4],
  'Gujarat': [20.1, 68.2, 24.7, 74.5],
  'Haryana': [27.7, 74.5, 30.9, 77.6],
  'Himachal Pradesh': [30.4, 75.6, 33.2, 79.0],
  'Jharkhand': [21.9, 83.3, 25.3, 87.9],
  'Karnataka': [11.6, 74.1, 18.4, 78.6],
  'Kerala': [8.2, 74.9, 12.8, 77.4],
  'Madhya Pradesh': [21.1, 74.0, 26.9, 82.8],
  'Maharashtra': [15.6, 72.6, 22.0, 80.9],
  'Manipur': [23.8, 92.3, 25.7, 94.8],
  'Meghalaya': [25.0, 89.8, 26.1, 92.8],
  'Mizoram': [21.9, 92.3, 24.5, 93.4],
  'Nagaland': [25.2, 93.3, 27.0, 95.3],
  'Odisha': [17.8, 81.4, 22.6, 87.5],
  'Punjab': [29.5, 73.9, 32.6, 76.9],
  'Rajasthan': [23.0, 69.5, 30.2, 78.2],
  'Sikkim': [27.1, 88.0, 28.1, 88.9],
  'Tamil Nadu': [8.1, 76.2, 13.6, 80.3],
  'Telangana': [15.8, 77.2, 19.9, 81.3],
  'Tripura': [22.9, 91.1, 24.5, 92.3],
  'Uttar Pradesh': [23.9, 77.1, 30.4, 84.6],
  'Uttarakhand': [28.7, 77.6, 31.4, 81.0],
  'West Bengal': [21.5, 85.8, 27.2, 89.9],
  'Delhi': [28.4, 76.8, 28.9, 77.4],
  'Jammu and Kashmir': [32.3, 73.6, 37.1, 80.4],
  'Ladakh': [32.1, 75.4, 36.0, 80.4],
  'Lakshadweep': [8.3, 71.8, 12.0, 74.1],
  'Puducherry': [11.7, 79.6, 12.1, 80.2],
  'Andaman and Nicobar Islands': [6.7, 92.2, 13.7, 94.0],
  'Chandigarh': [30.7, 76.7, 30.8, 76.9],
  'Dadra and Nagar Haveli and Daman and Diu': [20.0, 72.8, 20.7, 73.1],
};

export default function GisMapPage() {
  const { user } = useAuth();
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const layersRef = useRef<{ assets: L.LayerGroup; complaints: L.LayerGroup }>({
    assets: L.layerGroup(),
    complaints: L.layerGroup(),
  });

  const [filters, setFilters] = useState({
    riskLevel: '', assetType: '', showComplaints: true, showAssets: true,
    stateId: user?.role === 'state_admin' ? (user.stateId ?? '') : '',
    districtId: '',
  });
  const [selectedFeature, setSelectedFeature] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // Load states/districts for filter dropdowns
  const { data: statesData } = useQuery('states-list', () =>
    api.get('/citizens/states').then((r) => r.data.data ?? []).catch(() => [])
  );
  const { data: districtsData } = useQuery(
    ['districts', filters.stateId],
    () => filters.stateId
      ? api.get(`/citizens/districts/${filters.stateId}`).then((r) => r.data.data ?? []).catch(() => [])
      : Promise.resolve([]),
    { enabled: !!filters.stateId }
  );

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // Initialize map — State Admins auto-fit to their assigned state
    let initialCenter: [number, number] = [20.5937, 78.9629];
    let initialZoom = 5;

    const map = L.map(containerRef.current, {
      center: initialCenter,
      zoom: initialZoom,
    });

    // Use OpenStreetMap (Mapbox fallback if key available)
    const mapboxToken = (window as any).__NEXORA_MAPBOX_TOKEN__;
    if (mapboxToken) {
      L.tileLayer(
        `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/{z}/{x}/{y}?access_token=${mapboxToken}`,
        { tileSize: 512, zoomOffset: -1 }
      ).addTo(map);
    } else {
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);
    }

    layersRef.current.assets.addTo(map);
    layersRef.current.complaints.addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Auto-zoom to state when stateId filter changes
  useEffect(() => {
    if (!mapRef.current || !filters.stateId || !statesData) return;
    const stateObj = statesData.find((s: any) => s.id === filters.stateId);
    if (!stateObj) return;
    const bounds = STATE_BOUNDS[stateObj.name];
    if (bounds) {
      mapRef.current.fitBounds([[bounds[0], bounds[1]], [bounds[2], bounds[3]]], { padding: [20, 20] });
    }
  }, [filters.stateId, statesData]);

  // Auto-fit State Admin to their state on first load
  useEffect(() => {
    if (!mapRef.current || user?.role !== 'state_admin' || !user.stateId || !statesData) return;
    const stateObj = statesData.find((s: any) => s.id === user.stateId);
    if (!stateObj) return;
    const bounds = STATE_BOUNDS[stateObj.name];
    if (bounds) {
      mapRef.current.fitBounds([[bounds[0], bounds[1]], [bounds[2], bounds[3]]], { padding: [20, 20] });
    }
  }, [statesData]);

  const loadLayers = async () => {
    if (!mapRef.current) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.riskLevel) params.set('riskLevel', filters.riskLevel);
      if (filters.assetType) params.set('assetType', filters.assetType);
      if (filters.stateId) params.set('stateId', filters.stateId);
      if (filters.districtId) params.set('districtId', filters.districtId);

      layersRef.current.assets.clearLayers();
      layersRef.current.complaints.clearLayers();

      if (filters.showAssets) {
        const assetsRes = await api.get(`/gis/assets?${params}`);
        const assetGeo: GeoJSON.FeatureCollection = assetsRes.data;
        for (const feature of assetGeo.features) {
          const coords = feature.geometry as any;
          const p = feature.properties as any;
          const color = RISK_COLORS[p.riskLevel] ?? '#6b7280';
          const marker = L.circleMarker([coords.coordinates[1], coords.coordinates[0]], {
            radius: 8, fillColor: color, color: '#fff', weight: 2,
            fillOpacity: 0.9,
          });
          marker.on('click', () => setSelectedFeature({ type: 'asset', ...p }));
          marker.bindTooltip(`${p.assetCode} (${p.riskLevel?.toUpperCase()})`);
          layersRef.current.assets.addLayer(marker);
        }
      }

      if (filters.showComplaints) {
        const complaintParams = new URLSearchParams();
        if (filters.stateId) complaintParams.set('stateId', filters.stateId);
        if (filters.districtId) complaintParams.set('districtId', filters.districtId);
        const complaintsRes = await api.get(`/gis/complaints?${complaintParams}`);
        const compGeo: GeoJSON.FeatureCollection = complaintsRes.data;
        for (const feature of compGeo.features) {
          const coords = feature.geometry as any;
          const p = feature.properties as any;
          const marker = L.circleMarker([coords.coordinates[1], coords.coordinates[0]], {
            radius: 6, fillColor: '#3b82f6', color: '#fff', weight: 2,
            fillOpacity: 0.8,
          });
          marker.on('click', () => setSelectedFeature({ type: 'complaint', ...p }));
          marker.bindTooltip(`${p.complaintNumber} — ${p.status}`);
          layersRef.current.complaints.addLayer(marker);
        }
      }
    } catch (err) {
      console.error('Failed to load map layers', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLayers();
  }, [filters]);

  // State Admins cannot change the state filter — it's locked to their state
  const isStateAdmin = user?.role === 'state_admin';

  return (
    <AdminLayout title="GIS Infrastructure Map">
      <div className="flex gap-4 h-[calc(100vh-8rem)]">
        {/* Sidebar filters */}
        <div className="w-64 flex-shrink-0 flex flex-col gap-4 overflow-y-auto">
          <div className="card">
            <h3 className="font-semibold text-gray-700 mb-3">Filters</h3>
            <div className="space-y-3 text-sm">
              {/* State filter — locked for State Admins */}
              <div>
                <label className="form-label text-xs">State</label>
                <select
                  className="form-input text-sm"
                  value={filters.stateId}
                  disabled={isStateAdmin}
                  onChange={(e) => setFilters((f) => ({ ...f, stateId: e.target.value, districtId: '' }))}
                >
                  <option value="">All States</option>
                  {(statesData ?? []).map((s: any) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                {isStateAdmin && (
                  <p className="text-xs text-gray-400 mt-1">Scoped to your state</p>
                )}
              </div>

              {/* District filter */}
              <div>
                <label className="form-label text-xs">District</label>
                <select
                  className="form-input text-sm"
                  value={filters.districtId}
                  disabled={!filters.stateId}
                  onChange={(e) => setFilters((f) => ({ ...f, districtId: e.target.value }))}
                >
                  <option value="">All Districts</option>
                  {(districtsData ?? []).map((d: any) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="form-label text-xs">Risk Level</label>
                <select
                  className="form-input text-sm"
                  value={filters.riskLevel}
                  onChange={(e) => setFilters((f) => ({ ...f, riskLevel: e.target.value }))}
                >
                  <option value="">All</option>
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="moderate">Moderate</option>
                  <option value="low">Low</option>
                </select>
              </div>
              <div>
                <label className="form-label text-xs">Asset Type</label>
                <select
                  className="form-input text-sm"
                  value={filters.assetType}
                  onChange={(e) => setFilters((f) => ({ ...f, assetType: e.target.value }))}
                >
                  <option value="">All Types</option>
                  <option value="transformer">Transformer</option>
                  <option value="substation_equipment">Substation</option>
                  <option value="feeder">Feeder</option>
                  <option value="pole_mounted">Pole Mounted</option>
                  <option value="cable_line">Cable/Line</option>
                  <option value="switchgear">Switchgear</option>
                </select>
              </div>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={filters.showAssets}
                  onChange={(e) => setFilters((f) => ({ ...f, showAssets: e.target.checked }))} />
                Show Assets
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={filters.showComplaints}
                  onChange={(e) => setFilters((f) => ({ ...f, showComplaints: e.target.checked }))} />
                Show Complaints
              </label>
            </div>
          </div>

          {/* Legend */}
          <div className="card">
            <h3 className="font-semibold text-gray-700 mb-2 text-sm">Legend — Risk Level</h3>
            {Object.entries(RISK_COLORS).map(([level, color]) => (
              <div key={level} className="flex items-center gap-2 mb-1">
                <div className="w-4 h-4 rounded-full border border-white shadow-sm" style={{ backgroundColor: color }} />
                <span className="text-xs capitalize">{level}</span>
              </div>
            ))}
            <div className="flex items-center gap-2 mt-2">
              <div className="w-4 h-4 rounded-full border border-white shadow-sm" style={{ backgroundColor: 'var(--color-secondary)' }} />
              <span className="text-xs">Complaint</span>
            </div>
          </div>

          {/* Selected feature info */}
          {selectedFeature && (
            <div className="card">
              <div className="flex items-start justify-between">
                <h3 className="font-semibold text-gray-700 text-sm mb-2">
                  {selectedFeature.type === 'asset' ? '🏭 Asset' : '📋 Complaint'}
                </h3>
                <button onClick={() => setSelectedFeature(null)} className="text-gray-400 hover:text-gray-600 text-xs">✕</button>
              </div>
              <div className="text-xs space-y-1 text-gray-600">
                {selectedFeature.type === 'asset' ? (
                  <>
                    <p><strong>Code:</strong> {selectedFeature.assetCode}</p>
                    <p><strong>Type:</strong> {selectedFeature.assetType?.replace('_', ' ')}</p>
                    <p><strong>Risk:</strong> <span className={`font-bold ${
                      selectedFeature.riskLevel === 'critical' ? 'text-red-600' :
                      selectedFeature.riskLevel === 'high' ? 'text-orange-500' :
                      selectedFeature.riskLevel === 'moderate' ? 'text-yellow-600' : 'text-green-600'
                    }`}>{selectedFeature.riskLevel?.toUpperCase()} ({Math.round(selectedFeature.riskScore ?? 0)})</span></p>
                    <p><strong>State:</strong> {selectedFeature.stateName}</p>
                    <p><strong>District:</strong> {selectedFeature.districtName}</p>
                  </>
                ) : (
                  <>
                    <p><strong>Number:</strong> {selectedFeature.complaintNumber}</p>
                    <p><strong>Status:</strong> {selectedFeature.status}</p>
                    <p><strong>Category:</strong> {selectedFeature.category}</p>
                  </>
                )}
              </div>
            </div>
          )}

          {loading && (
            <div className="card text-center text-sm text-gray-400">Loading map data…</div>
          )}
        </div>

        {/* Map container */}
        <div className="flex-1 rounded-xl overflow-hidden border border-gray-200 shadow-sm">
          <div ref={containerRef} className="w-full h-full" />
        </div>
      </div>
    </AdminLayout>
  );
}
