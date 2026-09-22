/** Smooth joins keep every control point inside adjacent sample bounds.
 * Missing measurements start a new segment; no invented bridge or zero. */
export function weekCurve(values:(number|null)[],x:(i:number)=>number,y:(v:number)=>number,edges?:{left:number;right:number}):string {
 let path='', previous:{x:number;y:number}|null=null
 values.forEach((value,i)=>{
  if(value==null||!Number.isFinite(value)){previous=null;return}
  const p={x:x(i),y:y(value)}
  if(previous){const mid=(previous.x+p.x)/2;path+=` C${mid} ${previous.y} ${mid} ${p.y} ${p.x} ${p.y}`}
  else path+=edges&&i===0?` M${edges.left} ${p.y} H${p.x}`:` M${p.x} ${p.y}`
  // Each sample represents its whole week. Continue the first and last
  // known endpoint to that week's outer edge, without moving the selection
  // markers or inventing samples in gaps or future weeks.
  if(edges&&i===values.length-1)path+=` H${edges.right}`
  previous=p
 })
 return path.trim()
}
