import { apiClient } from './client'
export interface StageCard {
  id: string; name_de: string; unlock_de: string; owned: boolean; starter: boolean
  render_status?: 'ok' | 'pending' | 'failed' | 'missing';
  image: string | null; plate_url: string | null; tier: string; selected: boolean
  unlocked_at: string | null; activity_id: number | null
  progress: { kind: string; current: number | null; target: number | null; pct: number | null } | null
}
export interface StageGallery { stages: StageCard[]; owned_count: number; total_count: number }
export const fetchStageGallery = async (): Promise<StageGallery> => (await apiClient.get('/garage/gallery')).data
export const fetchStageUpdates = async (): Promise<StageGallery> => (await apiClient.get('/garage/gallery', {params: {include_images: false}})).data
export const fetchRideStages = async (id: number): Promise<{ stages: StageCard[] }> => (await apiClient.get(`/garage/gallery/unlocked-by/${id}`)).data

export const fetchStageImage = async (id: string): Promise<string> => (await apiClient.get(`/garage/gallery/${encodeURIComponent(id)}/image`)).data.image
