/** Smooth joins keep every control point inside adjacent sample bounds.
 * Missing measurements start a new segment; no invented bridge or zero. */
export function weekCurve(values:(number|null)[],x:(i:number)=>number,y:(v:number)=>number):string {
 let path='', previous:{x:number;y:number}|null=null
 values.forEach((value,i)=>{
  if(value==null||!Number.isFinite(value)){previous=null;return}
  const p={x:x(i),y:y(value)}
  if(previous){const mid=(previous.x+p.x)/2;path+=` C${mid} ${previous.y} ${mid} ${p.y} ${p.x} ${p.y}`}
  else path+=` M${p.x} ${p.y}`
  previous=p
 })
 return path.trim()
}
