import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../web/app.js',import.meta.url),'utf8');
const budget=vm.runInNewContext(app.slice(app.indexOf('const $'),app.indexOf('function weekLabel'))+'\nbudget;',{window:{}});

test('voting cards survive omitted, partial and invalid budgets and keep zero and valid ranges',()=>{
  for(const p of [{},{budgetMin:null,budgetMax:null},{budgetMin:4000},{budgetMax:8000},{budgetMin:4000,budgetMax:null},{budgetMin:undefined,budgetMax:8000},{budgetMin:'',budgetMax:''},{budgetMin:NaN,budgetMax:8000},{budgetMin:4000,budgetMax:Infinity},{budgetMin:-1,budgetMax:8000},{budgetMin:8000,budgetMax:4000}])assert.equal(budget(p),'預算待確認');
  assert.equal(budget({budgetMin:4000,budgetMax:8000}),'約 NT$ 4,000–8,000 / 人');
  assert.equal(budget({budgetMin:0,budgetMax:0}),'約 NT$ 0–0 / 人');
});
