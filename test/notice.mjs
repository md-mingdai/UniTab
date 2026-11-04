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

  /* Toasts now STACK, so querySelector('.app-notice') returns the OLDEST one.
     The helpers below target the NEWEST toast (the container's last child),
     which is what a just-fired refresh produces. */
  const installHelpers = () => evalJs(`(()=>{
    const c=()=>document.querySelector('.app-notice-container');
    window.__lastNotice=()=>{const b=c();return b?b.lastElementChild:null};
    window.__clearNotices=()=>{document.querySelectorAll('.app-notice').forEach(n=>n.remove())};
    window.__lastText=()=>{const n=window.__lastNotice();return n?n.textContent:null};
    window.__lastOpen=()=>{const n=window.__lastNotice();return !!(n&&n.dataset.open==='true')};
    window.__lastSeverity=()=>{const n=window.__lastNotice();return n?n.dataset.severity:null};
  })()`);
  await installHelpers();
  const lastText = () => evalJs(`window.__lastText()`);
  const lastOpen = () => evalJs(`window.__lastOpen()`);
  const lastSeverity = () => evalJs(`window.__lastSeverity()`);

  /* The page's init() auto-fetches the default bing wallpaper on load, which
     is itself a refresh entry point — so a notice element already exists. */
  ok('notice created by the initial auto-refresh', await evalJs(`!!document.querySelector('.app-notice')`));
  ok('initial auto-refresh notice is success severity',
    (await lastSeverity()) === 'success');

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
  ok('notice radius is fixed 15px (not var glass radius)', await evalJs(`(()=>{
    const n=document.querySelector('.app-notice');
    return getComputedStyle(n).borderRadius==='15px';
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
  ok('notice text is vertically centred', await evalJs(`(()=>{
    const n=document.querySelector('.app-notice');
    const t=document.querySelector('.app-notice-text');
    const nr=n.getBoundingClientRect();
    const tr=t.getBoundingClientRect();
    const nMid=nr.top+nr.height/2;
    const tMid=tr.top+tr.height/2;
    return Math.abs(nMid-tMid)<1;
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
  ok('the stack container is raised 80px above the bottom', await evalJs(`(()=>{
    const c=document.querySelector('.app-notice-container');
    return c && getComputedStyle(c).bottom==='80px';
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
  await evalJs(`window.__clearNotices()`);
  await evalJs(`document.getElementById('bg-bing-refresh').click()`);
  await sleep(150);
  ok('refreshing notice shown when refresh starts', await lastOpen() && /刷新|Refreshing/.test(await lastText()));
  ok('refreshing notice is info severity (while pending)', (await lastSeverity()) === 'info');
  /* Complete the pending fetch and confirm it flips to success. */
  await evalJs(`window.__resolveFetch({ok:true,url:'http://x/ok.jpg',copyright:'c',copyrightlink:'https://cn.bing.com/search?q=ok'})`);
  await sleep(300);
  ok('refreshed notice shown when refresh completes', await lastOpen() && /已刷新|refreshed/i.test(await lastText()));
  ok('refreshed notice is success severity', (await lastSeverity()) === 'success');
  ok('refresh actually fetched once', await evalJs(`window.__fetchCount===1`));
  await evalJs(`(()=>{Background.fetchBingOfTheDay=window.__origFetch2;})()`);
  await sleep(200);

  /* Failure path: a failed fetch should show an error notice. */
  await evalJs(`(()=>{
    const orig=Background.fetchBingOfTheDay;
    Background.fetchBingOfTheDay=function(){return Promise.resolve({ok:false,error:'network down'})};
    window.__origFetch=orig;
  })()`);
  await evalJs(`window.__clearNotices()`);
  await evalJs(`document.getElementById('bg-bing-refresh').click()`);
  await sleep(300);
  ok('failed refresh shows error notice', await lastOpen() && /失败|failed/i.test(await lastText()));
  ok('failed refresh notice is error severity', (await lastSeverity()) === 'error');
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
  ok('context-menu refresh shows refreshing notice', await lastOpen() && /刷新|Refreshing/.test(await lastText()));
  await sleep(1200);
  ok('context-menu refresh completes with refreshed notice', await lastOpen() && /已刷新|refreshed/i.test(await lastText()));
  ok('context-menu refresh fetched once', await evalJs(`window.__fetchCount===1`));

  /* Fallback path (button disabled) also shows notices. */
  await evalJs(`(()=>{const b=document.getElementById('bg-bing-refresh'); if(b) b.disabled=true;})()`);
  await evalJs(`window.__clearNotices()`);
  await evalJs(`window.__fetchCount=0`);
  await evalJs(`ContextMenu.refreshBing()`);
  await sleep(150);
  ok('fallback refresh shows refreshing notice', await lastOpen() && /刷新|Refreshing/.test(await lastText()));
  await sleep(1200);
  ok('fallback refresh completes with refreshed notice', await lastOpen() && /已刷新|refreshed/i.test(await lastText()));
  ok('fallback refresh fetched once', await evalJs(`window.__fetchCount===1`));

  /* Notice auto-dismisses (slides out) after its 5s dwell time. */
  await evalJs(`window.__clearNotices()`);
  await evalJs(`window.__fetchCount=0; ContextMenu.refreshBing()`);
  await sleep(5400); /* dwell 5s + slide-out head start */
  ok('notice auto-dismisses after duration', await evalJs(`(()=>{
    const n=document.querySelector('.app-notice');
    return n && n.dataset.open==='false';
  })()`));

  /* --- Stacking: multiple concurrent notices stack bottom-to-top --- */
  await evalJs(`window.__clearNotices()`);
  await evalJs(`Notice.show('stack-top','info',2500)`);
  await sleep(100);
  await evalJs(`Notice.show('stack-bottom','success',8000)`);
  await sleep(1100); /* both fully slid in */
  ok('two concurrent notices both render', await evalJs(`document.querySelectorAll('.app-notice').length===2`));
  ok('notices are absolutely positioned inside the container', await evalJs(`(()=>{
    const toasts=[...document.querySelectorAll('.app-notice')];
    return toasts.every(t=>getComputedStyle(t).position==='absolute');
  })()`));
  ok('the later notice sits below the earlier one, 12px apart', await evalJs(`(()=>{
    const toasts=[...document.querySelectorAll('.app-notice')]
      .sort((a,b)=>a.getBoundingClientRect().top-b.getBoundingClientRect().top);
    if(toasts.length!==2) return false;
    const [upper,lower]=toasts;
    const gap=lower.getBoundingClientRect().top-upper.getBoundingClientRect().bottom;
    return Math.abs(gap-12)<=2 && upper.textContent.includes('stack-top') && lower.textContent.includes('stack-bottom');
  })()`));
  ok('the stack sits at the fixed bottom-right anchor', await evalJs(`(()=>{
    const c=document.querySelector('.app-notice-container');
    if(!c) return false;
    const s=getComputedStyle(c);
    return s.position==='fixed' && s.right==='20px' && s.bottom==='80px' && s.pointerEvents==='none';
  })()`));
  /* The shorter-lived top toast (2.5s) exits first; the survivor re-stacks to
     the bottom edge (removal calls layout() itself). */
  await sleep(2500 + 1000); /* top toast dwell 2.5s + slide-out 0.9s */
  ok('after the earlier toast leaves, the survivor re-stacks to the bottom',
    await evalJs(`(()=>{
      const toasts=[...document.querySelectorAll('.app-notice')];
      if(toasts.length!==1) return false;
      const t=toasts[0];
      const r=t.getBoundingClientRect();
      const c=document.querySelector('.app-notice-container').getBoundingClientRect();
      /* The sole survivor sits at the container's bottom edge. */
      return Math.abs(r.bottom - c.bottom) <= 2;
    })()`));
  await evalJs(`window.__clearNotices()`);

  const code = finish();
  close();
  return code;
}
