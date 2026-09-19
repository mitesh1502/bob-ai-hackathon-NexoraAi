import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import AdminLayout from '../../components/AdminLayout';
import api from '../../lib/api';

export default function WorkerCoverageAreaPage() {
  const { workerId } = useParams<{ workerId: string }>();
  const qc = useQueryClient();

  const [stateId, setStateId] = useState('');
  const [districtId, setDistrictId] = useState('');
  const [talukaId, setTalukaId] = useState('');
  const [villageId, setVillageId] = useState('');
  const [isPrimary, setIsPrimary] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: worker } = useQuery(
    ['worker', workerId],
    () => api.get(`/workers/${workerId}`).then(r => r.data.data),
    { enabled: !!workerId }
  );

  const { data: coverageAreas = [] } = useQuery(
    ['worker-coverage', workerId],
    () => api.get(`/workers/${workerId}/coverage`).then(r => r.data.data ?? []),
    { enabled: !!workerId }
  );

  const { data: states = [] } = useQuery('states-list',
    () => api.get('/gis/states').then(r => r.data.data ?? []),
    { staleTime: 60000 }
  );

  const { data: districts = [] } = useQuery(
    ['districts', stateId],
    () => stateId ? api.get(`/gis/districts?stateId=${stateId}`).then(r => r.data.data ?? []) : Promise.resolve([]),
    { enabled: !!stateId }
  );

  const { data: talukas = [] } = useQuery(
    ['talukas', districtId],
    () => districtId ? api.get(`/gis/talukas?districtId=${districtId}`).then(r => r.data.data ?? []) : Promise.resolve([]),
    { enabled: !!districtId }
  );

  const { data: villages = [] } = useQuery(
    ['villages', talukaId],
    () => talukaId ? api.get(`/gis/villages?talukaId=${talukaId}`).then(r => r.data.data ?? []) : Promise.resolve([]),
    { enabled: !!talukaId }
  );

  const addMutation = useMutation(
    () => api.post(`/workers/${workerId}/coverage`, {
      stateId, districtId: districtId || null,
      talukaId: talukaId || null, villageId: villageId || null,
      isPrimary,
    }).then(r => r.data),
    {
      onSuccess: () => {
        qc.invalidateQueries(['worker-coverage', workerId]);
        setDistrictId(''); setTalukaId(''); setVillageId(''); setIsPrimary(false);
        setError(null);
      },
      onError: (e: any) => setError(e?.response?.data?.message ?? 'Failed to add coverage area'),
    }
  );

  const removeMutation = useMutation(
    (areaId: string) => api.delete(`/workers/${workerId}/coverage/${areaId}`).then(r => r.data),
    { onSuccess: () => qc.invalidateQueries(['worker-coverage', workerId]) }
  );

  const sel = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400';

  return (
    <AdminLayout title="Worker Coverage Areas">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Worker header */}
        {worker && (
          <div className="card flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-lg">
              {worker.full_name?.[0] ?? '?'}
            </div>
            <div>
              <p className="font-bold text-gray-800">{worker.full_name}</p>
              <p className="text-sm text-gray-500 capitalize">{worker.field_of_work?.replace(/_/g, ' ')}</p>
              <p className="text-xs text-gray-400">{worker.district_name} · {worker.state_name}</p>
            </div>
          </div>
        )}

        {/* Current coverage areas */}
        <div className="card space-y-3">
          <h3 className="font-semibold text-gray-700">Current Coverage Areas</h3>
          {(coverageAreas as any[]).length === 0 ? (
            <p className="text-sm text-gray-400">No coverage areas defined. Add one below.</p>
          ) : (
            <div className="space-y-2">
              {(coverageAreas as any[]).map((area: any) => (
                <div key={area.id} className={`flex items-center justify-between p-3 rounded-xl border text-sm ${area.is_primary ? 'border-blue-300 bg-blue-50' : 'border-gray-200'}`}>
                  <div>
                    <div className="flex items-center gap-2">
                      {area.is_primary && <span className="badge bg-blue-100 text-blue-700 text-xs">Primary</span>}
                      <span className="font-medium">{[area.village_name, area.taluka_name, area.district_name, area.state_name].filter(Boolean).join(' → ')}</span>
                    </div>
                  </div>
                  <button onClick={() => removeMutation.mutate(area.id)}
                    disabled={removeMutation.isLoading}
                    className="text-xs text-red-500 hover:text-red-700">Remove</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add coverage area */}
        <div className="card space-y-4">
          <h3 className="font-semibold text-gray-700">Add Coverage Area</h3>
          {error && (
            <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">{error}</div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500">State *</label>
              <select className={sel + ' mt-1'} value={stateId} onChange={e => { setStateId(e.target.value); setDistrictId(''); setTalukaId(''); setVillageId(''); }}>
                <option value="">Select state…</option>
                {(states as any[]).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500">District</label>
              <select className={sel + ' mt-1'} value={districtId} onChange={e => { setDistrictId(e.target.value); setTalukaId(''); setVillageId(''); }} disabled={!stateId}>
                <option value="">Any district</option>
                {(districts as any[]).map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500">Taluka</label>
              <select className={sel + ' mt-1'} value={talukaId} onChange={e => { setTalukaId(e.target.value); setVillageId(''); }} disabled={!districtId}>
                <option value="">Any taluka</option>
                {(talukas as any[]).map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500">Village</label>
              <select className={sel + ' mt-1'} value={villageId} onChange={e => setVillageId(e.target.value)} disabled={!talukaId}>
                <option value="">Any village</option>
                {(villages as any[]).map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isPrimary} onChange={e => setIsPrimary(e.target.checked)} />
            Mark as primary coverage area
          </label>
          <button
            onClick={() => addMutation.mutate()}
            disabled={!stateId || addMutation.isLoading}
            className="w-full btn-primary text-sm disabled:opacity-40">
            {addMutation.isLoading ? 'Adding…' : '+ Add Coverage Area'}
          </button>
        </div>
      </div>
    </AdminLayout>
  );
}
