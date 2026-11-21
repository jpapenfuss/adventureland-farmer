// Route simulator: loads farmer.js through the smoke test's mocked client, puts the live maps, monsters, NPCs and
// geometry into it, and prints route_plan / route_to / seg_danger for the cases at the bottom (edit them).
// Diagnostic script (not part of the bot). Game data: pass the path of a saved https://adventure.land/data.js
// as the first argument, or set AL_DATA. See tools/README.md.
const DATA = process.argv[2] || process.env.AL_DATA;
if (!DATA) { console.error("usage: node " + require("path").basename(__filename) + " <path to data.js>"); process.exit(2); }
const fs=require("fs");
const lines=fs.readFileSync(require("path").join(__dirname,"..","test","smoke.js"),"utf8").split("\n");
const idx=lines.findIndex(l=>l.startsWith("const st = ()"));
const header=lines.slice(0,idx).join("\n").replace(/__dirname/g,JSON.stringify(require("path").join(__dirname,"..","test")));
let t=fs.readFileSync(DATA,"utf8").trim().replace(/^var G=/,"").replace(/;\s*$/,"");
const RG=JSON.parse(t);
eval(header+`
;globalThis.__ctx=ctx;globalThis.__G=G;globalThis.__ch=character;globalThis.__vm=vm;`);
const ctx=globalThis.__ctx,G=globalThis.__G,character=globalThis.__ch,vm=globalThis.__vm;
for(const k of ["maps","monsters","npcs","geometry","classes"]) G[k]=RG[k];
const R=(c)=>vm.runInContext(c,ctx);
Object.assign(character,{name:"Torlis",ctype:"paladin",level:52,hp:6565,max_hp:6565,attack:600,frequency:0.9,armor:500,resistance:250,range:30,speed:52,map:"level2s",x:-311,y:514});
R("CFG.party.tank_leads=true; state.partners={}; rt_cache && 0");
const croc=RG.maps.main.monsters.find(m=>m.type==="croc");
console.log("croc",JSON.stringify(croc.boundary||croc.boundaries));
const b=croc.boundary, tx=(b[0]+b[2])/2, ty=(b[1]+b[3])/2;
console.log("level2s doors",JSON.stringify(RG.maps.level2s.doors.map(d=>[d[4],d[5],d[6]])), "spawns",JSON.stringify(RG.maps.level2s.spawns));
console.log("level2 doors",JSON.stringify(RG.maps.level2.doors.map(d=>[d[4],d[5],d[6]])));
console.log("desertland doors",JSON.stringify(RG.maps.desertland.doors.map(d=>[d[4],d[5],d[6]])));
const show=(from)=>{ const pl=R(`route_plan("main",${tx},${ty},${JSON.stringify(from)})`); const r=R(`route_to("main",${tx},${ty},${JSON.stringify(from)})`);
 console.log("from",JSON.stringify(from),"\n  shortest:",r&&Math.round(r.d),r&&r.maps.join(">"),"\n  plan:",pl&&JSON.stringify({d:Math.round(pl.d),danger:pl.danger,around:pl.around,legs:pl.legs&&pl.legs.map(l=>(l.kind||"door")+":"+l.map+"→"+l.to)})); };

const P=(label,to,tx,ty,from)=>{const t0=Date.now();const pl=R(`route_plan(${JSON.stringify(to)},${tx},${ty},${JSON.stringify(from)})`);console.log(label,"→",pl?JSON.stringify({d:Math.round(pl.d),danger:pl.danger,around:pl.around,legs:pl.legs&&pl.legs.map(l=>(l.kind||"door")+":"+l.map+"→"+l.to)}):"null",(Date.now()-t0)+"ms");};
console.log("deadly in desertland:",JSON.stringify(R("deadly_areas('desertland').map(z=>z.t)")));
console.log("segs to the door from each spawn:",JSON.stringify(RG.maps.desertland.spawns.map(sp=>R(`seg_danger("desertland",${sp[0]},${sp[1]},601,-2365)`))));console.log("seg arrival→level2s door:",R("seg_danger('desertland',10,-386,601,-2365)"),"| arrival→gscorpion:",R("seg_danger('desertland',10,-386,390,-1420)"));
P("arrival → cgoo@level2s","level2s",34,503,{map:"desertland",x:10,y:-386});
P("arrival → gscorpion","desertland",390,-1420,{map:"desertland",x:10,y:-386});
P("level2s door plateau → croc@main","main",801,1710,{map:"desertland",x:601,y:-2365});
P("level2s (cgoo) → main town","main",0,0,{map:"level2s",x:34,y:503});
P("main town → cgoo@level2s","level2s",34,503,{map:"main",x:0,y:0});
process.exit(0);
