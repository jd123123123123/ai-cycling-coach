declare module '*pdf.mjs' {
 export const GlobalWorkerOptions:{workerSrc:string}
 export function getDocument(options:unknown):{promise:Promise<{numPages:number;getPage(n:number):Promise<{getTextContent():Promise<{items:Array<{str?:string;hasEOL?:boolean}>}>}>}>;destroy():Promise<void>}
}
