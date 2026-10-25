import { Group, Mesh, BoxGeometry, CylinderGeometry, BufferGeometry, Float32BufferAttribute, Color, MeshStandardMaterial } from '../../../vendor/three-0.186.1/build/three.core.js';
import { dataToThree, yawFromHeading } from './frame.js';
import { WHEEL_SPOKES } from './wheels.js';

function wheelFace(radius){
  const position=[],color=[],index=[],light=new Color(0xc8cdd2),dark=new Color(0x25282c),n=32;
  function triangle(points,c){
    const start=position.length/3;position.push(...points);
    for(let i=0;i<3;i++)color.push(c.r,c.g,c.b);
    index.push(start,start+1,start+2);
  }
  for(let i=0;i<n;i++){
    const a=i*2*Math.PI/n,b=(i+1)*2*Math.PI/n,r=radius*0.82,h=radius*0.2;
    const ax=Math.cos(a),ay=Math.sin(a),bx=Math.cos(b),by=Math.sin(b),c=i%(n/WHEEL_SPOKES)<2?light:dark;
    triangle([0,0,0,h*ax,h*ay,0,h*bx,h*by,0],light);
    triangle([h*ax,h*ay,0,r*ax,r*ay,0,r*bx,r*by,0],c);
    triangle([h*ax,h*ay,0,r*bx,r*by,0,h*bx,h*by,0],c);
  }
  const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(position,3));
  geometry.setAttribute('color',new Float32BufferAttribute(color,3));geometry.setIndex(index);geometry.computeVertexNormals();
  return geometry;
}

// Cosmetic dimensions only. Ghosts default to a 0.44 m CG height and equal axle weights.
export function buildCarModel({wb,track,cg=0.44,rear=50},{color=0xcccccc,opacity=1}={}){
  const group=new Group();
  // Linear wb rule: 2 m kart -> 0.14 m; 2.65 m GT -> 0.33 m, capped at 0.38 m.
  const radius=Math.max(0.14,Math.min(0.38,0.14+(wb-2)*0.19/0.65));
  group.userData.radius=radius;
  const material=c=>new MeshStandardMaterial({color:c,opacity,transparent:opacity<1,flatShading:true});
  const bodyMaterial=material(color),tyreMaterial=material(0x25282c);
  const faceGeometry=wheelFace(radius),faceMaterial=material(0xffffff),blurMaterial=material(0x858b91);
  faceMaterial.vertexColors=true;
  const centre=wb*(rear/100-0.5),height=Math.min(0.3,cg);
  const body=new Mesh(new BoxGeometry(wb+0.6,height,track),bodyMaterial);
  body.name='body';body.position.set(centre,cg,0);group.add(body);
  const cabin=new Mesh(new BoxGeometry(wb*0.42,height,track*0.7),bodyMaterial);
  cabin.position.set(centre-wb*0.08,cg+height,0);group.add(cabin);
  // Cylinder's axle starts on Y; bake it onto Z so the child rotates about local Z for spin.
  const wheelGeometry=new CylinderGeometry(radius,radius,0.2,10);
  wheelGeometry.rotateX(Math.PI/2);
  for(const [name,x,z] of [
    ['wheelFL',wb*rear/100,-track/2],['wheelFR',wb*rear/100,track/2],
    ['wheelRL',-wb*(1-rear/100),-track/2],['wheelRR',-wb*(1-rear/100),track/2]
  ]){
    const pivot=new Group();pivot.name=name;pivot.position.set(x,radius,z);
    const spin=new Mesh(wheelGeometry,tyreMaterial);
    for(const [name,mat] of [['wheelFace',faceMaterial],['wheelBlur',blurMaterial]]){
      const face=new Mesh(faceGeometry,mat);face.name=name;face.position.z=Math.sign(z)*0.106;
      face.rotation.y=z<0?Math.PI:0;face.visible=name==='wheelFace';spin.add(face);
    }
    pivot.add(spin);group.add(pivot);
  }
  return group;
}

// Local +X forward, +Y up, +Z right. Positive pitch about local Z raises the nose.
export function placeCar(group,pose){
  group.position.fromArray(dataToThree(pose.x,pose.y,pose.z??0));
  group.rotation.set(0,yawFromHeading(pose.heading),pose.pitch??0,'YZX');
}

export function disposeCar(group){
  const geometries=new Set(),materials=new Set();
  group.traverse(object=>{
    if(object.geometry)geometries.add(object.geometry);
    if(object.material)for(const material of [].concat(object.material))materials.add(material);
  });
  for(const geometry of geometries)geometry.dispose();
  for(const material of materials)material.dispose();
}
