import { Symbol } from '../../langserv/adapter'
import { h, app, Actions } from '../uikit'
import { feedkeys, cmd } from '../neovim'
import { filter } from 'fuzzaldrin-plus'
import TermInput from './input'

interface State { val: string, symbols: Symbol[], cache: Symbol[], vis: boolean, ix: number }
const state: State = { val: '', symbols: [], cache: [], vis: false, ix: 0 }

const view = ({ val, symbols, vis, ix }: State, { change, hide, select, next, prev }: any) => h('#symbols.plugin', {
  hide: !vis
}, [
  h('.dialog.medium', [
    TermInput({ focus: true, val, next, prev, change, hide, select }),

    h('.row', { render: !symbols.length }, '...'),

    h('div', symbols.map(({ name }, key) => h('.row', {
      key,
      css: { active: key === ix },
    }, [
      // TODO: render symbol kind icon
      h('span', name),
    ]))),
  ])
])

const a: Actions<State> = {}

a.select = (s, a) => {
  if (!s.symbols.length) return a.hide()
  const { location: { cwd, file, position: { line, column } } } = s.symbols[s.ix]
  cmd(`e ${cwd}/${file}`)
  feedkeys(`${line}Gzz${column}|`)
  a.hide()
}

a.change = (s, _a, val: string) => ({ val, symbols: val
  ? filter(s.cache, val, { key: 'name' }).slice(0, 10)
  : s.cache.slice(0, 10)
})

a.show = (_s, _a, symbols: Symbol[]) => ({ symbols, cache: symbols, vis: true })
a.hide = () => ({ val: '', vis: false, ix: 0 })
a.next = s => ({ ix: s.ix + 1 > 9 ? 0 : s.ix + 1 })
a.prev = s => ({ ix: s.ix - 1 < 0 ? 9 : s.ix - 1 })

const ui = app({ state, view, actions: a })

export const show = (symbols: Symbol[]) => ui.show(symbols)