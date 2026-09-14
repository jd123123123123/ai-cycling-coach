import {apiClient} from './client'
export type GoalFocus='auto'|'endurance'|'threshold'|'vo2'
export type TrainingDay='mon'|'tue'|'wed'|'thu'|'fri'|'sat'|'sun'
export interface PlanGoalInput {focus:GoalFocus;focuses?:Exclude<GoalFocus,'auto'>[];target_date?:string|null;duration_hours?:number;distance_km?:number;ascent_m?:number;intent:'finish'|'faster'|'race';name?:string;weekly_hours:number;days_available:TrainingDay[]}
export interface PlanGoalPreview {goal:PlanGoalInput;focus:Exclude<GoalFocus,'auto'>;focus_label:string;rationale:string;event_duration_hours:number|null;duration_estimated:boolean;long_ride_target_minutes:number;weeks_remaining:number;climbing:boolean;block_end_date?:string;has_event?:boolean}
export const previewPlanGoal=async(input:PlanGoalInput)=>(await apiClient.post<PlanGoalPreview>('/plan/goal/preview',input)).data
export const applyPlanGoal=async(input:PlanGoalInput)=>(await apiClient.post('/plan/goal/apply',input,{timeout:90000})).data
