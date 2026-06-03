import { mount } from 'svelte'
import './local-fonts.css'
import './nerd-icons.css'
import './app.css'
import App from './App.svelte'

const app = mount(App, {
  target: document.getElementById('app'),
})

export default app
