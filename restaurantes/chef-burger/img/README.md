# Fotografias do Chef Burger

Todas as imagens desta pasta são **referências provisórias** do [Unsplash](https://unsplash.com/license). Não são fotografias do restaurante.
Para pôr as fotos reais (Instagram @chefburgerao ou enviadas pela casa), grave um ficheiro **com o mesmo nome** por cima. Não é preciso mexer no HTML: o site corta com `object-fit: cover`.

Formato: WebP, qualidade 80–85. Onde há versão `-phone`, é o recorte vertical que o telemóvel carrega (`<picture>`). Troque as duas.

| Ficheiro | Tamanho | Onde aparece | O que é agora (ID Unsplash) |
| --- | --- | --- | --- |
| `hero.webp` | 2400×1200 | Primeiro ecrã, computador | Hambúrguer duplo, cheddar e cebola caramelizada. photo-1572802419224-296b0aeee0d9 |
| `hero-phone.webp` | 4:5 | Primeiro ecrã, telemóvel | Mesmo recorte vertical |
| `og.jpg` | 1200×630 | Pré-visualização ao partilhar o link | Recorte do hero. Trocar quando o hero mudar |
| `cap-hamburgueres.webp` / `-phone` | 1800×1012 / 820×1093 | «A casa», capítulo Hambúrgueres | photo-1564362411991-472954b39f56 |
| `cap-grelhados.webp` / `-phone` | idem | «A casa», capítulo Grelhados | photo-1603360946369-dc9bb6258143 |
| `cap-pizzas.webp` / `-phone` | idem | «A casa», capítulo Pizzas | photo-1769458313988-2cd932ab2777 |
| `cap-cay.webp` / `-phone` | idem | «A casa», capítulo Matabicho e çay | photo-1715017245420-9638115138a4 |
| `casa.webp` / `casa-phone.webp` | 2400×1200 / vertical | Foto larga depois da frase sobre a Turquia | Hambúrguer e batatas numa tábua. photo-1561758033-d89a9ad46330. **Ideal: foto da sala (balcão de ardósia, néon vermelho, almofadas kilim)** |
| `reservar.webp` | 1000×1250 | Ao lado do formulário de reserva | Mesa de grelhados para partilhar. photo-1555939594-58d7cb561ad1 |
| `cat-hamburgueres.webp` | quadrada | Ementa: Hambúrgueres | photo-1607013251379-e6eecfffe234 |
| `cat-pizzas.webp` | quadrada | Ementa: Pizzas | photo-1513104890138-7c749659a591 |
| `cat-grelhados.webp` | quadrada | Ementa: Grelhados turcos | photo-1532636875304-0c89119d9b4d |
| `cat-faita.webp` | quadrada | Ementa: Faita | photo-1633321702518-7feccafb94d5 (wrap genérico, não é a faita da casa) |
| `cat-esparguete.webp` | quadrada | Ementa: Esparguete | photo-1515516969-d4008cc6241a |
| `cat-meze.webp` | quadrada | Ementa: Meze turco | photo-1637949385162-e416fb15b2ce |
| `cat-matabicho.webp` | quadrada | Ementa: Matabicho | photo-1580069491658-8220b0e8722d |
| `cat-sobremesas.webp` | quadrada | Ementa: Sobremesas | photo-1524351199678-941a58a3df50 |
| `cat-bebidas-quentes.webp` | quadrada | Ementa: Cafés, chá e sumos naturais | photo-1623241237041-67ece20b63de |
| `cat-bebidas-frias.webp` | quadrada | Ementa: Bebidas frias | photo-1594488506255-a8bbfdeedbaf |

O primeiro ecrã e as páginas de hambúrgueres, pizzas e grelhados usam vídeo: ver [../video/README.md](../video/README.md). O `hero.webp` antigo fica para o `og.jpg` e pode voltar ao primeiro ecrã se se tirar o vídeo.

O texto alternativo de cada foto está em `fonte/partes/` (capítulos, casa, reservar) e em `fonte/menu.json` (campo `alt` de cada categoria). Ao trocar uma foto, atualize o `alt` e corra `node fonte/gerar.mjs`.

Não há logótipo em imagem: a marca «Chef BURGER» no cabeçalho é texto com a fonte Archivo. Se a casa enviar o logótipo (caveira de touro vermelha), pode entrar como `logo.svg` no cabeçalho.
