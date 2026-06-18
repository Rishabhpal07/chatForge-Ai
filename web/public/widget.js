(function(){"use strict";function h(e){const o=e.split(`

`),n=o.pop()??"",t=[];for(const s of o)for(const a of s.split(`
`))if(a.startsWith("data: "))try{t.push(JSON.parse(a.slice(6)))}catch{}return{events:t,rest:n}}async function*y(e){const o=e.getReader(),n=new TextDecoder;let t="";for(;;){const{done:s,value:a}=await o.read();if(s)break;t+=n.decode(a,{stream:!0});const{events:c,rest:r}=h(t);t=r;for(const i of c)yield i}}function w(e){return`
  :host { all: initial; }
  * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  .launcher {
    position: fixed; bottom: 20px; z-index: 2147483000;
    border: none; border-radius: 9999px; cursor: pointer;
    background: ${e}; color: #fff; padding: 12px 18px;
    font-size: 14px; font-weight: 600; box-shadow: 0 4px 14px rgba(0,0,0,.2);
  }
  .panel {
    position: fixed; bottom: 80px; z-index: 2147483000;
    width: 360px; max-width: calc(100vw - 32px); height: 520px; max-height: calc(100vh - 120px);
    display: none; flex-direction: column; overflow: hidden;
    background: #fff; border-radius: 14px; box-shadow: 0 12px 40px rgba(0,0,0,.25);
  }
  .panel.open { display: flex; }
  .pos-right { right: 20px; }
  .pos-left  { left: 20px; }
  .header { background: ${e}; color: #fff; padding: 14px 16px; font-weight: 600; }
  .messages { flex: 1; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 10px; background: #f7f7f8; }
  .msg { padding: 9px 12px; border-radius: 12px; font-size: 14px; line-height: 1.45; max-width: 85%; white-space: pre-wrap; word-wrap: break-word; }
  .msg.user { align-self: flex-end; background: ${e}; color: #fff; border-bottom-right-radius: 4px; }
  .msg.bot  { align-self: flex-start; background: #fff; color: #111; border: 1px solid #e5e5e5; border-bottom-left-radius: 4px; }
  .form { display: flex; gap: 8px; padding: 12px; border-top: 1px solid #ececec; background: #fff; }
  .input { flex: 1; border: 1px solid #ddd; border-radius: 9999px; padding: 9px 14px; font-size: 14px; outline: none; }
  .send { border: none; background: ${e}; color: #fff; border-radius: 9999px; padding: 0 16px; font-weight: 600; cursor: pointer; }
  .send:disabled { opacity: .5; cursor: default; }
  `}const m="chatforge_visitor";function v(){try{let e=localStorage.getItem(m);return e||(e=crypto.randomUUID(),localStorage.setItem(m,e)),e}catch{return crypto.randomUUID()}}function S(){const e=document.currentScript;return e!=null&&e.dataset.bot?e:document.querySelector("script[data-bot]")}async function k(){const e=S(),o=e==null?void 0:e.dataset.bot;if(!o){console.error("[chatforge] missing data-bot attribute on <script>");return}const n=(e==null?void 0:e.dataset.api)||(e!=null&&e.src?new URL(e.src).origin:window.location.origin);try{const t=await fetch(`${n}/api/widget/${o}`);if(!t.ok)throw new Error(`config ${t.status}`);const s=await t.json();C(s)}catch(t){console.error("[chatforge] failed to load widget config",t)}}function C(e){const o=document.createElement("div");o.id="chatforge-widget-host",document.body.appendChild(o);const n=o.attachShadow({mode:"open"}),t=e.theme,s=t.position==="bottom-left"?"pos-left":"pos-right",a=document.createElement("style");a.textContent=w(t.primaryColor),n.appendChild(a);const c=document.createElement("button");c.className=`launcher ${s}`,c.textContent=t.launcherText;const r=document.createElement("div");r.className=`panel ${s}`,r.innerHTML=`
    <div class="header">${$(e.name)}</div>
    <div class="messages" part="messages"></div>
    <form class="form">
      <input class="input" type="text" placeholder="Type a message…" autocomplete="off" />
      <button class="send" type="submit">Send</button>
    </form>`,n.appendChild(c),n.appendChild(r);const i=r.querySelector(".messages"),I=r.querySelector(".form"),u=r.querySelector(".input"),g=r.querySelector(".send");t.welcomeMessage&&f(i,"bot",t.welcomeMessage),c.addEventListener("click",()=>r.classList.toggle("open"));const E=v();let b;return I.addEventListener("submit",async T=>{T.preventDefault();const x=u.value.trim();if(!x||g.disabled)return;u.value="",g.disabled=!0,f(i,"user",x);const p=f(i,"bot","");try{const d=await fetch(`${e.chatUrl}/chat`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({public_key:e.publicKey,visitor_id:E,conversation_id:b,message:x})});if(!d.ok||!d.body){p.textContent=`Sorry, something went wrong (${d.status}).`;return}for await(const l of y(d.body))l.type==="token"?(p.textContent+=l.text,i.scrollTop=i.scrollHeight):l.type==="done"?b=l.conversationId:l.type==="error"&&(p.textContent+=`
[error: ${l.message}]`)}catch(d){p.textContent="Sorry, I couldn't reach the server.",console.error("[chatforge] chat error",d)}finally{g.disabled=!1,u.focus()}}),n}function f(e,o,n){const t=document.createElement("div");return t.className=`msg ${o}`,t.textContent=n,e.appendChild(t),e.scrollTop=e.scrollHeight,t}function $(e){return e.replace(/[&<>"']/g,o=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[o])}k()})();
