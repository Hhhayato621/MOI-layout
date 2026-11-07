// Local-only optional font storage. Font files are never uploaded.
let fontDatabase;
async function fonts() {
    return fontDatabase ||= new Promise((resolve,reject)=>{
        const request=indexedDB.open('moi-local-font',1);
        request.onupgradeneeded=()=>request.result.createObjectStore('fonts');
        request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
    });
}
async function fontStore(action,value) {
    const db=await fonts();
    return new Promise((resolve,reject)=>{
        const tx=db.transaction('fonts',action==='get'?'readonly':'readwrite');
        const request=action==='get'?tx.objectStore('fonts').get('custom'):tx.objectStore('fonts').put(value,'custom');
        let result;request.onsuccess=()=>result=request.result;tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);
    });
}
async function applyFont(blob) {
    const face=new FontFace('MOI Smile',await blob.arrayBuffer(),{weight:'400',style:'normal'});await face.load();
    document.fonts.add(face);
}
export function installShareSettings() {
    void fontStore('get').then(font=>font&&applyFont(font)).catch(()=>{});
    const mount=()=>{
        const host=document.getElementById('extensions_settings');if(!host||document.getElementById('moi-share-settings'))return;
        const panel=document.createElement('div');panel.id='moi-share-settings';panel.className='inline-drawer';
        const heading=document.createElement('h4');heading.textContent='MOI · 奶白频道';
        const description=document.createElement('p');description.textContent='先下载主题文件，再到用户设置 → UI 主题导入。字体可选，仅保存在当前设备。';
        const theme=document.createElement('a');theme.textContent='下载 MOI 侧边栏版';theme.className='menu_button';theme.href=new URL('./MOI-theme.json',import.meta.url).href;theme.download='MOI-theme.json';
        const phone=document.createElement('a');phone.textContent='下载 MOI 顶部栏版';phone.className='menu_button';phone.href=new URL('./MOI-顶部栏版.json',import.meta.url).href;phone.download='MOI-顶部栏版.json';
        const picker=document.createElement('input');picker.type='file';picker.accept='.ttf,.otf,.woff,.woff2';picker.hidden=true;
        const font=document.createElement('button');font.type='button';font.className='menu_button';font.textContent='导入本机字体';font.addEventListener('click',()=>picker.click());
        const status=document.createElement('p');status.setAttribute('role','status');
        picker.addEventListener('change',async()=>{
            const file=picker.files?.[0];if(!file)return;
            try{await applyFont(file);await fontStore('put',file);status.textContent='字体已应用，刷新后仍会保留。';}
            catch{status.textContent='字体未能读取或保存，请检查字体文件和设备存储空间。';}
            finally{picker.value='';}
        });
        panel.append(heading,description,theme,phone,font,picker,status);host.append(panel);
    };
    mount();const ctx=SillyTavern.getContext();if(ctx.eventTypes.APP_READY)ctx.eventSource.on(ctx.eventTypes.APP_READY,mount);
}
