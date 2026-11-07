const root = document.documentElement;
const formats = '.ttf,.otf,.woff,.woff2';
const scopes = {
    interface: { label: '全界面', defaultMode: 'original', family: 'MOI Custom Interface' },
    chat: { label: '仅角色聊天', defaultMode: 'inherit', family: 'MOI Custom Chat' },
};
const modes = {
    inherit: '沿用全界面',
    original: 'MOI 手写体',
    clean: '清爽黑体 · 系统字体',
    custom: '自定义字体',
};

let database;
let initialization;
let dialog;
const settings = {};
const faces = {};

async function store(key, value) {
    const write = value !== undefined;
    const db = await (database ||= new Promise((resolve, reject) => {
        const request = indexedDB.open('moi-local-font', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('fonts');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    }).catch(error => {
        database = undefined;
        throw error;
    }));
    return new Promise((resolve, reject) => {
        const tx = db.transaction('fonts', write ? 'readwrite' : 'readonly');
        const fonts = tx.objectStore('fonts');
        const request = write ? fonts.put(value, key) : fonts.get(key);
        tx.oncomplete = () => resolve(request.result);
        tx.onabort = () => reject(tx.error);
    });
}

function normalizeUrl(input) {
    let url;
    try { url = new URL(input); } catch { /* Report all invalid links below. */ }
    if (!url || url.username || url.password || !(url.protocol === 'https:' ||
        (url.protocol === 'http:' && url.origin === location.origin))) {
        throw new Error('请填写 HTTPS 字体直链，或酒馆同站点的字体地址。');
    }
    return url.href;
}

async function loadFace(family, source) {
    if (!source) throw new Error('请选择字体文件，或填写字体直链。');
    const data = source.file
        ? await source.file.arrayBuffer()
        : 'url(' + JSON.stringify(normalizeUrl(source.url)) + ')';
    let timer;
    try {
        const face = new FontFace(family, data, { weight: '400', style: 'normal' });
        return await Promise.race([
            face.load(),
            new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error('字体加载超时。')), 12000);
            }),
        ]);
    } catch {
        throw new Error(source.file
            ? '无法读取字体。请检查文件，或换用 TTF、OTF、WOFF、WOFF2 格式。'
            : '无法加载链接。请确认它直达字体文件，且来源允许跨站加载。');
    } finally {
        clearTimeout(timer);
    }
}

function apply(scope, config, face) {
    if (faces[scope]) document.fonts.delete(faces[scope]);
    if (face) document.fonts.add(face);
    faces[scope] = face;
    root.dataset[scope === 'chat' ? 'moiChatFont' : 'moiInterfaceFont'] = config.mode;
}

export function initializeFonts() {
    return initialization ||= (async () => {
        // Preserve the font installed through earlier MOI releases.
        void store('custom').then(async file => {
            if (file instanceof Blob) document.fonts.add(await loadFace('MOI Smile', { file }));
        }).catch(() => {});
        await Promise.all(Object.entries(scopes).map(async ([scope, spec]) => {
            const config = await store('settings:' + scope).catch(() => null);
            if (!config || !Object.hasOwn(modes, config.mode) || (scope === 'interface' && config.mode === 'inherit')) return;
            settings[scope] = config;
            if (config.mode !== 'custom') {
                apply(scope, config);
                return;
            }
            void loadFace(spec.family, config.source).then(face => {
                if (settings[scope] === config) apply(scope, config, face);
            }).catch(() => {
                // Keep the fallback visible if a previously saved URL is unavailable.
            });
        }));
    })();
}

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
}

function labeled(text, field) {
    const label = el('label', 'moi-font-field');
    label.append(el('span', '', text), field);
    return label;
}

function option(value, label) {
    const node = el('option', '', label);
    node.value = value;
    return node;
}

function buildDialog() {
    const box = el('dialog', 'moi-font-dialog');
    box.id = 'moi-font-settings';
    box.setAttribute('aria-labelledby', 'moi-font-heading');
    const form = el('form');
    form.noValidate = true;
    const title = el('h2', '', '字体设置');
    title.id = 'moi-font-heading';
    const close = el('button', 'moi-font-close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', '关闭字体设置');
    close.addEventListener('click', () => box.close());
    const header = el('div', 'moi-font-dialog-header');
    header.append(title, close);

    const scope = el('select');
    scope.append(...Object.entries(scopes).map(([value, spec]) => option(value, spec.label)));
    const mode = el('select');
    const hint = el('p', 'moi-font-hint');
    const sample = el('p', 'moi-font-preview', '早安，午安，晚安');
    const sourceFields = el('div', 'moi-font-source');
    const file = el('input');
    file.type = 'file';
    file.accept = formats;
    const url = el('input');
    url.type = 'url';
    url.placeholder = 'https://…';
    url.inputMode = 'url';
    url.autocapitalize = 'off';
    url.spellcheck = false;
    const stored = el('p', 'moi-font-hint');
    const formatsHint = el('p', 'moi-font-hint', '支持 TTF、OTF、WOFF、WOFF2。文件仅存于当前设备。');
    sourceFields.append(labeled('选择字体文件', file), labeled('或粘贴字体直链', url), stored, formatsHint);
    const status = el('p', 'moi-font-status');
    status.setAttribute('role', 'status');
    const save = el('button', 'moi-font-save', '应用');
    save.type = 'submit';

    function updateMode() {
        sourceFields.hidden = mode.value !== 'custom';
        const inherited = root.dataset.moiInterfaceFont || 'original';
        const preview = mode.value === 'inherit' ? inherited : mode.value;
        sample.dataset.preview = preview === 'custom'
            ? (mode.value === 'inherit' || scope.value === 'interface' ? 'interface' : 'chat')
            : preview;
        status.textContent = '';
    }
    function updateScope() {
        const spec = scopes[scope.value];
        const config = settings[scope.value];
        mode.replaceChildren(...Object.entries(modes)
            .filter(([value]) => scope.value === 'chat' || value !== 'inherit')
            .map(([value, label]) => option(value, label)));
        mode.value = config?.mode || spec.defaultMode;
        hint.textContent = scope.value === 'chat'
            ? '只改变单人角色聊天的正文、标题、证件牌和输入栏。'
            : '适用于首页、菜单和聊天。单独设置过的角色聊天字体优先。';
        file.value = '';
        url.value = config?.source?.url || '';
        stored.textContent = config?.source?.file ? '已保存：' + (config.source.file.name || '本机字体') : '';
        stored.hidden = !stored.textContent;
        updateMode();
    }
    scope.addEventListener('change', updateScope);
    mode.addEventListener('change', updateMode);
    file.addEventListener('change', () => { if (file.files?.length) url.value = ''; });
    url.addEventListener('input', () => { if (url.value.trim()) file.value = ''; });
    const fields = [scope, mode, file, url, save, close];
    box.addEventListener('cancel', event => { if (save.disabled) event.preventDefault(); });
    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (save.disabled) return;
        const key = scope.value;
        const config = { mode: mode.value, source: settings[key]?.source };
        let face;
        for (const field of fields) field.disabled = true;
        status.textContent = '正在应用…';
        try {
            if (config.mode === 'custom') {
                const selected = file.files?.[0];
                const link = url.value.trim();
                if (selected) config.source = { file: selected };
                else if (link) config.source = { url: normalizeUrl(link) };
                face = await loadFace(scopes[key].family, config.source);
            }
            try { await store('settings:' + key, config); }
            catch { throw new Error('当前设备未能保存设置，请检查浏览器存储。'); }
            settings[key] = config;
            apply(key, config, face);
            box.close();
        } catch (error) {
            status.textContent = error.message || '字体未能应用。';
        } finally {
            for (const field of fields) field.disabled = false;
        }
    });
    form.append(header, labeled('应用范围', scope), hint, labeled('选择字体', mode), sample, sourceFields, status, save);
    box.append(form);
    document.body.append(box);
    return { box, updateScope };
}

export async function openFontSettings() {
    await initializeFonts();
    dialog ??= buildDialog();
    if (!dialog.box.open) {
        dialog.updateScope();
        dialog.box.showModal();
    }
}
