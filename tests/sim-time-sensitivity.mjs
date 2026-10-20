import { main } from './sim-sensitivity.mjs';
// Separate single-clock controls; no production rule or UI API is extended.
await main('docs/reports/sim-02-time','8d69a85',[
  {id:'control'}, {id:'departure-60-only',departure:60,closing:112},
  {id:'departure-100-only',departure:100,closing:112},
  {id:'closing-90-only',closing:90}, {id:'closing-150-only',closing:150},
  {id:'grace-5-only',grace:5}, {id:'grace-30-only',grace:30},
  {id:'decision-start-50-only',earliest:50},
  {id:'stress',resources:{energy:40,provisions:20,money:0},interaction:true},
  {id:'stress-grace-5',resources:{energy:40,provisions:20,money:0},grace:5,interaction:true},
  {id:'stress-grace-30',resources:{energy:40,provisions:20,money:0},grace:30,interaction:true},
]);
