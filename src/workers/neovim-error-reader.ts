import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver-protocol'
import { prefixWith, onFnCall, is } from '../support/utils'
import { QuickFixList } from '../core/vim-functions'
import CreateTransport from '../messaging/transport'
import { Api, Prefixes } from '../neovim/protocol'
import NeovimUtils from '../support/neovim-utils'
import { on } from '../messaging/worker-client'
import { Neovim } from '../support/binaries'
import SetupRPC from '../messaging/rpc'

const prefix = { core: prefixWith(Prefixes.Core) }
const vimOptions = {
  rgb: false,
  ext_popupmenu: false,
  ext_tabline: false,
  ext_wildmenu: false,
  ext_cmdline: false
}

const { encoder, decoder } = CreateTransport()
const proc = Neovim.run([
  '--cmd', `let $VIM = '${Neovim.path}'`,
  '--cmd', `let $VIMRUNTIME = '${Neovim.runtime}'`,
  '--cmd', `let g:veonim = 1 | let g:vn_loaded = 0 | let g:vn_ask_cd = 0`,
  '--cmd', `exe ":fun! Veonim(...)\\n endfun"`,
  '--cmd', `exe ":fun! VK(...)\\n endfun"`,
  '--cmd', `com! -nargs=+ -range Veonim 1`,
  '--cmd', 'com! -nargs=* Plug 1',
  '--embed',
])

proc.on('error', e => console.error('vim error-reader err', e))
proc.stdout.on('error', e => console.error('vim error-reader stdout err', e))
proc.stdin.on('error', e => console.error('vim error-reader stdin err', e))
proc.stderr.on('data', e => console.error('vim error-reader stderr', e))
proc.on('exit', () => console.error('vim error-reader exit'))

encoder.pipe(proc.stdin)
proc.stdout.pipe(decoder)

const { notify, request, onData } = SetupRPC(encoder.write)
decoder.on('data', ([type, ...d]: [number, any]) => onData(type, d))

const req: Api = onFnCall((name: string, args: any[] = []) => request(prefix.core(name), args))
const api: Api = onFnCall((name: string, args: any[]) => notify(prefix.core(name), args))

const { unblock } = NeovimUtils({ notify: api, request: req })

unblock().then(errors => {
  if (errors.length) {
    console.error(`vim error-reader had some errors starting up`)
    errors.forEach(e => console.error(e))
  }

  api.uiAttach(5, 2, vimOptions)
})

const severityOptions = new Map([
  [ '0', DiagnosticSeverity.Error ],
  [ 'e', DiagnosticSeverity.Error ],
  [ 'w', DiagnosticSeverity.Warning ],
  [ 'i', DiagnosticSeverity.Information ],
])

const qfTypeToSeverity = (type?: string | number): DiagnosticSeverity => {
  if (!type) return DiagnosticSeverity.Error
  return severityOptions.get((type + '').toLowerCase()) || DiagnosticSeverity.Error
}

const qfGroup = (fixes: QuickFixList[], source = '') => fixes.reduce((map, item: QuickFixList) => {
  if (!item.filename) return map

  const diagnostic: Diagnostic = {
    source,
    code: item.nr,
    message: item.text,
    severity: qfTypeToSeverity(item.type),
    range: {
      start: { line: item.lnum - 1, character: item.col - 1 },
      end: { line: item.lnum - 1, character: item.col - 1 },
    },
  }

  if (!map.has(item.filename)) return (map.set(item.filename, [ diagnostic ]), map)

  map.get(item.filename)!.push(diagnostic)
  return map
}, new Map<string, Diagnostic[]>())

const qfBufnames = (fixes: QuickFixList[]) => Promise.all(fixes.map(async m => ({
  ...m,
  filename: await req.callFunction('bufname', [ m.bufnr ]),
})))

// TODO: probably need some mechanism to queue requests and do them serially.
// don't want to override vim buffer while another req is processing
on.getErrors(async (file: string, format: string) => {
  api.command(`set errorformat=${format}`)
  api.command(`cgetfile ${file}`)
  const items = await req.callFunction('getqflist', []) as QuickFixList[]
  if (!is.array(items)) return []

  const validItems = items.filter(m => m.valid)
  const namedItems = await qfBufnames(validItems)
  return qfGroup(namedItems)
})
