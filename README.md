# Cassinooo

Módulo de cassino compartilhado para **Foundry VTT 13.348**.

## Versão atual

`0.2.0`

### Blackjack

- botão **Mesa do Cassino** na parte inferior da aba **Diário**;
- mesa visual compartilhada em tempo real;
- Dealer/Mestre no centro superior;
- 6 assentos ao redor da mesa: 2 laterais, 2 diagonais e 2 inferiores;
- o Mestre escolhe qual jogador ocupa cada assento;
- distribuição de 2 cartas para cada jogador e para o Dealer;
- segunda carta do Dealer permanece oculta durante a vez dos jogadores;
- cada jogador controla apenas a própria mão com **Pedir** e **Parar**;
- Ás vale 1 ou 11;
- J, Q e K valem 10;
- Blackjack natural é 21 com duas cartas;
- Dealer compra até 16 e para em qualquer 17;
- cálculo automático de vitória, derrota, empate e estouro;
- estado e ações sincronizados entre os clientes;
- sem sistema próprio de fichas: apostas poderão usar o ouro do Actor futuramente.

Ainda não implementados: dividir, dobrar, seguro e apostas.

## Instalação / atualização pelo Foundry

Em **Add-on Modules → Install Module**, use esta Manifest URL:

```text
https://raw.githubusercontent.com/baenreiiryn/cassinooo/main/module.json
```

Quem já instalou uma versão anterior pode usar a atualização de módulos do Foundry; o manifesto agora informa a versão `0.2.0`.

## Compatibilidade

- Foundry VTT mínimo: 13
- Verificado para: 13.348
- Máximo: 13
