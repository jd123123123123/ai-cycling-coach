import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import W3TrainingReview, {reviewBlocks} from '../W3TrainingReview'
import type { TrainingReview } from '../../../api/trainingReview'

afterEach(cleanup)
const review:TrainingReview={version:'1',activity_id:1,headline:'Deinen Reiz getroffen.',summary:'Passt zur Empfehlung.',score:100,score_label:'Planpassung',status:'matched',planned_title:'VO₂',actual_title:'Fahrt',coverage:1,stimulus:'VO₂-Bereich',stimulus_detail:'12 Minuten im VO₂-Leistungsbereich.',pairs:[{label:'Belastung',actual:40,planned:40,unit:'TSS'}],zones:[],trace:[],impact:[{day:0,fitness:1,fatigue:6,form:-5},{day:1,fitness:.98,fatigue:5.14,form:-4.16}],impact_basis:'Abweichung vom Plan.',changes:[],action:'Jetzt erholen.',limitations:[],method:'Produktheuristik.'}

describe('Training review',()=>{
 it('lets the rider inspect day-specific impact without hiding the action',()=>{
  render(<W3TrainingReview review={review}/>);
  expect(screen.getByText('Modellierte Planabweichung').closest('details')?.open).toBe(false)
  fireEvent.click(screen.getByText('Modellierte Planabweichung'))
  expect(screen.getByText('-5')).toBeTruthy()
  fireEvent.click(screen.getByRole('button',{name:'+1'}))
  expect(screen.getByText('-4,2')).toBeTruthy()
  expect(screen.getByText('1 Tag danach')).toBeTruthy()
  expect(screen.getByText('Jetzt erholen.')).toBeTruthy()
 })
 it('keeps absent evidence absent and opens the real plan action',()=>{
  let opened=false
  render(<W3TrainingReview review={{...review,score:null,coverage:null,impact:[]}} onOpenPlan={()=>{opened=true}}/>);
  expect(screen.queryByText(/100 ·/)).toBeNull()
  expect(screen.queryByLabelText('Tag der Belastungsprognose')).toBeNull()
  expect(screen.getByText('Keine dieser Fahrt zugeordnete Planänderung gespeichert.')).toBeTruthy()
  fireEvent.click(screen.getByRole('button',{name:'Trainingsplan öffnen'}))
  expect(opened).toBe(true)
 })
 it('shows attributed before and after changes with explanation on demand',()=>{
  render(<W3TrainingReview review={{...review,changes:[{date:'2026-09-10',before:'Schwelle',after:'Erholung',reason:'Zusätzliche Belastung'}]}}/>);
  expect(screen.getByText('Schwelle')).toBeTruthy()
  expect(screen.getByText('Erholung')).toBeTruthy()
  expect(screen.getByText('Warum?').closest('details')?.open).toBe(false)
 })
})

describe('Interactive training graphics',()=>{
 const detailed:TrainingReview={...review,
  pairs:[{label:'Dauer',actual:45,planned:45,unit:'min'},...review.pairs],
  trace:[{at_s:0,actual_pct:50,planned_pct:55},{at_s:60,actual_pct:114,planned_pct:115},{at_s:120,actual_pct:0,planned_pct:50}],
  zones:[{label:'Erholung',actual_seconds:600,planned_seconds:720},{label:'VO₂-Bereich',actual_seconds:720,planned_seconds:900}],
 }
 it('switches between the recorded course and dose comparison, then selects a zone',async()=>{
  render(<W3TrainingReview review={detailed}/>);
  const traceTab=screen.getByRole('button',{name:'Verlauf'});
  const zoneTab=screen.getByRole('button',{name:'Leistungsbereiche'});
  expect(traceTab.getAttribute('aria-pressed')).toBe('true');
  expect(screen.getByRole('img',{name:/Gefahrene Leistung über die Zeit/})).toBeTruthy();
  fireEvent.click(zoneTab);
  await waitFor(()=>expect(screen.getByRole('button',{name:/VO₂-Bereich.*12.*15/})).toBeTruthy());
  expect(zoneTab.getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(screen.getByRole('button',{name:/VO₂-Bereich.*12.*15/}));
  expect(screen.getByText('12 min gefahren · 15 min empfohlen')).toBeTruthy();
  expect(screen.getByRole('button',{name:/VO₂-Bereich.*12.*15/}).getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(traceTab);
  await waitFor(()=>expect(screen.getByRole('slider',{name:'Abschnitt der Fahrt auswählen'})).toBeTruthy());
 });
 it('exposes exact selected trace values through the keyboard-accessible scrubber',()=>{
  render(<W3TrainingReview review={detailed}/>);
  const slider=screen.getByRole('slider',{name:'Abschnitt der Fahrt auswählen'});
  fireEvent.change(slider,{target:{value:'1'}});
  expect(slider.getAttribute('aria-valuetext')).toBe('1:00, gefahren 114 Prozent FTP, empfohlen 115 Prozent FTP');
  expect(screen.getByText('1:00')).toBeTruthy();
  fireEvent.change(slider,{target:{value:'2'}});
  expect(slider.getAttribute('aria-valuetext')).toContain('gefahren 0 Prozent FTP');
 });
 it('switches metric and day while preserving their independent selections',()=>{
  render(<W3TrainingReview review={detailed}/>);
  fireEvent.click(screen.getByText('Modellierte Planabweichung'));
  const fitness=screen.getByRole('button',{name:/Fitness/});
  fireEvent.click(fitness);
  expect(fitness.getAttribute('aria-pressed')).toBe('true');
  expect(screen.getByRole('img',{name:/Modellierte Fitnessabweichung/})).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'+1'}));
  expect(screen.getByRole('button',{name:'+1'}).getAttribute('aria-pressed')).toBe('true');
  expect(screen.getByRole('button',{name:/Fitness/}).getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(screen.getByRole('button',{name:/Ermüdung/}));
  expect(screen.getByRole('img',{name:/Modellierte Ermüdungabweichung/})).toBeTruthy();
  expect(screen.getByText('+5,1')).toBeTruthy();
  expect(screen.getByRole('button',{name:'+1'}).getAttribute('aria-pressed')).toBe('true');
 });
 it('collapses zero model deviation into a concise on-plan indicator',()=>{
  render(<W3TrainingReview review={{...review,impact:review.impact.map(p=>({...p,fitness:0,fatigue:0,form:0}))}}/>);
  expect(screen.getByText('Belastung wie geplant')).toBeTruthy();
  expect(screen.queryByLabelText('Tag der Belastungsprognose')).toBeNull();
  expect(screen.queryByRole('img',{name:/Modellierte/})).toBeNull();
 });
});

describe('Automatic week decisions',()=>{
 it.each(['adapted','unchanged','protected'] as const)('shows persisted %s as already processed, with no manual apply action',(state)=>{
  const reason=state==='protected'?'Deine selbst gewählten Einheiten bleiben geschützt.':state==='unchanged'?'Die verbleibende Woche passt weiterhin.':'Die zusätzliche Belastung ist ausgeglichen.';
  render(<W3TrainingReview review={{...review,adaptation:{state,reason,automatic:true}}}/>);
  expect(screen.getByText(reason)).toBeTruthy();
  expect(screen.getByText('Automatisch berücksichtigt')).toBeTruthy();
  expect(screen.queryByText(/Bereits im Plan übernommen/)).toBeNull();
  expect(screen.queryByRole('button',{name:/anwenden|übernehmen|bestätigen/i})).toBeNull();
 });
 it.each(['pending','limited'] as const)('does not present %s evidence as an applied plan',(state)=>{
  render(<W3TrainingReview review={{...review,adaptation:{state,reason:'Prüfung noch nicht abgeschlossen.',automatic:false}}}/>);
  expect(screen.getByText(state==='pending'?'Auswertung ausstehend':'Datengrundlage begrenzt')).toBeTruthy();
  expect(screen.queryByText('Automatisch berücksichtigt')).toBeNull();
 });
});


describe('Duration-proportional power blocks',()=>{
 it('groups real adjacent zone samples onto the recommendation FTP scale',()=>{
  const blocks=reviewBlocks([{at_s:0,actual_pct:50,planned_pct:55},{at_s:60,actual_pct:54,planned_pct:55},{at_s:120,actual_pct:115,planned_pct:115}], 'actual_pct',3);
  expect(blocks).toHaveLength(2);
  expect(blocks[0].w).toBe(52/125);
  expect(blocks[0].work).toBe(false);
  expect(blocks[1].w).toBe(115/125);
  expect(blocks[1].work).toBe(true);
  expect(blocks[0].label).toContain('0:00–2:00');
 });
 it('switches the time-proportional beams between actual and prescribed data',()=>{
  const r={...review,trace:[{at_s:0,actual_pct:65,planned_pct:115}],pairs:[{label:'Dauer',actual:30,planned:30,unit:'min'}]};
  render(<W3TrainingReview review={r}/>);
  expect(screen.getByRole('img',{name:/Gefahrene Leistung über die Zeit/})).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Empfohlen'}));
  expect(screen.getByRole('img',{name:/Empfohlene Leistung über die Zeit/})).toBeTruthy();
  expect(screen.getByRole('button',{name:'Empfohlen'}).getAttribute('aria-pressed')).toBe('true');
 });
 it('leads with observed stimulus and shows score as plan agreement',()=>{
  render(<W3TrainingReview review={{...review,zones:[{label:'VO₂-Bereich',actual_seconds:720,planned_seconds:720}]}}/>);
  expect(screen.getByRole('heading',{name:'Schwerpunkt VO₂-Bereich.'})).toBeTruthy();
  expect(screen.getByText('12 min')).toBeTruthy();
  expect(screen.getByRole('img',{name:'100 von 100 Planpassung'})).toBeTruthy();
 });
});


describe('Unplanned and historical reviews',()=>{
 it('leads with the longest actual power band rather than the highest stimulus',()=>{
  render(<W3TrainingReview review={{...review,zones:[{label:'Ausdauer',actual_seconds:2400,planned_seconds:2000},{label:'VO₂-Bereich',actual_seconds:720,planned_seconds:720}]}}/>);
  expect(screen.getByRole('heading',{name:'Schwerpunkt Ausdauer.'})).toBeTruthy();
  expect(screen.getByText('40 min')).toBeTruthy();
  expect(screen.getByText('im längsten gefahrenen Leistungsbereich')).toBeTruthy();
  expect(screen.queryByRole('heading',{name:/VO₂-Reiz gesetzt/})).toBeNull();
  expect(screen.getByText('12 Minuten im VO₂-Leistungsbereich.').closest('details')?.open).toBe(false);
 });
 it('does not show a comparison or score without a stored recommendation',()=>{
  render(<W3TrainingReview review={{...review,planned_title:null,status:'unplanned',trace:[{at_s:0,actual_pct:65,planned_pct:115}],pairs:[{label:'Dauer',actual:30,planned:30,unit:'min'},...review.pairs],zones:[{label:'Ausdauer',actual_seconds:1200,planned_seconds:1500}]}}/>);
  expect(screen.getByText('Keine gespeicherte Empfehlung für diese Fahrt')).toBeTruthy();
  expect(screen.queryByRole('button',{name:'Empfohlen'})).toBeNull();
  expect(screen.queryByRole('img',{name:/Planpassung/})).toBeNull();
  expect(screen.queryByText('Modellierte Planabweichung')).toBeNull();
  expect(screen.getByText('40')).toBeTruthy();
  expect(screen.getByText('30')).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Leistungsbereiche'}));
  expect(screen.getByRole('button',{name:'Ausdauer: 20 min gefahren'})).toBeTruthy();
  expect(screen.queryByText(/Markierung: empfohlen/)).toBeNull();
 });
 it('requires comparison evidence even if a plan title exists',()=>{
  render(<W3TrainingReview review={{...review,score:null,pairs:[{label:'Belastung',actual:40,planned:null,unit:'TSS'}]}}/>);
  expect(screen.getByText('Empfehlung gespeichert · Vergleich noch nicht gesichert')).toBeTruthy();
  expect(screen.queryByText('Offen')).toBeNull();
 });
 it('does not turn an old ride into recovery advice or a claim about the current week',()=>{
  render(<W3TrainingReview rideDate="2000-01-02T12:00:00Z" review={{...review,adaptation:{state:'unchanged',automatic:true,reason:'Die verbleibende Woche passt weiterhin.'}}} onOpenPlan={()=>{}}/>);
  expect(screen.getByRole('heading',{name:'Planprüfung zu dieser Fahrt'})).toBeTruthy();
  expect(screen.getByText('Passung zur damaligen Empfehlung')).toBeTruthy();
  expect(screen.getByText('In der damaligen Planung berücksichtigt')).toBeTruthy();
  expect(screen.queryByText('Jetzt erholen.')).toBeNull();
  expect(screen.queryByText('Die verbleibende Woche passt weiterhin.')).toBeNull();
  expect(screen.getByRole('button',{name:'Trainingsplan öffnen'}).textContent).toContain('Aktuellen Trainingsplan ansehen');
 });
 it('retains present-day recorded adaptations with one status statement',()=>{
  const reason='Die zusätzliche Belastung ist ausgeglichen.';
  render(<W3TrainingReview rideDate={new Date().toISOString()} review={{...review,adaptation:{state:'adapted',automatic:true,reason}}}/>);
  expect(screen.getByText(reason)).toBeTruthy();
  expect(screen.getAllByText('Automatisch berücksichtigt')).toHaveLength(1);
  expect(screen.queryByText('Automatisch berücksichtigt. Du musst nichts verschieben.')).toBeNull();
 });
 it('weights means by sample duration and retains unmeasured gaps',()=>{
  const blocks=reviewBlocks([{at_s:0,actual_pct:50,planned_pct:null},{at_s:30,actual_pct:54,planned_pct:null},{at_s:120,actual_pct:115,planned_pct:null}], 'actual_pct',3);
  expect(blocks[0].value).toBe(53);
  expect(blocks[0].duration).toBe(120);
  expect(blocks[1].duration).toBe(60);
  const gaps=reviewBlocks([{at_s:0,actual_pct:50,planned_pct:null},{at_s:120,actual_pct:null,planned_pct:null},{at_s:180,actual_pct:115,planned_pct:null}], 'actual_pct',4);
  expect(gaps).toHaveLength(2);
  expect(gaps[1].start).toBe(180);
  render(<W3TrainingReview review={{...review,trace:[{at_s:0,actual_pct:50,planned_pct:null},{at_s:120,actual_pct:null,planned_pct:null},{at_s:180,actual_pct:115,planned_pct:null}],pairs:[{label:'Dauer',actual:4,planned:4,unit:'min'}]}}/>);
  expect(screen.getByTitle('0:00–2:00 · Ø 50 % FTP').style.width).toBe('50%');
  const final=screen.getByTitle('3:00–4:00 · Ø 115 % FTP');
  expect(final.style.width).toBe('25%');
  expect(final.style.left).toBe('75%');
 });
});


describe('Stored but incomparable recommendation',()=>{
 it('distinguishes a saved recommendation from missing comparison evidence',()=>{
  render(<W3TrainingReview review={{...review,planned_title:'Krafttraining',score:null,pairs:[],zones:[],trace:[],impact:[]}}/>);
  expect(screen.getByText('Empfehlung gespeichert · Vergleich noch nicht gesichert')).toBeTruthy();
  expect(screen.queryByText('Keine gespeicherte Empfehlung für diese Fahrt')).toBeNull();
  expect(screen.queryByRole('button',{name:'Empfohlen'})).toBeNull();
 });
});
