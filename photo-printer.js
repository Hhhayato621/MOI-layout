const context = () => SillyTavern.getContext();
const preferenceKey = 'moi:photo-printer:selected';
const photoKey = 'moi:photo-printer:photo:';
const captionKey = 'moi:photo-printer:caption:';
let captionInput;
let dock;
let selection;
let photo;
let caption;
let message;
let upload;
let selectedAvatar = '';
let rendering = 0;
let printTimer;
let openOnDesktop = localStorage.getItem('moi:right-dock:collapsed') !== 'true';
const desktop = matchMedia('(min-width:1120px)');

function element(tag, className, text) {
    const result = document.createElement(tag);
    result.className = className;
    if (text) result.textContent = text;
    return result;
}

function button(text, className, callback) {
    const result = element('button', className, text);
    result.type = 'button';
    result.addEventListener('click', callback);
    return result;
}

function printPhoto() {
    if (!photo.getAttribute('src')) return;
    const frame = photo.closest('.moi-photo-print');
    frame.classList.remove('is-printing');
    // Restart the feed animation on an explicit print action.
    void frame.offsetWidth;
    frame.classList.add('is-printing');
    clearTimeout(printTimer);
    printTimer = setTimeout(() => frame.classList.remove('is-printing'), 1600);
}

function setOpen(open) {
    dock.hidden = !open;
    document.documentElement.classList.toggle('moi-right-collapsed', !open);
    const toggle = document.querySelector('.moi-right-toggle');
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? '收起右侧组件栏' : '展开右侧组件栏');
    toggle.title = open ? '收起组件栏' : '展开组件栏';
    toggle.textContent = open ? '›' : '‹';
}

async function refreshPrinter(animate = false) {
    const version = ++rendering;
    const ctx = context();
    const previous = selection.value || ctx.accountStorage.getItem(preferenceKey) || '';
    const available = ctx.characters.filter(character => character.avatar && character.avatar !== 'none');
    selection.replaceChildren(new Option('跟随当前角色', ''),
        ...available.map(character => new Option(character.name, character.avatar)));
    selection.value = available.some(character => character.avatar === previous) ? previous : '';
    let character = available.find(item => item.avatar === selection.value) || ctx.characters[ctx.characterId];
    if (!character && !selection.value) {
        try {
            const response = await fetch('/api/chats/recent', {
                method: 'POST', headers: ctx.getRequestHeaders(), body: JSON.stringify({ max: 1, pinned: [] }),
            });
            if (response.ok) {
                const [latest] = await response.json();
                character = available.find(item => item.avatar === latest?.avatar);
            }
        } catch (error) {
            console.warn('MOI photo printer recent character', error);
        }
    }
    if (version !== rendering) return;
    character ||= available[0];
    selectedAvatar = character?.avatar || '';
    caption.textContent = ctx.accountStorage.getItem(captionKey + selectedAvatar) ?? character?.name ?? 'MOI';
    if (captionInput) captionInput.value = caption.textContent;
    message.textContent = '';
    upload.disabled = !character;
    if (!character) {
        photo.removeAttribute('src');
        photo.alt = '';
        message.textContent = '先添加一个角色';
        return;
    }
    const saved = ctx.accountStorage.getItem(photoKey + selectedAvatar);
    const source = saved || ctx.getThumbnailUrl('avatar', selectedAvatar);
    const changed = photo.getAttribute('src') !== source;
    photo.src = source;
    photo.alt = character.name + '的照片';
    if (animate && changed) printPhoto();
}

async function replacePhoto(file) {
    if (!file || !selectedAvatar) return;
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
        message.textContent = '请选择 JPG、PNG、WebP 或 GIF 图片';
        return;
    }
    if (file.size > 20 * 1024 * 1024) {
        message.textContent = '请选择小于 20 MB 的图片';
        return;
    }
    const avatar = selectedAvatar;
    upload.disabled = true;
    message.textContent = '正在装入照片…';
    let image;
    try {
        image = await createImageBitmap(file);
        const scale = Math.min(1, 900 / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const drawing = canvas.getContext('2d');
        drawing.fillStyle = '#fff';
        drawing.fillRect(0, 0, canvas.width, canvas.height);
        drawing.drawImage(image, 0, 0, canvas.width, canvas.height);
        const data = canvas.toDataURL('image/jpeg', .86);
        context().accountStorage.setItem(photoKey + avatar, data);
        if (selectedAvatar === avatar) {
            photo.src = data;
            message.textContent = '';
            printPhoto();
        }
    } catch (error) {
        message.textContent = '照片未能装入，请换一张重试';
        console.warn('MOI printer photo', error);
    } finally {
        image?.close();
        upload.disabled = !selectedAvatar;
    }
}

export function installPhotoPrinter() {
    dock = element('aside', 'moi-widget-dock');
    dock.id = 'moi-widget-dock';
    dock.setAttribute('aria-label', '右侧互动组件');
    const toggle = button('›', 'moi-right-toggle', () => {
        const open = dock.hidden;
        if (desktop.matches) {
            openOnDesktop = open;
            localStorage.setItem('moi:right-dock:collapsed', String(!open));
        }
        setOpen(open);
    });
    toggle.setAttribute('aria-controls', dock.id);
    const printer = element('section', 'moi-printer');
    printer.setAttribute('aria-label', '角色相片打印机');
    const scene = element('div', 'moi-printer-scene');
    const machine = element('img', 'moi-printer-machine');
    machine.src = new URL('./photo-printer.png', import.meta.url).href;
    machine.alt = '';
    const paper = element('button', 'moi-photo-print');
    paper.type = 'button';
    paper.setAttribute('aria-label', '选择角色或更换照片');
    photo = element('img', 'moi-photo-image');
    caption = element('div', 'moi-photo-caption', 'MOI');
    paper.append(photo, caption);
    scene.append(machine, paper);
    selection = element('select', 'moi-printer-select');
    selection.setAttribute('aria-label', '选择相纸上的角色');
    selection.addEventListener('change', () => {
        context().accountStorage.setItem(preferenceKey, selection.value);
        void refreshPrinter(true);
    });
    const input = element('input', '');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp,image/gif';
    input.hidden = true;
    input.addEventListener('change', () => {
        void replacePhoto(input.files?.[0]);
        input.value = '';
    });
    upload = button('选择相册', 'moi-printer-upload', () => input.click());
    const replay = button('打印', '', printPhoto);
    const tools = element('div', 'moi-printer-tools');
    tools.append(upload, replay);
    message = element('p', 'moi-printer-status');
    message.setAttribute('role', 'status');
    const dialog = element('dialog', 'moi-photo-dialog');
    dialog.setAttribute('aria-label', '相片设置');
    const dialogHeading = element('div', 'moi-photo-dialog-heading');
    const close = button('×', 'moi-photo-dialog-close', () => dialog.close());
    close.setAttribute('aria-label', '关闭相片设置');
    dialogHeading.append(element('h3', '', '相片设置'), close);
    const roleLabel = element('label', 'moi-photo-role-label', '选择角色');
    selection.id = 'moi-printer-character';
    roleLabel.htmlFor = selection.id;
    const captionLabel = element('label', 'moi-photo-role-label moi-photo-caption-label', '相纸文字');
    captionInput = element('input', 'moi-photo-caption-input');
    captionInput.type = 'text';
    captionInput.id = 'moi-photo-caption-input';
    captionInput.maxLength = 40;
    captionLabel.htmlFor = captionInput.id;
    captionInput.addEventListener('input', () => {
        if (!selectedAvatar) return;
        caption.textContent = captionInput.value;
        context().accountStorage.setItem(captionKey + selectedAvatar, captionInput.value);
    });
    caption.title = '点击修改相纸文字';
    dialog.append(dialogHeading, roleLabel, selection, captionLabel, captionInput, input, tools, message);
    dialog.addEventListener('click', event => {
        if (event.target !== dialog) return;
        const bounds = dialog.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right ||
            event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
    });
    paper.addEventListener('click', event => {
        if (!dialog.open) dialog.showModal();
        if (caption.contains(event.target)) {
            captionInput.focus();
            captionInput.select();
        }
    });
    printer.append(scene);
    dock.append(printer);
    const note = document.querySelector('.moi-note-widget');
    if (note) dock.append(note);
    document.body.append(dock, toggle, dialog);
    const { eventSource, eventTypes } = context();
    for (const event of ['APP_READY', 'CHAT_CHANGED', 'CHARACTER_EDITED']) {
        eventSource.on(eventTypes[event], () => void refreshPrinter(true));
    }
    desktop.addEventListener('change', () => setOpen(desktop.matches && openOnDesktop));
    setOpen(desktop.matches && openOnDesktop);
    void refreshPrinter();
}
