// S11d/e の受け入れ試験（7207f8a では落ちてよい）。design/34 §14・§15 と S11e 追加指示。
// このファイルを <worktree>/app/tests/ へ写し、npx playwright test s11d-design-14-15.spec.js --project=chromium --workers=1
import { test, expect } from '@playwright/test';
import { openApp, seed, ev, dbEvents, enableCalendars } from './helpers.js';
// 横の帯の位置は仮値。実機 D-16 のスクショで検証してから、ここ1か所を直す。
const GEO = Object.freeze({ portrait: { width:466,height:678 }, landscape:{width:678,height:466}, rail:84, homeBand:33, landRailX:594, landHomeY:433 });
// つまみ（下）の見た目の箱と押せる範囲（S11h の食い違いの整理、2026-11-22 品質。親の訂正どおり）。
// 帯なし: §18-2 で見た目の箱も押せる範囲も 56（縦 y581〜637、横 y369〜425）。§17-2 の「上に足した 12 は何もしない」はなくなった。線は 縦 y611〜615、横 y399〜403。
// 帯あり: 見た目も押せる範囲も 44 のまま（縦 y593〜637、横 y381〜425）。
const NB = Object.freeze({ boxP: [8, 581, 402, 637], boxL: [382, 369, 614, 425], hitP: [581, 637], hitL: [369, 425], lineP: [611, 615], lineL: [399, 403] });
const BAND = Object.freeze({ boxP: [8, 593, 374, 637], boxL: [382, 381, 594, 425], hitP: [593, 637], hitL: [381, 425] });
const DAY='2026-11-12';
const EVENTS=[...Array.from({length:7},(_,i)=>ev(`q${i}`,`予定${i}`,`${DAY}T${String(9+i).padStart(2,'0')}:00`,`${DAY}T${String(9+i).padStart(2,'0')}:30`))];
const r = (loc)=>loc.evaluate(e=>{const b=e.getBoundingClientRect();return [b.left,b.top,b.right,b.bottom].map(v=>Math.round(v*100)/100);});
const near=(a,b,msg='')=>expect(Math.abs(a-b),`${msg}: ${a} vs ${b}`).toBeLessThanOrEqual(.6);
const rect=(a,b,msg='')=>{expect(a.length).toBe(b.length);a.forEach((v,i)=>near(v,b[i],`${msg}[${i}]`));};
async function boot(page,{sar=GEO.rail,fresh=false,data=true}={}){
 await page.addInitScript(sar=>document.addEventListener('DOMContentLoaded',()=>document.documentElement.style.setProperty('--sar',`${sar}px`)),sar);
 await openApp(page,GEO.portrait,'',fresh?{fresh:true}:{});
 if(data)await seed(page,EVENTS);
 const m=page.getByRole('button',{name:'月',exact:true});if(await m.isVisible().catch(()=>false)){await m.click();await page.waitForTimeout(250);}
 await page.waitForTimeout(300);
}
async function toStage(page,n){const g=page.locator('.mgrab');await g.focus();for(let i=0;i<8;i++){const s=Number(await page.locator('.mpull').getAttribute('data-stage'));if(s===n)break;await page.keyboard.press(s<n?'ArrowUp':'ArrowDown');}await page.waitForTimeout(450);}
async function moreGo(page,name){await page.locator('.cmore').click();await page.getByRole('menuitem',{name}).click();await page.waitForTimeout(500);}
async function editNote(page){await page.locator('[data-act="daynote"]:visible').first().click();await page.waitForTimeout(450);await page.locator('.nsheet .ned-body').click();await page.waitForTimeout(200);}
const visRects=(page,selector)=>page.locator(selector).evaluateAll(es=>es.filter(e=>{const c=getComputedStyle(e),b=e.getBoundingClientRect();return c.visibility!=='hidden'&&Number(c.opacity)>.05&&b.width>0&&b.height>0;}).map(e=>{const b=e.getBoundingClientRect();return [b.left,b.top,b.right,b.bottom];}));

test('§14 帯あり横: 格子 x8〜374 y64〜424・行60×6・2件、日の欄 x382〜594・つまみ（上）なし（つまみ（下）は §17-3 で使う）',async({page})=>{
 await boot(page);await page.setViewportSize(GEO.landscape);await page.waitForTimeout(650);
 const g=page.locator('.mgrid:not([data-leaving])');rect(await r(g),[8,64,374,424],'格子');
 await expect(g.locator('.week')).toHaveCount(6);
 for(const w of await g.locator('.week').all()){const b=await r(w);near(b[3]-b[1],60,'行');}
 const d=g.locator(`[data-date="${DAY}"]`);const n=await d.locator('.chip').evaluateAll(es=>es.filter(e=>Number(getComputedStyle(e).opacity)>.5).length);expect(n).toBe(2);
 rect(await r(page.locator('.mday')),[382,0,GEO.landRailX,466],'日の欄');
 expect((await visRects(page,'.mgrab')).length,'横にはつまみ（上）がない').toBe(0);
});

test('§14 帯あり横: 右の列と「…」メニュー・ノートのシート',async({page})=>{
 await boot(page);await page.setViewportSize(GEO.landscape);await page.waitForTimeout(650);
 for(const [s,y]of [['.ctask',172],['.cmore',232],['.cadd',377]]){rect(await r(page.locator(s)),[608,y-4,664,y+52],s);rect(await r(page.locator(`${s} > :first-child`)),[612,y,660,y+48],`${s} 丸`);}
 await page.locator('.cmore').click();rect(await r(page.getByRole('menu')),[362,189,586,425],'メニュー');await page.keyboard.press('Escape');
 await editNote(page);rect(await r(page.locator('.nsheet')),[0,8,594,466],'横のシート');
});

test('§14.5 帯なし横: 格子と日の欄は左右、…・タスクは見出し右、＋56・下余白105',async({page})=>{
 await boot(page,{sar:0});await page.setViewportSize(GEO.landscape);await page.waitForTimeout(650);
 rect(await r(page.locator('.mgrid:not([data-leaving])')),[8,64,374,424]);rect(await r(page.locator('.mday')),[382,0,678,466]);
 rect(await r(page.locator('.cmore')),[590,0,634,44]);rect(await r(page.locator('.ctask')),[634,0,678,44]);
 rect(await r(page.locator('.cadd')),[614,369,670,425]);rect(await r(page.locator('.cadd > :first-child')),[618,373,666,421]);
 near(await page.locator('.mday').evaluate(e=>parseFloat(getComputedStyle(e).paddingBottom)),105);
});

test('S11e 横では stage を書き換えず保存しない。横→縦で元の段5へ戻る',async({page})=>{
 await boot(page);await toStage(page,5);
 await page.evaluate(()=>{window.__qaStageWrites=[];const orig=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k.startsWith('duo.ui.v1')){try{window.__qaStageWrites.push(JSON.parse(v).stage);}catch{}}return orig.call(this,k,v);};});
 await page.setViewportSize(GEO.landscape);await page.waitForTimeout(650);
 const s=await page.locator('.mpull').getAttribute('data-stage');expect(s===null||s==='5','横で別の段に書き換えない').toBe(true);
 // 横で保存を起こしうる選択・メニューを使い、stage が保存に混じらないことも見る。
 await page.locator('.mgrid:not([data-leaving]) [data-date="2026-11-13"]').click({position:{x:8,y:10}});await page.waitForTimeout(200);
 const writes=await page.evaluate(()=>window.__qaStageWrites);expect(writes.every(v=>v===undefined||v===null),'横の saveUi は stage を書かない').toBe(true);
 await page.setViewportSize(GEO.portrait);await page.waitForTimeout(650);await expect(page.locator('.mpull')).toHaveAttribute('data-stage','5');
});

test('§15① 帯あり縦のシート x0〜382 y152〜678・完了 x326〜370',async({page})=>{
 await boot(page);await editNote(page);rect(await r(page.locator('.nsheet')),[0,152,382,678]);
 const done=page.locator('.nsheet').getByRole('button',{name:/完了/});const b=await r(done);near(b[0],326);near(b[2],370);near(b[3]-b[1],44);
});

test('§15② 帯ありノートは右の列だけに戻す/やり直す、シートの戻す群なし、＋非表示',async({page})=>{
 await boot(page);await editNote(page);
 const undo=await visRects(page,'button[aria-label="元に戻す"]');expect(undo.length,'見える戻すは1つ').toBe(1);rect(undo[0],[396,168,452,224]);
 const redo=await visRects(page,'button[aria-label="やり直す"]');expect(redo.length).toBe(1);rect(redo[0],[396,228,452,284]);
 await expect(page.locator('.cadd')).toBeHidden();expect((await visRects(page,'.nsheet .ned-undo,.nsheet .ned-redo')).length).toBe(0);
 await expect(page.getByRole('button',{name:'元に戻す',exact:true})).toHaveCount(1);await expect(page.getByRole('button',{name:'やり直す',exact:true})).toHaveCount(1);
 expect((await visRects(page,'.cmore')).length,'書いている間その他はやり直すへ').toBe(0);
});

test('§15② 戻す/やり直す: 空履歴の記号 #C9C5BA、使えないとき何もしない、本文焦点保持',async({page})=>{
 await boot(page);await editNote(page);
 const undo=page.getByRole('button',{name:'元に戻す',exact:true}),redo=page.getByRole('button',{name:'やり直す',exact:true});
 const gray=async loc=>loc.evaluate(e=>{const svg=e.querySelector('svg');const c=getComputedStyle(svg||e);return [c.color,c.stroke,svg?.getAttribute('stroke')];});
 expect((await gray(undo)).some(c=>c==='rgb(201, 197, 186)'||c==='#C9C5BA'),'元に戻すの使えない色').toBe(true);
 expect((await gray(redo)).some(c=>c==='rgb(201, 197, 186)'||c==='#C9C5BA'),'やり直すの使えない色').toBe(true);
 const body=page.locator('.ned-body');const before=await body.evaluate(e=>e.value??e.textContent);await undo.click();expect(await body.evaluate(e=>e.value??e.textContent)).toBe(before);
 await body.click();await page.keyboard.type('確認abc');await page.waitForTimeout(500);await undo.click();await redo.click();await expect(body).toBeFocused();expect(await body.evaluate(e=>e.value??e.textContent)).toContain('確認abc');
});

test('§15③ 帯なし縦: タスク/…44、今日へ64、見出し中心233、＋は見える48・押せる56',async({page})=>{
 await boot(page,{sar:0});rect(await r(page.locator('.ctask')),[414,0,458,44]);rect(await r(page.locator('.cmore')),[370,0,414,44]);
 rect(await r(page.locator('.cadd')),[402,581,458,637]);rect(await r(page.locator('.cadd > :first-child')),[406,585,454,633]);
 await page.locator('.mph [data-act="next"]').click({force:true});await page.waitForTimeout(400);await page.locator('.mph [data-act="next"]').click({force:true});await page.waitForTimeout(400);
 rect(await r(page.getByRole('button',{name:'今日へ'})),[306,0,370,44]);
 const h=await r(page.locator('.mph h2'));near((h[0]+h[2])/2,195,'題名箱 x84〜306 の中央');
 await page.locator('.cmore').click();rect(await r(page.getByRole('menu')),[190,48,414,284]);
});

test('§15③ 帯なし縦: 日の欄の下余白105、送り切ると最後の内容が＋上端581の8上',async({page})=>{
 await boot(page,{sar:0});await toStage(page,7);
 // v19.3 征希さんの要望（つまみだけで段・月ごとスクロール）で仕様変更: 閉じた縦は画面（.mpull.browse）が1本で流れ、下の余白 105 は日の欄の中身の箱（.mdin）が持つ。前→後: .mday の padding-bottom → .mdin、.mday.scrollTop → 画面の scrollTop、最後の内容は .mdin の子で見る
 const pane=page.locator('.mday');near(await pane.locator('.mdin').evaluate(e=>parseFloat(getComputedStyle(e).paddingBottom)),105);
 await pane.evaluate(e=>{const s=e.closest('.mpull.browse');s.scrollTop=s.scrollHeight;});await page.waitForTimeout(300);
 const bottom=await pane.evaluate(e=>Math.max(...[...e.querySelectorAll('.mdin *')].filter(x=>x.getBoundingClientRect().height>0).map(x=>x.getBoundingClientRect().bottom)));expect(bottom).toBeLessThanOrEqual(573.6);
});

// v19.3 征希さん『カード・時間で分けるだけ』で仕様変更: 時間（B）の1時間は 44 → 28（最低限。design/35 §5.3）
test('§15④ ホームのタイムライン → 段7・日の欄B（時間・最低限＝1時間28）、別の日の画面を開かない',async({page})=>{
 await boot(page);await moreGo(page,/ホーム/);await page.locator('.home').getByRole('button',{name:'タイムライン',exact:true}).click();await page.waitForTimeout(500);
 await expect(page.locator('.shell.closed.tv-day')).toHaveCount(0);await expect(page.locator('.mpull')).toHaveAttribute('data-stage','7');await expect(page.locator('.mday')).toHaveAttribute('data-dg','B');
 const hh=await page.locator('.mday .hour').evaluateAll(es=>es.slice(0,2).map(e=>e.getBoundingClientRect().top));expect(hh.length).toBe(2);near(hh[1]-hh[0],28);
});

test('望ましい: 週の時間軸の見出し中心は x191（帯あり）',async({page})=>{
 await boot(page);await moreGo(page,'週の時間軸');
 // 箱（h2 は x0〜382）ではなく、見えている文字の範囲で見る。7207f8a は文字の中心が約 x251。
 const c=await page.locator('#ctitle').evaluate(e=>{const g=document.createRange();g.selectNodeContents(e);const b=g.getBoundingClientRect();return (b.left+b.right)/2;});near(c,191,'文字の中心');
});

test('S11e ヒントは指定の2行・13/400/18・上下内側8・段1で y520〜572、二度目は出さない',async({page})=>{
 await boot(page,{fresh:true,data:false});const h=page.locator('.mhint');await expect(h).toBeVisible();rect(await r(h),[56,520,326,572]);
 const q=await h.evaluate(e=>{const c=getComputedStyle(e);return{t:e.innerText,fs:c.fontSize,fw:c.fontWeight,lh:c.lineHeight,pt:c.paddingTop,pb:c.paddingBottom};});
 expect(q.t).toBe('上下に引くと、月・2週・1週が切り替わります。\n左右に送ると、前後の月へ動きます。');expect([q.fs,q.fw,q.lh,q.pt,q.pb]).toEqual(['13px','400','18px','8px','8px']);
 await page.mouse.click(50,30);await page.waitForTimeout(250);await page.reload();await page.waitForSelector('html[data-ready]');await page.waitForTimeout(500);await expect(page.locator('.mhint')).toHaveCount(0);
});

test('S11e ヒントは横では出さず、初めて縦で開いたら出す',async({page})=>{
 await page.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>document.documentElement.style.setProperty('--sar','84px')));
 await openApp(page,GEO.landscape,'',{fresh:true});await page.waitForTimeout(500);await expect(page.locator('.mhint')).toHaveCount(0);
 await page.setViewportSize(GEO.portrait);await page.waitForTimeout(500);await expect(page.locator('.mhint')).toBeVisible();
});

test('S11e フォーカス: 指タップ後は枠なし、キーボードは :focus-visible 太さ2・#2F6B4F・角丸4・内側2',async({page})=>{
 await boot(page);const g=page.locator('.mgrab');await g.click();
 const style=()=>g.evaluate(e=>{const c=getComputedStyle(e);return{fv:e.matches(':focus-visible'),os:c.outlineStyle,ow:c.outlineWidth,oc:c.outlineColor,off:c.outlineOffset,rad:c.borderRadius};});
 const tap=await style();expect(tap.fv).toBe(false);expect(tap.os==='none'||tap.ow==='0px').toBe(true);
 await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');const kb=await style();expect(kb.fv,'キーボードで枠を消さない').toBe(true);expect([kb.os,kb.ow,kb.oc,kb.rad,kb.off]).toEqual(['solid','2px','rgb(47, 107, 79)','4px','-2px']);
});

// S11e (a) B-1: 見えない「前の月」「次の月」の送る幅は今の段で決める（34 §9.1-1・§10・§12 Q-14）。段1〜3は1か月、段4〜6は1週（7日）、段7は7日。
// 保存に monthForm がなく段だけある初回の形（monthForm 既定 'two' と食い違う）と、まっさらの起動の両方で見る。押し方は detail=0 の合成クリック（VoiceOver・スイッチと同じ）。
const STEP = { 1: 'm', 2: 'm', 3: 'm', 4: 7, 5: 7, 6: 7, 7: 7 };
const addDays = (k, n) => { const d = new Date(`${k}T12:00:00+09:00`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const addMonths = (k, n) => { const [y, m, d] = k.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1 + n, 1)); const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate(); return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`; };
const selOf = (page) => page.evaluate(() => document.querySelector('.mgrid:not([data-leaving]) .day[aria-selected="true"], .mgrid:not([data-leaving]) .day.selected')?.dataset.date);
const press0 = (page, dir) => page.locator(`.mph [data-act="${dir}"]`).first().evaluate((e) => e.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 0 })));
for (const n of [1, 2, 3, 4, 5, 6, 7]) {
  test(`S11e(a) 段${n}（保存は段だけ）: 見えない「次の月」「前の月」は ${STEP[n] === 'm' ? '1か月' : '7日'}送る`, async ({ page }) => {
    await page.addInitScript(({ n }) => { if (!sessionStorage.getItem('qa-set')) { localStorage.setItem('duo.ui.v1', JSON.stringify({ stage: n, home: false })); sessionStorage.setItem('qa-set', '1'); } }, { n });
    await page.addInitScript(() => document.addEventListener('DOMContentLoaded', () => document.documentElement.style.setProperty('--sar', '84px')));
    await openApp(page, GEO.portrait, '', { fresh: true }); await page.waitForTimeout(400);
    await expect(page.locator('.mpull')).toHaveAttribute('data-stage', String(n));
    const k0 = await selOf(page); expect(k0).toBeTruthy();
    const want = STEP[n] === 'm' ? addMonths(k0, 1) : addDays(k0, 7);
    await press0(page, 'next'); await page.waitForTimeout(450); expect(await selOf(page), `段${n} 次`).toBe(want);
    await press0(page, 'prev'); await page.waitForTimeout(450); expect(await selOf(page), `段${n} 前`).toBe(STEP[n] === 'm' ? addMonths(want, -1) : k0);
    await expect(page.locator('.mpull')).toHaveAttribute('data-stage', String(n));
  });
}
test('S11e(a) まっさらの初回起動（段1）: detail=0 の「次の月」で見出しの月が1回で変わる', async ({ page }) => {
  await boot(page, { fresh: true, data: false });
  const t0 = await page.locator('#ctitle').textContent(); const k0 = await selOf(page);
  await press0(page, 'next'); await page.waitForTimeout(450);
  expect(await page.locator('#ctitle').textContent()).not.toBe(t0); expect(await selOf(page)).toBe(addMonths(k0, 1));
});
test('a11y: 段を往復して同期した後も detail=0 の「次の月」「前の月」が使える', async ({ page }) => {
  await boot(page, { fresh: true, data: false }); await toStage(page, 4); await toStage(page, 1);
  for (const [dir, title] of [['next', '2026年12月'], ['prev', '2026年11月']]) { await page.locator(`.mph [data-act="${dir}"]`).evaluate((e) => e.click()); await page.waitForTimeout(450); await expect(page.locator('#ctitle')).toHaveText(title); }
});

// S11e (b): 画面の記憶は閉じた画面と開いた画面で分ける。閉じた画面が読み書きするのは 段（stage）・選んだ日（selected）・日の欄のつまみの段（dayGrip）だけ。
const OPEN = { width: 626, height: 890 };
const CLOSED_KEYS = ['stage', 'selected', 'dayGrip'];
async function openSideView(page, how) {
  if (how === 'day') { const b = page.getByRole('button', { name: '日', exact: true }).first(); await b.click(); await page.waitForTimeout(400); return '.shell.tv-day'; }
  return null; // 'week'・'home' は起動前に保存値で開いた側を作る（下の preset）

}
const PRESET = { week: { view: 'week', home: false }, home: { home: true } };
for (const how of ['day', 'week', 'home']) {
  test(`S11e(b) 開いた縦で「${how}」→ 閉じた画面で起動し日を選ぶ → 開くと元の画面。開いた側の保存値は変わらない`, async ({ page }) => {
    if (PRESET[how]) await page.addInitScript((p) => { if (!sessionStorage.getItem('qa-set')) { const k = 'duo.ui.v1'; let s = {}; try { s = JSON.parse(localStorage.getItem(k) || '{}') || {}; } catch { s = {}; } localStorage.setItem(k, JSON.stringify({ ...s, ...p })); sessionStorage.setItem('qa-set', '1'); } }, PRESET[how]);
    await openApp(page, OPEN); await seed(page, EVENTS); await page.waitForTimeout(300);
    const sel = await openSideView(page, how);
    const snap = () => page.evaluate(() => JSON.parse(localStorage.getItem('duo.ui.v1') || '{}'));
    const shellCls = () => page.evaluate(() => document.querySelector('.shell')?.className || '');
    const before = await snap(), cls0 = await shellCls();
    await page.setViewportSize(GEO.portrait); await page.reload(); await page.waitForSelector('html[data-ready]'); await page.waitForTimeout(500);
    await page.locator('.mgrid:not([data-leaving]) .day[data-date="2026-11-13"]').click({ position: { x: 20, y: 18 } }); await page.waitForTimeout(300); // saveUi が走る操作
    const mid = await snap();
    const changed = Object.keys(before).filter( // 開いた側で保存してあった値が変わったか（足された既定値は見ない）
      (k) => JSON.stringify(before[k]) !== JSON.stringify(mid[k]) && !CLOSED_KEYS.includes(k));
    expect(changed, '閉じた画面が書き換えた開いた側のキー').toEqual([]);
    await page.setViewportSize(OPEN); await page.waitForTimeout(600);
    if (sel) await expect(page.locator(sel)).toHaveCount(1);
    const cls1 = await shellCls(); expect(cls1.split(/\s+/).filter((c) => /^tv-|^home|^v-/.test(c)).sort(), '開くと元の画面').toEqual(cls0.split(/\s+/).filter((c) => /^tv-|^home|^v-/.test(c)).sort());
    await page.reload(); await page.waitForSelector('html[data-ready]'); await page.waitForTimeout(400);
    const cls2 = await shellCls(); expect(cls2.split(/\s+/).filter((c) => /^tv-|^home|^v-/.test(c)).sort(), '開いた画面で読み込み直しても元の画面').toEqual(cls0.split(/\s+/).filter((c) => /^tv-|^home|^v-/.test(c)).sort());
  });
}


// ===== design/34 §16（2026-11-21。S11e/S11f で入る。0568d18 では落ちてよい） =====
const LINE = 'rgb(228, 224, 214)';
const hasTopLine = (el) => { const c = getComputedStyle(el), b = getComputedStyle(el, '::before'), a = getComputedStyle(el, '::after');
  const line = 'rgb(228, 224, 214)';
  if (parseFloat(c.borderTopWidth) > 0 && parseFloat(c.borderTopWidth) <= 1 && c.borderTopColor === line && c.borderTopStyle !== 'none') return true;
  if (c.boxShadow.includes(line)) return true;
  for (const p of [b, a]) if (p.content !== 'none' && (p.backgroundColor === line || p.borderTopColor === line) && parseFloat(p.height) <= 1) return true;
  return false; };
async function gripAt(page) { return page.evaluate((fn) => { const hasTopLine = eval(fn); const d = document.querySelector('.mpull.browse .mday') || document.querySelector('.mday'), g = d.querySelector('.mdgrab'); const gb = g.getBoundingClientRect(), db = d.getBoundingClientRect(); const ln = g.querySelector('i')?.getBoundingClientRect(); const hit = document.elementFromPoint(191, gb.top + 22); return { r: [gb.left, gb.top, gb.right, gb.bottom], pane: [db.top, db.bottom], line: ln && [ln.left, ln.top, ln.right, ln.bottom], pos: getComputedStyle(g).position, topLine: hasTopLine(g), hit: !!hit && (hit === g || g.contains(hit)), z: getComputedStyle(g).zIndex, st: d.scrollTop, max: d.scrollHeight - d.clientHeight }; }, hasTopLine.toString()); }
// v19.3 征希さんの要望（つまみだけで段・月ごとスクロール）で仕様変更: 閉じた縦で「日の欄を送る」は、日の欄の中ではなく画面（.mpull.browse[data-stage]）の1本を送る（閉じた横は今までどおり .mday の中）。下の「送り切る」「送る」はこの口を使う
const scrollEnd = (page) => page.locator('.mpull.browse .mday').evaluate((d) => { const s = d.closest('.mpull.browse[data-stage]') || d; s.scrollTop = s.scrollHeight; });

// v19.3 征希さん『カード・時間で分けるだけ』で仕様変更: §16-1（つまみ（下）を日の欄の下端に貼り付ける。段2〜7・段1・帯なし） の試験は外した。カードにつまみ（下）は無く、時間のバーは見出しのすぐ下で貼り付けない（design/35 §5.2〜§5.4「§16-1・§17-1・§17-2・§18-1・§18-2・§18-4〜§18-7 はすべて捨てる」。品質 §11-2 の切れも無くなる）。代わりの試験: tests/v193-design35-s9.spec.js の S-2・S-7、tests/v193-day-cardtime.spec.js の A-16
for (const n of [2, 4, 7]) {
  // v19.3 征希さんの要望（つまみだけで段・月ごとスクロール）で仕様変更: 閉じた縦で上に貼り付けて残すのは年月と曜日の行だけ。前→後: 日の見出し .mdh は「sticky top:0 z6」→「貼り付けない（position:relative）。画面を送ると日の欄と一緒に流れる」。カードが日の欄の上 20（つまみ（上）の押せる所）に入らないことは同じ（送る量 160 → 60: 段7 でも見出しが年月の下に見えている所で見る）
  test(`§16-2 段${n}（v19.3）: 日の見出し .mdh は貼り付けない（年月と曜日だけが残る）。画面を送ってもカードが日の欄の上 20 に入らない`, async ({ page }) => {
    await boot(page); await toStage(page, n);
    const h = page.locator('.mpull.browse .mday .mdh');
    const st = await h.evaluate((e) => { const c = getComputedStyle(e); return [c.position, c.backgroundColor]; });
    expect(st).toEqual(['relative', 'rgb(239, 236, 228)']);
    expect(await page.locator('.mpull.browse .mpfix').evaluate((e) => getComputedStyle(e).position), '年月と曜日は貼り付く').toBe('sticky');
    const r = await page.locator('.mpull.browse .mday').evaluate(async (d) => { d.closest('.mpull.browse').scrollTop = 60; await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res))); const dt = d.getBoundingClientRect().top, ht = d.querySelector('.mdh').getBoundingClientRect().top; const cards = [...d.querySelectorAll('.mdcard')].filter((c) => { const b = c.getBoundingClientRect(); return b.bottom > dt && b.top < dt + 20; }); const hit = document.elementFromPoint(190, dt + 30); return { dt, ht, cardsInTop20Visible: cards.filter((c) => { const b = c.getBoundingClientRect(); const e = document.elementFromPoint(190, Math.max(dt + 1, b.top + 1)); return !!e && c.contains(e); }).length, hitHead: !!hit?.closest('.mdh') }; });
    near(r.ht, r.dt, '見出しは日の欄の上端に貼り付く');
    expect(r.cardsInTop20Visible, '上 20 にカードが見えて入らない').toBe(0);
    expect(r.hitHead, '上端から 30 は見出し').toBe(true);
  });
}
test('§16-2 段1は .mdh を貼り付けない', async ({ page }) => {
  await boot(page); await toStage(page, 1);
  expect(await page.locator('.mpull.browse .mday .mdh').evaluate((e) => getComputedStyle(e).position)).not.toBe('sticky');
});
test('§16-2 D1: 押して 0.22 秒はマスの地 #E2DDD2、つかんで（0.35 秒）0.10 秒で元の地へ。0.50 秒で元の地', async ({ page }) => {
  await boot(page); await toStage(page, 1);
  const cellSel = `.mgrid:not([data-leaving]) .day[data-date="${DAY}"]`;
  const bg0 = await page.locator(cellSel).evaluate((e) => getComputedStyle(e).backgroundColor);
  const chip = page.locator(`${cellSel} .strip.chip`).last(); const b = await chip.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
  await page.waitForTimeout(220); expect(await page.locator(cellSel).evaluate((e) => getComputedStyle(e).backgroundColor), '0.22 秒').toBe('rgb(226, 221, 210)');
  await page.waitForTimeout(280); expect(await page.locator('.chip.grabbed').count(), 'つかんでいる').toBe(1);
  expect(await page.locator(cellSel).evaluate((e) => getComputedStyle(e).backgroundColor), '0.50 秒は元の地').toBe(bg0);
  await page.mouse.up();
});

// §16-4 元の日へ落としたら取り消し（7207f8a からある不具合。S11f）。Duo の単発・Duo の繰り返しの回・iPhone の予定。
const XCALS = [{ id: 'cal-1', title: '家族', color: '#d93025', sourceId: 's-g', source: 'Google', sourceType: 'caldav', allowsModify: true, isDefault: true }];
const XBASE = { calendarId: 'cal-1', all: false, place: '', notes: '', recurring: false, requestId: null, modifiedAt: 1763100000000, occurrenceDate: null, alarms: [], alarmsExtra: 0, rule: null, ruleText: '', detached: false, allowsModify: true, sourceType: 'caldav', editable: true };
const XDET = [{ ...XBASE, id: 'e1@2026-11-12T15:00', eventId: 'e1', itemId: 'it-e1', externalId: 'ex-e1', title: '歯医者', start: '2026-11-12T15:00', end: '2026-11-12T16:00' }];
async function mockNative(page) {
  await page.addInitScript((c) => {
    const M = window.__mock = { calls: [] };
    window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', nativeCallback: () => 'cb-1',
      nativePromise: async (plugin, method, opts) => { M.calls.push({ method, opts: JSON.parse(JSON.stringify(opts ?? {})) });
        switch (method) {
          case 'checkPermission': case 'requestPermission': return { status: 'granted' };
          case 'listCalendars': return { calendars: c.cals };
          case 'listEvents': return { events: c.det.filter((e) => opts.calendarIds.includes(e.calendarId) && e.start < opts.to && e.end >= opts.from).map(({ editable, reason, allowsModify, sourceType, alarms, alarmsExtra, rule, ruleText, detached, ...e }) => e) };
          case 'getEvent': { const d = c.det.find((x) => x.eventId === opts.eventId); if (!d) throw { code: 'NOT_FOUND' }; return JSON.parse(JSON.stringify(d)); }
          case 'notifyStatus': return { status: 'denied' };
          case 'notifySync': case 'notifyClear': return { scheduled: 0, removed: 0, skipped: 0 };
          case 'selectionHaptic': case 'impactHaptic': case 'notificationHaptic': return { performed: true };
          default: throw { code: 'UNAVAILABLE', message: method };
        } } };
    window.__qaIdbW = 0;
    for (const m of ['put', 'add', 'delete', 'clear']) { const o = IDBObjectStore.prototype[m]; IDBObjectStore.prototype[m] = function (...a) { window.__qaIdbW++; return o.apply(this, a); }; }
  }, { cals: XCALS, det: XDET });
}
const DROP_SEED = [
  ev('d1', '撮影', '2026-11-12T10:00', '2026-11-12T11:00'),
  ev('d3', '定例', '2026-11-12T09:00', '2026-11-12T09:30', { recurrence: { freq: 'weekly', interval: 1, byDay: [4] } }),
];
const READ = new Set(['checkPermission', 'requestPermission', 'listCalendars', 'listEvents', 'getEvent', 'notifyStatus', 'notifySync', 'notifyClear']);
const HAPT = new Set(['selectionHaptic', 'impactHaptic', 'notificationHaptic']);
for (const [kind, title, id] of [['単発', '撮影', 'd1'], ['繰り返しの回', '定例', 'd3'], ['iPhone の予定', '歯医者', null]]) {
  for (const how of ['その場で離す', '別の日へ動かしてから元の日へ戻して離す']) {
    test(`§16-4 ${kind}（${title}）を${how}: 取り消し。IndexedDB 書き込み 0・overrides/updatedAt 不変・知らせ/元に戻す/触覚なし・iPhone へ書かない`, async ({ page }) => {
      await mockNative(page);
      await page.addInitScript(() => document.addEventListener('DOMContentLoaded', () => document.documentElement.style.setProperty('--sar', '84px')));
      await openApp(page, GEO.portrait);
      await page.evaluate(() => { const o = JSON.parse(localStorage.getItem('duo.ui.v1') || '{}'); localStorage.setItem('duo.ui.v1', JSON.stringify({ ...o, style: 'named', home: false })); });
      await seed(page, DROP_SEED); await enableCalendars(page);
      const m = page.getByRole('button', { name: '月', exact: true }); if (await m.isVisible().catch(() => false)) { await m.click(); await page.waitForTimeout(300); }
      await toStage(page, 1);
      const cellSel = `.mgrid:not([data-leaving]) .day[data-date="${DAY}"]`;
      const chip = page.locator(`${cellSel} .strip.chip`, { hasText: title }).first(); await expect(chip).toBeVisible();
      const db0 = await dbEvents(page); const pick = (l) => l.filter((e) => !id || e.id === id).map((e) => [e.id, JSON.stringify(e.overrides || {}), e.updatedAt]);
      const b = await chip.boundingBox(); const x = b.x + b.width / 2, y = b.y + b.height / 2;
      await page.mouse.move(x, y); await page.mouse.down(); await page.waitForTimeout(450);
      await expect(page.locator('.chip.grabbed')).toHaveCount(1);
      const w0 = await page.evaluate(() => ({ idb: window.__qaIdbW, hl: (window.__duoHapticLog || []).length, calls: window.__mock.calls.length }));
      if (how.startsWith('別の日')) { const o = await page.locator(`.mgrid:not([data-leaving]) .day[data-date="2026-11-13"]`).boundingBox(); await page.mouse.move(o.x + o.width / 2, o.y + 40, { steps: 8 }); await page.waitForTimeout(150); await page.mouse.move(x, y, { steps: 8 }); await page.waitForTimeout(150); }
      const w1 = await page.evaluate(() => ({ idb: window.__qaIdbW, hl: (window.__duoHapticLog || []).length, calls: window.__mock.calls.length }));
      await page.mouse.up(); await page.waitForTimeout(700);
      const r = await page.evaluate(() => ({ idb: window.__qaIdbW, hl: (window.__duoHapticLog || []).length, after: window.__mock.calls }));
      const later = r.after.slice(w1.calls).map((c) => c.method);
      expect(r.idb - w0.idb, 'IndexedDB への書き込み').toBe(0);
      expect(later.filter((mm) => HAPT.has(mm)), '離したあとの触覚').toEqual([]);
      expect(later.filter((mm) => !READ.has(mm) && !HAPT.has(mm)), 'iPhone への書き込み').toEqual([]);
      expect(r.hl - w0.hl, '__duoHapticLog').toBe(0);
      await expect(page.locator('#native-toast'), '知らせ・元に戻す').toHaveCount(0);
      if (id) expect(pick(await dbEvents(page)), 'overrides・updatedAt 不変').toEqual(pick(db0));
      expect((await dbEvents(page)).length, '予定の数').toBe(db0.length);
      await expect(page.locator(`${cellSel} .strip.chip`, { hasText: title }).first(), '元の日に残る').toBeVisible();
    });
  }
}

// v19.3 征希さん『カード・時間で分けるだけ』で仕様変更: §17-1（貼り付いたつまみの下を埋める）・§17-2／§18-2（帯なしのつまみの箱）・§17-3（閉じた横のつまみ（下）） の試験は外した。カードにつまみ（下）は無く、時間のバーは見出しのすぐ下で貼り付けない（design/35 §5.2〜§5.4「§16-1・§17-1・§17-2・§18-1・§18-2・§18-4〜§18-7 はすべて捨てる」。品質 §11-2 の切れも無くなる）。代わりの試験: tests/v193-design35-s9.spec.js の S-2・S-7、tests/v193-day-cardtime.spec.js の A-16
// §17-5 帯なしの横でノートを書いている間、タスクのバッジ（#B43C3C、x660〜678 y0〜18）がシートの上に出ない。
// 判定（8cd8a6c で直した。設計の「または隠す」も通す）: ①シートの領域（y8〜）の右上に赤い画素が 0、②バッジが見えない（display/visibility/opacity）か、見えるならシートより奥。
// 閉じるとバッジが戻ること、帯あり・縦では今までどおり見えることも見る。
const RED = (r, g, b) => r > 150 && r < 215 && g < 95 && b < 95;
async function redCount(page, clip) {
  const png = await page.screenshot({ clip });
  return page.evaluate(async ({ b64, w, h }) => {
    const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data; let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] > 150 && d[i] < 215 && d[i + 1] < 95 && d[i + 2] < 95) n++;
    return n;
  }, { b64: png.toString('base64'), w: clip.width, h: clip.height });
}
const badgeState = (page) => page.evaluate(() => {
  const b = document.querySelector('.ctask .bdg'); if (!b) return { exists: false, shown: false };
  let shown = b.checkVisibility ? b.checkVisibility({ opacityProperty: true, visibilityProperty: true }) : true;
  for (let e = b; e && shown; e = e.parentElement) { const c = getComputedStyle(e); if (c.display === 'none' || c.visibility === 'hidden' || Number(c.opacity) <= 0.05) shown = false; }
  const r = b.getBoundingClientRect(); return { exists: true, shown, r: [r.left, r.top, r.right, r.bottom] };
});
async function seedTask(page) {
  await page.evaluate(async (d) => { const m = await import('/js/db.js'); await m.putTask({ id: 'qa-t1', title: '今日のタスク', due: { date: d, time: null }, done: false, doneAt: null, createdAt: 1, updatedAt: 1, order: 1, note: '', notify: false }); }, DAY);
  await page.reload(); await page.waitForSelector('html[data-ready]'); await page.waitForTimeout(400);
}
async function closeSheet(page) {
  await page.locator('.nsheet .ned-done').click(); await page.waitForTimeout(500);
  if (await page.locator('.nsheet').isVisible()) { await page.keyboard.press('Escape'); await page.waitForTimeout(500); }
  if (await page.locator('.nsheet').isVisible()) { await page.locator('.nsheet .ned-done').click(); await page.waitForTimeout(500); }
  await expect(page.locator('.nsheet')).toBeHidden();
}
test('§17-5 横・帯なしでノートを書いている間、シートの領域に赤い画素がなく、バッジは見えないかシートの奥。閉じると戻る', async ({ page }) => {
  await boot(page, { sar: 0 }); await seedTask(page); await page.setViewportSize(GEO.landscape); await page.waitForTimeout(650);
  const b0 = await badgeState(page); expect(b0.shown, '前提: 書く前はバッジが見える').toBe(true);
  expect(b0.r[1], '前提: バッジは y0〜18').toBeLessThan(18);
  expect(await redCount(page, { x: 640, y: 0, width: 38, height: 22 }), '前提: 書く前は赤い画素がある').toBeGreaterThan(20);
  await editNote(page);
  const sh = await r(page.locator('.nsheet')); near(sh[1], 8, 'シートの上端');
  expect(await redCount(page, { x: 560, y: 8, width: 118, height: 60 }), 'シートの右上（y8〜68）に赤い画素がない').toBe(0);
  const b1 = await badgeState(page);
  if (b1.shown) {
    const behind = await page.evaluate(() => { const b = document.querySelector('.ctask .bdg'); const st = document.elementsFromPoint(669, 13); const ib = st.findIndex((e) => e === b || b.contains(e)), is = st.findIndex((e) => e.closest('.nsheet')); return ib < 0 || (is >= 0 && is < ib); });
    expect(behind, 'バッジが見えるならシートの奥').toBe(true);
  }
  await closeSheet(page);
  const b2 = await badgeState(page); expect(b2.shown, '閉じるとバッジが戻る').toBe(true);
  expect(await redCount(page, { x: 640, y: 0, width: 38, height: 22 }), '閉じると赤い画素が戻る').toBeGreaterThan(20);
});
for (const [name, sar, size] of [['縦・帯あり', 84, GEO.portrait], ['縦・帯なし', 0, GEO.portrait], ['横・帯あり', 84, GEO.landscape]]) {
  test(`§17-5 ${name}: ふだんはバッジが見える（赤い画素あり）。ノートを閉じたあとも見える`, async ({ page }) => {
    await boot(page, { sar }); await seedTask(page); if (size === GEO.landscape) { await page.setViewportSize(size); await page.waitForTimeout(650); }
    const b0 = await badgeState(page); expect(b0.shown, 'バッジが見える').toBe(true);
    const c = { x: Math.max(0, b0.r[0] - 4), y: Math.max(0, b0.r[1] - 4), width: 26, height: 26 };
    expect(await redCount(page, c), '赤い画素がある').toBeGreaterThan(20);
    await editNote(page); const mid = await badgeState(page);
    test.info().annotations.push({ type: 'note-editing', description: `${name}: 書いている間のバッジ shown=${mid.shown}` });
    await closeSheet(page);
    const b2 = await badgeState(page); expect(b2.shown, '閉じたあと見える').toBe(true);
    expect(await redCount(page, { x: Math.max(0, b2.r[0] - 4), y: Math.max(0, b2.r[1] - 4), width: 26, height: 26 }), '閉じたあと赤い画素がある').toBeGreaterThan(20);
  });
}
// 連携 低①: 閉じた画面でバックアップを書き出しても settings.view は開いた側の画面（週）。戻すと開いた縦は週。
test('連携 低① 閉じた画面で書き出したバックアップの settings.view は開いた側の値（week）', async ({ page }, info) => {
  await page.addInitScript(() => { if (!sessionStorage.getItem('qa-set')) { const k = 'duo.ui.v1'; let s = {}; try { s = JSON.parse(localStorage.getItem(k) || '{}') || {}; } catch { s = {}; } localStorage.setItem(k, JSON.stringify({ ...s, view: 'week', home: false })); sessionStorage.setItem('qa-set', '1'); } });
  await openApp(page, { width: 626, height: 890 }); await seed(page, EVENTS); await page.waitForTimeout(300);
  await page.setViewportSize(GEO.portrait); await page.reload(); await page.waitForSelector('html[data-ready]'); await page.waitForTimeout(500);
  await page.locator('.cmore').click(); await page.getByRole('menuitem', { name: '設定' }).click();
  await page.getByRole('button', { name: 'バックアップ' }).click(); await expect(page.locator('#backup')).toBeVisible();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'JSONを書き出す' }).click()]);
  const p = info.outputPath('closed-export.json'); await dl.saveAs(p);
  const j = JSON.parse((await import('node:fs')).readFileSync(p, 'utf8'));
  expect(j.settings?.view, '書き出した settings.view').toBe('week');
});

// 連携 低①（8cd8a6c）: 開いた画面で書き出す・開いた画面で面を変えてすぐ（保存前）書き出す・変えてすぐ閉じて書き出す。
const OPEN_P = { width: 626, height: 890 };
async function exportView(page, info, name) {
  await clickSettingsAny(page);
  await page.getByRole('button', { name: 'バックアップ' }).click(); await expect(page.locator('#backup')).toBeVisible();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'JSONを書き出す' }).click()]);
  const p = info.outputPath(name); await dl.saveAs(p);
  return JSON.parse((await import('node:fs')).readFileSync(p, 'utf8')).settings?.view;
}
async function clickSettingsAny(page) {
  const vp = page.viewportSize(); if (Math.min(vp.width, vp.height) < 600) { await page.locator('.cmore').click(); await page.getByRole('menuitem', { name: '設定' }).click(); return; }
  const s = page.getByRole('button', { name: '設定' }).first(); if (await s.isVisible()) { await s.click(); return; }
  await page.locator('[data-act="menu"]').first().click();
}
const openWith = async (page, view) => {
  await page.addInitScript((v) => { if (!sessionStorage.getItem('qa-set')) { localStorage.setItem('duo.ui.v1', JSON.stringify({ view: v, home: false })); sessionStorage.setItem('qa-set', '1'); } }, view);
  await openApp(page, OPEN_P); await seed(page, EVENTS); await page.waitForTimeout(300);
};
const curView = (page) => page.evaluate(() => { const c = document.querySelector('.shell')?.className || ''; return (c.match(/tv-(\w+)/) || [])[1] || null; });
for (const v of ['day', 'week', 'month']) {
  test(`連携 低① 開いた縦（${v}）で書き出すと settings.view は '${v}'`, async ({ page }, info) => {
    await openWith(page, v);
    expect(await exportView(page, info, `open-${v}.json`)).toBe(v);
  });
}
test('連携 低① 開いた縦で 週→日 に変えてすぐ（保存前）書き出すと day。閉じて書き出しても day', async ({ page }, info) => {
  await openWith(page, 'week');
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('duo.ui.v1') || '{}').view);
  await page.getByRole('button', { name: '日', exact: true }).first().click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('duo.ui.v1') || '{}').view);
  test.info().annotations.push({ type: 'saved-at-click', description: `押す前 ${before}／押した直後の保存 ${saved}` });
  expect(await exportView(page, info, 'open-unsaved.json'), '開いた画面・変えてすぐ').toBe('day');
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  await page.setViewportSize(GEO.portrait); await page.waitForTimeout(700);
  expect(await exportView(page, info, 'closed-after.json'), '閉じてから書き出す').toBe('day');
});

// v19.3 征希さん『カード・時間で分けるだけ』で仕様変更: §18-1・§18-5（貼り付きは日の欄の高さ・T の境で決める）・§18-2 の試験は外した。カードにつまみ（下）は無く、時間のバーは見出しのすぐ下で貼り付けない（design/35 §5.2〜§5.4「§16-1・§17-1・§17-2・§18-1・§18-2・§18-4〜§18-7 はすべて捨てる」。品質 §11-2 の切れも無くなる）。代わりの試験: tests/v193-design35-s9.spec.js の S-2・S-7、tests/v193-day-cardtime.spec.js の A-16
// §18-3（必須）帯なしの横でシートを開いている間、上の y0〜8 に残る見出しのボタン（タスク・…）を押せない（inert）。閉じたら押せる。
test('§18-3 横・帯なし: シートを開いている間 (656,4)・(669,4) をたたいても画面が変わらない。ボタンは inert。閉じたらタスクが押せる', async ({ page }) => {
  await boot(page, { sar: 0 }); await seedTask(page); await page.setViewportSize(GEO.landscape); await page.waitForTimeout(650);
  await editNote(page);
  const cls0 = await page.locator('.shell').getAttribute('class');
  const inert = await page.evaluate(() => [...document.querySelectorAll('.shell.closed .cb.ctask, .shell.closed .cb.cmore')].map((b) => ({ c: b.className.split(' ').at(-1), inert: !!b.closest('[inert]') })));
  const st = () => page.evaluate(() => ({ shell: document.querySelector('.shell').className, pressed: document.querySelector('.cb.ctask')?.getAttribute('aria-pressed'), menu: document.querySelectorAll('[role=menu]').length, sheet: !!document.querySelector('.nsheet:not([hidden])') }));
  const s0 = await st(); const changed = [];
  // 1点ずつ（2回押して元へ戻ってしまう見落としをしないよう、点ごとに比べる）
  for (const [x, y] of [[656, 4], [669, 4], [620, 3], [664, 7]]) { await page.mouse.click(x, y); await page.waitForTimeout(400); const s1 = await st(); if (JSON.stringify(s1) !== JSON.stringify(s0)) { changed.push({ x, y, ...s1 }); break; } }
  expect(changed, '上の y0〜8 をたたいても shell の class・タスク・メニュー・シートが変わらない').toEqual([]);
  expect(cls0).toBe(s0.shell);
  expect(inert.every((b) => b.inert), `見出しのボタンは inert ${JSON.stringify(inert)}`).toBe(true);
  await closeSheet(page);
  expect(await page.evaluate(() => [...document.querySelectorAll('.shell.closed .cb.ctask, .shell.closed .cb.cmore')].some((b) => b.closest('[inert]'))), '閉じたら inert を外す').toBe(false);
  await page.locator('.shell.closed .cb.ctask').click(); await page.waitForTimeout(500);
  const after = await page.evaluate(() => ({ cls: document.querySelector('.shell').className, pressed: document.querySelector('.cb.ctask')?.getAttribute('aria-pressed') }));
  expect(after.cls !== cls0 || after.pressed === 'true', `閉じたらタスクが押せる ${JSON.stringify(after)}`).toBe(true);
});

// v19.3 征希さん『カード・時間で分けるだけ』で仕様変更: S11h の QA の追加（つまみ（下）の押せる範囲・§18-1/§18-5 のフェードの残り） の試験は外した。カードにつまみ（下）は無く、時間のバーは見出しのすぐ下で貼り付けない（design/35 §5.2〜§5.4「§16-1・§17-1・§17-2・§18-1・§18-2・§18-4〜§18-7 はすべて捨てる」。品質 §11-2 の切れも無くなる）。代わりの試験: tests/v193-design35-s9.spec.js の S-2・S-7、tests/v193-day-cardtime.spec.js の A-16
// §18-3 追加: シートを開いている間、y0〜8 のどの点も押せる物（ボタン・data-act・見出しの「今日へ」）に当たらない（inert の中は除く）。閉じたら見出しのボタンは押せる。
test('§18-3・§18-6 横・帯なし: シートを開いている間 y0〜7 を x0〜678 で走査し、押せる物に当たらない（見出しの帯をすべて inert）', async ({ page }) => {
  await boot(page, { sar: 0 }); await seedTask(page); await page.setViewportSize(GEO.landscape); await page.waitForTimeout(650);
  await editNote(page);
  const hits = await page.evaluate(() => { const out = []; for (const y of [1, 4, 7]) for (let x = 1; x < 678; x += 4) { const e = document.elementFromPoint(x, y); if (!e || e.closest('.nsheet')) continue; const b = e.closest('button, a, [data-act], [role="button"], [tabindex]:not([tabindex="-1"]), .mph, .stitle, #ctitle'); if (b && !b.closest('[inert]')) out.push([x, y, (b.className || b.tagName).toString().split(' ').slice(0, 2).join('.'), b.getAttribute('data-act')]); } return out; });
  const uniq = [...new Map(hits.map((h) => [h[2] + h[3], h])).values()];
  expect(uniq, `押せる物に当たる点（代表）／全 ${hits.length} 点`).toEqual([]);
});
// v19.3 征希さん『カード・時間で分けるだけ』で仕様変更: K-3（段2 で止めたとき、カードが端だけのぞかない） の試験は外した。カードにつまみ（下）は無く、時間のバーは見出しのすぐ下で貼り付けない（design/35 §5.2〜§5.4「§16-1・§17-1・§17-2・§18-1・§18-2・§18-4〜§18-7 はすべて捨てる」。品質 §11-2 の切れも無くなる）。代わりの試験: tests/v193-design35-s9.spec.js の S-2・S-7、tests/v193-day-cardtime.spec.js の A-16
// §18-3 追加（挙動）: シートを開いている間に 見出しの上の端（今日へ x318〜382 の y0〜8）と、左上の見えない「前の月」「次の月」（2×2）をたたいても、閉じたあとの月・選んだ日が変わらない。
test('§18-3・§18-6 横・帯なし: シートの上の端で 今日へ・見えない前の月/次の月 が働かない（閉じたあとの月と選んだ日が同じ）', async ({ page }) => {
  await boot(page, { sar: 0 }); await page.setViewportSize(GEO.landscape); await page.waitForTimeout(650);
  // 12月へ送ってから日を選び、ノートを開く（今日へが働けば 11月に戻るので分かる）
  await page.locator('.mph [data-act="next"]').first().evaluate((e) => e.click()); await page.waitForTimeout(450);
  const snap = () => page.evaluate(() => ({ head: (document.querySelector('.mph h2, .mph h1, #ctitle, .stitle')?.textContent || '').trim(), sel: document.querySelector('.mgrid:not([data-leaving]) .day[aria-selected="true"], .mgrid:not([data-leaving]) .day.selected')?.dataset.date }));
  await editNote(page); const s0 = await snap();
  const pts = await page.evaluate(() => [...document.querySelectorAll('.mph [data-act="prev"], .mph [data-act="next"]')].map((b) => { const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }).filter(([, y]) => y < 8));
  // 1点ずつ（どの点で変わったか分かるように）。見出しの帯（今日へ）→ 見えない前の月・次の月 の順
  const changed = []; let cur = s0;
  for (const [x, y, what] of [[350, 4, '見出し（今日へ）'], [373, 6, '見出し（今日へ）'], ...pts.map(([x, y]) => [x, y, '見えない前/次の月'])]) { await page.mouse.click(x, y); await page.waitForTimeout(350); const s1 = await snap(); if (JSON.stringify(s1) !== JSON.stringify(cur)) { changed.push({ x, y, what, ...s1 }); cur = s1; } }
  await closeSheet(page); const s2 = await snap();
  expect({ changed, after: s2 }, `見えない前/次の月の点 ${JSON.stringify(pts)}`).toEqual({ changed: [], after: s0 });
});

// ===== design/34 §18-6（2026-11-22 15:10、必須）帯なしの横でシートを開いている間、シートの外の見出しの帯をすべて inert。(350,4) 今日へ・(10,2)/(14,2) 月送りを含む。閉じたら働く =====
for (const [name, want] of [['今日へ (350,4)', /11月/], ['見えない前の月', /11月/], ['見えない次の月', /1月/]]) {
  test(`§18-6 横・帯なし: シートを開いている間 ${name} をたたいても月が変わらない。閉じたら働く（12月から ${want.source}）`, async ({ page }) => {
    await boot(page, { sar: 0 }); await page.setViewportSize(GEO.landscape); await page.waitForTimeout(650);
    await page.locator('.mph [data-act="next"]').first().evaluate((e) => e.click()); await page.waitForTimeout(450);
    const head = () => page.evaluate(() => (document.querySelector('.mph h2, .mph h1, #ctitle, .stitle')?.textContent || '').trim());
    const h0 = await head(); expect(h0, '前提: 12月').toMatch(/12月/);
    const pt = async () => {
      if (name.startsWith('今日へ')) return [350, 4];
      const act = name.includes('前') ? 'prev' : 'next';
      const p = await page.evaluate((act) => { const b = [...document.querySelectorAll(`.mph [data-act="${act}"]`)].map((e) => e.getBoundingClientRect()).find((r) => r.top + r.height / 2 < 8 && r.width > 0); return b && [b.left + b.width / 2, b.top + b.height / 2]; }, act);
      expect(p, `前提: 見えない${act}が上の 8 にある`).toBeTruthy(); return p;
    };
    const [x, y] = await pt();
    await editNote(page);
    const under = await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return { inert: !!e?.closest('[inert]'), sheet: !!e?.closest('.nsheet'), cls: (e?.className || e?.tagName || '').toString().split(' ')[0] }; }, [x, y]);
    await page.mouse.click(x, y); await page.waitForTimeout(450);
    const h1 = await head(); await closeSheet(page); const h2 = await head();
    expect.soft({ open: h1, closed: h2 }, `シート中に (${Math.round(x)},${Math.round(y)}) をたたく ${JSON.stringify(under)}`).toEqual({ open: h0, closed: h0 });
    expect(await page.evaluate(() => !!document.querySelector('.mph[inert], .mph [inert], .chead[inert]')), '閉じたら inert を外す').toBe(false);
    // シートの下で月が変わってしまった版（8960267）でも「閉じたら働く」を見られるよう、12月へ戻してから押す
    for (let i = 0; i < 4 && !/12月/.test(await head()); i++) { const m = Number(((await head()).match(/(\d+)月/) || [])[1] || 12); await page.locator(`.mph [data-act="${m < 12 && m > 6 ? 'next' : 'prev'}"]`).first().evaluate((e) => e.click()); await page.waitForTimeout(450); }
    expect(await head(), '前提: 12月に戻した').toMatch(/12月/);
    await page.mouse.click(x, y); await page.waitForTimeout(500);
    expect(await head(), `閉じたあと (${Math.round(x)},${Math.round(y)}) は働く`).toMatch(want);
  });
}
