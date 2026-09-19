import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import AdminLayout from '../../components/AdminLayout';
import api from '../../lib/api';

const RISK_COLOR = (score: number) =>
  score >= 75 ? 'text-red-600' : score >= 50 ? 'text-orange-600' : score >= 25 ? 'text-yellow-600' : 'text-green-600';

const LEVEL_BADGE: Record<string, string> = {
  critical: 'bg-red-100 text-red-700', high: 'bg-orange-100 text-orange-700',
  moderate: 'bg-yellow-100 text-yellow-700', low: 'bg-green-100 text-green-700',
};

export default function AlertDetailPage() {
  const { alertId } = useParams<{ alertId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState<'overview' | 'report' | 'risk' | 'assign' | 'timeline'>('overview');
  const [reviewAction, setReviewAction] = useState('');
  const [reviewNotes, setReviewNotes] = useState('');
  const [correctionReason, setCorrectionReason] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [verificationNotes, setVerificationNotes] = useState('');
  const [closeConfirm, setCloseConfirm] = useState(false);
  const [selectedWorkerId, setSelectedWorkerId] = useState('');
  const [assignReason, setAssignReason] = useState('');
  const [reassignReason, setReassignReason] = useState('');

  const { data, isLoading } = useQuery(
    ['alert-detail', alertId],
    () => api.get(`/alerts/${alertId}`).then((r) => r.data.data),
    { enabled: !!alertId }
  );

  const { data: recData } = useQuery(
    ['alert-recommendations', alertId],
    () => api.get(`/alerts/${alertId}/worker-recommendations`).then((r) => r.data.data ?? []),
    { enabled: !!alertId && activeTab === 'assign' }
  );

  const { data: riskHistory } = useQuery(
    ['alert-risk-history', alertId],
    () => api.get(`/alerts/${alertId}/risk-history`).then((r) => r.data.data ?? []),
    { enabled: !!alertId && activeTab === 'risk' }
  );

  const assignMutation = useMutation(
    (payload: any) => api.post(`/alerts/${alertId}/assign`, payload).then((r) => r.data),
    { onSuccess: () => { qc.invalidateQueries(['alert-detail', alertId]); setActiveTab('overview'); } }
  );

  const reviewMutation = useMutation(
    (payload: any) => api.patch(`/alerts/${alertId}/reports/${latestReport?.id}/review`, payload).then((r) => r.data),
    { onSuccess: () => qc.invalidateQueries(['alert-detail', alertId]) }
  );

  const recalcMutation = useMutation(
    () => api.post(`/alerts/${alertId}/recalculate-risk`, { reportId: latestReport?.id ?? null }).then((r) => r.data),
    { onSuccess: () => { qc.invalidateQueries(['alert-detail', alertId]); qc.invalidateQueries(['alert-risk-history', alertId]); } }
  );

  const closeMutation = useMutation(
    () => api.patch(`/alerts/${alertId}/close`, { verificationNotes }).then((r) => r.data),
    { onSuccess: () => { qc.invalidateQueries(['alert-detail', alertId]); setCloseConfirm(false); } }
  );

  const escalateMutation = useMutation(
    (reason: string) => api.post(`/alerts/${alertId}/escalate`, {
      escalatedToType: 'super_admin', reason,
    }).then((r) => r.data),
    { onSuccess: () => qc.invalidateQueries(['alert-detail', alertId]) }
  );

  if (isLoading) return (
    <AdminLayout title="Alert">
      <div className="animate-pulse text-gray-400 text-center py-20">Loading alert…</div>
    </AdminLayout>
  );
  if (!data) return (
    <AdminLayout title="Alert">
      <p className="text-center text-gray-500 py-20">Alert not found.</p>
    </AdminLayout>
  );

  const alert = data;
  const latestReport = alert.fieldReports?.[0] ?? null;
  const activeAssignment = alert.assignments?.find((a: any) => a.is_active);
  const riskScore = alert.current_risk_score ?? 0;

  const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400';

  const TABS = [
    { key: 'overview', label: 'Overview' },
    { key: 'report',   label: `Report${latestReport ? ' ✓' : ''}` },
    { key: 'risk',     label: 'Risk Score' },
    { key: 'assign',   label: 'Assignment' },
    { key: 'timeline', label: 'Timeline' },
  ] as const;

  return (
    <AdminLayout title={alert.alert_number}>
      <div className="max-w-4xl mx-auto space-y-4">
        {/* Alert header */}
        <div className="card">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="font-mono font-bold">{alert.alert_number}</span>
                <span className={`badge text-xs capitalize ${LEVEL_BADGE[riskScore >= 75 ? 'critical' : riskScore >= 50 ? 'high' : riskScore >= 25 ? 'moderate' : 'low']}`}>
                  {riskScore >= 75 ? 'Critical' : riskScore >= 50 ? 'High' : riskScore >= 25 ? 'Moderate' : 'Low'}
                </span>
                <span className="badge bg-gray-100 text-gray-600 text-xs capitalize">
                  {alert.status?.replace(/_/g, ' ')}
                </span>
                {alert.is_safety_concern && <span className="badge bg-red-100 text-red-700 text-xs">🚨 Safety</span>}
              </div>
              <h1 className="text-lg font-bold text-gray-800">{alert.title}</h1>
              <p className="text-sm text-gray-500 mt-1">
                {[alert.village_name, alert.taluka_name, alert.district_name, alert.state_name].filter(Boolean).join(' · ')}
              </p>
            </div>
            <div className="text-right flex-shrink-0">
              <div className={`text-4xl font-black ${RISK_COLOR(riskScore)}`}>{Math.round(riskScore)}</div>
              <div className="text-xs text-gray-400">Risk Score</div>
            </div>
          </div>
          {/* Quick action buttons */}
          <div className="flex flex-wrap gap-2 mt-4">
            {!activeAssignment && (
              <button onClick={() => setActiveTab('assign')} className="btn-primary text-xs">Assign Worker</button>
            )}
            {['report_submitted', 'state_admin_review'].includes(alert.status) && latestReport && (
              <button onClick={() => setActiveTab('report')} className="btn-primary text-xs">Review Report</button>
            )}
            <button onClick={() => recalcMutation.mutate()} disabled={recalcMutation.isLoading}
              className="btn-secondary text-xs">
              {recalcMutation.isLoading ? 'Recalculating…' : '🔄 Recalculate Risk'}
            </button>
            {['state_admin_verified', 'resolved', 'report_approved'].includes(alert.status) && (
              <button onClick={() => setCloseConfirm(true)} className="btn-secondary text-xs text-green-700 border-green-300">
                ✓ Close Alert
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 overflow-x-auto">
          {TABS.map(({ key, label }) => (
            <button key={key} onClick={() => setActiveTab(key as any)}
              className={`px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors ${activeTab === key ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>
              {label}
            </button>
          ))}
        </div>

        {/* ── Tab: Overview ─────────────────────────────── */}
        {activeTab === 'overview' && (
          <div className="space-y-4">
            <div className="card space-y-3 text-sm">
              <h3 className="font-semibold text-gray-700">Alert Details</h3>
              <div className="grid grid-cols-2 gap-y-2 gap-x-4">
                <p><span className="text-gray-500">Category: </span>{alert.category?.replace(/_/g, ' ')}</p>
                <p><span className="text-gray-500">Priority: </span><span className="capitalize">{alert.priority}</span></p>
                <p><span className="text-gray-500">Severity: </span><span className="capitalize">{alert.severity}</span></p>
                <p><span className="text-gray-500">Source: </span>{alert.source_type?.replace(/_/g, ' ')}</p>
                {alert.detected_at && <p><span className="text-gray-500">Detected: </span>{new Date(alert.detected_at).toLocaleString('en-IN')}</p>}
                {alert.recommended_response_deadline && (
                  <p className={new Date(alert.recommended_response_deadline) < new Date() ? 'text-red-600 font-medium' : ''}>
                    <span className="text-gray-500">Deadline: </span>{new Date(alert.recommended_response_deadline).toLocaleString('en-IN')}
                  </p>
                )}
              </div>
              <p className="text-gray-700 mt-2">{alert.description}</p>
              {alert.potential_impact && <p className="text-xs text-amber-700 bg-amber-50 p-2 rounded">Impact: {alert.potential_impact}</p>}
            </div>

            <div className="card space-y-2 text-sm">
              <h3 className="font-semibold text-gray-700">Location</h3>
              <p>{alert.full_address}</p>
              {alert.location_lat && alert.location_lng && (
                <div className="flex gap-3 text-xs">
                  <span className="text-gray-500">{alert.location_lat.toFixed(5)}, {alert.location_lng.toFixed(5)}</span>
                  <a href={`https://www.google.com/maps?q=${alert.location_lat},${alert.location_lng}`}
                    target="_blank" rel="noreferrer" className="text-blue-600 underline">View on map ↗</a>
                </div>
              )}
              {alert.nearby_landmark && <p className="text-xs text-gray-500">Landmark: {alert.nearby_landmark}</p>}
            </div>

            {activeAssignment && (
              <div className="card space-y-2 text-sm">
                <h3 className="font-semibold text-gray-700">👷 Assigned Worker</h3>
                <p className="font-medium">{activeAssignment.worker_name}</p>
                <p className="text-gray-500 capitalize">{activeAssignment.field_of_work?.replace(/_/g, ' ')}</p>
                <p className={`capitalize text-xs ${activeAssignment.acceptance_status === 'accepted' ? 'text-green-600' : activeAssignment.acceptance_status === 'declined' ? 'text-red-600' : 'text-yellow-600'}`}>
                  {activeAssignment.acceptance_status?.replace(/_/g, ' ')}
                </p>
                {activeAssignment.assignment_reason && (
                  <p className="text-xs text-gray-400">Reason: {activeAssignment.assignment_reason}</p>
                )}
              </div>
            )}

            {/* Evidence links */}
            {alert.evidence_links?.length > 0 && (
              <div className="card space-y-2">
                <h3 className="font-semibold text-gray-700 text-sm">Evidence Links</h3>
                {alert.evidence_links.map((e: any, i: number) => (
                  <a key={i} href={e.url} target="_blank" rel="noreferrer"
                    className="block text-xs text-blue-600 hover:underline">
                    [{e.type}] {e.label || e.url}
                  </a>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Report Review ─────────────────────────── */}
        {activeTab === 'report' && (
          <div className="space-y-4">
            {!latestReport ? (
              <div className="card text-center text-gray-400 py-10">No report submitted yet.</div>
            ) : (
              <>
                <div className="card space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-gray-700">Field Report</h3>
                    <span className={`badge text-xs capitalize ${latestReport.status === 'approved' ? 'bg-green-100 text-green-700' : latestReport.status === 'correction_requested' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>
                      {latestReport.status?.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <p><span className="text-gray-500">Worker: </span>{latestReport.worker_name}</p>
                  {latestReport.submitted_at && <p><span className="text-gray-500">Submitted: </span>{new Date(latestReport.submitted_at).toLocaleString('en-IN')}</p>}
                  <p><span className="text-gray-500">Problem Status: </span><span className="capitalize">{latestReport.problem_status ?? '—'}</span></p>
                  {latestReport.immediate_safety_risk && (
                    <p className="text-red-700 font-medium">🚨 Immediate safety risk reported</p>
                  )}
                  {latestReport.what_was_observed && (
                    <div><p className="text-gray-500 text-xs">What was observed:</p><p className="mt-1">{latestReport.what_was_observed}</p></div>
                  )}
                  {latestReport.worker_explanation && (
                    <div><p className="text-gray-500 text-xs">Worker explanation:</p><p className="mt-1">{latestReport.worker_explanation}</p></div>
                  )}
                  {latestReport.recommended_action_text && (
                    <div className="p-2 bg-blue-50 rounded text-xs">
                      Recommended action: <span className="font-medium">{latestReport.recommended_action_text.replace(/_/g, ' ')}</span>
                    </div>
                  )}
                  {latestReport.risk_score_before != null && latestReport.risk_score_after != null && (
                    <div className="flex items-center gap-3 p-2 bg-gray-50 rounded text-xs">
                      <span className="text-gray-500">Risk change:</span>
                      <span className="font-bold">{Math.round(latestReport.risk_score_before)}</span>
                      <span>→</span>
                      <span className={`font-bold ${latestReport.score_delta > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {Math.round(latestReport.risk_score_after)}
                        {' '}({latestReport.score_delta > 0 ? '+' : ''}{Math.round(latestReport.score_delta)})
                      </span>
                    </div>
                  )}
                </div>

                {/* Admin review actions */}
                {['report_submitted', 'state_admin_review'].includes(alert.status) && (
                  <div className="card space-y-4">
                    <h3 className="font-semibold text-gray-700 text-sm">Admin Review Actions</h3>
                    <div>
                      <label className="text-xs text-gray-500">Action</label>
                      <select className={inp + ' mt-1'} value={reviewAction}
                        onChange={e => setReviewAction(e.target.value)}>
                        <option value="">Select action…</option>
                        <option value="approve">✓ Approve Report</option>
                        <option value="request_correction">✎ Request Correction</option>
                        <option value="request_more_photos">📷 Request More Photos/Measurements</option>
                        <option value="reject">✕ Reject</option>
                        <option value="override_ai">⚠ Override AI Recommendation</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Notes</label>
                      <textarea className={inp + ' mt-1'} rows={2} value={reviewNotes} onChange={e => setReviewNotes(e.target.value)} />
                    </div>
                    {(reviewAction === 'request_correction' || reviewAction === 'request_more_photos') && (
                      <div>
                        <label className="text-xs text-gray-500">Correction Reason (required)</label>
                        <textarea className={inp + ' mt-1'} rows={2} value={correctionReason} onChange={e => setCorrectionReason(e.target.value)} />
                      </div>
                    )}
                    {reviewAction === 'override_ai' && (
                      <div>
                        <label className="text-xs text-red-600">Override Reason (mandatory)</label>
                        <textarea className={inp + ' mt-1'} rows={2} value={overrideReason} onChange={e => setOverrideReason(e.target.value)} />
                      </div>
                    )}
                    <button
                      disabled={!reviewAction || reviewMutation.isLoading || (reviewAction === 'override_ai' && !overrideReason)}
                      onClick={() => reviewMutation.mutate({ action: reviewAction, notes: reviewNotes, correctionReason, overrideReason })}
                      className="btn-primary w-full text-sm disabled:opacity-40">
                      {reviewMutation.isLoading ? 'Submitting…' : 'Submit Review'}
                    </button>

                    <div className="pt-2 border-t flex gap-2">
                      <button onClick={() => escalateMutation.mutate('Admin escalated to Super Admin for review')}
                        disabled={escalateMutation.isLoading}
                        className="flex-1 btn-secondary text-xs text-red-600 border-red-300">
                        ↑ Escalate
                      </button>
                      <button onClick={() => api.post(`/alerts/${alertId}/followup`, {})}
                        className="flex-1 btn-secondary text-xs">
                        🔍 Request Follow-up
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Tab: Risk Score ────────────────────────────── */}
        {activeTab === 'risk' && (
          <div className="space-y-4">
            {recalcMutation.data && (
              <div className="card space-y-3">
                <h3 className="font-semibold text-gray-700 text-sm">Latest Pipeline Result</h3>
                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-xs text-gray-500">Before</p>
                    <p className="text-2xl font-bold">{recalcMutation.data.data?.scoreBefore}</p>
                    <p className="text-xs capitalize text-gray-500">{recalcMutation.data.data?.levelBefore}</p>
                  </div>
                  <div className="text-2xl text-gray-400">→</div>
                  <div>
                    <p className="text-xs text-gray-500">After</p>
                    <p className={`text-2xl font-bold ${RISK_COLOR(recalcMutation.data.data?.finalScore ?? 0)}`}>
                      {recalcMutation.data.data?.finalScore}
                    </p>
                    <p className="text-xs capitalize">{recalcMutation.data.data?.finalLevel}</p>
                  </div>
                  <div className={`text-lg font-bold ${(recalcMutation.data.data?.scoreDelta ?? 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {(recalcMutation.data.data?.scoreDelta ?? 0) > 0 ? '▲ +' : '▼ '}
                    {Math.abs(recalcMutation.data.data?.scoreDelta ?? 0)}
                  </div>
                </div>
                {recalcMutation.data.data?.safetyOverrideApplied && (
                  <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                    ⚠ Safety override applied: {recalcMutation.data.data?.safetyOverrideReason}
                  </div>
                )}
                <div className="space-y-1 text-xs">
                  <p className="font-medium text-gray-600">Pipeline breakdown:</p>
                  {Object.entries(recalcMutation.data.data?.pipelineBreakdown ?? {}).map(([key, val]) => (
                    <div key={key} className="flex justify-between">
                      <span className="text-gray-500">{key.replace(/Delta$/, '').replace(/([A-Z])/g, ' $1').trim()}</span>
                      <span className={(val as number) > 0 ? 'text-red-600' : (val as number) < 0 ? 'text-green-600' : 'text-gray-400'}>
                        {(val as number) > 0 ? '+' : ''}{(val as number).toFixed(1)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="card space-y-2">
              <h3 className="font-semibold text-gray-700 text-sm">Risk Score History</h3>
              {(riskHistory ?? []).length === 0 ? (
                <p className="text-xs text-gray-400">No history yet. Click "Recalculate Risk" to run the pipeline.</p>
              ) : (
                <div className="space-y-2">
                  {(riskHistory as any[]).map((h, i) => (
                    <div key={i} className="flex items-center gap-3 text-sm border-b pb-2">
                      <div className="flex-1">
                        <span className="text-gray-500 text-xs">{new Date(h.calculated_at).toLocaleString('en-IN')}</span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span>{Math.round(h.score_before_alert ?? 0)}</span>
                          <span className="text-gray-400">→</span>
                          <span className={`font-bold ${RISK_COLOR(h.final_score)}`}>{Math.round(h.final_score)}</span>
                          <span className="capitalize text-xs text-gray-400">{h.final_level}</span>
                          {h.safety_override_applied && <span className="text-xs text-red-600">⚠ override</span>}
                        </div>
                      </div>
                      <span className={`text-sm font-medium ${h.score_delta > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {h.score_delta > 0 ? '+' : ''}{Math.round(h.score_delta)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Tab: Assignment ────────────────────────────── */}
        {activeTab === 'assign' && (
          <div className="space-y-4">
            {activeAssignment && (
              <div className="card p-3 bg-teal-50 border border-teal-200 text-sm space-y-1">
                <p className="font-medium text-teal-800">Currently assigned to: {activeAssignment.worker_name}</p>
                <p className="text-teal-600 capitalize text-xs">{activeAssignment.acceptance_status?.replace(/_/g, ' ')}</p>
                <p className="text-xs text-gray-500">To reassign, a reason is required below.</p>
              </div>
            )}

            <div className="card space-y-4">
              <h3 className="font-semibold text-gray-700 text-sm">Worker Recommendations</h3>
              {!recData ? (
                <p className="text-xs text-gray-400 animate-pulse">Loading recommendations…</p>
              ) : (recData as any[]).length === 0 ? (
                <p className="text-xs text-gray-400">No workers available for this alert.</p>
              ) : (
                <div className="space-y-3">
                  {(recData as any[]).map((rec: any) => (
                    <div key={rec.worker.workerId}
                      onClick={() => setSelectedWorkerId(rec.worker.workerId)}
                      className={`p-3 rounded-xl border cursor-pointer transition-colors ${selectedWorkerId === rec.worker.workerId ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-300'}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{rec.worker.workerName}</span>
                            <span className="text-xs badge bg-blue-100 text-blue-700">#{rec.rank}</span>
                            {rec.requiresCrossStateAuth && (
                              <span className="text-xs badge bg-red-100 text-red-600">Needs Super Admin Auth</span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 capitalize">{rec.worker.fieldOfWork?.replace(/_/g, ' ')}</p>
                          <p className="text-xs text-gray-400 mt-1">
                            {rec.worker.activeAssignmentCount} active assignment{rec.worker.activeAssignmentCount !== 1 ? 's' : ''}
                          </p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {rec.reasons.slice(0, 3).map((r: any) => (
                              <span key={r.code} className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                                {r.label}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold text-blue-700">{rec.totalScore}</div>
                          <div className="text-xs text-gray-400">score</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {selectedWorkerId && (
              <div className="card space-y-3">
                <h3 className="font-semibold text-gray-700 text-sm">
                  {activeAssignment ? 'Reassign Worker' : 'Assign Worker'}
                </h3>
                <div>
                  <label className="text-xs text-gray-500">Assignment Reason {!activeAssignment && '(required)'}</label>
                  <textarea className={inp + ' mt-1'} rows={2} value={assignReason}
                    onChange={e => setAssignReason(e.target.value)}
                    placeholder="Why this worker was selected" />
                </div>
                {activeAssignment && (
                  <div>
                    <label className="text-xs text-red-600">Reassignment Reason (mandatory)</label>
                    <textarea className={inp + ' mt-1'} rows={2} value={reassignReason}
                      onChange={e => setReassignReason(e.target.value)}
                      placeholder="Reason for reassigning" />
                  </div>
                )}
                <button
                  disabled={!assignReason || (!!activeAssignment && !reassignReason) || assignMutation.isLoading}
                  onClick={() => assignMutation.mutate({
                    workerId: selectedWorkerId,
                    assignmentReason: assignReason,
                    reassignmentReason: reassignReason || null,
                    recommendationRank: (recData as any[])?.find((r: any) => r.worker.workerId === selectedWorkerId)?.rank ?? 0,
                    recommendationReasons: (recData as any[])?.find((r: any) => r.worker.workerId === selectedWorkerId)?.reasons ?? [],
                  })}
                  className="btn-primary w-full text-sm disabled:opacity-40">
                  {assignMutation.isLoading ? 'Assigning…' : activeAssignment ? 'Reassign' : 'Assign Worker'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Timeline ──────────────────────────────── */}
        {activeTab === 'timeline' && (
          <div className="card space-y-1">
            <h3 className="font-semibold text-gray-700 text-sm mb-3">Status Timeline</h3>
            {(alert.statusHistory ?? []).length === 0 ? (
              <p className="text-xs text-gray-400">No history yet.</p>
            ) : (
              <div className="relative">
                <div className="absolute left-4 top-0 bottom-0 w-px bg-gray-200" />
                {(alert.statusHistory as any[]).map((s, i) => (
                  <div key={i} className="relative flex gap-4 pb-4 pl-10">
                    <div className="absolute left-3 top-1 w-3 h-3 rounded-full bg-blue-500 border-2 border-white" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {s.from_status && <span className="text-xs text-gray-400">{s.from_status?.replace(/_/g, ' ')}</span>}
                        {s.from_status && <span className="text-xs text-gray-400">→</span>}
                        <span className="text-sm font-medium text-gray-800">{s.to_status?.replace(/_/g, ' ')}</span>
                      </div>
                      {s.reason && <p className="text-xs text-gray-500 mt-0.5">{s.reason}</p>}
                      <p className="text-xs text-gray-400">{new Date(s.changed_at).toLocaleString('en-IN')} · {s.changed_by_type}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Close modal */}
        {closeConfirm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl p-6 w-full max-w-sm space-y-4">
              <h3 className="font-bold text-gray-800">Close Alert After Verification</h3>
              <p className="text-sm text-gray-600">Please provide verification notes confirming this alert has been fully resolved.</p>
              <textarea className={inp} rows={4} value={verificationNotes}
                onChange={e => setVerificationNotes(e.target.value)}
                placeholder="Verification notes (min 10 characters)" />
              <div className="flex gap-3">
                <button onClick={() => setCloseConfirm(false)} className="flex-1 btn-secondary text-sm">Cancel</button>
                <button disabled={verificationNotes.length < 10 || closeMutation.isLoading}
                  onClick={() => closeMutation.mutate()}
                  className="flex-1 btn-primary text-sm bg-green-600 hover:bg-green-700 disabled:opacity-40">
                  {closeMutation.isLoading ? 'Closing…' : 'Close Alert'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
