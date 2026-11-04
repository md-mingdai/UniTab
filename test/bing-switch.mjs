/* Bing source switch auto-refresh: stale+auto-refresh refreshes, fresh or
   auto-off does not, never-fetched always refreshes. */
import { launch, stubRuntime, results, PAGE_URL } from './lib/harness.mjs';

export async function run() {
  const { evalJs, send, sleep, close } = await launch();
  const { ok, finish } = results();
  await stubRuntime({ evalJs, send });
  await send('Page.navigate', { url: PAGE_URL });
  for (let i = 0; i < 100; i++) { if (await evalJs(`typeof Settings!=='undefined'`)) break; await sleep(150); }
  await sleep(600);
  await evalJs(`document.getElementById('settings-toggle').click()`); await sleep(400);
  await evalJs(`document.querySelector('.settings-tab[data-tab="bg"]').click()`); await sleep(400);

  await evalJs(`(()=>{
    const s=Settings.getState();
    s.bgSource='color';
    s.bgBingUrl='http://x/old.jpg';
    s.bgBingCopyright='old';
    const d=new Date(); d.setDate(d.getDate()-1);
    const p=n=>String(n).padStart(2,'0');
    s.bingLastRefreshDate=d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());
    s.bgBingAutoRefresh=true;
    Settings.flush();
  })()`);
  await evalJs(`document.querySelector('.radio-option[data-bg-source="color"]').click()`); await sleep(500);
  await evalJs(`(()=>{window.__bingFetch=0;const orig=Background.fetchBingOfTheDay;Background.fetchBingOfTheDay=function(){window.__bingFetch++;return orig.apply(this,arguments)}})()`);

  await evalJs(`document.querySelector('.radio-option[data-bg-source="bing"]').click()`);
  await sleep(800);
  ok('stale + auto-refresh ON -> triggers refresh on switch to bing', await evalJs(`window.__bingFetch>=1`));

  await evalJs(`(()=>{const s=Settings.getState();s.bgBingAutoRefresh=false;Settings.flush()})()`);
  await evalJs(`document.querySelector('.radio-option[data-bg-source="color"]').click()`); await sleep(500);
  await evalJs(`(()=>{window.__bingFetch=0})()`);
  await evalJs(`document.querySelector('.radio-option[data-bg-source="bing"]').click()`);
  await sleep(800);
  ok('stale + auto-refresh OFF -> no refresh on switch to bing', await evalJs(`window.__bingFetch===0`));

  await evalJs(`(()=>{
    const s=Settings.getState();
    s.bgBingAutoRefresh=true;
    const d=new Date();
    const p=n=>String(n).padStart(2,'0');
    s.bingLastRefreshDate=d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());
    Settings.flush();
  })()`);
  await evalJs(`document.querySelector('.radio-option[data-bg-source="color"]').click()`); await sleep(500);
  await evalJs(`(()=>{window.__bingFetch=0})()`);
  await evalJs(`document.querySelector('.radio-option[data-bg-source="bing"]').click()`);
  await sleep(800);
  ok('fresh today + auto-refresh ON -> no refresh on switch to bing', await evalJs(`window.__bingFetch===0`));

  await evalJs(`(()=>{const s=Settings.getState();s.bgBingUrl=null;s.bingLastRefreshDate=null;Settings.flush()})()`);
  await evalJs(`document.querySelector('.radio-option[data-bg-source="color"]').click()`); await sleep(500);
  await evalJs(`(()=>{window.__bingFetch=0})()`);
  await evalJs(`document.querySelector('.radio-option[data-bg-source="bing"]').click()`);
  await sleep(800);
  ok('no url ever -> refresh on switch to bing (backwards compat)', await evalJs(`window.__bingFetch>=1`));

  const code = finish();
  close();
  return code;
}
