// Breadth-first path over a map's wall lines, with its nearest approach to a box (used for the ent spawn in
// desertland). The cases are hard-coded: edit them.
// Diagnostic script (not part of the bot). Game data: pass the path of a saved https://adventure.land/data.js
// as the first argument, or set AL_DATA. See tools/README.md.
const DATA = process.argv[2] || process.env.AL_DATA;
if (!DATA) { console.error("usage: node " + require("path").basename(__filename) + " <path to data.js>"); process.exit(2); }
const fs=require("fs");let t=fs.readFileSync(DATA,"utf8").trim().replace(/^var G=/,"").replace(/;\s*$/,"");const G=JSON.parse(t);
function grid_path(map,x1,y1,x2,y2,S=16){const g=G.geometry[map];
 const bl=(ax,ay,bx,by)=>{ if(ax!==bx){const a=Math.min(ax,bx),b=Math.max(ax,bx);for(const l of g.x_lines){ if(l[0]<a) continue; if(l[0]>b) break; if(ay>=l[1]&&ay<=l[2]) return true;}} if(ay!==by){const a=Math.min(ay,by),b=Math.max(ay,by);for(const l of g.y_lines){ if(l[0]<a) continue; if(l[0]>b) break; if(bx>=l[1]&&bx<=l[2]) return true;}} return false;};
 const prev=new Map();const k0=x1+","+y1;prev.set(k0,null);const q=[[x1,y1]];let i=0,end=null;
 while(i<q.length){const [x,y]=q[i++];if(Math.abs(x-x2)<=S&&Math.abs(y-y2)<=S){end=[x,y];break;}
  for(const [dx,dy] of [[S,0],[-S,0],[0,S],[0,-S]]){const nx=x+dx,ny=y+dy;if(nx<g.min_x||nx>g.max_x||ny<g.min_y||ny>g.max_y) continue;const k=nx+","+ny;if(prev.has(k)||bl(x,y,nx,y)||bl(nx,y,nx,ny)) continue;prev.set(k,[x,y]);q.push([nx,ny]);}}
 if(!end) return null;const out=[];let c=end;while(c){out.push(c);c=prev.get(c[0]+","+c[1]);}return out.reverse();}
const ent=[-757,-2034,-70,-1888];const gap=(p,b)=>Math.hypot(Math.max(0,b[0]-p[0],p[0]-b[2]),Math.max(0,b[1]-p[1],p[1]-b[3]));
for(const [name,a,b] of [["arrival→level2s door",[10,-386],[601,-2365]],["arrival→gscorpion",[10,-386],[390,-1420]],["gscorpion→level2s door",[390,-1420],[601,-2365]],["level2s door→transporter",[601,-2365],[-14,-412]]]){
 const t0=Date.now();const p=grid_path("desertland",a[0],a[1],b[0],b[1]);
 console.log(name,p?`steps ${p.length} (${p.length*16}px) in ${Date.now()-t0}ms; nearest to the ent spawn box: ${Math.round(Math.min(...p.map(q=>gap(q,ent))))}px; straight-line nearest: ${Math.round(Math.min(...Array.from({length:101},(_,i)=>gap([a[0]+(b[0]-a[0])*i/100,a[1]+(b[1]-a[1])*i/100],ent))))}px`:"no path");}
