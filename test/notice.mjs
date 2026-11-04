/* Refresh notices: bottom-right toast appears ("refreshing") when a bing
   refresh starts, and swaps to "refreshed" when it completes, from every
   entry point (settings button, context-menu action, fallback path). */
import { launch, stubRuntime, results, PAGE_URL } from './lib/harness.mjs';

export async function run() {
  const { evalJs, send, sleep, close } = await launch();
  const { ok, finish } = results();

  const stub = `((m,cb)=>{
    window.__fetchCount=(window.__fetchCount||0)+1;
    if(cb)cb({ok:true,text:'({"images":[{"url":"http://x/y.jpg","copyright":"c","copyrightlink":"https://cn.bing.com/search?q=x"}]})'});
  })`;
  await stubRuntime({ evalJs, send }, stub);
  await send('Page.navigate', { url: PAGE_URL });
  for (let i = 0; i < 100; i++) { if (await evalJs(`typeof Settings!=='undefined' && typeof Notice!=='undefined'`)) break; await sleep(150); }
  await sleep(600);

  const noticeText = () => evalJs(`(()=>{
    const n=document.querySelector('.app-notice-text');
    return n ? n.textContent : null;
  })()`);
  const noticeOpen = () => evalJs(`(()=>{
    const n=document.querySelector('.app-notice');
    return n && n.dataset.open==='true';
  })()`);
  const noticeSeverity = () => evalJs(`(()=>{
    const n=document.querySelector('.app-notice');
    return n ? n.dataset.severity : null;
  })()`);

  /* The page's init() auto-fetches the default bing wallpaper on load, which
     is itself a refresh entry point — so the notice element already exists. */
  ok('notice created by the initial auto-refresh', await evalJs(`!!document.querySelector('.app-notice')`));
  ok('initial auto-refresh notice is success severity',
    (await noticeSeverity()) === 'success');

  /* Style contract: fixed rectangle, no glass (no backdrop-filter), no
     var(--glass-*) references, permanent radius, high-contrast text. */
  ok('notice is a fixed-size rectangle', await evalJs(`(()=>{
    const n=document.querySelector('.app-notice');
    const s=getComputedStyle(n);
    return s.width==='340px' && s.height==='64px';
  })()`));
  ok('notice has no backdrop-filter (not glass)', await evalJs(`(()=>{
    const n=document.querySelector('.app-notice');
    const s=getComputedStyle(n);
    return s.backdropFilter==='none';
  })()`));
  ok('notice radius is fixed 20px (not var glass radius)', await evalJs(`(()=>{
    const n=document.querySelector('.app-notice');
    return getComputedStyle(n).borderRadius==='20px';
  })()`));
  ok('notice translucent + colored by severity', await evalJs(`(()=>{
    const n=document.querySelector('.app-notice');
    const s=getComputedStyle(n);
    const a=s.backgroundColor;
    return /rgba\\(/.test(a) && parseFloat(a.split(',')[3])>=0.8 && parseFloat(a.split(',')[3])<1;
  })()`));
  ok('notice text colour is light (high contrast)', await evalJs(`(()=>{
    const n=document.querySelector('.app-notice');
    const c=getComputedStyle(n).color;
    const rgb=c.match(/\\d+/g).map(Number);
    return rgb.length===3 && rgb[0]>200 && rgb[1]>200 && rgb[2]>200;
  })()`));
  ok('notice text size is 20px', await evalJs(`(()=>{
    const t=document.querySelector('.app-notice-text');
    return t && getComputedStyle(t).fontSize==='20px';
  })()`));
  ok('notice enters from the right (positive X shift, no Y shift)', await evalJs(`(()=>{
    /* Read the authored CSS rule for the closed .app-notice state. */
    const rule=[...document.styleSheets].flatMap(sh=>{try{return [...sh.cssRules]}catch{return []}})
      .find(r=>r.selectorText==='.app-notice');
    if(!rule) return false;
    const t=rule.style.transform;
    /* translateX(calc(100% + 24px)) — a horizontal slide, no translateY. */
    return /translateX\\(/.test(t) && !/translateY\\(/.test(t);
  })()`));
  ok('notice slide duration is ~0.9s', await evalJs(`(()=>{
    const n=document.querySelector('.app-notice');
    const s=getComputedStyle(n);
    return s.transitionDuration.split(',')[0].trim()==='0.9s';
  })()`));
  ok('notice text is left-aligned (not centred)', await evalJs(`(()=>{
    const t=document.querySelector('.app-notice-text');
    return t && getComputedStyle(t).textAlign==='left';
  })()`));
  ok('notice raised higher above the bottom', await evalJs(`(()=>{
    const n=document.querySelector('.app-notice');
    return getComputedStyle(n).bottom==='80px';
  })()`));
  ok('notice has a top progress bar', await evalJs(`(()=>{
    const n=document.querySelector('.app-notice');
    const p=document.querySelector('.app-notice-progress');
    if(!p) return false;
    const s=getComputedStyle(p);
    const nr=n.getBoundingClientRect();
    const pr=p.getBoundingClientRect();
    /* The bar is flush with the very top edge (negative offset over the
       1px border) and taller than the old 4px so it fills the seam. */
    return s.height==='6px' && Math.abs(pr.top-nr.top)<=1;
  })()`));
  ok('progress bar countdown runs over the dwell time', await evalJs(`(()=>{
    /* The countdown animation lives on the ::after pseudo-element. */
    const rule=[...document.styleSheets].flatMap(sh=>{try{return [...sh.cssRules]}catch{return []}})
      .find(r=>r.selectorText==='.app-notice[data-open="true"] .app-notice-progress::after');
    return rule && /app-notice-countdown/.test(rule.style.animation);
  })()`));
  ok('notice default dwell time is 5s', await evalJs(`(()=>{
    const n=document.querySelector('.app-notice');
    return n.style.getPropertyValue('--notice-duration')==='5000ms';
  })()`));

  /* Directly call the shared refresh via the settings button path.
     Use a manually-resolved fetch so the transient "info" state can be
     observed before the promise completes and flips to "success". */
  await evalJs(`document.getElementById('settings-toggle').click()`); await sleep(400);
  await evalJs(`document.querySelector('.settings-tab[data-tab="bg"]').click()`); await sleep(400);
  await evalJs(`document.querySelector('.radio-option[data-bg-source="bing"]').click()`); await sleep(400);
  await evalJs(`(()=>{
    const orig=Background.fetchBingOfTheDay;
    window.__origFetch2=orig;
    window.__resolveFetch=null;
    window.__fetchCount=0;
    Background.fetchBingOfTheDay=function(){
      window.__fetchCount++;
      return new Promise((res)=>{ window.__resolveFetch=res; });
    };
  })()`);
  await evalJs(`document.getElementById('bg-bing-refresh').click()`);
  await sleep(150);
  ok('refreshing notice shown when refresh starts', await evalJs(`(()=>{
    const n=document.querySelector('.app-notice');
    return n && n.dataset.open==='true' && /刷新|Refreshing/.test(n.textContent);
  })()`));
  ok('refreshing notice is info severity (while pending)', (await noticeSeverity()) === 'info');
  /* Complete the pending fetch and confirm it flips to success. */
  await evalJs(`window.__resolveFetch({ok:true,url:'http://x/ok.jpg',copyright:'c',copyrightlink:'https://cn.bing.com/search?q=ok'})`);
  await sleep(300);
  ok('refreshed notice shown when refresh completes', await evalJs(`(()=>{
    const n=document.querySelector('.app-notice');
    return n && n.dataset.open==='true' && /已刷新|refreshed/i.test(n.textContent);
  })()`));
  ok('refreshed notice is success severity', (await noticeSeverity()) === 'success');
  ok('refresh actually fetched once', await evalJs(`window.__fetchCount===1`));
  await evalJs(`(()=>{Background.fetchBingOfTheDay=window.__origFetch2;})()`);
  await sleep(200);

  /* Failure path: a failed fetch should show an error notice. */
  await evalJs(`(()=>{
    const orig=Background.fetchBingOfTheDay;
    Background.fetchBingOfTheDay=function(){return Promise.resolve({ok:false,error:'network down'})};
    window.__origFetch=orig;
  })()`);
  await evalJs(`document.getElementById('bg-bing-refresh').click()`);
  await sleep(300);
  ok('failed refresh shows error notice', await evalJs(`(()=>{
    const n=document.querySelector('.app-notice');
    return n && n.dataset.open==='true' && /失败|failed/i.test(n.textContent);
  })()`));
  ok('failed refresh notice is error severity', (await noticeSeverity()) === 'error');
  await evalJs(`(()=>{Background.fetchBingOfTheDay=window.__origFetch;})()`);
  await sleep(200);

  /* Context-menu refresh path also shows notices. */
  await evalJs(`document.getElementById('settings-close').click()`); await sleep(300);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 600, y: 400, button: 'right', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 600, y: 400, button: 'right', clickCount: 1 });
  await sleep(250);
  await evalJs(`window.__fetchCount=0`);
  await evalJs(`(()=>{
    const m=document.getElementById('context-menu');
    const t=[...m.querySelectorAll('.context-menu-item')].find(b=>b.textContent.includes('刷新'));
    t.click();
  })()`);
  await sleep(150);
  ok('context-menu refresh shows refreshing notice', await noticeOpen() && /刷新|Refreshing/.test(await noticeText()));
  await sleep(1200);
  ok('context-menu refresh completes with refreshed notice', await noticeOpen() && /已刷新|refreshed/i.test(await noticeText()));
  ok('context-menu refresh fetched once', await evalJs(`window.__fetchCount===1`));

  /* Fallback path (button disabled) also shows notices. */
  await evalJs(`(()=>{const b=document.getElementById('bg-bing-refresh'); if(b) b.disabled=true;})()`);
  await evalJs(`window.__fetchCount=0`);
  await evalJs(`ContextMenu.refreshBing()`);
  await sleep(150);
  ok('fallback refresh shows refreshing notice', await noticeOpen() && /刷新|Refreshing/.test(await noticeText()));
  await sleep(1200);
  ok('fallback refresh completes with refreshed notice', await noticeOpen() && /已刷新|refreshed/i.test(await noticeText()));
  ok('fallback refresh fetched once', await evalJs(`window.__fetchCount===1`));

  /* Notice auto-dismisses (slides out) after its 5s dwell time. */
  await evalJs(`window.__fetchCount=0; ContextMenu.refreshBing()`);
  await sleep(5400); /* dwell 5s + slide-out head start */
  ok('notice auto-dismisses after duration', await evalJs(`(()=>{
    const n=document.querySelector('.app-notice');
    return n && n.dataset.open==='false';
  })()`));

  const code = finish();
  close();
  return code;
}
