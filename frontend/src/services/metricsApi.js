import api from './api';

export const getMetricsSummary = async () => {
  const response = await api.get('/v1/metrics/summary');
  return response.data;
};

export const getDriftAlerts = async () => {
  const response = await api.get('/v1/metrics/drift-alerts');
  return response.data;
};
