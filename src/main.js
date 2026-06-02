import { mount } from 'svelte'
import '@fontsource/noto-sans-mono/400.css'
import '@fontsource/noto-sans-mono/600.css'
import '@fontsource/noto-sans-mono/700.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/600.css'
import '@fontsource/jetbrains-mono/700.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/600.css'
import '@fontsource/ibm-plex-mono/700.css'
import '@fontsource/fira-code/400.css'
import '@fontsource/fira-code/600.css'
import '@fontsource/fira-code/700.css'
import '@fontsource/source-code-pro/400.css'
import '@fontsource/source-code-pro/600.css'
import '@fontsource/source-code-pro/700.css'
import './app.css'
import App from './App.svelte'

const app = mount(App, {
  target: document.getElementById('app'),
})

export default app
