const context = () => SillyTavern.getContext();
let widget;
let body;
let signature;
let caption;
let status;
let opener;
let expanded = false;
let revision = 0;

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

function mount() {
    widget = make('section', 'moi-note-widget');
    widget.setAttribute('aria-label', '角色纸条留言');
    const stage = make('div', 'moi-note-stage');
    opener = control('', 'moi-note-ball', () => {
        expanded = true;
        widget.classList.add('is-unfolded');
        opener.setAttribute('aria-expanded', 'true');
        void refresh();
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
    caption = make('p', 'moi-note-caption', '点击纸团，展开留言');
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
    widget.append(stage, caption);
    document.body.append(widget);
}

async function refresh() {
    const current = ++revision;
    widget.hidden = getComputedStyle(document.documentElement).getPropertyValue('--ah-theme').trim() !== 'enabled';
    if (widget.hidden) return;
    const ctx = context();
    let name = ctx.characters[ctx.characterId]?.name;
    if (!name && ctx.groupId) name = ctx.groups.find(group => String(group.id) === String(ctx.groupId))?.name;
    if (!name) {
        try {
            const response = await fetch('/api/chats/recent', {
                method: 'POST', headers: ctx.getRequestHeaders(),
                body: JSON.stringify({ max: 1, pinned: [] }),
            });
            if (!response.ok) throw new Error(String(response.status));
            const [latest] = await response.json();
            name = latest?.group
                ? ctx.groups.find(group => String(group.id) === String(latest.group))?.name
                : ctx.characters.find(character => character.avatar === latest?.avatar)?.name;
        } catch (error) {
            console.warn('MOI paper note character', error);
        }
    }
    if (current !== revision) return;
    caption.textContent = name ? name + ' 的纸条' : '点击纸团，轻轻展开';
    body.textContent = '';
    signature.textContent = '';
}

export function installPaperNote() {
    mount();
    const { eventSource, eventTypes } = context();
    for (const event of ['APP_READY', 'CHAT_CHANGED', 'SETTINGS_UPDATED']) {
        eventSource.on(eventTypes[event], refresh);
    }
    void refresh();
}
