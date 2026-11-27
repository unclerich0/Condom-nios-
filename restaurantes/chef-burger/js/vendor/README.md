# Bibliotecas copiadas para aqui (sem CDN)

| Ficheiro | Origem | Licença |
| --- | --- | --- |
| `page-flip.browser.js` | [StPageFlip](https://github.com/Nodlik/StPageFlip) `page-flip@2.0.7`, `dist/js/page-flip.browser.js` | MIT (`page-flip.LICENSE`) |

Alteração local, uma linha: `checkTarget` passou a usar `closest("a,button,input,select,label,[data-noflip]")` em vez de olhar só para a etiqueta do alvo. Assim, tocar no preço de um prato (um `<button>` com `<span>` dentro) junta-o ao pedido em vez de começar a virar a página.
