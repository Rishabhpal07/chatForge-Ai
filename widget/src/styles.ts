/** CSS injected into the widget's Shadow DOM (isolated from the host page). */
export function buildStyles(primary: string): string {
  return `
  :host { all: initial; }
  * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  .launcher {
    position: fixed; bottom: 20px; z-index: 2147483000;
    border: none; border-radius: 9999px; cursor: pointer;
    background: ${primary}; color: #fff; padding: 12px 18px;
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
  .header { background: ${primary}; color: #fff; padding: 14px 16px; font-weight: 600; }
  .messages { flex: 1; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 10px; background: #f7f7f8; }
  .msg { padding: 9px 12px; border-radius: 12px; font-size: 14px; line-height: 1.45; max-width: 85%; white-space: pre-wrap; word-wrap: break-word; }
  .msg.user { align-self: flex-end; background: ${primary}; color: #fff; border-bottom-right-radius: 4px; }
  .msg.bot  { align-self: flex-start; background: #fff; color: #111; border: 1px solid #e5e5e5; border-bottom-left-radius: 4px; }
  .form { display: flex; gap: 8px; padding: 12px; border-top: 1px solid #ececec; background: #fff; }
  .input { flex: 1; border: 1px solid #ddd; border-radius: 9999px; padding: 9px 14px; font-size: 14px; outline: none; }
  .send { border: none; background: ${primary}; color: #fff; border-radius: 9999px; padding: 0 16px; font-weight: 600; cursor: pointer; }
  .send:disabled { opacity: .5; cursor: default; }
  `;
}
