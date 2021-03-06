import { renameCurrent, getCurrentName } from '../core/sessions'
import { Plugin } from '../components/plugin-container'
import { app, vimBlur, vimFocus } from '../ui/uikit'
import Input from '../components/text-input'
import * as Icon from 'hyperapp-feather'
import nvim from '../core/neovim'

const state = {
  value: '',
  visible: false,
}

type S = typeof state

const actions = {
  show: (value: string) => (vimBlur(), { value, visible: true }),
  hide: () => (vimFocus(), { value: '', visible: false }),
  change: (value: string) => ({ value }),
  select: () => (s: S) => {
    vimFocus()
    s.value && renameCurrent(s.value)
    return { value: '', visible: false }
  },
}

const view = ($: S, a: typeof actions) => Plugin($.visible, [

  ,Input({
    hide: a.hide,
    select: a.select,
    change: a.change,
    value: $.value,
    focus: true,
    icon: Icon.Edit,
    desc: 'rename vim session',
  })

])

const ui = app({ name: 'vim-rename', state, actions, view })
nvim.onAction('vim-rename', () => ui.show(getCurrentName()))
