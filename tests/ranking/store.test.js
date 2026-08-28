/* Unit tests: ruleset store (V2 Phase 3) */
const path=require("path");
const E=require(path.join(__dirname,"..","..","src","ranking","engine.js"));
const Store=require(path.join(__dirname,"..","..","src","ranking","store.js"));
const sector=require(path.join(__dirname,"..","..","src","ranking","rulesets","sector_company.json"));
const fund=require(path.join(__dirname,"..","..","src","ranking","rulesets","fund_category.json"));
let fails=0; function ok(c,m){ if(!c){ fails++; console.log("  FAIL: "+m); } }

const mem={data:{}, getItem(k){return this.data[k]||null;}, setItem(k,v){this.data[k]=v;}};
const store=Store.create({storage:mem, baselines:{sector_company:sector,fund_category:fund}, validate:E.validateRuleset});

ok(store.getRuleset("sector_company").name===sector.name,"baseline returned");
ok(store.isModified("sector_company")===false,"not modified initially");
ok(store.getRuleset("sector_company")!==sector,"returns a clone, not the baseline object");

// override: bump a dimension weight
const tweak=JSON.parse(JSON.stringify(sector)); tweak.dimensions[0].weight=3;
ok(store.setActive("sector_company",tweak).ok,"setActive valid ok");
ok(store.getRuleset("sector_company").dimensions[0].weight===3,"override persisted");
ok(store.isModified("sector_company")===true,"modified after setActive");

// export/import round-trip
const json=store.exportRuleset("sector_company"); ok(typeof json==="string"&&json.indexOf("sector")>=0,"export is JSON");
const mem2={data:{}, getItem(k){return this.data[k]||null;}, setItem(k,v){this.data[k]=v;}};
const store2=Store.create({storage:mem2, baselines:{sector_company:sector}, validate:E.validateRuleset});
ok(store2.importRuleset("sector_company",json).ok,"import round-trip ok");
ok(store2.getRuleset("sector_company").dimensions[0].weight===3,"imported override applied");

// invalid import rejected
ok(store2.importRuleset("sector_company","{ not json").ok===false,"invalid JSON rejected");
ok(store2.importRuleset("sector_company",{factors:[]}).ok===false,"empty factors rejected");
ok(store2.importRuleset("sector_company",{factors:[{id:"x",metric:"m",norm:"percentile"}],dimensions:[{id:"D",factors:["nope"]}]}).ok===false,"bad dimension ref rejected");

// presets
ok(store.savePreset("sector_company","aggressive",tweak).ok,"savePreset ok");
ok(store.listPresets("sector_company").indexOf("aggressive")>=0,"preset listed");
ok(store.loadPreset("sector_company","aggressive").dimensions[0].weight===3,"loadPreset returns it");
store.deletePreset("sector_company","aggressive");
ok(store.listPresets("sector_company").indexOf("aggressive")<0,"preset deleted");

// reset
store.resetActive("sector_company");
ok(store.isModified("sector_company")===false,"reset clears override");
ok(store.getRuleset("sector_company").dimensions[0].weight===undefined,"back to baseline after reset");

console.log(fails? ("store: "+fails+" FAILED") : "PASS — ruleset store (override/presets/export-import/reset) correct");
process.exit(fails?1:0);
