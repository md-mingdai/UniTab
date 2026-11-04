/* Copyright link: stored and overwritten on every fetch; the context menu's
   "open source page" uses the copyright link, not the image URL. */
import { launch, stubRuntime, results, PAGE_URL } from './lib/harness.mjs';

const LINK1 = 'https://cn.bing.com/search?q=词条一';
const LINK2 = 'https://cn.bing.com/search?q=词条二';

export async function run() {
  const { evalJs, send, sleep, close } = await launch();
  const { ok, finish } = results();

  const stub = `((m,cb)=>{
    const link=window.__fetchCalls.length===0?'${LINK1}':'${LINK2}';
    window.__fetchCalls.push(m.type);
    if(cb)cb({ok:true,text:'({"images":[{"url":"http://x/y.jpg","copyright":"c","copyrightlink":"'+link+'"}]})'});
  })`;
  await stubRuntime({ evalJs, send }, stub);
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `(()=>{ window.__fetchCalls=[]; })();` });
  await send('Page.navigate', { url: PAGE_URL });
  for (let i = 0; i < 100; i++) { if (await evalJs(`typeof Settings!=='undefined'`)) break; await sleep(150); }
  await sleep(600);

  /* page load's init() may auto-fetch once; reset counters so the test
     controls the sequence from here (first test fetch -> LINK1, next -> LINK2) */
  await evalJs(`window.__fetchCalls=[]`);

  await evalJs(`document.getElementById('settings-toggle').click()`); await sleep(400);
  await evalJs(`document.querySelector('.settings-tab[data-tab="bg"]').click()`); await sleep(400);
  await evalJs(`(()=>{const s=Settings.getState();s.bgBingUrl=null;s.bgBingCopyrightLink='';s.bgSource='color';Settings.flush()})()`);
  await evalJs(`document.querySelector('.radio-option[data-bg-source="color"]').click()`); await sleep(400);
  await evalJs(`document.querySelector('.radio-option[data-bg-source="bing"]').click()`); await sleep(900);
  ok('first fetch stores copyrightlink #1', await evalJs(`Settings.getState().bgBingCopyrightLink==='${LINK1}'`));
  ok('fetch count is 1', await evalJs(`window.__fetchCalls.length===1`));

  await evalJs(`(()=>{const s=Settings.getState();s.bgBingAutoRefresh=true;const d=new Date();d.setDate(d.getDate()-1);const p=n=>String(n).padStart(2,'0');s.bingLastRefreshDate=d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());Settings.flush()})()`);
  await evalJs(`document.querySelector('.radio-option[data-bg-source="color"]').click()`); await sleep(500);
  await evalJs(`document.querySelector('.radio-option[data-bg-source="bing"]').click()`); await sleep(900);
  ok('second fetch overwrites stored link with #2', await evalJs(`Settings.getState().bgBingCopyrightLink==='${LINK2}'`));
  ok('fetch count is 2 (each fetch recorded)', await evalJs(`window.__fetchCalls.length===2`));

  await evalJs(`document.getElementById('settings-close').click()`); await sleep(400);
  await evalJs(`window.__opened=[]; window.open=(u)=>{window.__opened.push(u);return {}}`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 600, y: 400, button: 'right', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 600, y: 400, button: 'right', clickCount: 1 });
  await sleep(250);
  ok('menu shows open-source item for bing', await evalJs(`(()=>{
    const m=document.getElementById('context-menu');
    const labels=[...m.querySelectorAll('.context-menu-label')].map(l=>l.textContent);
    return labels.some(t=>t.includes('来源')||t.includes('Source'));
  })()`));
  await evalJs(`(()=>{
    const m=document.getElementById('context-menu');
    const btns=[...m.querySelectorAll('.context-menu-item')];
    const target=btns.find(b=>b.textContent.includes('来源')||b.textContent.includes('Source'));
    target.click();
  })()`);
  await sleep(300);
  ok('open-source opens the stored copyright link, not image url',
    await evalJs(`window.__opened && window.__opened[0]==='${LINK2}'`));

  const code = finish();
  close();
  return code;
}
