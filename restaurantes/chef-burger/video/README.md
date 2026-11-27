# Vídeos (provisórios)

Clipes de referência do [Pexels](https://www.pexels.com/license/) (uso comercial gratuito, sem atribuição obrigatória). Não são vídeos do restaurante. Para trocar, grave um ficheiro **com o mesmo nome** (MP4 H.264, sem som, 6–8 s em ciclo) e a imagem `.webp` do primeiro fotograma.

| Ficheiro | Formato | Onde aparece | Origem |
| --- | --- | --- | --- |
| `hero.mp4` / `hero.webp` | 1600×800, 7,2 s, ~2,4 MB | Primeiro ecrã, computador | [Juicy burgers grilling over open flame](https://www.pexels.com/video/juicy-burgers-grilling-over-open-flame-39073904/) |
| `hero-phone.mp4` / `hero-phone.webp` | 576×720 | Primeiro ecrã, telemóvel | O mesmo clipe, recorte vertical |
| `hamburgueres.mp4` / `-phone` | 960×540 / 576×720 | Topo da página Hambúrgueres | [Cheeseburgers on the grill](https://www.pexels.com/video/cheeseburgers-on-the-grill-6756617/) |
| `grelhados.mp4` / `-phone` | idem | Topo da página Grelhados turcos | [Sizzling grilled chicken skewers over coals](https://www.pexels.com/video/sizzling-grilled-chicken-skewers-over-coals-35594346/) |
| `pizzas.mp4` / `-phone` | idem | Topo da página Pizzas | [Rustic wood-fired oven baking flames](https://www.pexels.com/video/rustic-wood-fired-oven-baking-flames-34722001/) |

Como o site os usa: a imagem `.webp` aparece logo; o vídeo (`preload="none"`) só descarrega e toca quando está à vista, pausa fora do ecrã e quando o separador fica escondido. Com movimento reduzido, Poupança de dados ou ligação 2G não há vídeo, fica a imagem.

Os ciclos foram feitos com ffmpeg: recorte, 30 fps, e um cruzamento de 0,8 s entre o fim e o início para o ciclo não saltar.

Nota: os clipes do Mixkit com «Restricted License» não servem para um site comercial, por isso não foram usados.
