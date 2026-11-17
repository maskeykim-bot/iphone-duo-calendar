// 追加先（カレンダー）の候補を、シートの中の専用ページとして出す部品。
// 見た目は design/11 §6.1：左上「‹ 戻る」(44×44)・見出し・行44・グループ見出し28。
// ページ全体が1本のスクロール。選ぶと ✓ が移り、0.15秒後に元のページへ戻る。
// 値・フォームの DOM には触れない（選択の反映は onPick、下書き保存は呼び出し側）。
export const PICK_DELAY = 150;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// groups: [{head, items:[{type,id,name,color,hidden}]}]、cur: {type,id}
export function destRowsHtml(groups, cur, { typeAttr = 'dtype', idAttr = 'did' } = {}) {
  let h = '';
  for (const g of groups) {
    h += `<h4>${esc(g.head)}</h4>`;
    for (const i of g.items) {
      const on = !!cur && cur.type === i.type && cur.id === i.id;
      h += `<button type="button" class="dopt${i.hidden ? ' hid' : ''}" role="option" aria-selected="${on}" data-${typeAttr}="${i.type}" data-${idAttr}="${esc(i.id)}"><i class="cdot" style="background:${esc(i.color)}" aria-hidden="true"></i><span class="dn">${esc(i.name)}</span>${i.hidden ? '<span class="dhid">非表示</span>' : ''}<span class="dck" aria-hidden="true">${on ? '✓' : ''}</span></button>`;
    }
  }
  return h;
}

// 選んでいる行が見える位置まで、ページ自身をスクロールする（祖先は動かさない）。
export function revealSelected(page) {
  const sel = page.querySelector('[aria-selected="true"]');
  if (!sel) return;
  const head = page.querySelector('.dphead')?.offsetHeight || 0;
  const top = sel.offsetTop - head - Math.max(0, (page.clientHeight - head - sel.offsetHeight) / 2);
  page.scrollTop = Math.max(0, top);
}

// page: 候補ページの要素（hidden で開閉）。
// opts: { title, bodyHtml():string, settings:boolean, onPick({type,id}), onOpen(), onClose(focus), onSettings(), pickSel }
export function createDestPage(page, opts) {
  let timer = 0, closing = false;
  const isOpen = () => !page.hidden;
  const render = () => {
    const keep = page.scrollTop;
    page.innerHTML = `<div class="dphead"><button type="button" class="dback" aria-label="戻る">‹ 戻る</button><h3 class="dptitle">${esc(opts.title)}</h3></div><div class="dlist" role="listbox" aria-label="${esc(opts.title)}">${opts.bodyHtml()}</div>${opts.settings ? '<button type="button" class="dset">表示するカレンダーを選ぶ ›</button>' : ''}`;
    page.scrollTop = keep;
  };
  function open() {
    clearTimeout(timer); closing = false;
    render();
    page.hidden = false;
    page.scrollTop = 0;
    opts.onOpen?.();
    revealSelected(page);
    (page.querySelector('[aria-selected="true"]') || page.querySelector('.dopt') || page.querySelector('.dback'))?.focus({ preventScroll: true });
  }
  function close(focus = true) {
    clearTimeout(timer); closing = false;
    if (page.hidden) return false;
    page.hidden = true;
    opts.onClose?.(focus);
    return true;
  }
  page.addEventListener('click', (ev) => {
    if (ev.target.closest('.dback')) { close(); return; }
    if (ev.target.closest('.dset')) { opts.onSettings?.(); return; }
    const b = ev.target.closest('.dopt');
    if (!b || closing) return;
    closing = true;
    opts.onPick({ type: b.dataset.dtype ?? b.dataset.sdtype, id: b.dataset.did ?? b.dataset.sdid });
    if (page.hidden) { closing = false; return; }
    render(); // ✓ を移して見せる
    page.querySelector('[aria-selected="true"]')?.focus({ preventScroll: true });
    timer = setTimeout(() => { closing = false; close(); }, PICK_DELAY);
  });
  page.addEventListener('keydown', (ev) => {
    if (ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp') return;
    const o = [...page.querySelectorAll('.dopt, .dset, .dback')], i = o.indexOf(document.activeElement);
    if (i < 0) return;
    ev.preventDefault();
    o[(i + (ev.key === 'ArrowDown' ? 1 : o.length - 1)) % o.length].focus({ preventScroll: true });
  });
  return { open, close, isOpen, render };
}
