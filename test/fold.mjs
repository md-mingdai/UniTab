/* Collapsible settings categories: structure, fold/unfold, persistence, i18n. */
import { launch, stubRuntime, results, PAGE_URL } from './lib/harness.mjs';

export async function run() {
  const { evalJs, send, sleep, close } = await launch();
  const { ok, finish } = results();
  await stubRuntime({ evalJs, send });
  await send('Page.navigate', { url: PAGE_URL });
  for (let i = 0; i < 100; i++) { if (await evalJs(`typeof Settings!=='undefined'`)) break; await sleep(150); }
  await sleep(500);

  await evalJs(`document.getElementById('settings-toggle').click()`); await sleep(400);
  await evalJs(`document.querySelector('.settings-tab[data-tab="display"]').click()`); await sleep(450);

  const cats = ['display-clock', 'display-ui', 'display-lang', 'display-cursor', 'display-appearance'];
  for (const c of cats) {
    ok(`category ${c}: header button + aria-expanded=true + body visible`,
      await evalJs(`(()=>{
        const cat=document.querySelector('.setting-category[data-group="${c}"]');
        if(!cat) return false;
        const h=cat.querySelector('.setting-category-header');
        const b=cat.querySelector('.setting-category-body');
        return h && h.getAttribute('aria-expanded')==='true' && !b.hidden;
      })()`));
  }

  await evalJs(`document.querySelector('.setting-category[data-group="display-clock"] .setting-category-header').click()`);
  await sleep(600);
  ok('folded display-clock: aria-expanded=false + body hidden + state saved',
    await evalJs(`(()=>{
      const cat=document.querySelector('.setting-category[data-group="display-clock"]');
      const b=cat.querySelector('.setting-category-body');
      const st=Settings.getState().foldedGroups;
      return cat.querySelector('.setting-category-header').getAttribute('aria-expanded')==='false'
        && b.hidden===true && st['display-clock']===true;
    })()`));
  ok('chevron rotated when folded',
    await evalJs(`(()=>{
      const c=document.querySelector('.setting-category[data-group="display-clock"] .setting-category-chevron');
      return getComputedStyle(c).transform.includes('matrix(0, -1, 1, 0');
    })()`));
  ok('fold state persists to storage',
    await evalJs(`new Promise(r=>setTimeout(()=>r(JSON.parse(localStorage.getItem('unitab_settings')).foldedGroups['display-clock']===true),400))`));

  await evalJs(`document.querySelector('.setting-category[data-group="display-clock"] .setting-category-header').click()`);
  await sleep(600);
  ok('unfolded display-clock: visible again',
    await evalJs(`(()=>{
      const cat=document.querySelector('.setting-category[data-group="display-clock"]');
      return cat.querySelector('.setting-category-header').getAttribute('aria-expanded')==='true'
        && !cat.querySelector('.setting-category-body').hidden;
    })()`));

  await evalJs(`document.querySelector('.setting-category[data-group="display-clock"] .setting-category-header').click()`);
  await sleep(600);
  await send('Page.reload');
  for (let i = 0; i < 100; i++) { if (await evalJs(`typeof Settings!=='undefined'`)) break; await sleep(150); }
  await sleep(400);
  await evalJs(`document.getElementById('settings-toggle').click()`); await sleep(400);
  await evalJs(`document.querySelector('.settings-tab[data-tab="display"]').click()`); await sleep(450);
  ok('display-clock stays folded after reload',
    await evalJs(`(()=>{
      const cat=document.querySelector('.setting-category[data-group="display-clock"]');
      return cat.querySelector('.setting-category-header').getAttribute('aria-expanded')==='false'
        && cat.querySelector('.setting-category-body').hidden===true;
    })()`));
  ok('display-ui stays unfolded after reload',
    await evalJs(`(()=>{
      const cat=document.querySelector('.setting-category[data-group="display-ui"]');
      return cat.querySelector('.setting-category-header').getAttribute('aria-expanded')==='true'
        && !cat.querySelector('.setting-category-body').hidden;
    })()`));

  await evalJs(`document.querySelector('.settings-tab[data-tab="advanced"]').click()`); await sleep(450);
  ok('advanced sections are collapsible categories',
    await evalJs(`(()=>{
      const secs=[...document.querySelectorAll('#tab-panel-advanced .advanced-section')];
      return secs.length===4 && secs.every(s=>s.classList.contains('setting-category') && s.dataset.group);
    })()`));
  await evalJs(`document.querySelector('.setting-category[data-group="adv-danger"] .setting-category-header').click()`);
  await sleep(600);
  ok('advanced danger section folds',
    await evalJs(`(()=>{
      const s=document.querySelector('.setting-category[data-group="adv-danger"]');
      return s.querySelector('.setting-category-header').getAttribute('aria-expanded')==='false'
        && s.querySelector('.setting-category-body').hidden===true;
    })()`));

  await evalJs(`document.querySelector('.settings-tab[data-tab="search"]').click()`); await sleep(450);
  ok('search-custom group hidden when engine != custom',
    await evalJs(`(()=>{
      const c=document.querySelector('.setting-category[data-group="search-custom"]');
      return c && c.hidden===true;
    })()`));
  await evalJs(`(()=>{
    const w=document.getElementById('engine-select-wrapper');
    w.querySelector('.custom-select-trigger').click();
    [...w.querySelectorAll('.custom-select-option')].find(o=>o.dataset.value==='custom').click();
  })()`);
  await sleep(600);
  ok('search-custom group shows when engine == custom',
    await evalJs(`(()=>{
      const c=document.querySelector('.setting-category[data-group="search-custom"]');
      return c && c.hidden===false && Settings.getState().engine==='custom';
    })()`));

  await evalJs(`(()=>{
    const w=document.getElementById('language-select-wrapper');
    w.querySelector('.custom-select-trigger').click();
    [...w.querySelectorAll('.custom-select-option')].find(o=>o.dataset.value==='en').click();
  })()`);
  await sleep(600);
  await evalJs(`document.querySelector('.settings-tab[data-tab="display"]').click()`); await sleep(450);
  ok('fold state survives language switch to EN',
    await evalJs(`(()=>{
      const cat=document.querySelector('.setting-category[data-group="display-clock"]');
      return cat.querySelector('.setting-category-body').hidden===true
        && cat.querySelector('[data-i18n="settings.group.display.clock"]').textContent==='Clock';
    })()`));

  const code = finish();
  close();
  return code;
}
