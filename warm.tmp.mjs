const list = await (await fetch('http://127.0.0.1:9333/json')).json()
const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl)
await new Promise((r) => (ws.onopen = r))
ws.onmessage = (m) => { console.log('warm:', JSON.stringify(JSON.parse(m.data).result?.result?.value ?? JSON.parse(m.data))); process.exit(0) }
ws.onclose = () => { console.log('warm: page reloaded'); process.exit(0) }
ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { awaitPromise: true, returnByValue: true, expression: `Promise.all([import('/store/useAudioEngineStore.ts'), import('/audio/AudioEngine.ts')]).then(() => 'ok')` } }))
