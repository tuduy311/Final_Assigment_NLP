import React, { useEffect, useState } from 'react';
import { getMetricsSummary, getDriftAlerts } from '../services/metricsApi';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend
} from 'recharts';
import { AlertTriangle, Activity, Clock, Mic2, Users, VolumeX, Edit3, AlignLeft } from 'lucide-react';

const Dashboard = () => {
  const [summary, setSummary] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const sumRes = await getMetricsSummary();
        const alertRes = await getDriftAlerts();
        setSummary(sumRes);
        setAlerts(alertRes.alerts);
      } catch (err) {
        console.error("Failed to load metrics", err);
      } finally {
        setLoading(false);
      }
    };
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 30000); // refresh every 30s
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return <div className="flex justify-center items-center h-full text-gray-500">Loading Dashboard Data...</div>;
  }

  // Filter Data by Mode
  const asrHistory = summary?.recent_history?.filter(item => item.mode === 'full_transcribe').reverse() || [];
  const diarizeHistory = summary?.recent_history?.filter(item => item.mode === 'speaker_aware').reverse() || [];
  const correctionHistory = summary?.recent_history?.filter(item => item.mode === 'user_correction').reverse() || [];

  // Map data for charts
  const asrChartData = asrHistory.map(item => ({
    time: new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    rtf: item.rtf || 0,
    confidence: item.asr?.confidence !== undefined && item.asr?.confidence !== null ? Math.exp(item.asr.confidence) * 100 : null,
    noSpeech: item.asr?.no_speech_prob !== undefined && item.asr?.no_speech_prob !== null ? item.asr.no_speech_prob * 100 : null,
  }));

  const diarizeChartData = diarizeHistory.map(item => ({
    time: new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    rtf: item.rtf || 0,
    speakerCount: item.diarization?.speaker_count || 0,
    overlap: item.diarization?.overlap_ratio ? item.diarization.overlap_ratio * 100 : 0,
    shortSegments: item.diarization?.short_segment_rate ? item.diarization.short_segment_rate * 100 : 0,
    avgSegmentDuration: item.diarization?.avg_segment_duration || 0,
    switchFreq: item.diarization?.speaker_switch_frequency || 0,
  }));

  const werChartData = correctionHistory.map(item => ({
    time: new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    wer: item.extra?.word_error_rate ? item.extra.word_error_rate * 100 : 0
  }));

  // Aggregates
  const avgAsrRtf = asrHistory.length > 0 ? (asrHistory.reduce((acc, curr) => acc + (curr.rtf || 0), 0) / asrHistory.length).toFixed(3) : 0;
  const avgNoSpeech = asrHistory.length > 0 ? (asrHistory.reduce((acc, curr) => acc + (curr.asr?.no_speech_prob || 0), 0) / asrHistory.length * 100).toFixed(1) : 0;
  
  const avgDiarizeRtf = diarizeHistory.length > 0 ? (diarizeHistory.reduce((acc, curr) => acc + (curr.rtf || 0), 0) / diarizeHistory.length).toFixed(3) : 0;
  const avgOverlap = diarizeHistory.length > 0 ? (diarizeHistory.reduce((acc, curr) => acc + (curr.diarization?.overlap_ratio || 0), 0) / diarizeHistory.length * 100).toFixed(1) : 0;
  const avgSegmentDur = diarizeHistory.length > 0 ? (diarizeHistory.reduce((acc, curr) => acc + (curr.diarization?.avg_segment_duration || 0), 0) / diarizeHistory.length).toFixed(1) : 0;
  const avgSwitchFreq = diarizeHistory.length > 0 ? (diarizeHistory.reduce((acc, curr) => acc + (curr.diarization?.speaker_switch_frequency || 0), 0) / diarizeHistory.length).toFixed(1) : 0;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 w-full mx-auto space-y-8 animate-fade-in flex-1">
      {/* Header */}
      <div className="flex justify-between items-center pb-4 border-b border-gray-100">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">MLOps Monitoring Dashboard</h2>
          <p className="text-gray-500 mt-1">Comprehensive system performance and drift tracking</p>
        </div>
        <div className="flex items-center gap-2 bg-blue-50 text-blue-700 px-4 py-2 rounded-full font-medium shadow-sm border border-blue-100">
          <Activity className="w-4 h-4" />
          <span>{summary?.total_requests || 0} Total Requests</span>
        </div>
      </div>

      {/* 1. ASR Section */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
            <Mic2 className="text-blue-500 w-5 h-5" />
            <h3 className="text-lg font-bold text-gray-800">Transcription (ASR) Metrics</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
                <div>
                    <h3 className="font-semibold text-xs text-gray-500 uppercase tracking-wider mb-1">Avg ASR RTF</h3>
                    <p className="text-2xl font-bold text-gray-900">{avgAsrRtf} <span className="text-sm font-normal text-gray-400">x</span></p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg"><Clock className="w-5 h-5 text-gray-600" /></div>
            </div>
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
                <div>
                    <h3 className="font-semibold text-xs text-green-600 uppercase tracking-wider mb-1">Confidence (Concept Drift)</h3>
                    <p className="text-2xl font-bold text-gray-900">{(summary?.avg_confidence !== undefined && summary?.avg_confidence !== null ? Math.exp(summary.avg_confidence) * 100 : 0).toFixed(1)}<span className="text-sm font-normal text-gray-400">%</span></p>
                </div>
                <div className="p-3 bg-green-50 rounded-lg"><Activity className="w-5 h-5 text-green-600" /></div>
            </div>
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
                <div>
                    <h3 className="font-semibold text-xs text-yellow-600 uppercase tracking-wider mb-1">No Speech (Noise)</h3>
                    <p className="text-2xl font-bold text-gray-900">{avgNoSpeech}<span className="text-sm font-normal text-gray-400">%</span></p>
                </div>
                <div className="p-3 bg-yellow-50 rounded-lg"><VolumeX className="w-5 h-5 text-yellow-600" /></div>
            </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
            <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                <h3 className="text-sm font-bold text-gray-800 mb-4 uppercase tracking-wide">ASR Confidence & Noise</h3>
                <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={asrChartData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                        <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} />
                        <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} />
                        <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #E5E7EB', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                        <Legend />
                        <Line type="monotone" name="Confidence (%)" dataKey="confidence" stroke="#10B981" strokeWidth={2} dot={{ r: 3 }} connectNulls={true} />
                        <Line type="monotone" name="No Speech Prob (%)" dataKey="noSpeech" stroke="#F59E0B" strokeWidth={2} dot={{ r: 3 }} connectNulls={true} />
                    </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                <h3 className="text-sm font-bold text-gray-800 mb-4 uppercase tracking-wide">ASR RTF Trend</h3>
                <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={asrChartData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                        <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} />
                        <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #E5E7EB', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                        <Line type="monotone" name="RTF" dataKey="rtf" stroke="#3B82F6" strokeWidth={3} dot={{ r: 4 }} connectNulls={true} />
                    </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
      </section>

      {/* 2. Diarization Section */}
      <section className="space-y-4 pt-6 border-t border-gray-100">
        <div className="flex items-center gap-2">
            <Users className="text-purple-500 w-5 h-5" />
            <h3 className="text-lg font-bold text-gray-800">Diarization Metrics</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
                <div>
                    <h3 className="font-semibold text-xs text-gray-500 uppercase tracking-wider mb-1">Avg Diarize RTF</h3>
                    <p className="text-2xl font-bold text-gray-900">{avgDiarizeRtf} <span className="text-sm font-normal text-gray-400">x</span></p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg"><Clock className="w-5 h-5 text-gray-600" /></div>
            </div>
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
                <div>
                    <h3 className="font-semibold text-xs text-purple-600 uppercase tracking-wider mb-1">Last Speaker Count</h3>
                    <p className="text-2xl font-bold text-gray-900">{diarizeHistory[diarizeHistory.length - 1]?.diarization?.speaker_count || 0}</p>
                </div>
                <div className="p-3 bg-purple-50 rounded-lg"><Users className="w-5 h-5 text-purple-600" /></div>
            </div>
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
                <div>
                    <h3 className="font-semibold text-xs text-orange-500 uppercase tracking-wider mb-1">Avg Overlap Ratio</h3>
                    <p className="text-2xl font-bold text-gray-900">{avgOverlap}<span className="text-sm font-normal text-gray-400">%</span></p>
                </div>
                <div className="p-3 bg-orange-50 rounded-lg"><AlignLeft className="w-5 h-5 text-orange-500" /></div>
            </div>
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
                <div>
                    <h3 className="font-semibold text-xs text-blue-500 uppercase tracking-wider mb-1">Avg Segment Dur</h3>
                    <p className="text-2xl font-bold text-gray-900">{avgSegmentDur}<span className="text-sm font-normal text-gray-400">s</span></p>
                </div>
                <div className="p-3 bg-blue-50 rounded-lg"><Clock className="w-5 h-5 text-blue-500" /></div>
            </div>
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
                <div>
                    <h3 className="font-semibold text-xs text-rose-500 uppercase tracking-wider mb-1">Switch Freq</h3>
                    <p className="text-2xl font-bold text-gray-900">{avgSwitchFreq}<span className="text-sm font-normal text-gray-400">/min</span></p>
                </div>
                <div className="p-3 bg-rose-50 rounded-lg"><Activity className="w-5 h-5 text-rose-500" /></div>
            </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-2">
            <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                <h3 className="text-sm font-bold text-gray-800 mb-4 uppercase tracking-wide">Overlap & Short Segments (%)</h3>
                <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={diarizeChartData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                        <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} />
                        <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} />
                        <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #E5E7EB', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                        <Legend />
                        <Line type="monotone" name="Overlap Ratio" dataKey="overlap" stroke="#F97316" strokeWidth={2} dot={{ r: 3 }} connectNulls={true} />
                        <Line type="monotone" name="Short Segment Rate" dataKey="shortSegments" stroke="#8B5CF6" strokeWidth={2} dot={{ r: 3 }} connectNulls={true} />
                    </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                <h3 className="text-sm font-bold text-gray-800 mb-4 uppercase tracking-wide">Speaker Count Trend</h3>
                <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={diarizeChartData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                        <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} />
                        <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} />
                        <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #E5E7EB', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                        <Bar dataKey="speakerCount" name="Speakers" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                <h3 className="text-sm font-bold text-gray-800 mb-4 uppercase tracking-wide">Segment & Switch Trend</h3>
                <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={diarizeChartData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                        <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} />
                        <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} />
                        <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} />
                        <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #E5E7EB', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                        <Legend />
                        <Line yAxisId="left" type="monotone" name="Avg Seg Dur (s)" dataKey="avgSegmentDuration" stroke="#3B82F6" strokeWidth={2} dot={{ r: 3 }} connectNulls={true} />
                        <Line yAxisId="right" type="monotone" name="Switch Freq (/min)" dataKey="switchFreq" stroke="#F43F5E" strokeWidth={2} dot={{ r: 3 }} connectNulls={true} />
                    </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
      </section>

      {/* 3. Label Drift Section */}
      <section className="space-y-4 pt-6 border-t border-gray-100">
        <div className="flex items-center gap-2">
            <Edit3 className="text-teal-500 w-5 h-5" />
            <h3 className="text-lg font-bold text-gray-800">Label Drift (User Corrections)</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
                <div>
                    <h3 className="font-semibold text-xs text-teal-600 uppercase tracking-wider mb-1">Avg Word Error Rate (WER)</h3>
                    <p className="text-2xl font-bold text-gray-900">{((summary?.avg_wer || 0) * 100).toFixed(1)}<span className="text-sm font-normal text-gray-400">%</span></p>
                </div>
                <div className="p-3 bg-teal-50 rounded-lg"><Edit3 className="w-5 h-5 text-teal-600" /></div>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm h-32 flex flex-col justify-center">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={werChartData}>
                        <YAxis hide domain={[0, 100]} />
                        <Tooltip contentStyle={{ borderRadius: '8px' }} />
                        <Line type="monotone" name="WER (%)" dataKey="wer" stroke="#14B8A6" strokeWidth={3} dot={{ r: 4 }} connectNulls={true} />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
      </section>

      {/* Alerts Table */}
      <div className="mt-8 border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="bg-gray-50 px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="text-red-500 w-5 h-5" />
            <h3 className="text-lg font-bold text-gray-800">Recent Drift & Degradation Alerts</h3>
          </div>
          <span className="px-3 py-1 bg-red-100 text-red-700 font-bold rounded-full text-xs">{alerts.length} Active Alerts</span>
        </div>
        {alerts.length === 0 ? (
          <div className="text-center py-8 text-gray-500 bg-white">
            No active alerts. System is stable.
          </div>
        ) : (
          <div className="overflow-x-auto bg-white max-h-96 overflow-y-auto">
            <table className="w-full text-left border-collapse relative">
              <thead className="sticky top-0 bg-white shadow-sm">
                <tr className="text-gray-500 text-xs uppercase tracking-wider border-b border-gray-200">
                  <th className="p-4 font-medium">Timestamp</th>
                  <th className="p-4 font-medium">Mode</th>
                  <th className="p-4 font-medium">Flag Reasons</th>
                  <th className="p-4 font-medium">RTF</th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y divide-gray-100">
                {alerts.map((alert, idx) => (
                  <tr key={idx} className="hover:bg-gray-50 transition-colors">
                    <td className="p-4 text-gray-600 font-medium whitespace-nowrap">{new Date(alert.timestamp).toLocaleString()}</td>
                    <td className="p-4">
                      <span className="px-2.5 py-1 bg-gray-100 text-gray-700 rounded-md text-xs font-semibold">{alert.mode}</span>
                    </td>
                    <td className="p-4">
                      <div className="flex flex-wrap gap-2">
                        {alert.flag_reasons.map((r, i) => (
                          <span key={i} className="px-2.5 py-1 bg-red-50 text-red-700 rounded-md text-xs font-semibold border border-red-100">{r}</span>
                        ))}
                      </div>
                    </td>
                    <td className="p-4 text-gray-600 font-medium whitespace-nowrap">{alert.rtf ? alert.rtf.toFixed(3) : 'N/A'} x</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
