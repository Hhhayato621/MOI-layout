import {songKey,clock,musicLink} from './pocket-music-core.js';
const database='moi-pocket-music';
let tracks=[]; let current=0; let audio; let music; let screenTitle; let lyrics; let time; let progress; let play; let status; let list; let dialog; let input; let activeUrl; let databaseHandle;  let importBusy=false; let libraryRevision=0;
function make(tag,cls,text) { const e=document.createElement(tag);e.className=cls;if(text)e.textContent=text;return e; }
function button(cls,label,text,callback) {const e=make('button',cls,text);e.type='button';e.setAttribute('aria-label',label);e.title=label;e.addEventListener('click',callback);return e;}
function db() {
    return databaseHandle ||= new Promise((resolve,reject)=>{
        const request=indexedDB.open(database,1);
        request.onupgradeneeded=()=>request.result.createObjectStore('tracks',{keyPath:'id'});
        request.onsuccess=()=>resolve(request.result); request.onerror=()=>reject(request.error);
    });
}
async function store(action,value) {
    const connection=await db();
    return new Promise((resolve,reject)=>{
        const transaction=connection.transaction('tracks',action==='getAll'?'readonly':'readwrite');
        const request=transaction.objectStore('tracks')[action](...(value===undefined?[]:[value]));
        let result;request.onsuccess=()=>result=request.result;
        transaction.oncomplete=()=>resolve(result);transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error);
    });
}
function showStatus(text) {status.textContent=text;}
function renderScreen() {
    const track=tracks[current];
    screenTitle.textContent=track?.name || 'MOI music';
    screenTitle.title=track?.name || '点击十字键中间，导入音乐';
    lyrics.textContent='';
    time.textContent=clock(audio.currentTime)+' / '+clock(audio.duration);
    const ratio=audio.duration?audio.currentTime/audio.duration:0;
    progress.style.setProperty('--played',`${Math.min(100,Math.max(0,ratio*100))}%`);
    progress.setAttribute('aria-valuenow',String(Math.round(ratio*100)||0));
    play.setAttribute('aria-label',audio.paused?'播放音乐':'暂停音乐');
    play.title=audio.paused?'播放音乐':'暂停音乐';
    play.textContent=audio.paused?'▶':'Ⅱ';
    music.classList.toggle('is-playing',!audio.paused);
}
async function start() {
    if(!tracks.length){input.click();return;}
    try {await audio.play();showStatus('');} catch(error) {showStatus('无法播放这首歌，请换一个音频文件');}
    renderScreen();
}
function loadTrack(index,autoplay=false) {
    if(!tracks.length) {audio.pause();audio.removeAttribute('src');audio.load();if(activeUrl)URL.revokeObjectURL(activeUrl);activeUrl=undefined;renderScreen();return;}
    current=(index+tracks.length)%tracks.length;
    audio.pause();
    if(activeUrl)URL.revokeObjectURL(activeUrl);
    activeUrl=tracks[current].blob?URL.createObjectURL(tracks[current].blob):undefined;
    audio.src=activeUrl||tracks[current].url;audio.load();
    localStorage.setItem('moi:music:selected',tracks[current].id);
    renderScreen();renderList();
    if(autoplay)void start();
}
function skip(delta) {if(!tracks.length){input.click();return;}loadTrack(current+delta,!audio.paused);}
function seek(delta) {if(Number.isFinite(audio.duration)) audio.currentTime=Math.min(audio.duration,Math.max(0,audio.currentTime+delta));renderScreen();}
function volume(delta) {audio.volume=Math.max(0,Math.min(1,audio.volume+delta));localStorage.setItem('moi:music:volume',String(audio.volume));showStatus('音量 '+Math.round(audio.volume*100)+'%');}
function renderList() {
    if(!list)return;
    list.replaceChildren();
    if(!tracks.length)list.append(make('p','moi-music-empty','还没有音乐，点击“导入音乐”添加。'));
    tracks.forEach((track,index)=>{
        const row=make('div','moi-music-track');
        const choose=button('moi-music-track-title','播放 '+track.name,track.name,()=>{loadTrack(index,true);dialog.close();});
        choose.setAttribute('aria-pressed',String(index===current));
        const remove=button('moi-music-remove','移除 '+track.name,'×',async()=>{
            const active=tracks[current]?.id; tracks.splice(index,1); libraryRevision++;
            try {await store('delete',track.id);}catch{showStatus('曲目已移除，但无法更新本机存储');}
            const kept=tracks.findIndex(t=>t.id===active);
            if(kept<0)loadTrack(Math.min(current,tracks.length-1));else current=kept;
            renderList();renderScreen();
        });
        const rename=button('moi-music-rename','修改歌名 '+track.name,'✎',()=>{
            const form=make('form','moi-music-rename-form');
            const nameInput=make('input','moi-music-name-input');nameInput.type='text';nameInput.value=track.name;nameInput.maxLength=120;nameInput.required=true;nameInput.setAttribute('aria-label','歌名');
            const save=make('button','moi-music-save','保存');save.type='submit';
            const cancel=button('moi-music-cancel','取消修改歌名','取消',renderList);
            const feedback=make('p','moi-music-help');feedback.setAttribute('role','status');
            form.append(nameInput,save,cancel,feedback);row.replaceChildren(form);nameInput.focus();nameInput.select();
            form.addEventListener('submit',async event=>{
                event.preventDefault();const name=nameInput.value.trim();if(!name){feedback.textContent='请输入歌名';return;}
                save.disabled=true;const updated={...track,name,key:songKey(name)};
                try{await store('put',updated);Object.assign(track,updated);libraryRevision++;renderList();renderScreen();}
                catch{feedback.textContent='保存失败，请重试';save.disabled=false;}
            });
        });
        row.append(choose,rename,remove);list.append(row);
    });
}
async function importFiles(files) {
    if(importBusy)return;importBusy=true;
    const first=tracks.length;let added=0;let saved=true;
    try {
        for(const file of [...files]) {
            if(!file.type.startsWith('audio/')&&!/\.(mp3|m4a|aac|wav|ogg|flac|opus|aiff)$/i.test(file.name))continue;
            const track={id:crypto.randomUUID(),name:file.name.replace(/\.[^.]+$/,''),key:songKey(file.name),blob:file,added:Date.now()+added};
            tracks.push(track);added++;try{await store('put',track);}catch{saved=false;}
        }
        libraryRevision++;
        if(added)loadTrack(first,false);renderList();
        showStatus(!added?'请选择音频文件':saved?`已导入 ${added} 首，按 ▶ 播放`:'已装入；本机存储空间不足，关闭页面后需重新导入');
    }catch{showStatus('导入未完成，请重试');}
    finally{importBusy=false;input.value='';}
}
function checkAudio(url) {
    return new Promise((resolve,reject)=>{
        const probe=new Audio();probe.preload='metadata';let timer;
        const finish=error=>{clearTimeout(timer);probe.onloadedmetadata=null;probe.onerror=null;probe.removeAttribute('src');probe.load();error?reject(error):resolve();};
        probe.onloadedmetadata=()=>finish();probe.onerror=()=>finish(new Error('来源没有提供可播放的音频，或被网络限制。请使用音频直链或本机音乐文件。'));
        timer=setTimeout(()=>finish(new Error('音频检查超时，请确认链接和网络后重试。')),15000);probe.src=url;probe.load();
    });
}
export async function installPocketMusic() {
    const dock=document.getElementById('moi-widget-dock');if(!dock)return;
    music=make('section','moi-music');music.setAttribute('aria-label','掌机音乐播放器');
    const device=make('div','moi-music-device');
    const frame=make('img','moi-music-shell');frame.src=new URL('./pocket-music.png',import.meta.url).href;frame.alt='';
    const screen=button('moi-music-screen','打开音乐列表','',()=>{renderList();dialog.showModal();});
    screenTitle=make('strong','moi-music-title');lyrics=make('span','moi-music-lyric');time=make('small','moi-music-time');
    screen.append(screenTitle,lyrics,time);
    progress=make('div','moi-music-progress');progress.tabIndex=0;progress.setAttribute('role','slider');progress.setAttribute('aria-label','音乐播放进度');progress.setAttribute('aria-valuemin','0');progress.setAttribute('aria-valuemax','100');
    progress.addEventListener('click',event=>{if(!Number.isFinite(audio.duration))return;const rect=progress.getBoundingClientRect();audio.currentTime=Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width))*audio.duration;renderScreen();});
    progress.addEventListener('keydown',event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();seek(event.key==='ArrowLeft'?-5:5);}});
    input=make('input','');input.type='file';input.accept='audio/*,.mp3,.m4a,.aac,.wav,.ogg,.flac';input.multiple=true;input.hidden=true;input.addEventListener('change',()=>void importFiles(input.files));
    const center=button('moi-music-import','导入音乐或粘贴歌曲链接','＋',()=>{renderList();dialog.showModal();});
    const previous=button('moi-music-prev','上一首','‹',()=>skip(-1));
    const next=button('moi-music-next','下一首','›',()=>skip(1));
    play=button('moi-music-play','播放音乐','▶',()=>audio.paused?void start():audio.pause());
    const library=button('moi-music-library','音乐列表','≡',()=>{renderList();dialog.showModal();});
    const left=button('moi-music-left','后退 10 秒','',()=>seek(-10));
    const right=button('moi-music-right','前进 10 秒','',()=>seek(10));
    const up=button('moi-music-up','提高音量','',()=>volume(.1));
    const down=button('moi-music-down','降低音量','',()=>volume(-.1));
    status=make('p','moi-music-status');status.setAttribute('role','status');
    audio=document.createElement('audio');audio.preload='metadata';audio.setAttribute('playsinline','');audio.hidden=true;
    const storedVolume=Number(localStorage.getItem('moi:music:volume')??'.7');audio.volume=Number.isFinite(storedVolume)?Math.max(0,Math.min(1,storedVolume)):.7;
    for(const event of ['timeupdate','loadedmetadata','play','pause','durationchange','seeked'])audio.addEventListener(event,renderScreen);
    audio.addEventListener('ended',()=>loadTrack(current+1,true));
    audio.addEventListener('error',()=>{if(audio.getAttribute('src'))showStatus('此音频格式无法播放，请换成 MP3 或 M4A');});
    device.append(frame,screen,progress,center,previous,next,play,library,left,right,up,down);
    music.append(device,input,audio,status);
    const note=dock.querySelector('.moi-note-widget');if(note)dock.insertBefore(music,note);else dock.append(music);
    dialog=make('dialog','moi-photo-dialog moi-music-dialog');dialog.setAttribute('aria-label','音乐列表');
    const heading=make('div','moi-photo-dialog-heading');heading.append(make('h3','','音乐列表'),button('moi-photo-dialog-close','关闭音乐列表','×',()=>dialog.close()));
    list=make('div','moi-music-tracks');
    const importButton=button('moi-music-add','导入音乐','导入音乐',()=>input.click());
    const linkForm=make('form','moi-music-link-form');
    const linkInput=make('textarea','moi-music-link-input');linkInput.rows=2;linkInput.placeholder='粘贴歌曲分享文字或音频链接';linkInput.setAttribute('aria-label','歌曲链接');
    const addLink=make('button','moi-music-add','解析并加入');addLink.type='submit';
    const linkFeedback=make('p','moi-music-help');linkFeedback.setAttribute('role','status');
    linkForm.append(linkInput,addLink,linkFeedback);
    linkForm.addEventListener('submit',async event=>{
        event.preventDefault();if(addLink.disabled)return;addLink.disabled=true;linkFeedback.textContent='正在检查音频…';
        try {
            let parsed=musicLink(linkInput.value);
            if(parsed.kind==='short') {
                const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),8000);
                try {const result=await fetch(parsed.url,{method:'HEAD',credentials:'omit',signal:controller.signal});parsed=musicLink(result.url);if(parsed.kind==='short')throw new Error();}
                catch{throw new Error('当前环境无法展开网易云短链接。请在浏览器打开它，复制 music.163.com 的完整歌曲网址再粘贴。');}
                finally{clearTimeout(timer);}
            }
            await checkAudio(parsed.url);
            const track={id:crypto.randomUUID(),name:parsed.name,key:songKey(parsed.name),url:parsed.url,source:parsed.source,lines:[],added:Date.now()};
            tracks.push(track);libraryRevision++;let saved=true;try{await store('put',track);}catch{saved=false;}
            loadTrack(tracks.length-1);renderList();linkInput.value='';linkFeedback.textContent=saved?'已加入歌单，关闭后按 ▶ 播放。':'已加入；此环境无法保存，刷新后需重新添加。';
        }catch(error){linkFeedback.textContent=error.message||'无法解析这个链接';}
        finally{addLink.disabled=false;}
    });
    dialog.append(heading,list,importButton,linkForm,make('p','moi-music-help','支持音频直链和网易云完整单曲链接；能否播放由来源权限和网络决定。歌名可点击歌单中的编辑按钮修改。'));
    document.body.append(dialog);renderScreen();
    const revision=libraryRevision;
    try {const saved=await store('getAll');if(revision===libraryRevision){tracks=saved.sort((a,b)=>a.added-b.added);const selected=tracks.findIndex(t=>t.id===localStorage.getItem('moi:music:selected'));loadTrack(Math.max(0,selected));}}
    catch{showStatus('可导入播放；此环境暂不支持保存音乐');}
}
