const MAX_BYTES=10*1024*1024,MAX_TEXT=50000
function boundedText(text:string){const normalized=text.replaceAll('\u0000','').trim();if(!normalized)throw new Error('Kein lesbarer Text gefunden. Bei Scans bitte den Text einfügen.');if(normalized.length>MAX_TEXT)throw new Error('Das Dokument ist zu lang. Bitte nur die relevanten Seiten verwenden.');return normalized}
function checkDocx(data:ArrayBuffer){
 const view=new DataView(data);let end=-1
 for(let i=data.byteLength-22;i>=Math.max(0,data.byteLength-65557);i--)if(view.getUint32(i,true)===0x06054b50){end=i;break}
 if(end<0)throw new Error('Keine lesbare DOCX-Datei. Bitte erneut als .docx exportieren.')
 const count=view.getUint16(end+10,true);let cursor=view.getUint32(end+16,true),size=0
 if(count>2000||count===65535)throw new Error('Das Word-Dokument ist zu komplex. Bitte als Text exportieren.')
 for(let i=0;i<count;i++){if(cursor+46>data.byteLength||view.getUint32(cursor,true)!==0x02014b50)throw new Error('Das Word-Dokument ist beschädigt.');size+=view.getUint32(cursor+24,true);if(size>40*1024*1024)throw new Error('Das entpackte Dokument ist zu groß. Bitte nur relevante Seiten verwenden.');cursor+=46+view.getUint16(cursor+28,true)+view.getUint16(cursor+30,true)+view.getUint16(cursor+32,true)}
}
let mammothLoading:Promise<void>|null=null
async function mammothReader(){
 if(!mammothLoading)mammothLoading=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/review-tools/node_modules/mammoth/mammoth.browser.js';script.onload=()=>resolve();script.onerror=()=>{mammothLoading=null;reject(new Error('Word-Leser konnte nicht geladen werden. Bitte Text einfügen.'))};document.head.append(script)})
 await mammothLoading
 return (window as unknown as {mammoth:{extractRawText(input:{arrayBuffer:ArrayBuffer}):Promise<{value:string}>}}).mammoth
}
export async function readGoalDocument(file:File):Promise<string>{
 if(file.size>MAX_BYTES)throw new Error('Maximal 10 MB. Bitte eine kleinere Datei auswählen.')
 if(!file.size)throw new Error('Diese Datei ist leer.')
 const ext=file.name.split('.').at(-1)?.toLowerCase()
 if(ext==='txt'||ext==='md')return boundedText(await file.text())
 if(ext==='doc')throw new Error('Bitte das Word-Dokument als .docx speichern. Das alte .doc-Format wird hier nicht gelesen.')
 const buffer=await file.arrayBuffer()
 if(ext==='docx'){checkDocx(buffer);const mammoth=await mammothReader();return boundedText((await mammoth.extractRawText({arrayBuffer:buffer})).value)}
 if(ext==='pdf'){
  const {getDocument,GlobalWorkerOptions}=await import('../../review-tools/node_modules/pdfjs-dist/build/pdf.mjs')
  const worker=await import('../../review-tools/node_modules/pdfjs-dist/build/pdf.worker.mjs?url')
  GlobalWorkerOptions.workerSrc=worker.default
  const task=getDocument({data:new Uint8Array(buffer),isEvalSupported:false,disableFontFace:true,useSystemFonts:false})
  let pdf
  try{pdf=await task.promise;if(pdf.numPages>30)throw new Error('Bitte höchstens 30 relevante PDF-Seiten verwenden.');const lines:string[]=[];for(let i=1;i<=pdf.numPages;i++){const page=await pdf.getPage(i);const content=await page.getTextContent();lines.push(`Seite ${i}\n`+content.items.map((x:{str?:string;hasEOL?:boolean})=>x.str?(x.str+(x.hasEOL?'\n':' ')):'').join(''));if(lines.join('').length>MAX_TEXT)throw new Error('Das Dokument ist zu lang. Bitte relevante Seiten auswählen.')}return boundedText(lines.join('\n').replace(/^Seite \d+\s*$/gm,''))}finally{await task.destroy()}
 }
 throw new Error('Bitte PDF, Word (.docx) oder eine Textdatei auswählen.')
}
