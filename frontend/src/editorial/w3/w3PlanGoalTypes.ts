export type Intent='finish'|'faster'|'race'|'unknown'
export interface GoalBrief{name:string;date:string;duration:string;distance:string;elevation:string;intent:Intent}
export const EMPTY_BRIEF:GoalBrief={name:'',date:'',duration:'',distance:'',elevation:'',intent:'unknown'}
