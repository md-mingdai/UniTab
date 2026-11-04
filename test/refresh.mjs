/* Right-click "refresh today's wallpaper" re-fetches and updates the stored
   copyright link, and the fallback path (button busy) does too. */
import { launch, stubRuntime, results, PAGE_URL } from './lib/harness.mjs';

export async function run() {
  const { evalJs, send, sleep, close } = await launch();
  const { ok, finish } = results();

  /* each fetch returns a distinct copyrightlink, increments a counter */
  const stub = `((m,cb)=>{
    window.__fetchCount++; window.__link++;
    if(cb)cb({ok:true,text:'({"images":[{"url":"http://x/y'+window.__link+'.jpg","copyright":"c'+window.__link+'","copyrightlink":"https://cn.bing.com/search?q=词条'+window.__link+'"}]})'});
  })`;
  await stubRuntime({ evalJs, send }, stub);
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `(()=>{ window.__link=0; window.__fetchCount=0; })();` });
  await send('Page.navigate', { url: PAGE_URL });
  for (let i = 0; i < 100; i++) { if (await evalJs(`typeof Settings!=='undefined'`)) break; await sleep(150); }
  await sleep(600);

  await evalJs(`(()=>{
    const s=Settings.getState();
    s.bgSource='bing'; s.bgBingUrl='http://x/old.jpg';
    s.bgBingCopyrightLink='https://cn.bing.com/search?q=旧词条';
    s.bgBingCopyright='旧版权'; Settings.flush();
  })()`);
  const before = await evalJs(`Settings.getState().bgBingCopyrightLink`);

  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 600, y: 400, button: 'right', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 600, y: 400, button: 'right', clickCount: 1 });
  await sleep(250);
  ok('menu open with refresh item', await evalJs(`(()=>{
    const m=document.getElementById('context-menu');
    return m.dataset.open==='true' && [...m.querySelectorAll('.context-menu-label')].some(l=>l.textContent.includes('刷新'));
  })()`));
  const fc0 = await evalJs(`window.__fetchCount`);
  await evalJs(`(()=>{
    const m=document.getElementById('context-menu');
    const t=[...m.querySelectorAll('.context-menu-item')].find(b=>b.textContent.includes('刷新'));
    t.click();
  })()`);
  await sleep(1200);
  const after = await evalJs(`Settings.getState().bgBingCopyrightLink`);
  const fc1 = await evalJs(`window.__fetchCount`);
  ok('refresh triggered a fetch', fc1 > fc0);
  ok('copyright link updated after right-click refresh', after !== before && /词条/.test(after));
  console.log('  link before:', before);
  console.log('  link after :', after);
  ok('fetched link matches stored link', await evalJs(`Settings.getState().bgBingCopyrightLink==='https://cn.bing.com/search?q=词条'+window.__link`));
  ok('stored link persists to localStorage', await evalJs(`new Promise(r=>setTimeout(()=>r(JSON.parse(localStorage.getItem('unitab_settings')).bgBingCopyrightLink===Settings.getState().bgBingCopyrightLink),400))`));

  await evalJs(`(()=>{const b=document.getElementById('bg-bing-refresh'); if(b) b.disabled=true;})()`);
  const before2 = await evalJs(`Settings.getState().bgBingCopyrightLink`);
  const fc2 = await evalJs(`window.__fetchCount`);
  await evalJs(`ContextMenu.refreshBing()`);
  await sleep(1000);
  const after2 = await evalJs(`Settings.getState().bgBingCopyrightLink`);
  const fc3 = await evalJs(`window.__fetchCount`);
  ok('fallback path also updates link (button disabled)', fc3 > fc2 && after2 !== before2);

  const code = finish();
  close();
  return code;
}
