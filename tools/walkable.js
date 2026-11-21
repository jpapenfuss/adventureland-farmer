// Flood fill over a map's wall lines: what is reachable from a point, and the walkable ground nearest an NPC
// (how the transporter stand-off points in farmer.js were measured). The cases are hard-coded: edit them.
// Diagnostic script (not part of the bot). Game data: pass the path of a saved https://adventure.land/data.js
// as the first argument, or set AL_DATA. See tools/README.md.
const DATA = process.argv[2] || process.env.AL_DATA;
if (!DATA) { console.error("usage: node " + require("path").basename(__filename) + " <path to data.js>"); process.exit(2); }
const fs=require("fs");let t=fs.readFileSync(DATA,"utf8").trim().replace(/^var G=/,"").replace(/;\s*$/,"");const G=JSON.parse(t);
const g=G.geometry.desertland; console.log("bounds",g.min_x,g.min_y,g.max_x,g.max_y,"xl",g.x_lines.length,"yl",g.y_lines.length);
// segment (x1,y1)->(x2,y2) axis-aligned step; blocked if it crosses a wall line
function blocked(x1,y1,x2,y2){
  if(x1!==x2){const a=Math.min(x1,x2),b=Math.max(x1,x2);for(const l of g.x_lines){ if(l[0]<a) continue; if(l[0]>b) break; if(y1>=l[1]&&y1<=l[2]) return true;}}
  if(y1!==y2){const a=Math.min(y1,y2),b=Math.max(y1,y2);for(const l of g.y_lines){ if(l[0]<a) continue; if(l[0]>b) break; if(x2>=l[1]&&x2<=l[2]) return true;}}
  return false;}
function reach(sx,sy,S=8){const seen=new Map();const q=[[sx,sy]];seen.set(sx+","+sy,1);let i=0;
  while(i<q.length){const [x,y]=q[i++];for(const [dx,dy] of [[S,0],[-S,0],[0,S],[0,-S]]){const nx=x+dx,ny=y+dy;if(nx<g.min_x||nx>g.max_x||ny<g.min_y||ny>g.max_y) continue;const k=nx+","+ny;if(seen.has(k)) continue;if(blocked(x,y,nx,y)||blocked(nx,y,nx,ny)) continue;seen.set(k,1);q.push([nx,ny]);}}
  return q;}
const near=(q,x,y)=>Math.round(Math.min(...q.map(p=>Math.hypot(p[0]-x,p[1]-y))));
const A=reach(601,-2365); console.log("from the level2s door (601,-2365): cells",A.length,"| nearest to transporter(-14,-477)",near(A,-14,-477),"| to transporter+30",near(A,-14,-447),"| to spawn1(10,-386)",near(A,10,-386),"| to gscorpion(468,-1396)",near(A,468,-1396));
const B=reach(10,-386); console.log("from the transporter arrival (10,-386): cells",B.length,"| nearest to door(601,-2365)",near(B,601,-2365),"| to gscorpion(468,-1396)",near(B,468,-1396),"| to transporter",near(B,-14,-477));
console.log("desertland monsters",JSON.stringify(G.maps.desertland.monsters.map(m=>[m.type,m.boundary||m.boundaries])));
function reachM(map,sx,sy,S=8){const gg=G.geometry[map];const bl=(x1,y1,x2,y2)=>{ if(x1!==x2){const a=Math.min(x1,x2),b=Math.max(x1,x2);for(const l of gg.x_lines){ if(l[0]<a) continue; if(l[0]>b) break; if(y1>=l[1]&&y1<=l[2]) return true;}} if(y1!==y2){const a=Math.min(y1,y2),b=Math.max(y1,y2);for(const l of gg.y_lines){ if(l[0]<a) continue; if(l[0]>b) break; if(x2>=l[1]&&x2<=l[2]) return true;}} return false;};
 const seen=new Set([sx+","+sy]);const q=[[sx,sy]];let i=0;while(i<q.length){const [x,y]=q[i++];for(const [dx,dy] of [[S,0],[-S,0],[0,S],[0,-S]]){const nx=x+dx,ny=y+dy;if(nx<gg.min_x||nx>gg.max_x||ny<gg.min_y||ny>gg.max_y) continue;const k=nx+","+ny;if(seen.has(k)||bl(x,y,nx,y)||bl(nx,y,nx,ny)) continue;seen.add(k);q.push([nx,ny]);}}return q;}
for(const [m,sp] of [["desertland",[10,-386]],["main",[0,0]],["winterland",[0,0]]]){const n=G.maps[m].npcs.find(n=>n.id==="transporter").position;const q=reachM(m,sp[0],sp[1]);
 const c=q.map(p=>[p[0]-n[0],p[1]-n[1],Math.hypot(p[0]-n[0],p[1]-n[1])]).filter(p=>p[2]<75).sort((a,b)=>a[2]-b[2]);
 console.log(m,"npc",n,"walkable cells within 75px:",c.length,"nearest offsets",JSON.stringify(c.slice(0,5).map(p=>[p[0],p[1],Math.round(p[2])])),"| straight below (dx within 8):",JSON.stringify(c.filter(p=>Math.abs(p[0])<=8).slice(0,4).map(p=>[p[0],p[1]])));}
