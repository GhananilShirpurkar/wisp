// Optional native smoke check: npm run test:ui (requires a graphical session).
const { app, BrowserWindow, nativeImage } = require('electron');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: 900,
    height: 700,
    webPreferences: {
      backgroundThrottling: false,
      preload: path.resolve('ui/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  try {
    await win.loadFile(path.resolve('ui/index.html'));
    await win.webContents.executeJavaScript(`localStorage.removeItem('paperclip.preferences')`);
    await win.reload();
    await new Promise((resolve) => win.webContents.once('did-finish-load', resolve));
    const result = await win.webContents.executeJavaScript(`(() => {
   document.querySelector('#possess').click();
   document.querySelector('[data-effect="ink"]').click();
   return {possessed:document.body.classList.contains('possessed'),ink:document.querySelector('#scene').className,bridge:typeof window.paperclip.onMessage,node:typeof require};
  })()`);
    assert.deepEqual(result, {
      possessed: true,
      ink: 'ink',
      bridge: 'function',
      node: 'undefined',
    });
    win.webContents.send('message', { text: '<script>untrusted</script>', kind: 'help' });
    await new Promise((r) => setTimeout(r, 100));
    const text = await win.webContents.executeJavaScript(
      `document.querySelector('#speech').textContent`,
    );
    assert.equal(text, '<script>untrusted</script>');
    console.log('Electron UI smoke passed: controls, isolated bridge, text-only messages.');
    win.webContents.send('capture:state', 'sharing');
    win.webContents.send('environment', { demo: true, captureSupported: true });
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(
      await win.webContents.executeJavaScript('document.querySelector("#share").disabled'),
      true,
    );
    win.webContents.send('environment', { demo: false, captureSupported: true });
    const controls = await win.webContents.executeJavaScript(`(() => {
   document.querySelector('#ghost').click();
   const opened=!document.querySelector('#controls').hidden;
   document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));
   const closed=document.querySelector('#controls').hidden;
   document.querySelector('#motion').click();
   document.querySelector('[data-effect="lightning"]').click();
   return {opened,closed,quiet:document.body.classList.contains('quiet-motion'),effect:document.querySelector('#scene').className,saved:JSON.parse(localStorage.getItem('paperclip.preferences')).motion};
  })()`);
    assert.deepEqual(controls, {
      opened: true,
      closed: true,
      quiet: true,
      effect: '',
      saved: true,
    });
    await win.webContents.executeJavaScript(
      `document.querySelector('#motion').click();document.querySelector('#possess').click();document.querySelector('#ghost').click();document.querySelector('#speech').textContent='A little company for your next big idea.';`,
    );
    if (process.env.UI_SCREENSHOT_DIR) {
      fs.mkdirSync(process.env.UI_SCREENSHOT_DIR, { recursive: true });
      await win.webContents.executeJavaScript(
        'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))',
      );
      fs.writeFileSync(
        path.join(process.env.UI_SCREENSHOT_DIR, 'companion.png'),
        (await win.webContents.capturePage()).toPNG(),
      );
    }

    const captureWindow = new BrowserWindow({
      show: false,
      width: 800,
      height: 850,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false,
      },
    });
    await captureWindow.loadFile(path.resolve('ui/capture.html'));
    if (process.env.UI_SCREENSHOT_DIR)
      fs.writeFileSync(
        path.join(process.env.UI_SCREENSHOT_DIR, 'screen-sharing.png'),
        (await captureWindow.webContents.capturePage()).toPNG(),
      );
    const idleLayout = await captureWindow.webContents.executeJavaScript(
      `({overflow:document.documentElement.scrollWidth>innerWidth,heading:document.querySelector('h1').textContent})`,
    );
    assert.equal(idleLayout.overflow, false);
    const cancelState = await captureWindow.webContents.executeJavaScript(
      `(async()=>{navigator.mediaDevices.getDisplayMedia=async()=>{throw new DOMException('cancel','NotAllowedError');};await document.querySelector('#start').onclick();return {state:document.body.dataset.state,retry:!document.querySelector('#start').disabled,errorVisible:!document.querySelector('#error-panel').hidden};})()`,
    );
    assert.deepEqual(cancelState, { state: 'idle', retry: true, errorVisible: false });
    const failureState = await captureWindow.webContents.executeJavaScript(
      `(async()=>{navigator.mediaDevices.getDisplayMedia=async()=>{throw new DOMException('offline','NotReadableError');};await document.querySelector('#start').onclick();return {state:document.body.dataset.state,retry:!document.querySelector('#start').disabled,errorVisible:!document.querySelector('#error-panel').hidden};})()`,
    );
    assert.deepEqual(failureState, { state: 'error', retry: true, errorVisible: true });

    const captureResult = await captureWindow.webContents.executeJavaScript(`(async () => {
   try {
   // Exercise frame generation with a synthetic stream, never the user's screen.
   const source=document.createElement('canvas');source.width=1920;source.height=1080;
   source.getContext('2d').fillRect(0,0,1920,1080);
   navigator.mediaDevices.getDisplayMedia=async()=>source.captureStream(1);
   await document.querySelector('#start').onclick();
   const frame=window.captureFrame();
   const liveState=document.body.dataset.state, sampleText=document.querySelector('#samples').textContent;
   
   document.querySelector('#stop').click();
   let stopped=false;try{window.captureFrame();}catch{stopped=true;}
   return {frame,stopped,liveState,sampleText,finalState:document.body.dataset.state};
   } catch(error) {return {error:String(error),stack:error.stack};}
  })()`);
    assert.equal(captureResult.error, undefined);
    assert.equal(captureResult.stopped, true);
    assert.equal(captureResult.liveState, 'sharing');
    assert.equal(captureResult.sampleText, '1 frame');
    assert.equal(captureResult.finalState, 'idle');
    assert.deepEqual(
      nativeImage.createFromBuffer(Buffer.from(captureResult.frame, 'base64')).getSize(),
      { width: 1280, height: 720 },
    );
    console.log(
      'Linux capture renderer passed: 1280px JPEG sampling and stop revocation (synthetic stream).',
    );
    captureWindow.setSize(440, 640);
    const narrow = await captureWindow.webContents.executeJavaScript(
      `({overflow:document.documentElement.scrollWidth>innerWidth})`,
    );
    assert.equal(narrow.overflow, false);
    console.log(
      'UI states passed: keyboard dismissal, motion preferences, cancellation, recovery, live metrics, and narrow layout.',
    );
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
