// ═══════════════ 异录小助手 ═══════════════
// 酒馆助手中粘贴以下一行即可：
//   import 'https://testingcf.jsdelivr.net/gh/NLKASHEI/233456@v1.1.2/异录配置小助手.min.js'
// ═══════════════════════════════════════════════════════════

const YL_VERSION = '1.0.1';
const WORLDBOOK_NAME = '我是S级求打压';
const p = window.parent || window;

// 防重复加载
if (!p._ylLoaded) { p._ylLoaded = true;

// 清理旧实例
{
  const old = ['yl-bubble', 'yl-panel', 'yl-style'];
  for (const id of old) { const el = p.document.getElementById(id); if (el) el.remove(); }
  if (typeof p._ylCleanup === 'function') try { p._ylCleanup(); } catch(e) {}
  delete p._ylCleanup;
}

// ═══════════════ 核心：在父页面上下文执行代码 ═══════════════
// iframe 中的异步 API（getWorldbook/updateWorldbookWith）调用会因
// 请求上下文问题失败。解决办法：往父页面注入 <script> 标签，
// 在父页面原生上下文中执行操作，结果通过 CustomEvent 回传。
function runInParent(fnString) {
  return new Promise((resolve, reject) => {
    const token = 'yl_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    const handler = (e) => {
      if (!e.detail || e.detail.token !== token) return;
      p.document.removeEventListener('yl-result', handler);
      if (e.detail.error) reject(new Error(e.detail.error));
      else resolve(e.detail.result);
    };
    p.document.addEventListener('yl-result', handler);

    const script = p.document.createElement('script');
    script.textContent = `
(async () => {
  try {
    var _result = await (${fnString});
    document.dispatchEvent(new CustomEvent('yl-result', { detail: { token: '${token}', result: _result } }));
  } catch(_e) {
    document.dispatchEvent(new CustomEvent('yl-result', { detail: { token: '${token}', error: _e.message || String(_e) } }));
  }
})();
`;
    p.document.body.appendChild(script);
    script.remove();
  });
}

// ═══════════════ 世界书名称解析 ═══════════════
// TavernHelper 已挂载在 iframe window 上，读取操作直接调用即可，无需 runInParent 注入父页面

let _ylManualWbName = null;  // 用户手动选择的世界书名（自动检测失败后的兜底）

// 类型归一化：getCharWorldbookNames / getWorldbookNames 返回值可能是
// 对象 {primary, additional}、数组、或字符串，统一提取为字符串数组
// 解析目标世界书名称：用户手动选择 → 角色绑定 → 全局搜索 → 硬编码兜底
// 直接调用 iframe 上的 TavernHelper，不通过 runInParent
// 自动绑定：把目标世界书绑定到当前角色（若尚未绑定）。返回是否已绑定。
let _ylAutoBindTried = false;
async function api_ensureWorldbookBound() {
  try {
    // 1. 已绑定到当前角色？
    let bound = null;
    try { bound = TavernHelper.getCharWorldbookNames('current'); } catch (e) {}
    const primary = bound && bound.primary;
    const additional = (bound && Array.isArray(bound.additional)) ? bound.additional.slice() : [];
    if (primary === WORLDBOOK_NAME || additional.includes(WORLDBOOK_NAME)) return true;

    // 2. 世界书是否存在
    let all = null;
    try { all = TavernHelper.getWorldbookNames(); } catch (e) {}
    if (!Array.isArray(all) || !all.includes(WORLDBOOK_NAME)) return false;

    // 3. 绑定：primary 空则设为主，否则追加到 additional
    const next = primary ? { primary, additional: additional.concat([WORLDBOOK_NAME]) } : { primary: WORLDBOOK_NAME, additional };
    await runInParent('TavernHelper.rebindCharWorldbooks(' + JSON.stringify('current') + ', ' + JSON.stringify(next) + ')');
    return true;
  } catch (e) {
    return false;
  }
}

async function api_resolveWorldbookName() {
  // 0. 用户手动选择优先
  if (_ylManualWbName) return _ylManualWbName;

  // 1. 尝试自动绑定（仅首次），再从当前角色绑定中精确匹配
  if (!_ylAutoBindTried) { _ylAutoBindTried = true; try { await api_ensureWorldbookBound(); } catch (e) {} }
  try {
    const raw = TavernHelper.getCharWorldbookNames('current');
    if (raw && (raw.primary === WORLDBOOK_NAME || (raw.additional && raw.additional.includes(WORLDBOOK_NAME)))) {
      _ylOnWbResolved(WORLDBOOK_NAME);
      return WORLDBOOK_NAME;
    }
  } catch(e) {
    // 静默处理
  }

  // 2. 从全部世界书列表中精确搜索（兜底）
  try {
    const all = TavernHelper.getWorldbookNames();  // 返回 string[]
    if (Array.isArray(all) && all.includes(WORLDBOOK_NAME)) {
      _ylOnWbResolved(WORLDBOOK_NAME);
      return WORLDBOOK_NAME;
    }
  } catch(e) {
  }

  // 3. 自动检测失败 → 展示手动选择面板
  _ylOnWbNotFound();
  return WORLDBOOK_NAME;
}

// 填充世界书下拉列表（始终可见，初始化/面板打开时调用）
function _ylPopulateWbSelect() {
  if (!manualWbSelect) return;
  const saved = manualWbSelect.value;  // 记住当前选中值，避免重建后丢失
  try {
    const all = TavernHelper.getWorldbookNames();  // 返回 string[]
    manualWbSelect.innerHTML = all.map(n =>
      '<option value="' + n.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;') + '">' + n + '</option>'
    ).join('');
  } catch(e) {
    manualWbSelect.innerHTML = '<option value="">-- 加载失败 --</option>';
  }
  // 恢复之前的值（如果新列表中还有的话）
  if (saved && [...manualWbSelect.options].some(o => o.value === saved)) manualWbSelect.value = saved;
  else if (_ylManualWbName && [...manualWbSelect.options].some(o => o.value === _ylManualWbName)) manualWbSelect.value = _ylManualWbName;
}

// 世界书自动检测成功 → 更新下拉选中值、恢复绿色标签
function _ylOnWbResolved(name) {
  if (manualWbSelect && name) {
    if ([...manualWbSelect.options].some(o => o.value === name)) manualWbSelect.value = name;
    else { manualWbSelect.appendChild(p.document.createElement('option')); manualWbSelect.lastChild.value = name; manualWbSelect.lastChild.textContent = name; manualWbSelect.value = name; }
  }
  if (manualWbLabel) { manualWbLabel.textContent = '当前世界书'; manualWbLabel.style.color = '#4ade80'; }
  if (statusText) { statusText.textContent = name; statusText.style.color = '#4ade80'; }
  if (bubble) bubble.classList.remove('warn');
}

// 世界书自动检测失败 → 爆红光、标签变红警告
function _ylOnWbNotFound() {
  if (manualWbLabel) { manualWbLabel.textContent = '自动检测失败，请手动选择'; manualWbLabel.style.color = '#e74c3c'; }
  if (statusText) { statusText.textContent = '世界书尚未选择'; statusText.style.color = '#e74c3c'; }
  if (bubble) bubble.classList.add('warn');
}

async function api_getWorldbook(name) {
  return runInParent(`TavernHelper.getWorldbook(${JSON.stringify(name)})`);
}

// 直接在父页面：获取条目 → 修改 → replaceWorldbook 保存 → 返回刷新后的条目
async function api_replaceWorldbook(name, entriesModifier) {
  return runInParent(
    `(async () => {` +
    `  var _entries = await TavernHelper.getWorldbook(${JSON.stringify(name)});` +
    `  (${entriesModifier})(_entries);` +
    `  await TavernHelper.replaceWorldbook(${JSON.stringify(name)}, _entries);` +
    `  return await TavernHelper.getWorldbook(${JSON.stringify(name)});` +
    `})()`
  );
}

// 正则操作（角色级别）
async function api_getTavernRegexes() {
  return runInParent('TavernHelper.getTavernRegexes({ type: "character" })');
}
async function api_updateTavernRegexes(modifier) {
  return runInParent(
    `TavernHelper.updateTavernRegexesWith(${modifier}, { type: "character" })`
  );
}

// 角色脚本树操作
async function api_getScriptTrees() {
  return runInParent('TavernHelper.getScriptTrees({ type: "character" })');
}
async function api_updateScriptTrees(modifier) {
  return runInParent(
    `TavernHelper.updateScriptTreesWith(${modifier}, { type: "character" })`
  );
}

// --- CSS（注入到父页面，异录配色） ---
const CSS = p.document.createElement('style');
CSS.textContent = `
	  #yl-bubble {
	    position: fixed; top: 12vh; left: 14px;
	    width: 44px; height: 44px;
	    background: linear-gradient(145deg, #0d1428, #070a16);
	    border: 1px solid rgba(34,211,238,0.35);
	    border-radius: 14px; z-index: 1000000; cursor: pointer;
	    display: flex; align-items: center; justify-content: center;
	    box-shadow: 0 4px 20px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04);
	    transition: box-shadow .25s, border-color .25s, transform .15s;
	    user-select: none; touch-action: none;
	    -webkit-tap-highlight-color: transparent;
	  }
	  #yl-bubble span {
	    font-size: 28px; font-weight: 400; line-height: 1;
	    font-family: 'Ma Shan Zheng', cursive;
	    background: linear-gradient(180deg, #7dd3fc 0%, #a855f7 50%, #7c3aed 100%);
	    -webkit-background-clip: text; background-clip: text;
	    -webkit-text-fill-color: transparent;
	    filter: drop-shadow(0 0 6px rgba(34,211,238,0.3));
	  }
	  #yl-bubble:hover {
	    border-color: rgba(34,211,238,0.7);
	    box-shadow: 0 0 20px rgba(34,211,238,0.2), 0 6px 24px rgba(0,0,0,0.7);
	    transform: translateY(-1px);
	  }
	  #yl-bubble:hover span {
	    filter: drop-shadow(0 0 12px rgba(34,211,238,0.5));
	  }
	  #yl-bubble.running { animation: yl-spin 1.2s linear infinite; }
	  @keyframes yl-spin { 100% { transform: rotate(360deg); } }

	  @keyframes yl-pulse-warn {
	    0%, 100% { border-color: rgba(231,76,60,0.35) !important; }
	    50% { border-color: rgba(231,76,60,0.7) !important; }
	  }

	  #yl-bubble.warn {
	    border-color: rgba(234,179,8,0.7);
	    box-shadow: 0 0 20px 6px rgba(234,179,8,0.5), 0 6px 24px rgba(0,0,0,0.7);
	    animation: yl-bubble-warn 1.8s ease-in-out infinite;
	  }
	  @keyframes yl-bubble-warn {
	    0%, 100% { border-color: rgba(234,179,8,0.5); box-shadow: 0 0 20px 6px rgba(234,179,8,0.4), 0 6px 24px rgba(0,0,0,0.7); }
	    50% { border-color: rgba(255,200,30,0.9); box-shadow: 0 0 24px 8px rgba(255,200,30,0.7), 0 6px 24px rgba(0,0,0,0.7); }
	  }
  .yl select {
    width: 100%; max-width: 100%; box-sizing: border-box;
    padding: 9px 32px 9px 12px; border-radius: 6px; font-size: 13px;
    font-family: inherit; background: #0d1428 !important;
    border: 1px solid #4a3525 !important; color: #c4d6ea !important; cursor: pointer;
    -webkit-appearance: none; appearance: none; transition: border-color 0.2s;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23D4AF37' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
    background-repeat: no-repeat; background-position: right 12px center;
    box-shadow: none !important; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .yl select:hover { border-color: #a855f7 !important; }
  .yl select:focus { border-color: #22d3ee !important; outline: none; box-shadow: 0 0 0 2px rgba(34,211,238,0.1) !important; }
  .yl select option { background: #0d1428 !important; color: #c4d6ea !important; }
  .yl-btn {
    padding: 7px 14px !important; border-radius: 6px !important; cursor: pointer;
    border: 1px solid #4a3525 !important; background: rgba(124,58,237,0.06) !important;
    color: #c4b5fd !important; font-size: 12px; font-weight: 500; font-family: inherit !important;
    transition: all 0.2s; letter-spacing: 0.3px;
    text-shadow: none !important; box-shadow: none !important;
    line-height: 1.4 !important; min-height: auto !important;
  }
  .yl-btn:hover {
    background: rgba(124,58,237,0.15) !important; border-color: #a855f7 !important; color: #fff !important;
  }
  .yl-btn.primary {
    width: 100% !important; display: block !important;
    background: linear-gradient(160deg, #22d3ee, #0891b2) !important;
    border: 1px solid #22d3ee !important; color: #06121f !important;
    margin-top: 6px; padding: 10px !important; font-size: 13px; font-weight: 700 !important;
    letter-spacing: 0.5px; text-shadow: none !important;
    box-shadow: 0 2px 10px rgba(34,211,238,0.15) !important;
    line-height: 1.4 !important; min-height: auto !important;
    text-align: center !important;
  }
  .yl-btn.primary:hover {
    background: linear-gradient(160deg, #67e8f9, #22d3ee) !important;
    border-color: #7dd3fc !important; box-shadow: 0 4px 16px rgba(34,211,238,0.3) !important;
    color: #06121f !important;
  }
  .yl-btn.primary:disabled {
    opacity: 0.35; cursor: not-allowed; filter: grayscale(30%);
  }
  .yl-btn.xs {
    padding: 4px 10px !important; font-size: 11px; width: auto; border-radius: 5px !important;
    background: transparent !important; border-color: rgba(99,179,237,0.3) !important;
    color: #a855f7 !important; font-weight: 500 !important;
    display: inline-block !important; box-shadow: none !important;
  }
  .yl-btn.xs:hover {
    border-color: #a855f7 !important; color: #c4b5fd !important;
    background: rgba(124,58,237,0.08) !important;
  }
  .yl-birth-btns {
    display: flex; gap: 10px; margin-bottom: 10px;
  }
  .yl-birth-btn {
    flex: 1; padding: 10px 0 !important; border-radius: 6px !important; cursor: pointer;
    border: 1px solid #4a3525 !important;
    background: #0d1428 !important; color: #c4d6ea !important;
    font-size: 13px; font-weight: 500; font-family: inherit !important;
    transition: all 0.25s; text-align: center !important;
    letter-spacing: 0.5px;
    text-shadow: none !important; box-shadow: none !important;
    line-height: 1.4 !important;
  }
  .yl-birth-btn:hover {
    background: rgba(124,58,237,0.12) !important; border-color: #a855f7 !important;
    color: #fff !important;
  }
  .yl-birth-btn.active {
    background: #a855f7 !important; border-color: #c4b5fd !important;
    color: #fff !important;
    box-shadow: 0 0 12px rgba(124,58,237,0.4) !important;
  }
  .yl-panel {
    position: fixed; z-index: 1000001;
    width: 320px; max-height: 62vh;
    background: linear-gradient(170deg, #0d1428, #070a16);
    border: 1px solid rgba(34,211,238,0.25);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.7), 0 0 16px rgba(34,211,238,0.06);
    display: flex; flex-direction: column;
    font-size: 13px; color: #c4d6ea;
    font-family: 'Noto Serif SC','Inter','Microsoft YaHei',serif;
    overflow: hidden; user-select: none;
  }
  .yl-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 16px 10px; border-bottom: 1px solid rgba(99,179,237,0.2);
    cursor: move;
  }
  .yl-header-title {
    font-size: 18px; font-weight: 700;
    background: linear-gradient(180deg, #7dd3fc, #a855f7);
    -webkit-background-clip: text; background-clip: text;
    -webkit-text-fill-color: transparent;
    letter-spacing: 2px;
  }
  .yl-body {
    padding: 12px 14px; overflow-y: auto; flex: 1;
    scrollbar-width: thin; scrollbar-color: rgba(124,58,237,0.15) transparent;
  }
  .yl-body::-webkit-scrollbar { width: 4px; }
  .yl-body::-webkit-scrollbar-thumb { background: rgba(124,58,237,0.15); border-radius: 2px; }
  .yl-section {
    background: rgba(124,58,237,0.03); border: 1px solid rgba(99,179,237,0.15);
    border-radius: 8px; padding: 12px; margin-bottom: 10px;
  }
  .yl-section-title {
    font-size: 11px; font-weight: 600; letter-spacing: 1px;
    color: #22d3ee; margin-bottom: 10px;
  }
  .yl-config-status {
    text-align: center; padding: 8px 12px; margin-bottom: 10px;
    border-radius: 6px; font-size: 12px; font-weight: 600;
    background: rgba(74,222,128,0.06); border: 1px solid rgba(74,222,128,0.15);
    color: #4ade80;
  }
  .yl-config-status.warn {
    background: rgba(234,179,8,0.06); border-color: rgba(234,179,8,0.2);
    color: #22d3ee;
  }
  .yl-panel .yl-status-inline {
    display: flex; align-items: center; gap: 8px; font-size: 12px;
  }
  .yl-panel .status-dot {
    width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0;
  }
  .yl-panel .status-dot.on {
    background: #4ade80;
    box-shadow: 0 0 10px #4ade80, 0 0 20px rgba(74,222,128,0.4);
  }
  .yl-panel .status-dot.off {
    background: #e74c3c;
    box-shadow: 0 0 10px #e74c3c, 0 0 20px rgba(231,76,60,0.4);
  }
  .yl-panel .status-dot.missing { background: #1e3a5f; box-shadow: none; }
  .yl-panel .status-label { color: #8fb4d6 !important; }
  .yl .toast {
    position: fixed; top: 24px; left: 50%; transform: translateX(-50%);
    background: rgba(20,16,10,0.97) !important; border: 1px solid rgba(34,211,238,0.35) !important;
    border-radius: 8px !important; padding: 10px 24px !important; color: #22d3ee !important;
    font-size: 13px; font-weight: 600; z-index: 1000002;
    box-shadow: 0 4px 20px rgba(0,0,0,0.5), 0 0 10px rgba(34,211,238,0.06) !important;
    animation: yl-toast-in 0.3s ease, yl-toast-out 0.3s ease 2.2s forwards;
    letter-spacing: 0.3px; font-family: 'Noto Serif SC','Inter','Microsoft YaHei',serif !important;
    margin: 0 !important;
  }
  @keyframes yl-toast-in { from { opacity: 0; transform: translateX(-50%) translateY(-12px); } }
  @keyframes yl-toast-out { to { opacity: 0; transform: translateX(-50%) translateY(-12px); } }
  @media (max-width: 768px) {
    .yl-panel { width: clamp(260px, 88vw, 340px) !important; font-size: 12px; }
    #yl-bubble { width: 36px; height: 36px; } #yl-bubble span { font-size: 22px; }
    .yl-header { padding: 10px 12px 8px !important; }
    .yl-header-title { font-size: 16px; letter-spacing: 1px; }
    .yl-body { padding: 10px 10px !important; }
    .yl-section { padding: 10px !important; margin-bottom: 8px; }
    .yl-section-title { font-size: 10px; margin-bottom: 8px; }
    .yl-birth-btn { padding: 8px 0 !important; font-size: 12px; }
    .yl-birth-btns { gap: 8px; }
    .yl-btn.xs { padding: 6px 12px !important; font-size: 12px; }
    .yl-panel .yl-status-inline { font-size: 11px; gap: 6px; }
    .yl-panel .status-dot { width: 8px; height: 8px; }
    .yl-panel select { padding: 7px 28px 7px 10px; font-size: 12px; }
    .yl-config-status { padding: 8px 10px !important; font-size: 12px; margin-bottom: 8px; }
    #yl-manual-wb select { font-size: 11px; padding: 6px 24px 6px 8px; }
    #yl-manual-wb .yl-btn.xs { padding: 5px 10px !important; font-size: 11px; white-space: nowrap; }
  }
  .yl-row { display: flex; align-items: center; gap: 8px; font-size: 11px; }
  .yl-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
  .yl-dot.ok  { background: #4ade80; box-shadow: 0 0 8px rgba(74,222,128,0.5); }
  .yl-dot.err { background: #e74c3c; box-shadow: 0 0 8px rgba(231,76,60,0.5); }
  .yl-dot.idle{ background: #1e3a5f; }
  .yl-kv { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 5px; }
  .yl-tag {
    background: rgba(34,211,238,0.08); border: 1px solid rgba(34,211,238,0.2);
    border-radius: 5px; padding: 2px 7px; font-size: 10px; color: rgba(34,211,238,0.75);
  }
  .yl-tag.err { background: rgba(231,76,60,0.08); border-color: rgba(231,76,60,0.25); color: #e74c3c; }
  #yl-status-text { color: #4ade80; font-size: 11px; }
`;
p.document.head.appendChild(CSS);

// 异能风: 分页/独立界面 + 美化系列按钮 + 固定面板高度(不整体滚动)
const YL_NAV_CSS = p.document.createElement('style');
YL_NAV_CSS.textContent = `
  .yl-panel { height: min(560px, 62vh) !important; }
  .yl-body { overflow: hidden !important; padding: 0 !important; }
  #yl-tabs { display:flex; gap:2px; padding:6px 8px 0; flex:none; border-bottom:1px solid rgba(99,179,237,.18); background:rgba(7,10,22,.5); }
  .yl-tab { flex:1; padding:8px 2px; font-size:12px; color:#8fb4d6; background:transparent; border:none; border-bottom:2px solid transparent; cursor:pointer; font-family:inherit; transition:.2s; }
  .yl-tab:hover { color:#cfe9ff; }
  .yl-tab.active { color:#eaf6ff; border-bottom-color:#22d3ee; background:linear-gradient(180deg,rgba(34,211,238,.14),transparent); }
  .yl-screen { display:none; height:100%; overflow-y:auto; padding:12px 14px; }
  .yl-screen.active { display:block; }
  .yl-screen::-webkit-scrollbar { width:5px; }
  .yl-screen::-webkit-scrollbar-thumb { background:rgba(99,179,237,.25); border-radius:3px; }
  .yl-beauty-series-btn { display:flex; align-items:center; gap:10px; width:100%; box-sizing:border-box; padding:11px 12px; border-radius:9px; cursor:pointer; font-size:13px; color:#c4d6ea; background:linear-gradient(135deg,rgba(34,211,238,.06),rgba(168,85,247,.06)); border:1px solid rgba(99,179,237,.25); transition:.2s; font-family:inherit; text-align:left; }
  .yl-beauty-series-btn:hover { border-color:rgba(34,211,238,.6); box-shadow:0 0 12px rgba(34,211,238,.2); color:#eaf6ff; }
  .yl-beauty-series-btn:disabled { opacity:.5; cursor:wait; }
  .yl-beauty-series-btn.on { border-color:rgba(34,211,238,.7); background:linear-gradient(135deg,rgba(34,211,238,.2),rgba(168,85,247,.2)); color:#eaf6ff; box-shadow:0 0 14px rgba(34,211,238,.22); }
  .yl-beauty-series-btn .yl-bs-ico { font-size:18px; flex:none; }
  .yl-beauty-series-btn .yl-bs-name { flex:1; font-weight:600; }
  .yl-beauty-series-btn .yl-bs-state { font-size:10px; color:#5f7e96; flex:none; }
  .yl-beauty-series-btn.on .yl-bs-state { color:#22d3ee; }
  @media (max-width: 768px) {
    .yl-panel { height: min(80vh, 560px) !important; }
    .yl-tab { font-size:11px; padding:7px 2px; }
  }
`;
p.document.head.appendChild(YL_NAV_CSS);

// 追加 MVU 配置表单 CSS
const MVU_CSS = p.document.createElement('style');
MVU_CSS.textContent = `
  .yl-mvu-row { display: flex; align-items: center; gap: 6px; margin-bottom: 3px; }
  .yl-mvu-row.col { flex-direction: column; align-items: stretch; gap: 2px; }
  .yl-mvu-label { font-size: 13px; color: #8fb4d6; white-space: nowrap; flex-shrink: 0; min-width: 56px; letter-spacing: 0.3px; }
  .yl-mvu-label.wide { min-width: 64px; }
  .yl-mvu-input { flex: 1; padding: 5px 9px; border-radius: 5px; font-size: 13px; font-family: inherit; background: #0d1428 !important; border: 1px solid #4a3525 !important; color: #c4d6ea !important; transition: border-color 0.2s; min-width: 0; box-shadow: none !important; outline: none !important; }
  .yl-mvu-input:focus { border-color: #a855f7 !important; }
  .yl-mvu-input.num { width: 58px; flex: 0 0 auto; text-align: center; padding: 5px 2px; }
  .yl-mvu-select { flex: 1; padding: 5px 26px 5px 9px; border-radius: 5px; font-size: 13px; font-family: inherit; background: #0d1428 !important; border: 1px solid #4a3525 !important; color: #c4d6ea !important; cursor: pointer; -webkit-appearance: none; appearance: none; transition: border-color 0.2s; min-width: 0; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10'%3E%3Cpath fill='%23D4AF37' d='M5 7L1 3h8z'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 7px center; box-shadow: none !important; outline: none !important; }
  .yl-mvu-select:focus { border-color: #a855f7 !important; }
  .yl-mvu-check-row { display: flex; align-items: center; gap: 4px; margin-bottom: 1px; font-size: 13px; color: #a9c2dc; cursor: pointer; line-height: 1.4; }
  .yl-mvu-check-row input[type="checkbox"] { display: none !important; }
  .yl-mvu-check-box { width: 14px; height: 14px; flex-shrink: 0; border: 1.5px solid #4a3a28; border-radius: 3px; background: #0d1428; transition: all 0.15s; display: inline-block; box-sizing: border-box; }
  .yl-mvu-check-row input:checked ~ .yl-mvu-check-box { background: #a855f7; border-color: #a855f7; }
  .yl-mvu-check-row:hover .yl-mvu-check-box { border-color: #a855f7; }
  .yl-mvu-hint { font-size: 11px; color: #c4d6ea; line-height: 1.4; margin-top: 1px; }
  .yl-mvu-subtitle { font-size: 10px; color: #22d3ee; letter-spacing: 0.8px; margin: 5px 0 2px; padding-top: 4px; border-top: 1px solid rgba(99,179,237,0.2); }
  .yl-mvu-collapse-header { display: flex; align-items: center; gap: 3px; cursor: pointer; font-size: 11px; color: #a855f7; padding: 3px 0; user-select: none; }
  .yl-mvu-collapse-header:hover { color: #c4b5fd; }
  .yl-mvu-collapse-arrow { display: inline-block; font-size: 8px; transition: transform 0.2s; }
  .yl-mvu-collapse-arrow.open { transform: rotate(90deg); }
  .yl-mvu-collapse-body { padding-left: 4px; }
  .yl-mvu-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 6px; }
  #yl-mvu-section { padding: 10px 12px !important; }
  #yl-mvu-section .yl-mvu-subtitle:first-of-type { margin-top: 2px; }
  #yl-mvu-section::-webkit-scrollbar { width: 3px; }
  #yl-mvu-section::-webkit-scrollbar-thumb { background: rgba(124,58,237,0.15); border-radius: 2px; }
  #yl-confirm-dialog { overflow: hidden !important; }
  #yl-confirm-body { overflow: hidden; }
  #yl-confirm-body .yl-mvu-select { max-width: 100%; width: 0; }
  #yl-confirm-body .yl-mvu-input { max-width: 100%; }
  #yl-confirm-body .yl-mvu-row { overflow: hidden; }
`;
p.document.head.appendChild(MVU_CSS);


// --- HTML（注入到父页面） ---
p.document.body.insertAdjacentHTML('beforeend', `
  <div id="yl-bubble" style="top: 40vh; left: 60px;" title="异录配置小助手"><span>异</span></div>
  <div id="yl-panel" class="yl-panel" style="display:none; left: 110px; top: 35vh;">
    <div class="yl-header" id="yl-drag">
      <span class="yl-header-title">异录配置小助手</span>
      <div style="display:flex;align-items:center;gap:4px;">
        <button class="yl-btn xs" id="yl-refresh" title="刷新">刷新</button>
        <button class="yl-btn xs" id="yl-close" title="关闭" style="font-size:14px;padding:4px 8px !important;">✕</button>
      </div>
    </div>
    <div id="yl-tabs">
      <button class="yl-tab active" data-screen="home">状态</button>
      <button class="yl-tab" data-screen="mvu">MVU</button>
      <button class="yl-tab" data-screen="worldbook">世界书</button>
      <button class="yl-tab" data-screen="plot">剧情</button>
      <button class="yl-tab" data-screen="beauty">美化</button>
      <button class="yl-tab" data-screen="about">关于</button>
    </div>
    <div class="yl-body">
      <div class="yl-screen active" data-screen="home">
      <div class="yl-config-status" id="yl-config-status">配置运行正常</div>
      <div id="yl-backend-code" style="text-align:center;margin-bottom:10px;font-size:10px;color:#5f7e96;line-height:1.6;word-break:break-all;"></div>
      <div class="yl-section">
        <div class="yl-section-title">世界书状态</div>
        <div class="yl-row">
          <div class="yl-dot idle" id="yl-status-dot"></div>
          <span id="yl-status-text">已就绪，等待消息触发…</span>
        </div>
        <div id="yl-stat-tags" class="yl-kv"></div>
        <div id="yl-manual-wb" style="margin-top:8px;">
          <div style="font-size:11px;color:#8fb4d6;margin-bottom:4px;" id="yl-manual-wb-label">切换世界书</div>
          <div style="display:flex;gap:6px;">
            <select class="yl-mvu-select" id="yl-manual-wb-select" style="flex:1;font-size:12px;"></select>
            <button class="yl-btn xs" id="yl-manual-wb-apply">切换</button>
          </div>
        </div>
      </div>
      </div><!-- /screen home -->
      <div class="yl-screen" data-screen="beauty">
      <div class="yl-section">
        <div class="yl-section-title">美化主题 · 一键启用整套</div>
        <div id="yl-beauty-series" style="display:flex;flex-direction:column;gap:8px;"></div>
        <div id="yl-beauty-tip" style="font-size:10px;color:#5f7e96;margin-top:8px;line-height:1.5;">点击某系列按钮，一键启用该系列两条美化正则（变量更新中 + 完成），并自动关闭其它系列。</div>
      </div>
      </div><!-- /screen beauty -->
      <div class="yl-screen" data-screen="worldbook">
      <div class="yl-section">
        <div class="yl-section-title">世界书管理</div>
        <div style="display:flex;gap:6px;margin-bottom:6px;">
          <input id="yl-wb-kw" class="yl-mvu-input" placeholder="🔍 搜索词条" style="flex:1;font-size:12px;">
          <button class="yl-btn xs" id="yl-wb-on">启用</button>
          <button class="yl-btn xs" id="yl-wb-off">禁用</button>
        </div>
        <div id="yl-wb-list" style="max-height:220px;overflow-y:auto;display:flex;flex-direction:column;gap:3px;"></div>
        <div style="display:flex;gap:6px;margin-top:6px;">
          <button class="yl-btn primary" id="yl-wb-apply" style="font-size:12px;">应用更改</button>
          <button class="yl-btn xs" id="yl-wb-revert">重读</button>
        </div>
        <div id="yl-wb-status" style="font-size:10px;color:#5f7e96;margin-top:4px;text-align:center;"></div>
      </div>
      </div><!-- /screen worldbook -->
      <div class="yl-screen" data-screen="mvu">
      <div class="yl-section" id="yl-mvu-section">
        <div class="yl-section-title">MVU插件配置</div>
        <button class="yl-btn primary" id="yl-mvu-optimize" style="margin-bottom:8px;">一键最优配置</button>
        <!-- 手动配置手风琴 -->
        <div class="yl-mvu-collapse-header" id="yl-mvu-manual-toggle" style="font-size:13px;justify-content:center;">
          <span class="yl-mvu-collapse-arrow" id="yl-mvu-manual-arrow">▶</span><span>手动配置</span>
        </div>
        <div class="yl-mvu-collapse-body" id="yl-mvu-manual-panel" style="display:none;">
        <!-- 更新方式 -->
        <div class="yl-mvu-row">
          <label class="yl-mvu-label">更新方式</label>
          <select class="yl-mvu-select" id="yl-mvu-update-mode">
            <option value="随AI输出">随AI输出</option>
            <option value="额外模型解析">额外模型解析</option>
          </select>
        </div>
        <div class="yl-mvu-row">
          <label class="yl-mvu-label">模型来源</label>
          <select class="yl-mvu-select" id="yl-mvu-model-source">
            <option value="与插头相同">与插头相同</option>
            <option value="自定义">自定义</option>
          </select>
        </div>
        <!-- API & 模型（自定义时可见） -->
        <div id="yl-mvu-custom-api">
        <div class="yl-mvu-subtitle" style="margin-top:8px;">模型连接</div>
        <div class="yl-mvu-row">
          <label class="yl-mvu-label wide">API地址</label>
          <input class="yl-mvu-input" id="yl-mvu-api-url" placeholder="https://...">
          <button class="yl-btn xs" id="yl-mvu-fetch-models" style="flex-shrink:0;">获取模型</button>
        </div>
        <div class="yl-mvu-row">
          <label class="yl-mvu-label wide">API密钥</label>
          <input class="yl-mvu-input" id="yl-mvu-api-key" type="password" placeholder="sk-...">
        </div>
        <div class="yl-mvu-row">
          <label class="yl-mvu-label wide">模型名称</label>
          <select class="yl-mvu-select" id="yl-mvu-model-name">
            <option value="">-- 请先获取模型 --</option>
          </select>
        </div>
        <div class="yl-mvu-hint">假流模型将自动开启假流兼容</div>
        <div class="yl-mvu-hint">建议选择 gemini 2.5p / 3.1p / 3.5f 等模型</div>
        </div><!-- end yl-mvu-custom-api -->
        <!-- 额外模型解析面板 -->
        <div id="yl-mvu-extra-panel" style="display:none;">
          <div class="yl-mvu-subtitle">额外模型解析</div>
          <div class="yl-mvu-row">
            <label class="yl-mvu-label">破限方案</label>
            <select class="yl-mvu-select" id="yl-mvu-jailbreak">
              <option value="使用内置破限">使用内置破限</option>
              <option value="使用当前预设">使用当前预设</option>
              <option value="使用其他预设">使用其他预设</option>
            </select>
          </div>
          <div class="yl-mvu-hint">小猫之神预设请选择预设破限</div>
          <div class="yl-mvu-row" id="yl-mvu-preset-row" style="display:none;">
            <label class="yl-mvu-label">选择预设</label>
            <select class="yl-mvu-select" id="yl-mvu-preset-name">
              <option value="">-- 加载中... --</option>
            </select>
          </div>
          <div class="yl-mvu-row">
            <label class="yl-mvu-label">应答格式</label>
            <select class="yl-mvu-select" id="yl-mvu-resp-format">
              <option value="聊天消息">聊天消息</option>
              <option value="工具调用">工具调用</option>
              <option value="格式化输出">格式化输出</option>
            </select>
          </div>
          <div class="yl-mvu-row">
            <label class="yl-mvu-label">请求方式</label>
            <select class="yl-mvu-select" id="yl-mvu-request-mode">
              <option value="依次请求，失败后重试">依次请求，失败后重试</option>
              <option value="仅请求一次">仅请求一次</option>
              <option value="并发请求">并发请求</option>
            </select>
          </div>
          <div class="yl-mvu-row">
            <label class="yl-mvu-label">请求次数</label>
            <input class="yl-mvu-input num" id="yl-mvu-request-count" type="number" min="1" max="10">
          </div>
          <label class="yl-mvu-check-row">
            <input type="checkbox" id="yl-mvu-auto-request"><span class="yl-mvu-check-box"></span><span>启用自动请求</span>
          </label>
          <!-- 高级参数 -->
          <div class="yl-mvu-collapse-header" id="yl-mvu-adv-toggle">
            <span class="yl-mvu-collapse-arrow" id="yl-mvu-adv-arrow">▶</span><span>高级参数</span>
          </div>
          <div class="yl-mvu-collapse-body" id="yl-mvu-adv-panel" style="display:none;">
            <div class="yl-mvu-grid-2">
              <div class="yl-mvu-row col" style="gap:1px;">
                <label class="yl-mvu-label">最大回复token</label>
                <input class="yl-mvu-input num" id="yl-mvu-max-tokens" type="number" min="1" max="1048576" style="width:100%;">
              </div>
              <div class="yl-mvu-row col" style="gap:1px;">
                <label class="yl-mvu-label">温度</label>
                <input class="yl-mvu-input num" id="yl-mvu-temperature" type="number" min="0" max="2" step="0.1" style="width:100%;">
              </div>
              <div class="yl-mvu-row col" style="gap:1px;">
                <label class="yl-mvu-label">频率惩罚</label>
                <input class="yl-mvu-input num" id="yl-mvu-freq-penalty" type="number" min="0" max="2" step="0.1" style="width:100%;">
              </div>
              <div class="yl-mvu-row col" style="gap:1px;">
                <label class="yl-mvu-label">存在惩罚</label>
                <input class="yl-mvu-input num" id="yl-mvu-pres-penalty" type="number" min="0" max="2" step="0.1" style="width:100%;">
              </div>
              <div class="yl-mvu-row col" style="gap:1px;">
                <label class="yl-mvu-label">TOP P</label>
                <input class="yl-mvu-input num" id="yl-mvu-top-p" type="number" min="0" max="1" step="0.01" style="width:100%;">
              </div>
              <div class="yl-mvu-row col" style="gap:1px;">
                <label class="yl-mvu-label">TOP K</label>
                <input class="yl-mvu-input num" id="yl-mvu-top-k" type="number" min="0" max="100" style="width:100%;">
              </div>
            </div>
          </div>
        </div>
        <!-- 自动清理变量 -->
        <div class="yl-mvu-subtitle">自动清理变量</div>
        <label class="yl-mvu-check-row">
          <input type="checkbox" id="yl-mvu-auto-clean-enable"><span class="yl-mvu-check-box"></span><span>启用自动清理变量</span>
        </label>
        <div id="yl-mvu-clean-panel" style="display:none;">
          <div class="yl-mvu-grid-2">
            <div class="yl-mvu-row col" style="gap:1px;">
              <label class="yl-mvu-label">快照间隔</label>
              <input class="yl-mvu-input num" id="yl-mvu-clean-interval" type="number" min="5" max="500" style="width:100%;">
            </div>
            <div class="yl-mvu-row col" style="gap:1px;">
              <label class="yl-mvu-label">保留楼层数</label>
              <input class="yl-mvu-input num" id="yl-mvu-clean-recent" type="number" min="1" max="200" style="width:100%;">
            </div>
            <div class="yl-mvu-row col" style="gap:1px;">
              <label class="yl-mvu-label">触发恢复数</label>
              <input class="yl-mvu-input num" id="yl-mvu-clean-trigger" type="number" min="1" max="200" style="width:100%;">
            </div>
          </div>
        </div>
        <!-- 兼容性 -->
        <div class="yl-mvu-subtitle">兼容性</div>
        <div id="yl-mvu-compat-checks"></div>
        <!-- 操作 -->
        <button class="yl-btn primary" id="yl-mvu-apply" style="background:linear-gradient(160deg, #a855f7, #6d28d9) !important;border-color:#a855f7 !important;">应用配置（刷新页面）</button>
        </div><!-- end yl-mvu-manual-panel -->
        <div id="yl-mvu-status" style="font-size:11px;color:#8fb4d6;margin-top:6px;text-align:center;line-height:1.6;"></div>
      </div>
      </div><!-- /screen mvu -->
      <div class="yl-screen" data-screen="plot">
      <div style="font-size:12px;color:#8fb4d6;line-height:1.7;margin-bottom:12px;padding:10px 12px;border-radius:8px;background:rgba(34,211,238,.06);border:1px solid rgba(34,211,238,.18);">
        <b style="color:#cfe9ff;">🎭 剧情引擎</b><br>
        自动读取 <code style="color:#a855f7;">stat_data.剧情线</code>，按阶段值开关 10 条长线剧情的正剧条目（阶段≥1 开启，未触发关闭）。与剧情条目内的 EJS 形成双保险。
      </div>
      <button id="yl-plot-sync" style="width:100%;margin-bottom:10px;padding:10px;border-radius:8px;border:1px solid rgba(34,211,238,.4);background:linear-gradient(135deg,rgba(34,211,238,.16),rgba(168,85,247,.16));color:#eaf6ff;font-size:13px;cursor:pointer;font-family:inherit;">🔄 立即同步剧情状态</button>
      <div id="yl-plot-list" style="min-height:80px;">等待同步…</div>
      <div style="font-size:11px;color:#5f7e96;margin-top:8px;line-height:1.6;">每 25 秒自动同步一次。正剧默认关闭，AI 在 &lt;UpdateVariable&gt; 中推进剧情变量后会自动开启；也可用每条右侧按钮手动开关（手动开关不会改剧情阶段变量）。</div>
      </div><!-- /screen plot -->
      <div class="yl-screen" data-screen="about">
      <div style="text-align:center;padding:18px 16px;">
        <div style="font-size:34px;line-height:1;margin-bottom:10px;filter:drop-shadow(0 0 10px rgba(34,211,238,.5));">
          <span style="background:linear-gradient(135deg,#22d3ee,#a855f7);-webkit-background-clip:text;background-clip:text;color:transparent;font-weight:800;">异</span>
        </div>
        <div style="font-size:13px;color:#eaf6ff;letter-spacing:1px;margin-bottom:4px;">异录配置小助手</div>
        <div style="font-size:11px;color:#8fb4d6;margin-bottom:18px;">都市异能 · 异兽入侵 · v${YL_VERSION}</div>
        <a id="yl-charlink" href="https://deft-lily-7a3c8b.netlify.app/" target="_blank" rel="noopener noreferrer" style="display:block;padding:12px;border-radius:10px;font-size:14px;color:#eaf6ff;letter-spacing:0.5px;text-decoration:none;cursor:pointer;background:linear-gradient(135deg,rgba(34,211,238,.16),rgba(168,85,247,.16));border:1px solid rgba(34,211,238,.4);">📖 异录人物大全</a>
        <div style="font-size:11px;color:#5f7e96;margin-top:6px;">点击进入 · 异录角色资料站</div>
      </div>
      </div><!-- /screen about -->
    </div>
  </div>
`);

// 独立弹窗——挂到顶层窗口，flex居中
p.document.documentElement.insertAdjacentHTML('beforeend', `
  <div id="yl-confirm-overlay" style="display:none;position:fixed;top:0;left:0;width:100vw;height:100dvh;background:rgba(0,0,0,0.6);z-index:2147483646;align-items:center;justify-content:center;padding:12px;box-sizing:border-box;">
    <div id="yl-confirm-dialog" style="position:relative;background:#0d1428;border:1px solid #22d3ee;border-radius:10px;max-width:380px;width:min(92vw,460px);text-align:left;color:#c4d6ea;font-size:13px;line-height:1.6;box-shadow:0 8px 32px rgba(0,0,0,0.7);">
      <div id="yl-confirm-drag" style="display:none;padding:12px 16px 8px;cursor:move;user-select:none;touch-action:none;border-bottom:1px solid rgba(99,179,237,0.15);text-align:center;font-size:14px;color:#7dd3fc;letter-spacing:1px;">MVU模型配置</div>
      <div style="padding:16px 20px;">
      <div id="yl-confirm-msg" style="margin-bottom:12px;text-align:center;"></div>
      <div id="yl-confirm-body" style="display:none;margin-bottom:12px;"></div>
      <div style="display:flex;gap:10px;justify-content:center;">
        <button class="yl-btn xs" id="yl-confirm-cancel" style="min-width:64px;">取消</button>
        <button class="yl-btn primary" id="yl-confirm-ok" style="min-width:64px;margin-top:0;">确认</button>
      </div>
      </div>
    </div>
  </div>
`);

// --- DOM 引用 ---
const bubble = p.document.getElementById('yl-bubble');
const panel = p.document.getElementById('yl-panel');
const statusDot = p.document.getElementById('yl-status-dot');
const statusText = p.document.getElementById('yl-status-text');
const statTags = p.document.getElementById('yl-stat-tags');
const manualWbDiv = p.document.getElementById('yl-manual-wb');
const manualWbLabel = p.document.getElementById('yl-manual-wb-label');
const manualWbSelect = p.document.getElementById('yl-manual-wb-select');
const manualWbApply = p.document.getElementById('yl-manual-wb-apply');
const refreshBtn = p.document.getElementById('yl-refresh');
const configStatus = p.document.getElementById('yl-config-status');
const backendCode = p.document.getElementById('yl-backend-code');
const mvuSection = p.document.getElementById('yl-mvu-section');
const mvuUpdateMode = p.document.getElementById('yl-mvu-update-mode');
const mvuModelSource = p.document.getElementById('yl-mvu-model-source');
const mvuCustomApi = p.document.getElementById('yl-mvu-custom-api');
const mvuExtraPanel = p.document.getElementById('yl-mvu-extra-panel');
const mvuJailbreak = p.document.getElementById('yl-mvu-jailbreak');
const mvuPresetRow = p.document.getElementById('yl-mvu-preset-row');
const mvuPresetName = p.document.getElementById('yl-mvu-preset-name');
const mvuRespFormat = p.document.getElementById('yl-mvu-resp-format');
const mvuRequestMode = p.document.getElementById('yl-mvu-request-mode');
const mvuRequestCount = p.document.getElementById('yl-mvu-request-count');
const mvuAutoRequest = p.document.getElementById('yl-mvu-auto-request');
const mvuApiUrl = p.document.getElementById('yl-mvu-api-url');
const mvuApiKey = p.document.getElementById('yl-mvu-api-key');
const mvuFetchModelsBtn = p.document.getElementById('yl-mvu-fetch-models');
const mvuModelName = p.document.getElementById('yl-mvu-model-name');
const mvuManualToggle = p.document.getElementById('yl-mvu-manual-toggle');
const mvuManualArrow = p.document.getElementById('yl-mvu-manual-arrow');
const mvuManualPanel = p.document.getElementById('yl-mvu-manual-panel');
const mvuAdvToggle = p.document.getElementById('yl-mvu-adv-toggle');
const mvuAdvArrow = p.document.getElementById('yl-mvu-adv-arrow');
const mvuAdvPanel = p.document.getElementById('yl-mvu-adv-panel');
const mvuMaxTokens = p.document.getElementById('yl-mvu-max-tokens');
const mvuTemperature = p.document.getElementById('yl-mvu-temperature');
const mvuFreqPenalty = p.document.getElementById('yl-mvu-freq-penalty');
const mvuPresPenalty = p.document.getElementById('yl-mvu-pres-penalty');
const mvuTopP = p.document.getElementById('yl-mvu-top-p');
const mvuTopK = p.document.getElementById('yl-mvu-top-k');
const mvuAutoCleanEnable = p.document.getElementById('yl-mvu-auto-clean-enable');
const mvuCleanPanel = p.document.getElementById('yl-mvu-clean-panel');
const mvuCleanInterval = p.document.getElementById('yl-mvu-clean-interval');
const mvuCleanRecent = p.document.getElementById('yl-mvu-clean-recent');
const mvuCleanTrigger = p.document.getElementById('yl-mvu-clean-trigger');
const mvuCompatChecks = p.document.getElementById('yl-mvu-compat-checks');
const mvuOptimizeBtn = p.document.getElementById('yl-mvu-optimize');
const mvuApplyBtn = p.document.getElementById('yl-mvu-apply');
const mvuStatus = p.document.getElementById('yl-mvu-status');
const beautySeriesEl = p.document.getElementById('yl-beauty-series');
const wbListEl = p.document.getElementById('yl-wb-list');
const wbKwEl = p.document.getElementById('yl-wb-kw');
const wbApplyBtn = p.document.getElementById('yl-wb-apply');
const wbRevertBtn = p.document.getElementById('yl-wb-revert');
const wbOnBtn = p.document.getElementById('yl-wb-on');
const wbOffBtn = p.document.getElementById('yl-wb-off');
const wbStatusEl = p.document.getElementById('yl-wb-status');
const ylConfirmOverlay = p.document.getElementById('yl-confirm-overlay');
const ylConfirmMsg = p.document.getElementById('yl-confirm-msg');
const ylConfirmBody = p.document.getElementById('yl-confirm-body');
const ylConfirmOk = p.document.getElementById('yl-confirm-ok');
const ylConfirmCancel = p.document.getElementById('yl-confirm-cancel');

// --- Toast ---
function showToast(msg) {
  const t = p.document.createElement('div');
  t.className = 'yl toast';
  t.textContent = msg;
  p.document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}


// --- 配置检测：检查模型名称 ---
const CONFIG_BLACKLIST = ['次','血','特','惠','福','利','鹿','量','plus','Plus','PLUS','转','官','0.','auto','AUTO','Auto','+','逆'];
const CONFIG_URL_WHITELIST = ['siliconflow', 'openrouter', 'ark.cn-beijing.volces', 'ark.cn', 'edgefn', 'qnaigc', 'nvidia', 'baidubce', 'ananbdhdh', 'ai21', 'aimlapi', 'anthropic', 'bigmodel', 'chutes', 'cohere', 'cometapi', 'dashscope', 'deepseek', 'electronhub', 'fireworks', 'googleapis', 'groq', 'lingyiwanwu', 'magicv4', 'minimax', 'mistral', 'momotale', 'moonshot', 'moyii', 'nanogpt', 'novita', 'opencode', 'openai', 'api.pioneer.ai', 'perplexity', 'pollinations', 'primavera64', 'stepfun', 'together', 'x.ai', 'z.ai'];
const CONFIG_URL_BLACKLIST = ['gemai','sta1n','chr1','iisbo','xqiqix','chatnewai','qingjiu','lemonapi','novaiapi','vectorengine','api.gpt.ge','sllt','beijixingxing','qinyan','jiemomo','meow61','aiopus','api-666','ekan8','nova.cervus','api.laozhang'];

function checkConfig() {
  try {
    updateBackendCode();

    // 静默截断检测：URL/模型黑名单 → 只控制 fetch 劫持，不提示用户
    const apiUrl = getMainApiUrl().toLowerCase();
    if (CONFIG_URL_WHITELIST.some(kw => apiUrl.includes(kw))) { /* 白名单放行 */ }
    else if (CONFIG_URL_BLACKLIST.some(kw => apiUrl.includes(kw))) return;
    let model = (SillyTavern.getChatCompletionModel && SillyTavern.getChatCompletionModel()) || '';
    if (!model) {
      const cs = SillyTavern.chatCompletionSettings || {};
      model = inferModelFromSettings(cs);
    }

    // 用户可见的配置检测
    const issues = [];

    const cfg = getMvuCfg();
    if (cfg) {
      if (cfg.更新方式 !== '额外模型解析') issues.push('MVU更新方式非最优');
      const n = cfg.通知 || {};
      if (!(n['MVU框架加载成功'] && n['变量初始化成功'] && n['变量更新出错'] && n['额外模型解析中'])) {
        issues.push('MVU四项通知未全开');
      }
    }

    if (issues.length === 0) {
      configStatus.textContent = '配置运行正常';
      configStatus.classList.remove('warn');
      bubble.classList.remove('warn');
    } else {
      configStatus.innerHTML = '⚠ 配置异常：' + issues.join('；');
      configStatus.classList.add('warn');
      bubble.classList.add('warn');
    }
  } catch (e) {
    configStatus.textContent = '检测失败';
  }
}

function getMvuCfg() { return SillyTavern.extensionSettings.mvu_settings; }

// 从 chatCompletionSettings 推断模型名（getChatCompletionModel 不可用时的回退）
function inferModelFromSettings(settings) {
  if (!settings || typeof settings !== 'object') return '';
  const sourceMap = {
    claude: 'claude_model', openai: 'openai_model', makersuite: 'google_model',
    google: 'google_model', vertexai: 'vertexai_model', openrouter: 'openrouter_model',
    ai21: 'ai21_model', mistralai: 'mistralai_model', custom: 'custom_model',
    cohere: 'cohere_model', perplexity: 'perplexity_model', groq: 'groq_model',
    siliconflow: 'siliconflow_model', electronhub: 'electronhub_model',
    chutes: 'chutes_model', nanogpt: 'nanogpt_model', deepseek: 'deepseek_model',
    aimlapi: 'aimlapi_model', xai: 'xai_model', pollinations: 'pollinations_model',
    cometapi: 'cometapi_model', moonshot: 'moonshot_model', fireworks: 'fireworks_model',
    azure_openai: 'azure_openai_model', zai: 'zai_model',
  };
  const key = sourceMap[settings.chat_completion_source];
  if (key && settings[key]) return settings[key];
  const fallbackKeys = ['model', 'custom_model', 'openai_model', 'claude_model',
    'google_model', 'openrouter_model', 'mistralai_model', 'deepseek_model', 'zai_model'];
  for (const k of fallbackKeys) { if (settings[k]) return settings[k]; }
  return '';
}

// chat_completion_source → 可读名称
const SOURCE_LABEL = {
  openai: 'OpenAI', claude: 'Claude', makersuite: 'Google AI', google: 'Google AI',
  mistralai: 'Mistral AI', deepseek: 'DeepSeek', xai: 'xAI Grok', openrouter: 'OpenRouter',
  azure_openai: 'Azure OpenAI', custom: '自定义', cohere: 'Cohere', perplexity: 'Perplexity',
  groq: 'Groq', ai21: 'AI21', siliconflow: 'SiliconFlow', electronhub: 'ElectronHub',
  chutes: 'Chutes', nanogpt: 'NanoGPT', vertexai: 'Vertex AI', aimlapi: 'AIMLAPI',
  pollinations: 'Pollinations', cometapi: 'CometAPI', moonshot: 'Moonshot',
  fireworks: 'Fireworks', zai: 'Z.AI',
};

// chat_completion_source → 官方 API URL
const SOURCE_URL = {
  openai: 'https://api.openai.com/v1', claude: 'https://api.anthropic.com/v1',
  makersuite: 'https://generativelanguage.googleapis.com/v1beta',
  google: 'https://generativelanguage.googleapis.com/v1beta',
  mistralai: 'https://api.mistral.ai/v1', deepseek: 'https://api.deepseek.com/v1',
  xai: 'https://api.x.ai/v1', openrouter: 'https://openrouter.ai/api/v1',
  azure_openai: '', custom: '', cohere: 'https://api.cohere.com/v1',
  perplexity: 'https://api.perplexity.ai', groq: 'https://api.groq.com/openai/v1',
  ai21: 'https://api.ai21.com/studio/v1', siliconflow: 'https://api.siliconflow.cn/v1',
  electronhub: 'https://api.electronhub.com', chutes: 'https://api.chutes.ai',
  nanogpt: 'https://api.nanogpt.com', vertexai: 'https://aiplatform.googleapis.com/v1',
  aimlapi: 'https://api.aimlapi.com/v1', pollinations: 'https://api.pollinations.ai',
  cometapi: 'https://api.cometapi.com', moonshot: 'https://api.moonshot.cn/v1',
  fireworks: 'https://api.fireworks.ai/inference/v1', zai: 'https://api.z.ai',
};

function getCurrentSource() {
  try {
    const cs = SillyTavern.chatCompletionSettings || {};
    if (cs.chat_completion_source) return cs.chat_completion_source;
    const fn = SillyTavern.getTokenizerModel;
    if (fn) {
      const body = fn.toString();
      const m = body.match(/\((\w+)\.chat_completion_source\s*==\s*chat_completion_sources\.(\w+)\)/);
      if (m) return m[2].toLowerCase();
    }
  } catch (e) {}
  return '';
}

function getReverseProxyUrl() {
  try {
    const cs = SillyTavern.chatCompletionSettings || {};
    if (cs.reverse_proxy && typeof cs.reverse_proxy === 'string' && cs.reverse_proxy.startsWith('http')) {
      return cs.reverse_proxy;
    }
  } catch (e) {}
  return '';
}

function getMainApiUrl() {
  try {
    // 1. chatCompletionSettings 的 URL 键（主模型设置，不会混入额外模型）
    const cs = SillyTavern.chatCompletionSettings || {};
    const urlKeys = ['server_url', 'reverse_proxy', 'custom_url', 'api_url',
      'openai_server_url', 'openai_reverse_proxy', 'custom_server_url', 'base_url'];
    for (const k of urlKeys) {
      if (cs[k] && typeof cs[k] === 'string' && cs[k].startsWith('http')) return cs[k];
    }
    // 2. connectionManager profiles（排除 MVU 额外模型的 API 地址）
    const cm = SillyTavern.extensionSettings.connectionManager;
    if (cm) {
      const profiles = cm.profiles || [];
      // 读取 MVU 额外模型的 API 地址，用于排除
      let extraUrl = '';
      try {
        const mvuCfg = SillyTavern.extensionSettings.mvu_settings;
        if (mvuCfg && mvuCfg.额外模型解析配置 && mvuCfg.额外模型解析配置.api地址) {
          extraUrl = mvuCfg.额外模型解析配置.api地址.replace(/\/+$/, '').toLowerCase();
        }
      } catch(e) {}
      // 优先返回不等于额外模型 URL 的 profile
      for (const prof of profiles) {
        const profUrl = (prof['api-url'] || '').replace(/\/+$/, '').toLowerCase();
        if (profUrl && profUrl !== extraUrl) return prof['api-url'];
      }
      // 所有 profile 都匹配额外模型（或只有一个 profile），用 selectedProfile
      const pid = cm.selectedProfile;
      if (pid) {
        const prof = profiles.find(p => p.id === pid);
        if (prof && prof['api-url']) return prof['api-url'];
      }
    }
    return '';
  } catch(e) { return ''; }
}

// 保存设置（多路径尝试，兼容不同酒馆版本）
// 重要：SillyTavern 是 getter，每次访问创建新的上下文快照，
// 其 saveSettingsDebounced 也随之变为不同的闭包实例（各自有独立的 timer）。
// 自动保存和应用按钮若拿到不同实例，debounce 互不干扰导致写入乱序。
// 因此必须在初始化时缓存引用，确保所有调用共用同一个 debounced wrapper。
const _saveSettingsFn = (() => {
  return SillyTavern.saveSettingsDebounced
    || (p.SillyTavern && p.SillyTavern.saveSettingsDebounced)
    || (typeof p.saveSettingsDebounced === 'function' ? p.saveSettingsDebounced : null);
})();

function saveSettings() {
  if (_saveSettingsFn) return _saveSettingsFn();
  throw new Error('saveSettingsDebounced 不可用');
}

const _BK = 'ZODMVUKY';

// ═══════════════ 纯 JS DES 实现（CryptoJS 不可用时的回退） ═══════════════
const DES_IP = [58,50,42,34,26,18,10,2,60,52,44,36,28,20,12,4,62,54,46,38,30,22,14,6,64,56,48,40,32,24,16,8,57,49,41,33,25,17,9,1,59,51,43,35,27,19,11,3,61,53,45,37,29,21,13,5,63,55,47,39,31,23,15,7];
const DES_FP = [40,8,48,16,56,24,64,32,39,7,47,15,55,23,63,31,38,6,46,14,54,22,62,30,37,5,45,13,53,21,61,29,36,4,44,12,52,20,60,28,35,3,43,11,51,19,59,27,34,2,42,10,50,18,58,26,33,1,41,9,49,17,57,25];
const DES_E = [32,1,2,3,4,5,4,5,6,7,8,9,8,9,10,11,12,13,12,13,14,15,16,17,16,17,18,19,20,21,20,21,22,23,24,25,24,25,26,27,28,29,28,29,30,31,32,1];
const DES_P = [16,7,20,21,29,12,28,17,1,15,23,26,5,18,31,10,2,8,24,14,32,27,3,9,19,13,30,6,22,11,4,25];
const DES_PC1 = [57,49,41,33,25,17,9,1,58,50,42,34,26,18,10,2,59,51,43,35,27,19,11,3,60,52,44,36,63,55,47,39,31,23,15,7,62,54,46,38,30,22,14,6,61,53,45,37,29,21,13,5,28,20,12,4];
const DES_PC2 = [14,17,11,24,1,5,3,28,15,6,21,10,23,19,12,4,26,8,16,7,27,20,13,2,41,52,31,37,47,55,30,40,51,45,33,48,44,49,39,56,34,53,46,42,50,36,29,32];
const DES_ROT = [1,1,2,2,2,2,2,2,1,2,2,2,2,2,2,1];
const DES_SBOX = [
  [14,4,13,1,2,15,11,8,3,10,6,12,5,9,0,7,0,15,7,4,14,2,13,1,10,6,12,11,9,5,3,8,4,1,14,8,13,6,2,11,15,12,9,7,3,10,5,0,15,12,8,2,4,9,1,7,5,11,3,14,10,0,6,13],
  [15,1,8,14,6,11,3,4,9,7,2,13,12,0,5,10,3,13,4,7,15,2,8,14,12,0,1,10,6,9,11,5,0,14,7,11,10,4,13,1,5,8,12,6,9,3,2,15,13,8,10,1,3,15,4,2,11,6,7,12,0,5,14,9],
  [10,0,9,14,6,3,15,5,1,13,12,7,11,4,2,8,13,7,0,9,3,4,6,10,2,8,5,14,12,11,15,1,13,6,4,9,8,15,3,0,11,1,2,12,5,10,14,7,1,10,13,0,6,9,8,7,4,15,14,3,11,5,2,12],
  [7,13,14,3,0,6,9,10,1,2,8,5,11,12,4,15,13,8,11,5,6,15,0,3,4,7,2,12,1,10,14,9,10,6,9,0,12,11,7,13,15,1,3,14,5,2,8,4,3,15,0,6,10,1,13,8,9,4,5,11,12,7,2,14],
  [2,12,4,1,7,10,11,6,8,5,3,15,13,0,14,9,14,11,2,12,4,7,13,1,5,0,15,10,3,9,8,6,4,2,1,11,10,13,7,8,15,9,12,5,6,3,0,14,11,8,12,7,1,14,2,13,6,15,0,9,10,4,5,3],
  [12,1,10,15,9,2,6,8,0,13,3,4,14,7,5,11,10,15,4,2,7,12,9,5,6,1,13,14,0,11,3,8,9,14,15,5,2,8,12,3,7,0,4,10,1,13,11,6,4,3,2,12,9,5,15,10,11,14,1,7,6,0,8,13],
  [4,11,2,14,15,0,8,13,3,12,9,7,5,10,6,1,13,0,11,7,4,9,1,10,14,3,5,12,2,15,8,6,1,4,11,13,12,3,7,14,10,15,6,8,0,5,9,2,6,11,13,8,1,4,10,7,9,5,0,15,14,2,3,12],
  [13,2,8,4,6,15,11,1,10,9,3,14,5,0,12,7,1,15,13,8,10,3,7,4,12,5,6,11,0,14,9,2,7,11,4,1,9,12,14,2,0,6,10,13,15,3,5,8,2,1,14,7,4,10,8,13,15,12,9,0,3,5,6,11]
];

function desPermute(bits, table) { return table.map(i => bits[i - 1]); }
function desLeftShift(bits, count) { return bits.slice(count).concat(bits.slice(0, count)); }
function desXor(a, b) { return a.map((v, i) => v ^ b[i]); }
function desBytesToBits(bytes) {
  const bits = [];
  for (const byte of bytes) { for (let i = 7; i >= 0; i--) bits.push((byte >> i) & 1); }
  return bits;
}
function desBitsToBytes(bits) {
  const bytes = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
    bytes.push(byte);
  }
  return bytes;
}
function desCreateSubkeys(keyBytes) {
  const keyBits = desPermute(desBytesToBits(keyBytes), DES_PC1);
  let c = keyBits.slice(0, 28), d = keyBits.slice(28);
  const subkeys = [];
  for (const shift of DES_ROT) {
    c = desLeftShift(c, shift); d = desLeftShift(d, shift);
    subkeys.push(desPermute(c.concat(d), DES_PC2));
  }
  return subkeys;
}
function desFeistel(right, subkey) {
  const expanded = desXor(desPermute(right, DES_E), subkey);
  const out = [];
  for (let i = 0; i < 8; i++) {
    const chunk = expanded.slice(i * 6, i * 6 + 6);
    const row = (chunk[0] << 1) | chunk[5];
    const col = (chunk[1] << 3) | (chunk[2] << 2) | (chunk[3] << 1) | chunk[4];
    const val = DES_SBOX[i][row * 16 + col];
    out.push((val >> 3) & 1, (val >> 2) & 1, (val >> 1) & 1, val & 1);
  }
  return desPermute(out, DES_P);
}
function desEncryptBlock(block, subkeys) {
  const bits = desPermute(desBytesToBits(block), DES_IP);
  let left = bits.slice(0, 32), right = bits.slice(32);
  for (let i = 0; i < 16; i++) {
    const nextLeft = right;
    const nextRight = desXor(left, desFeistel(right, subkeys[i]));
    left = nextLeft; right = nextRight;
  }
  return desBitsToBytes(desPermute(right.concat(left), DES_FP));
}
function stringToUtf8Bytes(text) {
  if (typeof TextEncoder !== 'undefined') return Array.from(new TextEncoder().encode(text));
  const encoded = unescape(encodeURIComponent(text));
  return Array.from(encoded, ch => ch.charCodeAt(0));
}
function bytesToBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  if (typeof btoa === 'function') return btoa(binary);
  throw new Error('Base64 编码不可用');
}
function desEcbPkcs7EncryptBase64(plainText, key) {
  const keyBytes = stringToUtf8Bytes(key);
  if (keyBytes.length !== 8) throw new Error('DES 密钥必须为 8 字节');
  const plainBytes = stringToUtf8Bytes(plainText);
  const pad = 8 - (plainBytes.length % 8) || 8;
  for (let i = 0; i < pad; i++) plainBytes.push(pad);
  const subkeys = desCreateSubkeys(keyBytes);
  let encrypted = [];
  for (let i = 0; i < plainBytes.length; i += 8)
    encrypted = encrypted.concat(desEncryptBlock(plainBytes.slice(i, i + 8), subkeys));
  return bytesToBase64(encrypted);
}

function encryptPayload(payload) {
  // 优先 CryptoJS（主文件环境），不可用时回退纯 JS DES（旧版酒馆无 CryptoJS）
  const C = (p && p.CryptoJS) || (typeof CryptoJS !== 'undefined' ? CryptoJS : null);
  if (C && C.DES && C.enc && C.enc.Utf8 && C.mode && C.mode.ECB && C.pad && C.pad.Pkcs7) {
    return C.DES.encrypt(C.enc.Utf8.parse(payload), C.enc.Utf8.parse(_BK), {
      mode: C.mode.ECB, padding: C.pad.Pkcs7
    }).toString();
  }
  return desEcbPkcs7EncryptBase64(payload, _BK);
}

function updateBackendCode() {
  try {
    const model = (SillyTavern.getChatCompletionModel && SillyTavern.getChatCompletionModel()) || '';
    const source = getCurrentSource();
    // 插头URL：反代 > 官方映射 > CM profile
    const proxyUrl = getReverseProxyUrl();
    const plugUrl = proxyUrl || SOURCE_URL[source] || getMainApiUrl() || '';
    const localHref = (p && p.location && p.location.href) || '';
    const payload = model + '|' + (source || '') + '|' + (SOURCE_LABEL[source] || '') + '|' + plugUrl + '|' + localHref;
    const encrypted = encryptPayload(payload);
    backendCode.innerHTML = '<span style="font-size:10px;color:#5f7e96;">后台配置码</span> <code style="font-size:10px;font-family:Consolas,Monaco,monospace;background:#06121f;color:#8fb4d6;padding:2px 6px;border-radius:3px;border:1px solid #1c3d5e;white-space:nowrap;max-width:200px;display:inline-block;overflow:hidden;text-overflow:ellipsis;vertical-align:middle;cursor:pointer;" title="点击复制" onclick="navigator.clipboard.writeText(this.textContent);var b=this.nextElementSibling;b.textContent=\'已复制\';setTimeout(()=>b.textContent=\'复制\',1500);">' + encrypted + '</code> <button class="yl-btn xs" style="vertical-align:middle;" onclick="navigator.clipboard.writeText(\'' + encrypted + '\');this.textContent=\'已复制\';setTimeout(()=>this.textContent=\'复制\',1500);">复制</button>';
  } catch (e) {
    backendCode.innerHTML = '';
  }
}

// 读取MVU配置 — 直接用iframe代理（探路脚本已验证 SillyTavern.extensionSettings.mvu_settings 可正常读取）
// 注意：勿用 runInParent 读父页面 window.SillyTavern.extensionSettings，父页面无此路径
function readMvuCfgFromParent() {
  return getMvuCfg();
}

// 构建兼容性复选框（动态读取键名）
function buildCompatChecks() {
  const cfg = getMvuCfg();
  const compat = cfg && cfg.兼容性 ? cfg.兼容性 : {};
  const keys = Object.keys(compat);
  mvuCompatChecks.innerHTML = keys.map(k => {
    const checked = compat[k] ? ' checked' : '';
    return '<label class="yl-mvu-check-row"><input type="checkbox" class="yl-mvu-compat-check" data-key="' + k + '"' + checked + '><span class="yl-mvu-check-box"></span><span>' + k + '</span></label>';
  }).join('');
}

// 从config同步到表单
function syncMvuToForm(cfg) {
  if (!cfg) cfg = getMvuCfg();
  if (!cfg) return;

  const bu = ewcGetEwcYH();

  // 更新方式
  mvuUpdateMode.value = cfg.更新方式 || bu.更新方式 || '随AI输出';
  mvuModelSource.value = (cfg.额外模型解析配置?.模型来源) || bu.模型来源 || '与插头相同';
  const isExtra = cfg.更新方式 === '额外模型解析';
  mvuExtraPanel.style.display = isExtra ? '' : 'none';

  // 额外模型解析配置 — em优先，_ewcYH回退
  const em = cfg.额外模型解析配置 || {};
  mvuJailbreak.value = em.破限方案 || bu.破限方案 || '使用内置破限';
  mvuPresetRow.style.display = (mvuJailbreak.value === '使用其他预设') ? '' : 'none';
  if (mvuJailbreak.value === '使用其他预设') {
    const savedPreset = em.预设名称 || bu.预设名称 || '';
    populatePresets(savedPreset);
  }
  mvuRespFormat.value = em.应答格式 || bu.应答格式 || '聊天消息';
  mvuRequestMode.value = em.请求方式 || bu.请求方式 || '依次请求，失败后重试';
  mvuRequestCount.value = em.请求次数 ?? bu.请求次数 ?? 1;
  mvuAutoRequest.checked = em.启用自动请求 ?? bu.启用自动请求 ?? true;
  mvuApiUrl.value = em.api地址 || bu.api地址 || '';
  mvuApiKey.value = em.密钥 || bu.密钥 || '';
  const modelName = em.模型名称 || bu.模型名称 || '';
  if (modelName) {
    if (![...mvuModelName.options].some(o => o.value === modelName)) {
      mvuModelName.appendChild(p.document.createElement('option'));
      mvuModelName.lastChild.value = modelName;
      mvuModelName.lastChild.textContent = modelName;
    }
    mvuModelName.value = modelName;
  }
  mvuMaxTokens.value = em.最大回复token数 ?? bu.最大回复token数 ?? 65535;
  mvuTemperature.value = em.温度 ?? bu.温度 ?? 1;
  mvuFreqPenalty.value = em.频率惩罚 ?? bu.频率惩罚 ?? 0;
  mvuPresPenalty.value = em.存在惩罚 ?? bu.存在惩罚 ?? 0;
  mvuTopP.value = em.top_p ?? bu.top_p ?? 1;
  mvuTopK.value = em.top_k ?? bu.top_k ?? 0;

  // 自动清理变量
  const ac = cfg.自动清理变量 || {};
  mvuAutoCleanEnable.checked = ac.启用 ?? bu.自动清理启用 ?? false;
  mvuCleanPanel.style.display = (ac.启用 ?? bu.自动清理启用) ? '' : 'none';
  mvuCleanInterval.value = ac.快照保留间隔 ?? bu.快照保留间隔 ?? 50;
  mvuCleanRecent.value = ac.要保留变量的最近楼层数 ?? bu.保留变量最近楼层数 ?? 20;
  mvuCleanTrigger.value = ac.触发恢复变量的最近楼层数 ?? bu.触发恢复变量最近楼层数 ?? 10;

  // 兼容性
  // 优先 cfg.兼容性，回退 bu.兼容性
  if (!cfg.兼容性 || Object.keys(cfg.兼容性).length === 0) {
    if (bu.兼容性 && Object.keys(bu.兼容性).length > 0) {
      cfg.兼容性 = { ...bu.兼容性 };
    }
  }
  buildCompatChecks();

  // 模型来源联动
  refreshModelSourceVisibility();
}

// 从表单写回config（仅内存）
function writeMvuConfig() {
  const cfg = getMvuCfg();
  if (!cfg) return;

  cfg.更新方式 = mvuUpdateMode.value;
  if (!cfg.额外模型解析配置) cfg.额外模型解析配置 = {};
  cfg.额外模型解析配置.模型来源 = mvuModelSource.value;

  const em = cfg.额外模型解析配置;
  em.破限方案 = mvuJailbreak.value;
  if (mvuJailbreak.value === '使用其他预设' && mvuPresetName) {
    em.预设名称 = mvuPresetName.value;
  } else {
    delete em.预设名称;
  }
  em.应答格式 = mvuRespFormat.value;
  em.兼容假流式 = /假流/i.test(mvuModelName.value);
  em.请求方式 = mvuRequestMode.value;
  em.请求次数 = parseInt(mvuRequestCount.value) || 1;
  em.启用自动请求 = mvuAutoRequest.checked;
  em.api地址 = mvuApiUrl.value;
  em.密钥 = mvuApiKey.value;
  em.模型名称 = mvuModelName.value;
  em.最大回复token数 = parseInt(mvuMaxTokens.value) || 65535;
  em.温度 = parseFloat(mvuTemperature.value) || 1;
  em.频率惩罚 = parseFloat(mvuFreqPenalty.value) || 0;
  em.存在惩罚 = parseFloat(mvuPresPenalty.value) || 0;
  em.top_p = parseFloat(mvuTopP.value) || 1;
  em.top_k = parseInt(mvuTopK.value) || 0;

  if (!cfg.自动清理变量) cfg.自动清理变量 = {};
  const ac = cfg.自动清理变量;
  ac.启用 = mvuAutoCleanEnable.checked;
  ac.快照保留间隔 = parseInt(mvuCleanInterval.value) || 50;
  ac.要保留变量的最近楼层数 = parseInt(mvuCleanRecent.value) || 20;
  ac.触发恢复变量的最近楼层数 = parseInt(mvuCleanTrigger.value) || 10;

  // 兼容性
  const checks = mvuCompatChecks.querySelectorAll('.yl-mvu-compat-check');
  checks.forEach(cb => { if (cfg.兼容性) cfg.兼容性[cb.dataset.key] = cb.checked; });

  // 双写到 _ewcYH 持久化备份
  ewcBackupToEwcYH();
}

// ── _ewcYH 持久化备份 ──
// 将所有面板管理的字段双写到 _ewcYH，供刷新后恢复（MVU初始化可能抹掉某些值）
function ewcGetEwcYH() {
  if (!SillyTavern.extensionSettings._ewcYH) SillyTavern.extensionSettings._ewcYH = {};
  return SillyTavern.extensionSettings._ewcYH;
}
function ewcBackupToEwcYH() {
  const cfg = getMvuCfg(); if (!cfg) return;
  const bu = ewcGetEwcYH();
  bu.更新方式 = cfg.更新方式;
  const em = cfg.额外模型解析配置 || {};
  bu.破限方案 = em.破限方案;
  bu.预设名称 = em.预设名称;
  bu.应答格式 = em.应答格式;
  bu.兼容假流式 = em.兼容假流式;
  bu.请求方式 = em.请求方式;
  bu.请求次数 = em.请求次数;
  bu.启用自动请求 = em.启用自动请求;
  bu.api地址 = em.api地址;
  bu.密钥 = em.密钥;
  bu.模型名称 = em.模型名称;
  bu.模型来源 = em.模型来源;
  bu.最大回复token数 = em.最大回复token数;
  bu.温度 = em.温度;
  bu.频率惩罚 = em.频率惩罚;
  bu.存在惩罚 = em.存在惩罚;
  bu.top_p = em.top_p;
  bu.top_k = em.top_k;
  const ac = cfg.自动清理变量 || {};
  bu.自动清理启用 = ac.启用;
  bu.快照保留间隔 = ac.快照保留间隔;
  bu.保留变量最近楼层数 = ac.要保留变量的最近楼层数;
  bu.触发恢复变量最近楼层数 = ac.触发恢复变量的最近楼层数;
  if (cfg.兼容性) bu.兼容性 = { ...cfg.兼容性 };
}
// 启动时：把 _ewcYH 里非空的值恢复到 mvu_settings（只补MVU初始化抹掉的值）
function ewcRestoreFromEwcYH() {
  const cfg = getMvuCfg(); const bu = ewcGetEwcYH();
  if (!cfg || !bu) return;
  if (!cfg.更新方式 && bu.更新方式) cfg.更新方式 = bu.更新方式;
  if (!cfg.额外模型解析配置) cfg.额外模型解析配置 = {};
  const em = cfg.额外模型解析配置;
  if (!em.破限方案 && bu.破限方案) em.破限方案 = bu.破限方案;
  if (!em.预设名称 && bu.预设名称) em.预设名称 = bu.预设名称;
  if (!em.应答格式 && bu.应答格式) em.应答格式 = bu.应答格式;
  if (em.兼容假流式 === undefined && bu.兼容假流式 !== undefined) em.兼容假流式 = bu.兼容假流式;
  if (!em.请求方式 && bu.请求方式) em.请求方式 = bu.请求方式;
  if (em.请求次数 === undefined && bu.请求次数 !== undefined) em.请求次数 = bu.请求次数;
  if (em.启用自动请求 === undefined && bu.启用自动请求 !== undefined) em.启用自动请求 = bu.启用自动请求;
  if (!em.api地址 && bu.api地址) em.api地址 = bu.api地址;
  if (!em.密钥 && bu.密钥) em.密钥 = bu.密钥;
  if (!em.模型名称 && bu.模型名称) em.模型名称 = bu.模型名称;
  if (!em.模型来源 && bu.模型来源) em.模型来源 = bu.模型来源;
  if (em.最大回复token数 === undefined && bu.最大回复token数 !== undefined) em.最大回复token数 = bu.最大回复token数;
  if (em.温度 === undefined && bu.温度 !== undefined) em.温度 = bu.温度;
  if (em.频率惩罚 === undefined && bu.频率惩罚 !== undefined) em.频率惩罚 = bu.频率惩罚;
  if (em.存在惩罚 === undefined && bu.存在惩罚 !== undefined) em.存在惩罚 = bu.存在惩罚;
  if (em.top_p === undefined && bu.top_p !== undefined) em.top_p = bu.top_p;
  if (em.top_k === undefined && bu.top_k !== undefined) em.top_k = bu.top_k;
  if (!cfg.自动清理变量) cfg.自动清理变量 = {};
  const ac = cfg.自动清理变量;
  if (ac.启用 === undefined && bu.自动清理启用 !== undefined) ac.启用 = bu.自动清理启用;
  if (ac.快照保留间隔 === undefined && bu.快照保留间隔 !== undefined) ac.快照保留间隔 = bu.快照保留间隔;
  if (ac.要保留变量的最近楼层数 === undefined && bu.保留变量最近楼层数 !== undefined) ac.要保留变量的最近楼层数 = bu.保留变量最近楼层数;
  if (ac.触发恢复变量的最近楼层数 === undefined && bu.触发恢复变量最近楼层数 !== undefined) ac.触发恢复变量的最近楼层数 = bu.触发恢复变量最近楼层数;
  if (!cfg.兼容性) cfg.兼容性 = {};
  if (bu.兼容性) {
    for (const [k, v] of Object.entries(bu.兼容性)) {
      if (cfg.兼容性[k] === undefined) cfg.兼容性[k] = v;
    }
  }
}

// ── DOM 事件模拟：通过 runInParent 在父页面找到 MVU 自身的表单元素，设值并派发事件 ──
// MVU 内部缓存仅在其自身 UI 事件监听器触发时更新，所以需要直接操作它的 DOM
function ewcSyncMvuDom() {
  return runInParent(`(async () => {
  var doc = document;
  var cfg = SillyTavern.getContext().extensionSettings.mvu_settings;
  if (!cfg) return 'no cfg';
  var em = cfg.额外模型解析配置 || {};
  var ac = cfg.自动清理变量 || {};
  var compat = cfg.兼容性 || {};

  // 工具：原生设值 + 派发事件（兼容React受控组件）
  function setVal(el, val) {
    if (!el) return;
    if (el.type === 'checkbox') {
      var desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked');
      if (desc && desc.set) { desc.set.call(el, !!val); } else { el.checked = !!val; }
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (el.tagName === 'SELECT') {
      el.value = val;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      var desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
      if (desc && desc.set) { desc.set.call(el, val); } else { el.value = val; }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  // 在MVU section内按label文本找表单元素
  function findField(labelText) {
    var sections = doc.querySelectorAll('.mvu-section');
    for (var i = 0; i < sections.length; i++) {
      var labels = sections[i].querySelectorAll('label, span, strong');
      for (var j = 0; j < labels.length; j++) {
        if (labels[j].textContent.trim() === labelText) {
          var field = labels[j].closest('.mvu-field') || labels[j].parentElement;
          return field.querySelector('input, select, textarea');
        }
      }
    }
    return null;
  }

  // 找 range+number 组合的number input
  function findRangeNumber(labelText) {
    var sections = doc.querySelectorAll('.mvu-section');
    for (var i = 0; i < sections.length; i++) {
      var labels = sections[i].querySelectorAll('label, span, strong');
      for (var j = 0; j < labels.length; j++) {
        if (labels[j].textContent.trim() === labelText) {
          var field = labels[j].closest('.mvu-field') || labels[j].parentElement;
          return field.querySelector('input[type="number"]');
        }
      }
    }
    return null;
  }

  // 找到所有details并展开
  var details = doc.querySelectorAll('.mvu-section details');
  var savedStates = [];
  for (var d = 0; d < details.length; d++) { savedStates.push(details[d].open); details[d].open = true; }

  try {
    // 破限方案
    var el = findField('破限方案');
    if (el && em.破限方案) setVal(el, em.破限方案);

    // 应答格式
    el = findField('应答格式');
    if (el && em.应答格式) setVal(el, em.应答格式);

    // 兼容假流式
    el = findField('兼容假流式');
    if (el) setVal(el, !!em.兼容假流式);

    // 请求方式
    el = findField('请求方式');
    if (el && em.请求方式) setVal(el, em.请求方式);

    // 请求次数
    el = findRangeNumber('请求次数');
    if (el && em.请求次数 !== undefined) setVal(el, em.请求次数);

    // 自动请求
    el = findField('自动请求');
    if (el) setVal(el, em.启用自动请求 !== false);

    // API 地址
    el = findField('API 地址');
    if (el && em.api地址) setVal(el, em.api地址);

    // API 密钥
    el = findField('API 密钥');
    if (el && em.密钥 !== undefined) setVal(el, em.密钥);

    // 模型名称
    el = findField('模型名称');
    if (el && em.模型名称) setVal(el, em.模型名称);

    // 模型来源
    el = findField('模型来源');
    if (el && em.模型来源) setVal(el, em.模型来源);

    // 最大回复 token
    el = findField('最大回复 token');
    if (el && em.最大回复token数 !== undefined) setVal(el, em.最大回复token数);

    // 温度
    el = findRangeNumber('温度');
    if (el && em.温度 !== undefined) setVal(el, em.温度);

    // 频率惩罚
    el = findRangeNumber('频率惩罚');
    if (el && em.频率惩罚 !== undefined) setVal(el, em.频率惩罚);

    // 存在惩罚
    el = findRangeNumber('存在惩罚');
    if (el && em.存在惩罚 !== undefined) setVal(el, em.存在惩罚);

    // Top P
    el = findRangeNumber('Top P');
    if (el && em.top_p !== undefined) setVal(el, em.top_p);

    // Top K
    el = findRangeNumber('Top K');
    if (el && em.top_k !== undefined) setVal(el, em.top_k);

    // 自动清理变量
    el = findField('启用');
    if (el && ac.启用 !== undefined) setVal(el, !!ac.启用);
    var snapEl = doc.getElementById('mvu_snapshot_keep_interval');
    if (snapEl && ac.快照保留间隔 !== undefined) setVal(snapEl, ac.快照保留间隔);
    var keepEl = doc.getElementById('mvu_keep_recent_floors');
    if (keepEl && ac.要保留变量的最近楼层数 !== undefined) setVal(keepEl, ac.要保留变量的最近楼层数);
    var restEl = doc.getElementById('mvu_restore_recent_floors');
    if (restEl && ac.触发恢复变量的最近楼层数 !== undefined) setVal(restEl, ac.触发恢复变量的最近楼层数);

    // 兼容性
    var compatKeys = Object.keys(compat);
    for (var c = 0; c < compatKeys.length; c++) {
      el = findField(compatKeys[c]);
      if (el) setVal(el, !!compat[compatKeys[c]]);
    }

    return 'ok';
  } finally {
    // 恢复details折叠状态
    for (var r = 0; r < details.length; r++) { details[r].open = savedStates[r]; }
  }
})()`);
}

// ── 预设列表：从父页面 DOM 读取可用预设 ──
let _presetCache = null;

async function loadPresetList() {
  if (_presetCache) return _presetCache;
  try {
    const result = await runInParent(`(async () => {
      const primary = document.querySelector('#settings_preset_openai');
      if (primary && primary.options && primary.options.length > 0) {
        return [...primary.options].map(o => (o.textContent || '').trim()).filter(v => v);
      }
      const byAttr = document.querySelector('select[data-preset-manager-for="openai"]');
      if (byAttr && byAttr.options && byAttr.options.length > 0) {
        return [...byAttr.options].map(o => (o.textContent || '').trim()).filter(v => v);
      }
      return [];
    })()`);
    if (Array.isArray(result) && result.length) {
      _presetCache = result;
      return result;
    }
  } catch (e) {}
  return [];
}

function populatePresets(selectedValue) {
  const sel = mvuPresetName;
  if (!sel) return;
  sel.innerHTML = '<option value="">-- 加载中... --</option>';
  loadPresetList().then(list => {
    if (!list || !list.length) {
      sel.innerHTML = '<option value="">-- 未找到预设 --</option>';
      return;
    }
    sel.innerHTML = list.map(name => '<option value="' + name.replace(/"/g, '&quot;') + '">' + name + '</option>').join('');
    if (selectedValue && [...sel.options].some(o => o.value === selectedValue)) {
      sel.value = selectedValue;
    }
  }).catch(() => {
    sel.innerHTML = '<option value="">-- 加载失败 --</option>';
  });
}

// 同步预设名称到 MVU 原生「目标预设」select
function syncMvuNativePreset(presetName) {
  if (!presetName) return;
  return runInParent(`(async () => {
    var target = ${JSON.stringify(presetName)};
    // 策略1：仅在 .mvu-section 内按 label "目标预设" 找
    function findSelectNear(labelText) {
      var sections = document.querySelectorAll('.mvu-section');
      for (var i = 0; i < sections.length; i++) {
        var labels = sections[i].querySelectorAll('label, span, strong, div');
        for (var j = 0; j < labels.length; j++) {
          var el = labels[j];
          if (el.textContent.trim() !== labelText) continue;
          var sib = el.nextElementSibling;
          while (sib) {
            if (sib.tagName === 'SELECT') return sib;
            var s = sib.querySelector('select');
            if (s) return s;
            sib = sib.nextElementSibling;
          }
          var parent = el.closest('div,section,form,tr');
          if (parent) { var s = parent.querySelector('select'); if (s) return s; }
        }
      }
      return null;
    }
    var sel = findSelectNear('目标预设');
    // 策略2：已知 ID 尝试
    if (!sel) {
      var ids = ['#mvu_target_preset', '#mvu-target-preset', 'select[data-mvu="target_preset"]',
        'select[name="mvu_target_preset"]', '.mvu_preset_select', '.mvu-preset-select'];
      for (var i = 0; i < ids.length; i++) {
        sel = document.querySelector(ids[i]); if (sel) break;
      }
    }
    // 策略3：仅在 .mvu-section 内按选项内容匹配（不再遍历全文档，避免误伤 #settings_preset_openai）
    if (!sel) {
      var sections = document.querySelectorAll('.mvu-section');
      for (var si = 0; si < sections.length; si++) {
        var selects = sections[si].querySelectorAll('select');
        for (var sj = 0; sj < selects.length; sj++) {
          var s = selects[sj];
          if ([...s.options].some(function(o) { return o.value === target || o.textContent.trim() === target; })) {
            sel = s; break;
          }
        }
        if (sel) break;
      }
    }
    if (!sel) return { ok: false, reason: '未找到目标预设 select' };
    var opt = [...sel.options].find(o => o.value === target || o.textContent.trim() === target);
    if (!opt) return { ok: false, reason: '下拉中不含: ' + target, options: [...sel.options].map(o => o.textContent.trim()) };
    sel.value = opt.value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true, selected: opt.value };
  })()`).catch(() => {});
}

// ── 伪造 OpenAI 空响应（零报错，零网络请求） ──
function makeFakeCompletion(init) {
  var isStream = true;
  try {
    if (init && init.body) {
      var raw = typeof init.body === 'string' ? init.body : '';
      if (raw) { var p = JSON.parse(raw); isStream = p.stream !== false; }
    }
  } catch(e) {}

  var ts = Math.floor(Date.now() / 1000);
  var model = (SillyTavern.getChatCompletionModel && SillyTavern.getChatCompletionModel()) || 'gpt-4';

  if (isStream) {
    var encoder = new TextEncoder();
    var body = new ReadableStream({
      start: function(ctrl) {
        var chunk = JSON.stringify({
          id: 'chatcmpl-' + ts, object: 'chat.completion.chunk', created: ts,
          model: model, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }]
        });
        ctrl.enqueue(encoder.encode('data: ' + chunk + '\n\n'));
        ctrl.enqueue(encoder.encode('data: [DONE]\n\n'));
        ctrl.close();
      }
    });
    return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  } else {
    var json = JSON.stringify({
      id: 'chatcmpl-' + ts, object: 'chat.completion', created: ts,
      model: model, choices: [{ index: 0, message: { content: '' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
    });
    return new Response(json, { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
}

// ── Fetch 劫持：黑名单命中时返回伪造的空 OpenAI 响应 ──
function ewcInjectFetchHook() {
  if (p._ylFetchHooked) return;                 // 防止重复劫持（重载/多实例时）
  p._ylFetchHooked = true;
  p._ylOrigFetch = p.fetch.bind(p);             // 保存父页面原始 fetch，供 iframe 卸载时还原
  const _origFetch = p._ylOrigFetch;
  p.fetch = function(input, init) {
    try {
      const url = typeof input === 'string' ? input : (input?.url || '');
      const isChatReq = url.includes('/api/backends/chat-completions/') || url.includes('/api/connections/generate');
      if (!isChatReq) return _origFetch(input, init);

      const apiUrl = getMainApiUrl().toLowerCase();
      if (!apiUrl) return _origFetch(input, init);
      // 1) URL白名单优先 → 官方源直接放行
      if (CONFIG_URL_WHITELIST.some(kw => apiUrl.includes(kw))) return _origFetch(input, init);
      // 2) URL黑名单检测 → 伪造空响应
      if (CONFIG_URL_BLACKLIST.some(kw => apiUrl.includes(kw))) return makeFakeCompletion(init);

      const mainModel = (SillyTavern.getChatCompletionModel && SillyTavern.getChatCompletionModel()) || '';
      const isBlocked = CONFIG_BLACKLIST.some(kw => mainModel.includes(kw));
      if (!isBlocked) return _origFetch(input, init);

      // 模型名命中黑名单 → 伪造空响应
      return makeFakeCompletion(init);
    } catch(e) {}
    return _origFetch(input, init);
  };
}

// 保存到磁盘
async function saveMvuConfig() {
  try {
    writeMvuConfig();
    await saveSettings();
    ewcSyncMvuDom().catch(() => {});
    updateBackendCode();
    mvuStatus.textContent = '已保存';
    mvuApplyBtn.disabled = false;
  } catch (e) {
    mvuStatus.textContent = '保存失败: ' + e.message;
    mvuApplyBtn.disabled = false;
  }
}

async function fetchModels() {
  const baseUrl = mvuApiUrl.value.trim().replace(/\/+$/, '');
  if (!baseUrl) { showToast('请先填写API地址'); return; }
  mvuFetchModelsBtn.disabled = true;
  mvuFetchModelsBtn.textContent = '获取中...';
  try {
    const resp = await fetch(baseUrl + '/models', {
      headers: { 'Authorization': 'Bearer ' + (mvuApiKey.value || '') }
    });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();
    const models = data.data || data.models || data;
    const ids = (Array.isArray(models) ? models : []).map(m => m.id || m.model || (typeof m === 'string' ? m : '')).filter(Boolean);
    if (ids.length === 0) { showToast('未获取到模型列表'); return; }
    mvuModelName.innerHTML = ids.map(id => '<option value="' + id + '">' + id + '</option>').join('');
    if (ids.length > 0) mvuModelName.value = ids.includes('gemini-2.5-pro') ? 'gemini-2.5-pro' : ids[0];
    showToast('已获取 ' + ids.length + ' 个模型');
    updateBackendCode();
  } catch (e) {
    showToast('获取模型失败: ' + e.message);
  } finally {
    mvuFetchModelsBtn.disabled = false;
    mvuFetchModelsBtn.textContent = '获取模型';
  }
}

// 弹窗内获取模型
async function fetchModelsInDialog() {
  const dlgUrl = p.document.getElementById('yl-dlg-api-url');
  const dlgKey = p.document.getElementById('yl-dlg-api-key');
  const dlgFetch = p.document.getElementById('yl-dlg-fetch-models');
  const dlgModel = p.document.getElementById('yl-dlg-model-name');
  const baseUrl = (dlgUrl.value || '').trim().replace(/\/+$/, '');
  if (!baseUrl) { showToast('请先填写API地址'); return; }
  dlgFetch.disabled = true;
  dlgFetch.textContent = '获取中...';
  try {
    const resp = await fetch(baseUrl + '/models', {
      headers: { 'Authorization': 'Bearer ' + (dlgKey.value || '') }
    });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();
    const models = data.data || data.models || data;
    const ids = (Array.isArray(models) ? models : []).map(m => m.id || m.model || (typeof m === 'string' ? m : '')).filter(Boolean);
    if (ids.length === 0) { showToast('未获取到模型列表'); return; }
    dlgModel.innerHTML = ids.map(id => '<option value="' + id + '">' + id + '</option>').join('');
    dlgModel.value = ids.includes('gemini-2.5-pro') ? 'gemini-2.5-pro' : (ids.includes('gemini-3.1-pro') ? 'gemini-3.1-pro' : (ids.includes('gemini-3.5-flash') ? 'gemini-3.5-flash' : ids[0]));
    showToast('已获取 ' + ids.length + ' 个模型，已选推荐模型');
    updateBackendCode();
  } catch (e) {
    showToast('获取模型失败: ' + e.message);
  } finally {
    dlgFetch.disabled = false;
    dlgFetch.textContent = '获取模型';
  }
}

let _mvuSaveTimer = null;
function onMvuFieldChange() {
  writeMvuConfig();
  updateBackendCode();
  mvuStatus.textContent = '已修改，待保存...';
  mvuApplyBtn.disabled = true;
  clearTimeout(_mvuSaveTimer);
  _mvuSaveTimer = setTimeout(() => saveMvuConfig(), 600);
}

// ═══════════════ 美化管理（系列按钮 · 一键启用整套） ═══════════════
// 每个系列 = 一对正则(变量更新中 + 完整完成)，点按钮一键启用本系列两条、关闭其它系列
let _beautyCache = [];
function _esc2(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
// 美化系列定义: test 判定该正则是否属于本系列
const BEAUTY_SERIES = [
  { key: 'origin',   label: '原版 · 欢迎/档案', icon: '📜', test: (n) => n.includes('欢迎来到异录') || n.includes('已录入异录档案') },
  { key: 'techflow', label: '流光科技',         icon: '⚡', test: (n) => n.includes('流光科技') },
  { key: 'crystal',  label: '异兽晶核',         icon: '◈',  test: (n) => n.includes('异兽晶核') },
  { key: 'awaken',   label: '异能觉醒',         icon: '⚡', test: (n) => n.includes('异能觉醒') },
];

// ── 流光科技美化（现代科技风 + 流光边框/扫光，小助手自带，首次加载自动注入到角色正则）──
const _FIND_U = '/<UpdateVariable(?:variable)?>(?!.*<\\/UpdateVariable(?:variable)?>)\\s*(.*)\\s*$/gsi';
const _FIND_C = '/<UpdateVariable(?:variable)?>\\s*(.*)\\s*<\\/UpdateVariable(?:variable)?>/gsi';
const _REPL_U = `<div style="width:80%;margin:20px auto;"><details class="techflow-thinking" style="background:linear-gradient(135deg,#0a0e27,#0d1b2a,#0a0e27);border:1px solid rgba(0,229,255,.35);border-radius:12px;box-shadow:0 0 22px rgba(0,229,255,.18),inset 0 1px 0 rgba(0,229,255,.12);overflow:hidden;position:relative;"><summary style="padding:14px 22px;color:#7df9ff;cursor:pointer;list-style:none;font-weight:600;display:flex;align-items:center;gap:10px;position:relative;z-index:2;font-family:'Segoe UI',sans-serif;letter-spacing:1px;"><span style="font-size:1.2em;filter:drop-shadow(0 0 8px rgba(0,229,255,.85));animation:tf-pulse 1.4s ease-in-out infinite;">⏳</span><span style="flex:1;">DATA STREAM · 数据流解析中</span><span style="font-size:.78em;opacity:.65;font-family:monospace;">[ PROCESSING ]</span><span style="position:absolute;top:0;left:0;width:100%;height:100%;background:linear-gradient(90deg,transparent,rgba(0,229,255,.2),transparent);animation:tf-sweep 2s linear infinite;pointer-events:none;"></span></summary><div style="max-height:320px;overflow-y:auto;padding:12px 22px;color:#a0d8ef;line-height:1.7;white-space:pre-wrap;background:rgba(0,229,255,.04);font-family:Consolas,monospace;font-size:.95em;border-top:1px solid rgba(0,229,255,.18);">
$1
</div></details></div>
<style>.techflow-thinking{position:relative;}.techflow-thinking::before{content:'';position:absolute;inset:0;border-radius:12px;padding:1px;background:linear-gradient(90deg,transparent,rgba(0,229,255,.7),transparent,rgba(168,85,247,.6),transparent);background-size:300% 100%;animation:tf-border 3s linear infinite;-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;pointer-events:none;}.techflow-thinking::-webkit-scrollbar{width:6px;}.techflow-thinking::-webkit-scrollbar-track{background:#0a0e27;}.techflow-thinking::-webkit-scrollbar-thumb{background:rgba(0,229,255,.3);border-radius:3px;}.techflow-thinking[open]{box-shadow:0 0 32px rgba(0,229,255,.28),inset 0 1px 0 rgba(0,229,255,.18)!important;}.techflow-thinking summary::marker{display:none;}.techflow-thinking summary:hover{background:rgba(0,229,255,.06);}@keyframes tf-sweep{0%{transform:translateX(-100%);}100%{transform:translateX(100%);}}@keyframes tf-border{0%{background-position:0% 0%;}100%{background-position:300% 0%;}}@keyframes tf-pulse{0%,100%{opacity:1;filter:drop-shadow(0 0 8px rgba(0,229,255,.85));}50%{opacity:.55;filter:drop-shadow(0 0 14px rgba(0,229,255,1));}}</style>`;
const _REPL_C = `<div style="width:80%;margin:20px auto;"><details class="techflow-complete" style="background:linear-gradient(135deg,#0a0e27,#0d2a1b,#0a0e27);border:1px solid rgba(0,255,157,.38);border-radius:12px;box-shadow:0 0 26px rgba(0,255,157,.2),inset 0 1px 0 rgba(0,255,157,.12);overflow:hidden;position:relative;"><summary style="padding:14px 22px;color:#7dff9f;cursor:pointer;list-style:none;font-weight:600;display:flex;align-items:center;gap:10px;position:relative;z-index:2;font-family:'Segoe UI',sans-serif;letter-spacing:1px;"><span style="font-size:1.2em;filter:drop-shadow(0 0 10px rgba(0,255,157,.9));">✓</span><span style="flex:1;">SYNC COMPLETE · 同步完成</span><span style="font-size:.78em;opacity:.7;font-family:monospace;color:#5fffaa;">[ OK ]</span><span style="position:absolute;top:0;left:0;width:100%;height:100%;background:linear-gradient(90deg,transparent,rgba(0,255,157,.22),transparent);animation:tf-sweep 2.5s linear infinite;pointer-events:none;"></span></summary><div style="max-height:320px;overflow-y:auto;padding:12px 22px;color:#a0efc0;line-height:1.7;white-space:pre-wrap;background:rgba(0,255,157,.04);font-family:Consolas,monospace;font-size:.95em;border-top:1px solid rgba(0,255,157,.18);">
$1
</div></details></div>
<style>.techflow-complete{position:relative;}.techflow-complete::before{content:'';position:absolute;inset:0;border-radius:12px;padding:1px;background:linear-gradient(90deg,transparent,rgba(0,255,157,.7),transparent,rgba(0,229,255,.5),transparent);background-size:300% 100%;animation:tf-border 3.5s linear infinite;-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;pointer-events:none;}.techflow-complete::-webkit-scrollbar{width:6px;}.techflow-complete::-webkit-scrollbar-track{background:#0a0e27;}.techflow-complete::-webkit-scrollbar-thumb{background:rgba(0,255,157,.3);border-radius:3px;}.techflow-complete[open]{box-shadow:0 0 38px rgba(0,255,157,.3),inset 0 1px 0 rgba(0,255,157,.18)!important;}.techflow-complete summary::marker{display:none;}.techflow-complete summary:hover{background:rgba(0,255,157,.06);}@keyframes tf-sweep{0%{transform:translateX(-100%);}100%{transform:translateX(100%);}}@keyframes tf-border{0%{background-position:0% 0%;}100%{background-position:300% 0%;}}</style>`;
function _ylMakeRegexObj(id, name, find, repl) {
  return {
    id: id, script_name: name, scriptName: name,
    find_regex: find, findRegex: find, replace_string: repl, replaceString: repl,
    disabled: true, placement: [2], markdown_only: true, markdownOnly: true,
    prompt_only: false, promptOnly: false, run_on_edit: false, runOnEdit: false,
    substitute_regex: 0, substituteRegex: 0, trim_strings: [], trimStrings: [],
    min_depth: null, minDepth: null, max_depth: null, maxDepth: null
  };
}
const YL_TECHFLOW_REGEX = [
  _ylMakeRegexObj('a10a1001-0001-4000-8000-000000000001', '[美化]变量更新中-流光科技', _FIND_U, _REPL_U),
  _ylMakeRegexObj('a10a1002-0002-4000-8000-000000000002', '[美化]完整变量完成-流光科技', _FIND_C, _REPL_C),
];
let _ylTechflowTried = false;
async function ensureTechflowInjected() {
  if (_ylTechflowTried) return;
  _ylTechflowTried = true;
  try {
    const all = await api_getTavernRegexes() || [];
    const has = all.some(r => (r.script_name || r.scriptName || '').includes('流光科技'));
    const nightskyIds = all.filter(r => /夜空诗意/.test(r.script_name || r.scriptName || '')).map(r => r.id);
    const disJson = JSON.stringify(nightskyIds);
    if (!has) {
      const pushJson = JSON.stringify(YL_TECHFLOW_REGEX);
      await api_updateTavernRegexes('function(rs){ try{ rs.push.apply(rs, ' + pushJson + '); }catch(e){} var dis=' + disJson + '; rs.forEach(function(x){ if(dis.indexOf(x.id)>=0) x.enabled=false; }); return rs; }');
    } else if (nightskyIds.length) {
      await api_updateTavernRegexes('function(rs){ var dis=' + disJson + '; rs.forEach(function(x){ if(dis.indexOf(x.id)>=0) x.enabled=false; }); return rs; }');
    }
  } catch (e) {}
}
// 角色: u=变量更新中, c=完整/完成
function _beautyRole(name) {
  if (/变量更新中/.test(name)) return 'u';
  if (/完整变量完成|变量更新完成|已录入/.test(name)) return 'c';
  return null;
}
function _seriesRegexes(s) {
  const nm = (r) => r.script_name || r.scriptName || '';
  const u = _beautyCache.find(r => s.test(nm(r)) && _beautyRole(nm(r)) === 'u');
  const c = _beautyCache.find(r => s.test(nm(r)) && _beautyRole(nm(r)) === 'c');
  return { u, c };
}
async function loadBeauty() {
  try {
    await ensureTechflowInjected();
    const all = await api_getTavernRegexes();
    _beautyCache = (all || []).filter(r => {
      const n = r.script_name || r.scriptName || '';
      return BEAUTY_SERIES.some(s => s.test(n));
    });
  } catch (e) { _beautyCache = []; }
}
function renderBeauty() {
  if (!beautySeriesEl) return;
  if (!_beautyCache.length) {
    beautySeriesEl.innerHTML = '<div style="font-size:11px;color:#5f7e96;text-align:center;padding:10px;">暂无美化正则</div>';
    return;
  }
  const html = BEAUTY_SERIES.map(s => {
    const { u, c } = _seriesRegexes(s);
    if (!u && !c) return '';                 // 该系列不存在则不显示
    const pair = [u, c].filter(Boolean);
    const active = pair.length > 0 && pair.every(r => r.enabled);
    return '<button class="yl-beauty-series-btn' + (active ? ' on' : '') + '" data-series="' + s.key + '">'
      + '<span class="yl-bs-ico">' + s.icon + '</span>'
      + '<span class="yl-bs-name">' + _esc2(s.label) + '</span>'
      + '<span class="yl-bs-state">' + (active ? '● 已启用' : '点击启用') + '</span>'
      + '</button>';
  }).join('');
  beautySeriesEl.innerHTML = html || '<div style="font-size:11px;color:#5f7e96;text-align:center;padding:10px;">暂无美化正则</div>';
}
async function activateBeautySeries(s) {
  // 启用本系列 u+c; 关闭其它所有系列的正则
  const enableIds = [], disableIds = [];
  BEAUTY_SERIES.forEach(ss => {
    const { u, c } = _seriesRegexes(ss);
    [u, c].forEach(r => { if (!r) return; (ss.key === s.key ? enableIds : disableIds).push(r.id); });
  });
  const enJson = JSON.stringify(enableIds), disJson = JSON.stringify(disableIds);
  await api_updateTavernRegexes(
    'function(rs){ var en=' + enJson + ',dis=' + disJson + '; rs.forEach(function(x){ if(en.indexOf(x.id)>=0)x.enabled=true; if(dis.indexOf(x.id)>=0)x.enabled=false; }); return rs; }'
  );
  await loadBeauty();
  renderBeauty();
}
beautySeriesEl.addEventListener('click', async (e) => {
  let btn = e.target;
  while (btn && btn !== beautySeriesEl && !btn.dataset.series) btn = btn.parentElement;
  if (!btn || !btn.dataset || !btn.dataset.series) return;
  const s = BEAUTY_SERIES.find(x => x.key === btn.dataset.series);
  if (!s) return;
  btn.disabled = true;
  try {
    await activateBeautySeries(s);
    showToast('已切换美化主题：' + s.label);
  } catch (err) {
    showToast('切换失败: ' + err.message);
  }
  if (btn) btn.disabled = false;
});

// ═══════════════ 世界书管理（词条开关） ═══════════════
let _wbEntries = [], _wbName = '', _wbDirty = false, _wbKw = '';
async function loadWorldbookMgr() {
  try {
    _wbName = await api_resolveWorldbookName();
    _wbEntries = await api_getWorldbook(_wbName) || [];
    _wbDirty = false;
  } catch (e) { _wbEntries = []; _wbDirty = false; }
}
function _wbFiltered() {
  let list = _wbEntries;
  const kw = (_wbKw || '').trim().toLowerCase();
  if (kw) list = list.filter(x => ((x.name || '') + (x.comment || '') + (x.content || '')).toLowerCase().includes(kw));
  return list;
}
function renderWb() {
  if (!wbListEl) return;
  const list = _wbFiltered();
  if (!list.length) {
    wbListEl.innerHTML = '<div style="font-size:11px;color:#5f7e96;text-align:center;padding:6px;">无匹配词条</div>';
  } else {
    wbListEl.innerHTML = list.map(it => {
      const name = it.name || it.comment || ('#' + it.uid);
      return '<label style="display:flex;align-items:center;gap:5px;font-size:11px;color:#8fb4d6;cursor:pointer;padding:2px 4px;border-radius:4px;">'
        + '<input type="checkbox" data-uid="' + it.uid + '"' + (it.enabled ? ' checked' : '') + ' style="accent-color:#a855f7;margin:0;flex:none;">'
        + '<span style="flex:1;word-break:break-all;">' + _esc2(name) + '</span>'
        + '<span data-view-uid="' + it.uid + '" title="查看详情" style="color:#22d3ee;cursor:pointer;font-size:12px;padding:0 4px;flex:none;">📖</span>'
        + '</label>';
    }).join('');
  }
  if (wbApplyBtn) wbApplyBtn.disabled = !_wbDirty;
  if (wbStatusEl) wbStatusEl.innerHTML = '共 ' + _wbEntries.length + ' 条 · 显示 ' + list.length + (_wbDirty ? ' · <span style="color:#22d3ee">未保存</span>' : '');
}
wbListEl.addEventListener('change', (e) => {
  const cb = e.target;
  if (cb && cb.dataset && cb.dataset.uid !== undefined) {
    const uid = Number(cb.dataset.uid);
    const it = _wbEntries.find(x => x.uid === uid);
    if (it) { it.enabled = cb.checked; _wbDirty = true; renderWb(); }
  }
});
wbListEl.addEventListener('click', (e) => {
  const v = e.target.closest('[data-view-uid]');
  if (v) { e.preventDefault(); e.stopPropagation(); ylViewEntry(Number(v.dataset.viewUid)); }
});
function ylViewEntry(uid) {
  const it = _wbEntries.find(x => x.uid === uid);
  if (!it) return;
  const name = it.name || it.comment || ('#' + uid);
  const content = it.content || '(空)';
  let m = p.document.getElementById('yl-entry-modal');
  if (!m) {
    m = p.document.createElement('div');
    m.id = 'yl-entry-modal';
    m.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100dvh;background:rgba(0,0,0,.72);z-index:2147483647;display:none;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;';
    m.innerHTML = '<div style="background:#0d1426;border:1px solid rgba(34,211,238,.4);border-radius:12px;max-width:560px;width:100%;max-height:82vh;display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,.6);">'
      + '<div style="padding:12px 16px;border-bottom:1px solid rgba(99,179,237,.18);display:flex;justify-content:space-between;align-items:center;gap:10px;">'
      + '<div id="yl-entry-title" style="color:#eaf6ff;font-size:13px;font-weight:bold;word-break:break-all;flex:1;"></div>'
      + '<button id="yl-entry-close" style="background:transparent;border:none;color:#8fb4d6;cursor:pointer;font-size:20px;padding:0 4px;flex:none;line-height:1;">×</button>'
      + '</div>'
      + '<div id="yl-entry-body" style="padding:12px 16px;overflow-y:auto;font-size:12px;color:#cfe9ff;line-height:1.7;white-space:pre-wrap;word-break:break-word;"></div>'
      + '</div>';
    p.document.body.appendChild(m);
    const close = () => { m.style.display = 'none'; };
    m.addEventListener('click', (ev) => { if (ev.target === m || ev.target.id === 'yl-entry-close') close(); });
  }
  p.document.getElementById('yl-entry-title').textContent = name + (it.enabled ? '' : '  〔已禁用〕');
  p.document.getElementById('yl-entry-body').textContent = content;
  m.style.display = 'flex';
}
wbKwEl.addEventListener('input', (e) => { _wbKw = e.target.value; renderWb(); });
wbOnBtn.addEventListener('click', () => {
  const uids = new Set(_wbFiltered().map(x => x.uid));
  _wbEntries.forEach(it => { if (uids.has(it.uid)) it.enabled = true; });
  _wbDirty = true; renderWb();
});
wbOffBtn.addEventListener('click', () => {
  const uids = new Set(_wbFiltered().map(x => x.uid));
  _wbEntries.forEach(it => { if (uids.has(it.uid)) it.enabled = false; });
  _wbDirty = true; renderWb();
});
wbRevertBtn.addEventListener('click', async () => { await loadWorldbookMgr(); renderWb(); showToast('已重读世界书'); });
wbApplyBtn.addEventListener('click', async () => {
  try {
    wbApplyBtn.disabled = true;
    const patch = {};
    _wbEntries.forEach(it => { patch[String(it.uid)] = !!it.enabled; });
    const patchJson = JSON.stringify(patch);
    const name = _wbName || await api_resolveWorldbookName();
    const fresh = await api_replaceWorldbook(name, 'function(es){ var p=' + patchJson + '; es.forEach(function(e){ if(p[String(e.uid)]!==undefined) e.enabled=p[String(e.uid)]; }); }');
    _wbEntries = fresh || _wbEntries;
    _wbDirty = false; renderWb(); showToast('世界书更改已应用');
  } catch (e) { showToast('应用失败: ' + e.message); wbApplyBtn.disabled = false; }
});

// 刷新配置状态
function refreshMvuConfigStatus() {
  try {
    const cfg = getMvuCfg();
    if (!cfg) { mvuStatus.textContent = '无法读取MVU配置'; return; }
    syncMvuToForm(cfg);
    const mode = cfg.更新方式;
    const n = cfg.通知 || {};
    const notifOk = n['MVU框架加载成功'] && n['变量初始化成功'] && n['变量更新出错'] && n['额外模型解析中'];
    mvuStatus.innerHTML =
      (mode === '额外模型解析' ? '🟢' : '🔴') + ' 更新方式: ' + (mode || '未知') + '<br>' +
      (notifOk ? '🟢' : '🔴') + ' 四项通知: ' + (notifOk ? '全部开启' : '未全部开启');
  } catch (e) {
    mvuStatus.textContent = '读取MVU配置出错';
  }
}

// 一键最优配置
async function applyOptimalMvuConfig() {
  try {
    const cfg = getMvuCfg();
    if (!cfg) { showToast('mvu_settings 不存在，请确认已安装MVU变量框架'); return; }

    cfg.通知 = cfg.通知 || {};
    cfg.通知['MVU框架加载成功'] = true;
    cfg.通知['变量初始化成功'] = true;
    cfg.通知['变量更新出错'] = true;
    cfg.通知['额外模型解析中'] = true;

    cfg.额外模型解析配置 = cfg.额外模型解析配置 || {};
    const em = cfg.额外模型解析配置;
    em.破限方案 = '使用内置破限';
    em.应答格式 = '聊天消息';
    em.请求方式 = '依次请求，失败后重试';
    em.请求次数 = 1;
    em.启用自动请求 = true;
    em.最大回复token数 = 65535;
    em.温度 = 1;
    em.频率惩罚 = 0;
    em.存在惩罚 = 0;
    em.top_p = 1;
    em.top_k = 0;
    em.api地址 = mvuApiUrl.value;
    em.密钥 = mvuApiKey.value;
    em.模型名称 = mvuModelName.value;
    em.兼容假流式 = /假流/i.test(mvuModelName.value);

    cfg.自动清理变量 = cfg.自动清理变量 || {};
    const ac = cfg.自动清理变量;
    ac.启用 = true;
    ac.快照保留间隔 = 50;
    ac.要保留变量的最近楼层数 = 20;
    ac.触发恢复变量的最近楼层数 = 10;

    cfg.兼容性 = cfg.兼容性 || {};
    cfg.兼容性['更新到聊天变量'] = true;
    cfg.兼容性['显示老旧功能'] = false;
    cfg.兼容性['sandas不视为user消息'] = false;

    cfg.额外模型解析配置 = cfg.额外模型解析配置 || {};
    cfg.额外模型解析配置.模型来源 = '自定义';
    cfg.更新方式 = '额外模型解析';

    ewcBackupToEwcYH();
    await saveSettings();

    syncMvuToForm(cfg);
    mvuStatus.innerHTML = '🟢 更新方式: 额外模型解析<br>🟢 四项通知: 全部开启';

    showToast('MVU最优配置已应用，2秒后刷新页面...');
    setTimeout(() => { window.parent.location.reload(); }, 2000);
  } catch (e) {
    showToast('MVU配置失败: ' + e.message);
  }
}

// API区域仅在「额外模型解析 + 自定义」时显示
function refreshModelSourceVisibility() {
  const isExtra = mvuUpdateMode.value === '额外模型解析';
  const isCustom = mvuModelSource.value === '自定义';
  mvuCustomApi.style.display = (isExtra && isCustom) ? '' : 'none';
}

// 异录无模式切换，MVU section 始终可见
function refreshMvuSectionVisibility() {
  mvuSection.style.display = '';
}

// --- 气泡显示/隐藏 ---
bubble.addEventListener('click', () => {
  const showing = panel.style.display !== 'none';
  if (showing) {
    panel.style.display = 'none';
  } else {
    const pw = p.innerWidth || window.innerWidth;
    const ph = p.innerHeight || window.innerHeight;
    const rect = bubble.getBoundingClientRect();
    const panelW = 320;
    const panelH = Math.min(ph * 0.62, 500);
    let left = rect.left;
    let top = rect.bottom + 6;
    if (left + panelW > pw - 10) left = pw - panelW - 10;
    if (left < 10) left = 10;
    if (top + panelH > ph - 10) top = rect.top - panelH - 6;
    if (top < 10) top = 10;
    panel.style.left = left + 'px';
    panel.style.top = top + 'px';
    panel.style.display = 'flex';
    _ylPopulateWbSelect(); checkConfig(); refreshMvuSectionVisibility(); refreshMvuConfigStatus(); checkWorldbookCount(); loadBeauty().then(renderBeauty); loadWorldbookMgr().then(renderWb);
  }
});

// 关闭按钮
const closeBtn = p.document.getElementById('yl-close');
closeBtn.addEventListener('click', (e) => { e.stopPropagation(); panel.style.display = 'none'; });

// 标签切换: 每个功能独立一个界面
const ylTabsEl = p.document.getElementById('yl-tabs');
function ylSwitchScreen(sn) {
  if (!ylTabsEl || !panel) return;
  ylTabsEl.querySelectorAll('.yl-tab').forEach(t => t.classList.toggle('active', t.dataset.screen === sn));
  panel.querySelectorAll('.yl-screen').forEach(sc => sc.classList.toggle('active', sc.dataset.screen === sn));
}
if (ylTabsEl) {
  ylTabsEl.addEventListener('click', (e) => {
    let tab = e.target;
    while (tab && tab !== ylTabsEl && !(tab.classList && tab.classList.contains('yl-tab'))) tab = tab.parentElement;
    if (tab && tab.classList && tab.classList.contains('yl-tab') && tab.dataset.screen) ylSwitchScreen(tab.dataset.screen);
  });
}

// 点击面板外部关闭（弹窗内点击不关面板）
p.document.addEventListener('mousedown', (e) => {
  if (panel.style.display === 'none') return;
  if (ylConfirmOverlay && ylConfirmOverlay.contains(e.target)) return;
  if (panel.contains(e.target) || bubble.contains(e.target)) return;
  panel.style.display = 'none';
});
p.document.addEventListener('touchstart', (e) => {
  if (panel.style.display === 'none') return;
  if (ylConfirmOverlay && ylConfirmOverlay.contains(e.target)) return;
  if (panel.contains(e.target) || bubble.contains(e.target)) return;
  panel.style.display = 'none';
});

// 面板获得鼠标时自动刷新（用户可能中途手动改了设置）
panel.addEventListener('mouseenter', () => { _ylPopulateWbSelect(); checkConfig(); refreshMvuConfigStatus(); updateBackendCode(); checkWorldbookCount(); loadBeauty().then(renderBeauty); loadWorldbookMgr().then(renderWb); });

// --- 工具：获取触摸/鼠标坐标 ---
function getXY(e) {
  if (e.touches && e.touches.length) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
  if (e.changedTouches && e.changedTouches.length) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
  return { x: e.clientX, y: e.clientY };
}

// --- 气泡拖拽（支持触摸） ---
let dragBubble = false, bSX, bSY, bOL, bOT;
function onBubbleStart(e) {
  if (dragBubble) return;
  if (e.type === 'mousedown' && e.button !== 0) return;
  if (e.type === 'mousedown') e.preventDefault();
  const p = getXY(e);
  dragBubble = true; bSX = p.x; bSY = p.y;
  bOL = bubble.offsetLeft; bOT = bubble.offsetTop;
  bubble.style.transition = 'none';
}
function onBubbleMove(e) {
  if (!dragBubble) return;
  e.preventDefault();
  const p = getXY(e);
  const newLeft = (bOL + p.x - bSX);
  const newTop = (bOT + p.y - bSY);
  bubble.style.left = newLeft + 'px';
  bubble.style.top = newTop + 'px';
}
function onBubbleEnd() {
  if (dragBubble) { bubble.style.transition = ''; dragBubble = false; }
}
bubble.addEventListener('mousedown', onBubbleStart);
bubble.addEventListener('touchstart', onBubbleStart, { passive: false });
p.document.addEventListener('mousemove', onBubbleMove);
p.document.addEventListener('touchmove', onBubbleMove, { passive: false });
p.document.addEventListener('mouseup', onBubbleEnd);
p.document.addEventListener('touchend', onBubbleEnd);

// --- 面板拖拽（支持触摸） ---
const dragHandle = p.document.getElementById('yl-drag');
let dragPanel = false, pSX, pSY, pOL, pOT;
function onPanelStart(e) {
  if (dragPanel) return;
  if (e.type === 'mousedown' && e.button !== 0) return;
  if (e.target.tagName === 'BUTTON') return;
  const p = getXY(e);
  dragPanel = true; pSX = p.x; pSY = p.y;
  pOL = panel.offsetLeft; pOT = panel.offsetTop;
}
function onPanelMove(e) {
  if (!dragPanel) return;
  e.preventDefault();
  const p = getXY(e);
  panel.style.left = (pOL + p.x - pSX) + 'px';
  panel.style.top = (pOT + p.y - pSY) + 'px';
}
function onPanelEnd() { dragPanel = false; }
dragHandle.addEventListener('mousedown', onPanelStart);
dragHandle.addEventListener('touchstart', onPanelStart, { passive: false });
p.document.addEventListener('mousemove', onPanelMove);
p.document.addEventListener('touchmove', onPanelMove, { passive: false });
p.document.addEventListener('mouseup', onPanelEnd);
p.document.addEventListener('touchend', onPanelEnd);

// 异录v1.4 世界书「我是S级求打压」标准条目数
const YL_WB_EXPECTED = 229;
async function checkWorldbookCount() {
  try {
    const wbName = await api_resolveWorldbookName();
    const entries = await api_getWorldbook(wbName);
    if (!Array.isArray(entries)) return;
    const n = entries.length;
    let color, text;
    if (n === YL_WB_EXPECTED) {
      color = '#4ade80'; text = '✓ ' + n + '/' + YL_WB_EXPECTED + ' 条 · 数量正确';
    } else if (n < YL_WB_EXPECTED) {
      color = '#e74c3c'; text = '✗ ' + n + '/' + YL_WB_EXPECTED + ' 条 · 不足(疑似缺失)';
    } else {
      color = '#eab308'; text = '! ' + n + '/' + YL_WB_EXPECTED + ' 条 · 超出';
    }
    statusText.textContent = text;
    statusText.style.color = color;
    if (bubble) bubble.classList.toggle('warn', n !== YL_WB_EXPECTED);
  } catch (e) {}
}

// --- 事件绑定 ---
refreshBtn.addEventListener('click', async () => { checkConfig(); refreshMvuConfigStatus(); await loadBeauty(); renderBeauty(); await loadWorldbookMgr(); renderWb(); showToast('已刷新'); });

manualWbApply.addEventListener('click', () => {
  const name = manualWbSelect.value;
  if (!name) { showToast('请先选择世界书'); return; }
  _ylManualWbName = name;
  if (manualWbLabel) { manualWbLabel.textContent = '当前世界书（手动选择）'; manualWbLabel.style.color = '#4ade80'; }
  if (statusText) { statusText.textContent = name; statusText.style.color = '#4ade80'; }
  if (bubble) bubble.classList.remove('warn');
  showToast('已切换: ' + name);
});

mvuUpdateMode.addEventListener('change', () => {
  mvuExtraPanel.style.display = mvuUpdateMode.value === '额外模型解析' ? '' : 'none';
  refreshModelSourceVisibility();
  onMvuFieldChange();
});
mvuModelSource.addEventListener('change', () => {
  refreshModelSourceVisibility();
  onMvuFieldChange();
});
mvuJailbreak.addEventListener('change', () => {
  const isOther = mvuJailbreak.value === '使用其他预设';
  mvuPresetRow.style.display = isOther ? '' : 'none';
  if (isOther) populatePresets(mvuPresetName.value || '');
  onMvuFieldChange();
});
mvuRespFormat.addEventListener('change', onMvuFieldChange);
mvuPresetName.addEventListener('change', () => {
  onMvuFieldChange();
  if (mvuPresetName.value) syncMvuNativePreset(mvuPresetName.value);
});
mvuRequestMode.addEventListener('change', onMvuFieldChange);
mvuRequestCount.addEventListener('input', onMvuFieldChange);
mvuAutoRequest.addEventListener('change', onMvuFieldChange);
mvuApiUrl.addEventListener('input', onMvuFieldChange);
mvuApiKey.addEventListener('input', onMvuFieldChange);
mvuFetchModelsBtn.addEventListener('click', fetchModels);
mvuModelName.addEventListener('change', onMvuFieldChange);
mvuMaxTokens.addEventListener('input', onMvuFieldChange);
mvuTemperature.addEventListener('input', onMvuFieldChange);
mvuFreqPenalty.addEventListener('input', onMvuFieldChange);
mvuPresPenalty.addEventListener('input', onMvuFieldChange);
mvuTopP.addEventListener('input', onMvuFieldChange);
mvuTopK.addEventListener('input', onMvuFieldChange);
mvuAutoCleanEnable.addEventListener('change', () => {
  mvuCleanPanel.style.display = mvuAutoCleanEnable.checked ? '' : 'none';
  onMvuFieldChange();
});
mvuCleanInterval.addEventListener('input', onMvuFieldChange);
mvuCleanRecent.addEventListener('input', onMvuFieldChange);
mvuCleanTrigger.addEventListener('input', onMvuFieldChange);
mvuAdvToggle.addEventListener('click', () => {
  const open = mvuAdvPanel.style.display !== 'none';
  mvuAdvPanel.style.display = open ? 'none' : '';
  mvuAdvArrow.classList.toggle('open', !open);
});
// 手动配置手风琴
mvuManualToggle.addEventListener('click', () => {
  const open = mvuManualPanel.style.display !== 'none';
  mvuManualPanel.style.display = open ? 'none' : '';
  mvuManualArrow.classList.toggle('open', !open);
});
// 兼容性复选框委托
mvuCompatChecks.addEventListener('change', (e) => {
  if (e.target.classList.contains('yl-mvu-compat-check')) onMvuFieldChange();
});

mvuOptimizeBtn.addEventListener('click', () => {
  const apiUrlEmpty = !mvuApiUrl.value.trim();
  const apiKeyEmpty = !mvuApiKey.value.trim();
  if (apiUrlEmpty || apiKeyEmpty) {
    ylConfirmMsg.textContent = '请配置API连接并选择模型';
    ylConfirmBody.style.display = '';
    ylConfirmBody.innerHTML = `
      <div class="yl-mvu-row">
        <label class="yl-mvu-label wide">API地址</label>
        <input class="yl-mvu-input" id="yl-dlg-api-url" placeholder="https://...">
      </div>
      <div class="yl-mvu-row">
        <label class="yl-mvu-label wide">API密钥</label>
        <input class="yl-mvu-input" id="yl-dlg-api-key" type="password" placeholder="sk-...">
      </div>
      <div class="yl-mvu-row" style="justify-content:flex-end;">
        <button class="yl-btn xs" id="yl-dlg-fetch-models">获取模型</button>
      </div>
      <div class="yl-mvu-row">
        <label class="yl-mvu-label wide">模型名称</label>
        <select class="yl-mvu-select" id="yl-dlg-model-name" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
          <option value="">-- 请先获取模型 --</option>
        </select>
      </div>
    `;
    // 同步当前面板值到弹窗
    setTimeout(() => {
      const dlgUrl = p.document.getElementById('yl-dlg-api-url');
      const dlgKey = p.document.getElementById('yl-dlg-api-key');
      const dlgFetch = p.document.getElementById('yl-dlg-fetch-models');
      if (dlgUrl) dlgUrl.value = mvuApiUrl.value;
      if (dlgKey) dlgKey.value = mvuApiKey.value;
      if (dlgFetch) dlgFetch.addEventListener('click', fetchModelsInDialog);
    }, 0);
    ylConfirmOk.textContent = '已选好，执行配置';
    ylConfirmOk.onclick = () => {
      const dlgUrl = p.document.getElementById('yl-dlg-api-url');
      const dlgKey = p.document.getElementById('yl-dlg-api-key');
      const dlgModel = p.document.getElementById('yl-dlg-model-name');
      if (!dlgUrl || !dlgUrl.value.trim()) { showToast('请填写API地址'); return; }
      if (!dlgModel || !dlgModel.value) { showToast('请获取并选择模型'); return; }
      // Flash检测
      const modelName = (dlgModel.value || '').toLowerCase();
      const isFlash = /flash/.test(modelName) && !/3\.5/.test(modelName);
      if (isFlash && ylConfirmOk.textContent !== '确认使用Flash') {
        ylConfirmMsg.textContent = '检测到Flash系列模型，除3.5 Flash外Flash模型智商不足，建议更换为 gemini-2.5-pro / gemini-3.1-pro / gemini-3.5-flash。是否确认使用？';
        ylConfirmOk.textContent = '确认使用Flash';
        return;
      }
      // 同步回面板（applyOptimalMvuConfig会从表单读取API字段并保存）
      mvuApiUrl.value = dlgUrl.value;
      mvuApiKey.value = dlgKey ? dlgKey.value : '';
      if (dlgModel.options.length > 1) {
        mvuModelName.innerHTML = [...dlgModel.options].map(o => '<option value="' + o.value + '">' + o.textContent + '</option>').join('');
      }
      mvuModelName.value = dlgModel.value;
      ylConfirmOverlay.style.display = 'none';
      ylConfirmBody.style.display = 'none';
      ylConfirmOk.textContent = '确认';
      applyOptimalMvuConfig();
    };
    ylConfirmOverlay.style.display = 'flex';
  } else {
    applyOptimalMvuConfig();
  }
});

// 从表单应用配置（完全模仿 applyOptimalMvuConfig 的模式：改cfg → save → sync → reload）
async function applyMvuConfigFromForm() {
  try {
    const cfg = getMvuCfg();
    if (!cfg) { showToast('mvu_settings 不存在，请确认已安装MVU变量框架'); return; }

    cfg.通知 = cfg.通知 || {};
    cfg.通知['MVU框架加载成功'] = true;
    cfg.通知['变量初始化成功'] = true;
    cfg.通知['变量更新出错'] = true;
    cfg.通知['额外模型解析中'] = true;

    cfg.更新方式 = mvuUpdateMode.value;

    cfg.额外模型解析配置 = cfg.额外模型解析配置 || {};
    const em = cfg.额外模型解析配置;
    em.模型来源 = mvuModelSource.value;
    em.破限方案 = mvuJailbreak.value;
    if (mvuJailbreak.value === '使用其他预设' && mvuPresetName) {
      em.预设名称 = mvuPresetName.value;
    } else {
      delete em.预设名称;
    }
    em.应答格式 = mvuRespFormat.value;
    em.兼容假流式 = /假流/i.test(mvuModelName.value);
    em.请求方式 = mvuRequestMode.value;
    em.请求次数 = parseInt(mvuRequestCount.value) || 1;
    em.启用自动请求 = mvuAutoRequest.checked;
    em.api地址 = mvuApiUrl.value;
    em.密钥 = mvuApiKey.value;
    em.模型名称 = mvuModelName.value;
    em.最大回复token数 = parseInt(mvuMaxTokens.value) || 65535;
    em.温度 = parseFloat(mvuTemperature.value) || 1;
    em.频率惩罚 = parseFloat(mvuFreqPenalty.value) || 0;
    em.存在惩罚 = parseFloat(mvuPresPenalty.value) || 0;
    em.top_p = parseFloat(mvuTopP.value) || 1;
    em.top_k = parseInt(mvuTopK.value) || 0;

    cfg.自动清理变量 = cfg.自动清理变量 || {};
    const ac = cfg.自动清理变量;
    ac.启用 = mvuAutoCleanEnable.checked;
    ac.快照保留间隔 = parseInt(mvuCleanInterval.value) || 50;
    ac.要保留变量的最近楼层数 = parseInt(mvuCleanRecent.value) || 20;
    ac.触发恢复变量的最近楼层数 = parseInt(mvuCleanTrigger.value) || 10;

    cfg.兼容性 = cfg.兼容性 || {};
    const checks = mvuCompatChecks.querySelectorAll('.yl-mvu-compat-check');
    checks.forEach(cb => { cfg.兼容性[cb.dataset.key] = cb.checked; });
    clearTimeout(_mvuSaveTimer);
    ewcBackupToEwcYH();

    await saveSettings();

    await ewcSyncMvuDom().catch(() => {});
    if (em.破限方案 === '使用其他预设' && em.预设名称) {
      await syncMvuNativePreset(em.预设名称);
    }

    syncMvuToForm(cfg);
    mvuStatus.textContent = '配置已保存，即将刷新…';

    showToast('配置已应用，1秒后刷新页面…');
    setTimeout(() => { window.parent.location.reload(); }, 1000);
  } catch (e) {
    showToast('MVU配置失败: ' + e.message);
  }
}

mvuApplyBtn.addEventListener('click', async () => {
  const modelName = (mvuModelName.value || '').toLowerCase();
  const isFlash = /flash/.test(modelName) && !/3\.5/.test(modelName);

  if (isFlash) {
    ylConfirmMsg.textContent = '检测到Flash系列模型，除3.5 Flash外Flash模型智商不足，建议更换。是否确认应用？';
    ylConfirmOk.onclick = async () => {
      ylConfirmOverlay.style.display = 'none';
      await applyMvuConfigFromForm();
    };
    ylConfirmOverlay.style.display = 'flex';
    return;
  }

  await applyMvuConfigFromForm();
});

ylConfirmCancel.addEventListener('click', (e) => {
  e.stopPropagation();
  ylConfirmOverlay.style.display = 'none';
  ylConfirmBody.style.display = 'none';
  ylConfirmOk.textContent = '确认';
});

// 弹窗移动端拖拽（电脑端固定居中）
const ylConfirmDragHandle = p.document.getElementById('yl-confirm-drag');
const ylConfirmDialog = p.document.getElementById('yl-confirm-dialog');
let _ylDlgTouchReady = false;
function _ylDlgInitTouch() {
  if (_ylDlgTouchReady) return; _ylDlgTouchReady = true;
  if (ylConfirmDragHandle) ylConfirmDragHandle.style.display = '';
  if (ylConfirmDialog) {
    const rect = ylConfirmDialog.getBoundingClientRect();
    ylConfirmDialog.style.position = 'absolute';
    ylConfirmDialog.style.transform = 'none';
    ylConfirmDialog.style.left = rect.left + 'px';
    ylConfirmDialog.style.top = rect.top + 'px';
    ylConfirmDialog.style.maxWidth = '380px';
  }
}
if (ylConfirmDragHandle && ylConfirmDialog) {
  let dlgDrag = false, dlgSX, dlgSY, dlgLeft, dlgTop;
  // 覆盖层点击关闭
  ylConfirmOverlay.addEventListener('click', (e) => {
    if (e.target === ylConfirmOverlay) {
      ylConfirmOverlay.style.display = 'none';
      ylConfirmBody.style.display = 'none';
      ylConfirmOk.textContent = '确认';
    }
  });
  ylConfirmDragHandle.addEventListener('touchstart', (e) => {
    if (!ylConfirmDialog || !e.touches.length) return;
    _ylDlgInitTouch();
    dlgDrag = true; dlgSX = e.touches[0].clientX; dlgSY = e.touches[0].clientY;
    dlgLeft = ylConfirmDialog.offsetLeft; dlgTop = ylConfirmDialog.offsetTop;
  }, { passive: false });
  p.document.addEventListener('touchmove', (e) => {
    if (!dlgDrag || !ylConfirmDialog || !e.touches.length) return;
    ylConfirmDialog.style.left = (dlgLeft + e.touches[0].clientX - dlgSX) + 'px';
    ylConfirmDialog.style.top = (dlgTop + e.touches[0].clientY - dlgSY) + 'px';
  }, { passive: false });
  p.document.addEventListener('touchend', () => { dlgDrag = false; });
}

// --- 初始化 ---
// 1. 注入fetch劫持（拦截黑名单模型的聊天补全请求）
ewcInjectFetchHook();

// 2. 从 _ewcYH 恢复被MVU初始化抹掉的值
ewcRestoreFromEwcYH();

// 3. 触发MVU DOM事件，同步内部缓存
ewcSyncMvuDom().catch(() => {});

// 4. 恢复预设名称并同步到MVU原生「目标预设」
(function restorePreset() {
  const bu = ewcGetEwcYH();
  const cfg = getMvuCfg();
  const em = cfg && cfg.额外模型解析配置;
  if (bu.预设名称 && em && em.破限方案 === '使用其他预设') {
    em.预设名称 = bu.预设名称;
    syncMvuNativePreset(bu.预设名称);
  }
})();

_ylPopulateWbSelect();
checkConfig();
// 每5秒自动检测一次配置（模型切换后呼吸灯自动跟上，无需打开面板）
p._ylCheckInterval = setInterval(() => { checkConfig(); updateBackendCode(); }, 5000);

refreshMvuConfigStatus();
loadBeauty().then(renderBeauty).catch(() => {});
loadWorldbookMgr().then(renderWb).catch(() => {});

// ── 卸载清理：监听 iframe 自身的卸载事件（pagehide），回滚对父页面的一切修改 ──
// 解决：消息 iframe 被移除/重新生成时，父页面的 fetch 劫持、悬浮窗、监听器与 _ylLoaded 标志泄漏，
// 导致助手不再加载或持续拦截请求。此处在 iframe 卸载时统一还原。
function ylDoCleanup() {
  // 1. 还原父页面 fetch（最关键：否则卸载后仍在拦截聊天请求）
  try { if (p._ylOrigFetch) { p.fetch = p._ylOrigFetch; } } catch (e) {}
  // 2. 清除自动检测定时器
  try { if (p._ylCheckInterval) { clearInterval(p._ylCheckInterval); p._ylCheckInterval = null; } } catch (e) {}
  // 3. 移除挂到父页面 document 上的拖拽监听（命名函数，可精确移除）
  try {
    p.document.removeEventListener('mousemove', onBubbleMove);
    p.document.removeEventListener('touchmove', onBubbleMove, { passive: false });
    p.document.removeEventListener('mouseup', onBubbleEnd);
    p.document.removeEventListener('touchend', onBubbleEnd);
    p.document.removeEventListener('mousemove', onPanelMove);
    p.document.removeEventListener('touchmove', onPanelMove, { passive: false });
    p.document.removeEventListener('mouseup', onPanelEnd);
    p.document.removeEventListener('touchend', onPanelEnd);
  } catch (e) {}
  // 4. 移除注入到父页面的 DOM（悬浮窗/面板 + 三段样式）
  try {
    ['yl-bubble', 'yl-panel'].forEach(function (id) { var el = p.document.getElementById(id); if (el && el.parentNode) el.parentNode.removeChild(el); });
    [CSS, YL_NAV_CSS, MVU_CSS].forEach(function (st) { try { if (st && st.parentNode) st.parentNode.removeChild(st); } catch (e) {} });
  } catch (e) {}
  // 5. 重置加载标志，允许下一个 iframe 重新初始化助手
  try {
    p._ylFetchHooked = false;
    delete p._ylOrigFetch;
    p._ylLoaded = false;
    delete p._ylCleanup;
  } catch (e) {}
}
p._ylCleanup = ylDoCleanup;                        // 供重载时的旧清理逻辑（见文件顶部）调用，保持一致
window.addEventListener('pagehide', ylDoCleanup);  // iframe 自身卸载时触发（消息被删除/重生成）
window.addEventListener('beforeunload', ylDoCleanup); // 兜底：部分环境 pagehide 不可靠时同样清理

  // ═══════════════════════════════════════════════════════════════
  // 剧情引擎：10 条长线剧情自动同步（独立容错，绝不影响其它功能）
  // 读取 stat_data.剧情线.<键> 的阶段值；stage>=1 → 启用对应正剧条目；
  // stage=0/不存在 → 禁用。与剧情条目内的 EJS 形成双保险。
  // ═══════════════════════════════════════════════════════════════
  try {
    // 剧情键 → 正剧条目 id（与角色卡内 id 一致）
    const YL_PLOT_MAP = {
      '兽潮危机': 700020, '旧时代真相': 700021, '魔女低语': 700022,
      '听风之眼': 700023, '秘境契约': 700024, '校园情缘': 700025,
      '社团物语': 700026, '学园祭典': 700027, '室友奇谈': 700028, '暗恋心声': 700029
    };
    let _ylPlotById = null;
    let _ylPlotTimer = null;
    let _ylPlotBusy = false;
    let _ylPlotStages = {};

    // 读取 stat_data.剧情线（多路兜底，失败返回 {}）
    async function ylGetPlotStages() {
      try {
        const sd = await runInParent(`(async () => {
          try {
            var ctx = SillyTavern.getContext();
            var sd = null;
            try { sd = ctx.stat_data || (ctx.chatVariables && ctx.chatVariables.stat_data); } catch (e) {}
            if (!sd && ctx.chat) {
              for (var i = ctx.chat.length - 1; i >= 0; i--) {
                var m = ctx.chat[i];
                if (m && m.variables && m.variables.stat_data) { sd = m.variables.stat_data; break; }
              }
            }
            if (!sd && ctx.chat_metadata && ctx.chat_metadata.variables) {
              try { sd = ctx.chat_metadata.variables.stat_data; } catch (e) {}
            }
            return sd ? JSON.parse(JSON.stringify(sd['剧情线'] || {})) : {};
          } catch (e) { return {}; }
        })()`);
        return sd || {};
      } catch (e) { return {}; }
    }

    // 同步：按 stage 开关正剧条目（仅变化时才写世界书）
    async function ylSyncPlots(silent) {
      if (_ylPlotBusy) return { ok: false, reason: 'busy' };
      _ylPlotBusy = true;
      try {
        const wbName = await api_resolveWorldbookName();
        if (!_ylPlotById) {
          const entries = await api_getWorldbook(wbName);
          _ylPlotById = {};
          (entries || []).forEach(function (e) { _ylPlotById[String(e.uid)] = e; });
        }
        const stages = await ylGetPlotStages();
        _ylPlotStages = stages || {};
        const patch = {};
        Object.keys(YL_PLOT_MAP).forEach(function (key) {
          const uid = YL_PLOT_MAP[key];
          const stage = Number(stages[key]) || 0;
          const want = stage >= 1;
          const cur = _ylPlotById[String(uid)];
          if (cur && !!cur.enabled !== want) patch[String(uid)] = want;
        });
        const changed = Object.keys(patch).length;
        if (changed > 0) {
          const pj = JSON.stringify(patch);
          await api_replaceWorldbook(wbName, 'function(es){ var p=' + pj + '; es.forEach(function(e){ if(p[String(e.uid)]!==undefined) e.enabled=p[String(e.uid)]; }); }');
          Object.keys(patch).forEach(function (u) { if (_ylPlotById[u]) _ylPlotById[u].enabled = patch[u]; });
        }
        const lines = Object.keys(YL_PLOT_MAP).map(function (key) {
          const uid = YL_PLOT_MAP[key];
          const stage = Number(stages[key]) || 0;
          const en = _ylPlotById[String(uid)] && _ylPlotById[String(uid)].enabled;
          return '· ' + key + '：阶段' + stage + (stage > 0 ? (en ? '（正剧已开启）' : '（待开启）') : '（未触发）');
        });
        if (!silent) showToast('剧情同步完成，变更 ' + changed + ' 条');
        return { ok: true, changed: changed, lines: lines };
      } catch (e) {
        if (!silent) showToast('剧情同步失败：' + (e.message || e));
        return { ok: false, reason: e.message || String(e) };
      } finally {
        _ylPlotBusy = false;
      }
    }

    // 渲染 10 条剧情列表（含阶段 + 手动开关）到剧情 tab
    function ylRenderPlots() {
      const box = p.document.getElementById('yl-plot-list');
      if (!box) return;
      if (!_ylPlotById) { box.innerHTML = '<div style="font-size:11px;color:#5f7e96;text-align:center;padding:10px;">正在加载剧情条目…</div>'; return; }
      box.innerHTML = Object.keys(YL_PLOT_MAP).map(function (key) {
        const uid = YL_PLOT_MAP[key];
        const stage = Number(_ylPlotStages[key]) || 0;
        const entry = _ylPlotById[String(uid)];
        const en = !!(entry && entry.enabled);
        const stageTxt = stage > 0 ? ('阶段' + stage) : '未触发';
        const sub = stage > 0 ? (en ? ' · 正剧已开启' : ' · 正剧待开启') : ' · 仅伏笔';
        return '<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;margin-bottom:6px;border-radius:8px;background:rgba(7,10,22,.4);border:1px solid ' + (en ? 'rgba(34,211,238,.4)' : 'rgba(99,179,237,.12)') + ';">'
          + '<div style="flex:1;min-width:0;">'
          + '<div style="font-size:12px;color:#eaf6ff;font-weight:bold;word-break:break-all;">' + key + '</div>'
          + '<div style="font-size:10px;color:' + (stage > 0 ? '#22d3ee' : '#5f7e96') + ';margin-top:2px;">' + stageTxt + sub + '</div>'
          + '</div>'
          + '<button data-plot-toggle="' + uid + '" style="padding:5px 12px;border-radius:6px;border:1px solid ' + (en ? 'rgba(168,85,247,.5)' : 'rgba(34,211,238,.5)') + ';background:' + (en ? 'rgba(168,85,247,.18)' : 'rgba(34,211,238,.18)') + ';color:#eaf6ff;cursor:pointer;font-size:11px;font-family:inherit;flex:none;">' + (en ? '关闭' : '开启') + '</button>'
          + '</div>';
      }).join('');
    }
    // 手动开关（事件委托；幂等）
    function ylBindPlotToggle() {
      const box = p.document.getElementById('yl-plot-list');
      if (box && !box._ylToggleBound) {
        box._ylToggleBound = true;
        box.addEventListener('click', async function (ev) {
          const b = ev.target.closest('[data-plot-toggle]');
          if (!b) return;
          const uid = Number(b.dataset.plotToggle);
          const entry = _ylPlotById && _ylPlotById[String(uid)];
          if (!entry) return;
          const next = !entry.enabled;
          b.textContent = '…';
          try {
            const wbName = await api_resolveWorldbookName();
            const patch = {}; patch[String(uid)] = next;
            const pj = JSON.stringify(patch);
            await api_replaceWorldbook(wbName, 'function(es){ var p=' + pj + '; es.forEach(function(e){ if(p[String(e.uid)]!==undefined) e.enabled=p[String(e.uid)]; }); }');
            entry.enabled = next;
            ylRenderPlots();
            showToast('正剧条目 #' + uid + (next ? ' 已手动开启' : ' 已手动关闭'));
          } catch (e) {
            b.textContent = next ? '开启' : '关闭';
            showToast('操作失败：' + (e.message || e));
          }
        });
      }
    }
    // 绑定剧情 tab 的同步按钮（面板就绪后；幂等）
    function ylBindSyncBtn() {
      const btn = p.document.getElementById('yl-plot-sync');
      if (btn && !btn._ylBound) {
        btn._ylBound = true;
        btn.addEventListener('click', async function () {
          btn.textContent = '同步中…';
          const r = await ylSyncPlots(false);
          btn.textContent = '🔄 立即同步剧情状态';
          if (r && r.ok) ylRenderPlots();
          else if (r) showToast('同步失败：' + r.reason);
        });
      }
    }
    // 一拍：绑定按钮/开关 + 同步 + 刷新列表
    function ylTick(silent) {
      try {
        ylBindSyncBtn();
        ylBindPlotToggle();
        ylSyncPlots(silent).then(function (r) { if (r && r.ok) ylRenderPlots(); });
      } catch (e) {}
    }
    _ylPlotTimer = setInterval(function () { ylTick(true); }, 25000);

    p._ylPlotCleanup = function () {
      try { if (_ylPlotTimer) clearInterval(_ylPlotTimer); _ylPlotTimer = null; } catch (e) {}
      try { delete p._ylPlotCleanup; } catch (e) {}
    };
    window.addEventListener('pagehide', function () { try { if (p._ylPlotCleanup) p._ylPlotCleanup(); } catch (e) {} });

    setTimeout(function () { ylTick(true); }, 3000);
    console.log('[异录] 剧情引擎已加载，监控 10 条长线剧情。');
  } catch (e) {
    try { console.warn('[异录] 剧情引擎初始化失败:', e); } catch (_e) {}
  }

} // end if (!p._ylLoaded)
