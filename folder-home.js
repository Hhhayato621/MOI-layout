import { selectCharacterById, setActiveCharacter } from '../../../../script.js';

const ctx = () => SillyTavern.getContext();
let home;
let grid;
let counter;
let query = '';
let selectedAvatar = '';
let requestId = 0;
let busy = false;
let characterSignature = '';

function node(tag, className, text) {
    const value = document.createElement(tag);
    value.className = className;
    if (text) value.textContent = text;
    return value;
}

function action(text, className, handler) {
    const value = node('button', className, text);
    value.type = 'button';
    value.addEventListener('click', handler);
    return value;
}

function characterImage(character, className) {
    const image = node('img', className);
    image.src = ctx().getThumbnailUrl('avatar', character.avatar);
    image.alt = '';
    image.loading = 'lazy';
    image.decoding = 'async';
    return image;
}

async function enterCharacter(character, file) {
    if (busy) return;
    busy = true;
    home?.classList.add('ah-folders-busy');
    try {
        const id = ctx().characters.findIndex(item => item.avatar === character.avatar);
        if (id < 0) throw new Error('Character no longer exists');
        await selectCharacterById(id, { switchMenu: false });
        setActiveCharacter(character.avatar);
        if (file && ctx().getCurrentChatId() !== file) await ctx().openCharacterChat(file);
        ctx().saveSettingsDebounced();
    } catch (error) {
        console.error('After Hours folder chat', error);
        toastr.error('无法打开这份档案，请稍后重试');
    } finally {
        busy = false;
        home?.classList.remove('ah-folders-busy');
    }
}

function archiveRow(character, archive, index) {
    const file = (archive.file_id || archive.file_name).replace(/\.jsonl$/i, '');
    const row = action('', 'ah-archive', () => enterCharacter(character, file));
    row.append(node('span', 'ah-archive-index', String(index + 1).padStart(2, '0')));
    const copy = node('span', 'ah-archive-copy');
    copy.append(node('strong', '', file));
    const messages = archive.chat_items ?? archive.message_count;
    const details = [archive.file_size, messages != null ? messages + ' 条消息' : ''].filter(Boolean);
    copy.append(node('small', '', details.join(' · ')));
    row.title = file;
    row.append(copy, node('span', 'ah-archive-arrow', '↗'));
    return row;
}

async function expandFolder(character, card, trigger) {
    const wasOpen = selectedAvatar === character.avatar;
    selectedAvatar = wasOpen ? '' : character.avatar;
    const revision = ++requestId;
    home.querySelector('.ah-archive-panel')?.remove();
    for (const other of grid.querySelectorAll('.ah-folder')) {
        other.classList.remove('is-open');
        other.querySelector('.ah-folder-trigger').setAttribute('aria-expanded', 'false');
    }
    if (wasOpen) return;
    card.classList.add('is-open');
    trigger.setAttribute('aria-expanded', 'true');
    const panel = node('section', 'ah-archive-panel');
    panel.id = 'ah-folder-archives';
    panel.setAttribute('aria-label', character.name + '的聊天档案');
    const heading = node('div', 'ah-archive-heading');
    const title = node('div', '');
    title.append(node('small', 'ah-eyebrow', 'INSIDE THE FOLDER'), node('h3', '', character.name));
    const close = action('×', 'ah-archive-close', () => {
        selectedAvatar = '';
        ++requestId;
        panel.remove();
        card.classList.remove('is-open');
        trigger.setAttribute('aria-expanded', 'false');
        trigger.focus();
    });
    close.setAttribute('aria-label', '收起角色档案');
    heading.append(title, close);
    const content = node('div', 'ah-archive-list');
    content.setAttribute('aria-live', 'polite');
    content.append(node('p', 'ah-folder-status', '正在翻阅档案…'));
    panel.append(heading, content);
    const columns = getComputedStyle(grid).gridTemplateColumns.split(' ').length;
    const cards = Array.from(grid.querySelectorAll('.ah-folder'));
    const rowEnd = Math.min(cards.length - 1, Math.ceil((cards.indexOf(card) + 1) / columns) * columns - 1);
    cards[rowEnd].after(panel);
    try {
        const response = await fetch('/api/characters/chats', {
            method: 'POST',
            headers: ctx().getRequestHeaders(),
            body: JSON.stringify({ avatar_url: character.avatar }),
        });
        if (!response.ok) throw new Error(String(response.status));
        const data = await response.json();
        if (revision !== requestId || !panel.isConnected) return;
        const archives = data?.error ? [] : Object.values(data).filter(item => item.file_name);
        archives.sort((a, b) => String(b.file_name).localeCompare(String(a.file_name)));
        if (!archives.length) {
            content.replaceChildren(node('p', 'ah-folder-status', '还没有聊天档案。'),
                action('打开角色，开始对话 ↗', 'ah-start-character', () => enterCharacter(character)));
        } else {
            content.replaceChildren(...archives.map((archive, index) => archiveRow(character, archive, index)));
        }
        card.querySelector('.ah-folder-subtitle').textContent = archives.length + ' 份聊天档案';
    } catch (error) {
        if (revision !== requestId || !panel.isConnected) return;
        content.replaceChildren(node('p', 'ah-folder-status', '暂时无法读取档案。'),
            action('重新读取', 'ah-start-character', () => {
                selectedAvatar = '';
                void expandFolder(character, card, trigger);
            }));
        console.warn('After Hours folder archives', error);
    }
}

function renderFolders() {
    selectedAvatar = '';
    ++requestId;
    const characters = ctx().characters.filter(item => item.avatar && item.avatar !== 'none');
    const filtered = characters.filter(item => item.name.toLocaleLowerCase().includes(query));
    const cards = filtered.map((character, index) => {
        const card = node('article', 'ah-folder');
        card.style.setProperty('--folder-hue', String([260, 335, 215, 35][index % 4]));
        const trigger = action('', 'ah-folder-trigger', () => expandFolder(character, card, trigger));
        trigger.setAttribute('aria-label', '打开' + character.name + '的文件夹');
        trigger.setAttribute('aria-expanded', 'false');
        trigger.setAttribute('aria-controls', 'ah-folder-archives');
        const visual = node('span', 'ah-folder-visual');
        visual.setAttribute('aria-hidden', 'true');
        visual.append(node('span', 'ah-folder-back'));
        for (let i = 0; i < 3; i++) {
            const photo = node('span', 'ah-folder-photo');
            photo.style.setProperty('--photo-index', String(i));
            photo.append(characterImage(character, ''));
            visual.append(photo);
        }
        const cover = node('span', 'ah-folder-cover');
        cover.append(node('span', 'ah-folder-label', 'MOI'), node('span', 'ah-folder-plus', '+'));
        visual.append(cover);
        const caption = node('span', 'ah-folder-caption');
        caption.append(node('strong', 'ah-folder-name', character.name),
            node('small', 'ah-folder-subtitle', '轻点翻开 · 聊天档案'));
        trigger.append(visual, caption);
        card.append(trigger);
        return card;
    });
    grid.replaceChildren(...(cards.length ? cards : [node('p', 'ah-folder-status', '没有找到这个角色')]));
    counter.textContent = '点击文件夹翻阅';
}

function createHome(chat) {
    home = node('section', 'ah-folder-home');
    home.setAttribute('aria-label', '角色文件夹首页');
    const top = node('div', 'ah-folder-home-heading');
    const title = node('div', '');
    title.append(node('span', 'ah-eyebrow', 'NO. 001 — PERSONAL ARCHIVE'), node('h2', '', 'Off the Record'));
    counter = node('p', 'ah-folder-count');
    title.append(counter);
    const search = node('input', 'ah-folder-search');
    search.type = 'search';
    search.placeholder = 'searching...';
    search.setAttribute('aria-label', '搜索角色文件夹');
    search.addEventListener('input', () => {
        query = search.value.trim().toLocaleLowerCase();
        renderFolders();
    });
    top.append(title, search);
    grid = node('div', 'ah-folder-grid');
    home.append(top, grid);
    chat.prepend(home);
    renderFolders();
}

function syncHome() {
    const chat = document.querySelector('#chat');
    if (!chat) return;
    const enabled = getComputedStyle(document.documentElement).getPropertyValue('--ah-theme').trim() === 'enabled';
    const isHome = enabled && !!chat.querySelector('.welcomePanel');
    document.documentElement.classList.toggle('ah-folder-home-visible', isHome);
    if (!isHome) return;
    const signature = ctx().characters.map(item => item.avatar + ':' + item.name).join('|');
    if (!home?.isConnected) {
        query = '';
        createHome(chat);
        characterSignature = signature;
    } else if (signature !== characterSignature) {
        renderFolders();
        characterSignature = signature;
    }
}

export function installFolderHome() {
    const chat = document.querySelector('#chat');
    if (!chat) return;
    new MutationObserver(syncHome).observe(chat, { childList: true });
    new MutationObserver(syncHome).observe(document.querySelector('#custom-style') || document.head,
        { childList: true, characterData: true, subtree: true });
    const { eventSource, eventTypes } = ctx();
    for (const key of ['APP_READY', 'CHAT_CHANGED', 'CHARACTER_EDITED']) eventSource.on(eventTypes[key], syncHome);
    syncHome();
}
