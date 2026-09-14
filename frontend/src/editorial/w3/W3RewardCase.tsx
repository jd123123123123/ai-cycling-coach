import { motion, useMotionValue, useReducedMotion, useSpring } from 'motion/react'
import RidrMark from '../../components/RidrMark'

/** Real rendered case; Motion adds physical response without a 3D runtime. */
export default function W3RewardCase({ opening, onOpen }: { opening: boolean; onOpen: () => void }) {
  const reduced = useReducedMotion()
  const px = useMotionValue(0), py = useMotionValue(0)
  const rotateX = useSpring(px, { stiffness: 150, damping: 20 }), rotateY = useSpring(py, { stiffness: 150, damping: 20 })
  return <motion.button className="w3-rendered-case" onClick={onOpen} disabled={opening} aria-label="Kulisse enthüllen"
    onPointerMove={e => { if (reduced || opening || e.pointerType !== 'mouse') return; const box=e.currentTarget.getBoundingClientRect(); py.set((e.clientX-box.left-box.width/2)/box.width*10); px.set(-(e.clientY-box.top-box.height/2)/box.height*8) }}
    onPointerLeave={()=>{px.set(0);py.set(0)}}
    style={{rotateX,rotateY,transformPerspective:850}}
    whileTap={reduced || opening ? undefined : {scale:.96}}
  >
    <motion.div className="w3-rendered-case-object"
      animate={opening && !reduced ? {y:[0,0,-1,1,-2,2,0,0,-3],rotateZ:[0,0,-.8,.8,-1.3,1.3,0,0,0],scale:[1,1,1,1,1,1,1,1,1.015],opacity:[1,1,1,1,1,1,1,1,0]} : {y:0,rotateZ:0,scale:1,opacity:1}}
      transition={opening ? {duration:3.6,times:[0,.25,.32,.39,.46,.53,.62,.92,1],ease:'easeInOut'} : {type:'spring',stiffness:180,damping:20}}
    >
      <img className="w3-case-render w3-case-body" src="/w3/rewards/collector-case.webp" alt="" draggable={false}/>
      <motion.i className="w3-case-interior" aria-hidden animate={opening && !reduced ? {opacity:[0,0,.7,1,0],scaleY:[0,0,.5,1,1]}:{opacity:0,scaleY:0}} transition={{duration:3.6,times:[0,.55,.7,.92,1]}}/>
      <motion.img className="w3-case-render w3-case-lid-attached" src="/w3/rewards/collector-case.webp" alt="" draggable={false}
        animate={opening && !reduced ? {y:[0,0,-5,-26,-29],rotateZ:[0,0,-.2,-1.5,-1.5],rotateX:[0,0,0,0,0]}:{y:0,rotateZ:0,rotateX:0}}
        transition={{duration:3.6,times:[0,.55,.7,.88,1],ease:[.22,.7,.25,1]}}/>
      
      <span className="w3-case-mark"><RidrMark size={67} color="#C6F53C"/></span>
      <svg className="w3-case-seam-exact" viewBox="0 0 800 754" aria-hidden>
        <path d="M25 231 Q34 240 65 242 L96 240 M181 244 L518 264 M593 270 Q647 278 678 274 Q691 273 702 264 L752 226" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
      </svg>
      <i className="w3-case-reflection" aria-hidden />
    </motion.div>
    <motion.i className="w3-case-ground-shadow" aria-hidden animate={opening ? {scale:[1,1,.7,1.5],opacity:[.6,.6,.3,0]}:{scale:1,opacity:.6}} transition={{duration:3.6}}/>
  </motion.button>
}
