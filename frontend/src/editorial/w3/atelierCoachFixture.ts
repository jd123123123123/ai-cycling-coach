import type { CoachEvidence } from './atelierCoachData'
import { ATELIER_SAMPLES } from './atelierRideFixture'

// Explicit design-only example matching the API shapes. Not fetched Garmin data.
// Kept out of production routes; absent channels stay null to demonstrate honest gaps.
export const ATELIER_COACH: CoachEvidence = {
  samples:ATELIER_SAMPLES, ftpAtRide:280,
  debrief:{
    activity_id:1, generated_at:null,
    header:{title:'Dolomitenrunde',date:'2026-09-21',sport:'cycling',distance_km:138.6,elevation_m:5639,moving_time_s:17100,np_watts:241,if_:241/280,tss:352,total_kj:3640,calories:null,avg_speed_kmh:29.2},
    verdict:{grade_letter:null,grade_score:null,ai_verdict:'',ai_model:'design-fixture',went_well:[],watch_out:[]},story:null,segments:[],
    pacing:{first_half_np:247,second_half_np:235,split_pct:-4.86,variability_index:1.12,surge_count:14,phase_np:[251,242,230],final_30min_np:217,zone_time_pct:{}},
    efficiency:{efficiency_factor:241/148,avg_hr:148,decoupling_pct:4.2,np_watts:241},
    matchbook:{matches:[],match_count:8,time_above_cp_s:430,min_bal_j:5800,fully_depleted:false},
    quadrant:{q1_pct:18,q2_pct:23,q3_pct:12,q4_pct:47,force_threshold_n:250,cadence_threshold_rpm:85,sample_count:14680},
    fueling:{total_kj:3640,total_kcal:3640,cho_g_estimate:590,fat_g_estimate:142,carb_target_g_per_h:[60,90],duration_h:4.75,likely_underfueled:null,note:'Keine Zufuhr dokumentiert.'},
    climbs:[
      {start_s:0,duration_s:1610,distance_m:10000,elev_gain_m:815,avg_grade_pct:8.15,vam_m_per_h:1822,w_per_kg:3.46,avg_power:263,category:'HC'},
      {start_s:2400,duration_s:1710,distance_m:11000,elev_gain_m:920,avg_grade_pct:8.36,vam_m_per_h:1937,w_per_kg:3.58,avg_power:272,category:'HC'},
      {start_s:7500,duration_s:1950,distance_m:12000,elev_gain_m:1075,avg_grade_pct:8.96,vam_m_per_h:1985,w_per_kg:3.49,avg_power:265,category:'HC'},
      {start_s:11750,duration_s:1820,distance_m:11000,elev_gain_m:777,avg_grade_pct:7.06,vam_m_per_h:1537,w_per_kg:3.18,avg_power:242,category:'1'},
    ],
    efforts:[{duration_s:5,ride_watts:1180,best_watts:1240,pct_of_best:95.2,is_pr:false},{duration_s:60,ride_watts:598,best_watts:620,pct_of_best:96.5,is_pr:false},{duration_s:300,ride_watts:342,best_watts:335,pct_of_best:102.1,is_pr:true},{duration_s:1200,ride_watts:268,best_watts:276,pct_of_best:97.1,is_pr:false}],
    wko:null,cda:null,plan:[],
  },
  streams:{has_streams:true,sport:'cycling',avg_hr:148,max_hr:182,avg_cadence:81,avg_power:215,
    bike_dynamics:{balance_left_pct:49,balance_right_pct:51,pco_left_mm:null,pco_right_mm:null,power_phase_left:null,power_phase_right:null,
      stamina_start_pct:98,stamina_end_pct:24,stamina_min_pct:18,stamina_curve:[98,95,91,92,85,80,83,76,68,70,63,56,58,48,42,46,35,29,32,23,18,24],performance_condition:2}},
}
