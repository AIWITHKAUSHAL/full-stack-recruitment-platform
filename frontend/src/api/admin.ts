import { api } from './client';
import type { AdminProfile, DashboardStats, TokenResponse } from '@/types/api';

export const adminApi = {
  login: (email: string, password: string) =>
    api.post<TokenResponse>('/admin/auth/login', { email, password }).then((r) => r.data),

  me: () => api.get<AdminProfile>('/admin/auth/me').then((r) => r.data),

  stats: () => api.get<DashboardStats>('/admin/stats').then((r) => r.data),
};
