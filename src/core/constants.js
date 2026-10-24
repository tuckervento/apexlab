// Moved verbatim from prototype/apex-lab.html (migration step 2).

export const G=9.81,RHO=1.225,FZ0=3500,VSTEP=0.5,VMAX=110,NT=Math.round(VMAX/VSTEP)+1,ETA=0.9,CRR=0.012,NQ=33;
export const NL=17,NSTEP=0.125; // load-factor grid for hilly circuits (car.load): n = l·NSTEP, l < NL, so n = 1 is a node
