# Bibliotecas copiadas para aqui (sem CDN)

| Ficheiro | Origem | Licença |
| --- | --- | --- |
| `page-flip.browser.js` | [StPageFlip](https://github.com/Nodlik/StPageFlip) `page-flip@2.0.7`, `dist/js/page-flip.browser.js` | MIT (`page-flip.LICENSE`) |

Alterações locais (procure por `touchOnCtl`, `flingDir` e `isUserMove||` no ficheiro):

1. `checkTarget` usa `closest("a,button,input,select,label,[data-noflip]")` em vez de olhar só para a etiqueta do alvo.
2. O toque começa sempre o gesto, mesmo em cima de um preço. Antes, um toque que começasse num botão era ignorado por inteiro, e no telemóvel os preços ocupam a borda direita da página, que é onde o dedo começa a virar. Um toque sem arrastar num botão nunca vira a folha; o botão recebe o clique normal e junta o prato ao pedido.
3. A dobra começa assim que o dedo anda mais de 10 px para o lado, sem esperar 250 ms.
4. A primeira dobra parte do ponto onde o dedo pousou. Antes partia do ponto já a meio do arrasto, e a folha podia virar para trás.
5. Ao largar: em retrato, a folha completa se passou do meio da página ou se o gesto foi rápido (flick); se não, volta. Antes era preciso arrastar até fora da borda esquerda do ecrã.
6. Um clique ou toque simples já não vira a página por dentro da biblioteca. `js/livro.js` trata os toques nas bordas da página, e o resto da página fica livre para ler e tocar nos preços.

7. Desempenho (v12): o ciclo `requestAnimationFrame` só corre enquanto a folha se move; os estilos CSS das páginas e das sombras só se escrevem se mudaram; a sombra exterior (e as sombras «hard») usam um degradê pré-definido e `opacity` (visualmente igual); `touchstart` é passivo quando `mobileScrollSupport` está ligado.
