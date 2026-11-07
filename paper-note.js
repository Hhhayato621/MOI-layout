import { archiveTime, characterArchives, conversationMessages, newestFirst } from './archive-data.js';
import { recentThree, notePrompt, fitNote } from './paper-note-core.js';
const context = () => SillyTavern.getContext();
let widget;
let body;
let signature;
let caption;
let status;
let opener;
let expanded = false;
let generation;
const notes = new Map();

function make(tag, className, text) {
    const element = document.createElement(tag);
    element.className = className;
    if (text) element.textContent = text;
    return element;
}

function control(text, className, callback) {
    const button = make('button', className, text);
    button.type = 'button';
    button.addEventListener('click', callback);
    return button;
}

function revealPaper() {
    if (!matchMedia('(max-width: 1119px)').matches) return;
    requestAnimationFrame(() => {
        const dock = widget.closest('#moi-widget-dock');
        if (!expanded || !dock?.clientHeight) return;

        const visibleTop = dock.getBoundingClientRect().top + dock.clientTop + 12;
        const visibleBottom = visibleTop + dock.clientHeight - 24;
        const note = widget.getBoundingClientRect();
        // If the note is taller than the tray, reveal its start and let the tray scroll.
        if (note.height > visibleBottom - visibleTop || note.top < visibleTop) {
            dock.scrollTop += note.top - visibleTop;
        } else if (note.bottom > visibleBottom) {
            dock.scrollTop += note.bottom - visibleBottom;
        }
    });
}

function mount() {
    widget = make('section', 'moi-note-widget');
    widget.setAttribute('aria-label', '角色纸条留言');
    const stage = make('div', 'moi-note-stage');
    opener = control('', 'moi-note-ball', () => {
        expanded = true;
        widget.classList.add('is-unfolded');
        opener.setAttribute('aria-expanded', 'true');
        revealPaper();
        void prepareNote();
    });
    opener.setAttribute('aria-label', '展开角色的纸团留言');
    opener.setAttribute('aria-expanded', 'false');
    opener.setAttribute('aria-controls', 'moi-note-letter');
    const ball = make('img', '');
    ball.src = new URL('./paper-ball.png', import.meta.url).href;
    ball.alt = '';
    opener.append(ball);
    const paper = make('div', 'moi-note-paper');
    paper.id = 'moi-note-letter';
    const facets = make('div', 'moi-note-facets');
    facets.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 12; i++) {
        const facet = make('span', 'moi-note-facet');
        facet.style.setProperty('--facet', String(i));
        facet.style.setProperty('--fold-x', (i % 2 ? -1 : 1) * (45 + i * 6) + 'deg');
        facet.style.setProperty('--fold-y', (i % 3 - 1) * 63 + 'deg');
        const column = i % 3;
        const row = Math.floor(i / 3);
        facet.style.clipPath = 'polygon(' + column * 100 / 3 + '% ' + row * 25 + '%,'
            + (column + 1) * 100 / 3 + '% ' + row * 25 + '%,'
            + (column + 1) * 100 / 3 + '% ' + (row + 1) * 25 + '%,'
            + column * 100 / 3 + '% ' + (row + 1) * 25 + '%)';
        facets.append(facet);
    }
    const writing = make('div', 'moi-note-writing');
    body = make('p', 'moi-note-body');
    signature = make('div', 'moi-note-signature');
    writing.append(body, signature);
    paper.append(facets, writing);
    stage.append(opener, paper);
    caption = make('p', 'moi-note-caption', '点击纸团，收一封留言');
    status = make('p', 'moi-note-status');
    status.setAttribute('role', 'status');
    const foldPaper = () => {
        if (!expanded) return;
        expanded = false;
        widget.classList.remove('is-unfolded');
        opener.setAttribute('aria-expanded', 'false');
        opener.focus();
    };
    paper.setAttribute('role', 'button');
    paper.setAttribute('aria-label', '点击纸条揉回纸团');
    paper.tabIndex = 0;
    paper.addEventListener('click', foldPaper);
    paper.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            foldPaper();
        }
    });
    widget.append(stage, caption, status);
    document.body.append(widget);
}

function plainText(text) {
    const parsed=new DOMParser().parseFromString(text,'text/html');
    parsed.querySelectorAll('script,style,iframe').forEach(n=>n.remove());
    return parsed.body.textContent || '';
}
function refresh() {
    widget.hidden=getComputedStyle(document.documentElement).getPropertyValue('--ah-theme').trim()!=='enabled';
}

async function findLatestConversation(rows, readArchive) {
    const candidates = rows.flatMap(row => row.archives
        .filter(archive => Number(archive.chat_items ?? archive.message_count) !== 0)
        .map(archive => ({ row, archive, time: archiveTime(archive) })));
    candidates.sort((a, b) => b.time - a.time);

    let latest;
    for (const { row, archive, time } of candidates) {
        // The preview can include a trailing system message. Check any archive
        // that could still contain a more recent real turn.
        if (latest && time > 0 && time < latest.time) continue;
        const messages = await readArchive(row.character, archive);
        if (!messages.some(message => message.is_user === true)) continue;
        const lastTurnTime = archiveTime({ last_mes: messages.at(-1).send_date }) || time;
        if (!latest || lastTurnTime > latest.time) latest = { row, time: lastTurnTime };
    }
    return latest?.row;
}

async function createNote() {
    const ctx=context();
    body.textContent=''; signature.textContent='';
    caption.textContent='';
    status.textContent='正在找一张纸条…';
    const archiveMessages = new Map();
    const readArchive = async (character, archive) => {
        if (archiveMessages.has(archive)) return archiveMessages.get(archive);
        const file = String(archive.file_id || archive.file_name).replace(/\.jsonl$/i, '');
        const response = await fetch('/api/chats/get', {
            method: 'POST',
            headers: ctx.getRequestHeaders(),
            body: JSON.stringify({ avatar_url: character.avatar, file_name: file }),
        });
        if (!response.ok) throw new Error('聊天存档读取失败');
        const data = await response.json();
        const messages = conversationMessages(Array.isArray(data) ? data : []);
        archiveMessages.set(archive, messages);
        return messages;
    };
    const rows = await characterArchives({ fresh: true });
    const latest = await findLatestConversation(rows, readArchive);
    if(!latest) {
        caption.textContent='还没有可投递的纸条';
        status.textContent='和角色聊过之后，就能收到纸条';
        return;
    }
    const {character,archives}=latest;
    caption.textContent=character.name+' 的纸条';
    const eligibleArchives = archives.filter(a => Number(a.chat_items ?? a.message_count) >= 3).sort(newestFirst);
    for(const archive of eligibleArchives) {
        const messages = await readArchive(character, archive);
        if(messages.length<3) continue;
        const last=recentThree(messages);
        const key=JSON.stringify([character.avatar,archive.file_id||archive.file_name,last]);
        let text=notes.get(key);
        if(!text) {
            if(ctx.onlineStatus==='no_connection') throw new Error('请先连接模型，再点击纸团');
            status.textContent='正在写下留言…';
            const prompt=notePrompt(character.name,last,plainText);
            // Leave room for models that share their output limit with reasoning.
            text=String(await ctx.generateRaw({...prompt,responseLength:1024,trimNames:false})).trim();
            text=fitNote(text);
            if(!text) throw new Error('模型没有返回留言，请重试');
            notes.set(key,text);
        }
        body.textContent=text;
        signature.textContent='— '+character.name;
        status.textContent='';
        return;
    }
    status.textContent='这个角色还没有包含 3 条对话的存档';
}
async function prepareNote() {
    refresh();
    if(widget.hidden || generation) return;
    generation=createNote();
    try { await generation; }
    catch(error) { status.textContent=error.message||'留言暂时未能送达，请稍后重试'; }
    finally {
        generation=undefined;
        if (expanded) revealPaper();
    }
}

export function installPaperNote() {
    mount();
    const { eventSource, eventTypes } = context();
    for (const event of ['APP_READY', 'CHAT_CHANGED', 'SETTINGS_UPDATED']) {
        eventSource.on(eventTypes[event], refresh);
    }
    void refresh();
}
