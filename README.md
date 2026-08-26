# Cassinooo

Módulo de cassino compartilhado para **Foundry VTT 13.348**.

## Versão atual

`0.1.0`

Primeiro protótipo:

- mesa visual de Blackjack;
- 6 assentos;
- o GM escolhe qual jogador ocupa cada assento;
- todos os clientes veem a mesma configuração;
- botão **Blackjack** na parte inferior da aba **Diário**;
- sincronização por socket do módulo;
- sem sistema próprio de fichas (as apostas poderão usar o ouro do Actor futuramente).

## Instalação pelo Foundry

Em **Add-on Modules → Install Module**, use esta Manifest URL:

```text
https://raw.githubusercontent.com/baenreiiryn/cassinooo/main/module.json
```

O manifesto baixa o módulo diretamente do branch `main` do GitHub.

## Compatibilidade

- Foundry VTT mínimo: 13
- Verificado para: 13.348
- Máximo: 13

## Próximas etapas

- baralho e dealer;
- distribuição de cartas;
- Pedir / Parar;
- cálculo de Blackjack e estouro;
- rodada sincronizada para os seis jogadores;
- apostas usando a moeda/ouro do Actor.
