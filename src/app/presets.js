// Moved verbatim from prototype/apex-lab.html (migration step 2).

export const CARS={
  'Road car':      {mass:1450,cg:0.52,track:1.58,wb:2.70,rear:48,rollF:58,power:220,pt:'ICE',gears:6,v1:60,vTopG:280,nT:50,nRed:110,evBase:100,evMax:250,drive:'RWD',cla:0.10,aeroF:50,cda:0.70,brakeF:68,mu:1.00,sens:0.10,shiftT:0.2,yawDI:1.0,slipPk:8},
  'Hot hatch AWD': {mass:1520,cg:0.50,track:1.56,wb:2.62,rear:42,rollF:60,power:290,pt:'ICE',gears:7,v1:62,vTopG:290,nT:42,nRed:112,evBase:100,evMax:250,drive:'AWD',cla:0.35,aeroF:50,cda:0.72,brakeF:70,mu:1.08,sens:0.10,shiftT:0.1,yawDI:1.0,slipPk:8},
  'EV saloon':     {mass:2200,cg:0.46,track:1.65,wb:2.90,rear:51,rollF:55,power:450,pt:'EV',gears:1,v1:100,vTopG:260,nT:50,nRed:110,evBase:105,evMax:260,drive:'AWD',cla:0.15,aeroF:50,cda:0.62,brakeF:64,mu:1.05,sens:0.10,shiftT:0,yawDI:1.0,slipPk:7},
  'GT racer':      {mass:1300,cg:0.44,track:1.66,wb:2.65,rear:55,rollF:50,power:400,pt:'ICE',gears:6,v1:110,vTopG:300,nT:65,nRed:108,evBase:110,evMax:290,drive:'RWD',cla:1.80,aeroF:43,cda:0.85,brakeF:58,mu:1.38,sens:0.15,shiftT:0.08,yawDI:1.0,slipPk:6},
  'Open-wheeler':  {mass:800, cg:0.30,track:1.60,wb:3.40,rear:55,rollF:50,power:520,pt:'ICE',gears:8,v1:115,vTopG:335,nT:70,nRed:105,evBase:120,evMax:330,drive:'RWD',cla:4.50,aeroF:44,cda:1.20,brakeF:56,mu:1.60,sens:0.20,shiftT:0.04,yawDI:0.95,slipPk:5},
  'Kart':          {mass:175, cg:0.25,track:1.30,wb:2.00,rear:58,rollF:45,power:12, pt:'ICE',gears:1,v1:115,vTopG:115,nT:60,nRed:110,evBase:50,evMax:115,drive:'RWD',cla:0.00,aeroF:50,cda:0.55,brakeF:0,mu:1.25,sens:0.05,shiftT:0,yawDI:1.0,slipPk:6}
};
export const TRACKS=[{name:'Harrow Ring',seed:27},{name:'Kestrel Point',seed:11},{name:'Millbrook Park',seed:15},{name:'Saltmarsh',seed:9}];
