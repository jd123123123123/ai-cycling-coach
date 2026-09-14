import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Gift } from 'lucide-react'
import { fetchRideStages, fetchStageImage } from '../../api/stageGallery'
import { useSelectStage } from '../../hooks/useGarage'
import { useMyReferrals } from '../../hooks/useReferrals'
import { fetchMyReferrals } from '../../api/referral'
import { SceneCollectionView } from './W3SceneCollection'
export default function W3RideStageRewards({ activityId, autoReveal = false, quiet = false }: { activityId: number; autoReveal?: boolean; quiet?: boolean }) {
  const q = useQuery({ queryKey: ['garage', 'ride-unlocks', activityId], queryFn: () => fetchRideStages(activityId), staleTime: 30000, refetchInterval: query => query.state.data?.stages.some(s => s.render_status === 'pending') ? 15000 : false })
  const select = useSelectStage(), referrals = useMyReferrals()
  const [opened, setOpened] = useState(0)
  if (!q.data?.stages.length) return null
  return <>{!quiet && <button className="w3-stage-reward-nudge" onClick={() => setOpened(v => v + 1)}><Gift size={23} /><span>Diese Fahrt bleibt.<small>{q.data.stages.length === 1 ? 'Eine neue Kulisse für dein Bike' : `${q.data.stages.length} neue Kulissen für dein Bike`}</small></span><span>Öffnen</span></button>}
    {(opened > 0 || autoReveal) && <SceneCollectionView referralCode={referrals.data?.code} loadReferralCode={async () => (await fetchMyReferrals()).code} loadOriginal={fetchStageImage} key={opened} data={{ stages: q.data.stages, owned_count: q.data.stages.length, total_count: q.data.stages.length }} bike={null} onSelect={id => select.mutateAsync(id)} selecting={select.isPending} reveal revealOnly />}
  </>
}
