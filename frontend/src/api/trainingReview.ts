import { apiClient } from './client'
export interface TrainingReview {
 adaptation?:{state:'adapted'|'unchanged'|'pending'|'protected'|'limited';reason:string;automatic:boolean}|null
 version:string; activity_id:number; headline:string; summary:string; score:number|null; score_label:string
 status:'matched'|'different'|'extra'|'unplanned'|'limited'; planned_title:string|null; actual_title:string; coverage:number|null
 stimulus:string; stimulus_detail:string
 pairs:{label:string;actual:number|null;planned:number|null;unit:string}[]
 zones:{label:string;actual_seconds:number|null;planned_seconds:number|null}[]
 trace:{at_s:number;actual_pct:number|null;planned_pct:number|null}[]
 impact:{day:number;fitness:number;fatigue:number;form:number}[];impact_basis:string|null
 changes:{date:string;before:string;after:string;reason:string}[]
 action:string; limitations:string[];method:string
}
export async function fetchTrainingReview(id:number):Promise<TrainingReview> {
 return (await apiClient.get<TrainingReview>(`/activities/${id}/training-review`)).data
}
